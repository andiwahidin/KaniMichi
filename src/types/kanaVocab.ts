import { SrsStage } from './curriculum';
import { JlptLevel } from './grammar';

export type KanaVocabCategory =
  | 'adverb'
  | 'connector'
  | 'onomatopoeia'
  | 'katakana';

export interface KanaVocabExample {
  jp: string;
  reading: string;
  en: string;
}

export interface KanaVocabQuiz {
  sentenceBefore: string;
  sentenceAfter: string;
  en: string;
  /** 4 multiple-choice options including the target word */
  choices: string[];
}

export interface KanaVocabItem {
  id: string;
  jlpt: JlptLevel;
  order: number;
  word: string;
  reading: string;
  category: KanaVocabCategory;
  partOfSpeech: string;
  /** Primary authentic English meaning */
  primaryMeaning: string;
  /** All accepted English meanings (lowercase) */
  acceptedMeanings: string[];
  /** Nuance, register, or false-friend explanation in English */
  usageNote: string;
  example: KanaVocabExample;
  quiz: KanaVocabQuiz;
}

export interface KanaVocabProgress {
  itemId: string;
  /** 0 = not started; 1..9 = Apprentice I through Burned */
  srsStage: SrsStage;
  startedAt: number | null;
  nextReviewAt: number | null;
  burnedAt: number | null;
  correctCount: number;
  incorrectCount: number;
  lastReviewedAt: number | null;
}

export interface KanaVocabDataset {
  items: KanaVocabItem[];
  byId: Record<string, KanaVocabItem>;
  byJlpt: Record<JlptLevel, KanaVocabItem[]>;
}
