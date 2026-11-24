export interface AiTutorMessage {
  role: 'user' | 'assistant';
  content: string;
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
