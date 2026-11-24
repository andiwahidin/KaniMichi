import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { explainWithAi, type AiExplanationResult } from '../lib/aiTutor';

interface AiExplainButtonProps {
  language: 'ja' | 'en' | 'ar';
  contextType?: string;
  examContext?: string;
  content: string;
  choices?: string[];
  correctAnswer?: string;
  userAnswer?: string;
  existingNote?: string;
  label?: string;
  compact?: boolean;
}

export const AiExplainButton: React.FC<AiExplainButtonProps> = ({
  language,
  contextType,
  examContext,
  content,
  choices,
  correctAnswer,
  userAnswer,
  existingNote,
  label = 'Terjemahkan & Jelaskan Lebih Mudah (Tutor AI)',
  compact = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiExplanationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolvedContext = contextType ?? examContext ?? 'Materi Bahasa';

  const handleExplain = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await explainWithAi({
        language,
        contextType: resolvedContext,
        content,
        choices,
        correctAnswer,
        userAnswer,
        existingNote,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat penjelasan Tutor AI.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {!result && (
        <button
          type="button"
          onClick={() => void handleExplain()}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/30 font-semibold text-[#0284C7] dark:text-sky-300 hover:bg-sky-100/70 dark:hover:bg-sky-950/60 transition-colors disabled:opacity-60 cursor-pointer ${
            compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
          }`}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {loading ? 'Tutor AI sedang menerjemahkan & menjelaskan...' : label}
        </button>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {result && (
        <div className="p-4 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/70 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-bold text-[#0284C7] dark:text-sky-300">
              <Sparkles className="w-3.5 h-3.5" />
              Penjelasan & Terjemahan Tutor AI
            </span>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Tutup
            </button>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">
              Terjemahan Bahasa Indonesia:
            </div>
            <p className="text-slate-800 dark:text-slate-100 leading-relaxed">
              {result.translationId}
            </p>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">
              Penjelasan Mudah Dipahami:
            </div>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              {result.explanationId}
            </p>
          </div>

          {result.keyPointsId.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
              {result.keyPointsId.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          )}

          <div className="pt-1.5 border-t border-sky-200/70 dark:border-sky-900/60 text-slate-700 dark:text-slate-300">
            <span className="font-bold text-[#0284C7] dark:text-sky-300">Tips Ujian: </span>
            {result.examTipId}
          </div>
        </div>
      )}
    </div>
  );
};
