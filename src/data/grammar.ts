import { GrammarDataset, GrammarPoint, JlptLevel } from '../types/grammar';

export const JLPT_LEVELS: {
  level: JlptLevel;
  code: string;
  label: string;
  description: string;
  accent: string;
}[] = [
  {
    level: 5,
    code: 'N5',
    label: 'Dasar (N5)',
    description: 'Partikel inti, bentuk dasar kata kerja, kalimat sehari-hari',
    accent: '#0284C7',
  },
  {
    level: 4,
    code: 'N4',
    label: 'Pra-Menengah (N4)',
    description: 'Pengandaian, bentuk pasif/kausatif, pemberian & permintaan sopan',
    accent: '#0D9488',
  },
  {
    level: 3,
    code: 'N3',
    label: 'Menengah (N3)',
    description: 'Nuansa percakapan natural, sebab-akibat, sudut pandang & penekanan',
    accent: '#D97706',
  },
  {
    level: 2,
    code: 'N2',
    label: 'Menengah-Atas (N2)',
    description: 'Bahasa tulisan formal, berita, bisnis & struktur kontras kompleks',
    accent: '#DB2777',
  },
  {
    level: 1,
    code: 'N1',
    label: 'Mahir (N1)',
    description: 'Ekspresi sastra, akademik, hukum & nuansa halus tingkat lanjut',
    accent: '#7C3AED',
  },
];

let cachedGrammar: GrammarDataset | null = null;
let loadingGrammarPromise: Promise<GrammarDataset> | null = null;

function buildGrammarDataset(points: GrammarPoint[]): GrammarDataset {
  const byId: Record<string, GrammarPoint> = {};
  const byJlpt: Record<JlptLevel, GrammarPoint[]> = {
    5: [],
    4: [],
    3: [],
    2: [],
    1: [],
  };

  for (const pt of points) {
    byId[pt.id] = pt;
    byJlpt[pt.jlpt].push(pt);
  }

  for (const lvl of [5, 4, 3, 2, 1] as JlptLevel[]) {
    byJlpt[lvl].sort((a, b) => a.order - b.order);
  }

  return { points, byId, byJlpt };
}

export async function loadGrammarDataset(): Promise<GrammarDataset> {
  if (cachedGrammar) return cachedGrammar;
  if (!loadingGrammarPromise) {
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    loadingGrammarPromise = fetch(`${base}data/grammar-jlpt.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Gagal memuat kurikulum Grammar (${res.status})`);
        return res.json() as Promise<{ version: number; points: GrammarPoint[] }>;
      })
      .then((raw) => {
        cachedGrammar = buildGrammarDataset(raw.points);
        return cachedGrammar;
      })
      .catch((err) => {
        loadingGrammarPromise = null;
        throw err;
      });
  }
  return loadingGrammarPromise;
}
