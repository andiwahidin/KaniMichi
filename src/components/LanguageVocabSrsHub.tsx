import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flame,
  RotateCcw,
  Search,
  Sparkles,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLangVocabLoader } from '../data/langPackLoader';
import type { LangVocabItem } from '../types/language';
import { formatArabicDisplay } from '../utils/arabic';
import { speakText, stopSpeech } from '../utils/audio';
import { SRS_STAGE_NAMES, formatRelativeTime } from '../utils/srs';

type HubMode = 'overview' | 'lesson' | 'review' | 'drill';

interface LanguageVocabSrsHubProps {
  lang: 'en' | 'ar';
}

export const LanguageVocabSrsHub: React.FC<LanguageVocabSrsHubProps> = ({ lang }) => {
  const {
    state,
    now,
    setActiveView,
    completeLangSrsLessons,
    submitLangSrsReview,
    resurrectLangSrsItem,
    updateSettings,
  } = useApp();

  const [items, setItems] = useState<LangVocabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<HubMode>('overview');
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'due' | 'learning' | 'burned'>(
    'all'
  );

  // Lesson session state
  const [lessonBatch, setLessonBatch] = useState<LangVocabItem[]>([]);
  const [lessonPhase, setLessonPhase] = useState<'study' | 'quiz' | 'done'>('study');
  const [lessonIdx, setLessonIdx] = useState(0);
  const [quizChoice, setQuizChoice] = useState<number | null>(null);
  const [quizVerified, setQuizVerified] = useState(false);

  // Review / Drill session state
  const [queue, setQueue] = useState<LangVocabItem[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [lastOutcomeText, setLastOutcomeText] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 });
  const [sessionDone, setSessionDone] = useState(false);

  const isAr = lang === 'ar';
  const showHarakat = state.settings.arabicShowHarakat !== false;
  const enAccent = state.settings.englishAccent ?? 'en-US';
  const ttsLocale = isAr ? 'ar-SA' : enAccent;
  const accentBtnClass = isAr
    ? 'bg-[#059669] hover:bg-[#047857] text-white'
    : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white';
  const accentTextClass = isAr
    ? 'text-[#059669] dark:text-emerald-400'
    : 'text-[#2563EB] dark:text-blue-400';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setMode('overview');
    setSearch('');
    setTrackFilter('all');
    setStatusFilter('all');
    stopSpeech();

    getLangVocabLoader(lang)
      .loadAll()
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat daftar kosakata.');
        setLoading(false);
      });

    return () => {
      active = false;
      stopSpeech();
    };
  }, [lang]);

  const progressMap = state.langSrsProgress ?? {};

  const { newItems, dueItems, learnedCount, burnedCount, allTracks } = useMemo(() => {
    const newArr: LangVocabItem[] = [];
    const dueArr: LangVocabItem[] = [];
    let learned = 0;
    let burned = 0;
    const trackSet = new Set<string>();

    for (const item of items) {
      item.tracks.forEach((t) => trackSet.add(t));
      const p = progressMap[item.id];
      if (!p || p.srsStage === 0) {
        newArr.push(item);
      } else {
        learned += 1;
        if (p.srsStage === 9) {
          burned += 1;
        } else if (p.nextReviewAt !== null && p.nextReviewAt <= now) {
          dueArr.push(item);
        }
      }
    }

    return {
      newItems: newArr,
      dueItems: dueArr,
      learnedCount: learned,
      burnedCount: burned,
      allTracks: Array.from(trackSet),
    };
  }, [items, progressMap, now]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (trackFilter !== 'all' && !item.tracks.includes(trackFilter)) return false;
      const p = progressMap[item.id];
      if (statusFilter === 'new' && p && p.srsStage > 0) return false;
      if (
        statusFilter === 'due' &&
        (!p || p.srsStage <= 0 || p.srsStage >= 9 || p.nextReviewAt === null || p.nextReviewAt > now)
      ) {
        return false;
      }
      if (statusFilter === 'learning' && (!p || p.srsStage <= 0 || p.srsStage >= 9)) return false;
      if (statusFilter === 'burned' && (!p || p.srsStage !== 9)) return false;

      if (!q) return true;
      return (
        item.term.toLowerCase().includes(q) ||
        item.phonetic.toLowerCase().includes(q) ||
        item.meaningId.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [items, trackFilter, statusFilter, search, progressMap, now]);

  const displayWord = (text: string) => (isAr ? formatArabicDisplay(text, showHarakat) : text);

  const playWordAudio = (text: string) => {
    speakText(text, ttsLocale, isAr ? 0.88 : 0.94);
  };

  const startLessonSession = (customBatch?: LangVocabItem[]) => {
    const batch = customBatch ?? newItems.slice(0, 5);
    if (batch.length === 0) return;
    setLessonBatch(batch);
    setLessonPhase('study');
    setLessonIdx(0);
    setQuizChoice(null);
    setQuizVerified(false);
    setMode('lesson');
  };

  const startReviewSession = () => {
    if (dueItems.length === 0) return;
    setQueue([...dueItems]);
    setQIdx(0);
    setSelectedChoice(null);
    setSubmitted(false);
    setLastOutcomeText(null);
    setSessionStats({ correct: 0, wrong: 0 });
    setSessionDone(false);
    setMode('review');
  };

  const startDrillSession = () => {
    const pool = filteredItems.length > 0 ? filteredItems : items;
    if (pool.length === 0) return;
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(10, pool.length));
    setQueue(shuffled);
    setQIdx(0);
    setSelectedChoice(null);
    setSubmitted(false);
    setLastOutcomeText(null);
    setSessionStats({ correct: 0, wrong: 0 });
    setSessionDone(false);
    setMode('drill');
  };

  const handleLessonNextStudy = () => {
    stopSpeech();
    if (lessonIdx + 1 < lessonBatch.length) {
      setLessonIdx((i) => i + 1);
    } else {
      setLessonPhase('quiz');
      setLessonIdx(0);
      setQuizChoice(null);
      setQuizVerified(false);
    }
  };

  const handleLessonQuizSubmit = (choiceIdx: number) => {
    if (quizVerified) return;
    const current = lessonBatch[lessonIdx];
    setQuizChoice(choiceIdx);
    if (choiceIdx === current.quiz.correctIndex) {
      setQuizVerified(true);
    }
  };

  const handleLessonQuizContinue = () => {
    stopSpeech();
    if (lessonIdx + 1 < lessonBatch.length) {
      setLessonIdx((i) => i + 1);
      setQuizChoice(null);
      setQuizVerified(false);
    } else {
      completeLangSrsLessons(
        lang,
        'vocab',
        lessonBatch.map((b) => b.id)
      );
      setLessonPhase('done');
    }
  };

  const handleReviewAnswer = (choiceIdx: number) => {
    if (submitted) return;
    const current = queue[qIdx];
    const isCorrect = choiceIdx === current.quiz.correctIndex;
    setSelectedChoice(choiceIdx);
    setSubmitted(true);
    setSessionStats((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      wrong: prev.wrong + (isCorrect ? 0 : 1),
    }));

    if (mode === 'review') {
      const outcome = submitLangSrsReview(current.id, lang, 'vocab', !isCorrect);
      const arrow = outcome.newStage > outcome.previousStage ? 'Naik ke' : 'Turun ke';
      setLastOutcomeText(`${arrow} ${SRS_STAGE_NAMES[outcome.newStage]}`);
    } else {
      setLastOutcomeText(isCorrect ? 'Jawaban tepat (Latihan Kilat)' : 'Perlu diingat kembali');
    }
  };

  const handleReviewNext = () => {
    stopSpeech();
    if (qIdx + 1 < queue.length) {
      setQIdx((i) => i + 1);
      setSelectedChoice(null);
      setSubmitted(false);
      setLastOutcomeText(null);
    } else {
      setSessionDone(true);
    }
  };

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
          Memuat bank {isAr ? 'Mufradat Arab Fusha' : 'Kosakata Akademik & Bisnis Inggris'}...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
          <button
            type="button"
            onClick={() => setActiveView('lang-home')}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
          >
            Kembali ke Beranda Bahasa
          </button>
        </div>
      </main>
    );
  }

  // LESSON MODE
  if (mode === 'lesson') {
    if (lessonPhase === 'done') {
      return (
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-5">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
            <div className="space-y-1.5">
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Pelajaran Kosakata Selesai
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <span className="font-mono-num font-bold">{lessonBatch.length}</span>{' '}
                {isAr ? 'mufradat' : 'kosakata'} kini aktif di antrean SRS (Apprentice 1) dan siap
                diulang sesuai jadwal.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMode('overview')}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Kembali ke Katalog
              </button>
              {newItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => startLessonSession()}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer ${accentBtnClass}`}
                >
                  Lanjut 5 Kata Berikutnya
                </button>
              )}
            </div>
          </div>
        </main>
      );
    }

    const current = lessonBatch[lessonIdx];

    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              setMode('overview');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Keluar Pelajaran
          </button>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono-num">
            {lessonPhase === 'study' ? 'Tahap 1 · Mempelajari' : 'Tahap 2 · Kuis Konfirmasi'} ·{' '}
            {lessonIdx + 1} / {lessonBatch.length}
          </div>
        </div>

        {lessonPhase === 'study' ? (
          <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-6 sm:p-8 border-b border-slate-200 dark:border-slate-800 text-center space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {current.category} · {current.partOfSpeech}
              </div>
              <div
                dir={isAr ? 'rtl' : 'ltr'}
                className={`font-bold text-slate-900 dark:text-white ${
                  isAr ? 'font-ar text-4xl sm:text-5xl' : 'font-display text-3xl sm:text-4xl'
                }`}
              >
                {displayWord(current.term)}
              </div>
              <div className="flex items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <span className="font-mono-num">{current.phonetic}</span>
                <button
                  type="button"
                  onClick={() => playWordAudio(current.term)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Dengar Audio
                </button>
              </div>
              <div className={`text-lg font-bold ${accentTextClass}`}>{current.meaningId}</div>
            </div>

            <div className="p-6 sm:p-8 space-y-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Penjelasan & Nuansa Pemakaian
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {current.definition}
                </p>
              </div>

              {isAr && (current.root || current.plural) && (
                <div className="grid grid-cols-2 gap-4 pt-1">
                  {current.root && (
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Akar Kata (Tsulatsi)
                      </div>
                      <div dir="rtl" className="font-ar text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                        {current.root}
                      </div>
                    </div>
                  )}
                  {current.plural && (
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Bentuk Jamak
                      </div>
                      <div dir="rtl" className="font-ar text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                        {displayWord(current.plural)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {current.collocations && current.collocations.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    {isAr ? 'Turunan & Kolokasi Umum' : 'Kolokasi & Frasa Akademik'}
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    {current.collocations.map((c, idx) => (
                      <span key={c}>
                        {idx > 0 && ' · '}
                        <span dir={isAr ? 'rtl' : 'ltr'} className={isAr ? 'font-ar text-base' : ''}>
                          {displayWord(c)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Contoh Kalimat
                  </span>
                  <button
                    type="button"
                    onClick={() => playWordAudio(current.exampleSentence)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Putar Kalimat
                  </button>
                </div>
                <p
                  dir={isAr ? 'rtl' : 'ltr'}
                  className={
                    isAr
                      ? 'font-ar text-xl text-slate-900 dark:text-white'
                      : 'text-sm font-medium text-slate-900 dark:text-white'
                  }
                >
                  {displayWord(current.exampleSentence)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {current.exampleTranslationId}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={lessonIdx === 0}
                  onClick={() => setLessonIdx((i) => Math.max(0, i - 1))}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={handleLessonNextStudy}
                  className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer ${accentBtnClass}`}
                >
                  {lessonIdx + 1 < lessonBatch.length ? 'Kata Berikutnya' : 'Mulai Kuis Konfirmasi'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-5">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Kuis Konfirmasi Pelajaran
              </div>
              <div
                dir={isAr ? 'rtl' : 'ltr'}
                className={`font-bold text-slate-900 dark:text-white ${
                  isAr ? 'font-ar text-3xl' : 'font-display text-2xl'
                }`}
              >
                {displayWord(current.term)}
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{current.quiz.prompt}</p>
            </div>

            <div className="space-y-2.5">
              {current.quiz.choices.map((choice, cIdx) => {
                const isSelected = quizChoice === cIdx;
                const isCorrect = cIdx === current.quiz.correctIndex;
                let btnStyle =
                  'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200';
                if (quizVerified && isCorrect) {
                  btnStyle =
                    'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200';
                } else if (isSelected && !isCorrect) {
                  btnStyle =
                    'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200';
                }
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => handleLessonQuizSubmit(cIdx)}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${btnStyle}`}
                  >
                    <span className="font-mono-num font-bold mr-2.5">
                      {String.fromCharCode(65 + cIdx)}.
                    </span>
                    <span dir={isAr ? 'auto' : 'ltr'}>{displayWord(choice)}</span>
                  </button>
                );
              })}
            </div>

            {quizChoice !== null && !quizVerified && (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                Belum tepat — coba pilih jawaban yang paling sesuai dengan arti & konteks kata.
              </p>
            )}

            {quizVerified && (
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 space-y-2">
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Tepat sekali!
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {current.quiz.explanationId}
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleLessonQuizContinue}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
                  >
                    {lessonIdx + 1 < lessonBatch.length ? 'Soal Berikutnya' : 'Selesaikan & Masuk SRS'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    );
  }

  // REVIEW OR DRILL MODE
  if (mode === 'review' || mode === 'drill') {
    if (sessionDone) {
      const total = sessionStats.correct + sessionStats.wrong;
      const pct = total > 0 ? Math.round((sessionStats.correct / total) * 100) : 0;
      return (
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-5">
            <Sparkles className="w-11 h-11 mx-auto text-sky-500" />
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {mode === 'review' ? 'Sesi Ulasan SRS Selesai' : 'Latihan Kilat Selesai'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Akurasi sesi:{' '}
                <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                  {sessionStats.correct}/{total} ({pct}%)
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMode('overview')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer ${accentBtnClass}`}
            >
              Kembali ke Katalog Kosakata
            </button>
          </div>
        </main>
      );
    }

    const current = queue[qIdx];
    const isCorrectSelected = selectedChoice === current.quiz.correctIndex;

    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              setMode('overview');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Akhiri Sesi
          </button>
          <div className="text-xs font-semibold text-slate-500 font-mono-num">
            {mode === 'review' ? 'Ulasan SRS' : 'Latihan Kilat'} · {qIdx + 1} / {queue.length}
          </div>
        </div>

        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {current.category} · {current.partOfSpeech}
              </div>
              <div
                dir={isAr ? 'rtl' : 'ltr'}
                className={`font-bold text-slate-900 dark:text-white ${
                  isAr ? 'font-ar text-4xl' : 'font-display text-3xl'
                }`}
              >
                {displayWord(current.term)}
              </div>
              <div className="text-xs font-mono-num text-slate-500">{current.phonetic}</div>
            </div>
            <button
              type="button"
              onClick={() => playWordAudio(current.term)}
              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Putar audio kata"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {current.quiz.prompt}
          </p>

          <div className="space-y-2.5">
            {current.quiz.choices.map((choice, cIdx) => {
              const isSelected = selectedChoice === cIdx;
              const isCorrect = cIdx === current.quiz.correctIndex;
              let btnStyle =
                'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200';
              if (submitted) {
                if (isCorrect) {
                  btnStyle =
                    'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200';
                } else if (isSelected) {
                  btnStyle =
                    'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200';
                } else {
                  btnStyle = 'border-slate-200 dark:border-slate-800 opacity-55';
                }
              }
              return (
                <button
                  key={choice}
                  type="button"
                  disabled={submitted}
                  onClick={() => handleReviewAnswer(cIdx)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${btnStyle}`}
                >
                  <span className="font-mono-num font-bold mr-2.5">
                    {String.fromCharCode(65 + cIdx)}.
                  </span>
                  <span dir={isAr ? 'auto' : 'ltr'}>{displayWord(choice)}</span>
                </button>
              );
            })}
          </div>

          {submitted && (
            <div
              className={`p-4 rounded-lg border space-y-2 ${
                isCorrectSelected
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900'
                  : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                    isCorrectSelected
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {isCorrectSelected ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  {isCorrectSelected ? 'Jawaban Benar' : `Jawaban Kurang Tepat · Arti: ${current.meaningId}`}
                </span>
                {lastOutcomeText && (
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {lastOutcomeText}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                {current.quiz.explanationId}
              </p>
              <p
                dir={isAr ? 'rtl' : 'ltr'}
                className={`pt-1 text-slate-700 dark:text-slate-300 ${
                  isAr ? 'font-ar text-lg' : 'text-xs italic'
                }`}
              >
                {displayWord(current.exampleSentence)}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleReviewNext}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
                >
                  {qIdx + 1 < queue.length ? 'Soal Berikutnya' : 'Lihat Ringkasan'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // OVERVIEW / CATALOG MODE
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setActiveView('lang-home')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Beranda {isAr ? 'Bahasa Arab' : 'Bahasa Inggris'}
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {isAr ? 'Mufradat & Akar Kata SRS (TOAFL)' : 'Academic & Business Vocabulary SRS'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isAr
              ? 'Penguasaan kosakata Arab Fusha berbasis SRS dengan akar kata tsulatsi, jamak, dan audio TTS.'
              : 'Kosakata inti Academic Word List (TOEFL/IELTS) dan korporasi (TOEIC) dengan ulasan terjadwal SRS.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAr ? (
            <button
              type="button"
              onClick={() => updateSettings({ arabicShowHarakat: !showHarakat })}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Tampilan: {showHarakat ? 'Harakat Penuh' : 'Teks Gundul'}
            </button>
          ) : (
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => updateSettings({ englishAccent: 'en-US' })}
                className={`px-3 py-1.5 rounded-md cursor-pointer ${
                  enAccent === 'en-US'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                US Audio
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ englishAccent: 'en-GB' })}
                className={`px-3 py-1.5 rounded-md cursor-pointer ${
                  enAccent === 'en-GB'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                UK Audio
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Action Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pelajaran Baru
            </div>
            <div className="font-mono-num text-3xl font-bold text-slate-900 dark:text-white mt-1">
              {newItems.length}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Pelajari 5 kata per sesi dengan contoh kalimat & kuis konfirmasi.
            </p>
          </div>
          <button
            type="button"
            disabled={newItems.length === 0}
            onClick={() => startLessonSession()}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 cursor-pointer ${accentBtnClass}`}
          >
            {newItems.length > 0
              ? `Mulai Pelajaran (${Math.min(5, newItems.length)} kata)`
              : 'Semua Kata Sudah Dipelajari'}
          </button>
        </div>

        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Ulasan SRS Jatuh Tempo
            </div>
            <div className="font-mono-num text-3xl font-bold text-slate-900 dark:text-white mt-1">
              {dueItems.length}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Dipelajari: <span className="font-mono-num font-semibold">{learnedCount}/{items.length}</span> ·
              Burned: <span className="font-mono-num font-semibold">{burnedCount}</span>
            </p>
          </div>
          <button
            type="button"
            disabled={dueItems.length === 0}
            onClick={startReviewSession}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 disabled:opacity-40 cursor-pointer"
          >
            {dueItems.length > 0 ? `Mulai Ulasan SRS (${dueItems.length})` : 'Belum Ada Ulasan Due'}
          </button>
        </div>

        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Latihan Kilat Bebas
            </div>
            <div className="font-mono-num text-3xl font-bold text-slate-900 dark:text-white mt-1">
              {items.length}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Latihan 10 soal acak kapan saja tanpa mengubah jadwal SRS.
            </p>
          </div>
          <button
            type="button"
            onClick={startDrillSession}
            className="w-full py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            Mulai Latihan 10 Soal
          </button>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isAr
                ? 'Cari mufradat, transliterasi, arti, atau kategori...'
                : 'Cari kosakata, fonetik, arti, atau kategori...'
            }
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Jalur Ujian</option>
            {allTracks.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'new' | 'due' | 'learning' | 'burned')
            }
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Status ({items.length})</option>
            <option value="new">Belum Dipelajari ({newItems.length})</option>
            <option value="due">Siap Ulasan ({dueItems.length})</option>
            <option value="learning">Sedang Dipelajari</option>
            <option value="burned">Burned ({burnedCount})</option>
          </select>
        </div>
      </section>

      {/* Catalog Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => {
          const prog = progressMap[item.id];
          const stage = prog?.srsStage ?? 0;
          const isDue = stage > 0 && stage < 9 && prog?.nextReviewAt !== null && prog.nextReviewAt <= now;

          return (
            <div
              key={item.id}
              className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {item.category} · {item.tracks.map((t) => t.toUpperCase()).join(' · ')}
                    </div>
                    <div
                      dir={isAr ? 'rtl' : 'ltr'}
                      className={`font-bold text-slate-900 dark:text-white mt-1 ${
                        isAr ? 'font-ar text-2xl' : 'font-display text-xl'
                      }`}
                    >
                      {displayWord(item.term)}
                    </div>
                    <div className="text-xs font-mono-num text-slate-500">{item.phonetic}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => playWordAudio(item.term)}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                    aria-label={`Putar ${item.term}`}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                <div className={`text-sm font-bold ${accentTextClass}`}>{item.meaningId}</div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.definition}
                </p>

                {isAr && (item.root || item.plural) && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                    {item.root && (
                      <span>
                        Akar: <span dir="rtl" className="font-ar text-sm text-slate-800 dark:text-slate-200">{item.root}</span>
                      </span>
                    )}
                    {item.plural && (
                      <span>
                        Jamak: <span dir="rtl" className="font-ar text-sm text-slate-800 dark:text-slate-200">{displayWord(item.plural)}</span>
                      </span>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1">
                  <p
                    dir={isAr ? 'rtl' : 'ltr'}
                    className={
                      isAr
                        ? 'font-ar text-base text-slate-800 dark:text-slate-200'
                        : 'text-xs text-slate-700 dark:text-slate-300'
                    }
                  >
                    {displayWord(item.exampleSentence)}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {item.exampleTranslationId}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  {stage === 9 ? (
                    <>
                      <Flame className="w-3.5 h-3.5 text-amber-500" />
                      Burned
                    </>
                  ) : stage === 0 ? (
                    <>
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      Belum Dipelajari
                    </>
                  ) : isDue ? (
                    <span className={accentTextClass}>Siap Ulasan · {SRS_STAGE_NAMES[stage]}</span>
                  ) : (
                    <span>
                      {SRS_STAGE_NAMES[stage]} ·{' '}
                      {prog?.nextReviewAt ? formatRelativeTime(prog.nextReviewAt, now) : ''}
                    </span>
                  )}
                </span>

                {stage === 0 && (
                  <button
                    type="button"
                    onClick={() => startLessonSession([item])}
                    className={`font-semibold hover:underline cursor-pointer ${accentTextClass}`}
                  >
                    Pelajari
                  </button>
                )}
                {stage === 9 && (
                  <button
                    type="button"
                    onClick={() => resurrectLangSrsItem(item.id)}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-white font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Bangkitkan
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
};
