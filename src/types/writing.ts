export type WritingScript = 'hiragana' | 'katakana' | 'kanji';

export type WritingMode = 'learn' | 'recall' | 'freehand';

export type WritingBrushStyle = 'fude' | 'pen';

export interface WritingExampleWord {
  word: string;
  reading: string;
  meaning: string;
}

export interface WritingCharacterEntry {
  /** Unique character key (e.g. 'あ', 'ア', '日') */
  char: string;
  script: WritingScript;
  /** Row/group label (e.g. 'Baris A', 'JLPT N5', 'Level 1') */
  groupLabel: string;
  /** Primary romaji (for Kana) or primary English meaning (for Kanji) */
  primaryLabel: string;
  /** Secondary reading hint (kana/romaji) */
  readingHint: string;
  onyomi?: string[];
  kunyomi?: string[];
  meaningMnemonic?: string;
  strokes?: number;
  jlpt?: number;
  level?: number;
  curriculumItemId?: string;
  example?: WritingExampleWord;
}

export interface WritingCharProgress {
  char: string;
  attempts: number;
  bestScore: number; // 0..100
  recallPassed: boolean;
  lastPracticedAt: number;
}

export interface StrokePoint {
  /** Normalized coordinate in KanjiVG 0..109 space */
  x: number;
  y: number;
  /** Pointer pressure (0..1) or velocity-derived weight */
  pressure: number;
  /** Timestamp ms */
  t: number;
}

export interface UserStroke {
  points: StrokePoint[];
  /** Optional score if evaluated against a reference stroke */
  score?: number;
}

export type StrokeFeedbackCode =
  | 'perfect'
  | 'good'
  | 'reversed'
  | 'too-short'
  | 'wrong-position'
  | 'wrong-shape';

export interface StrokeEvaluationResult {
  accepted: boolean;
  score: number; // 0..100
  code: StrokeFeedbackCode;
  message: string;
}
