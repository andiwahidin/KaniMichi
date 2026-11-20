import { JlptLevel } from '../types/grammar';
import {
  ReadingDataset,
  ReadingPassage,
  ReadingPassageType,
} from '../types/reading';
import { createJlptPackLoader, type JlptPackManifest } from './packLoader';

export const READING_PASSAGE_TYPES: {
  id: ReadingPassageType;
  label: string;
  shortLabel: string;
  accent: string;
}[] = [
  { id: 'notice', label: 'Pengumuman & Memo', shortLabel: 'Pengumuman', accent: '#0284C7' },
  { id: 'email', label: 'Email & Pesan', shortLabel: 'Email', accent: '#0D9488' },
  { id: 'short', label: 'Wacana Pendek (Tanbun)', shortLabel: 'Pendek', accent: '#D97706' },
  { id: 'essay', label: 'Esai & Opini (Chūbun)', shortLabel: 'Esai', accent: '#DB2777' },
  { id: 'comparison', label: 'Perbandingan Teks A/B', shortLabel: 'Teks A/B', accent: '#7C3AED' },
];

export type { JlptPackManifest as ReadingManifest };

function buildReadingDataset(passages: ReadingPassage[]): ReadingDataset {
  const byId: Record<string, ReadingPassage> = {};
  const byJlpt: Record<JlptLevel, ReadingPassage[]> = {
    5: [],
    4: [],
    3: [],
    2: [],
    1: [],
  };

  for (const p of passages) {
    byId[p.id] = p;
    byJlpt[p.jlpt].push(p);
  }

  for (const lvl of [5, 4, 3, 2, 1] as JlptLevel[]) {
    byJlpt[lvl].sort((a, b) => a.order - b.order);
  }

  return { passages, byId, byJlpt };
}

const readingLoader = createJlptPackLoader<ReadingPassage, ReadingDataset>({
  dir: 'reading',
  label: 'Membaca Dokkai',
  buildDataset: buildReadingDataset,
});

export const loadReadingManifest = readingLoader.loadManifest;
export const loadReadingLevel = readingLoader.loadLevel;
export const loadReadingLevels = readingLoader.loadLevels;
export const loadReadingDataset = readingLoader.loadAll;

/** Strip inline kanji[reading] furigana markup to obtain plain Japanese text for audio/exam display */
export function stripFuriganaMarkup(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, '');
}
