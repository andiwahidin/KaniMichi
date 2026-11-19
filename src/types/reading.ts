import { JlptLevel } from './grammar';

export type ReadingPassageType =
  | 'notice'
  | 'email'
  | 'short'
  | 'essay'
  | 'comparison';

export interface ReadingVocabHint {
  word: string;
  reading: string;
  en: string;
}

export interface ReadingQuestion {
  id: string;
  /** Japanese question prompt using inline kanji[reading] furigana markup */
  promptJp: string;
  /** Pure English translation of the question prompt (shown on review) */
  promptEn: string;
  /** 4 choices using inline kanji[reading] furigana markup */
  choices: string[];
  /** 0-based index of the single correct choice */
  answerIndex: number;
  /** Crisp English explanation of why the answer is right */
  explanationEn: string;
}

export interface ReadingPassage {
  id: string;
  jlpt: JlptLevel;
  order: number;
  passageType: ReadingPassageType;
  titleJp: string;
  titleEn: string;
  recommendedMinutes: number;
  /** Optional subtitle/context line (e.g. "Notice posted at a community library") */
  contextEn: string;
  /** Paragraphs in Japanese using inline kanji[reading] furigana markup */
  paragraphs: string[];
  /** Optional second text for A/B comparison passages */
  paragraphsB?: string[];
  labelA?: string;
  labelB?: string;
  /** Pure English full translation (revealed after answering) */
  translationEn: string[];
  translationBEn?: string[];
  keyVocab: ReadingVocabHint[];
  questions: ReadingQuestion[];
}

export interface ReadingProgress {
  passageId: string;
  attempts: number;
  bestScore: number;
  totalQuestions: number;
  lastScore: number;
  bestTimeSec: number | null;
  completedAt: number | null;
  lastAttemptAt: number;
}

export interface ReadingDataset {
  passages: ReadingPassage[];
  byId: Record<string, ReadingPassage>;
  byJlpt: Record<JlptLevel, ReadingPassage[]>;
}
