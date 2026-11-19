import type { JlptLevel } from './grammar';
import type { ListeningTrack } from './listening';
import type { ReadingPassage } from './reading';

export type MockExamPartId = 'moji-goi' | 'bunpou' | 'dokkai' | 'choukai';

export interface MockExamRule {
  level: JlptLevel;
  code: string;
  passTotal: number;
  timeLimitMin: number;
  /** N5 & N4 combine Language Knowledge + Reading into 120 pts (cutoff 38); N3–N1 split into 60 + 60 (cutoff 19 each) */
  combinedLangReading: boolean;
  langReadingMin?: number;
  langMin?: number;
  readingMin?: number;
  listeningMin: number;
}

export interface MockExamChoiceQuestion {
  id: string;
  part: MockExamPartId;
  sublabel: string;
  /** Japanese prompt (supports inline kanji[reading] furigana markup) */
  promptJp: string;
  /** Optional secondary prompt or context hint (English/Japanese) */
  promptSub?: string;
  /** 3 or 4 choices (supports inline furigana markup) */
  choices: string[];
  answerIndex: number;
  /** Authentic English explanation shown in post-exam review */
  explanationEn: string;
  /** Link to parent Dokkai passage or Chōkai track when part is dokkai / choukai */
  passageId?: string;
  trackId?: string;
}

export interface MockExamPaper {
  jlpt: JlptLevel;
  createdAt: number;
  timeLimitSec: number;
  mojiGoiQuestions: MockExamChoiceQuestion[];
  bunpouQuestions: MockExamChoiceQuestion[];
  dokkaiPassages: ReadingPassage[];
  dokkaiQuestions: MockExamChoiceQuestion[];
  choukaiTracks: ListeningTrack[];
  choukaiQuestions: MockExamChoiceQuestion[];
  allQuestions: MockExamChoiceQuestion[];
}

export interface MockExamSectionScore {
  id: 'lang-reading' | 'lang' | 'reading' | 'listening';
  label: string;
  jpLabel: string;
  score: number;
  maxScore: number;
  minPass: number;
  passed: boolean;
}

export interface MockExamPartBreakdown {
  part: MockExamPartId;
  label: string;
  correct: number;
  total: number;
}

export interface MockExamResult {
  id: string;
  jlpt: JlptLevel;
  completedAt: number;
  elapsedSec: number;
  totalScore: number; // 0..180
  passThreshold: number;
  passed: boolean;
  failedByCutoff: boolean;
  sections: MockExamSectionScore[];
  parts: MockExamPartBreakdown[];
  totalCorrect: number;
  totalQuestions: number;
}
