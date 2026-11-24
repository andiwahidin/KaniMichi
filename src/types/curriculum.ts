import type { GrammarProgress } from './grammar';
import type { KanaVocabProgress } from './kanaVocab';
import type { ReadingProgress } from './reading';
import type { ListeningProgress } from './listening';
import type { MockExamResult } from './mockExam';
import type { WritingCharProgress } from './writing';
import type { PronunciationProgress } from './pronunciation';
import type {
  ActiveLanguageScope,
  EnglishAccent,
  LangPracticeRecord,
  LangSrsProgress,
  MultiExamResult,
  StudioRubricAttempt,
} from './language';

export type ItemType = 'radical' | 'kanji' | 'vocabulary';

export type SrsStage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SrsCategory =
  | 'locked'
  | 'lesson'
  | 'apprentice'
  | 'guru'
  | 'master'
  | 'enlightened'
  | 'burned';

export type ReadingType = 'onyomi' | 'kunyomi';

export interface ContextSentence {
  jp: string;
  reading: string;
  en: string;
}

export interface CurriculumItem {
  id: string;
  type: ItemType;
  level: number;
  characters: string;
  /** Primary English meaning */
  primaryMeaning: string;
  /** All accepted English meanings */
  acceptedMeanings: string[];
  /** Kanji readings */
  onyomi?: string[];
  kunyomi?: string[];
  /** Which reading type is primarily taught/quizzed for Kanji */
  primaryReadingType?: ReadingType;
  /** Vocabulary readings (hiragana) */
  readings?: string[];
  /** Part of speech for Vocabulary */
  partOfSpeech?: string;
  /** Component radical IDs (for Kanji) or component kanji IDs (for Vocabulary) */
  componentIds?: string[];
  /** Mnemonic story for meaning (English) */
  meaningMnemonic: string;
  /** Mnemonic story for reading (English, for Kanji & Vocab) */
  readingMnemonic?: string;
  /** Stroke count (for Kanji) */
  strokes?: number;
  /** JLPT level (N5=5 .. N1=1) */
  jlpt?: number;
  /** Example context sentences (for Vocabulary) */
  contextSentences?: ContextSentence[];
}

export interface UserItemProgress {
  itemId: string;
  /** null if locked; 0 if unlocked and in lesson queue; 1..9 for SRS stages */
  srsStage: SrsStage | null;
  unlockedAt: number | null;
  startedAt: number | null;
  /** Epoch ms for next review */
  nextReviewAt: number | null;
  burnedAt: number | null;
  meaningCorrect: number;
  meaningIncorrect: number;
  readingCorrect: number;
  readingIncorrect: number;
  lastReviewedAt: number | null;
  lastIncorrectAt: number | null;
  userSynonyms: string[];
  meaningNote: string;
  readingNote: string;
}

export interface ReviewHistoryEntry {
  date: string; // YYYY-MM-DD
  reviewsCompleted: number;
  correctCount: number;
  lessonsCompleted: number;
  reviewMinutes?: number;
  studyMinutes?: number;
}

export type SrsMode = 'open' | 'fast' | 'standard';

export interface UserSettings {
  lessonBatchSize: 3 | 5 | 7;
  autoplayAudio: boolean;
  darkMode: boolean;
  vacationMode: boolean;
  vacationStartedAt: number | null;
  dailyReviewGoal: number;
  autoAdvanceDelayMs?: 0 | 1000 | 1500 | 2500;
  includeVocabListeningQuiz?: boolean;
  includeVocabPronunciationQuiz?: boolean;
  /** SRS pace & unlock policy: 'open' (default Buka Bebas), 'fast' (Cepat), 'standard' (WaniKani klasik) */
  srsMode?: SrsMode;
  /** Active language workspace scope in Leksika header */
  activeLanguage?: ActiveLanguageScope;
  /** Preferred English TTS accent for Listening & Vocab */
  englishAccent?: EnglishAccent;
  /** Show Arabic harakat (diacritics) by default in study views */
  arabicShowHarakat?: boolean;
}

export interface UserState {
  currentLevel: number;
  progress: Record<string, UserItemProgress>;
  grammarProgress?: Record<string, GrammarProgress>;
  kanaVocabProgress?: Record<string, KanaVocabProgress>;
  readingProgress?: Record<string, ReadingProgress>;
  listeningProgress?: Record<string, ListeningProgress>;
  mockExamHistory?: MockExamResult[];
  writingProgress?: Record<string, WritingCharProgress>;
  pronunciationProgress?: PronunciationProgress;
  /** Unified multi-language SRS progress for English, Arabic, and future languages */
  langSrsProgress?: Record<string, LangSrsProgress>;
  /** Unified multi-language Reading & Listening completion records */
  langPracticeProgress?: Record<string, LangPracticeRecord>;
  /** Self-assessment rubric history from Writing & Speaking Studio */
  langStudioHistory?: StudioRubricAttempt[];
  /** Official scaled mock exam results (TOEFL ITP/iBT, IELTS, TOEIC, TOAFL) */
  langMockExamHistory?: MultiExamResult[];
  history: ReviewHistoryEntry[];
  settings: UserSettings;
  streakDays: number;
  lastActiveDate: string | null;
  totalReviewsDone: number;
  levelUpNotification: number | null;
}

export type ActiveView =
  | 'dashboard'
  | 'levels'
  | 'radicals'
  | 'kanji'
  | 'vocabulary'
  | 'kana-vocab'
  | 'grammar'
  | 'reading'
  | 'listening'
  | 'writing'
  | 'pronunciation'
  | 'mock-exam'
  | 'lesson'
  | 'review'
  | 'extra-study'
  | 'lang-home'
  | 'lang-vocab'
  | 'lang-grammar'
  | 'lang-reading'
  | 'lang-listening'
  | 'lang-studio'
  | 'lang-exam'
  | 'profile'
  | 'admin';

export type ExtraStudyMode = 'recent-mistakes' | 'recently-learned' | 'burned-items';

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isSuspended: boolean;
  createdAt: string;
}

export type AnnouncementCategory = 'info' | 'update' | 'event';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  isActive: boolean;
  createdAt: string;
}

export interface CurriculumOverride {
  itemId: string;
  primaryMeaning: string | null;
  meaningMnemonic: string | null;
  readingMnemonic: string | null;
  updatedAt: string;
}

export interface AdminUserRecord extends UserProfile {
  currentLevel: number;
  streakDays: number;
  totalReviewsDone: number;
  lastActiveDate: string | null;
  srsUpdatedAt: string | null;
}
