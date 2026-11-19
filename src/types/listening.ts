import type { JlptLevel } from './grammar';

export type ListeningTaskType =
  | 'kadai'
  | 'point'
  | 'gaiyou'
  | 'sokuji'
  | 'tougou';

export type SpeakerRole = 'narrator' | 'female' | 'male' | 'female2' | 'male2';

export interface ListeningLine {
  speaker: string;
  role: SpeakerRole;
  /** Japanese dialogue with inline kanji[reading] furigana markup */
  jp: string;
  /** Natural English translation */
  en: string;
}

export interface ListeningKeyPhrase {
  jp: string;
  reading: string;
  en: string;
}

export interface ListeningTrack {
  id: string;
  jlpt: JlptLevel;
  taskType: ListeningTaskType;
  titleJp: string;
  titleEn: string;
  /** Brief English context describing who is speaking & where */
  situationEn: string;
  /** Opening narrator lead-in spoken before the dialogue (with furigana markup) */
  introJp: string;
  introEn: string;
  /** Dialogue or monologue lines */
  lines: ListeningLine[];
  /** Question asked after the dialogue */
  questionJp: string;
  questionEn: string;
  /** 3 choices for sokuji (quick response), 4 choices for all other types (with furigana markup) */
  choices: string[];
  /** English translations of each choice (shown after submitting) */
  choicesEn: string[];
  /** 0-based index into choices */
  answerIndex: number;
  /** Clear authentic English explanation of why the answer is right and distractors are wrong */
  explanationEn: string;
  /** Useful spoken expressions / listening traps featured in the track */
  keyPhrases: ListeningKeyPhrase[];
}

export interface ListeningProgress {
  trackId: string;
  attempts: number;
  correctAttempts: number;
  passed: boolean;
  passedFirstListen: boolean;
  lastAttemptAt: number;
}

export interface ListeningDataset {
  tracks: ListeningTrack[];
  byJlpt: Record<JlptLevel, ListeningTrack[]>;
  byId: Record<string, ListeningTrack>;
}
