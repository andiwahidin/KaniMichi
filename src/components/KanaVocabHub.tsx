import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Ear,
  FastForward,
  Keyboard,
  ListChecks,
  Mic,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useIsAudioPlaying } from '../hooks/useIsAudioPlaying';
import { JLPT_LEVELS } from '../data/grammar';
import { KANA_VOCAB_CATEGORIES, loadKanaVocabDataset } from '../data/kanaVocab';
import { JlptLevel } from '../types/grammar';
import {
  KanaVocabCategory,
  KanaVocabDataset,
  KanaVocabItem,
} from '../types/kanaVocab';
import { SrsStage } from '../types/curriculum';
import { speakJapanese, stopSpeech } from '../utils/audio';
import { katakanaToHiragana, levenshtein, romajiToHiragana } from '../utils/kana';
import {
  formatRelativeTime,
  getCategoryLabel,
  getSrsCategory,
  getSrsPolicy,
  resolveSrsMode,
  SRS_STAGE_NAMES,
} from '../utils/srs';
import { PronunciationCard } from './PronunciationCard';
import { VocabPronunciationQuizPanel } from './VocabPronunciationQuizPanel';

type HubMode = 'catalog' | 'lesson' | 'review' | 'drill';
type KanaQuestionKind = 'context' | 'meaning' | 'listening' | 'pronunciation';
type QuizMode = 'mixed' | KanaQuestionKind;
type StageFilter = 'all' | 'unstarted' | 'apprentice' | 'guru-plus' | 'burned';

interface QuizQueueEntry {
  item: KanaVocabItem;
  kind: KanaQuestionKind;
  hadMistake: boolean;
  shuffledChoices: string[];
}

interface ItemTracker {
  remaining: number;
  hadMistake: boolean;
}

interface SessionSummaryRow {
  item: KanaVocabItem;
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

function normalizeEnglish(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[-_.,!?/()'"]/g, ' ')
    .replace(/\s+/g, ' ');
}

function checkEnglishMeaning(
  rawInput: string,
  item: KanaVocabItem
): { status: 'correct' | 'typo-accepted' | 'incorrect' } {
  const normalized = normalizeEnglish(rawInput);
  if (!normalized) return { status: 'incorrect' };

  const allAccepted = [
    item.primaryMeaning,
    ...item.primaryMeaning.split(';'),
    ...item.acceptedMeanings,
  ]
    .map(normalizeEnglish)
    .filter(Boolean);

  if (allAccepted.includes(normalized)) {
    return { status: 'correct' };
  }

  for (const target of allAccepted) {
    const dist = levenshtein(normalized, target);
    const maxDist = target.length >= 8 ? 2 : target.length >= 4 ? 1 : 0;
    if (dist > 0 && dist <= maxDist) {
      return { status: 'typo-accepted' };
    }
  }

  return { status: 'incorrect' };
}

export const KanaVocabHub: React.FC = () => {
  const {
    state,
    now,
    setActiveView,
    completeKanaVocabLessons,
    submitKanaVocabReview,
    resurrectKanaVocabItem,
    fastForwardTime,
    openPronunciationPractice,
    recordPronunciationAttempt,
  } = useApp();

  const srsPolicy = getSrsPolicy(resolveSrsMode(state.settings));

  const [data, setData] = useState<KanaVocabDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedLevel, setSelectedLevel] = useState<JlptLevel>(5);
  const [categoryFilter, setCategoryFilter] = useState<'all' | KanaVocabCategory>('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailItem, setDetailItem] = useState<KanaVocabItem | null>(null);

  // Study session state
  const [mode, setMode] = useState<HubMode>('catalog');
  const [quizMode, setQuizMode] = useState<QuizMode>('mixed');

  // Lesson Study phase
  const [lessonBatch, setLessonBatch] = useState<KanaVocabItem[]>([]);
  const [lessonPhase, setLessonPhase] = useState<'study' | 'quiz' | 'summary'>('study');
  const [lessonIdx, setLessonIdx] = useState(0);

  // Quiz / Review / Drill queue
  const [quizQueue, setQuizQueue] = useState<QuizQueueEntry[]>([]);
  const [itemTrackers, setItemTrackers] = useState<Record<string, ItemTracker>>({});
  const [sessionTotalQuestions, setSessionTotalQuestions] = useState(0);
  const [completedQuestions, setCompletedQuestions] = useState(0);
  const [typedValue, setTypedValue] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    status: 'idle' | 'correct' | 'typo-accepted' | 'incorrect';
    userAnswer: string;
    detailMessage?: string;
    stageChange?: { previousStage: SrsStage; newStage: SrsStage };
  }>({ status: 'idle', userAnswer: '' });
  const [showNoteDrawer, setShowNoteDrawer] = useState(false);
  const [sessionResults, setSessionResults] = useState<SessionSummaryRow[]>([]);
  const [sessionDone, setSessionDone] = useState(false);

  const includeListening = state.settings.includeVocabListeningQuiz !== false;
  const includePronunciation = state.settings.includeVocabPronunciationQuiz !== false;
  const autoAdvanceDelayMs = state.settings.autoAdvanceDelayMs ?? 1500;
  const isAudioPlaying = useIsAudioPlaying();
  const inputRef = useRef<HTMLInputElement>(null);
  const advanceQueueRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    loadKanaVocabDataset()
      .then((ds) => {
        if (active) setData(ds);
      })
      .catch((err) => {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : 'Gagal memuat kosakata Non-Kanji.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const progressMap = state.kanaVocabProgress ?? {};

  const levelStats = useMemo(() => {
    const map: Record<
      JlptLevel,
      {
        total: number;
        started: number;
        guruPlus: number;
        burned: number;
        due: number;
        unstarted: KanaVocabItem[];
      }
    > = {
      5: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
      4: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
      3: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
      2: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
      1: { total: 0, started: 0, guruPlus: 0, burned: 0, due: 0, unstarted: [] },
    };

    if (!data) return map;

    for (const item of data.items) {
      const b = map[item.jlpt];
      b.total += 1;
      const p = progressMap[item.id];
      if (!p || p.srsStage === 0) {
        b.unstarted.push(item);
      } else {
        b.started += 1;
        if (p.srsStage >= 5) b.guruPlus += 1;
        if (p.srsStage === 9) b.burned += 1;
        if (
          !state.settings.vacationMode &&
          p.srsStage >= 1 &&
          p.srsStage <= 8 &&
          p.nextReviewAt !== null &&
          p.nextReviewAt <= now
        ) {
          b.due += 1;
        }
      }
    }
    return map;
  }, [data, progressMap, now, state.settings.vacationMode]);

  const allDueItems = useMemo(() => {
    if (!data || state.settings.vacationMode) return [];
    return data.items.filter((item) => {
      const p = progressMap[item.id];
      return (
        p &&
        p.srsStage >= 1 &&
        p.srsStage <= 8 &&
        p.nextReviewAt !== null &&
        p.nextReviewAt <= now
      );
    });
  }, [data, progressMap, now, state.settings.vacationMode]);

  const nextReviewAt = useMemo(() => {
    let soonest: number | null = null;
    for (const p of Object.values(progressMap)) {
      if (p.srsStage >= 1 && p.srsStage <= 8 && p.nextReviewAt && p.nextReviewAt > now) {
        if (soonest === null || p.nextReviewAt < soonest) {
          soonest = p.nextReviewAt;
        }
      }
    }
    return soonest;
  }, [progressMap, now]);

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
      total: data?.items.length ?? 200,
      started,
      guruPlus,
      burned,
      due: allDueItems.length,
    };
  }, [levelStats, data, allDueItems.length]);

  const activeLevelMeta = useMemo(
    () => JLPT_LEVELS.find((l) => l.level === selectedLevel) ?? JLPT_LEVELS[0],
    [selectedLevel]
  );

  const filteredItems = useMemo(() => {
    if (!data) return [];
    const base = data.byJlpt[selectedLevel] ?? [];
    const q = searchQuery.trim().toLowerCase();

    return base.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;

      const stage = progressMap[item.id]?.srsStage ?? 0;
      if (stageFilter === 'unstarted' && stage !== 0) return false;
      if (stageFilter === 'apprentice' && (stage < 1 || stage > 4)) return false;
      if (stageFilter === 'guru-plus' && stage < 5) return false;
      if (stageFilter === 'burned' && stage !== 9) return false;

      if (!q) return true;
      return (
        item.word.toLowerCase().includes(q) ||
        item.reading.toLowerCase().includes(q) ||
        item.primaryMeaning.toLowerCase().includes(q) ||
        item.acceptedMeanings.some((m) => m.includes(q))
      );
    });
  }, [data, selectedLevel, categoryFilter, stageFilter, searchQuery, progressMap]);

  const currentEntry = quizQueue[0] ?? null;
  const activeQuestionKind: KanaQuestionKind =
    quizMode === 'mixed' ? (currentEntry?.kind ?? 'context') : quizMode;

  const isInActiveQuiz =
    (mode === 'review' || mode === 'drill' || (mode === 'lesson' && lessonPhase === 'quiz')) &&
    Boolean(currentEntry);

  useEffect(() => {
    if (
      isInActiveQuiz &&
      (activeQuestionKind === 'meaning' || activeQuestionKind === 'listening') &&
      feedback.status === 'idle'
    ) {
      inputRef.current?.focus();
    }
  }, [isInActiveQuiz, activeQuestionKind, feedback.status, quizQueue.length, completedQuestions]);

  // Auto-play audio when a listening dictation question appears
  useEffect(() => {
    if (!isInActiveQuiz || !currentEntry || activeQuestionKind !== 'listening' || feedback.status !== 'idle') {
      return;
    }
    const timer = window.setTimeout(() => {
      speakJapanese(currentEntry.item.word, 0.9);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isInActiveQuiz, currentEntry?.item.id, activeQuestionKind, feedback.status, completedQuestions, quizQueue.length]);

  const resetQuestionUi = () => {
    setTypedValue('');
    setSelectedChoice(null);
    setFeedback({ status: 'idle', userAnswer: '' });
    setShowNoteDrawer(false);
  };

  const buildQuizSession = (items: KanaVocabItem[], format: QuizMode) => {
    const entries: QuizQueueEntry[] = [];
    const trackers: Record<string, ItemTracker> = {};

    const orderedItems = shuffleArray(items);
    for (const item of orderedItems) {
      const kinds: KanaQuestionKind[] =
        format === 'mixed'
          ? [
              'context',
              ...(includeListening ? (['listening'] as KanaQuestionKind[]) : []),
              ...(includePronunciation ? (['pronunciation'] as KanaQuestionKind[]) : []),
            ]
          : [format];

      trackers[item.id] = { remaining: kinds.length, hadMistake: false };
      for (const kind of kinds) {
        entries.push({
          item,
          kind,
          hadMistake: false,
          shuffledChoices: shuffleArray(item.quiz.choices),
        });
      }
    }

    // Shuffle entries and gently avoid back-to-back identical item IDs when possible
    const shuffled = shuffleArray(entries);
    for (let i = 1; i < shuffled.length; i++) {
      if (shuffled[i].item.id === shuffled[i - 1].item.id) {
        const swapIdx = shuffled.findIndex(
          (e, idx) =>
            idx > i &&
            e.item.id !== shuffled[i - 1].item.id &&
            e.item.id !== shuffled[i].item.id
        );
        if (swapIdx !== -1) {
          [shuffled[i], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[i]];
        }
      }
    }

    return { entries: shuffled, trackers };
  };

  const startLessonSession = (customItems?: KanaVocabItem[]) => {
    const batchSize = state.settings.lessonBatchSize || 5;
    const pool =
      customItems ??
      levelStats[selectedLevel].unstarted
        .filter((it) => categoryFilter === 'all' || it.category === categoryFilter)
        .slice(0, batchSize);
    const batch = pool.length > 0 ? pool : levelStats[selectedLevel].unstarted.slice(0, batchSize);
    if (batch.length === 0) return;

    setDetailItem(null);
    setLessonBatch(batch);
    setLessonPhase('study');
    setLessonIdx(0);
    setSessionResults([]);
    setSessionDone(false);
    resetQuestionUi();
    setMode('lesson');
  };

  const beginLessonQuiz = () => {
    const { entries, trackers } = buildQuizSession(lessonBatch, quizMode);
    setQuizQueue(entries);
    setItemTrackers(trackers);
    setSessionTotalQuestions(entries.length);
    setCompletedQuestions(0);
    setLessonPhase('quiz');
    resetQuestionUi();
  };

  const startReviewSession = () => {
    if (allDueItems.length === 0) return;
    const { entries, trackers } = buildQuizSession(allDueItems, quizMode);
    setQuizQueue(entries);
    setItemTrackers(trackers);
    setSessionTotalQuestions(entries.length);
    setCompletedQuestions(0);
    setSessionResults([]);
    setSessionDone(false);
    resetQuestionUi();
    setMode('review');
  };

  const startDrillSession = (items?: KanaVocabItem[]) => {
    if (!data) return;
    const levelPool = (data.byJlpt[selectedLevel] ?? []).filter(
      (it) => categoryFilter === 'all' || it.category === categoryFilter
    );
    const pool = items ?? (levelPool.length > 0 ? levelPool : data.byJlpt[selectedLevel] ?? []);
    if (pool.length === 0) return;

    const picked = items ? items : shuffleArray(pool).slice(0, Math.min(10, pool.length));
    const { entries, trackers } = buildQuizSession(picked, quizMode);
    setDetailItem(null);
    setQuizQueue(entries);
    setItemTrackers(trackers);
    setSessionTotalQuestions(entries.length);
    setCompletedQuestions(0);
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

  const finalizeQuestionAttempt = (
    isSuccess: boolean,
    resultStatus: 'correct' | 'typo-accepted' | 'incorrect',
    userAnswer: string,
    detailMessage?: string
  ) => {
    if (!currentEntry || feedback.status !== 'idle') return;
    const item = currentEntry.item;
    const tracker = itemTrackers[item.id] ?? { remaining: 1, hadMistake: currentEntry.hadMistake };

    if (isSuccess) {
      const nextRemaining = Math.max(0, tracker.remaining - 1);
      const everHadMistake = tracker.hadMistake || currentEntry.hadMistake;
      setItemTrackers((prev) => ({
        ...prev,
        [item.id]: { remaining: nextRemaining, hadMistake: everHadMistake },
      }));
      setCompletedQuestions((c) => c + 1);

      let stageChange: { previousStage: SrsStage; newStage: SrsStage } | undefined;
      if (nextRemaining === 0) {
        if (mode === 'review') {
          stageChange = submitKanaVocabReview(item.id, everHadMistake);
        }
        setSessionResults((prev) => [
          ...prev,
          {
            item,
            correct: !everHadMistake,
            previousStage: stageChange?.previousStage,
            newStage: stageChange?.newStage,
          },
        ]);
      }

      setFeedback({ status: resultStatus, userAnswer, detailMessage, stageChange });
    } else {
      setItemTrackers((prev) => ({
        ...prev,
        [item.id]: { ...tracker, hadMistake: true },
      }));
      setFeedback({ status: 'incorrect', userAnswer, detailMessage });
      setShowNoteDrawer(true);
    }
  };

  const evaluateAnswer = (answerText: string, kind: KanaQuestionKind) => {
    if (!currentEntry || feedback.status !== 'idle') return;
    const item = currentEntry.item;

    let resultStatus: 'correct' | 'typo-accepted' | 'incorrect' = 'incorrect';
    let detailMessage: string | undefined;

    if (kind === 'context') {
      setSelectedChoice(answerText);
      resultStatus = answerText === item.word ? 'correct' : 'incorrect';
    } else if (kind === 'meaning') {
      resultStatus = checkEnglishMeaning(answerText, item).status;
    } else if (kind === 'listening') {
      const rawTrim = answerText.trim();
      const finalized = romajiToHiragana(rawTrim, true);
      const normalizedInput = katakanaToHiragana(finalized).replace(/\s+/g, '');
      const validTargets = Array.from(
        new Set([
          katakanaToHiragana(item.reading).replace(/\s+/g, ''),
          katakanaToHiragana(item.word).replace(/\s+/g, ''),
        ])
      );
      const isMatch =
        rawTrim === item.word ||
        rawTrim === item.reading ||
        validTargets.includes(normalizedInput);
      resultStatus = isMatch ? 'correct' : 'incorrect';
      recordPronunciationAttempt('ear', isMatch, item.id);
      if (isMatch) {
        detailMessage = `Tepat! Audio yang terdengar: ${item.word} (${item.reading}).`;
      } else {
        detailMessage = `Kamu menulis "${finalized || rawTrim}". Jawaban tepat: ${item.word} (${item.reading}).`;
      }
    }

    const isSuccess = resultStatus === 'correct' || resultStatus === 'typo-accepted';

    if (state.settings.autoplayAudio && kind !== 'listening') {
      const audioText =
        kind === 'context'
          ? `${item.quiz.sentenceBefore}${item.word}${item.quiz.sentenceAfter}`
          : item.word;
      speakJapanese(audioText, 0.92);
    }

    finalizeQuestionAttempt(isSuccess, resultStatus, answerText, detailMessage);
  };

  const handlePronunciationResult = (isCorrect: boolean, detail: string) => {
    if (!currentEntry || feedback.status !== 'idle') return;
    recordPronunciationAttempt('speak', isCorrect, currentEntry.item.id);
    finalizeQuestionAttempt(
      isCorrect,
      isCorrect ? 'correct' : 'incorrect',
      detail,
      detail
    );
  };

  const advanceQueue = () => {
    if (!currentEntry || feedback.status === 'idle') return;
    stopSpeech();

    if (feedback.status === 'incorrect') {
      const remaining = quizQueue.slice(1);
      const retryEntry: QuizQueueEntry = {
        ...currentEntry,
        kind: activeQuestionKind,
        hadMistake: true,
        shuffledChoices: shuffleArray(currentEntry.item.quiz.choices),
      };
      const insertAt = Math.min(remaining.length, 2);
      setQuizQueue([
        ...remaining.slice(0, insertAt),
        retryEntry,
        ...remaining.slice(insertAt),
      ]);
      resetQuestionUi();
      return;
    }

    const nextQueue = quizQueue.slice(1);
    setQuizQueue(nextQueue);
    resetQuestionUi();

    if (nextQueue.length === 0) {
      if (mode === 'lesson') {
        completeKanaVocabLessons(lessonBatch.map((it) => it.id));
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
    const isCorrect =
      feedback.status === 'correct' || feedback.status === 'typo-accepted';
    if (
      !inQuiz ||
      !isCorrect ||
      showNoteDrawer ||
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
    showNoteDrawer,
    isAudioPlaying,
    autoAdvanceDelayMs,
    currentEntry?.item.id,
    activeQuestionKind,
    completedQuestions,
  ]);

  const handleTextInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback.status !== 'idle') {
      advanceQueue();
      return;
    }
    if (!typedValue.trim()) return;
    evaluateAnswer(typedValue, activeQuestionKind);
  };

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

  const getCategoryMeta = (cat: KanaVocabCategory) =>
    KANA_VOCAB_CATEGORIES.find((c) => c.id === cat) ?? KANA_VOCAB_CATEGORIES[0];

  if (loadError) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-rose-200 dark:border-rose-900 p-6 space-y-3">
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Gagal Memuat Kosakata Non-Kanji
          </h1>
          <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
          <div className="font-display text-base font-bold text-slate-900 dark:text-white">
            Memuat 250 Kosakata Non-Kanji JLPT N5–N1...
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Menyiapkan adverbia kana, kata penghubung, onomatope, dan serapan katakana.
          </p>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 1: LESSON STUDY PHASE
  // =========================================================================
  if (mode === 'lesson' && lessonPhase === 'study') {
    const item = lessonBatch[lessonIdx];
    const lvlMeta = JLPT_LEVELS.find((l) => l.level === item.jlpt) ?? JLPT_LEVELS[0];
    const catMeta = getCategoryMeta(item.category);
    const isLast = lessonIdx === lessonBatch.length - 1;

    return (
      <main className="w-full max-w-full overflow-x-clip">
        <section
          className="text-white"
          style={{ backgroundColor: catMeta.accent }}
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
                JLPT {lvlMeta.code} · Kata {lessonIdx + 1} / {lessonBatch.length}
              </span>
            </div>

            <div className="text-center space-y-2.5 py-2">
              <div className="text-xs uppercase tracking-wider text-white/85 font-semibold">
                {catMeta.shortLabel} · {item.partOfSpeech}
              </div>
              <h1 className="font-jp text-4xl sm:text-5xl font-bold tracking-tight break-words">
                {item.word}
              </h1>
              <p className="font-display text-lg sm:text-2xl font-bold text-white">
                {item.primaryMeaning}
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => speakJapanese(item.word, 0.9)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Putar Audio ({item.reading})
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                Arti &amp; Sinonim (English)
              </div>
              <div className="text-base font-semibold text-slate-900 dark:text-white">
                {item.primaryMeaning}
              </div>
              {item.acceptedMeanings.length > 1 && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Also accepted: {item.acceptedMeanings.join(', ')}
                </div>
              )}
            </div>

            <PronunciationCard
              compact
              target={{
                id: item.id,
                kanji: item.word,
                kana: item.reading,
                meaning: item.primaryMeaning,
                partOfSpeech: item.partOfSpeech,
                sourceLabel: `Kosakata Kana JLPT N${item.jlpt}`,
                exampleJp: item.example.jp,
                exampleReading: item.example.reading,
                exampleTranslation: item.example.en,
              }}
              onPracticeSpeak={(t) => openPronunciationPractice(t)}
            />

            <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Catatan Nuansa &amp; Pemakaian JLPT
                </div>
                <p className="text-xs sm:text-sm text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                  {item.usageNote}
                </p>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                Contoh Kalimat
              </div>
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-jp text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
                    {item.example.jp}
                  </p>
                  <button
                    type="button"
                    onClick={() => speakJapanese(item.example.jp, 0.9)}
                    aria-label="Putar audio contoh"
                    className="p-2 min-w-[40px] min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#0284C7] hover:text-[#0284C7] shrink-0 flex items-center justify-center cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="font-jp text-xs text-slate-500 dark:text-slate-400">
                  {item.example.reading}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {item.example.en}
                </p>
              </div>
            </div>
          </div>

          {/* Stepper + 2-col mobile-safe controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {lessonBatch.map((b, idx) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setLessonIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-jp font-semibold border transition-colors cursor-pointer ${
                    idx === lessonIdx
                      ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {idx + 1}. {b.word}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
              <button
                type="button"
                disabled={lessonIdx === 0}
                onClick={() => setLessonIdx((i) => Math.max(0, i - 1))}
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
                  onClick={() => setLessonIdx((i) => Math.min(lessonBatch.length - 1, i + 1))}
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
  // VIEW 2: SESSION SUMMARY
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
                ? 'Pelajaran Kosakata Kana Selesai!'
                : mode === 'review'
                ? 'Review Kosakata Kana Selesai!'
                : 'Latihan Cepat Selesai!'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {mode === 'lesson'
                ? `${lessonBatch.length} kata baru dipromosikan ke Apprentice I (review pertama dalam ${srsPolicy.firstReviewLabel}).`
                : mode === 'review'
                ? `Kamu menyelesaikan ${totalDone} kata dengan akurasi ${accuracy}%.`
                : `Latih Cepat selesai (${accuracy}% benar di percobaan pertama) — jadwal SRS tetap aman.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Kata Diuji</div>
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
              Kembali ke Katalog Kana
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

        {sessionResults.length > 0 && (
          <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-3">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Ringkasan Hasil
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sessionResults.map((row, i) => (
                <div
                  key={`${row.item.id}-${i}`}
                  className="py-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-jp font-bold text-sm text-slate-900 dark:text-white">
                      {row.item.word}{' '}
                      <span className="font-sans font-normal text-xs text-slate-500 dark:text-slate-400">
                        · N{row.item.jlpt} · {getCategoryMeta(row.item.category).shortLabel}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {row.item.primaryMeaning}
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
    const item = currentEntry.item;
    const lvlMeta = JLPT_LEVELS.find((l) => l.level === item.jlpt) ?? JLPT_LEVELS[0];
    const catMeta = getCategoryMeta(item.category);
    const remainingCount = quizQueue.length;
    const totalCount = Math.max(sessionTotalQuestions, completedQuestions + remainingCount);
    const progressPct = totalCount > 0 ? Math.round((completedQuestions / totalCount) * 100) : 0;

    return (
      <main className="w-full max-w-full overflow-x-clip">
        <section
          className="text-white"
          style={{
            backgroundColor:
              activeQuestionKind === 'listening'
                ? '#0284C7'
                : activeQuestionKind === 'pronunciation'
                ? '#0D9488'
                : catMeta.accent,
          }}
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

            <div className="h-1.5 w-full bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {activeQuestionKind === 'context' ? (
              <div className="py-3 text-center space-y-3">
                <div className="text-xs uppercase tracking-wider text-white/85 font-semibold">
                  Pilih kosakata yang tepat untuk melengkapi kalimat ({catMeta.shortLabel})
                </div>

                <div className="font-jp text-xl sm:text-3xl font-bold leading-relaxed break-words px-1">
                  <span>{item.quiz.sentenceBefore}</span>
                  <span
                    className={`inline-block mx-1.5 px-3 py-0.5 rounded-lg border-2 align-baseline transition-colors ${
                      feedback.status === 'correct' || feedback.status === 'typo-accepted'
                        ? 'bg-emerald-500 border-emerald-200 text-white'
                        : feedback.status === 'incorrect'
                        ? 'bg-rose-600 border-rose-200 text-white'
                        : 'bg-white/15 border-white/60 text-white min-w-[4.5rem]'
                    }`}
                  >
                    {feedback.status === 'idle' ? '（ ＿＿ ）' : item.word}
                  </span>
                  <span>{item.quiz.sentenceAfter}</span>
                </div>

                <p className="text-sm sm:text-base text-white/95 max-w-2xl mx-auto">
                  {item.quiz.en}
                </p>

                {feedback.status !== 'idle' && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        speakJapanese(
                          `${item.quiz.sentenceBefore}${item.word}${item.quiz.sentenceAfter}`,
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
            ) : activeQuestionKind === 'listening' ? (
              <div className="py-3 text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-white/90 font-semibold">
                  <Ear className="w-3.5 h-3.5" />
                  Listening · Dengarkan &amp; Tulis ({catMeta.shortLabel})
                </div>

                {feedback.status === 'idle' ? (
                  <div className="space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/30 mx-auto flex items-center justify-center">
                      <Volume2 className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-sm text-white/90">
                      Dengarkan audio lalu ketik kata yang kamu dengar (romaji otomatis jadi ひらがな)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="font-jp text-4xl sm:text-5xl font-bold tracking-tight break-words">
                      {item.word}
                    </div>
                    <div className="text-sm text-white/90">
                      <span className="font-jp">{item.reading}</span> · {item.primaryMeaning}
                    </div>
                  </div>
                )}

                <div className="pt-1 flex items-center justify-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => speakJapanese(item.word, 0.9)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-xs sm:text-sm font-semibold text-white cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                    Putar Audio
                  </button>
                  <button
                    type="button"
                    onClick={() => speakJapanese(item.word, 0.64)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/25 text-xs sm:text-sm font-semibold text-white cursor-pointer"
                  >
                    Pelan (0.64x)
                  </button>
                </div>
              </div>
            ) : activeQuestionKind === 'pronunciation' ? (
              <div className="py-3 text-center space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-white/90 font-semibold">
                  <Mic className="w-3.5 h-3.5" />
                  Pronunciation · Ucapkan atau Pilih Pola Pitch ({catMeta.shortLabel})
                </div>
                <div className="font-jp text-4xl sm:text-5xl font-bold tracking-tight break-words">
                  {item.word}
                </div>
                <div className="text-sm sm:text-base text-white/90">
                  <span className="font-jp font-semibold">{item.reading}</span> · {item.primaryMeaning}
                </div>
              </div>
            ) : (
              <div className="py-3 text-center space-y-2.5">
                <div className="text-xs uppercase tracking-wider text-white/85 font-semibold">
                  {catMeta.shortLabel} · {item.partOfSpeech} · Ketik arti dalam Bahasa Inggris
                </div>
                <div className="font-jp text-4xl sm:text-5xl font-bold tracking-tight break-words">
                  {item.word}
                </div>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => speakJapanese(item.word, 0.9)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Putar Audio
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Answer Input Area */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          {/* Quiz Format Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Format Soal:
            </span>
            <div className="inline-flex flex-wrap rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-0.5 gap-0.5">
              {(
                [
                  { id: 'mixed', label: 'Lengkap', icon: Sparkles },
                  { id: 'context', label: 'Konteks', icon: ListChecks },
                  { id: 'meaning', label: 'Arti', icon: Keyboard },
                  { id: 'listening', label: 'Listening', icon: Ear },
                  { id: 'pronunciation', label: 'Pelafalan', icon: Mic },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  disabled={feedback.status !== 'idle'}
                  onClick={() => {
                    setQuizMode(id);
                    setTypedValue('');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                    quizMode === id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {activeQuestionKind === 'context' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentEntry.shuffledChoices.map((choice, idx) => {
                const isAnswer = choice === item.word;
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
                    onClick={() => evaluateAnswer(choice, 'context')}
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
          ) : activeQuestionKind === 'pronunciation' ? (
            <VocabPronunciationQuizPanel
              key={`${item.id}-${completedQuestions}-${quizQueue.length}`}
              questionKey={`${item.id}-${completedQuestions}-${quizQueue.length}`}
              kanji={item.word}
              kana={item.reading}
              acceptedReadings={[item.reading, item.word]}
              partOfSpeech={item.partOfSpeech}
              answered={feedback.status !== 'idle'}
              onAnswer={(isCorrect, detail) => handlePronunciationResult(isCorrect, detail)}
            />
          ) : (
            <form onSubmit={handleTextInputSubmit} className="space-y-3">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={typedValue}
                  disabled={feedback.status !== 'idle'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTypedValue(
                      activeQuestionKind === 'listening' ? romajiToHiragana(val, false) : val
                    );
                  }}
                  placeholder={
                    activeQuestionKind === 'listening'
                      ? 'こたえ (ketik romaji / hiragana sesuai audio)...'
                      : 'Ketik arti kosakata (Inggris atau sinonim)...'
                  }
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={`w-full px-4 py-4 pr-14 rounded-xl border-2 text-base sm:text-lg text-center focus:outline-none transition-colors ${
                    activeQuestionKind === 'listening' ? 'font-jp' : ''
                  } ${
                    feedback.status === 'correct' || feedback.status === 'typo-accepted'
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
                {activeQuestionKind === 'listening'
                  ? 'Ketik romaji (otomatis berubah jadi ひらがな) atau langsung kana. Tekan Enter untuk kirim.'
                  : 'Ketik arti dalam Bahasa Inggris (salah ketik minor tetap diterima). Tekan Enter untuk kirim.'}
              </p>
            </form>
          )}

          {/* Feedback Banner */}
          {feedback.status !== 'idle' && (
            <div
              className={`relative overflow-hidden rounded-xl border p-4 sm:p-5 space-y-4 ${
                feedback.status === 'incorrect'
                  ? 'border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30'
                  : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div
                    className={`font-display font-bold text-base ${
                      feedback.status === 'incorrect'
                        ? 'text-rose-800 dark:text-rose-300'
                        : 'text-emerald-800 dark:text-emerald-300'
                    }`}
                  >
                    {feedback.status === 'correct'
                      ? !showNoteDrawer && autoAdvanceDelayMs > 0
                        ? isAudioPlaying
                          ? 'Benar! Menunggu audio selesai...'
                          : 'Benar! Lanjut otomatis...'
                        : 'Benar!'
                      : feedback.status === 'typo-accepted'
                      ? !showNoteDrawer && autoAdvanceDelayMs > 0
                        ? isAudioPlaying
                          ? 'Benar (typo diterima)! Menunggu audio selesai...'
                          : 'Benar (typo diterima)! Lanjut otomatis...'
                        : 'Benar (sedikit typo diterima)!'
                      : activeQuestionKind === 'context'
                      ? `Belum tepat — Jawaban benar: ${item.word}`
                      : activeQuestionKind === 'listening'
                      ? `Belum tepat — Kata yang diucapkan: ${item.word} (${item.reading})`
                      : activeQuestionKind === 'pronunciation'
                      ? 'Pelafalan / pola pitch belum tepat'
                      : `Belum tepat — Arti benar: ${item.primaryMeaning}`}
                  </div>
                  {feedback.detailMessage && (
                    <div className="text-xs text-slate-700 dark:text-slate-300">
                      {feedback.detailMessage}
                    </div>
                  )}
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-jp font-bold">{item.word}</span> ({item.reading}) —{' '}
                    {item.primaryMeaning}
                  </div>
                  {feedback.stageChange && (
                    <div className="text-xs font-mono-num font-semibold text-emerald-700 dark:text-emerald-400 pt-0.5">
                      SRS: {SRS_STAGE_NAMES[feedback.stageChange.previousStage]} →{' '}
                      {SRS_STAGE_NAMES[feedback.stageChange.newStage]}
                    </div>
                  )}
                  {feedback.status === 'incorrect' && (
                    <div className="text-xs text-rose-700 dark:text-rose-300 pt-0.5">
                      Soal ini akan muncul lagi sebentar lagi di sesi ini.
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

              <div className="border-t border-slate-200/80 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNoteDrawer((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
                >
                  {showNoteDrawer ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Sembunyikan Catatan, Pitch &amp; Contoh
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Lihat Catatan Nuansa, Pitch &amp; Contoh Kalimat
                    </>
                  )}
                </button>

                {showNoteDrawer && (
                  <div className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161A22] rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                    <PronunciationCard
                      compact
                      target={{
                        id: item.id,
                        kanji: item.word,
                        kana: item.reading,
                        meaning: item.primaryMeaning,
                        partOfSpeech: item.partOfSpeech,
                        sourceLabel: `Kosakata Kana JLPT N${item.jlpt}`,
                        exampleJp: item.example.jp,
                        exampleReading: item.example.reading,
                        exampleTranslation: item.example.en,
                      }}
                      onPracticeSpeak={(t) => openPronunciationPractice(t)}
                    />
                    <p className="text-xs sm:text-sm leading-relaxed">{item.usageNote}</p>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-jp text-sm font-semibold text-slate-900 dark:text-white">
                          {item.example.jp}
                        </div>
                        <button
                          type="button"
                          onClick={() => speakJapanese(item.example.jp, 0.9)}
                          aria-label="Putar audio contoh"
                          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#0284C7] shrink-0 cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {item.example.en}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {(feedback.status === 'correct' || feedback.status === 'typo-accepted') &&
                !showNoteDrawer &&
                !isAudioPlaying &&
                autoAdvanceDelayMs > 0 && (
                  <div
                    key={`${item.id}-${activeQuestionKind}-${completedQuestions}`}
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
      {/* Vocabulary Type Switcher Bar (Kanji-based vs Non-Kanji Kana JLPT) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-0.5 max-w-full overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveView('vocabulary')}
            className="px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            Kosakata Kanji (6.584)
          </button>
          <button
            type="button"
            className="px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 whitespace-nowrap cursor-pointer"
          >
            Kosakata Non-Kanji JLPT ({totals.total})
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
          {totals.started} / {totals.total} Dipelajari · {totals.guruPlus} Guru+ · {totals.burned} Burned
        </div>
      </div>

      {/* Header */}
      <div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
          Tahap 2 · Persiapan JLPT N5–N1
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
          Kosakata Non-Kanji (Kana, Katakana &amp; Onomatope)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
          {totals.total} kosakata wajib JLPT yang tidak muncul di kurikulum kanji — mencakup adverbia hiragana, kata penghubung bacaan, onomatope (giongo/gitaigo), dan serapan katakana beserta jebakan <em>false friends</em>.
        </p>
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
                Pelajaran Kana {activeLevelMeta.code}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {activeStats.unstarted.length > 0
                  ? `Pelajari ${nextBatchCount} kosakata non-kanji baru lengkap dengan audio, catatan false-friend, dan kuis promosi SRS.`
                  : `Semua ${activeStats.total} kosakata non-kanji ${activeLevelMeta.code} sudah masuk antrean SRS kamu!`}
              </p>
            </div>
            <div className="font-mono-num text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white shrink-0">
              {activeStats.unstarted.length}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Otomatis masuk Apprentice I ({srsPolicy.firstReviewLabel}) · Mode {srsPolicy.label}
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

        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="text-xs font-semibold text-[#0284C7]">
                Spaced Repetition · Mode {srsPolicy.label}
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Review Kana SRS
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {allDueItems.length > 0
                  ? 'Latih pemakaian kata dalam konteks kalimat JLPT (4 Pilihan) atau ketik artinya dalam Bahasa Inggris.'
                  : nextReviewAt
                  ? `Review berikutnya tersedia ${formatRelativeTime(nextReviewAt, now)}.`
                  : 'Selesaikan Pelajaran Kana terlebih dahulu atau langsung coba Latih Cepat 10 soal.'}
              </p>
            </div>
            <div className="font-mono-num text-3xl sm:text-4xl font-bold text-[#0284C7] shrink-0">
              {allDueItems.length}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {allDueItems.length === 0 && nextReviewAt ? (
              <button
                type="button"
                onClick={() => fastForwardTime(srsPolicy.fastForwardStepHours)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                Majukan waktu +{srsPolicy.fastForwardStepHours} jam
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
              {allDueItems.length > 0 ? (
                <button
                  type="button"
                  onClick={startReviewSession}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold w-full sm:w-auto shrink-0 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Mulai Review ({allDueItems.length})
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
              Daftar Kosakata Non-Kanji {activeLevelMeta.code} ({filteredItems.length} / {activeStats.total})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Filter berdasarkan kategori (Adverbia, Penghubung, Onomatope, Katakana) atau klik kata untuk detail &amp; audio.
            </p>
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kana, katakana, arti Inggris..."
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

        {/* Category Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Semua Kategori
            </button>
            {KANA_VOCAB_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'text-white'
                    : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                }`}
                style={
                  categoryFilter === cat.id ? { backgroundColor: cat.accent } : undefined
                }
              >
                {cat.shortLabel}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter tahap SRS"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as StageFilter)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] text-slate-700 dark:text-slate-200 shrink-0"
          >
            <option value="all">Semua Tahap SRS</option>
            <option value="unstarted">Belum Dipelajari</option>
            <option value="apprentice">Apprentice</option>
            <option value="guru-plus">Guru+</option>
            <option value="burned">Burned</option>
          </select>
        </div>

        {/* Item Grid */}
        {filteredItems.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Tidak ada kosakata yang cocok dengan filter saat ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredItems.map((item) => {
              const p = progressMap[item.id];
              const stage = p?.srsStage ?? 0;
              const cat = getSrsCategory(stage === 0 ? 0 : stage);
              const catMeta = getCategoryMeta(item.category);
              const isDue =
                !state.settings.vacationMode &&
                p &&
                p.srsStage >= 1 &&
                p.srsStage <= 8 &&
                p.nextReviewAt !== null &&
                p.nextReviewAt <= now;

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDetailItem(item);
                    }
                  }}
                  className="min-w-0 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/40 dark:bg-slate-900/30 text-left transition-colors flex flex-col justify-between gap-2.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-jp text-lg font-bold text-slate-900 dark:text-white break-words">
                          {item.word}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakJapanese(item.word, 0.9);
                          }}
                          aria-label={`Putar audio ${item.word}`}
                          className="p-1 rounded text-slate-400 hover:text-[#0284C7] cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5 line-clamp-1">
                        {item.primaryMeaning}
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
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/70 dark:border-slate-800/80 pt-2">
                    <span className="font-semibold" style={{ color: catMeta.accent }}>
                      {catMeta.shortLabel} · {item.partOfSpeech}
                    </span>
                    {p && p.nextReviewAt && !isDue && (
                      <span className="font-mono-num shrink-0">
                        {formatRelativeTime(p.nextReviewAt, now)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Detail Modal */}
      {detailItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Detail kosakata ${detailItem.word}`}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDetailItem(null)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#161A22] rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const catMeta = getCategoryMeta(detailItem.category);
              const prog = progressMap[detailItem.id];
              const stage = prog?.srsStage ?? 0;

              return (
                <>
                  <div
                    className="p-5 sm:p-6 text-white flex items-start justify-between gap-4"
                    style={{ backgroundColor: catMeta.accent }}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white/85 font-mono-num">
                        JLPT N{detailItem.jlpt} · {catMeta.shortLabel} ·{' '}
                        {stage === 0 ? 'Belum Dipelajari' : SRS_STAGE_NAMES[stage]}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <h3 className="font-jp text-2xl sm:text-3xl font-bold break-words">
                          {detailItem.word}
                        </h3>
                        <button
                          type="button"
                          onClick={() => speakJapanese(detailItem.word, 0.9)}
                          aria-label="Putar audio"
                          className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="font-display text-base sm:text-lg font-bold mt-1.5">
                        {detailItem.primaryMeaning}
                      </p>
                      <div className="text-xs text-white/85 mt-0.5">
                        {detailItem.partOfSpeech}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailItem(null)}
                      aria-label="Tutup detail"
                      className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white shrink-0 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-5 sm:p-6 space-y-5">
                    {detailItem.acceptedMeanings.length > 1 && (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                          Sinonim Diterima
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-200">
                          {detailItem.acceptedMeanings.join(', ')}
                        </p>
                      </div>
                    )}

                    <PronunciationCard
                      compact
                      target={{
                        id: detailItem.id,
                        kanji: detailItem.word,
                        kana: detailItem.reading,
                        meaning: detailItem.primaryMeaning,
                        partOfSpeech: detailItem.partOfSpeech,
                        sourceLabel: `Kosakata Kana JLPT N${detailItem.jlpt}`,
                        exampleJp: detailItem.example.jp,
                        exampleReading: detailItem.example.reading,
                        exampleTranslation: detailItem.example.en,
                      }}
                      onPracticeSpeak={(t) => {
                        setDetailItem(null);
                        openPronunciationPractice(t);
                      }}
                    />

                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                        <strong>JLPT Note:</strong> {detailItem.usageNote}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Contoh Kalimat
                      </div>
                      <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-1">
                        <div className="flex items-start justify-between gap-2.5">
                          <p className="font-jp text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                            {detailItem.example.jp}
                          </p>
                          <button
                            type="button"
                            onClick={() => speakJapanese(detailItem.example.jp, 0.9)}
                            aria-label="Putar audio contoh"
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0284C7] shrink-0 cursor-pointer"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="font-jp text-xs text-slate-500 dark:text-slate-400">
                          {detailItem.example.reading}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                          {detailItem.example.en}
                        </p>
                      </div>
                    </div>

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
                          onClick={() => startDrillSession([detailItem])}
                          className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Latih Kata Ini
                        </button>

                        {stage === 0 && (
                          <button
                            type="button"
                            onClick={() => startLessonSession([detailItem])}
                            className="min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer"
                            style={{ backgroundColor: catMeta.accent }}
                          >
                            Pelajari &amp; Mulai SRS
                          </button>
                        )}

                        {stage === 9 && (
                          <button
                            type="button"
                            onClick={() => {
                              resurrectKanaVocabItem(detailItem.id);
                              setDetailItem(null);
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
