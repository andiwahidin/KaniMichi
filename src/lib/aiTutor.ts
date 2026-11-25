import { getLevelMeta, type CurriculumDataset } from '../data/curriculum';
import type {
  AiCoachingStyle,
  AiTutorProfileSettings,
  UserProfile,
  UserState,
} from '../types/curriculum';

export interface AiTutorMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
}

export interface AiLearnerContext {
  displayName?: string;
  coachingStyle?: AiCoachingStyle;
  targetGoal?: string;
  jlptStage?: string;
  weakItems?: string[];
  recentExams?: string[];
  recentStudioMemory?: string[];
  streakDays?: number;
}

export interface AiCriterionFeedback {
  criterionId: string;
  criterionName: string;
  score: number;
  commentId: string;
}

export interface AiTextCorrection {
  original: string;
  corrected: string;
  reasonId: string;
}

export interface AiWritingEvaluation {
  overallScore: number;
  maxScore: number;
  scoreLabel: string;
  summaryId: string;
  progressComparisonId?: string;
  criteriaFeedback: AiCriterionFeedback[];
  strengthsId: string[];
  improvementsId: string[];
  corrections: AiTextCorrection[];
  improvedSample: string;
  examTipsId: string;
}

export interface AiSpeakingEvaluation {
  transcript: string;
  overallScore: number;
  maxScore: number;
  scoreLabel: string;
  summaryId: string;
  progressComparisonId?: string;
  criteriaFeedback: AiCriterionFeedback[];
  pronunciationAndFluencyId: string[];
  grammarAndVocabFixes: AiTextCorrection[];
  naturalPhrasingSample: string;
  confidenceTipId: string;
}

export interface AiExplanationResult {
  translationId: string;
  explanationId: string;
  keyPointsId: string[];
  examTipId: string;
}

export const DEFAULT_AI_TUTOR_PROFILE: AiTutorProfileSettings = {
  coachingStyle: 'friendly',
  targetGoal: '',
  personalizeWithProgress: true,
};

export function resolveAiTutorProfile(
  profile?: Partial<AiTutorProfileSettings>
): AiTutorProfileSettings {
  return {
    coachingStyle: profile?.coachingStyle ?? DEFAULT_AI_TUTOR_PROFILE.coachingStyle,
    targetGoal: profile?.targetGoal ?? DEFAULT_AI_TUTOR_PROFILE.targetGoal,
    personalizeWithProgress:
      profile?.personalizeWithProgress ?? DEFAULT_AI_TUTOR_PROFILE.personalizeWithProgress,
  };
}

export function buildLearnerContext(
  state: UserState,
  dataset: CurriculumDataset | null,
  userProfile: UserProfile | null
): AiLearnerContext {
  const aiProfile = resolveAiTutorProfile(state.settings.aiTutorProfile);
  const ctx: AiLearnerContext = {
    displayName: userProfile?.displayName || undefined,
    coachingStyle: aiProfile.coachingStyle,
    targetGoal: aiProfile.targetGoal.trim() || undefined,
  };

  if (!aiProfile.personalizeWithProgress) {
    return ctx;
  }

  const levelMeta = getLevelMeta(state.currentLevel);
  ctx.jlptStage = `${levelMeta.jlpt} · Bab ${levelMeta.unitInTier}/${levelMeta.totalUnitsInTier}`;
  ctx.streakDays = state.streakDays;

  // Gather top weak SRS items in Japanese (highest mistakes or low accuracy)
  const weakList: { label: string; score: number }[] = [];
  if (dataset) {
    for (const p of Object.values(state.progress)) {
      const mistakes = p.meaningIncorrect + p.readingIncorrect;
      const total = mistakes + p.meaningCorrect + p.readingCorrect;
      if (mistakes >= 2 && total >= 2) {
        const item = dataset.byId[p.itemId];
        if (item) {
          const acc = Math.round(((total - mistakes) / total) * 100);
          weakList.push({
            label: `${item.characters} (${item.primaryMeaning}, salah ${mistakes}x, akurasi ${acc}%)`,
            score: mistakes * 100 - acc,
          });
        }
      }
    }
  }

  // Add weak English/Arabic SRS items if present
  for (const lp of Object.values(state.langSrsProgress ?? {})) {
    if (lp.incorrectCount >= 2) {
      weakList.push({
        label: `[${lp.lang.toUpperCase()} ${lp.kind}] ${lp.itemId} (salah ${lp.incorrectCount}x)`,
        score: lp.incorrectCount * 90,
      });
    }
  }

  weakList.sort((a, b) => b.score - a.score);
  if (weakList.length > 0) {
    ctx.weakItems = weakList.slice(0, 8).map((w) => w.label);
  }

  // Gather recent mock exam scores across JLPT, TOEFL, IELTS, TOEIC, TOAFL
  const recentExams: string[] = [];
  for (const m of (state.mockExamHistory ?? []).slice(0, 3)) {
    recentExams.push(
      `JLPT ${m.jlpt}: ${m.totalScore}/180 (${m.passed ? 'Lulus' : 'Perlu Latihan'})`
    );
  }
  for (const e of (state.langMockExamHistory ?? []).slice(0, 4)) {
    recentExams.push(`${e.examTrack.toUpperCase()}: ${e.scaledLabel}`);
  }
  if (recentExams.length > 0) {
    ctx.recentExams = recentExams;
  }

  // Gather personal Writing & Speaking AI Agent memory (scores + recurring mistakes)
  const studioMemory: string[] = [];
  for (const attempt of (state.langStudioHistory ?? []).slice(0, 5)) {
    const langTag = (attempt.language ?? 'en').toUpperCase();
    const skillTag = attempt.skill === 'writing' ? 'Writing' : 'Speaking';
    const improvements =
      attempt.keyImprovements && attempt.keyImprovements.length > 0
        ? ` | Fokus perbaikan: ${attempt.keyImprovements.slice(0, 2).join('; ')}`
        : '';
    studioMemory.push(
      `[${langTag} ${skillTag} · ${attempt.examTrack.toUpperCase()}] "${attempt.title}" -> ${attempt.scoreLabel}${improvements}`
    );
  }
  if (studioMemory.length > 0) {
    ctx.recentStudioMemory = studioMemory;
  }

  return ctx;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Permintaan AI gagal (HTTP ${res.status}).`);
  }
  return data;
}

export async function askAiTutor(params: {
  language: string;
  examTarget?: string;
  messages: AiTutorMessage[];
  learnerContext?: AiLearnerContext;
  evaluationContext?: string;
}): Promise<{ reply: string }> {
  return postJson<{ reply: string }>('/api/ai/tutor', params);
}

export async function evaluateWritingWithAi(params: {
  language: 'en' | 'ja' | 'ar';
  examTrack: string;
  taskTitle: string;
  promptBody: string;
  readingExcerpt?: string;
  minWords?: number;
  userEssay: string;
  rubricCriteria: { id: string; name: string; description: string }[];
  learnerContext?: AiLearnerContext;
}): Promise<AiWritingEvaluation> {
  return postJson<AiWritingEvaluation>('/api/ai/evaluate-writing', params);
}

export async function evaluateSpeakingWithAi(params: {
  language: 'en' | 'ja' | 'ar';
  examTrack: string;
  taskTitle: string;
  promptBody: string;
  audioBase64?: string;
  audioMimeType?: string;
  transcriptText?: string;
  rubricCriteria: { id: string; name: string; description: string }[];
  learnerContext?: AiLearnerContext;
}): Promise<AiSpeakingEvaluation> {
  return postJson<AiSpeakingEvaluation>('/api/ai/evaluate-speaking', params);
}

export async function explainWithAi(params: {
  language: string;
  contextType: string;
  content: string;
  choices?: string[];
  correctAnswer?: string;
  userAnswer?: string;
  existingNote?: string;
}): Promise<AiExplanationResult> {
  return postJson<AiExplanationResult>('/api/ai/explain', params);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca file rekaman audio.'));
    reader.readAsDataURL(blob);
  });
}
