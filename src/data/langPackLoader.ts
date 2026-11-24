import type {
  LangGrammarItem,
  LangListeningTrack,
  LangReadingPassage,
  LangVocabItem,
  StudioPromptItem,
} from '../types/language';

export interface LangPackManifest {
  version: number;
  lang: string;
  module: string;
  totalCount: number;
  packs: string[];
}

interface LangPackFile<TItem> {
  pack: string;
  items: TItem[];
}

function getNormalizedBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export interface GenericLangPackLoader<TItem> {
  loadManifest: () => Promise<LangPackManifest>;
  loadAll: () => Promise<TItem[]>;
}

/**
 * Manifest-driven lazy JSON loader for any language & study module:
 * `public/data/<lang>/<module>/manifest.json` -> `pack1.json`, `pack2.json`, ...
 * Allows expanding question banks or adding new languages purely via JSON packs.
 */
export function createLangPackLoader<TItem extends { id: string; order?: number }>(
  dir: string,
  label: string
): GenericLangPackLoader<TItem> {
  let manifestCache: LangPackManifest | null = null;
  let manifestPromise: Promise<LangPackManifest> | null = null;
  let itemsCache: TItem[] | null = null;
  let itemsPromise: Promise<TItem[]> | null = null;

  const loadManifest = async (): Promise<LangPackManifest> => {
    if (manifestCache) return manifestCache;
    if (!manifestPromise) {
      const url = `${getNormalizedBaseUrl()}data/${dir}/manifest.json`;
      manifestPromise = fetch(url)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Gagal memuat indeks ${label} (HTTP ${res.status})`);
          }
          return res.json() as Promise<LangPackManifest>;
        })
        .then((data) => {
          manifestCache = data;
          return data;
        })
        .catch((err) => {
          manifestPromise = null;
          throw err;
        });
    }
    return manifestPromise;
  };

  const loadAll = async (): Promise<TItem[]> => {
    if (itemsCache) return itemsCache;
    if (!itemsPromise) {
      itemsPromise = loadManifest()
        .then(async (manifest) => {
          const base = `${getNormalizedBaseUrl()}data/${dir}/`;
          const chunks = await Promise.all(
            (manifest.packs ?? []).map(async (packFile) => {
              const res = await fetch(`${base}${packFile}`);
              if (!res.ok) {
                throw new Error(`Gagal memuat paket ${label} (${packFile}, HTTP ${res.status})`);
              }
              const parsed = (await res.json()) as LangPackFile<TItem>;
              return Array.isArray(parsed.items) ? parsed.items : [];
            })
          );
          const seen = new Set<string>();
          const merged: TItem[] = [];
          for (const chunk of chunks) {
            for (const item of chunk) {
              if (!item || seen.has(item.id)) continue;
              seen.add(item.id);
              merged.push(item);
            }
          }
          merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          itemsCache = merged;
          return merged;
        })
        .catch((err) => {
          itemsPromise = null;
          throw err;
        });
    }
    return itemsPromise;
  };

  return { loadManifest, loadAll };
}

// English loaders (TOEFL ITP, TOEFL iBT, IELTS, TOEIC)
export const enVocabLoader = createLangPackLoader<LangVocabItem>('en/vocab', 'Kosakata Inggris');
export const enGrammarLoader = createLangPackLoader<LangGrammarItem>('en/grammar', 'Grammar Inggris');
export const enReadingLoader = createLangPackLoader<LangReadingPassage>('en/reading', 'Reading Inggris');
export const enListeningLoader = createLangPackLoader<LangListeningTrack>('en/listening', 'Listening Inggris');
export const enStudioLoader = createLangPackLoader<StudioPromptItem>('en/studio', 'Writing & Speaking Studio');

// Arabic loaders (TOAFL)
export const arVocabLoader = createLangPackLoader<LangVocabItem>('ar/vocab', 'Mufradat Arab');
export const arGrammarLoader = createLangPackLoader<LangGrammarItem>('ar/grammar', 'Qawaid Arab');
export const arReadingLoader = createLangPackLoader<LangReadingPassage>('ar/reading', 'Qiraah Arab');
export const arListeningLoader = createLangPackLoader<LangListeningTrack>('ar/listening', 'Istima Arab');

export function getLangVocabLoader(lang: 'en' | 'ar') {
  return lang === 'en' ? enVocabLoader : arVocabLoader;
}

export function getLangGrammarLoader(lang: 'en' | 'ar') {
  return lang === 'en' ? enGrammarLoader : arGrammarLoader;
}

export function getLangReadingLoader(lang: 'en' | 'ar') {
  return lang === 'en' ? enReadingLoader : arReadingLoader;
}

export function getLangListeningLoader(lang: 'en' | 'ar') {
  return lang === 'en' ? enListeningLoader : arListeningLoader;
}
