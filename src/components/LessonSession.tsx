import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Ear,
  Home,
  Mic,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLevelMeta } from '../data/curriculum';
import { useIsAudioPlaying } from '../hooks/useIsAudioPlaying';
import { CurriculumItem } from '../types/curriculum';
import {
  resolveVerifiedItemPronunciation,
  speakJapanese,
  speakVerifiedItem,
  stopSpeech,
  type VerifiedItemPronunciation,
} from '../utils/audio';
import {
  romajiToHiragana,
  validateMeaningAnswer,
  validateReadingAnswer,
} from '../utils/kana';
import {
  getItemTypeLabel,
  getSrsPolicy,
  resolveSrsMode,
  SRS_STAGE_NAMES,
} from '../utils/srs';
import { PronunciationCard } from './PronunciationCard';
import { VocabPronunciationQuizPanel } from './VocabPronunciationQuizPanel';

interface QuizQuestion {
  item: CurriculumItem;
  kind: 'meaning' | 'reading' | 'listening' | 'pronunciation';
  /** Verified canonical pronunciation & TTS mapping for this exact question */
  pronunciation: VerifiedItemPronunciation | null;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const LessonSession: React.FC = () => {
  const {
    dataset,
    state,
    lessonQueue,
    completeLessonBatch,
    setActiveView,
    openItemDetail,
    openPronunciationPractice,
    recordPronunciationAttempt,
  } = useApp();

  const batchSize = state.settings.lessonBatchSize;
  const autoAdvanceDelayMs = state.settings.autoAdvanceDelayMs ?? 1500;
  const isAudioPlaying = useIsAudioPlaying();
  const includeListening = state.settings.includeVocabListeningQuiz !== false;
  const includePronunciation = state.settings.includeVocabPronunciationQuiz !== false;

  // Freeze current batch on mount or when starting a new batch
  const [batch, setBatch] = useState<CurriculumItem[]>(() =>
    lessonQueue.slice(0, batchSize)
  );
  const [phase, setPhase] = useState<'study' | 'quiz' | 'complete'>('study');
  const [slideIdx, setSlideIdx] = useState(0);
  const [subTab, setSubTab] = useState<'overview' | 'reading' | 'context'>('overview');

  // Quiz state
  const [quizQueue, setQuizQueue] = useState<QuizQuestion[]>([]);
  const [totalQuizCount, setTotalQuizCount] = useState(0);
  const [completedQuizCount, setCompletedQuizCount] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [answerState, setAnswerState] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [newlyUnlockedIds, setNewlyUnlockedIds] = useState<string[]>([]);

  const srsPolicy = getSrsPolicy(resolveSrsMode(state.settings));

  const inputRef = useRef<HTMLInputElement>(null);
  const advanceQuizRef = useRef<() => void>(() => {});

  const currentSlideItem = batch[slideIdx];
  const currentQuestion = quizQueue[0];

  // Auto-focus input in quiz mode (for typed questions)
  useEffect(() => {
    if (
      phase === 'quiz' &&
      currentQuestion?.kind !== 'pronunciation' &&
      inputRef.current
    ) {
      inputRef.current.focus();
    }
  }, [phase, quizQueue.length, answerState, currentQuestion?.kind]);

  // Auto-play verified Japanese audio when entering a Listening (Dictation) question
  useEffect(() => {
    if (
      phase !== 'quiz' ||
      answerState !== 'idle' ||
      currentQuestion?.kind !== 'listening'
    ) {
      return;
    }
    const targetItem = currentQuestion.item;
    const candidateTts = currentQuestion.pronunciation?.ttsText;
    const t = window.setTimeout(() => {
      speakVerifiedItem(targetItem, 0.9, 'narrator', undefined, candidateTts);
    }, 180);
    return () => window.clearTimeout(t);
  }, [
    phase,
    answerState,
    currentQuestion?.item.id,
    currentQuestion?.kind,
    currentQuestion?.pronunciation?.ttsText,
    completedQuizCount,
  ]);

  // Allow Enter to advance after answering pronunciation question & J to replay listening audio
  useEffect(() => {
    if (phase !== 'quiz' || !currentQuestion) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        currentQuestion.kind === 'pronunciation' &&
        answerState !== 'idle' &&
        e.key === 'Enter'
      ) {
        e.preventDefault();
        advanceQuizRef.current();
      } else if (
        currentQuestion.kind === 'listening' &&
        (e.key === 'j' || e.key === 'J') &&
        document.activeElement !== inputRef.current
      ) {
        e.preventDefault();
        speakVerifiedItem(
          currentQuestion.item,
          0.9,
          'narrator',
          undefined,
          currentQuestion.pronunciation?.ttsText
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, currentQuestion, answerState]);

  // Reset subtab when changing slide
  useEffect(() => {
    setSubTab('overview');
  }, [slideIdx]);

  // Keyboard navigation during study slides
  useEffect(() => {
    if (phase !== 'study') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (slideIdx < batch.length - 1) {
          setSlideIdx((i) => i + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (slideIdx > 0) {
          setSlideIdx((i) => i - 1);
        }
      } else if (e.key === 'j' || e.key === 'J') {
        if (currentSlideItem && currentSlideItem.type !== 'radical') {
          speakVerifiedItem(currentSlideItem);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, slideIdx, batch.length, currentSlideItem]);

  const startQuiz = () => {
    const questions: QuizQuestion[] = [];
    for (const item of batch) {
      const pronunciation = resolveVerifiedItemPronunciation(item);
      questions.push({ item, kind: 'meaning', pronunciation });
      if (item.type !== 'radical') {
        questions.push({ item, kind: 'reading', pronunciation });
      }
      if (item.type === 'vocabulary' && pronunciation?.isVerified) {
        if (includeListening) {
          questions.push({ item, kind: 'listening', pronunciation });
        }
        if (includePronunciation) {
          questions.push({ item, kind: 'pronunciation', pronunciation });
        }
      }
    }
    const shuffled = shuffle(questions);
    setQuizQueue(shuffled);
    setTotalQuizCount(shuffled.length);
    setCompletedQuizCount(0);
    setInputValue('');
    setAnswerState('idle');
    setFeedbackMsg(null);
    setShowInfo(false);
    setPhase('quiz');
  };

  const triggerShake = (msg: string) => {
    setFeedbackMsg(msg);
    setShake(true);
    window.setTimeout(() => setShake(false), 360);
  };

  const handleInputChange = (val: string) => {
    if (answerState !== 'idle') return;
    if (
      currentQuestion?.kind === 'reading' ||
      currentQuestion?.kind === 'listening'
    ) {
      setInputValue(romajiToHiragana(val, false));
    } else {
      setInputValue(val);
    }
  };

  const advanceQuiz = () => {
    if (!currentQuestion) return;
    const rest = quizQueue.slice(1);
    if (answerState === 'correct') {
      const nextDone = completedQuizCount + 1;
      setCompletedQuizCount(nextDone);
      if (rest.length === 0) {
        // Batch mastered! Promote all items to Apprentice I & unlock dependent items immediately
        const outcome = completeLessonBatch(batch.map((i) => i.id));
        setNewlyUnlockedIds(outcome.newlyUnlockedIds);
        setPhase('complete');
        return;
      }
      setQuizQueue(rest);
    } else {
      // Re-insert missed question a couple slots later so user retries it
      const insertAt = Math.min(rest.length, 2);
      const nextQueue = [...rest.slice(0, insertAt), currentQuestion, ...rest.slice(insertAt)];
      setQuizQueue(nextQueue);
    }

    setInputValue('');
    stopSpeech();
    setAnswerState('idle');
    setFeedbackMsg(null);
    setShowInfo(false);
  };

  advanceQuizRef.current = advanceQuiz;

  // Auto-advance smoothly after audio finishes + brief hold when the answer is correct
  useEffect(() => {
    if (
      phase !== 'quiz' ||
      answerState !== 'correct' ||
      showInfo ||
      isAudioPlaying ||
      autoAdvanceDelayMs <= 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      advanceQuizRef.current();
    }, autoAdvanceDelayMs);
    return () => window.clearTimeout(timer);
  }, [
    phase,
    answerState,
    showInfo,
    isAudioPlaying,
    autoAdvanceDelayMs,
    currentQuestion?.item.id,
    currentQuestion?.kind,
  ]);

  const handlePronunciationAnswer = (isCorrect: boolean, detailMsg: string) => {
    if (!currentQuestion || answerState !== 'idle') return;
    recordPronunciationAttempt('speak', isCorrect, currentQuestion.item.id);
    if (isCorrect) {
      setAnswerState('correct');
      setFeedbackMsg(
        autoAdvanceDelayMs > 0
          ? `${detailMsg} Lanjut otomatis...`
          : `${detailMsg} Tekan Enter untuk melanjutkan.`
      );
    } else {
      setAnswerState('incorrect');
      setFeedbackMsg(detailMsg);
      setShowInfo(true);
    }
  };

  const handleQuizSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion) return;

    if (answerState !== 'idle') {
      advanceQuiz();
      return;
    }

    if (currentQuestion.kind === 'pronunciation') return;

    const userSynonyms = state.progress[currentQuestion.item.id]?.userSynonyms ?? [];
    const relatedKanji =
      currentQuestion.item.type === 'vocabulary' &&
      currentQuestion.item.characters.length === 1
        ? dataset.kanjiByChar[currentQuestion.item.characters]
        : null;
    let result;
    if (currentQuestion.kind === 'meaning') {
      result = validateMeaningAnswer(inputValue, currentQuestion.item, userSynonyms);
    } else if (
      currentQuestion.kind === 'listening' &&
      inputValue.trim() === currentQuestion.item.characters
    ) {
      result = { status: 'correct' as const, finalizedInput: inputValue.trim() };
    } else {
      result = validateReadingAnswer(
        inputValue,
        currentQuestion.item,
        currentQuestion.kind === 'reading' ? relatedKanji : null
      );
    }

    if (result.finalizedInput !== undefined) {
      setInputValue(result.finalizedInput);
    }

    if (result.status === 'shake') {
      triggerShake(result.message ?? 'Periksa kembali jawabanmu.');
      return;
    }

    const isSuccess = result.status === 'correct' || result.status === 'typo-accepted';
    if (currentQuestion.kind === 'listening') {
      recordPronunciationAttempt('ear', isSuccess, currentQuestion.item.id);
    }

    if (isSuccess) {
      setAnswerState('correct');
      setFeedbackMsg(
        result.message ??
          (autoAdvanceDelayMs > 0
            ? 'Tepat! Lanjut otomatis ke soal berikutnya...'
            : 'Tepat! Tekan Enter untuk melanjutkan.')
      );
      if (
        (currentQuestion.kind === 'reading' || currentQuestion.kind === 'listening') &&
        state.settings.autoplayAudio
      ) {
        speakVerifiedItem(
          currentQuestion.item,
          0.92,
          'narrator',
          undefined,
          currentQuestion.pronunciation?.ttsText
        );
      }
    } else {
      setAnswerState('incorrect');
      setFeedbackMsg(
        currentQuestion.kind === 'meaning'
          ? `Jawaban benar: ${currentQuestion.item.primaryMeaning}`
          : currentQuestion.kind === 'listening'
          ? `Yang diucapkan: ${currentQuestion.item.characters}（${currentQuestion.item.readings?.join('、 ')}） · ${currentQuestion.item.primaryMeaning}`
          : `Bacaan benar: ${
              currentQuestion.item.type === 'vocabulary'
                ? currentQuestion.item.readings?.join('、 ')
                : (currentQuestion.item.primaryReadingType === 'kunyomi'
                    ? currentQuestion.item.kunyomi
                    : currentQuestion.item.onyomi
                  )?.join('、 ')
            }`
      );
      setShowInfo(true);
    }
  };

  const remainingLessonsAfterBatch = useMemo(() => {
    const batchIds = new Set(batch.map((b) => b.id));
    return lessonQueue.filter((i) => !batchIds.has(i.id));
  }, [lessonQueue, batch]);

  const startNextBatch = () => {
    const next = lessonQueue.slice(0, batchSize);
    setBatch(next);
    setSlideIdx(0);
    setNewlyUnlockedIds([]);
    setPhase('study');
  };

  if (batch.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Semua Pelajaran Saat Ini Sudah Selesai
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Selesaikan Review Harian hingga item mencapai tahap {SRS_STAGE_NAMES[srsPolicy.levelUpKanjiStage]} untuk membuka level berikutnya.
        </p>
        <button
          type="button"
          onClick={() => setActiveView('dashboard')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0284C7] text-white text-sm font-semibold hover:bg-[#0369A1] cursor-pointer"
        >
          <Home className="w-4 h-4" />
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  // PHASE 3: COMPLETION SUMMARY
  if (phase === 'complete') {
    const unlockedItems = newlyUnlockedIds
      .map((id) => dataset.byId[id])
      .filter((it): it is CurriculumItem => Boolean(it));

    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Sesi Pelajaran Selesai
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              {batch.length} item telah dipindahkan ke tahap <strong>Apprentice I</strong>. Review pertamamu dijadwalkan dalam <strong>{srsPolicy.firstReviewLabel}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2.5">
            {batch.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openItemDetail(item.id)}
                className={`px-3.5 py-2 rounded-lg text-white font-jp font-bold text-lg flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-90 ${
                  item.type === 'radical'
                    ? 'bg-[#0284C7]'
                    : item.type === 'kanji'
                    ? 'bg-[#DB2777]'
                    : 'bg-[#7C3AED]'
                }`}
              >
                <span>{item.characters}</span>
                <span className="font-sans text-xs font-medium text-white/90">
                  {item.primaryMeaning}
                </span>
              </button>
            ))}
          </div>

          {unlockedItems.length > 0 && (
            <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[#059669] dark:text-emerald-400">
                  Pelajaran Baru Langsung Terbuka · {unlockedItems.length} Item
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Materi turunan langsung masuk ke antrean Pelajaran tanpa perlu menunggu hari berikutnya.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {unlockedItems.slice(0, 14).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItemDetail(item.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-white font-jp font-bold text-sm flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90 ${
                      item.type === 'radical'
                        ? 'bg-[#0284C7]'
                        : item.type === 'kanji'
                        ? 'bg-[#DB2777]'
                        : 'bg-[#7C3AED]'
                    }`}
                  >
                    <span>{item.characters}</span>
                    <span className="font-sans text-[11px] font-medium text-white/90">
                      {item.primaryMeaning}
                    </span>
                  </button>
                ))}
                {unlockedItems.length > 14 && (
                  <span className="self-center text-xs font-mono-num text-slate-500 dark:text-slate-400 px-1">
                    +{unlockedItems.length - 14} lainnya
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Kembali ke Beranda
            </button>
            {lessonQueue.length > 0 && (
              <button
                type="button"
                onClick={startNextBatch}
                className="px-5 py-2.5 rounded-lg bg-[#DB2777] hover:bg-[#BE185D] text-white text-sm font-semibold cursor-pointer"
              >
                Lanjut Batch Berikutnya ({Math.min(batchSize, lessonQueue.length)} item)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PHASE 2: LESSON QUIZ
  if (phase === 'quiz' && currentQuestion) {
    const qItem = currentQuestion.item;
    const bannerColor =
      qItem.type === 'radical'
        ? 'bg-[#0284C7]'
        : qItem.type === 'kanji'
        ? 'bg-[#DB2777]'
        : 'bg-[#7C3AED]';
    const progressPct =
      totalQuizCount > 0 ? Math.round((completedQuizCount / totalQuizCount) * 100) : 0;

    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col">
        {/* Progress bar */}
        <div className="h-1 bg-slate-200 dark:bg-slate-800 w-full">
          <div
            className="h-full bg-emerald-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Character Stage */}
        <div className={`${bannerColor} text-white px-4 py-10 sm:py-14 relative`}>
          <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-white/85 mb-6">
            <button
              type="button"
              onClick={() => setPhase('study')}
              className="inline-flex items-center gap-1.5 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Materi
            </button>
            <span className="font-mono-num">
              Kuis Pelajaran · {completedQuizCount} / {totalQuizCount}
            </span>
          </div>

          <div className="max-w-3xl mx-auto text-center">
            <div className="text-xs font-medium text-white/85 mb-2 flex items-center justify-center flex-wrap gap-1.5">
              <span>
                {getLevelMeta(qItem.level).jlpt} · Bab {getLevelMeta(qItem.level).unitInTier}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-bold uppercase tracking-wide">
                {getItemTypeLabel(qItem.type)}
              </span>
              {qItem.type === 'vocabulary' && qItem.partOfSpeech && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{qItem.partOfSpeech}</span>
                </>
              )}
            </div>
            {currentQuestion.kind === 'listening' && answerState === 'idle' ? (
              <div className="space-y-3 py-1">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 mx-auto">
                  <Ear className="w-8 h-8 text-white" />
                </div>
                <div className="text-sm text-white/90 font-medium">
                  Dengarkan audio lalu ketik bacaan yang kamu dengar
                </div>
                <div className="flex items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      speakVerifiedItem(
                        qItem,
                        0.9,
                        'narrator',
                        undefined,
                        currentQuestion.pronunciation?.ttsText
                      )
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-slate-900 text-xs sm:text-sm font-bold hover:bg-white/90 transition-colors cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                    Putar Audio
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      speakVerifiedItem(
                        qItem,
                        0.64,
                        'narrator',
                        undefined,
                        currentQuestion.pronunciation?.ttsText
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Pelan (0.64x)
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="font-jp text-5xl sm:text-7xl font-bold tracking-tight select-all break-words">
                  {qItem.characters}
                </div>
                {currentQuestion.kind === 'reading' &&
                  qItem.type === 'vocabulary' &&
                  qItem.characters.length === 1 && (
                    <div className="text-xs sm:text-sm text-white/90 font-medium">
                      Kata Mandiri · Arti: &ldquo;{qItem.primaryMeaning}&rdquo;
                      {qItem.partOfSpeech ? ` (${qItem.partOfSpeech})` : ''}
                    </div>
                  )}
                {(currentQuestion.kind === 'pronunciation' ||
                  (currentQuestion.kind === 'listening' && answerState !== 'idle')) && (
                  <div className="text-sm sm:text-base text-white/90 font-jp">
                    {currentQuestion.pronunciation?.testedReading ?? qItem.readings?.[0]} ·{' '}
                    <span className="font-sans">{qItem.primaryMeaning}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Prompt Bar */}
        <div className="bg-slate-900 text-white py-3 px-4 text-center text-sm font-semibold">
          {currentQuestion.kind === 'meaning' ? (
            <span>
              {getItemTypeLabel(qItem.type)} —{' '}
              <strong>
                {qItem.type === 'radical'
                  ? 'Nama Radikal (Bahasa Inggris)'
                  : 'Arti (Bahasa Inggris)'}
              </strong>
            </span>
          ) : currentQuestion.kind === 'listening' ? (
            <span className="inline-flex items-center gap-1.5">
              <Ear className="w-4 h-4 text-sky-400" />
              {getItemTypeLabel(qItem.type)} —{' '}
              <strong>Listening (Dengarkan &amp; Tulis ひらがな)</strong>
            </span>
          ) : currentQuestion.kind === 'pronunciation' ? (
            <span className="inline-flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-teal-400" />
              {getItemTypeLabel(qItem.type)} —{' '}
              <strong>Pronunciation (Ucapkan atau Pilih Pola Pitch)</strong>
            </span>
          ) : (
            <span>
              {getItemTypeLabel(qItem.type)} —{' '}
              <strong>
                Bacaan{' '}
                {qItem.type === 'kanji'
                  ? qItem.primaryReadingType === 'kunyomi'
                    ? "Kanji (Kun'yomi)"
                    : "Kanji (On'yomi)"
                  : 'Kosakata (Hiragana)'}
              </strong>
            </span>
          )}
        </div>

        {/* Input & Feedback */}
        <div className="max-w-2xl w-full mx-auto px-4 py-8 flex-1 space-y-5">
          {currentQuestion.kind === 'pronunciation' &&
          currentQuestion.pronunciation?.testedReading ? (
            <div className="space-y-4">
              <VocabPronunciationQuizPanel
                questionKey={`lesson-${qItem.id}-${completedQuizCount}`}
                kanji={qItem.characters}
                kana={currentQuestion.pronunciation.testedReading}
                acceptedReadings={currentQuestion.pronunciation.acceptedReadings}
                partOfSpeech={qItem.partOfSpeech}
                answered={answerState !== 'idle'}
                onAnswer={handlePronunciationAnswer}
              />
              {answerState !== 'idle' && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowInfo((v) => !v)}
                    className="text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer"
                  >
                    {showInfo ? 'Sembunyikan Info' : 'Lihat Info Item'}
                  </button>
                  <button
                    type="button"
                    onClick={advanceQuiz}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                  >
                    Lanjut
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleQuizSubmit} className="space-y-3">
              <div className={`relative ${shake ? 'animate-shake' : ''}`}>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  readOnly={answerState !== 'idle'}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={
                    currentQuestion.kind === 'meaning'
                      ? 'Ketik arti dalam Bahasa Inggris...'
                      : currentQuestion.kind === 'listening'
                      ? 'Ketik apa yang kamu dengar (romaji → ひらがな)...'
                      : 'Ketik romaji (otomatis ke ひらがな)...'
                  }
                  className={`w-full text-center text-lg sm:text-2xl py-3.5 sm:py-4 px-10 sm:px-12 rounded-xl border-2 transition-colors focus:outline-none ${
                    currentQuestion.kind === 'reading' ||
                    currentQuestion.kind === 'listening'
                      ? 'font-jp'
                      : 'font-body'
                  } ${
                    answerState === 'correct'
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : answerState === 'incorrect'
                      ? 'bg-rose-600 border-rose-600 text-white'
                      : 'bg-white dark:bg-[#161A22] border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:border-[#0284C7]'
                  }`}
                />
                <button
                  type="submit"
                  aria-label="Kirim jawaban"
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors cursor-pointer ${
                    answerState === 'idle'
                      ? 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      : 'text-white/90 hover:text-white'
                  }`}
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {currentQuestion.kind === 'listening'
                    ? 'Dengarkan suara lalu ketik bacaannya (romaji otomatis ke ひらがな)'
                    : currentQuestion.kind === 'reading'
                    ? 'Mode IME Aktif: ketik romaji (contoh: ichi → いち)'
                    : 'Masukkan arti Bahasa Inggris (atau sinonim pribadimu)'}
                </span>
                {answerState !== 'idle' && (
                  <button
                    type="button"
                    onClick={() => setShowInfo((v) => !v)}
                    className="font-semibold text-[#0284C7] hover:underline cursor-pointer"
                  >
                    {showInfo ? 'Sembunyikan Info' : 'Lihat Info Item'}
                  </button>
                )}
              </div>
            </form>
          )}

          {feedbackMsg && (
            <div
              className={`relative overflow-hidden px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2.5 ${
                answerState === 'correct'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                  : answerState === 'incorrect'
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
              }`}
            >
              {answerState === 'correct' ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : answerState === 'incorrect' ? (
                <XCircle className="w-4 h-4 shrink-0" />
              ) : null}
              <span>
                {answerState === 'correct' &&
                !showInfo &&
                autoAdvanceDelayMs > 0 &&
                isAudioPlaying
                  ? feedbackMsg.replace(
                      /Lanjut otomatis( ke soal berikutnya)?\.\.\./,
                      'Menunggu audio selesai...'
                    )
                  : feedbackMsg}
              </span>
              {answerState === 'correct' &&
                !showInfo &&
                !isAudioPlaying &&
                autoAdvanceDelayMs > 0 && (
                  <div
                    key={`${qItem.id}-${currentQuestion.kind}-${completedQuizCount}`}
                    className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/75 dark:bg-emerald-400/75 animate-auto-advance"
                    style={{ animationDuration: `${autoAdvanceDelayMs}ms` }}
                  />
                )}
            </div>
          )}

          {showInfo && (
            <div className="p-5 rounded-xl bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Arti: </span>
                  <strong className="text-slate-900 dark:text-white">
                    {qItem.primaryMeaning}
                  </strong>
                </div>
                {qItem.type !== 'radical' && (
                  <button
                    type="button"
                    onClick={() =>
                      speakVerifiedItem(
                        qItem,
                        0.92,
                        'narrator',
                        undefined,
                        currentQuestion.pronunciation?.ttsText
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0284C7] hover:underline cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Audio
                  </button>
                )}
              </div>
              {qItem.type === 'kanji' && (
                <div className="text-xs text-slate-600 dark:text-slate-300 font-jp">
                  On&apos;yomi: {qItem.onyomi?.join('、 ') || '—'} · Kun&apos;yomi:{' '}
                  {qItem.kunyomi?.join('、 ') || '—'}
                </div>
              )}
              {qItem.type === 'vocabulary' && (
                <div className="text-xs text-slate-600 dark:text-slate-300 font-jp">
                  Bacaan: {qItem.readings?.join('、 ')}
                </div>
              )}
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {currentQuestion.kind === 'meaning'
                  ? qItem.meaningMnemonic
                  : qItem.readingMnemonic ?? qItem.meaningMnemonic}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // PHASE 1: STUDY SLIDES
  const bannerColor =
    currentSlideItem.type === 'radical'
      ? 'bg-[#0284C7]'
      : currentSlideItem.type === 'kanji'
      ? 'bg-[#DB2777]'
      : 'bg-[#7C3AED]';

  const components = (currentSlideItem.componentIds ?? [])
    .map((id) => dataset.byId[id])
    .filter(Boolean);
  const dependents = (dataset.dependentsById[currentSlideItem.id] ?? []).slice(0, 12);
  const isLastSlide = slideIdx === batch.length - 1;

  const slidePronunciation = resolveVerifiedItemPronunciation(currentSlideItem);
  const primaryAudio = slidePronunciation?.ttsText ?? null;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)] w-full max-w-full overflow-x-clip flex flex-col">
      {/* Banner Header */}
      <div className={`${bannerColor} text-white px-3 sm:px-4 py-6 sm:py-12`}>
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-white/85 mb-4 sm:mb-6">
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            className="inline-flex items-center gap-1.5 hover:text-white cursor-pointer shrink-0"
          >
            <Home className="w-4 h-4" />
            Beranda
          </button>
          <span className="font-mono-num text-right">
            Pelajaran {slideIdx + 1} / {batch.length}
            {remainingLessonsAfterBatch.length > 0 && (
              <span className="hidden sm:inline">
                {` · ${remainingLessonsAfterBatch.length} tersisa di antrean`}
              </span>
            )}
          </span>
        </div>

        <div className="max-w-4xl mx-auto text-center space-y-2">
          <div className="text-xs font-medium text-white/85">
            {getLevelMeta(currentSlideItem.level).jlpt} · Bab {getLevelMeta(currentSlideItem.level).unitInTier} · {getItemTypeLabel(currentSlideItem.type)}
            {currentSlideItem.partOfSpeech ? ` · ${currentSlideItem.partOfSpeech}` : ''}
          </div>
          <div className="font-jp text-5xl sm:text-7xl font-bold leading-none select-all break-words">
            {currentSlideItem.characters}
          </div>
          <div className="font-display text-xl sm:text-3xl font-bold pt-1 break-words">
            {currentSlideItem.primaryMeaning}
          </div>
          {primaryAudio && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() =>
                  speakVerifiedItem(
                    currentSlideItem,
                    0.92,
                    'narrator',
                    undefined,
                    primaryAudio
                  )
                }
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium transition-colors cursor-pointer max-w-full"
              >
                <Volume2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Putar Audio ({primaryAudio})</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sub-navigation Tabs — fully contained & responsive on 360px+ */}
      <div className="bg-white dark:bg-[#161A22] border-b border-slate-200 dark:border-slate-800 w-full">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center justify-around sm:justify-center gap-2 sm:gap-6 min-w-0">
            <button
              type="button"
              onClick={() => setSubTab('overview')}
              className={`py-3 sm:py-3.5 px-1.5 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'overview'
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {currentSlideItem.type === 'radical' ? (
                'Nama & Mnemonik'
              ) : (
                <>
                  <span className="sm:hidden">Arti</span>
                  <span className="hidden sm:inline">Komponen &amp; Arti</span>
                </>
              )}
            </button>

            {currentSlideItem.type !== 'radical' && (
              <button
                type="button"
                onClick={() => setSubTab('reading')}
                className={`py-3 sm:py-3.5 px-1.5 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  subTab === 'reading'
                    ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span className="sm:hidden">Cara Baca</span>
                <span className="hidden sm:inline">Cara Baca &amp; Mnemonik</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSubTab('context')}
              className={`py-3 sm:py-3.5 px-1.5 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'context'
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {currentSlideItem.type === 'vocabulary' ? (
                <>
                  <span className="sm:hidden">Contoh</span>
                  <span className="hidden sm:inline">Kalimat Contoh</span>
                </>
              ) : currentSlideItem.type === 'kanji' ? (
                <>
                  <span className="sm:hidden">Kosakata</span>
                  <span className="hidden sm:inline">Contoh Kosakata</span>
                </>
              ) : (
                <>
                  <span className="sm:hidden">Di Kanji</span>
                  <span className="hidden sm:inline">Ditemukan di Kanji</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Study Panel */}
      <div className="max-w-4xl w-full mx-auto px-3 sm:px-4 py-5 sm:py-8 pb-10 flex-1 min-w-0">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-8 space-y-5 sm:space-y-6">
          {subTab === 'overview' && (
            <>
              {components.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
                    {currentSlideItem.type === 'kanji'
                      ? 'Terbentuk dari Radikal'
                      : 'Terbentuk dari Kanji'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {components.map((comp, i) => (
                      <React.Fragment key={comp.id}>
                        {i > 0 && <span className="text-slate-400 font-bold">+</span>}
                        <button
                          type="button"
                          onClick={() => openItemDetail(comp.id)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 cursor-pointer bg-slate-50 dark:bg-slate-800/60"
                        >
                          <span
                            className={`font-jp font-bold text-white px-2 py-0.5 rounded text-base ${
                              comp.type === 'radical' ? 'bg-[#0284C7]' : 'bg-[#DB2777]'
                            }`}
                          >
                            {comp.characters}
                          </span>
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {comp.primaryMeaning}
                          </span>
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Arti Utama &amp; Alternatif
                </h3>
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  {currentSlideItem.primaryMeaning}
                  {currentSlideItem.acceptedMeanings.length > 1 && (
                    <span className="font-normal text-sm text-slate-500 dark:text-slate-400">
                      {' '}
                      · {currentSlideItem.acceptedMeanings.slice(0, 5).join(', ')}
                    </span>
                  )}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  Cerita Mnemonik Arti
                </h3>
                <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 max-w-prose">
                  {currentSlideItem.meaningMnemonic}
                </p>
              </div>
            </>
          )}

          {subTab === 'reading' && currentSlideItem.type !== 'radical' && (
            <>
              {currentSlideItem.type === 'kanji' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      On&apos;yomi{' '}
                      {currentSlideItem.primaryReadingType === 'onyomi' ? '· Diujikan di Kuis' : ''}
                    </div>
                    <div className="font-jp text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {currentSlideItem.onyomi?.length
                        ? currentSlideItem.onyomi.join('、 ')
                        : '—'}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Kun&apos;yomi{' '}
                      {currentSlideItem.primaryReadingType === 'kunyomi' ? '· Diujikan di Kuis' : ''}
                    </div>
                    <div className="font-jp text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {currentSlideItem.kunyomi?.length
                        ? currentSlideItem.kunyomi.join('、 ')
                        : '—'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Bacaan Kosakata</div>
                      <div className="font-jp text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 break-words">
                        {currentSlideItem.readings?.join('、 ')}
                      </div>
                    </div>
                    {primaryAudio && (
                      <button
                        type="button"
                        onClick={() =>
                          speakVerifiedItem(
                            currentSlideItem,
                            0.92,
                            'narrator',
                            undefined,
                            primaryAudio
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold hover:bg-[#6D28D9] cursor-pointer shrink-0"
                      >
                        <Volume2 className="w-4 h-4" />
                        Dengarkan
                      </button>
                    )}
                  </div>
                  {slidePronunciation?.testedReading && (
                    <PronunciationCard
                      compact
                      target={{
                        id: currentSlideItem.id,
                        kanji: currentSlideItem.characters,
                        kana: slidePronunciation.testedReading,
                        meaning: currentSlideItem.primaryMeaning,
                        partOfSpeech: currentSlideItem.partOfSpeech,
                        sourceLabel: `Kurikulum Level ${currentSlideItem.level}`,
                        exampleJp: currentSlideItem.contextSentences?.[0]?.jp,
                        exampleReading: currentSlideItem.contextSentences?.[0]?.reading,
                        exampleTranslation: currentSlideItem.contextSentences?.[0]?.en,
                      }}
                      onPracticeSpeak={(t) => openPronunciationPractice(t)}
                    />
                  )}
                </div>
              )}

              {currentSlideItem.readingMnemonic && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Cerita Mnemonik Bacaan
                  </h3>
                  <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 max-w-prose">
                    {currentSlideItem.readingMnemonic}
                  </p>
                </div>
              )}
            </>
          )}

          {subTab === 'context' && (
            <>
              {currentSlideItem.type === 'vocabulary' &&
              currentSlideItem.contextSentences?.length ? (
                <div className="space-y-3">
                  {currentSlideItem.contextSentences.map((s, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <p className="font-jp text-lg font-medium text-slate-900 dark:text-white">
                          {s.jp}
                        </p>
                        <p className="font-jp text-xs text-slate-500 dark:text-slate-400">
                          {s.reading}
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300">{s.en}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => speakJapanese(s.reading || s.jp, 0.88)}
                        className="p-2 rounded-lg text-slate-500 hover:text-[#7C3AED] cursor-pointer"
                        title="Putar kalimat"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : dependents.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {dependents.map((dep) => (
                    <button
                      key={dep.id}
                      type="button"
                      onClick={() => openItemDetail(dep.id)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-400 text-left cursor-pointer"
                    >
                      <span
                        className={`font-jp text-lg font-bold text-white px-2.5 py-1 rounded ${
                          dep.type === 'kanji' ? 'bg-[#DB2777]' : 'bg-[#7C3AED]'
                        }`}
                      >
                        {dep.characters}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {dep.primaryMeaning}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {getLevelMeta(dep.level).jlpt} Bab {getLevelMeta(dep.level).unitInTier} · {getItemTypeLabel(dep.type)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Item ini berdiri mandiri pada level saat ini.
                </p>
              )}
            </>
          )}
        </div>

        {/* Bottom Batch Stepper & Navigation */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {batch.map((item, idx) => {
              const active = idx === slideIdx;
              const bg =
                item.type === 'radical'
                  ? 'bg-[#0284C7]'
                  : item.type === 'kanji'
                  ? 'bg-[#DB2777]'
                  : 'bg-[#7C3AED]';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSlideIdx(idx)}
                  className={`font-jp text-sm font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    active
                      ? `${bg} text-white ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-[#0F1115]`
                      : 'bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                  }`}
                >
                  {item.characters}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              disabled={slideIdx === 0}
              onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              Sebelumnya
            </button>

            {!isLastSlide ? (
              <button
                type="button"
                onClick={() => setSlideIdx((i) => i + 1)}
                className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2.5 min-h-[44px] rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs sm:text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 cursor-pointer whitespace-nowrap"
              >
                Berikutnya
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startQuiz}
                className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2.5 min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
              >
                <span>Mulai Kuis</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
