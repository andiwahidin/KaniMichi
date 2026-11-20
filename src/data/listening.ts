import { JlptLevel } from '../types/grammar';
import {
  ListeningDataset,
  ListeningTaskType,
  ListeningTrack,
} from '../types/listening';
import { createJlptPackLoader, type JlptPackManifest } from './packLoader';

export interface ListeningTaskMeta {
  id: ListeningTaskType;
  label: string;
  jpLabel: string;
  description: string;
  accent: string;
}

export const LISTENING_TASK_TYPES: ListeningTaskMeta[] = [
  {
    id: 'kadai',
    label: 'Kadai Rikai',
    jpLabel: '課題理解',
    description: 'Menentukan tindakan konkret yang akan dilakukan pembicara',
    accent: '#0284C7',
  },
  {
    id: 'point',
    label: 'Pointo Rikai',
    jpLabel: 'ポイント理解',
    description: 'Menangkap alasan, syarat, atau informasi inti tertentu',
    accent: '#0D9488',
  },
  {
    id: 'gaiyou',
    label: 'Gaiyō Rikai',
    jpLabel: '概要理解',
    description: 'Memahami gagasan utama, opini, atau tema monolog',
    accent: '#7C3AED',
  },
  {
    id: 'sokuji',
    label: 'Sokuji Ōtō',
    jpLabel: '即時応答',
    description: 'Memilih balasan cepat yang paling alami (3 pilihan audio)',
    accent: '#D97706',
  },
  {
    id: 'tougou',
    label: 'Tōgō Rikai',
    jpLabel: '統合理解',
    description: 'Membandingkan beberapa opsi dalam diskusi panjang (N2–N1)',
    accent: '#DB2777',
  },
];

export type { JlptPackManifest as ListeningManifest };

function buildDataset(tracks: ListeningTrack[]): ListeningDataset {
  const byJlpt: Record<JlptLevel, ListeningTrack[]> = {
    5: [],
    4: [],
    3: [],
    2: [],
    1: [],
  };
  const byId: Record<string, ListeningTrack> = {};

  for (const track of tracks) {
    byId[track.id] = track;
    if (byJlpt[track.jlpt]) {
      byJlpt[track.jlpt].push(track);
    }
  }

  return { tracks, byJlpt, byId };
}

const listeningLoader = createJlptPackLoader<ListeningTrack, ListeningDataset>({
  dir: 'listening',
  label: 'Mendengarkan Chōkai',
  buildDataset,
});

export const loadListeningManifest = listeningLoader.loadManifest;
export const loadListeningLevel = listeningLoader.loadLevel;
export const loadListeningLevels = listeningLoader.loadLevels;
export const loadListeningDataset = listeningLoader.loadAll;
