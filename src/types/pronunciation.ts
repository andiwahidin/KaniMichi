export type PitchPatternType = 'heiban' | 'atamadaka' | 'nakadaka' | 'odaka';

export type PronunciationCategory =
  | 'pitch'
  | 'consonant'
  | 'length-sokuon';

export type PitchAccentSource = 'verified' | 'rule';

export interface PronunciationTip {
  id: string;
  tag: string;
  title: string;
  detail: string;
}

export interface ResolvedPitchAccent {
  accentNucleus: number;
  pattern: PitchPatternType;
  moras: string[];
  romaji: string;
  particle: string;
  source: PitchAccentSource;
  tips: PronunciationTip[];
}

export interface PronunciationTargetWord {
  id: string;
  kanji: string;
  kana: string;
  meaning: string;
  partOfSpeech?: string;
  sourceLabel: string;
  exampleJp?: string;
  exampleReading?: string;
  exampleTranslation?: string;
  accentNucleus?: number;
  particle?: string;
}

export interface PronunciationWord {
  id: string;
  kanji: string;
  kana: string;
  romaji: string;
  meaningId: string;
  meaningEn: string;
  /**
   * Standard Tokyo pitch accent nucleus (downstep position):
   * 0 = Heiban (L-H-H-H...)
   * 1 = Atamadaka (H-L-L-L...)
   * 2..n-1 = Nakadaka (L-H...H-L...)
   * n = Odaka (L-H...H + particle L)
   */
  accentNucleus: number;
  pattern: PitchPatternType;
  /** Optional particle shown to reveal Odaka vs Heiban drop (default: 'が') */
  particle?: string;
  /** Natural phrase with kanji so ja-JP TTS reads with accurate contextual pitch */
  exampleJp: string;
  exampleReading: string;
  exampleId: string;
  /** Practical Indonesian speaking tip */
  speakingTip: string;
}

export interface MinimalPair {
  id: string;
  category: PronunciationCategory;
  title: string;
  subtitle: string;
  jlpt: 5 | 4 | 3;
  focusNote: string;
  mouthTip: string;
  words: [PronunciationWord, PronunciationWord];
}

export interface SoundRuleGuide {
  id: string;
  title: string;
  japaneseName: string;
  summary: string;
  keyRule: string;
  examples: {
    kanji: string;
    kana: string;
    romaji: string;
    meaningId: string;
    accentNucleus: number;
    note: string;
  }[];
}

export interface PronunciationProgress {
  earQuizAttempts: number;
  earQuizCorrect: number;
  speakingAttempts: number;
  speakingMatched: number;
  practicedPairIds: string[];
  lastPracticedAt: number | null;
}
