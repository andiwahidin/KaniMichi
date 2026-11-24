import { getLevelMeta, type CurriculumDataset } from '../data/curriculum';
import { loadGrammarLevel } from '../data/grammar';
import { loadKanaVocabLevel } from '../data/kanaVocab';
import { loadListeningLevel } from '../data/listening';
import { loadReadingLevel, stripFuriganaMarkup } from '../data/reading';
import {
  MINIMAL_PAIRS,
  PITCH_PATTERN_EXAMPLES,
  SOUND_RULE_GUIDES,
} from '../data/pronunciation';
import type { JlptLevel } from '../types/grammar';
import {
  arGrammarLoader,
  arListeningLoader,
  arReadingLoader,
  arVocabLoader,
  enGrammarLoader,
  enListeningLoader,
  enReadingLoader,
  enStudioLoader,
  enVocabLoader,
} from '../data/langPackLoader';
import { getItemSpeechText } from './audio';

export type OfflineAudioPackCategory = 'starter' | 'jlpt' | 'srs' | 'pronunciation';

export interface OfflineAudioPackDef {
  id: string;
  category: OfflineAudioPackCategory;
  title: string;
  subtitle: string;
  badge: string;
  estimatedAvgBytesPerClip: number;
  recommended?: boolean;
  /** Resolve the exact deduplicated Japanese speech phrases for this pack */
  resolveTexts: (dataset: CurriculumDataset) => Promise<string[]>;
}

const STARTER_SAMPLE_PHRASES = [
  'こんにちは',
  'おはようございます',
  'こんばんは',
  'ありがとうございます',
  'すみません',
  'よろしくお願いします',
];

function cleanSpeechText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = stripFuriganaMarkup(raw).trim();
  return cleaned.length > 0 ? cleaned : null;
}

function addUnique(set: Set<string>, raw: string | null | undefined): void {
  const cleaned = cleanSpeechText(raw);
  if (cleaned) set.add(cleaned);
}

function collectCurriculumLevelRangeTexts(
  dataset: CurriculumDataset,
  startLevel: number,
  endLevel: number,
  includeContextSentences = false
): string[] {
  const texts = new Set<string>();
  for (let lvl = startLevel; lvl <= endLevel; lvl += 1) {
    const items = dataset.byLevel[lvl] ?? [];
    for (const item of items) {
      const primary = getItemSpeechText(item);
      if (primary) texts.add(primary);
      if (includeContextSentences && item.contextSentences) {
        for (const sent of item.contextSentences) {
          addUnique(texts, sent.reading || sent.jp);
        }
      }
    }
  }
  return Array.from(texts);
}

async function collectJlptAudioTexts(level: JlptLevel): Promise<string[]> {
  const [kanaItems, grammarItems, listeningTracks] = await Promise.all([
    loadKanaVocabLevel(level),
    loadGrammarLevel(level),
    loadListeningLevel(level),
  ]);

  const texts = new Set<string>();

  for (const item of kanaItems) {
    addUnique(texts, item.word);
    if (item.example?.jp) addUnique(texts, item.example.jp);
  }

  for (const pt of grammarItems) {
    for (const ex of pt.examples ?? []) {
      addUnique(texts, ex.jp);
    }
    if (pt.quiz) {
      addUnique(
        texts,
        `${pt.quiz.sentenceBefore}${pt.quiz.answer}${pt.quiz.sentenceAfter}`
      );
    }
  }

  for (const track of listeningTracks) {
    addUnique(texts, track.introJp);
    for (const line of track.lines ?? []) {
      addUnique(texts, line.jp);
    }
    addUnique(texts, track.questionJp);
    if (track.taskType === 'sokuji') {
      for (const ch of track.choices ?? []) {
        addUnique(texts, ch);
      }
    }
  }

  return Array.from(texts);
}

function collectPronunciationTexts(): string[] {
  const texts = new Set<string>();
  for (const p of STARTER_SAMPLE_PHRASES) {
    addUnique(texts, p);
  }
  for (const ex of PITCH_PATTERN_EXAMPLES) {
    addUnique(texts, ex.kana);
    addUnique(texts, `${ex.kanji}${ex.particle || 'が'}`);
    addUnique(texts, ex.exampleJp);
  }
  for (const rule of SOUND_RULE_GUIDES) {
    for (const ex of rule.examples) {
      addUnique(texts, ex.kana || ex.kanji);
    }
  }
  for (const pair of MINIMAL_PAIRS) {
    for (const w of pair.words) {
      addUnique(texts, w.kana);
      addUnique(texts, w.kanji);
      addUnique(texts, `${w.kanji}${w.particle ?? 'が'}`);
      addUnique(texts, w.exampleJp);
    }
  }
  return Array.from(texts);
}

export function buildCurrentLevelAudioPack(currentLevel: number): OfflineAudioPackDef {
  const meta = getLevelMeta(currentLevel);
  return {
    id: `current-level-${currentLevel}`,
    category: 'starter',
    title: `Audio Bab Aktif (${meta.jlpt} Bab ${meta.unitInTier})`,
    subtitle: 'Semua kanji, kosakata, dan kalimat contoh di bab aktifmu saat ini',
    badge: `${meta.jlpt} B.${meta.unitInTier}`,
    estimatedAvgBytesPerClip: 10500,
    recommended: true,
    resolveTexts: async (dataset) => {
      const list = collectCurriculumLevelRangeTexts(dataset, currentLevel, currentLevel, true);
      for (const phrase of STARTER_SAMPLE_PHRASES) {
        if (!list.includes(phrase)) list.unshift(phrase);
      }
      return list;
    },
  };
}

export const OFFLINE_AUDIO_PACKS: OfflineAudioPackDef[] = [
  {
    id: 'starter-lv1-5',
    category: 'starter',
    title: 'Paket Pemula (JLPT N5 Awal + Salam Dasar)',
    subtitle: 'Kanji & kosakata JLPT N5 Bab 1–5 beserta salam dasar untuk mulai belajar offline',
    badge: 'N5 Awal',
    estimatedAvgBytesPerClip: 10500,
    recommended: true,
    resolveTexts: async (dataset) => {
      const set = new Set<string>(STARTER_SAMPLE_PHRASES);
      for (const t of collectCurriculumLevelRangeTexts(dataset, 1, 5, true)) {
        set.add(t);
      }
      return Array.from(set);
    },
  },
  {
    id: 'pronunciation',
    category: 'pronunciation',
    title: 'Pelafalan & Pitch Accent',
    subtitle: 'Pola nada Heiban–Odaka, pasangan minimal, & panduan bunyi bahasa Jepang',
    badge: 'Pitch',
    estimatedAvgBytesPerClip: 11500,
    resolveTexts: async () => collectPronunciationTexts(),
  },
  {
    id: 'jlpt-n5',
    category: 'jlpt',
    title: 'Paket Audio JLPT N5 Lengkap',
    subtitle: 'Semua dialog Chōkai Listening, Kosakata Kana, & contoh kalimat Grammar N5',
    badge: 'N5',
    estimatedAvgBytesPerClip: 16500,
    recommended: true,
    resolveTexts: () => collectJlptAudioTexts(5),
  },
  {
    id: 'jlpt-n4',
    category: 'jlpt',
    title: 'Paket Audio JLPT N4 Lengkap',
    subtitle: 'Semua dialog Chōkai Listening, Kosakata Kana, & contoh kalimat Grammar N4',
    badge: 'N4',
    estimatedAvgBytesPerClip: 17500,
    resolveTexts: () => collectJlptAudioTexts(4),
  },
  {
    id: 'jlpt-n3',
    category: 'jlpt',
    title: 'Paket Audio JLPT N3 Lengkap',
    subtitle: 'Semua dialog Chōkai Listening, Kosakata Kana, & contoh kalimat Grammar N3',
    badge: 'N3',
    estimatedAvgBytesPerClip: 18500,
    resolveTexts: () => collectJlptAudioTexts(3),
  },
  {
    id: 'jlpt-n2',
    category: 'jlpt',
    title: 'Paket Audio JLPT N2 Lengkap',
    subtitle: 'Semua dialog Chōkai Listening, Kosakata Kana, & contoh kalimat Grammar N2',
    badge: 'N2',
    estimatedAvgBytesPerClip: 19500,
    resolveTexts: () => collectJlptAudioTexts(2),
  },
  {
    id: 'jlpt-n1',
    category: 'jlpt',
    title: 'Paket Audio JLPT N1 Lengkap',
    subtitle: 'Semua dialog Chōkai Listening, Kosakata Kana, & contoh kalimat Grammar N1',
    badge: 'N1',
    estimatedAvgBytesPerClip: 21000,
    resolveTexts: () => collectJlptAudioTexts(1),
  },
  {
    id: 'srs-lv1-10',
    category: 'srs',
    title: 'Kanji & Kosakata JLPT N5 (Bab 1–10)',
    subtitle: 'Seluruh bacaan kanji & kosakata SRS tingkat JLPT N5 Dasar',
    badge: 'SRS N5',
    estimatedAvgBytesPerClip: 10000,
    resolveTexts: async (dataset) => collectCurriculumLevelRangeTexts(dataset, 1, 10, false),
  },
  {
    id: 'srs-lv11-20',
    category: 'srs',
    title: 'Kanji & Kosakata JLPT N4 (Bab 1–10)',
    subtitle: 'Seluruh bacaan kanji & kosakata SRS tingkat JLPT N4 Dasar Lanjut',
    badge: 'SRS N4',
    estimatedAvgBytesPerClip: 10000,
    resolveTexts: async (dataset) => collectCurriculumLevelRangeTexts(dataset, 11, 20, false),
  },
  {
    id: 'srs-lv21-35',
    category: 'srs',
    title: 'Kanji & Kosakata JLPT N3 (Bab 1–15)',
    subtitle: 'Seluruh bacaan kanji & kosakata SRS tingkat JLPT N3 Menengah',
    badge: 'SRS N3',
    estimatedAvgBytesPerClip: 10000,
    resolveTexts: async (dataset) => collectCurriculumLevelRangeTexts(dataset, 21, 35, false),
  },
  {
    id: 'srs-lv36-50',
    category: 'srs',
    title: 'Kanji & Kosakata JLPT N2 (Bab 1–15)',
    subtitle: 'Seluruh bacaan kanji & kosakata SRS tingkat JLPT N2 Menengah Atas',
    badge: 'SRS N2',
    estimatedAvgBytesPerClip: 10000,
    resolveTexts: async (dataset) => collectCurriculumLevelRangeTexts(dataset, 36, 50, false),
  },
  {
    id: 'srs-lv51-60',
    category: 'srs',
    title: 'Kanji & Kosakata JLPT N1 (Bab 1–10)',
    subtitle: 'Seluruh bacaan kanji & kosakata SRS tingkat JLPT N1 Mahir',
    badge: 'SRS N1',
    estimatedAvgBytesPerClip: 10000,
    resolveTexts: async (dataset) => collectCurriculumLevelRangeTexts(dataset, 51, 60, false),
  },
];

export interface OfflineResourcesVerifyProgress {
  completed: number;
  total: number;
  label: string;
}

export interface OfflineResourcesVerifyResult {
  totalModules: number;
  verifiedModules: number;
  cachedBytesApprox: number;
}

function getNormalizedBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Preload and cache all study JSON datasets across Japanese (JLPT),
 * English (TOEFL/IELTS/TOEIC), and Arabic (TOAFL) so every module works offline.
 */
export async function downloadAndVerifyAllOfflineResources(
  onProgress?: (p: OfflineResourcesVerifyProgress) => void
): Promise<OfflineResourcesVerifyResult> {
  const levels: JlptLevel[] = [5, 4, 3, 2, 1];
  const tasks: { label: string; run: () => Promise<unknown> }[] = [
    {
      label: 'Kurikulum Kanji & Kosakata Jepang (Lv 1–60)',
      run: () => fetch(`${getNormalizedBaseUrl()}data/curriculum-60.json`).then((r) => r.text()),
    },
    {
      label: 'Data Urutan Goresan Menulis (Kakitori)',
      run: () =>
        fetch(`${getNormalizedBaseUrl()}data/writing-strokes-core.json`).then((r) => r.text()),
    },
    { label: 'Inggris · Kosakata SRS (AWL & TOEIC)', run: () => enVocabLoader.loadAll() },
    { label: 'Inggris · Grammar & Structure', run: () => enGrammarLoader.loadAll() },
    { label: 'Inggris · Reading Academic & Business', run: () => enReadingLoader.loadAll() },
    { label: 'Inggris · Listening TOEFL/IELTS/TOEIC', run: () => enListeningLoader.loadAll() },
    { label: 'Inggris · Writing & Speaking Studio', run: () => enStudioLoader.loadAll() },
    { label: 'Arab · Mufradat Fusha SRS', run: () => arVocabLoader.loadAll() },
    { label: 'Arab · Qawaid (Nahwu & Shorof)', run: () => arGrammarLoader.loadAll() },
    { label: 'Arab · Qira\'ah TOAFL', run: () => arReadingLoader.loadAll() },
    { label: 'Arab · Istima\' TOAFL', run: () => arListeningLoader.loadAll() },
  ];

  for (const lvl of levels) {
    tasks.push(
      { label: `Jepang · Grammar JLPT N${lvl}`, run: () => loadGrammarLevel(lvl) },
      { label: `Jepang · Kosakata Kana N${lvl}`, run: () => loadKanaVocabLevel(lvl) },
      { label: `Jepang · Membaca Dokkai N${lvl}`, run: () => loadReadingLevel(lvl) },
      { label: `Jepang · Mendengarkan Chōkai N${lvl}`, run: () => loadListeningLevel(lvl) }
    );
  }

  let verified = 0;
  let bytesApprox = 0;

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    onProgress?.({ completed: i, total: tasks.length, label: task.label });
    try {
      const data = await task.run();
      verified += 1;
      if (typeof data === 'string') {
        bytesApprox += data.length;
      } else {
        bytesApprox += JSON.stringify(data).length;
      }
    } catch {
      // Continue verifying remaining modules
    }
  }

  onProgress?.({
    completed: tasks.length,
    total: tasks.length,
    label: 'Semua materi terverifikasi offline',
  });

  return {
    totalModules: tasks.length,
    verifiedModules: verified,
    cachedBytesApprox: bytesApprox,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
