import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Home,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CurriculumItem } from '../types/curriculum';
import { speakJapanese } from '../utils/audio';
import {
  romajiToHiragana,
  validateMeaningAnswer,
  validateReadingAnswer,
} from '../utils/kana';
import { getItemTypeLabel } from '../utils/srs';

interface QuizQuestion {
  item: CurriculumItem;
  kind: 'meaning' | 'reading';
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
  } = useApp();

  const batchSize = state.settings.lessonBatchSize;

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

  const inputRef = useRef<HTMLInputElement>(null);

  const currentSlideItem = batch[slideIdx];
  const currentQuestion = quizQueue[0];

  // Auto-focus input in quiz mode
  useEffect(() => {
    if (phase === 'quiz' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase, quizQueue.length, answerState]);

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
          const text =
            currentSlideItem.type === 'vocabulary'
              ? currentSlideItem.readings?.[0]
              : currentSlideItem.primaryReadingType === 'kunyomi'
              ? currentSlideItem.kunyomi?.[0]
              : currentSlideItem.onyomi?.[0];
          if (text) speakJapanese(text);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, slideIdx, batch.length, currentSlideItem]);

  const startQuiz = () => {
    const questions: QuizQuestion[] = [];
    for (const item of batch) {
      questions.push({ item, kind: 'meaning' });
      if (item.type !== 'radical') {
        questions.push({ item, kind: 'reading' });
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
    if (currentQuestion?.kind === 'reading') {
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
        // Batch mastered! Promote all items to Apprentice I
        completeLessonBatch(batch.map((i) => i.id));
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
    setAnswerState('idle');
    setFeedbackMsg(null);
    setShowInfo(false);
  };

  const handleQuizSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion) return;

    if (answerState !== 'idle') {
      advanceQuiz();
      return;
    }

    const userSynonyms = state.progress[currentQuestion.item.id]?.userSynonyms ?? [];
    const result =
      currentQuestion.kind === 'meaning'
        ? validateMeaningAnswer(inputValue, currentQuestion.item, userSynonyms)
        : validateReadingAnswer(inputValue, currentQuestion.item);

    if (result.finalizedInput !== undefined) {
      setInputValue(result.finalizedInput);
    }

    if (result.status === 'shake') {
      triggerShake(result.message ?? 'Periksa kembali jawabanmu.');
      return;
    }

    if (result.status === 'correct' || result.status === 'typo-accepted') {
      setAnswerState('correct');
      setFeedbackMsg(
        result.message ?? 'Tepat! Tekan Enter untuk melanjutkan.'
      );
      if (
        currentQuestion.kind === 'reading' &&
        state.settings.autoplayAudio
      ) {
        const audioTxt =
          currentQuestion.item.type === 'vocabulary'
            ? currentQuestion.item.readings?.[0]
            : currentQuestion.item.primaryReadingType === 'kunyomi'
            ? currentQuestion.item.kunyomi?.[0]
            : currentQuestion.item.onyomi?.[0];
        if (audioTxt) speakJapanese(audioTxt);
      }
    } else {
      setAnswerState('incorrect');
      setFeedbackMsg(
        currentQuestion.kind === 'meaning'
          ? `Jawaban benar: ${currentQuestion.item.primaryMeaning}`
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
    setPhase('study');
  };

  if (batch.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Semua Pelajaran Saat Ini Sudah Selesai
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Selesaikan Review Harian hingga item mencapai tahap Guru untuk membuka Kanji dan Kosakata baru.
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
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Sesi Pelajaran Selesai
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {batch.length} item telah dipindahkan ke tahap <strong>Apprentice I</strong>. Review pertamamu untuk item ini dijadwalkan dalam 4 jam.
          </p>

          <div className="flex flex-wrap justify-center gap-2.5 pt-2">
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

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
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
            <div className="text-xs font-medium text-white/85 mb-2">
              Level {qItem.level} · {getItemTypeLabel(qItem.type)}
            </div>
            <div className="font-jp text-6xl sm:text-7xl font-bold tracking-tight select-all">
              {qItem.characters}
            </div>
          </div>
        </div>

        {/* Prompt Bar */}
        <div className="bg-slate-900 text-white py-3 px-4 text-center text-sm font-semibold">
          {currentQuestion.kind === 'meaning' ? (
            <span>
              {getItemTypeLabel(qItem.type)} — <strong>Arti</strong> (Bahasa Indonesia / Inggris)
            </span>
          ) : (
            <span>
              {getItemTypeLabel(qItem.type)} —{' '}
              <strong>
                Bacaan{' '}
                {qItem.type === 'kanji'
                  ? qItem.primaryReadingType === 'kunyomi'
                    ? "(Kun'yomi)"
                    : "(On'yomi)"
                  : '(Hiragana)'}
              </strong>
            </span>
          )}
        </div>

        {/* Input & Feedback */}
        <div className="max-w-2xl w-full mx-auto px-4 py-8 flex-1 space-y-5">
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
                    ? 'Ketik arti...'
                    : 'Ketik romaji (otomatis ke ひらがな)...'
                }
                className={`w-full text-center text-xl sm:text-2xl py-4 px-12 rounded-xl border-2 transition-colors focus:outline-none ${
                  currentQuestion.kind === 'reading' ? 'font-jp' : 'font-body'
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
                {currentQuestion.kind === 'reading'
                  ? 'Mode IME Aktif: ketik romaji (contoh: ichi → いち)'
                  : 'Menerima arti Bahasa Indonesia maupun Bahasa Inggris'}
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

          {feedbackMsg && (
            <div
              className={`px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2.5 ${
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
              <span>{feedbackMsg}</span>
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
                    onClick={() => {
                      const txt =
                        qItem.type === 'vocabulary'
                          ? qItem.readings?.[0]
                          : qItem.primaryReadingType === 'kunyomi'
                          ? qItem.kunyomi?.[0]
                          : qItem.onyomi?.[0];
                      if (txt) speakJapanese(txt);
                    }}
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

  const primaryAudio =
    currentSlideItem.type === 'vocabulary'
      ? currentSlideItem.readings?.[0]
      : currentSlideItem.type === 'kanji'
      ? currentSlideItem.primaryReadingType === 'kunyomi'
        ? currentSlideItem.kunyomi?.[0]
        : currentSlideItem.onyomi?.[0]
      : null;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Banner Header */}
      <div className={`${bannerColor} text-white px-4 py-10 sm:py-12`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-white/85 mb-6">
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            className="inline-flex items-center gap-1.5 hover:text-white cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Beranda
          </button>
          <span className="font-mono-num">
            Pelajaran {slideIdx + 1} / {batch.length}
            {remainingLessonsAfterBatch.length > 0 &&
              ` · ${remainingLessonsAfterBatch.length} tersisa di antrean`}
          </span>
        </div>

        <div className="max-w-4xl mx-auto text-center space-y-2">
          <div className="text-xs font-medium text-white/85">
            Level {currentSlideItem.level} · {getItemTypeLabel(currentSlideItem.type)}
            {currentSlideItem.partOfSpeech ? ` · ${currentSlideItem.partOfSpeech}` : ''}
          </div>
          <div className="font-jp text-6xl sm:text-7xl font-bold leading-none select-all">
            {currentSlideItem.characters}
          </div>
          <div className="font-display text-2xl sm:text-3xl font-bold pt-1">
            {currentSlideItem.primaryMeaning}
          </div>
          {primaryAudio && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => speakJapanese(primaryAudio)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium transition-colors cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Putar Audio ({primaryAudio})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="bg-white dark:bg-[#161A22] border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => setSubTab('overview')}
            className={`py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'overview'
                ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {currentSlideItem.type === 'radical' ? 'Nama & Mnemonik' : 'Komponen & Arti'}
          </button>

          {currentSlideItem.type !== 'radical' && (
            <button
              type="button"
              onClick={() => setSubTab('reading')}
              className={`py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'reading'
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Cara Baca &amp; Mnemonik
            </button>
          )}

          <button
            type="button"
            onClick={() => setSubTab('context')}
            className={`py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'context'
                ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {currentSlideItem.type === 'vocabulary'
              ? 'Kalimat Contoh'
              : currentSlideItem.type === 'kanji'
              ? 'Contoh Kosakata'
              : 'Ditemukan di Kanji'}
          </button>
        </div>
      </div>

      {/* Main Study Panel */}
      <div className="max-w-4xl w-full mx-auto px-4 py-8 flex-1">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
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
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Bacaan Kosakata</div>
                    <div className="font-jp text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {currentSlideItem.readings?.join('、 ')}
                    </div>
                  </div>
                  {primaryAudio && (
                    <button
                      type="button"
                      onClick={() => speakJapanese(primaryAudio)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold hover:bg-[#6D28D9] cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" />
                      Dengarkan
                    </button>
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
                        <p className="text-sm text-slate-700 dark:text-slate-300">{s.id}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => speakJapanese(s.jp, 0.88)}
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
                          Level {dep.level} · {getItemTypeLabel(dep.type)}
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

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={slideIdx === 0}
              onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Sebelumnya
            </button>

            {!isLastSlide ? (
              <button
                type="button"
                onClick={() => setSlideIdx((i) => i + 1)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 cursor-pointer"
              >
                Berikutnya
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startQuiz}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
              >
                Mulai Kuis Pelajaran
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
