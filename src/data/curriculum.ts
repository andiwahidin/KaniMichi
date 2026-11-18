import { ContextSentence, CurriculumItem, ItemType } from '../types/curriculum';

export const MAX_LEVEL = 60;

export interface LevelTier {
  id: string;
  name: string;
  labelId: string;
  startLevel: number;
  endLevel: number;
}

export const LEVEL_TIERS: LevelTier[] = [
  { id: 'pleasant', name: 'Pleasant', labelId: 'Menyenangkan', startLevel: 1, endLevel: 10 },
  { id: 'painful', name: 'Painful', labelId: 'Menantang', startLevel: 11, endLevel: 20 },
  { id: 'death', name: 'Death', labelId: 'Intensif', startLevel: 21, endLevel: 30 },
  { id: 'hell', name: 'Hell', labelId: 'Mendalam', startLevel: 31, endLevel: 40 },
  { id: 'paradise', name: 'Paradise', labelId: 'Mahir', startLevel: 41, endLevel: 50 },
  { id: 'reality', name: 'Reality', labelId: 'Master', startLevel: 51, endLevel: 60 },
];

export interface LevelMeta {
  level: number;
  tier: string;
  tierId: string;
  title: string;
}

export function getTierForLevel(level: number): LevelTier {
  return (
    LEVEL_TIERS.find((t) => level >= t.startLevel && level <= t.endLevel) ??
    LEVEL_TIERS[0]
  );
}

export function getLevelMeta(level: number): LevelMeta {
  const tier = getTierForLevel(level);
  return {
    level,
    tier: `${tier.name} (${tier.labelId})`,
    tierId: tier.id,
    title: `Level ${level} · ${tier.name}`,
  };
}

interface CuratedOverlay {
  meaningMnemonic?: string;
  readingMnemonic?: string;
  contextSentences?: ContextSentence[];
}

/** Hand-crafted Indonesian mnemonics & example sentences overlaid on early core items */
const CURATED_OVERLAYS: Record<string, CuratedOverlay> = {
  'radical:一': {
    meaningMnemonic: 'Satu garis horizontal datar yang membentang lurus di bawah kaki kita — persis seperti permukaan Tanah yang rata.',
  },
  'radical:八': {
    meaningMnemonic: 'Dua garis miring yang melebar ke kiri dan kanan seperti sepasang Sirip ikan paus yang meluncur di lautan.',
  },
  'radical:十': {
    meaningMnemonic: 'Satu garis vertikal dan satu garis horizontal yang berpotongan tepat di tengah, membentuk tanda Salib atau tanda tambah.',
  },
  'radical:口': {
    meaningMnemonic: 'Kotak persegi terbuka lebar seolah seseorang sedang membuka Mulutnya sambil berkata "Aaa!".',
  },
  'radical:人': {
    meaningMnemonic: 'Dua kaki yang sedang melangkah maju dari samping — bentuk sederhana dari seorang Orang yang berjalan.',
  },
  'radical:大': {
    meaningMnemonic: 'Sosok Orang yang merentangkan kedua tangannya selebar mungkin untuk menunjukkan sesuatu yang sangat Besar.',
  },
  'radical:山': {
    meaningMnemonic: 'Tiga puncak menjulang ke langit dengan puncak tertinggi di tengah — siluet klasik Gunung.',
  },
  'radical:川': {
    meaningMnemonic: 'Tiga garis mengalir vertikal seperti arus air Sungai yang deras menuju laut.',
  },
  'radical:女': {
    meaningMnemonic: 'Siluet anggun seorang Wanita yang duduk berlutut dengan kedua tangan dilipat di depan.',
  },
  'radical:力': {
    meaningMnemonic: 'Bentuk lengan berotot yang sedang melentur menunjukkan Kekuatan besar.',
  },
  'kanji:一': {
    meaningMnemonic: 'Hanya ada satu garis Tanah (一). Satu garis melambangkan angka Satu.',
    readingMnemonic: 'Saat duduk sendirian di atas satu garis tanah, kulitmu terasa gatal ("itchy" → いち). Ingat: satu = いち.',
  },
  'kanji:二': {
    meaningMnemonic: 'Dua tumpukan garis sejajar — satu di atas dan satu di bawah, melambangkan angka Dua.',
    readingMnemonic: 'Kamu menekuk kedua lutut ("knee" → に) di atas dua garis ini. Dua = に.',
  },
  'kanji:三': {
    meaningMnemonic: 'Tiga garis bertumpuk rapi — langit, manusia, dan bumi. Tiga garis berarti angka Tiga.',
    readingMnemonic: 'Kamu menyapa tiga teman dengan akhiran sopan "-san" (さん). Tiga = さん.',
  },
  'kanji:八': {
    meaningMnemonic: 'Radikal Sirip (八) yang terbelah dua seperti angka Delapan yang terbuka di bawah.',
    readingMnemonic: 'Ada delapan anak ayam baru menetas ("hatch" → はち) dan langsung berenang memakai siripnya.',
  },
  'kanji:十': {
    meaningMnemonic: 'Radikal Salib (十) menandakan persimpangan sempurna yang mengumpulkan semua jari menjadi Sepuluh.',
    readingMnemonic: 'Kamu meminum sepuluh gelas jus ("juice" → じゅう) tepat di persimpangan salib.',
  },
  'kanji:口': {
    meaningMnemonic: 'Sama persis dengan radikal Mulut (口): sebuah rongga terbuka untuk makan dan berbicara.',
    readingMnemonic: 'Dari mulut terbuka keluar suara batuk ("cough" → こう). On\'yomi: こう.',
  },
  'kanji:人': {
    meaningMnemonic: 'Radikal Orang (人) berdiri tegak dengan dua kaki — arti kanjinya sama persis: Orang.',
    readingMnemonic: 'Bayangkan seorang ninja (にん) melompat cepat. Ninja juga adalah Orang (にん / じん).',
  },
  'kanji:大': {
    meaningMnemonic: 'Seorang Orang (人) merentangkan tangannya lebar-lebar untuk menunjukkan sesuatu yang Besar.',
    readingMnemonic: 'Orang besar ini memakai dasi ("tie" → たい) raksasa berwarna mencolok. On\'yomi: たい / だい.',
  },
  'kanji:山': {
    meaningMnemonic: 'Sama persis dengan radikal Gunung (山): tiga puncak tinggi menjulang.',
    readingMnemonic: 'Kamu mendaki gunung tinggi mengendarai motor Yamaha (やま). Kun\'yomi: やま, On\'yomi: さん.',
  },
  'kanji:川': {
    meaningMnemonic: 'Sama persis dengan radikal Sungai (川): tiga jalur aliran air.',
    readingMnemonic: 'Di tepi sungai kamu melihat kawanmu ("kawa" → かわ) sedang memancing.',
  },
  'vocabulary:一': {
    contextSentences: [
      { jp: '一から始めましょう。', reading: 'いちからはじめましょう。', id: 'Mari kita mulai dari satu (dari awal).' },
    ],
  },
  'vocabulary:人口': {
    meaningMnemonic: 'Gabungan Orang (人) dan Mulut (口). Menghitung berapa banyak mulut orang di suatu wilayah = Populasi!',
    readingMnemonic: 'Gabungan On\'yomi じん (人) + こう (口) = じんこう.',
    contextSentences: [
      { jp: '東京の人口はとても多いです。', reading: 'とうきょうのじんこうはとてもおおいです。', id: 'Populasi Tokyo sangat banyak.' },
    ],
  },
  'vocabulary:大人': {
    meaningMnemonic: 'Besar (大) + Orang (人). Orang yang sudah tumbuh besar adalah Orang Dewasa.',
    readingMnemonic: 'Bacaan khusus (jukujikun): おとな.',
    contextSentences: [
      { jp: '大人の切符を一枚ください。', reading: 'おとなのきっぷをいちまいください。', id: 'Tolong satu tiket dewasa.' },
    ],
  },
  'vocabulary:日本': {
    meaningMnemonic: 'Matahari (日) + Asal (本) = Negeri Asal Matahari Terbit, yaitu Jepang!',
    contextSentences: [
      { jp: '来年、日本へ旅行したいです。', reading: 'らいねん、にほんへりょこうしたいです。', id: 'Tahun depan saya ingin berwisata ke Jepang.' },
    ],
  },
  'vocabulary:火山': {
    meaningMnemonic: 'Api (火) + Gunung (山). Gunung yang menyemburkan api adalah Gunung Berapi.',
    contextSentences: [
      { jp: 'インドネシアには多くの火山があります。', reading: 'いんどねしあにはおおくのかざんがあります。', id: 'Di Indonesia terdapat banyak gunung berapi.' },
    ],
  },
};

export interface CurriculumDataset {
  items: CurriculumItem[];
  byId: Record<string, CurriculumItem>;
  byLevel: Record<number, CurriculumItem[]>;
  byType: Record<ItemType, CurriculumItem[]>;
  dependentsById: Record<string, CurriculumItem[]>;
  counts: {
    radicals: number;
    kanji: number;
    vocabulary: number;
    total: number;
  };
}

type RawTuple =
  | [string, 0, number, string, string, string[]]
  | [string, 1, number, string, string, string[], string[], string[], 0 | 1, string[], number, number]
  | [string, 2, number, string, string, string[], string[], string, string[]];

interface RawPayload {
  version: number;
  maxLevel: number;
  counts: { radicals: number; kanji: number; vocabulary: number; total: number };
  items: RawTuple[];
}

let cachedDataset: CurriculumDataset | null = null;
let loadingPromise: Promise<CurriculumDataset> | null = null;

function buildDataset(raw: RawPayload): CurriculumDataset {
  const items: CurriculumItem[] = [];
  const byId: Record<string, CurriculumItem> = {};
  const byLevel: Record<number, CurriculumItem[]> = {};
  const byType: Record<ItemType, CurriculumItem[]> = {
    radical: [],
    kanji: [],
    vocabulary: [],
  };
  const dependentsById: Record<string, CurriculumItem[]> = {};

  for (let l = 1; l <= MAX_LEVEL; l++) {
    byLevel[l] = [];
  }

  // First pass: instantiate all items
  for (const tuple of raw.items) {
    const [id, typeNum, level, characters, primaryMeaning, acceptedMeanings] = tuple;
    const type: ItemType =
      typeNum === 0 ? 'radical' : typeNum === 1 ? 'kanji' : 'vocabulary';
    const overlay = CURATED_OVERLAYS[`${type}:${characters}`];

    let item: CurriculumItem;

    if (typeNum === 0) {
      item = {
        id,
        type: 'radical',
        level,
        characters,
        primaryMeaning,
        acceptedMeanings,
        meaningMnemonic:
          overlay?.meaningMnemonic ??
          `Radikal ${characters} melambangkan konsep "${primaryMeaning}". Kenali bentuk dasarnya karena radikal ini menjadi batu bata penyusun kanji di level ${level} dan selanjutnya.`,
      };
    } else if (typeNum === 1) {
      const [, , , , , , onyomi, kunyomi, primaryTypeNum, componentIds, strokes, jlpt] = tuple;
      item = {
        id,
        type: 'kanji',
        level,
        characters,
        primaryMeaning,
        acceptedMeanings,
        onyomi,
        kunyomi,
        primaryReadingType: primaryTypeNum === 1 ? 'kunyomi' : 'onyomi',
        componentIds,
        strokes: strokes || undefined,
        jlpt: jlpt || undefined,
        meaningMnemonic: overlay?.meaningMnemonic ?? '',
        readingMnemonic: overlay?.readingMnemonic ?? '',
      };
    } else {
      const [, , , , , , readings, partOfSpeech, componentIds] = tuple;
      item = {
        id,
        type: 'vocabulary',
        level,
        characters,
        primaryMeaning,
        acceptedMeanings,
        readings,
        partOfSpeech,
        componentIds,
        meaningMnemonic: overlay?.meaningMnemonic ?? '',
        readingMnemonic: overlay?.readingMnemonic ?? '',
        contextSentences: overlay?.contextSentences,
      };
    }

    items.push(item);
    byId[id] = item;
    if (byLevel[level]) byLevel[level].push(item);
    byType[type].push(item);
  }

  // Second pass: populate reverse dependency map & crisp structural mnemonics
  for (const item of items) {
    if (item.componentIds && item.componentIds.length > 0) {
      for (const depId of item.componentIds) {
        if (!dependentsById[depId]) dependentsById[depId] = [];
        dependentsById[depId].push(item);
      }
    }

    if (item.type === 'kanji') {
      if (!item.meaningMnemonic) {
        const compNames = (item.componentIds ?? [])
          .map((cid) => {
            const c = byId[cid];
            return c ? `${c.characters} (${c.primaryMeaning})` : null;
          })
          .filter(Boolean);
        item.meaningMnemonic =
          compNames.length > 0
            ? `Kanji ${item.characters} berarti "${item.primaryMeaning}". Tersusun dari komponen radikal ${compNames.join(' + ')} — gabungkan makna visual komponen tersebut untuk mengingat artinya.`
            : `Kanji ${item.characters} memiliki arti utama "${item.primaryMeaning}" pada Level ${item.level}.`;
      }
      if (!item.readingMnemonic) {
        const isKun = item.primaryReadingType === 'kunyomi';
        const mainReadings = (isKun ? item.kunyomi : item.onyomi) ?? [];
        const label = isKun ? "Kun'yomi" : "On'yomi";
        item.readingMnemonic =
          mainReadings.length > 0
            ? `Fokus hafalkan bacaan ${label} utama: ${mainReadings.join('、 ')}. Ucapkan berulang bersama artinya "${item.primaryMeaning}" agar kuat di memori.`
            : `Perhatikan pola bacaan kanji ${item.characters} saat muncul di berbagai kosakata.`;
      }
    } else if (item.type === 'vocabulary') {
      if (!item.meaningMnemonic) {
        const compNames = (item.componentIds ?? [])
          .map((cid) => {
            const c = byId[cid];
            return c ? `${c.characters} (${c.primaryMeaning})` : null;
          })
          .filter(Boolean);
        item.meaningMnemonic =
          compNames.length > 0
            ? `Kosakata ${item.characters} (${item.partOfSpeech ?? 'Kosakata'}) berarti "${item.primaryMeaning}". Terbentuk dari kanji ${compNames.join(' + ')}.`
            : `Kosakata ${item.characters} berarti "${item.primaryMeaning}".`;
      }
      if (!item.readingMnemonic) {
        const readStr = (item.readings ?? []).join('、 ');
        item.readingMnemonic = `Dibaca ${readStr}. Dengarkan pelafalan audionya dan perhatikan bagaimana bacaan kanji penyusunnya berpadu dalam kata ini.`;
      }
    }
  }

  return {
    items,
    byId,
    byLevel,
    byType,
    dependentsById,
    counts: raw.counts,
  };
}

export async function loadCurriculumDataset(): Promise<CurriculumDataset> {
  if (cachedDataset) return cachedDataset;
  if (!loadingPromise) {
    loadingPromise = fetch('/data/curriculum-60.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Gagal memuat kurikulum (${res.status})`);
        return res.json() as Promise<RawPayload>;
      })
      .then((raw) => {
        cachedDataset = buildDataset(raw);
        return cachedDataset;
      })
      .catch((err) => {
        loadingPromise = null;
        throw err;
      });
  }
  return loadingPromise;
}
