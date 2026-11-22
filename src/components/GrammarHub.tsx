import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FastForward,
  Keyboard,
  ListChecks,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useIsAudioPlaying } from '../hooks/useIsAudioPlaying';
import { JLPT_LEVELS, loadGrammarDataset } from '../data/grammar';
import {
  GrammarDataset,
  GrammarPoint,
  JlptLevel,
} from '../types/grammar';
import { SrsStage } from '../types/curriculum';
import { speakJapanese, stopSpeech } from '../utils/audio';
import { katakanaToHiragana, romajiToHiragana } from '../utils/kana';
import {
  formatRelativeTime,
  getCategoryLabel,
  getSrsCategory,
  SRS_STAGE_NAMES,
} from '../utils/srs';

type HubMode = 'catalog' | 'lesson' | 'review' | 'drill';
type InputMode = 'choice' | 'type';
type StageFilter = 'all' | 'unstarted' | 'apprentice' | 'guru-plus' | 'burned';

interface QuizQueueEntry {
  point: GrammarPoint;
  hadMistake: boolean;
  shuffledChoices: string[];
}

interface SessionSummaryRow {
  point: GrammarPoint;
  correct: boolean;
  previousStage?: SrsStage;
  newStage?: SrsStage;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeGrammarAnswer(input: string): string {
  const cleaned = input.trim().replace(/[\s　・〜～]/g, '');
  return katakanaToHiragana(romajiToHiragana(cleaned, true));
}

function isTypedGrammarCorrect(rawInput: string, point: GrammarPoint): boolean {
  const rawTrimmed = rawInput.trim().replace(/[\s　]/g, '');
  if (!rawTrimmed) return false;
  const normalizedUser = normalizeGrammarAnswer(rawTrimmed);

  for (const accepted of point.quiz.acceptedAnswers) {
    const cleanAccepted = accepted.trim().replace(/[\s　]/g, '');
    if (rawTrimmed === cleanAccepted) return true;
    if (normalizedUser === normalizeGrammarAnswer(cleanAccepted)) return true;
  }
  return false;
}

export const GrammarHub: React.FC = () => {
  const {
    state,
    now,
    setActiveView,
    completeGrammarLessons,
    submitGrammarReview,
    resurrectGrammarItem,
    fastForwardTime,
  } = useApp();

  const [grammarData, setGrammarData] = useState<GrammarDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedLevel, setSelectedLevel] = useState<JlptLevel>(5);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailPoint, setDetailPoint] = useState<GrammarPoint | null>(null);

  // Active study session state
  const [mode, setMode] = useState<HubMode>('catalog');
  const [inputMode, setInputMode] = useState<InputMode>('choice');

  // Lesson Study Phase state
  const [lessonBatch, setLessonBatch] = useState<GrammarPoint[]>([]);
  const [lessonPhase, setLessonPhase] = useState<'study' | 'quiz' | 'summary'>('study');
  const [lessonIdx, setLessonIdx] = useState(0);
  const [lessonTab, setLessonTab] = useState<'usage' | 'examples'>('usage');

  // Quiz / Review / Drill queue state
  const [quizQueue, setQuizQueue] = useState<QuizQueueEntry[]>([]);
  const [typedValue, setTypedValue] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    status: 'idle' | 'correct' | 'incorrect';
    userAnswer: string;
    stageChange?: { previousStage: SrsStage; newStage: SrsStage };
  }>({ status: 'idle', userAnswer: '' });
  const [showGrammarInfo, setShowGrammarInfo] = useState(false);
  const [sessionResults, setSessionResults] = useState<SessionSummaryRow[]>([]);
  const [sessionDone, setSessionDone] = useState(false);

  const autoAdvanceDelayMs = state.settings.autoAdvanceDelayMs ?? 1500;
  const isAudioPlaying = useIsAudioPlaying();
  const inputRef = useRef<HTMLInputElement>(null);
  const advanceQueueRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    loadGrammarDataset()
      .then((data) => {
        if (active) setGrammarData(data);
      })
      .catch((err) => {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : 'Gagal memuat kurikulum Grammar.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const grammarProgress = state.grammarProgress ?? {};

  // Compute stats across all JLPT levels
  const levelStats = useMemo(() => {
    const map: Record<
      JlptLevel,
      { total: number; started: number; guruPlus: number; burned: number; due: number; unstarted: GrammarPoint[] }
    > = {
      5: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
      4: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
      3: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
      2: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
      1: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
    };

    if (!grammarData) return map;

    for (const pt of grammarData.points) {
      const bucket = map[pt.jlpt];
      bucket.total += 1;
      const p = grammarProgress[pt.id];
      if (!p || p.srsStage === 0) {
        bucket.unstarted.push(pt);
      } else {
        bucket.started += 1;
        if (p.srsStage >= 5) bucket.guruPlus += 1;
        if (p.srsStage === 9) bucket.burned += 1;
        if (
          !state.settings.vacationMode &&
          p.srsStage >= 1 &&
          p.srsStage <= 8 &&
          p.nextReviewAt !== null &&
          p.nextReviewAt <= now
        ) {
          bucket.due += 1;
        }
      }
    }

    return map;
  }, [grammarData, grammarProgress, now, state.settings.vacationMode]);

  const allDuePoints = useMemo(() => {
    if (!grammarData || state.settings.vacationMode) return [];
    return grammarData.points.filter((pt) => {
      const p = grammarProgress[pt.id];
      return (
        p &&
        p.srsStage >= 1 &&
        p.srsStage <= 8 &&
        p.nextReviewAt !== null &&
        p.nextReviewAt <= now
      );
    });
  }, [grammarData, grammarProgress, now, state.settings.vacationMode]);

  const nextGrammarReviewAt = useMemo(() => {
    let soonest: number | null = null;
    for (const p of Object.values(grammarProgress)) {
      if (p.srsStage >= 1 && p.srsStage <= 8 && p.nextReviewAt && p.nextReviewAt > now) {
        if (soonest === null || p.nextReviewAt < soonest) {
          soonest = p.nextReviewAt;
        }
      }
    }
    return soonest;
  }, [grammarProgress, now]);

  const totals = useMemo(() => {
    let started = 0;
    let guruPlus = 0;
    let burned = 0;
    for (const lvl of [5, 4, 3, 2, 1] as JlptLevel[]) {
      started += levelStats[lvl].started;
      guruPlus += levelStats[lvl].guruPlus;
      burned += levelStats[lvl].burned;
    }
    return {
      total: grammarData?.points.length ?? 150,
      started,
      guruPlus,
      burned,
      due: allDuePoints.length,
    };
  }, [levelStats, grammarData, allDuePoints.length]);

  const activeLevelMeta = useMemo(
    () => JLPT_LEVELS.find((l) => l.level === selectedLevel) ?? JLPT_LEVELS[0],
    [selectedLevel]
  );

  const filteredPoints = useMemo(() => {
    if (!grammarData) return [];
    const base = grammarData.byJlpt[selectedLevel] ?? [];
    const q = searchQuery.trim().toLowerCase();

    return base.filter((pt) => {
      const stage = grammarProgress[pt.id]?.srsStage ?? 0;
      if (stageFilter === 'unstarted' && stage !== 0) return false;
      if (stageFilter === 'apprentice' && (stage < 1 || stage > 4)) return false;
      if (stageFilter === 'guru-plus' && stage < 5) return false;
      if (stageFilter === 'burned' && stage !== 9) return false;

      if (!q) return true;
      return (
        pt.pattern.toLowerCase().includes(q) ||
        pt.reading.toLowerCase().includes(q) ||
        pt.meaning.toLowerCase().includes(q) ||
        pt.structure.toLowerCase().includes(q)
      );
    });
  }, [grammarData, selectedLevel, stageFilter, searchQuery, grammarProgress]);

  // Focus typing input when switching to typing mode or next question
  useEffect(() => {
    if (
      (mode === 'review' || mode === 'drill' || (mode === 'lesson' && lessonPhase === 'quiz')) &&
      inputMode === 'type' &&
      feedback.status === 'idle'
    ) {
      inputRef.current?.focus();
    }
  }, [mode, lessonPhase, inputMode, feedback.status, quizQueue.length]);

  const resetQuestionUi = () => {
    setTypedValue('');
    setSelectedChoice(null);
    setFeedback({ status: 'idle', userAnswer: '' });
    setShowGrammarInfo(false);
  };

  const startLessonSession = (customPoints?: GrammarPoint[]) => {
    const batchSize = state.settings.lessonBatchSize || 5;
    const batch = customPoints ?? levelStats[selectedLevel].unstarted.slice(0, batchSize);
    if (batch.length === 0) return;

    setDetailPoint(null);
    setLessonBatch(batch);
    setLessonPhase('study');
    setLessonIdx(0);
    setLessonTab('usage');
    setSessionResults([]);
    setSessionDone(false);
    resetQuestionUi();
    setMode('lesson');
  };

  const beginLessonQuiz = () => {
    const entries: QuizQueueEntry[] = shuffleArray(lessonBatch).map((pt) => ({
      point: pt,
      hadMistake: false,
      shuffledChoices: shuffleArray(pt.quiz.choices),
    }));
    setQuizQueue(entries);
    setLessonPhase('quiz');
    resetQuestionUi();
  };

  const startReviewSession = () => {
    if (allDuePoints.length === 0) return;
    const entries: QuizQueueEntry[] = shuffleArray(allDuePoints).map((pt) => ({
      point: pt,
      hadMistake: false,
      shuffledChoices: shuffleArray(pt.quiz.choices),
    }));
    setQuizQueue(entries);
    setSessionResults([]);
    setSessionDone(false);
    resetQuestionUi();
    setMode('review');
  };

  const startDrillSession = (points?: GrammarPoint[]) => {
    if (!grammarData) return;
    const pool = points ?? grammarData.byJlpt[selectedLevel] ?? [];
    if (pool.length === 0) return;
    const picked = points ? points : shuffleArray(pool).slice(0, Math.min(10, pool.length));
    const entries: QuizQueueEntry[] = picked.map((pt) => ({
      point: pt,
      hadMistake: false,
      shuffledChoices: shuffleArray(pt.quiz.choices),
    }));
    setDetailPoint(null);
    setQuizQueue(entries);
    setSessionResults([]);
    setSessionDone(false);
    resetQuestionUi();
    setMode('drill');
  };

  const exitToCatalog = () => {
    setMode('catalog');
    setSessionDone(false);
    resetQuestionUi();
  };

  const currentEntry = quizQueue[0] ?? null;

  const evaluateAnswer = (answerText: string, isChoice: boolean) => {
    if (!currentEntry || feedback.status !== 'idle') return;
    const pt = currentEntry.point;

    const correct = isChoice
      ? answerText === pt.quiz.answer
      : isTypedGrammarCorrect(answerText, pt);

    const displayUserAnswer = isChoice
      ? answerText
      : katakanaToHiragana(romajiToHiragana(answerText.trim(), true)) || answerText.trim();

    if (isChoice) {
      setSelectedChoice(answerText);
    } else {
      setTypedValue(displayUserAnswer);
    }

    if (state.settings.autoplayAudio) {
      const fullSentence = `${pt.quiz.sentenceBefore}${pt.quiz.answer}${pt.quiz.sentenceAfter}`;
      speakJapanese(fullSentence, 0.92);
    }

    if (correct) {
      let stageChange: { previousStage: SrsStage; newStage: SrsStage } | undefined;
      if (mode === 'review') {
        stageChange = submitGrammarReview(pt.id, currentEntry.hadMistake);
      }
      setFeedback({ status: 'correct', userAnswer: displayUserAnswer, stageChange });
      setSessionResults((prev) => [
        ...prev,
        {
          point: pt,
          correct: !currentEntry.hadMistake,
          previousStage: stageChange?.previousStage,
          newStage: stageChange?.newStage,
        },
      ]);
    } else {
      setFeedback({ status: 'incorrect', userAnswer: displayUserAnswer });
      setShowGrammarInfo(true);
    }
  };

  const advanceQueue = () => {
    if (!currentEntry || feedback.status === 'idle') return;
    stopSpeech();

    if (feedback.status === 'incorrect') {
      // Re-queue failed item a couple positions later so user practices it again
      const remaining = quizQueue.slice(1);
      const retryEntry: QuizQueueEntry = {
        ...currentEntry,
        hadMistake: true,
        shuffledChoices: shuffleArray(currentEntry.point.quiz.choices),
      };
      const insertAt = Math.min(remaining.length, 2);
      const nextQueue = [
        ...remaining.slice(0, insertAt),
        retryEntry,
        ...remaining.slice(insertAt),
      ];
      setQuizQueue(nextQueue);
      resetQuestionUi();
      return;
    }

    // Correct -> pop item
    const nextQueue = quizQueue.slice(1);
    setQuizQueue(nextQueue);
    resetQuestionUi();

    if (nextQueue.length === 0) {
      if (mode === 'lesson') {
        completeGrammarLessons(lessonBatch.map((p) => p.id));
        setLessonPhase('summary');
      } else {
        setSessionDone(true);
      }
    }
  };

  advanceQueueRef.current = advanceQueue;

  // Auto-advance smoothly after audio finishes + brief hold when the answer is correct
  useEffect(() => {
    const inQuiz =
      mode === 'review' ||
      mode === 'drill' ||
      (mode === 'lesson' && lessonPhase === 'quiz');
    if (
      !inQuiz ||
      feedback.status !== 'correct' ||
      showGrammarInfo ||
      isAudioPlaying ||
      autoAdvanceDelayMs <= 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      advanceQueueRef.current();
    }, autoAdvanceDelayMs);
    return () => window.clearTimeout(timer);
  }, [
    mode,
    lessonPhase,
    feedback.status,
    showGrammarInfo,
    isAudioPlaying,
    autoAdvanceDelayMs,
    currentEntry?.point.id,
  ]);

  const handleTypingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback.status !== 'idle') {
      advanceQueue();
      return;
    }
    if (!typedValue.trim()) return;
    evaluateAnswer(typedValue, false);
  };

  // Keyboard shortcut: Enter advances after feedback is shown
  useEffect(() => {
    if (feedback.status === 'idle') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        advanceQueue();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (loadError) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-rose-200 dark:border-rose-900 p-6 space-y-3">
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Gagal Memuat Kurikulum Tata Bahasa
          </h1>
          <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!grammarData) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
          <div className="font-display text-base font-bold text-slate-900 dark:text-white">
            Memuat 200 Pola Tata Bahasa JLPT N5–N1...
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Menyiapkan kalimat contoh, aturan struktur, dan bank kuis SRS.
          </p>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 1: LESSON STUDY & SUMMARY
  // =========================================================================
  if (mode === 'lesson' && lessonPhase === 'study') {
    const pt = lessonBatch[lessonIdx];
    const lvlMeta = JLPT_LEVELS.find((l) => l.level === pt.jlpt) ?? JLPT_LEVELS[0];
    const isLast = lessonIdx === lessonBatch.length - 1;

    return (
      <main className="w-full max-w-full overflow-x-clip">
        {/* Hero Header */}
        <section
          className="text-white"
          style={{ backgroundColor: lvlMeta.accent }}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <div className="flex items-center justify-between gap-3 text-xs text-white/85 mb-5">
              <button
                type="button"
                onClick={exitToCatalog}
                className="inline-flex items-center gap-1.5 hover:text-white cursor-pointer py-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali ke Katalog
              </button>
              <span className="font-mono-num">
                JLPT {lvlMeta.code} · Pola {lessonIdx + 1} / {lessonBatch.length}
              </span>
            </div>

            <div className="text-center space-y-2 py-2">
              <div className="text-xs uppercase tracking-wider text-white/80 font-semibold">
                Tata Bahasa · {lvlMeta.label}
              </div>
              <h1 className="font-jp text-3xl sm:text-5xl font-bold tracking-tight break-words">
                {pt.pattern}
              </h1>
              <div className="font-jp text-sm sm:text-base text-white/90">
                {pt.reading}
              </div>
              <p className="font-display text-lg sm:text-2xl font-bold text-white pt-1">
                {pt.meaning}
              </p>
            </div>
          </div>
        </section>

        {/* Responsive Sub-tabs */}
        <div className="bg-white dark:bg-[#161A22] border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-4xl mx-auto px-3 sm:px-6 grid grid-cols-2 sm:flex sm:justify-center sm:gap-8">
            <button
              type="button"
              onClick={() => setLessonTab('usage')}
              className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                lessonTab === 'usage'
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Rumus &amp; Penjelasan
            </button>
            <button
              type="button"
              onClick={() => setLessonTab('examples')}
              className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                lessonTab === 'examples'
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Contoh Kalimat ({pt.examples.length})
            </button>
          </div>
        </div>

        {/* Lesson Content Body */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {lessonTab === 'usage' ? (
            <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                  Rumus Pembentukan (Formation)
                </div>
                <div className="font-jp text-sm sm:text-base font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 break-words">
                  {pt.structure}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                  Penjelasan &amp; Nuansa
                </div>
                <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
                  {pt.explanation}
                </p>
              </div>

              {pt.confusableWith && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Catatan Jebakan JLPT
                    </div>
                    <p className="text-xs sm:text-sm text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                      {pt.confusableWith}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
              {pt.examples.map((ex, i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-jp text-base sm:text-lg font-semibold text-slate-900 dark:text-white leading-relaxed">
                      {ex.jp}
                    </p>
                    <button
                      type="button"
                      onClick={() => speakJapanese(ex.jp, 0.9)}
                      aria-label="Putar audio kalimat"
                      className="p-2 min-w-[40px] min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#0284C7] hover:text-[#0284C7] shrink-0 flex items-center justify-center cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="font-jp text-xs text-slate-500 dark:text-slate-400">
                    {ex.reading}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 pt-0.5">
                    {ex.en}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Batch stepper + mobile-safe 2-col navigation */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {lessonBatch.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setLessonIdx(idx);
                    setLessonTab('usage');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-jp font-semibold border transition-colors cursor-pointer ${
                    idx === lessonIdx
                      ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {idx + 1}. {item.pattern}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
              <button
                type="button"
                disabled={lessonIdx === 0}
                onClick={() => {
                  setLessonIdx((i) => Math.max(0, i - 1));
                  setLessonTab('usage');
                }}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-4 h-4" />
                Sebelumnya
              </button>

              {isLast ? (
                <button
                  type="button"
                  onClick={beginLessonQuiz}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold cursor-pointer"
                >
                  Mulai Kuis
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setLessonIdx((i) => Math.min(lessonBatch.length - 1, i + 1));
                    setLessonTab('usage');
                  }}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold cursor-pointer"
                >
                  Berikutnya
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 2: SESSION SUMMARY (Lesson / Review / Drill completed)
  // =========================================================================
  if (
    (mode === 'lesson' && lessonPhase === 'summary') ||
    ((mode === 'review' || mode === 'drill') && sessionDone)
  ) {
    const correctCount = sessionResults.filter((r) => r.correct).length;
    const totalDone = sessionResults.length || lessonBatch.length;
    const accuracy = totalDone > 0 ? Math.round((correctCount / totalDone) * 100) : 100;

    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {mode === 'lesson'
                ? 'Pelajaran Grammar Selesai!'
                : mode === 'review'
                ? 'Review Grammar SRS Selesai!'
                : 'Latihan Cepat Grammar Selesai!'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {mode === 'lesson'
                ? `${lessonBatch.length} pola baru dipromosikan ke Apprentice I (review pertama dalam 4 jam).`
                : mode === 'review'
                ? `Kamu menyelesaikan ${totalDone} pola dengan akurasi ${accuracy}%.`
                : `Mode Latih Cepat selesai (${accuracy}% benar di percobaan pertama) — jadwal SRS tetap aman.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Pola Diuji</div>
              <div className="font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
                {totalDone}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Akurasi</div>
              <div className="font-mono-num text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {accuracy}%
              </div>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={exitToCatalog}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold cursor-pointer"
            >
              Kembali ke Katalog Grammar
            </button>
            {mode === 'lesson' && levelStats[selectedLevel].unstarted.length > 0 && (
              <button
                type="button"
                onClick={() => startLessonSession()}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Lanjut Batch Berikutnya
              </button>
            )}
          </div>
        </div>

        {/* Result Breakdown */}
        {sessionResults.length > 0 && (
          <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-3">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Ringkasan Hasil
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sessionResults.map((row, i) => (
                <div
                  key={`${row.point.id}-${i}`}
                  className="py-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-jp font-bold text-sm text-slate-900 dark:text-white">
                      {row.point.pattern}{' '}
                      <span className="font-sans font-normal text-xs text-slate-500 dark:text-slate-400">
                        · N{row.point.jlpt}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {row.point.meaning}
                    </div>
                  </div>
                  <div className="text-xs font-semibold font-mono-num shrink-0">
                    {row.newStage !== undefined && row.previousStage !== undefined ? (
                      <span
                        className={
                          row.newStage >= row.previousStage
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }
                      >
                        {SRS_STAGE_NAMES[row.previousStage]} → {SRS_STAGE_NAMES[row.newStage]}
                      </span>
                    ) : (
                      <span
                        className={
                          row.correct
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }
                      >
                        {row.correct ? 'Lulus' : 'Perlu Pengulangan'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    );
  }

  // =========================================================================
  // VIEW 3: INTERACTIVE QUIZ / REVIEW / DRILL SESSION
  // =========================================================================
  if (
    (mode === 'review' || mode === 'drill' || (mode === 'lesson' && lessonPhase === 'quiz')) &&
    currentEntry
  ) {
    const pt = currentEntry.point;
    const lvlMeta = JLPT_LEVELS.find((l) => l.level === pt.jlpt) ?? JLPT_LEVELS[0];
    const remainingCount = quizQueue.length;
    const completedCount = sessionResults.length;
    const totalCount = completedCount + remainingCount;
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return (
      <main className="w-full max-w-full overflow-x-clip">
        {/* Session Banner */}
        <section
          className="text-white"
          style={{ backgroundColor: lvlMeta.accent }}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/85">
              <button
                type="button"
                onClick={exitToCatalog}
                className="inline-flex items-center gap-1.5 hover:text-white cursor-pointer py-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Keluar Sesi
              </button>
              <div className="flex items-center gap-3 font-mono-num">
                <span>
                  {mode === 'lesson'
                    ? 'Kuis Pelajaran'
                    : mode === 'review'
                    ? 'Review SRS'
                    : 'Latih Cepat (Drill)'}
                </span>
                <span aria-hidden="true">·</span>
                <span>JLPT {lvlMeta.code}</span>
                <span aria-hidden="true">·</span>
                <span>Sisa {remainingCount}</span>
              </div>
            </div>

            {/* Thin progress bar */}
            <div className="h-1.5 w-full bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Cloze Prompt Sentence */}
            <div className="py-3 text-center space-y-3">
              <div className="text-xs uppercase tracking-wider text-white/80 font-semibold">
                Lengkapi bagian kosong dengan pola tata bahasa yang tepat
              </div>

              <div className="font-jp text-xl sm:text-3xl font-bold leading-relaxed break-words px-1">
                <span>{pt.quiz.sentenceBefore}</span>
                <span
                  className={`inline-block mx-1.5 px-3 py-0.5 rounded-lg border-2 align-baseline transition-colors ${
                    feedback.status === 'correct'
                      ? 'bg-emerald-500 border-emerald-200 text-white'
                      : feedback.status === 'incorrect'
                      ? 'bg-rose-600 border-rose-200 text-white'
                      : 'bg-white/15 border-white/60 text-white min-w-[4.5rem]'
                  }`}
                >
                  {feedback.status === 'idle' ? '（ ＿＿ ）' : pt.quiz.answer}
                </span>
                <span>{pt.quiz.sentenceAfter}</span>
              </div>

              <p className="text-sm sm:text-base text-white/95 max-w-2xl mx-auto">
                {pt.quiz.en}
              </p>

              {feedback.status !== 'idle' && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      speakJapanese(
                        `${pt.quiz.sentenceBefore}${pt.quiz.answer}${pt.quiz.sentenceAfter}`,
                        0.9
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Dengarkan Kalimat Lengkap
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Answer Input Area */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          {/* Answer Mode Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Mode Menjawab:
            </span>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-0.5">
              <button
                type="button"
                onClick={() => setInputMode('choice')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  inputMode === 'choice'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                Pilihan Ganda (JLPT)
              </button>
              <button
                type="button"
                onClick={() => setInputMode('type')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  inputMode === 'type'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                Ketik IME (ひらがな)
              </button>
            </div>
          </div>

          {/* Choice Grid OR Typing Form */}
          {inputMode === 'choice' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentEntry.shuffledChoices.map((choice, idx) => {
                const isAnswer = choice === pt.quiz.answer;
                const isSelected = selectedChoice === choice;
                let btnStyle =
                  'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-[#0284C7] text-slate-900 dark:text-white';

                if (feedback.status !== 'idle') {
                  if (isAnswer) {
                    btnStyle =
                      'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200';
                  } else if (isSelected && !isAnswer) {
                    btnStyle =
                      'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200';
                  } else {
                    btnStyle =
                      'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-[#161A22]/60 text-slate-400 dark:text-slate-500';
                  }
                }

                return (
                  <button
                    key={choice}
                    type="button"
                    disabled={feedback.status !== 'idle'}
                    onClick={() => evaluateAnswer(choice, true)}
                    className={`min-h-[54px] px-4 py-3 rounded-xl border-2 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:cursor-default ${btnStyle}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono-num text-xs font-bold text-slate-400 shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-jp text-base sm:text-lg font-bold break-words">
                        {choice}
                      </span>
                    </div>
                    {feedback.status !== 'idle' && isAnswer && (
                      <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    {feedback.status !== 'idle' && isSelected && !isAnswer && (
                      <X className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <form onSubmit={handleTypingSubmit} className="space-y-3">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={typedValue}
                  disabled={feedback.status !== 'idle'}
                  onChange={(e) => setTypedValue(romajiToHiragana(e.target.value, false))}
                  placeholder="Ketik romaji (otomatis jadi ひらがな)..."
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={`w-full px-4 py-4 pr-14 rounded-xl border-2 font-jp text-lg sm:text-xl text-center focus:outline-none transition-colors ${
                    feedback.status === 'correct'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                      : feedback.status === 'incorrect'
                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-900 dark:text-white focus:border-[#0284C7]'
                  }`}
                />
                {feedback.status === 'idle' && (
                  <button
                    type="submit"
                    aria-label="Kirim jawaban"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white flex items-center justify-center cursor-pointer"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                Ketik dalam Romaji atau Kanji/Hiragana (contoh: <span className="font-jp">おかげで</span>). Tekan Enter untuk kirim.
              </p>
            </form>
          )}

          {/* Feedback Banner + Next Action */}
          {feedback.status !== 'idle' && (
            <div
              className={`relative overflow-hidden rounded-xl border p-4 sm:p-5 space-y-4 ${
                feedback.status === 'correct'
                  ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30'
                  : 'border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div
                    className={`font-display font-bold text-base ${
                      feedback.status === 'correct'
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    {feedback.status === 'correct'
                      ? !showGrammarInfo && autoAdvanceDelayMs > 0
                        ? isAudioPlaying
                          ? 'Benar! Menunggu audio selesai...'
                          : 'Benar! Lanjut otomatis...'
                        : 'Benar!'
                      : `Belum tepat — Jawaban benar: ${pt.quiz.answer}`}
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-jp font-bold">{pt.pattern}</span> — {pt.meaning}
                  </div>
                  {feedback.stageChange && (
                    <div className="text-xs font-mono-num font-semibold text-emerald-700 dark:text-emerald-400 pt-0.5">
                      SRS: {SRS_STAGE_NAMES[feedback.stageChange.previousStage]} →{' '}
                      {SRS_STAGE_NAMES[feedback.stageChange.newStage]}
                    </div>
                  )}
                  {feedback.status === 'incorrect' && (
                    <div className="text-xs text-rose-700 dark:text-rose-300 pt-0.5">
                      Pola ini akan muncul lagi sebentar lagi untuk memperkuat ingatanmu.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={advanceQueue}
                  className="min-h-[44px] px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  Lanjut
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Expandable Grammar Detail Drawer */}
              <div className="border-t border-slate-200/80 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowGrammarInfo((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
                >
                  {showGrammarInfo ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Sembunyikan Detail Pola
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Lihat Rumus &amp; Penjelasan Pola
                    </>
                  )}
                </button>

                {showGrammarInfo && (
                  <div className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161A22] rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Rumus (Formation)
                      </div>
                      <div className="font-jp font-semibold text-slate-900 dark:text-white mt-0.5">
                        {pt.structure}
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed">{pt.explanation}</p>
                    {pt.confusableWith && (
                      <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-md px-3 py-2">
                        <strong>JLPT Note:</strong> {pt.confusableWith}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {feedback.status === 'correct' &&
                !showGrammarInfo &&
                !isAudioPlaying &&
                autoAdvanceDelayMs > 0 && (
                  <div
                    key={`${pt.id}-${sessionResults.length}`}
                    className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/75 dark:bg-emerald-400/75 animate-auto-advance"
                    style={{ animationDuration: `${autoAdvanceDelayMs}ms` }}
                  />
                )}
            </div>
          )}
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 4: CATALOG & JLPT N5–N1 OVERVIEW (DEFAULT)
  // =========================================================================
  const activeStats = levelStats[selectedLevel];
  const nextBatchCount = Math.min(
    state.settings.lessonBatchSize || 5,
    activeStats.unstarted.length
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* JLPT Module Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-0.5 max-w-full overflow-x-auto no-scrollbar">
          <button
            type="button"
            className="px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 whitespace-nowrap cursor-pointer"
          >
            1. Grammar ({totals.total})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('kana-vocab')}
            className="px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            2. Kana JLPT (250)
          </button>
          <button
            type="button"
            onClick={() => setActiveView('reading')}
            className="px-3 sm:px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            3. Dokkai (100)
          </button>
          <button
            type="button"
            onClick={() => setActiveView('listening')}
            className="px-3 sm:px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            4. Chōkai (100)
          </button>
          <button
            type="button"
            onClick={() => setActiveView('mock-exam')}
            className="px-3 sm:px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            5. Mogi Shiken
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
          {totals.started} / {totals.total} Dipelajari · {totals.guruPlus} Guru+ · {totals.burned} Burned
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            Tahap 1 · Persiapan JLPT N5–N1
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Tata Bahasa JLPT (Bunpō SRS N5–N1)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            {totals.total} pola tata bahasa inti JLPT dengan penjelasan bahasa Inggris otentik, jebakan soal ujian, dan jadwal review SRS yang tersinkronisasi otomatis ke akunmu.
          </p>
        </div>
      </div>

      {/* N5 - N1 Level Selector Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
        {JLPT_LEVELS.map((lvl) => {
          const st = levelStats[lvl.level];
          const isSelected = selectedLevel === lvl.level;
          const pct = st.total > 0 ? Math.round((st.guruPlus / st.total) * 100) : 0;

          return (
            <button
              key={lvl.code}
              type="button"
              onClick={() => setSelectedLevel(lvl.level)}
              className={`min-w-0 p-3.5 sm:p-4 rounded-xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-slate-900 dark:border-white bg-white dark:bg-[#161A22] shadow-sm ring-1 ring-slate-900/10 dark:ring-white/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="font-display text-base sm:text-lg font-extrabold"
                  style={{ color: lvl.accent }}
                >
                  {lvl.code}
                </span>
                <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                  {st.started}/{st.total}
                </span>
              </div>

              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2.5">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: lvl.accent }}
                />
              </div>

              <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-mono-num">
                <span>Guru {st.guruPlus}/{st.total}</span>
                {st.due > 0 && (
                  <span className="font-bold text-[#0284C7]">Due {st.due}</span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Focal Action Row: Lessons + SRS Reviews / Quick Drill */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 items-stretch">
        {/* New Grammar Lessons Card */}
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div
                className="text-xs font-semibold"
                style={{ color: activeLevelMeta.accent }}
              >
                Pelajaran Baru · {activeLevelMeta.label}
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Pelajaran Grammar {activeLevelMeta.code}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {activeStats.unstarted.length > 0
                  ? `${activeLevelMeta.description}. Pelajari ${nextBatchCount} pola baru lalu selesaikan kuis singkat.`
                  : `Semua 20 pola inti ${activeLevelMeta.code} sudah masuk antrean SRS kamu!`}
              </p>
            </div>
            <div className="font-mono-num text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white shrink-0">
              {activeStats.unstarted.length}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Otomatis masuk Apprentice I (4 jam)
            </span>
            <button
              type="button"
              disabled={activeStats.unstarted.length === 0}
              onClick={() => startLessonSession()}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 w-full sm:w-auto shrink-0 cursor-pointer disabled:cursor-not-allowed"
              style={
                activeStats.unstarted.length > 0
                  ? { backgroundColor: activeLevelMeta.accent }
                  : undefined
              }
            >
              <BookOpen className="w-4 h-4" />
              Mulai Pelajaran ({nextBatchCount})
            </button>
          </div>
        </div>

        {/* Grammar SRS Reviews + Quick Drill Card */}
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="text-xs font-semibold text-[#0284C7]">
                Spaced Repetition · Semua Level N5–N1
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Review Grammar SRS
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {allDuePoints.length > 0
                  ? 'Uji penguasaan pola dalam kalimat rumpang bergaya JLPT (Pilihan Ganda atau Ketik IME).'
                  : nextGrammarReviewAt
                  ? `Review berikutnya tersedia ${formatRelativeTime(nextGrammarReviewAt, now)}.`
                  : 'Selesaikan Pelajaran Grammar terlebih dahulu atau coba Latih Cepat untuk level ini.'}
              </p>
            </div>
            <div className="font-mono-num text-3xl sm:text-4xl font-bold text-[#0284C7] shrink-0">
              {allDuePoints.length}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {allDuePoints.length === 0 && nextGrammarReviewAt ? (
              <button
                type="button"
                onClick={() => fastForwardTime(4)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                Majukan waktu +4 jam
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startDrillSession()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#0284C7] cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Latih Cepat 10 Soal {activeLevelMeta.code} (Drill)
              </button>
            )}

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {allDuePoints.length > 0 ? (
                <button
                  type="button"
                  onClick={startReviewSession}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold w-full sm:w-auto shrink-0 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Mulai Review ({allDuePoints.length})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startDrillSession()}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold w-full sm:w-auto shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  Mulai Latih Cepat
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Catalog Section */}
      <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Daftar Pola {activeLevelMeta.label} ({filteredPoints.length} / {activeStats.total})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Klik pola mana saja untuk melihat rumus pembentukan, jebakan JLPT, contoh audio, atau mulai SRS.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari pola, bacaan, arti Inggris..."
                className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0284C7]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stage Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'unstarted', label: 'Belum Dipelajari' },
              { id: 'apprentice', label: 'Apprentice' },
              { id: 'guru-plus', label: 'Guru+' },
              { id: 'burned', label: 'Burned' },
            ] as { id: StageFilter; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStageFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                stageFilter === f.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Grammar Cards Grid */}
        {filteredPoints.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Tidak ada pola tata bahasa yang cocok dengan filter saat ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredPoints.map((pt) => {
              const p = grammarProgress[pt.id];
              const stage = p?.srsStage ?? 0;
              const cat = getSrsCategory(stage === 0 ? 0 : stage);
              const isDue =
                !state.settings.vacationMode &&
                p &&
                p.srsStage >= 1 &&
                p.srsStage <= 8 &&
                p.nextReviewAt !== null &&
                p.nextReviewAt <= now;

              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => setDetailPoint(pt)}
                  className="min-w-0 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/40 dark:bg-slate-900/30 text-left transition-colors flex flex-col justify-between gap-2.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-jp text-lg font-bold text-slate-900 dark:text-white">
                          {pt.pattern}
                        </span>
                        <span className="font-jp text-xs text-slate-500 dark:text-slate-400">
                          {pt.reading}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5">
                        {pt.meaning}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-xs font-semibold font-mono-num ${
                          isDue
                            ? 'text-[#0284C7]'
                            : stage >= 5
                            ? 'text-[#7C3AED] dark:text-violet-400'
                            : stage >= 1
                            ? 'text-[#DB2777]'
                            : 'text-slate-400'
                        }`}
                      >
                        {isDue
                          ? 'Siap Review'
                          : stage === 0
                          ? 'Belum'
                          : getCategoryLabel(cat)}
                      </div>
                      {p && p.nextReviewAt && !isDue && (
                        <div className="text-[11px] text-slate-400 font-mono-num mt-0.5">
                          {formatRelativeTime(p.nextReviewAt, now)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs font-jp text-slate-500 dark:text-slate-400 truncate border-t border-slate-200/70 dark:border-slate-800/80 pt-2">
                    {pt.structure}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Grammar Detail Modal */}
      {detailPoint && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Detail pola ${detailPoint.pattern}`}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDetailPoint(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#161A22] rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const lvl =
                JLPT_LEVELS.find((l) => l.level === detailPoint.jlpt) ?? JLPT_LEVELS[0];
              const prog = grammarProgress[detailPoint.id];
              const stage = prog?.srsStage ?? 0;

              return (
                <>
                  {/* Modal Header */}
                  <div
                    className="p-5 sm:p-6 text-white flex items-start justify-between gap-4"
                    style={{ backgroundColor: lvl.accent }}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white/85 font-mono-num">
                        JLPT {lvl.code} · Pola #{detailPoint.order} ·{' '}
                        {stage === 0 ? 'Belum Dipelajari' : SRS_STAGE_NAMES[stage]}
                      </div>
                      <h3 className="font-jp text-2xl sm:text-3xl font-bold mt-1 break-words">
                        {detailPoint.pattern}
                      </h3>
                      <div className="font-jp text-xs sm:text-sm text-white/85 mt-0.5">
                        {detailPoint.reading}
                      </div>
                      <p className="font-display text-base sm:text-lg font-bold mt-1.5">
                        {detailPoint.meaning}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailPoint(null)}
                      aria-label="Tutup detail"
                      className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white shrink-0 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-5 sm:p-6 space-y-5">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                        Rumus Pembentukan (Formation)
                      </div>
                      <div className="font-jp text-sm sm:text-base font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 break-words">
                        {detailPoint.structure}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                        Penjelasan &amp; Nuansa
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                        {detailPoint.explanation}
                      </p>
                    </div>

                    {detailPoint.confusableWith && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                          <strong>JLPT Trap Note:</strong> {detailPoint.confusableWith}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Contoh Kalimat
                      </div>
                      {detailPoint.examples.map((ex, i) => (
                        <div
                          key={i}
                          className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-1"
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <p className="font-jp text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                              {ex.jp}
                            </p>
                            <button
                              type="button"
                              onClick={() => speakJapanese(ex.jp, 0.9)}
                              aria-label="Putar audio"
                              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0284C7] shrink-0 cursor-pointer"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="font-jp text-xs text-slate-500 dark:text-slate-400">
                            {ex.reading}
                          </p>
                          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                            {ex.en}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Modal Footer Actions */}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                        {prog && stage >= 1 ? (
                          <span>
                            Benar {prog.correctCount} · Salah {prog.incorrectCount}
                            {prog.nextReviewAt
                              ? ` · Review ${formatRelativeTime(prog.nextReviewAt, now)}`
                              : ''}
                          </span>
                        ) : (
                          <span>Belum masuk jadwal SRS</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startDrillSession([detailPoint])}
                          className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Latih Pola Ini
                        </button>

                        {stage === 0 && (
                          <button
                            type="button"
                            onClick={() => startLessonSession([detailPoint])}
                            className="min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer"
                            style={{ backgroundColor: lvl.accent }}
                          >
                            Pelajari &amp; Mulai SRS
                          </button>
                        )}

                        {stage === 9 && (
                          <button
                            type="button"
                            onClick={() => {
                              resurrectGrammarItem(detailPoint.id);
                              setDetailPoint(null);
                            }}
                            className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-xs font-semibold text-white cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Hidupkan Kembali
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </main>
  );
};
