import { EXACT_PITCH_DICT, KANA_PITCH_DICT } from '../data/pitchAccentDict';
import type {
  PitchAccentSource,
  PronunciationTargetWord,
  PronunciationTip,
  PronunciationWord,
  ResolvedPitchAccent,
} from '../types/pronunciation';
import { katakanaToHiragana } from './kana';
import {
  classifyPitchPattern,
  PITCH_PATTERN_META,
  splitIntoMoras,
} from './pitchAudio';

const KANA_ROMAJI_MAP: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'wo', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  ちぇ: 'che', しぇ: 'she', じぇ: 'je',
  ゔ: 'vu', ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo',
};

const SPECIAL_NON_ACCENT_MORAS = new Set(['ー', 'っ', 'ッ', 'ん', 'ン']);

const VOICELESS_INITIAL_KANA = new Set([
  'か', 'き', 'く', 'け', 'こ', 'きゃ', 'きゅ', 'きょ',
  'さ', 'し', 'す', 'せ', 'そ', 'しゃ', 'しゅ', 'しょ',
  'た', 'ち', 'つ', 'て', 'と', 'ちゃ', 'ちゅ', 'ちょ',
  'は', 'ひ', 'ふ', 'へ', 'ほ', 'ひゃ', 'ひゅ', 'ひょ',
  'ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ', 'ぴゃ', 'ぴゅ', 'ぴょ',
]);

const DEVOICEABLE_HIGH_VOWEL_MORAS = new Set([
  'き', 'く', 'し', 'す', 'ち', 'つ', 'ひ', 'ふ', 'ぴ', 'ぷ',
  'きゅ', 'しゅ', 'ちゅ', 'ひゅ', 'ぴゅ',
]);

const R_ROW_MORAS = new Set([
  'ら', 'り', 'る', 'れ', 'ろ', 'りゃ', 'りゅ', 'りょ',
]);

/**
 * Converts Hiragana or Katakana reading into clean Hepburn Romaji with long vowel & sokuon handling.
 */
export function kanaToRomaji(rawKana: string): string {
  const hira = katakanaToHiragana(rawKana.replace(/[\s・]/g, ''));
  const moras = splitIntoMoras(hira);
  let out = '';

  for (let i = 0; i < moras.length; i++) {
    const m = moras[i];
    if (m === 'っ') {
      const next = moras[i + 1];
      const nextRom = next ? KANA_ROMAJI_MAP[next] ?? '' : '';
      if (nextRom.startsWith('ch')) {
        out += 't';
      } else if (nextRom.length > 0) {
        out += nextRom[0];
      }
      continue;
    }
    if (m === 'ー') {
      const lastChar = out[out.length - 1];
      if (lastChar === 'a') out = `${out.slice(0, -1)}ā`;
      else if (lastChar === 'i') out = `${out.slice(0, -1)}ī`;
      else if (lastChar === 'u') out = `${out.slice(0, -1)}ū`;
      else if (lastChar === 'e') out = `${out.slice(0, -1)}ē`;
      else if (lastChar === 'o') out = `${out.slice(0, -1)}ō`;
      continue;
    }
    if (m === 'ん') {
      const next = moras[i + 1];
      const nextRom = next ? KANA_ROMAJI_MAP[next] ?? '' : '';
      if (/^[aiueoy]/.test(nextRom)) {
        out += "n'";
      } else {
        out += 'n';
      }
      continue;
    }
    out += KANA_ROMAJI_MAP[m] ?? m;
  }

  return out;
}

/**
 * Determines the most natural trailing particle to demonstrate Odaka vs Heiban pitch drop.
 */
export function getNaturalPitchParticle(partOfSpeech?: string): string {
  if (!partOfSpeech) return 'が';
  const pos = partOfSpeech.toLowerCase();
  if (
    pos.includes('verb') ||
    pos.includes('い-adjective') ||
    pos.includes('adverb') ||
    pos.includes('conjunction') ||
    pos.includes('expression') ||
    pos.includes('prefix') ||
    pos.includes('suffix') ||
    pos.includes('mimetic')
  ) {
    return '';
  }
  if (pos.includes('な-adjective') || pos.includes('na-adj')) {
    return 'な';
  }
  return 'が';
}

function isKatakanaWord(text: string): boolean {
  const cleaned = text.replace(/[\s・ー]/g, '');
  return cleaned.length > 0 && /^[\u30A1-\u30FA\u30FC]+$/.test(cleaned);
}

/**
 * Standard Tokyo Japanese phonological pitch accent estimator for words
 * not explicitly listed in the curated verified dictionary.
 */
function estimateTokyoAccentNucleus(
  kanji: string,
  hiraKana: string,
  moras: string[],
  partOfSpeech?: string
): number {
  const n = moras.length;
  if (n <= 1) return 0;

  const pos = (partOfSpeech ?? '').toLowerCase();

  // 1. Katakana loanwords: Standard Tokyo -3 (antepenultimate mora) rule
  if (isKatakanaWord(kanji)) {
    if (n === 2) return 1;
    let target = Math.max(1, n - 2); // 1-indexed position 3 from end: n - 2
    while (target > 1 && SPECIAL_NON_ACCENT_MORAS.has(moras[target - 1])) {
      target -= 1;
    }
    return target;
  }

  // 2. い-Adjectives: Most accented i-adjectives drop on penultimate mora (n - 1)
  if (pos.includes('い-adjective') || (pos.includes('adjective') && hiraKana.endsWith('い'))) {
    return Math.max(1, n - 1);
  }

  // 3. Godan / Ichidan Verbs: Predominantly penultimate (n - 1) or Heiban (0)
  if (pos.includes('godan') || pos.includes('ichidan')) {
    if (n === 2) return 1;
    return n - 1;
  }

  // 4. Suru verbs & な-Adjectives: Predominantly Heiban [0]
  if (pos.includes('suru') || pos.includes('な-adjective') || pos.includes('na-adj')) {
    return 0;
  }

  // 5. Adverbs & Conjunctions
  if (pos.includes('adverb') || pos.includes('conjunction')) {
    if (n === 4 && moras[1] === 'っ' && moras[3] === 'り') return 3; // ゆっくり, しっかり pattern
    if (n === 4 && moras[0] === moras[2] && moras[1] === moras[3]) return 1; // わくわく, どきどき pattern
    return n <= 3 ? 1 : 0;
  }

  // 6. Numerals & Counters
  if (pos.includes('numeral')) {
    return n <= 2 ? 1 : 2;
  }

  // 7. Nouns (including 2-kanji Kango compounds)
  if (n === 2) {
    // 2-mora heavy syllable (e.g., かい, きん, せん) strongly favors Atamadaka [1]
    const second = moras[1];
    if (second === 'ん' || second === 'い' || second === 'う' || second === 'ー') {
      return 1;
    }
    return 0;
  }

  if (n === 3) {
    // 3-mora Kango ending in ん/い/う/く/つ often Atamadaka [1] or Heiban [0]
    if (moras[1] === 'ん' || moras[1] === 'ー' || moras[1] === 'っ') {
      return 1;
    }
    return 0;
  }

  // 4+ mora Sino-Japanese compounds are overwhelmingly Heiban [0] in Standard Tokyo
  return 0;
}

/**
 * Automatically detects concrete Japanese phonetic features inside ANY word
 * so learners get actionable mouth/rhythm tips for all 6,734 database entries.
 */
export function analyzePronunciationTips(
  kana: string,
  kanji: string,
  accentNucleus: number,
  particle: string
): PronunciationTip[] {
  const hira = katakanaToHiragana(kana.replace(/[\s・]/g, ''));
  const moras = splitIntoMoras(hira);
  const tips: PronunciationTip[] = [];

  // 1. Pitch contour summary tip
  const pattern = classifyPitchPattern(moras.length, accentNucleus);
  const meta = PITCH_PATTERN_META[pattern];
  if (pattern === 'heiban') {
    tips.push({
      id: 'pitch-guide',
      tag: 'Pitch [0]',
      title: `Pola ${meta.name}`,
      detail: particle
        ? `Mulai rendah di "${moras[0]}", naik sejak "${moras[1] ?? moras[0]}", dan tetap tinggi sampai partikel "${particle}".`
        : `Mulai rendah di "${moras[0]}", lalu naik dan mengalir datar tanpa jatuh tajam.`,
    });
  } else if (pattern === 'atamadaka') {
    tips.push({
      id: 'pitch-guide',
      tag: 'Pitch [1]',
      title: `Pola ${meta.name}`,
      detail: `Tekankan nada TINGGI di ketukan pertama "${moras[0]}", lalu langsung turunkan nada mulai "${moras[1] || particle || 'ketukan berikutnya'}".`,
    });
  } else if (pattern === 'odaka') {
    tips.push({
      id: 'pitch-guide',
      tag: `Pitch [${accentNucleus}]`,
      title: `Pola ${meta.name}`,
      detail: `Tinggi hingga mora terakhir "${moras[moras.length - 1]}", lalu jatuh tajam tepat saat masuk partikel "${particle || 'が'}".`,
    });
  } else {
    tips.push({
      id: 'pitch-guide',
      tag: `Pitch [${accentNucleus}]`,
      title: `Pola ${meta.name}`,
      detail: `Naik di "${moras[1]}", tahan tinggi sampai "${moras[accentNucleus - 1]}", lalu turunkan nada mulai "${moras[accentNucleus]}".`,
    });
  }

  // 2. Sokuon (っ / ッ) detection
  if (hira.includes('っ')) {
    const idx = moras.indexOf('っ');
    const nextMora = moras[idx + 1] ?? '';
    tips.push({
      id: 'sokuon',
      tag: 'Sokuon っ',
      title: 'Tahan jeda senyap 1 ketukan penuh',
      detail: `Ada konsonan ganda sebelum "${nextMora || 'suku berikutnya'}". Hentikan aliran udara 1 ketukan penuh (jangan langsung digabung) sebelum melepaskan bunyinya.`,
    });
  }

  // 3. Long vowel detection (ー, おう, えい, doubled vowels)
  const hasLongVowel =
    kana.includes('ー') ||
    /[おこそとのほもよろをごぞどぼぽょ]う/.test(hira) ||
    /[えけせてねへめれげぜでべぺ]い/.test(hira) ||
    /[あかさたなはまやらわがざだばぱゃ]あ/.test(hira) ||
    /[いきしちにひみりぎじぢびぴ]い/.test(hira) ||
    /[うくすつぬふむゆるぐずづぶぷゅ]う/.test(hira) ||
    /[おこそとのほもよろをごぞどぼぽょ]お/.test(hira);

  if (hasLongVowel) {
    tips.push({
      id: 'long-vowel',
      tag: 'Vokal Panjang',
      title: 'Tarik vokal panjang tepat 2 ketukan',
      detail:
        'Terdapat vokal panjang (ー / おう / えい / vokal ganda). Tahan bunyinya 2 kali lebih lama dari vokal pendek agar tidak berubah arti.',
    });
  }

  // 4. つ (tsu) affricate detection
  if (hira.includes('つ')) {
    tips.push({
      id: 'tsu-sound',
      tag: 'Bunyi つ',
      title: 'Ucapkan "tsu" tajam, bukan "su"',
      detail:
        'Tempelkan ujung lidah ke gusi atas lalu lepaskan dengan letupan kecil "ts" sebelum vokal "u" (bibir rileks, tidak terlalu monyong).',
    });
  }

  // 5. Vowel devoicing detection (い / う between voiceless consonants)
  const devoicedExamples: string[] = [];
  for (let i = 0; i < moras.length; i++) {
    const cur = moras[i];
    if (!DEVOICEABLE_HIGH_VOWEL_MORAS.has(cur)) continue;
    const next = moras[i + 1];
    if (next && VOICELESS_INITIAL_KANA.has(next)) {
      devoicedExamples.push(cur);
    } else if (!next && (cur === 'す' || cur === 'く' || cur === 'つ') && moras.length >= 2) {
      devoicedExamples.push(cur);
    }
  }
  if (devoicedExamples.length > 0) {
    const sample = Array.from(new Set(devoicedExamples)).slice(0, 2).join(' / ');
    tips.push({
      id: 'devoicing',
      tag: 'Pelemahan Vokal',
      title: `Vokal "${sample}" terdengar berbisik`,
      detail: `Dalam ucapan alami Tokyo, vokal pada "${sample}" dilemahkan (nyaris tanpa getaran pita suara), namun ketukan moranya tetap dihitung penuh.`,
    });
  }

  // 6. Flap R detection
  if (moras.some((m) => R_ROW_MORAS.has(m))) {
    tips.push({
      id: 'flap-r',
      tag: 'Bunyi R Jepang',
      title: 'Sentuhan lidah tunggal (jangan digetarkan)',
      detail:
        'Untuk deret ら・り・る・れ・ろ, ketuk langit-langit belakang gigi atas satu kali ringan (di antara L dan D lembut), tidak bergetar seperti R Indonesia.',
    });
  }

  // 7. Moraic ん detection
  if (moras.includes('ん')) {
    tips.push({
      id: 'moraic-n',
      tag: 'Mora ん',
      title: 'Hitung "ん" sebagai 1 ketukan penuh',
      detail:
        'Bunyi sengau "ん" memiliki 1 ketukan penuh (bukan sekadar ekor suku kata). Sebelum huruf p/b/m, bibir menutup lembut seperti "m".',
    });
  }

  // Keep it focused (max 3–4 most impactful tips per word)
  return tips.slice(0, 4);
}

/**
 * Resolves Standard Tokyo pitch accent + phonetic breakdown for ANY word across
 * all databases (6,584 Curriculum Vocab + 150 Kana JLPT Vocab + Minimal Pairs).
 */
export function resolvePitchAccent(
  kanji: string,
  kana: string,
  partOfSpeech?: string,
  explicitNucleus?: number,
  explicitParticle?: string
): ResolvedPitchAccent {
  const cleanKana = kana.replace(/[\s・]/g, '');
  const hiraKana = katakanaToHiragana(cleanKana);
  const moras = splitIntoMoras(cleanKana);
  const hiraMoras = splitIntoMoras(hiraKana);
  const particle =
    explicitParticle !== undefined
      ? explicitParticle
      : getNaturalPitchParticle(partOfSpeech);

  let accentNucleus: number;
  let source: PitchAccentSource = 'rule';

  if (typeof explicitNucleus === 'number') {
    accentNucleus = explicitNucleus;
    source = 'verified';
  } else {
    const exactKey = `${kanji}|${hiraKana}`;
    if (EXACT_PITCH_DICT[exactKey] !== undefined) {
      accentNucleus = EXACT_PITCH_DICT[exactKey];
      source = 'verified';
    } else if (KANA_PITCH_DICT[hiraKana] !== undefined) {
      accentNucleus = KANA_PITCH_DICT[hiraKana];
      source = 'verified';
    } else {
      accentNucleus = estimateTokyoAccentNucleus(
        kanji,
        hiraKana,
        hiraMoras,
        partOfSpeech
      );
      source = 'rule';
    }
  }

  // Clamp accent nucleus safely within valid mora range [0..moras.length]
  if (accentNucleus < 0 || accentNucleus > moras.length) {
    accentNucleus = 0;
  }

  const pattern = classifyPitchPattern(moras.length, accentNucleus);
  const romaji = kanaToRomaji(cleanKana);
  const tips = analyzePronunciationTips(cleanKana, kanji, accentNucleus, particle);

  return {
    accentNucleus,
    pattern,
    moras,
    romaji,
    particle,
    source,
    tips,
  };
}

/**
 * Converts any universal database vocabulary target into a PronunciationWord
 * for use inside Speaking Studio & Ear Training.
 */
export function toPronunciationWord(
  target: PronunciationTargetWord
): PronunciationWord {
  const resolved = resolvePitchAccent(
    target.kanji,
    target.kana,
    target.partOfSpeech,
    target.accentNucleus,
    target.particle
  );
  const primaryTip =
    resolved.tips
      .slice(0, 2)
      .map((t) => `${t.title}: ${t.detail}`)
      .join(' ') ||
    `Ucapkan ${target.kana} dalam ${resolved.moras.length} ketukan (mora) dengan pola ${PITCH_PATTERN_META[resolved.pattern].name}.`;

  return {
    id: target.id,
    kanji: target.kanji,
    kana: target.kana,
    romaji: resolved.romaji,
    meaningId: target.meaning,
    meaningEn: target.sourceLabel,
    accentNucleus: resolved.accentNucleus,
    pattern: resolved.pattern,
    particle: resolved.particle,
    exampleJp: target.exampleJp ?? `${target.kanji}${resolved.particle}`,
    exampleReading: target.exampleReading ?? `${target.kana}${resolved.particle}`,
    exampleId: target.exampleTranslation ?? target.meaning,
    speakingTip: primaryTip,
  };
}
