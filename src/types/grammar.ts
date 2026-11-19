import { SrsStage } from './curriculum';

export type JlptLevel = 5 | 4 | 3 | 2 | 1;

export interface GrammarExample {
  jp: string;
  reading: string;
  en: string;
}

export interface GrammarQuiz {
  sentenceBefore: string;
  sentenceAfter: string;
  en: string;
  /** Primary canonical answer (hiragana or standard kanji-kana) */
  answer: string;
  /** All accepted typed answers (hiragana + kanji variants) */
  acceptedAnswers: string[];
  /** 4 multiple-choice options (including canonical answer) */
  choices: string[];
}

export interface GrammarPoint {
  id: string;
  jlpt: JlptLevel;
  order: number;
  pattern: string;
  reading: string;
  meaning: string;
  structure: string;
  explanation: string;
  confusableWith?: string;
  examples: GrammarExample[];
  quiz: GrammarQuiz;
}

export interface GrammarProgress {
  grammarId: string;
  /** 0 = not started; 1..9 = Apprentice I through Burned */
  srsStage: SrsStage;
  startedAt: number | null;
  nextReviewAt: number | null;
  burnedAt: number | null;
  correctCount: number;
  incorrectCount: number;
  lastReviewedAt: number | null;
}

export interface GrammarDataset {
  points: GrammarPoint[];
  byId: Record<string, GrammarPoint>;
  byJlpt: Record<JlptLevel, GrammarPoint[]>;
}
