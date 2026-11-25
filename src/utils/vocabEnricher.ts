import { useEffect, useState } from 'react';
import type { CurriculumItem } from '../types/curriculum';
import { buildIndonesianAcceptedMeanings } from './idTranslator';

export interface VocabEnrichmentSentence {
  jp: string;
  reading: string;
  id: string;
}

export interface VocabEnrichmentRecord {
  meaningId: string;
  synonymsId: string[];
  sentences: VocabEnrichmentSentence[];
}

const LOCAL_CACHE_KEY = 'leksika_vocab_enrichment_v1';

const enrichmentCache = new Map<string, VocabEnrichmentRecord>();
const inFlightIds = new Set<string>();
const retryAfterMap = new Map<string, number>();
const listeners = new Set<() => void>();
let enrichmentVersion = 0;

function loadLocalEnrichmentCache() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, VocabEnrichmentRecord>;
    if (parsed && typeof parsed === 'object') {
      for (const [id, rec] of Object.entries(parsed)) {
        if (
          rec &&
          typeof rec.meaningId === 'string' &&
          rec.meaningId.trim() &&
          Array.isArray(rec.sentences) &&
          rec.sentences.length > 0
        ) {
          enrichmentCache.set(id, rec);
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
}

let saveTimer: number | null = null;
function scheduleSaveLocalEnrichmentCache() {
  if (typeof window === 'undefined') return;
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    try {
      const entries = Array.from(enrichmentCache.entries());
      const sliced = entries.length > 2500 ? entries.slice(-2500) : entries;
      const obj: Record<string, VocabEnrichmentRecord> = {};
      for (const [k, v] of sliced) {
        obj[k] = v;
      }
      window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore quota errors
    }
  }, 600);
}

loadLocalEnrichmentCache();

function notifyListeners() {
  enrichmentVersion += 1;
  for (const fn of listeners) {
    fn();
  }
}

/**
 * Seed static pre-verified vocabulary meanings & example sentences (e.g. from /data/ja-vocab-enrichment.json)
 */
export function seedStaticVocabEnrichment(map: Record<string, VocabEnrichmentRecord>) {
  if (!map || typeof map !== 'object') return;
  let updated = false;
  for (const [id, rec] of Object.entries(map)) {
    if (
      rec &&
      typeof rec.meaningId === 'string' &&
      rec.meaningId.trim() &&
      Array.isArray(rec.sentences) &&
      rec.sentences.length > 0
    ) {
      if (!enrichmentCache.has(id)) {
        enrichmentCache.set(id, rec);
        updated = true;
      }
    }
  }
  if (updated) {
    notifyListeners();
  }
}

export function getVocabEnrichment(id: string): VocabEnrichmentRecord | undefined {
  return enrichmentCache.get(id);
}

export function hasVocabEnrichment(id: string): boolean {
  return enrichmentCache.has(id);
}

export function isVocabEnrichmentPending(id: string): boolean {
  return inFlightIds.has(id);
}

/**
 * Terapkan arti Bahasa Indonesia terverifikasi & contoh kalimat kontekstual ke objek CurriculumItem.
 */
export function applyVocabEnrichmentToItem(item: CurriculumItem): boolean {
  if (item.type !== 'vocabulary') return false;
  const rec = enrichmentCache.get(item.id);
  if (!rec) return false;

  const oldPrimary = item.primaryMeaning;
  if (rec.meaningId && rec.meaningId !== item.primaryMeaning) {
    item.primaryMeaning = rec.meaningId;
    if (item.meaningMnemonic && oldPrimary && item.meaningMnemonic.includes(`"${oldPrimary}"`)) {
      item.meaningMnemonic = item.meaningMnemonic.replaceAll(`"${oldPrimary}"`, `"${rec.meaningId}"`);
    }
    if (item.readingMnemonic && oldPrimary && item.readingMnemonic.includes(`"${oldPrimary}"`)) {
      item.readingMnemonic = item.readingMnemonic.replaceAll(`"${oldPrimary}"`, `"${rec.meaningId}"`);
    }
  }

  // Merge verified Indonesian synonyms while retaining existing accepted meanings as quiz fallback
  const mergedAccepted = buildIndonesianAcceptedMeanings(
    rec.meaningId,
    [...(rec.synonymsId ?? []), ...item.acceptedMeanings],
    rec.meaningId
  );
  item.acceptedMeanings = mergedAccepted;

  if (rec.sentences.length > 0) {
    item.contextSentences = rec.sentences.map((s) => ({
      jp: s.jp,
      reading: s.reading,
      en: s.id,
    }));
  }

  return true;
}

/**
 * Ambil daftar sinonim Bahasa Indonesia bersih untuk ditampilkan di UI belajar.
 */
export function getDisplayIndonesianSynonyms(item: CurriculumItem): string[] {
  const rec = enrichmentCache.get(item.id);
  if (rec && rec.synonymsId.length > 0) {
    return rec.synonymsId.filter(
      (s) => s.toLowerCase() !== item.primaryMeaning.toLowerCase()
    );
  }
  return [];
}

// Batch queue for on-demand enrichment of uncached vocabulary items
interface EnrichmentQueueEntry {
  id: string;
  characters: string;
  reading: string;
  partOfSpeech: string;
  rawMeaning: string;
}

const pendingQueue: EnrichmentQueueEntry[] = [];
let flushTimer: number | null = null;
let activeRequests = 0;
const MAX_CONCURRENT = 1;
const RETRY_COOLDOWN_MS = 15000;

function isCoolingDown(id: string): boolean {
  const until = retryAfterMap.get(id);
  if (!until) return false;
  if (Date.now() >= until) {
    retryAfterMap.delete(id);
    return false;
  }
  return true;
}

async function processEnrichmentQueue() {
  if (activeRequests >= MAX_CONCURRENT || pendingQueue.length === 0) return;

  const batch: EnrichmentQueueEntry[] = [];
  const seen = new Set<string>();
  while (pendingQueue.length > 0 && batch.length < 12) {
    const next = pendingQueue.shift()!;
    if (
      !next.id ||
      enrichmentCache.has(next.id) ||
      inFlightIds.has(next.id) ||
      isCoolingDown(next.id) ||
      seen.has(next.id)
    ) {
      continue;
    }
    seen.add(next.id);
    inFlightIds.add(next.id);
    batch.push(next);
  }

  if (batch.length === 0) return;

  activeRequests += 1;
  notifyListeners();
  try {
    const res = await fetch('/api/ai/enrich-vocab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: batch }),
    });
    if (!res.ok) {
      const retryAt = Date.now() + RETRY_COOLDOWN_MS;
      for (const b of batch) retryAfterMap.set(b.id, retryAt);
      return;
    }
    const data = (await res.json()) as {
      enriched?: Record<string, VocabEnrichmentRecord>;
    };
    const map = data.enriched ?? {};
    let updated = false;
    const retryAt = Date.now() + RETRY_COOLDOWN_MS;
    for (const b of batch) {
      const rec = map[b.id];
      if (rec && rec.meaningId && Array.isArray(rec.sentences) && rec.sentences.length > 0) {
        enrichmentCache.set(b.id, rec);
        retryAfterMap.delete(b.id);
        updated = true;
      } else {
        retryAfterMap.set(b.id, retryAt);
      }
    }
    if (updated) {
      scheduleSaveLocalEnrichmentCache();
    }
  } catch {
    const retryAt = Date.now() + RETRY_COOLDOWN_MS;
    for (const b of batch) retryAfterMap.set(b.id, retryAt);
  } finally {
    for (const b of batch) inFlightIds.delete(b.id);
    activeRequests -= 1;
    notifyListeners();
    if (pendingQueue.length > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        void processEnrichmentQueue();
      }, 450);
    }
  }
}

export function queueVocabEnrichment(items: (CurriculumItem | null | undefined)[]) {
  let added = false;
  for (const item of items) {
    if (!item || item.type !== 'vocabulary') continue;
    if (enrichmentCache.has(item.id) || inFlightIds.has(item.id) || isCoolingDown(item.id)) {
      continue;
    }
    pendingQueue.push({
      id: item.id,
      characters: item.characters,
      reading: item.readings?.[0] ?? '',
      partOfSpeech: item.partOfSpeech ?? '',
      rawMeaning: item.primaryMeaning,
    });
    added = true;
  }

  if (added && flushTimer === null && typeof window !== 'undefined') {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void processEnrichmentQueue();
    }, 60);
  }
}

export function useVocabEnrichmentVersion(): number {
  const [ver, setVer] = useState(enrichmentVersion);
  useEffect(() => {
    const cb = () => setVer(enrichmentVersion);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return ver;
}

/**
 * Hook React untuk memastikan setiap kosakata yang sedang dipelajari/dilihat
 * memiliki arti Bahasa Indonesia akurat + 2 contoh kalimat alami yang sesuai dengan artinya.
 */
export function useVocabEnrichment(items: (CurriculumItem | null | undefined)[]): {
  version: number;
  isEnrichingAny: boolean;
} {
  const version = useVocabEnrichmentVersion();

  const vocabItems = items.filter(
    (it): it is CurriculumItem => Boolean(it && it.type === 'vocabulary')
  );

  const signature = vocabItems
    .slice(0, 40)
    .map((it) => it.id)
    .join('|');

  useEffect(() => {
    if (!signature) return;
    queueVocabEnrichment(vocabItems.slice(0, 40));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  let isEnrichingAny = false;
  for (const it of vocabItems) {
    applyVocabEnrichmentToItem(it);
    if (inFlightIds.has(it.id)) {
      isEnrichingAny = true;
    }
  }

  return { version, isEnrichingAny };
}
