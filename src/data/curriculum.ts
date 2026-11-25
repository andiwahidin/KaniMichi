import { ContextSentence, CurriculumItem, ItemType } from '../types/curriculum';
import {
  buildIndonesianAcceptedMeanings,
  translatePartOfSpeech,
  translateSync,
} from '../utils/idTranslator';

export const MAX_LEVEL = 60;

export interface LevelTier {
  id: string;
  name: string;
  labelId: string;
  startLevel: number;
  endLevel: number;
}

export const LEVEL_TIERS: LevelTier[] = [
  { id: 'n5', name: 'JLPT N5', labelId: 'Pemula', startLevel: 1, endLevel: 10 },
  { id: 'n4', name: 'JLPT N4', labelId: 'Dasar', startLevel: 11, endLevel: 20 },
  { id: 'n3', name: 'JLPT N3', labelId: 'Menengah', startLevel: 21, endLevel: 35 },
  { id: 'n2', name: 'JLPT N2', labelId: 'Menengah Atas', startLevel: 36, endLevel: 50 },
  { id: 'n1', name: 'JLPT N1', labelId: 'Mahir', startLevel: 51, endLevel: 60 },
];

export interface LevelMeta {
  level: number;
  jlpt: 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
  unitInTier: number;
  totalUnitsInTier: number;
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
  const jlpt = tier.id.toUpperCase() as 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
  const unitInTier = Math.max(1, level - tier.startLevel + 1);
  const totalUnitsInTier = tier.endLevel - tier.startLevel + 1;
  return {
    level,
    jlpt,
    unitInTier,
    totalUnitsInTier,
    tier: `${tier.name} (${tier.labelId})`,
    tierId: tier.id,
    title: `${tier.name} · Bab ${unitInTier} dari ${totalUnitsInTier}`,
  };
}

interface CuratedOverlay {
  meaningMnemonic?: string;
  readingMnemonic?: string;
  contextSentences?: ContextSentence[];
}

/** Mnemonik & contoh kalimat berbahasa Indonesia yang mudah dipahami untuk materi inti */
const CURATED_OVERLAYS: Record<string, CuratedOverlay> = {
  'radical:一': {
    meaningMnemonic: 'Satu garis mendatar yang rata di bawah kaki kita — persis seperti permukaan Tanah yang datar.',
  },
  'radical:八': {
    meaningMnemonic: 'Dua garis miring yang membuka keluar seperti sepasang Sirip ikan paus yang meluncur di lautan.',
  },
  'radical:十': {
    meaningMnemonic: 'Satu garis tegak dan satu garis mendatar yang berpotongan rapi di tengah membentuk tanda Salib / Silang.',
  },
  'radical:口': {
    meaningMnemonic: 'Bentuk kotak terbuka lebar, seperti seseorang yang membuka Mulutnya lebar-lebar saat berkata "Aaa!"',
  },
  'radical:人': {
    meaningMnemonic: 'Dua kaki yang sedang melangkah dilihat dari samping — siluet paling sederhana dari seorang Orang yang berjalan.',
  },
  'radical:大': {
    meaningMnemonic: 'Seseorang (人) yang merentangkan kedua tangannya selebar mungkin untuk menunjukkan betapa Besar sesuatu.',
  },
  'radical:山': {
    meaningMnemonic: 'Tiga puncak menjulang ke langit dengan puncak tertinggi di tengah — bentuk klasik sebuah Gunung.',
  },
  'radical:川': {
    meaningMnemonic: 'Tiga garis tegak mengalir ke bawah seperti arus air Sungai yang menuju ke laut.',
  },
  'radical:女': {
    meaningMnemonic: 'Siluet anggun seorang Wanita yang sedang duduk bersimpuh dengan tenang.',
  },
  'radical:力': {
    meaningMnemonic: 'Lengan berotot yang sedang mengepal menunjukkan Kekuatan dan tenaga.',
  },
  'kanji:一': {
    meaningMnemonic: 'Hanya ada satu garis Tanah (一) di sini. Satu goresan tunggal melambangkan angka Satu.',
    readingMnemonic: 'Bayangkan ada satu jari yang terasa gatal ("ichi" → いち). Ingat: Satu = いち.',
  },
  'kanji:二': {
    meaningMnemonic: 'Dua garis sejajar bertumpuk — satu di atas dan satu di bawah — melambangkan angka Dua.',
    readingMnemonic: 'Kamu menekuk kedua lutut ("ni" → に) tepat di atas dua garis ini. Dua = に.',
  },
  'kanji:三': {
    meaningMnemonic: 'Tiga garis bertumpuk rapi: langit, manusia, dan bumi. Tiga goresan berarti angka Tiga.',
    readingMnemonic: 'Kamu menyapa tiga teman akrab dengan akhiran sopan "-san" (さん). Tiga = さん.',
  },
  'kanji:八': {
    meaningMnemonic: 'Radikal Sirip (八) yang terbelah rapi menjadi dua goresan, melambangkan angka Delapan.',
    readingMnemonic: 'Delapan ekor anak ayam menetas ("hachi" → はち) dan langsung berlarian.',
  },
  'kanji:十': {
    meaningMnemonic: 'Radikal Silang (十) menandai persimpangan lengkap yang menyatukan kesepuluh jari tangan: Sepuluh.',
    readingMnemonic: 'Kamu minum sepuluh gelas jus ("juu" → じゅう) tepat di persimpangan.',
  },
  'kanji:口': {
    meaningMnemonic: 'Sama persis dengan radikal Mulut (口): rongga kotak terbuka untuk makan dan berbicara.',
    readingMnemonic: 'Dari mulut yang terbuka terdengar bunyi "kou" (こう) untuk bacaan On\'yomi, atau "kuchi" (くち) untuk Kun\'yomi.',
  },
  'kanji:人': {
    meaningMnemonic: 'Radikal Orang (人) yang berdiri tegak di atas dua kaki — kanjinya bermakna sama: Orang / Manusia.',
    readingMnemonic: 'Bayangkan seorang ninja (にん) melompat di atap. Di balik topeng, ia tetap seorang Orang (にん / じん / ひと).',
  },
  'kanji:大': {
    meaningMnemonic: 'Seseorang (人) yang merentangkan kedua tangannya selebar mungkin untuk menunjukkan ukuran Besar.',
    readingMnemonic: 'Orang raksasa ini memakai dasi besar ("dai / tai" → だい / たい). Bacaan Kun\'yomi: おお.',
  },
  'kanji:山': {
    meaningMnemonic: 'Sama persis dengan radikal Gunung (山): tiga puncak yang menjulang tinggi.',
    readingMnemonic: 'Kamu mengendarai motor Yamaha (やま) mendaki jalur pegunungan. Kun\'yomi: やま, On\'yomi: さん.',
  },
  'kanji:川': {
    meaningMnemonic: 'Sama persis dengan radikal Sungai (川): tiga aliran air yang mengalir deras.',
    readingMnemonic: 'Perahu Kawasaki (かわ) melaju kencang menyusuri arus sungai. Kun\'yomi: かわ.',
  },
  'vocabulary:一': {
    contextSentences: [
      { jp: '一から始めましょう。', reading: 'いちからはじめましょう。', en: 'Mari kita mulai dari satu (dari paling awal).' },
    ],
  },
  'vocabulary:人': {
    meaningMnemonic: 'Kata benda mandiri 人 berarti "Orang". Saat berdiri sendiri sebagai satu kata, dibaca dengan Kun\'yomi: ひと.',
    readingMnemonic: 'Saat berdiri sendiri dibaca ひと (hito). Di kata majemuk seperti 日本人 (にほんじん) atau 三人 (さんにん), memakai On\'yomi じん / にん.',
    contextSentences: [
      { jp: 'あの人はとても親切です。', reading: 'あのひとはとてもしんせつです。', en: 'Orang itu sangat ramah dan baik hati.' },
    ],
  },
  'vocabulary:大': {
    meaningMnemonic: 'Kanji 大 yang dipakai sebagai awalan atau penanda ukuran berarti "Besar".',
    readingMnemonic: 'Bacaan yang diterima: おお (awalan, mis. 大雨 おおあめ = hujan lebat) dan だい (ukuran besar, mis. 大・中・小).',
    contextSentences: [
      { jp: 'コーヒーの大を一つください。', reading: 'こーひーのだいをひとつください。', en: 'Tolong satu kopi ukuran besar.' },
    ],
  },
  'vocabulary:九': {
    meaningMnemonic: 'Angka 九 berarti "Sembilan".',
    readingMnemonic: 'Bacaan standar untuk angka sembilan adalah きゅう (kyuu) dan く (ku).',
    contextSentences: [
      { jp: '九時に会いましょう。', reading: 'くじにあいましょう。', en: 'Mari kita bertemu jam sembilan.' },
    ],
  },
  'vocabulary:人口': {
    meaningMnemonic: 'Gabungan Orang (人) dan Mulut (口). Menghitung jumlah orang di suatu wilayah menghasilkan arti "Populasi / Jumlah Penduduk"!',
    readingMnemonic: 'Gabungan On\'yomi standar: じん (人) + こう (口) = じんこう (jinkou).',
    contextSentences: [
      { jp: '東京の人口はとても多いです。', reading: 'とうきょうのじんこうはとてもおおいです。', en: 'Jumlah penduduk Tokyo sangat banyak.' },
    ],
  },
  'vocabulary:大人': {
    meaningMnemonic: 'Besar (大) + Orang (人). Orang yang sudah tumbuh besar adalah "Orang Dewasa".',
    readingMnemonic: 'Bacaan khusus (jukujikun) yang wajib dihafal utuh: おとな (otona).',
    contextSentences: [
      { jp: '大人の切符を一枚ください。', reading: 'おとなのきっぷをいちまいください。', en: 'Tolong satu tiket untuk orang dewasa.' },
    ],
  },
  'vocabulary:日本': {
    meaningMnemonic: 'Matahari (日) + Asal (本) = Negeri Matahari Terbit, yaitu "Jepang"!',
    contextSentences: [
      { jp: '来年、日本へ旅行したいです。', reading: 'らいねん、にほんへりょこうしたいです。', en: 'Tahun depan saya ingin berwisata ke Jepang.' },
    ],
  },
  'vocabulary:火山': {
    meaningMnemonic: 'Api (火) + Gunung (山). Gunung yang menyemburkan api adalah "Gunung Berapi".',
    contextSentences: [
      { jp: '日本には多くの火山があります。', reading: 'にほんにはおおくのかざんがあります。', en: 'Di Jepang terdapat banyak gunung berapi.' },
    ],
  },
};

export interface CurriculumDataset {
  items: CurriculumItem[];
  byId: Record<string, CurriculumItem>;
  byLevel: Record<number, CurriculumItem[]>;
  byType: Record<ItemType, CurriculumItem[]>;
  kanjiByChar: Record<string, CurriculumItem>;
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
  const kanjiByChar: Record<string, CurriculumItem> = {};
  const dependentsById: Record<string, CurriculumItem[]> = {};

  for (let l = 1; l <= MAX_LEVEL; l++) {
    byLevel[l] = [];
  }

  const sanitizeReadings = (arr: string[]): string[] =>
    Array.from(new Set(arr.map((r) => r.replace(/^\^/, '').trim()).filter(Boolean)));

  // First pass: instantiate all items with Bahasa Indonesia meanings + dual-language quiz acceptance
  for (const tuple of raw.items) {
    const [id, typeNum, level, characters, rawPrimaryMeaning, rawAcceptedMeanings] = tuple;
    const type: ItemType =
      typeNum === 0 ? 'radical' : typeNum === 1 ? 'kanji' : 'vocabulary';
    const overlay = CURATED_OVERLAYS[`${type}:${characters}`];
    const jlptMeta = getLevelMeta(level);
    const primaryMeaning = translateSync(rawPrimaryMeaning);
    const acceptedMeanings = buildIndonesianAcceptedMeanings(
      rawPrimaryMeaning,
      rawAcceptedMeanings,
      primaryMeaning
    );

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
          `Radikal ${characters} melambangkan "${primaryMeaning}". Kenali bentuk visualnya karena radikal ini menjadi komponen penyusun kanji pada tingkat JLPT ${jlptMeta.jlpt} dan tingkat berikutnya.`,
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
        onyomi: sanitizeReadings(onyomi),
        kunyomi: sanitizeReadings(kunyomi),
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
        readings: sanitizeReadings(readings),
        partOfSpeech: translatePartOfSpeech(partOfSpeech),
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
    if (type === 'kanji') kanjiByChar[characters] = item;
  }

  // Second pass: populate reverse dependency map & clear Indonesian structural mnemonics
  for (const item of items) {
    if (item.componentIds && item.componentIds.length > 0) {
      for (const depId of item.componentIds) {
        if (!dependentsById[depId]) dependentsById[depId] = [];
        dependentsById[depId].push(item);
      }
    }

    const jlptMeta = getLevelMeta(item.level);

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
            ? `Kanji ${item.characters} berarti "${item.primaryMeaning}". Kanji ini terbentuk dari gabungan radikal ${compNames.join(' + ')} — hubungkan komponen visual tersebut agar maknanya mudah melekat di ingatan.`
            : `Kanji ${item.characters} memiliki makna utama "${item.primaryMeaning}" pada materi JLPT ${jlptMeta.jlpt}.`;
      }
      if (!item.readingMnemonic) {
        const isKun = item.primaryReadingType === 'kunyomi';
        const mainReadings = (isKun ? item.kunyomi : item.onyomi) ?? [];
        const label = isKun ? "Kun'yomi" : "On'yomi";
        item.readingMnemonic =
          mainReadings.length > 0
            ? `Fokus hafalkan bacaan utama ${label}: ${mainReadings.join('、 ')}. Ucapkan dengan suara keras sambil membayangkan arti "${item.primaryMeaning}" agar cepat teringat saat ujian.`
            : `Perhatikan cara baca kanji ${item.characters} ketika bergabung dalam kosakata majemuk.`;
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
            ? `Kosakata ${item.characters} berarti "${item.primaryMeaning}". Kata ini tersusun dari gabungan kanji ${compNames.join(' + ')}.`
            : `Kosakata ${item.characters} memiliki arti utama "${item.primaryMeaning}".`;
      }
      if (!item.readingMnemonic) {
        const readStr = (item.readings ?? []).join('、 ');
        item.readingMnemonic = `Dibaca ${readStr}. Dengarkan audio dan perhatikan bagaimana bacaan masing-masing kanji berpadu dalam kata ini.`;
      }
    }
  }

  return {
    items,
    byId,
    byLevel,
    byType,
    kanjiByChar,
    dependentsById,
    counts: raw.counts,
  };
}

export async function loadCurriculumDataset(): Promise<CurriculumDataset> {
  if (cachedDataset) return cachedDataset;
  if (!loadingPromise) {
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    loadingPromise = fetch(`${base}data/curriculum-60.json`)
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
