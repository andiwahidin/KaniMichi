import { JlptLevel } from '../types/grammar';
import {
  KanaVocabCategory,
  KanaVocabDataset,
  KanaVocabItem,
} from '../types/kanaVocab';

export const KANA_VOCAB_CATEGORIES: {
  id: KanaVocabCategory;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
}[] = [
  {
    id: 'adverb',
    label: 'Adverbia & Ekspresi Kana',
    shortLabel: 'Adverbia',
    description: 'Kata keterangan hiragana berfrekuensi tinggi yang wajib di JLPT',
    accent: '#0284C7',
  },
  {
    id: 'connector',
    label: 'Kata Penghubung (Conjunction)',
    shortLabel: 'Penghubung',
    description: 'Penanda alur logika, sebab-akibat, dan kontras dalam bacaan JLPT',
    accent: '#0D9488',
  },
  {
    id: 'onomatopoeia',
    label: 'Onomatope (Giongo / Gitaigo)',
    shortLabel: 'Onomatope',
    description: 'Kata tiruan bunyi dan keadaan yang sering menjebak di ujian N3–N1',
    accent: '#D97706',
  },
  {
    id: 'katakana',
    label: 'Katakana & Wasei-Eigo',
    shortLabel: 'Katakana',
    description: 'Serapan modern & kata bermakna khusus (false friends) di Jepang',
    accent: '#DB2777',
  },
];

let cachedKanaVocab: KanaVocabDataset | null = null;
let loadingKanaVocabPromise: Promise<KanaVocabDataset> | null = null;

function buildKanaVocabDataset(items: KanaVocabItem[]): KanaVocabDataset {
  const byId: Record<string, KanaVocabItem> = {};
  const byJlpt: Record<JlptLevel, KanaVocabItem[]> = {
    5: [],
    4: [],
    3: [],
    2: [],
    1: [],
  };

  for (const item of items) {
    byId[item.id] = item;
    byJlpt[item.jlpt].push(item);
  }

  for (const lvl of [5, 4, 3, 2, 1] as JlptLevel[]) {
    byJlpt[lvl].sort((a, b) => a.order - b.order);
  }

  return { items, byId, byJlpt };
}

export async function loadKanaVocabDataset(): Promise<KanaVocabDataset> {
  if (cachedKanaVocab) return cachedKanaVocab;
  if (!loadingKanaVocabPromise) {
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    loadingKanaVocabPromise = fetch(`${base}data/kana-vocab-jlpt.json`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Gagal memuat kosakata Non-Kanji (${res.status})`);
        }
        return res.json() as Promise<{ version: number; items: KanaVocabItem[] }>;
      })
      .then((raw) => {
        cachedKanaVocab = buildKanaVocabDataset(raw.items);
        return cachedKanaVocab;
      })
      .catch((err) => {
        loadingKanaVocabPromise = null;
        throw err;
      });
  }
  return loadingKanaVocabPromise;
}
