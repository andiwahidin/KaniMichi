import type { SrsStage } from './curriculum';
import type { SpeakerRole } from './listening';

export type SupportedLanguageId = 'ja' | 'en' | 'ar';
export type ActiveLanguageScope = 'all' | SupportedLanguageId;

export type ExamTrackId =
  | 'jlpt'
  | 'toefl-itp'
  | 'toefl-ibt'
  | 'ielts'
  | 'toeic'
  | 'toafl';

export type EnglishAccent = 'en-US' | 'en-GB';

export type TextDirection = 'ltr' | 'rtl';

export interface ExamTrackDefinition {
  id: ExamTrackId;
  languageId: SupportedLanguageId;
  name: string;
  shortName: string;
  scoreRangeLabel: string;
  sections: string[];
  summary: string;
  passingBenchmarks: { label: string; value: string }[];
}

export interface LanguageDefinition {
  id: string;
  name: string;
  nativeLabel: string;
  shortCode: string;
  direction: TextDirection;
  defaultTtsLocale: string;
  alternateTtsLocales: { code: string; label: string }[];
  accentHex: string;
  accentHoverHex: string;
  accentSoftClass: string;
  accentTextClass: string;
  summary: string;
  examTracks: ExamTrackDefinition[];
  hasWritingSpeakingStudio?: boolean;
  hasHarakatToggle?: boolean;
  isComingSoon?: boolean;
}

export interface LangVocabQuiz {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanationId: string;
}

export interface LangVocabItem {
  id: string;
  lang: 'en' | 'ar';
  order: number;
  term: string;
  /** Phonetic IPA (English) or Latin transliteration (Arabic) */
  phonetic: string;
  partOfSpeech: string;
  /** Exam tracks or thematic domain (e.g. 'toefl-itp', 'ielts', 'toeic', 'toafl') */
  tracks: string[];
  category: string;
  meaningId: string;
  /** Concise English definition or Arabic Fusha nuance note */
  definition: string;
  /** English collocations or Arabic derivatives/notes */
  collocations?: string[];
  /** Arabic 3-letter root (tsulatsi), e.g. ك-ت-ب */
  root?: string;
  /** Arabic plural form (jamak) */
  plural?: string;
  exampleSentence: string;
  exampleTranslationId: string;
  quiz: LangVocabQuiz;
}

export interface LangGrammarExample {
  sentence: string;
  transliteration?: string;
  translationId: string;
}

export interface LangGrammarQuiz {
  questionType: 'mcq' | 'error-id' | 'cloze';
  prompt: string;
  sentence: string;
  choices: string[];
  correctIndex: number;
  explanationId: string;
}

export interface LangGrammarItem {
  id: string;
  lang: 'en' | 'ar';
  order: number;
  title: string;
  /** Arabic grammar term or concise English structure label */
  nativeTitle?: string;
  tracks: string[];
  category: string;
  formula: string;
  explanationId: string;
  keyTip: string;
  examples: LangGrammarExample[];
  quiz: LangGrammarQuiz;
}

export interface LangReadingQuestion {
  id: string;
  questionType: 'mcq' | 'tfng' | 'inference' | 'vocab' | 'detail';
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanationId: string;
}

export interface LangReadingPassage {
  id: string;
  lang: 'en' | 'ar';
  order: number;
  title: string;
  tracks: string[];
  genre: string;
  recommendedMinutes: number;
  paragraphs: string[];
  vocabularyGlossary?: { term: string; meaningId: string }[];
  questions: LangReadingQuestion[];
}

export interface LangListeningLine {
  speaker: string;
  role: SpeakerRole;
  text: string;
  translationId: string;
  localeOverride?: string;
}

export interface LangListeningTrack {
  id: string;
  lang: 'en' | 'ar';
  order: number;
  title: string;
  tracks: string[];
  formatLabel: string;
  introText: string;
  lines: LangListeningLine[];
  questionPrompt: string;
  choices: string[];
  correctIndex: number;
  explanationId: string;
}

export interface StudioRubricLevel {
  score: number;
  label: string;
  descriptor: string;
}

export interface StudioRubricCriterion {
  id: string;
  name: string;
  description: string;
  levels: StudioRubricLevel[];
}

export interface StudioPromptItem {
  id: string;
  lang: 'en';
  order: number;
  examTrack: 'ielts' | 'toefl-ibt';
  skill: 'writing' | 'speaking';
  taskLabel: string;
  title: string;
  prepSec: number;
  durationSec: number;
  minWords?: number;
  promptBody: string;
  readingExcerpt?: string;
  audioBriefText?: string;
  bulletHints: string[];
  modelAnswer: string;
  modelScoreLabel: string;
  keyExpressions: { phrase: string; noteId: string }[];
  rubricCriteria: StudioRubricCriterion[];
}

export interface LangSrsProgress {
  itemId: string;
  lang: 'en' | 'ar';
  kind: 'vocab' | 'grammar';
  srsStage: SrsStage;
  startedAt: number;
  nextReviewAt: number | null;
  burnedAt: number | null;
  correctCount: number;
  incorrectCount: number;
  lastReviewedAt: number | null;
}

export interface LangPracticeRecord {
  itemId: string;
  lang: 'en' | 'ar';
  kind: 'reading' | 'listening';
  attempts: number;
  bestScore: number;
  totalQuestions: number;
  lastScore: number;
  bestTimeSec: number | null;
  passed: boolean;
  lastAttemptAt: number;
}

export interface StudioRubricAttempt {
  id: string;
  promptId: string;
  examTrack: 'ielts' | 'toefl-ibt';
  skill: 'writing' | 'speaking';
  title: string;
  criteriaScores: Record<string, number>;
  overallScore: number;
  maxScore: number;
  scoreLabel: string;
  wordCount?: number;
  elapsedSec: number;
  completedAt: number;
}

export interface MultiExamSectionResult {
  id: string;
  label: string;
  correct: number;
  total: number;
  scaledScore: number;
  scaledMax: number;
}

export interface MultiExamResult {
  id: string;
  lang: 'en' | 'ar';
  examTrack: Exclude<ExamTrackId, 'jlpt'>;
  examName: string;
  mode: 'quick' | 'standard';
  sections: MultiExamSectionResult[];
  totalCorrect: number;
  totalQuestions: number;
  scaledTotal: number;
  scaledLabel: string;
  benchmarkLabel: string;
  passed: boolean;
  elapsedSec: number;
  completedAt: number;
}
