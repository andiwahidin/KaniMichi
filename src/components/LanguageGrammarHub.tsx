import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLangGrammarLoader } from '../data/langPackLoader';
import type { LangGrammarItem } from '../types/language';
import { formatArabicDisplay } from '../utils/arabic';
import { speakText, stopSpeech } from '../utils/audio';
import { SRS_STAGE_NAMES, formatRelativeTime } from '../utils/srs';
import { AiExplainButton } from './AiExplainButton';

type GrammarMode = 'browse' | 'review' | 'quiz';

interface LanguageGrammarHubProps {
  lang: 'en' | 'ar';
}

export const LanguageGrammarHub: React.FC<LanguageGrammarHubProps> = ({ lang }) => {
  const {
    state,
    now,
    setActiveView,
    completeLangSrsLessons,
    submitLangSrsReview,
    resurrectLangSrsItem,
    updateSettings,
  } = useApp();

  const [items, setItems] = useState<LangGrammarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<GrammarMode>('browse');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [trackFilter, setTrackFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Quiz / SRS Review state
  const [queue, setQueue] = useState<LangGrammarItem[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [done, setDone] = useState(false);

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
    setMode('browse');
    setCategoryFilter('all');
    setTrackFilter('all');
    stopSpeech();

    getLangGrammarLoader(lang)
      .loadAll()
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
        if (loaded.length > 0) setExpandedId(loaded[0].id);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat materi tata bahasa.');
        setLoading(false);
      });

    return () => {
      active = false;
      stopSpeech();
    };
  }, [lang]);

  const progressMap = state.langSrsProgress ?? {};

  const { categories, tracks, dueItems, learnedCount } = useMemo(() => {
    const catSet = new Set<string>();
    const trkSet = new Set<string>();
    const due: LangGrammarItem[] = [];
    let learned = 0;

    for (const item of items) {
      catSet.add(item.category);
      item.tracks.forEach((t) => trkSet.add(t));
      const p = progressMap[item.id];
      if (p && p.srsStage > 0) {
        learned += 1;
        if (p.srsStage < 9 && p.nextReviewAt !== null && p.nextReviewAt <= now) {
          due.push(item);
        }
      }
    }

    return {
      categories: Array.from(catSet),
      tracks: Array.from(trkSet),
      dueItems: due,
      learnedCount: learned,
    };
  }, [items, progressMap, now]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (trackFilter !== 'all' && !item.tracks.includes(trackFilter)) return false;
      return true;
    });
  }, [items, categoryFilter, trackFilter]);

  const renderText = (text: string) => (isAr ? formatArabicDisplay(text, showHarakat) : text);

  const startSrsReview = () => {
    if (dueItems.length === 0) return;
    setQueue([...dueItems]);
    setQIdx(0);
    setSelectedChoice(null);
    setSubmitted(false);
    setOutcomeNote(null);
    setScore({ correct: 0, total: 0 });
    setDone(false);
    setMode('review');
  };

  const startPracticeQuiz = (pool?: LangGrammarItem[]) => {
    const src = pool && pool.length > 0 ? pool : filteredItems.length > 0 ? filteredItems : items;
    if (src.length === 0) return;
    const picked = [...src].sort(() => Math.random() - 0.5).slice(0, Math.min(10, src.length));
    setQueue(picked);
    setQIdx(0);
    setSelectedChoice(null);
    setSubmitted(false);
    setOutcomeNote(null);
    setScore({ correct: 0, total: 0 });
    setDone(false);
    setMode('quiz');
  };

  const handleSelectAnswer = (choiceIdx: number) => {
    if (submitted) return;
    const current = queue[qIdx];
    const isCorrect = choiceIdx === current.quiz.correctIndex;
    setSelectedChoice(choiceIdx);
    setSubmitted(true);
    setScore((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    if (mode === 'review') {
      const outcome = submitLangSrsReview(current.id, lang, 'grammar', !isCorrect);
      setOutcomeNote(
        `${outcome.newStage > outcome.previousStage ? 'Naik ke' : 'Turun ke'} ${
          SRS_STAGE_NAMES[outcome.newStage]
        }`
      );
    } else {
      // Auto-register into SRS if user passes a brand-new grammar point during quiz
      const existing = progressMap[current.id];
      if (!existing && isCorrect) {
        completeLangSrsLessons(lang, 'grammar', [current.id]);
        setOutcomeNote('Tercatat dipelajari · Masuk SRS Apprentice 1');
      } else {
        setOutcomeNote(isCorrect ? 'Struktur tepat' : 'Pelajari catatan kaidah di bawah');
      }
    }
  };

  const handleNext = () => {
    stopSpeech();
    if (qIdx + 1 < queue.length) {
      setQIdx((i) => i + 1);
      setSelectedChoice(null);
      setSubmitted(false);
      setOutcomeNote(null);
    } else {
      setDone(true);
    }
  };

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
          Memuat materi {isAr ? 'Qawaid (Nahwu & Shorof)' : 'Grammar & Structure'}...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-600">{error}</p>
          <button
            type="button"
            onClick={() => setActiveView('lang-home')}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
          >
            Kembali
          </button>
        </div>
      </main>
    );
  }

  if (mode === 'review' || mode === 'quiz') {
    if (done) {
      const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
      return (
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-5">
            <Sparkles className="w-11 h-11 mx-auto text-sky-500" />
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {mode === 'review' ? 'Ulasan SRS Selesai' : 'Latihan Struktur Selesai'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Skor:{' '}
                <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                  {score.correct}/{score.total} ({pct}%)
                </span>
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setMode('browse')}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                Kembali ke Daftar Kaidah
              </button>
              <button
                type="button"
                onClick={() => startPracticeQuiz()}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer ${accentBtnClass}`}
              >
                Latihan Lagi
              </button>
            </div>
          </div>
        </main>
      );
    }

    const current = queue[qIdx];
    const isCorrectSelected = selectedChoice === current.quiz.correctIndex;
    const typeLabel =
      current.quiz.questionType === 'error-id'
        ? 'Written Expression · Identifikasi Kesalahan'
        : current.quiz.questionType === 'cloze'
        ? 'Sentence Completion / Cloze'
        : 'Structure & Grammar';

    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMode('browse')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Daftar Kaidah
          </button>
          <div className="text-xs font-semibold font-mono-num text-slate-500">
            {mode === 'review' ? 'Ulasan SRS' : 'Kuis Struktur'} · {qIdx + 1} / {queue.length}
          </div>
        </div>

        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {current.category} · {typeLabel}
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {current.quiz.prompt}
            </p>
          </div>

          <div
            dir={isAr ? 'rtl' : 'ltr'}
            className={`p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white ${
              isAr ? 'font-ar text-2xl' : 'text-base font-medium leading-relaxed'
            }`}
          >
            {renderText(current.quiz.sentence)}
          </div>

          <div className="space-y-2.5">
            {current.quiz.choices.map((choice, cIdx) => {
              const isSelected = selectedChoice === cIdx;
              const isCorrect = cIdx === current.quiz.correctIndex;
              let style =
                'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200';
              if (submitted) {
                if (isCorrect) {
                  style =
                    'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200';
                } else if (isSelected) {
                  style =
                    'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200';
                } else {
                  style = 'border-slate-200 dark:border-slate-800 opacity-55';
                }
              }
              return (
                <button
                  key={choice}
                  type="button"
                  disabled={submitted}
                  onClick={() => handleSelectAnswer(cIdx)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${style}`}
                >
                  <span className="font-mono-num font-bold mr-2.5">
                    {String.fromCharCode(65 + cIdx)}.
                  </span>
                  <span dir={isAr ? 'rtl' : 'ltr'} className={isAr ? 'font-ar text-lg' : ''}>
                    {renderText(choice)}
                  </span>
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
                  {current.title}
                </span>
                {outcomeNote && (
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {outcomeNote}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {current.quiz.explanationId}
              </p>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Pola: <span className="font-semibold text-slate-800 dark:text-slate-200">{current.formula}</span>
              </div>
              <AiExplainButton
                language={lang}
                examContext={current.tracks.join(' / ').toUpperCase()}
                content={`Kaidah: ${current.title}\nPola: ${current.formula}\nKalimat: ${current.quiz.sentence}\nJawaban benar: ${current.quiz.choices[current.quiz.correctIndex]}\nPembahasan: ${current.quiz.explanationId}`}
                label="Jelaskan Lebih Sederhana & Beri Contoh Baru (AI)"
                compact
              />
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleNext}
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

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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
            {isAr ? 'Qawaid: Nahwu, Shorof & Tarakib TOAFL' : 'Grammar, Structure & Written Expression'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isAr
              ? 'Kaidah i’rab, jumlah ismiyah/fi’liyah, nawasikh, manshubat, dan shorof lengkap dengan latihan Tarakib TOAFL.'
              : 'Struktur kunci TOEFL ITP (Structure & Error-ID), TOEIC Part 5–6 Cloze, dan IELTS Academic Grammar.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAr && (
            <button
              type="button"
              onClick={() => updateSettings({ arabicShowHarakat: !showHarakat })}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Tampilan: {showHarakat ? 'Harakat Penuh' : 'Teks Gundul'}
            </button>
          )}
          <button
            type="button"
            disabled={dueItems.length === 0}
            onClick={startSrsReview}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 disabled:opacity-40 cursor-pointer"
          >
            Ulasan SRS ({dueItems.length})
          </button>
          <button
            type="button"
            onClick={() => startPracticeQuiz()}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
          >
            Mulai Kuis {isAr ? 'Tarakib' : 'Structure'} (10 Soal)
          </button>
        </div>
      </div>

      {/* Summary & Filters */}
      <section className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
          Kaidah Dipelajari:{' '}
          <span className="font-mono-num text-slate-900 dark:text-white">
            {learnedCount} / {items.length}
          </span>{' '}
          · Jatuh Tempo SRS:{' '}
          <span className={`font-mono-num ${accentTextClass}`}>{dueItems.length}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Jalur Ujian</option>
            {tracks.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Topik ({items.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Accordion Lesson Cards */}
      <section className="space-y-3">
        {filteredItems.map((item) => {
          const isOpen = expandedId === item.id;
          const prog = progressMap[item.id];
          const stage = prog?.srsStage ?? 0;

          return (
            <div
              key={item.id}
              className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : item.id)}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {item.category} · {item.tracks.map((t) => t.toUpperCase()).join(' · ')}
                    {stage > 0 && ` · ${SRS_STAGE_NAMES[stage]}`}
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-base font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </span>
                    {item.nativeTitle && (
                      <span
                        dir={isAr ? 'rtl' : 'ltr'}
                        className={
                          isAr
                            ? 'font-ar text-lg text-[#059669] dark:text-emerald-400'
                            : 'text-xs font-mono-num text-slate-500'
                        }
                      >
                        {renderText(item.nativeTitle)}
                      </span>
                    )}
                  </div>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Rumus / Pola Utama
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {item.formula}
                    </div>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {item.explanationId}
                  </p>

                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span className={`font-bold ${accentTextClass}`}>Tips Ujian: </span>
                    {item.keyTip}
                  </div>

                  <div className="space-y-2.5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Contoh Kalimat
                    </div>
                    {item.examples.map((ex, exIdx) => (
                      <div
                        key={exIdx}
                        className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <p
                            dir={isAr ? 'rtl' : 'ltr'}
                            className={
                              isAr
                                ? 'font-ar text-xl text-slate-900 dark:text-white'
                                : 'text-sm font-medium text-slate-900 dark:text-white'
                            }
                          >
                            {renderText(ex.sentence)}
                          </p>
                          {ex.transliteration && (
                            <p className="text-xs font-mono-num text-slate-500">
                              {ex.transliteration}
                            </p>
                          )}
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {ex.translationId}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => speakText(ex.sentence, ttsLocale, isAr ? 0.88 : 0.94)}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                          aria-label="Putar audio contoh"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500">
                      {stage === 0
                        ? 'Belum masuk antrean SRS'
                        : stage === 9
                        ? 'Status: Burned'
                        : `${SRS_STAGE_NAMES[stage]} · Ulasan berikut ${
                            prog?.nextReviewAt ? formatRelativeTime(prog.nextReviewAt, now) : ''
                          }`}
                    </div>
                    <div className="flex items-center gap-2">
                      {stage === 0 && (
                        <button
                          type="button"
                          onClick={() => completeLangSrsLessons(lang, 'grammar', [item.id])}
                          className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Tandai Sudah Dipelajari (SRS)
                        </button>
                      )}
                      {stage === 9 && (
                        <button
                          type="button"
                          onClick={() => resurrectLangSrsItem(item.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Bangkitkan
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startPracticeQuiz([item])}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
                      >
                        Uji Kaidah Ini
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
};
