import { JlptLevel } from '../types/grammar';
import {
  KanaVocabCategory,
  KanaVocabDataset,
  KanaVocabItem,
} from '../types/kanaVocab';
import { createJlptPackLoader, type JlptPackManifest } from './packLoader';

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

export type { JlptPackManifest as KanaVocabManifest };

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

const kanaVocabLoader = createJlptPackLoader<KanaVocabItem, KanaVocabDataset>({
  dir: 'kana-vocab',
  label: 'Kosakata Kana JLPT',
  buildDataset: buildKanaVocabDataset,
});

export const loadKanaVocabManifest = kanaVocabLoader.loadManifest;
export const loadKanaVocabLevel = kanaVocabLoader.loadLevel;
export const loadKanaVocabLevels = kanaVocabLoader.loadLevels;
export const loadKanaVocabDataset = kanaVocabLoader.loadAll;
