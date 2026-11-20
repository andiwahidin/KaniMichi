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

/** Hand-crafted English mnemonics & example sentences overlaid on early core items */
const CURATED_OVERLAYS: Record<string, CuratedOverlay> = {
  'radical:一': {
    meaningMnemonic: 'A single flat horizontal line stretching beneath your feet — just like the flat surface of the Ground.',
  },
  'radical:八': {
    meaningMnemonic: 'Two slanted strokes flaring outward like a pair of whale Fins gliding through the ocean.',
  },
  'radical:十': {
    meaningMnemonic: 'One vertical line and one horizontal line intersecting cleanly at the center to form a Cross.',
  },
  'radical:口': {
    meaningMnemonic: 'A wide-open square box, just like someone opening their Mouth wide to say "Ahhh!"',
  },
  'radical:人': {
    meaningMnemonic: 'Two legs mid-stride seen from the side — the simplest silhouette of a Person walking.',
  },
  'radical:大': {
    meaningMnemonic: 'A Person stretching both arms out as wide as possible to show how Big something is.',
  },
  'radical:山': {
    meaningMnemonic: 'Three jagged peaks rising toward the sky with the tallest in the middle — the classic silhouette of a Mountain.',
  },
  'radical:川': {
    meaningMnemonic: 'Three vertical flowing lines rushing downward like the currents of a River heading to the sea.',
  },
  'radical:女': {
    meaningMnemonic: 'The graceful silhouette of a Woman kneeling with her arms folded neatly in front.',
  },
  'radical:力': {
    meaningMnemonic: 'A flexed, muscular arm showing off raw Power and strength.',
  },
  'kanji:一': {
    meaningMnemonic: 'There is only one Ground (一) stroke here. A single line stands for the number One.',
    readingMnemonic: 'While sitting alone on this single line of ground, your skin starts getting itchy ("itchy" → いち). Remember: One = いち.',
  },
  'kanji:二': {
    meaningMnemonic: 'Two parallel strokes stacked together — one on top, one on bottom — representing the number Two.',
    readingMnemonic: 'You bend both knees ("knee" → に) right on top of these two lines. Two = に.',
  },
  'kanji:三': {
    meaningMnemonic: 'Three neatly stacked lines — heaven, humanity, and earth. Three strokes mean Three.',
    readingMnemonic: 'You greet three friends politely with the suffix "-san" (さん). Three = さん.',
  },
  'kanji:八': {
    meaningMnemonic: 'The Fins (八) radical splitting cleanly into two strokes, representing the number Eight.',
    readingMnemonic: 'Eight baby chicks hatch ("hatch" → はち) out of their eggs and immediately swim away with their fins.',
  },
  'kanji:十': {
    meaningMnemonic: 'The Cross (十) radical marks a complete crossroads bringing all ten fingers together: Ten.',
    readingMnemonic: 'You drink ten tall glasses of juice ("juice" → じゅう) right at the crossroads.',
  },
  'kanji:口': {
    meaningMnemonic: 'Identical to the Mouth (口) radical: an open square cavity used for eating and speaking.',
    readingMnemonic: 'Out of your wide-open mouth comes a loud cough ("cough" → こう). On\'yomi: こう.',
  },
  'kanji:人': {
    meaningMnemonic: 'The Person (人) radical standing tall on two legs — the kanji means the exact same thing: Person.',
    readingMnemonic: 'Picture a ninja (にん) leaping across the rooftops. Under the mask, a ninja is still a Person (にん / じん).',
  },
  'kanji:大': {
    meaningMnemonic: 'A Person (人) spreading both arms wide to show off something truly Big.',
    readingMnemonic: 'This giant person wears an absurdly oversized tie ("tie" → たい). On\'yomi: たい / だい.',
  },
  'kanji:山': {
    meaningMnemonic: 'Identical to the Mountain (山) radical: three towering peaks.',
    readingMnemonic: 'You ride a Yamaha (やま) motorcycle all the way up the mountain trail. Kun\'yomi: やま, On\'yomi: さん.',
  },
  'kanji:川': {
    meaningMnemonic: 'Identical to the River (川) radical: three streams of flowing water.',
    readingMnemonic: 'A sleek Kawasaki (かわ) boat races down the river current. Kun\'yomi: かわ.',
  },
  'vocabulary:一': {
    contextSentences: [
      { jp: '一から始めましょう。', reading: 'いちからはじめましょう。', en: 'Let\'s start from one (from the very beginning).' },
    ],
  },
  'vocabulary:人': {
    meaningMnemonic: 'The standalone noun 人 means "Person". When used on its own as a word (not attached to another kanji), it uses its Kun\'yomi reading ひと.',
    readingMnemonic: 'Standalone word 人 is read ひと (hito). In compounds like 日本人 (にほんじん) or 三人 (さんにん), it uses the Kanji On\'yomi じん / にん instead.',
    contextSentences: [
      { jp: 'あの人はとても親切です。', reading: 'あのひとはとてもしんせつです。', en: 'That person is very kind.' },
    ],
  },
  'vocabulary:大': {
    meaningMnemonic: 'The kanji 大 used as a prefix or standalone size word means "Large" or "Big".',
    readingMnemonic: 'Accepted readings: おお (prefix, e.g. 大雨 おおあめ) and だい (standalone size/prefix, e.g. 大・中・小). Both おお and だい are accepted!',
    contextSentences: [
      { jp: 'コーヒーの大を一つください。', reading: 'こーひーのだいをひとつください。', en: 'One large coffee, please.' },
    ],
  },
  'vocabulary:九': {
    meaningMnemonic: 'The numeral 九 means "Nine".',
    readingMnemonic: 'Accepted readings: きゅう and く (both are standard for the number 9).',
    contextSentences: [
      { jp: '九時に会いましょう。', reading: 'くじにあいましょう。', en: 'Let\'s meet at nine o\'clock.' },
    ],
  },
  'vocabulary:人口': {
    meaningMnemonic: 'Combines Person (人) and Mouth (口). Counting how many people\'s mouths live in an area gives you the Population!',
    readingMnemonic: 'Standard On\'yomi compound: じん (人) + こう (口) = じんこう.',
    contextSentences: [
      { jp: '東京の人口はとても多いです。', reading: 'とうきょうのじんこうはとてもおおいです。', en: 'Tokyo\'s population is very large.' },
    ],
  },
  'vocabulary:大人': {
    meaningMnemonic: 'Big (大) + Person (人). A person who has grown big is an Adult.',
    readingMnemonic: 'Irregular jukujikun reading: おとな.',
    contextSentences: [
      { jp: '大人の切符を一枚ください。', reading: 'おとなのきっぷをいちまいください。', en: 'One adult ticket, please.' },
    ],
  },
  'vocabulary:日本': {
    meaningMnemonic: 'Sun (日) + Origin (本) = Land of the Rising Sun, Japan!',
    contextSentences: [
      { jp: '来年、日本へ旅行したいです。', reading: 'らいねん、にほんへりょこうしたいです。', en: 'I want to travel to Japan next year.' },
    ],
  },
  'vocabulary:火山': {
    meaningMnemonic: 'Fire (火) + Mountain (山). A mountain that erupts with fire is a Volcano.',
    contextSentences: [
      { jp: '日本には多くの火山があります。', reading: 'にほんにはおおくのかざんがあります。', en: 'There are many volcanoes in Japan.' },
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
          `The radical ${characters} represents "${primaryMeaning}". Remember its visual shape well — it acts as a building block for kanji in Level ${level} and beyond.`,
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
    if (type === 'kanji') kanjiByChar[characters] = item;
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
            ? `The kanji ${item.characters} means "${item.primaryMeaning}". It combines the radical components ${compNames.join(' + ')} — link these visual pieces together to lock in the meaning.`
            : `The kanji ${item.characters} carries the primary meaning "${item.primaryMeaning}" at Level ${item.level}.`;
      }
      if (!item.readingMnemonic) {
        const isKun = item.primaryReadingType === 'kunyomi';
        const mainReadings = (isKun ? item.kunyomi : item.onyomi) ?? [];
        const label = isKun ? "Kun'yomi" : "On'yomi";
        item.readingMnemonic =
          mainReadings.length > 0
            ? `Focus on memorizing the primary ${label} reading: ${mainReadings.join('、 ')}. Say it aloud together with "${item.primaryMeaning}" to reinforce recall.`
            : `Pay close attention to how ${item.characters} is read across vocabulary compounds.`;
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
            ? `The vocabulary word ${item.characters} (${item.partOfSpeech ?? 'Vocabulary'}) means "${item.primaryMeaning}". It is built from the kanji ${compNames.join(' + ')}.`
            : `The vocabulary word ${item.characters} means "${item.primaryMeaning}".`;
      }
      if (!item.readingMnemonic) {
        const readStr = (item.readings ?? []).join('、 ');
        item.readingMnemonic = `Read as ${readStr}. Listen to the audio and notice how the component kanji readings combine in this word.`;
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
