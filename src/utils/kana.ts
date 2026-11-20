import { CurriculumItem } from '../types/curriculum';

const ROMAJI_TO_HIRAGANA: Record<string, string> = {
  // 4-char combinations
  ltsu: 'っ',
  xtsu: 'っ',
  // 3-char combinations
  sha: 'しゃ', shi: 'し', shu: 'しゅ', she: 'しぇ', sho: 'しょ',
  cha: 'ちゃ', chi: 'ち', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ',
  tsu: 'つ',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
  jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  dya: 'ぢゃ', dyu: 'ぢゅ', dyo: 'ぢょ',
  lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ',
  // 2-char combinations
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', si: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', ti: 'ち', tu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wi: 'ゐ', we: 'ゑ', wo: 'を',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  ja: 'じゃ', ju: 'じゅ', je: 'じぇ', jo: 'じょ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  nn: 'ん',
  "n'": 'ん',
  // 1-char vowels
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  '-': 'ー',
};

const DOUBLE_CONSONANTS = new Set([
  'k', 's', 't', 'h', 'm', 'r', 'g', 'z', 'd', 'b', 'p', 'c', 'f', 'j', 'w',
]);

/**
 * Real-time Romaji -> Hiragana IME conversion while typing.
 * Keeps incomplete romaji tails (like "k" or "sh" or trailing "n") untouched
 * until the next character resolves them, unless finalize=true (on submit).
 */
export function romajiToHiragana(input: string, finalize = false): string {
  const lower = input.toLowerCase();
  let result = '';
  let i = 0;

  while (i < lower.length) {
    const ch = lower[i];

    // Pass through existing Japanese characters & whitespace
    if (!/[a-z'-]/.test(ch)) {
      result += ch;
      i++;
      continue;
    }

    // Handle double consonants (e.g. "tt" -> "っt", "kk" -> "っk", "tch" -> "っち")
    if (
      i + 1 < lower.length &&
      ch === lower[i + 1] &&
      DOUBLE_CONSONANTS.has(ch)
    ) {
      result += 'っ';
      i++;
      continue;
    }
    if (lower.slice(i, i + 3) === 'tch') {
      result += 'っ';
      i++;
      continue;
    }

    // Handle nasal 'n'
    if (ch === 'n') {
      if (i + 1 < lower.length) {
        const next = lower[i + 1];
        if (next === 'n' || next === "'") {
          result += 'ん';
          i += 2;
          continue;
        }
        // If followed by consonant other than y and vowels, convert 'n' to 'ん'
        if (!'aiueoy'.includes(next) && /[a-z]/.test(next)) {
          result += 'ん';
          i++;
          continue;
        }
      } else if (finalize) {
        result += 'ん';
        i++;
        continue;
      }
    }

    // Try matching 4, 3, 2, 1 char sequences
    let matched = false;
    for (let len = 4; len >= 1; len--) {
      if (i + len <= lower.length) {
        const chunk = lower.slice(i, i + len);
        if (ROMAJI_TO_HIRAGANA[chunk]) {
          result += ROMAJI_TO_HIRAGANA[chunk];
          i += len;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      result += ch;
      i++;
    }
  }

  return result;
}

/** Normalize Katakana to Hiragana for lenient reading comparison */
export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
}

/** Check if string contains only valid Hiragana/Katakana/long-vowel marks */
export function isValidKana(str: string): boolean {
  const cleaned = str.trim();
  if (!cleaned) return false;
  return /^[\u3040-\u309f\u30a0-\u30ffー]+$/.test(cleaned);
}

/** Standard Levenshtein edit distance for gentle meaning typo tolerance */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function normalizeMeaning(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[-_.,!?/()'"]/g, ' ')
    .replace(/\s+/g, ' ');
}

export interface ValidationResult {
  status: 'correct' | 'typo-accepted' | 'shake' | 'incorrect';
  message?: string;
  finalizedInput?: string;
}

/** Validate user's meaning answer against accepted meanings + user synonyms */
export function validateMeaningAnswer(
  rawInput: string,
  item: CurriculumItem,
  userSynonyms: string[] = []
): ValidationResult {
  const normalized = normalizeMeaning(rawInput);
  if (!normalized) {
    return { status: 'shake', message: 'Masukkan jawaban arti terlebih dahulu.' };
  }

  // If user accidentally typed Japanese kana in a meaning field
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(rawInput)) {
    return {
      status: 'shake',
      message: 'Pertanyaan ini meminta ARTI (Bahasa Inggris), bukan bacaan Jepang.',
    };
  }

  const allAccepted = [
    item.primaryMeaning,
    ...item.acceptedMeanings,
    ...userSynonyms,
  ].map(normalizeMeaning);

  if (allAccepted.includes(normalized)) {
    return { status: 'correct' };
  }

  // Fuzzy match: allow distance 1 for words >= 4 chars, distance 2 for >= 8 chars
  for (const target of allAccepted) {
    const dist = levenshtein(normalized, target);
    const maxDist = target.length >= 8 ? 2 : target.length >= 4 ? 1 : 0;
    if (dist > 0 && dist <= maxDist) {
      return {
        status: 'typo-accepted',
        message: `Sedikit salah ketik, tetapi diterima (${item.primaryMeaning}).`,
      };
    }
  }

  return { status: 'incorrect' };
}

function normalizeDictionaryReading(r: string): string {
  return katakanaToHiragana(r.replace(/[\^.\-・\s]/g, '').trim());
}

/**
 * Validate user's reading answer with WaniKani-style Onyomi/Kunyomi &
 * Kanji-vs-Vocabulary non-penalizing shake detection.
 */
export function validateReadingAnswer(
  rawInput: string,
  item: CurriculumItem,
  relatedKanji?: CurriculumItem | null
): ValidationResult {
  const finalized = katakanaToHiragana(romajiToHiragana(rawInput.trim(), true));

  if (!finalized) {
    return { status: 'shake', message: 'Masukkan bacaan dalam Hiragana atau Romaji.' };
  }

  if (!isValidKana(finalized)) {
    return {
      status: 'shake',
      message: 'Gunakan huruf Hiragana/Romaji yang valid (contoh: いち atau ichi).',
      finalizedInput: finalized,
    };
  }

  if (item.type === 'vocabulary') {
    const validReadings = (item.readings ?? []).map(normalizeDictionaryReading);
    if (validReadings.includes(finalized)) {
      return { status: 'correct', finalizedInput: finalized };
    }

    // If this is a single-kanji vocabulary word and the user typed the Kanji's
    // On'yomi or another Kun'yomi reading instead of the vocabulary word reading,
    // shake cleanly WITHOUT penalty and explain the difference!
    if (relatedKanji && relatedKanji.type === 'kanji') {
      const kanjiOn = (relatedKanji.onyomi ?? []).map(normalizeDictionaryReading);
      const kanjiKun = (relatedKanji.kunyomi ?? []).map(normalizeDictionaryReading);
      if (kanjiOn.includes(finalized)) {
        return {
          status: 'shake',
          message: `「${finalized}」 adalah bacaan On'yomi Kanji 「${item.characters}」 (untuk kata majemuk), bukan bacaan Kosakata mandiri (${item.primaryMeaning}). Coba lagi tanpa penalti!`,
          finalizedInput: finalized,
        };
      }
      if (kanjiKun.includes(finalized)) {
        return {
          status: 'shake',
          message: `「${finalized}」 adalah bacaan Kun'yomi lain untuk Kanji 「${item.characters}」, bukan bacaan Kosakata "${item.primaryMeaning}". Coba lagi tanpa penalti!`,
          finalizedInput: finalized,
        };
      }
    }

    return { status: 'incorrect', finalizedInput: finalized };
  }

  if (item.type === 'kanji') {
    const onReadings = (item.onyomi ?? []).map(normalizeDictionaryReading);
    const kunReadings = (item.kunyomi ?? []).map(normalizeDictionaryReading);
    const primaryType = item.primaryReadingType ?? 'onyomi';

    const primaryList = primaryType === 'onyomi' ? onReadings : kunReadings;
    const secondaryList = primaryType === 'onyomi' ? kunReadings : onReadings;

    if (primaryList.includes(finalized)) {
      return { status: 'correct', finalizedInput: finalized };
    }

    // WaniKani signature feature: Shake without penalty if they typed the alternate reading!
    if (secondaryList.includes(finalized)) {
      const askedLabel = primaryType === 'onyomi' ? "On'yomi" : "Kun'yomi";
      const givenLabel = primaryType === 'onyomi' ? "Kun'yomi" : "On'yomi";
      return {
        status: 'shake',
        message: `「${finalized}」 adalah bacaan ${givenLabel}. Soal Kanji ini meminta bacaan ${askedLabel} — coba lagi tanpa penalti!`,
        finalizedInput: finalized,
      };
    }

    return { status: 'incorrect', finalizedInput: finalized };
  }

  return { status: 'incorrect', finalizedInput: finalized };
}
