import type { CurriculumDataset } from './curriculum';
import type { WritingCharacterEntry } from '../types/writing';

interface RawKanaSpec {
  char: string;
  romaji: string;
  group: string;
  word: string;
  reading: string;
  meaning: string;
  tip: string;
}

const HIRAGANA_SPECS: RawKanaSpec[] = [
  // A-row
  { char: 'あ', romaji: 'a', group: 'Baris A', word: 'あめ', reading: 'ame', meaning: 'rain / candy', tip: 'Horizontal top bar, curved vertical stroke, then a sweeping loop.' },
  { char: 'い', romaji: 'i', group: 'Baris A', word: 'いぬ', reading: 'inu', meaning: 'dog', tip: 'Left stroke curves down with a slight hook; right stroke is shorter.' },
  { char: 'う', romaji: 'u', group: 'Baris A', word: 'うみ', reading: 'umi', meaning: 'sea', tip: 'Short diagonal dash at top, then a smooth curve sweeping down-left.' },
  { char: 'え', romaji: 'e', group: 'Baris A', word: 'えき', reading: 'eki', meaning: 'train station', tip: 'Short dash on top, then a single Z-like sweeping stroke with a flat tail.' },
  { char: 'お', romaji: 'o', group: 'Baris A', word: 'おちゃ', reading: 'ocha', meaning: 'tea', tip: 'Horizontal bar, vertical loop going right, then a short dot on top-right.' },
  // Ka-row
  { char: 'か', romaji: 'ka', group: 'Baris Ka', word: 'かさ', reading: 'kasa', meaning: 'umbrella', tip: 'Curved hook stroke first, intersecting diagonal second, short dot on right.' },
  { char: 'き', romaji: 'ki', group: 'Baris Ka', word: 'きって', reading: 'kitte', meaning: 'postage stamp', tip: 'Two short parallel bars, diagonal stem down-right, and a bottom curve.' },
  { char: 'く', romaji: 'ku', group: 'Baris Ka', word: 'くつ', reading: 'kutsu', meaning: 'shoes', tip: 'One clean angular stroke: diagonal down-left, then diagonal down-right.' },
  { char: 'け', romaji: 'ke', group: 'Baris Ka', word: 'けさ', reading: 'kesa', meaning: 'this morning', tip: 'Slightly curved vertical on left, short bar on right, then vertical sweeping left.' },
  { char: 'こ', romaji: 'ko', group: 'Baris Ka', word: 'こえ', reading: 'koe', meaning: 'voice', tip: 'Two gently curving horizontal strokes facing each other.' },
  // Sa-row
  { char: 'さ', romaji: 'sa', group: 'Baris Sa', word: 'さくら', reading: 'sakura', meaning: 'cherry blossom', tip: 'Horizontal bar, diagonal stem down-right, and a rounded bottom curve.' },
  { char: 'し', romaji: 'shi', group: 'Baris Sa', word: 'しろ', reading: 'shiro', meaning: 'white / castle', tip: 'One smooth stroke straight down then curving upward to the right.' },
  { char: 'す', romaji: 'su', group: 'Baris Sa', word: 'すし', reading: 'sushi', meaning: 'sushi', tip: 'Horizontal top bar, then vertical stroke with a tight loop sweeping down-left.' },
  { char: 'せ', romaji: 'se', group: 'Baris Sa', word: 'せかい', reading: 'sekai', meaning: 'world', tip: 'Horizontal bar, short hooked vertical on right, then L-shaped stroke on left.' },
  { char: 'そ', romaji: 'so', group: 'Baris Sa', word: 'そら', reading: 'sora', meaning: 'sky', tip: 'Single continuous stroke: zig-zag at top, then a generous C-curve at the bottom.' },
  // Ta-row
  { char: 'た', romaji: 'ta', group: 'Baris Ta', word: 'たべる', reading: 'taberu', meaning: 'to eat', tip: 'Short bar and slanted stem on left, then two small curved strokes on right.' },
  { char: 'ち', romaji: 'chi', group: 'Baris Ta', word: 'ちず', reading: 'chizu', meaning: 'map', tip: 'Horizontal bar first, then vertical stroke sweeping out into a wide right loop.' },
  { char: 'つ', romaji: 'tsu', group: 'Baris Ta', word: 'つき', reading: 'tsuki', meaning: 'moon', tip: 'One wide, graceful arc sweeping rightward and curling back toward bottom-left.' },
  { char: 'て', romaji: 'te', group: 'Baris Ta', word: 'てがみ', reading: 'tegami', meaning: 'letter', tip: 'One stroke: horizontal right, sharp turn inward, curving smoothly down-right.' },
  { char: 'と', romaji: 'to', group: 'Baris Ta', word: 'とり', reading: 'tori', meaning: 'bird', tip: 'Short diagonal stroke down-right, then a C-curve sweeping from upper-right to bottom-right.' },
  // Na-row
  { char: 'な', romaji: 'na', group: 'Baris Na', word: 'なつ', reading: 'natsu', meaning: 'summer', tip: 'Cross on top-left, short dash on top-right, then a knotted vertical loop below.' },
  { char: 'に', romaji: 'ni', group: 'Baris Na', word: 'にほん', reading: 'nihon', meaning: 'Japan', tip: 'Slightly curved vertical on left, followed by two small horizontal strokes on right.' },
  { char: 'ぬ', romaji: 'nu', group: 'Baris Na', word: 'ぬの', reading: 'nuno', meaning: 'cloth', tip: 'Curved diagonal left, then a sweeping figure-8 loop finishing with a small knot.' },
  { char: 'ね', romaji: 'ne', group: 'Baris Na', word: 'ねこ', reading: 'neko', meaning: 'cat', tip: 'Vertical stem first, then a zig-zag wave crossing it and finishing in a small bottom knot.' },
  { char: 'の', romaji: 'no', group: 'Baris Na', word: 'のむ', reading: 'nomu', meaning: 'to drink', tip: 'One fluid spiral stroke starting near top-center, going down-left, up, and around right.' },
  // Ha-row
  { char: 'は', romaji: 'ha', group: 'Baris Ha', word: 'はな', reading: 'hana', meaning: 'flower', tip: 'Vertical stroke on left, horizontal bar on right, then vertical stem with a small loop.' },
  { char: 'ひ', romaji: 'hi', group: 'Baris Ha', word: 'ひと', reading: 'hito', meaning: 'person', tip: 'One sweeping U-shaped stroke starting high left, dipping wide, and flicking down-right.' },
  { char: 'ふ', romaji: 'fu', group: 'Baris Ha', word: 'ふゆ', reading: 'fuyu', meaning: 'winter', tip: 'Top dash, curved center hook, left dot, and right dot—four balanced strokes.' },
  { char: 'へ', romaji: 'he', group: 'Baris Ha', word: 'へや', reading: 'heya', meaning: 'room', tip: 'One mountain-ridge stroke: short rise up-right, then longer slope down-right.' },
  { char: 'ほ', romaji: 'ho', group: 'Baris Ha', word: 'ほし', reading: 'hoshi', meaning: 'star', tip: 'Left vertical, two horizontal bars on right, then vertical stem with a bottom loop.' },
  // Ma-row
  { char: 'ま', romaji: 'ma', group: 'Baris Ma', word: 'まち', reading: 'machi', meaning: 'town', tip: 'Two horizontal bars (top slightly longer), then vertical stem with a bottom loop.' },
  { char: 'み', romaji: 'mi', group: 'Baris Ma', word: 'みず', reading: 'mizu', meaning: 'water', tip: 'Continuous 2-like stroke with a bottom-left loop, crossed by a short curve on right.' },
  { char: 'む', romaji: 'mu', group: 'Baris Ma', word: 'むし', reading: 'mushi', meaning: 'insect', tip: 'Short bar, vertical stroke with a tight loop sweeping right and up, plus a top-right dot.' },
  { char: 'め', romaji: 'me', group: 'Baris Ma', word: 'めがね', reading: 'megane', meaning: 'glasses', tip: 'Similar to ぬ without the final tail knot: curved diagonal, then an open sweeping loop.' },
  { char: 'も', romaji: 'mo', group: 'Baris Ma', word: 'もり', reading: 'mori', meaning: 'forest', tip: 'Curved vertical hook first (like a fishhook), then two horizontal bars crossing it.' },
  // Ya-row
  { char: 'や', romaji: 'ya', group: 'Baris Ya', word: 'やま', reading: 'yama', meaning: 'mountain', tip: 'Sweeping arch going right and hooking back, small top dot, then slanted vertical stem.' },
  { char: 'ゆ', romaji: 'yu', group: 'Baris Ya', word: 'ゆき', reading: 'yuki', meaning: 'snow', tip: 'Vertical stem looping smoothly out to the right, then a center-right vertical tail.' },
  { char: 'よ', romaji: 'yo', group: 'Baris Ya', word: 'よる', reading: 'yoru', meaning: 'night', tip: 'Short horizontal bar on upper-right first, then vertical stem finishing in a bottom loop.' },
  // Ra-row
  { char: 'ら', romaji: 'ra', group: 'Baris Ra', word: 'らいねん', reading: 'rainen', meaning: 'next year', tip: 'Top dash, then a vertical stroke arching smoothly into a wide lower-right curve.' },
  { char: 'り', romaji: 'ri', group: 'Baris Ra', word: 'りんご', reading: 'ringo', meaning: 'apple', tip: 'Short hooked vertical on left, then a longer vertical on right curving gently left.' },
  { char: 'る', romaji: 'ru', group: 'Baris Ra', word: 'るす', reading: 'rusu', meaning: 'absence', tip: 'One continuous stroke like the number 3, curling into a small closed loop at the end.' },
  { char: 'れ', romaji: 're', group: 'Baris Ra', word: 'れきし', reading: 'rekishi', meaning: 'history', tip: 'Vertical stem first, then zig-zag across it and sweep smoothly upward to the right.' },
  { char: 'ろ', romaji: 'ro', group: 'Baris Ra', word: 'ろく', reading: 'roku', meaning: 'six', tip: 'Like る without the closing loop—clean zig-zag top into an open bottom arc.' },
  // Wa-row
  { char: 'わ', romaji: 'wa', group: 'Baris Wa', word: 'わたし', reading: 'watashi', meaning: 'I / me', tip: 'Vertical stem first, then zig-zag across it and sweep into a rounded open curve.' },
  { char: 'を', romaji: 'wo', group: 'Baris Wa', word: 'ほんをよむ', reading: 'hon o yomu', meaning: 'object particle (o)', tip: 'Horizontal bar, curved diagonal dipping right, then a wide C-curve wrapping underneath.' },
  { char: 'ん', romaji: 'n', group: 'Baris Wa', word: 'ほん', reading: 'hon', meaning: 'book', tip: 'One fluid h-like stroke: diagonal down-left, bounce up smoothly, and tail flicks up-right.' },
];

const KATAKANA_SPECS: RawKanaSpec[] = [
  // A-row
  { char: 'ア', romaji: 'a', group: 'Baris A', word: 'アイス', reading: 'aisu', meaning: 'ice cream', tip: 'Horizontal bar sweeping diagonally down-left, then a curved vertical stem.' },
  { char: 'イ', romaji: 'i', group: 'Baris A', word: 'インド', reading: 'indo', meaning: 'India', tip: 'Diagonal sweep down-left, then a crisp straight vertical stroke down.' },
  { char: 'ウ', romaji: 'u', group: 'Baris A', word: 'ウイルス', reading: 'uirusu', meaning: 'virus', tip: 'Short vertical top tick, left vertical wall, then top bar sweeping down-left.' },
  { char: 'エ', romaji: 'e', group: 'Baris A', word: 'エアコン', reading: 'eakon', meaning: 'air conditioner', tip: 'Top horizontal bar, center vertical stem, then wider bottom horizontal bar.' },
  { char: 'オ', romaji: 'o', group: 'Baris A', word: 'オレンジ', reading: 'orenji', meaning: 'orange', tip: 'Horizontal bar, vertical stroke with a small left hook, then diagonal down-left.' },
  // Ka-row
  { char: 'カ', romaji: 'ka', group: 'Baris Ka', word: 'カメラ', reading: 'kamera', meaning: 'camera', tip: 'Sharp horizontal-to-hook stroke, then diagonal stroke crossing down-left.' },
  { char: 'キ', romaji: 'ki', group: 'Baris Ka', word: 'キッチン', reading: 'kicchin', meaning: 'kitchen', tip: 'Two slightly slanted horizontal bars crossed by a slanted vertical stem.' },
  { char: 'ク', romaji: 'ku', group: 'Baris Ka', word: 'クラス', reading: 'kurasu', meaning: 'class', tip: 'Short diagonal stroke on left, then horizontal bar curving smoothly down-left.' },
  { char: 'ケ', romaji: 'ke', group: 'Baris Ka', word: 'ケーキ', reading: 'keeki', meaning: 'cake', tip: 'Short left diagonal, horizontal bar across, then curved diagonal down-left.' },
  { char: 'コ', romaji: 'ko', group: 'Baris Ka', word: 'コーヒー', reading: 'koohii', meaning: 'coffee', tip: 'Top bar turning sharply down on right, then bottom bar closing from left to right.' },
  // Sa-row
  { char: 'サ', romaji: 'sa', group: 'Baris Sa', word: 'サラダ', reading: 'sarada', meaning: 'salad', tip: 'Horizontal bar, short left vertical, then longer right vertical curving down-left.' },
  { char: 'シ', romaji: 'shi', group: 'Baris Sa', word: 'シャツ', reading: 'shatsu', meaning: 'shirt', tip: 'Two stacked dots on left, then a sweeping stroke going UP from bottom-left to top-right.' },
  { char: 'ス', romaji: 'su', group: 'Baris Sa', word: 'スポーツ', reading: 'supootsu', meaning: 'sports', tip: 'Horizontal bar sweeping down-left, then a crisp leg extending down-right.' },
  { char: 'セ', romaji: 'se', group: 'Baris Sa', word: 'セーター', reading: 'seetaa', meaning: 'sweater', tip: 'Upward-angled bar hooking down-left, then an L-shaped stroke curving right.' },
  { char: 'ソ', romaji: 'so', group: 'Baris Sa', word: 'ソファ', reading: 'sofa', meaning: 'sofa', tip: 'Short downward dot on top-left, then long stroke sweeping DOWN from top-right to bottom-left.' },
  // Ta-row
  { char: 'タ', romaji: 'ta', group: 'Baris Ta', word: 'タクシー', reading: 'takushii', meaning: 'taxi', tip: 'Like ク with a crisp short diagonal cross stroke tucked inside.' },
  { char: 'チ', romaji: 'chi', group: 'Baris Ta', word: 'チーズ', reading: 'chiizu', meaning: 'cheese', tip: 'Short top sweep down-left, horizontal bar, then vertical stroke curving down-left.' },
  { char: 'ツ', romaji: 'tsu', group: 'Baris Ta', word: 'ツアー', reading: 'tsuaa', meaning: 'tour', tip: 'Two side-by-side downward ticks at top, then a long stroke sweeping DOWN from top-right.' },
  { char: 'テ', romaji: 'te', group: 'Baris Ta', word: 'テスト', reading: 'tesuto', meaning: 'test', tip: 'Short top bar, wider middle bar, then center vertical curving down-left.' },
  { char: 'ト', romaji: 'to', group: 'Baris Ta', word: 'トマト', reading: 'tomato', meaning: 'tomato', tip: 'Clean vertical stem straight down, then a crisp diagonal branch to the right.' },
  // Na-row
  { char: 'ナ', romaji: 'na', group: 'Baris Na', word: 'ナイフ', reading: 'naifu', meaning: 'knife', tip: 'Horizontal bar first, then vertical stroke curving smoothly down-left.' },
  { char: 'ニ', romaji: 'ni', group: 'Baris Na', word: 'ニュース', reading: 'nyuusu', meaning: 'news', tip: 'Shorter top horizontal bar, then a wider bottom horizontal bar.' },
  { char: 'ヌ', romaji: 'nu', group: 'Baris Na', word: 'カヌー', reading: 'kanuu', meaning: 'canoe', tip: 'Horizontal bar sweeping down-left, then a diagonal cross stroke cutting down-right.' },
  { char: 'ネ', romaji: 'ne', group: 'Baris Na', word: 'ネクタイ', reading: 'nekutai', meaning: 'necktie', tip: 'Top tick, horizontal-to-diagonal sweep, vertical stem, and a short right leg.' },
  { char: 'ノ', romaji: 'no', group: 'Baris Na', word: 'ノート', reading: 'nooto', meaning: 'notebook', tip: 'One clean, confident diagonal sweep from upper-right to lower-left.' },
  // Ha-row
  { char: 'ハ', romaji: 'ha', group: 'Baris Ha', word: 'バス', reading: 'basu', meaning: 'bus', tip: 'Two balanced outward strokes: left sweeps down-left, right extends down-right.' },
  { char: 'ヒ', romaji: 'hi', group: 'Baris Ha', word: 'ヒント', reading: 'hinto', meaning: 'hint', tip: 'Short diagonal/horizontal stroke on right first, then L-shaped stroke curving right.' },
  { char: 'フ', romaji: 'fu', group: 'Baris Ha', word: 'フルーツ', reading: 'furuutsu', meaning: 'fruit', tip: 'One clean corner stroke: horizontal right, then smooth arc sweeping down-left.' },
  { char: 'ヘ', romaji: 'he', group: 'Baris Ha', word: 'ヘルメット', reading: 'herumetto', meaning: 'helmet', tip: 'One crisp angular peak rising briefly then sloping steadily down-right.' },
  { char: 'ホ', romaji: 'ho', group: 'Baris Ha', word: 'ホテル', reading: 'hoteru', meaning: 'hotel', tip: 'Horizontal bar, hooked vertical center stem, then balanced left and right ticks.' },
  // Ma-row
  { char: 'マ', romaji: 'ma', group: 'Baris Ma', word: 'マスク', reading: 'masuku', meaning: 'mask', tip: 'Horizontal bar sweeping sharply back down-left, then a diagonal finishing stroke.' },
  { char: 'ミ', romaji: 'mi', group: 'Baris Ma', word: 'ミルク', reading: 'miruku', meaning: 'milk', tip: 'Three parallel, gently downward-sloping horizontal strokes stacked evenly.' },
  { char: 'ム', romaji: 'mu', group: 'Baris Ma', word: 'ゲーム', reading: 'geemu', meaning: 'game', tip: 'Triangle sweep down-left then across right, anchored by a short diagonal tick on right.' },
  { char: 'メ', romaji: 'me', group: 'Baris Ma', word: 'メニュー', reading: 'menyuu', meaning: 'menu', tip: 'Long diagonal sweep down-left, crossed near center by a shorter stroke down-right.' },
  { char: 'モ', romaji: 'mo', group: 'Baris Ma', word: 'モデル', reading: 'moderu', meaning: 'model', tip: 'Two horizontal bars first, then center vertical bending cleanly to the right.' },
  // Ya-row
  { char: 'ヤ', romaji: 'ya', group: 'Baris Ya', word: 'タイヤ', reading: 'taiya', meaning: 'tire', tip: 'Slanted bar hooking sharply down-left, then a long diagonal stem down-right.' },
  { char: 'ユ', romaji: 'yu', group: 'Baris Ya', word: 'ユニフォーム', reading: 'yunifoomu', meaning: 'uniform', tip: 'Top bar turning straight down on right, then a wide baseline bar underneath.' },
  { char: 'ヨ', romaji: 'yo', group: 'Baris Ya', word: 'ヨーグルト', reading: 'yooguruto', meaning: 'yogurt', tip: 'Top-to-right corner frame, middle horizontal bar, and bottom closing bar.' },
  // Ra-row
  { char: 'ラ', romaji: 'ra', group: 'Baris Ra', word: 'ラーメン', reading: 'raamen', meaning: 'ramen', tip: 'Short top horizontal bar, then a wider bar sweeping smoothly down-left.' },
  { char: 'リ', romaji: 'ri', group: 'Baris Ra', word: 'リズム', reading: 'rizumu', meaning: 'rhythm', tip: 'Short crisp left vertical, then longer right vertical curving down-left.' },
  { char: 'ル', romaji: 'ru', group: 'Baris Ra', word: 'ルール', reading: 'ruuru', meaning: 'rule', tip: 'Left stroke curving down-left, then right vertical bending sharply up-right.' },
  { char: 'レ', romaji: 're', group: 'Baris Ra', word: 'レストラン', reading: 'resutoran', meaning: 'restaurant', tip: 'One bold stroke straight down, then flicking cleanly up and to the right.' },
  { char: 'ロ', romaji: 'ro', group: 'Baris Ra', word: 'ロボット', reading: 'robotto', meaning: 'robot', tip: 'Three-stroke crisp box: left vertical, top-and-right corner, and bottom bar.' },
  // Wa-row
  { char: 'ワ', romaji: 'wa', group: 'Baris Wa', word: 'ワイン', reading: 'wain', meaning: 'wine', tip: 'Short left vertical wall, then top bar sweeping cleanly down-left like フ.' },
  { char: 'ヲ', romaji: 'wo', group: 'Baris Wa', word: 'ヲタク', reading: 'otaku', meaning: 'particle o (katakana)', tip: 'Top bar, middle bar, then right curve sweeping smoothly down-left.' },
  { char: 'ン', romaji: 'n', group: 'Baris Wa', word: 'パン', reading: 'pan', meaning: 'bread', tip: 'Single dot at top-left, then a long upward sweep from bottom-left to top-right.' },
];

export const HIRAGANA_ENTRIES: WritingCharacterEntry[] = HIRAGANA_SPECS.map((s) => ({
  char: s.char,
  script: 'hiragana',
  groupLabel: s.group,
  primaryLabel: s.romaji,
  readingHint: `Hiragana · "${s.romaji}"`,
  meaningMnemonic: s.tip,
  example: { word: s.word, reading: s.reading, meaning: s.meaning },
}));

export const KATAKANA_ENTRIES: WritingCharacterEntry[] = KATAKANA_SPECS.map((s) => ({
  char: s.char,
  script: 'katakana',
  groupLabel: s.group,
  primaryLabel: s.romaji,
  readingHint: `Katakana · "${s.romaji}"`,
  meaningMnemonic: s.tip,
  example: { word: s.word, reading: s.reading, meaning: s.meaning },
}));

export function buildKanjiWritingEntries(
  dataset: CurriculumDataset
): WritingCharacterEntry[] {
  const kanjiItems = dataset.byType.kanji;
  // Build quick map of first vocab example per kanji character
  const exampleByKanji = new Map<string, { word: string; reading: string; meaning: string }>();
  for (const vocab of dataset.byType.vocabulary) {
    if (!vocab.readings || vocab.readings.length === 0) continue;
    for (const ch of vocab.characters) {
      if (!exampleByKanji.has(ch) && /[\u4e00-\u9faf]/.test(ch)) {
        exampleByKanji.set(ch, {
          word: vocab.characters,
          reading: vocab.readings[0],
          meaning: vocab.primaryMeaning,
        });
      }
    }
  }

  return kanjiItems.map((k) => {
    const readings: string[] = [];
    if (k.onyomi?.length) readings.push(`On: ${k.onyomi.slice(0, 2).join('・')}`);
    if (k.kunyomi?.length) readings.push(`Kun: ${k.kunyomi.slice(0, 2).join('・')}`);

    return {
      char: k.characters,
      script: 'kanji',
      groupLabel: k.jlpt ? `JLPT N${k.jlpt}` : `Level ${k.level}`,
      primaryLabel: k.primaryMeaning,
      readingHint: readings.join('  /  ') || `Level ${k.level}`,
      onyomi: k.onyomi,
      kunyomi: k.kunyomi,
      meaningMnemonic: k.meaningMnemonic,
      strokes: k.strokes,
      jlpt: k.jlpt,
      level: k.level,
      curriculumItemId: k.id,
      example: exampleByKanji.get(k.characters),
    };
  });
}

// ---------------------------------------------------------------------------
// KanjiVG Official Stroke-Path Loader (Local Core Bank + CDN On-Demand Cache)
// ---------------------------------------------------------------------------

const KVG_LS_KEY = 'kanimichi_kvg_cache_v1';
const memoryStrokeCache = new Map<string, string[]>();
let coreBankPromise: Promise<Record<string, string[]>> | null = null;
let lsCacheLoaded = false;

function hydrateLocalStorageCache() {
  if (lsCacheLoaded || typeof window === 'undefined') return;
  lsCacheLoaded = true;
  try {
    const raw = window.localStorage.getItem(KVG_LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    for (const [ch, paths] of Object.entries(parsed)) {
      if (Array.isArray(paths) && paths.length > 0) {
        memoryStrokeCache.set(ch, paths);
      }
    }
  } catch {
    // Ignore malformed cache
  }
}

function persistToLocalStorageCache(char: string, paths: string[]) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(KVG_LS_KEY);
    const parsed: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    const keys = Object.keys(parsed);
    // Keep cache bounded to ~250 extra CDN-fetched kanji to stay well under localStorage limits
    if (keys.length > 250) {
      for (const oldKey of keys.slice(0, 50)) {
        delete parsed[oldKey];
      }
    }
    parsed[char] = paths;
    window.localStorage.setItem(KVG_LS_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore quota errors
  }
}

export function loadCoreStrokeBank(): Promise<Record<string, string[]>> {
  if (coreBankPromise) return coreBankPromise;
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = `${normalizedBase}data/writing-strokes-core.json`;

  coreBankPromise = fetch(url)
    .then(async (res) => {
      if (!res.ok) return {};
      const data = (await res.json()) as Record<string, string[]>;
      for (const [ch, paths] of Object.entries(data)) {
        if (Array.isArray(paths) && paths.length > 0) {
          memoryStrokeCache.set(ch, paths);
        }
      }
      return data;
    })
    .catch(() => ({}));

  return coreBankPromise;
}

function extractKanjiVgPaths(svgText: string): string[] {
  const paths: string[] = [];
  const re = /<path\b[^>]*\bd="([^"]+)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svgText)) !== null) {
    const d = m[1].trim();
    if (d) paths.push(d);
  }
  return paths;
}

/**
 * Retrieve ordered KanjiVG SVG path strings (in 109x109 viewBox) for any
 * Hiragana, Katakana, or Kanji character.
 */
export async function getCharacterStrokePaths(char: string): Promise<string[] | null> {
  if (!char) return null;
  hydrateLocalStorageCache();

  if (memoryStrokeCache.has(char)) {
    return memoryStrokeCache.get(char)!;
  }

  // Ensure local core bank (all 92 kana + all N5 & N4 kanji) has loaded first
  await loadCoreStrokeBank();
  if (memoryStrokeCache.has(char)) {
    return memoryStrokeCache.get(char)!;
  }

  // Dynamically fetch remaining N3–N1 Kanji from official KanjiVG repository
  const codePoint = char.codePointAt(0);
  if (!codePoint) return null;
  const hex5 = codePoint.toString(16).padStart(5, '0');
  const urls = [
    `https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/${hex5}.svg`,
    `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex5}.svg`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const svgText = await res.text();
      const paths = extractKanjiVgPaths(svgText);
      if (paths.length > 0) {
        memoryStrokeCache.set(char, paths);
        persistToLocalStorageCache(char, paths);
        return paths;
      }
    } catch {
      // Try next mirror
    }
  }

  return null;
}
