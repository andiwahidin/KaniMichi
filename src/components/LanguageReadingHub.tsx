import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  RotateCcw,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLangReadingLoader } from '../data/langPackLoader';
import type { LangReadingPassage } from '../types/language';
import { formatArabicDisplay } from '../utils/arabic';
import { speakText, stopSpeech } from '../utils/audio';
import { AiExplainButton } from './AiExplainButton';

interface LanguageReadingHubProps {
  lang: 'en' | 'ar';
}

export const LanguageReadingHub: React.FC<LanguageReadingHubProps> = ({ lang }) => {
  const { state, setActiveView, recordLangPractice, updateSettings } = useApp();

  const [passages, setPassages] = useState<LangReadingPassage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trackFilter, setTrackFilter] = useState('all');
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

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
    setActivePassageId(null);
    setTrackFilter('all');
    stopSpeech();

    getLangReadingLoader(lang)
      .loadAll()
      .then((loaded) => {
        if (!active) return;
        setPassages(loaded);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat naskah bacaan.');
        setLoading(false);
      });

    return () => {
      active = false;
      stopSpeech();
    };
  }, [lang]);

  useEffect(() => {
    if (!activePassageId || submitted) return;
    const id = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [activePassageId, submitted]);

  const practiceMap = state.langPracticeProgress ?? {};

  const tracks = useMemo(() => {
    const set = new Set<string>();
    passages.forEach((p) => p.tracks.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [passages]);

  const filteredPassages = useMemo(() => {
    if (trackFilter === 'all') return passages;
    return passages.filter((p) => p.tracks.includes(trackFilter));
  }, [passages, trackFilter]);

  const activePassage = useMemo(
    () => passages.find((p) => p.id === activePassageId) ?? null,
    [passages, activePassageId]
  );

  const renderText = (text: string) => (isAr ? formatArabicDisplay(text, showHarakat) : text);

  const openPassage = (passage: LangReadingPassage) => {
    stopSpeech();
    setActivePassageId(passage.id);
    setAnswers({});
    setSubmitted(false);
    setShowGlossary(false);
    setElapsedSec(0);
  };

  const handleSubmit = () => {
    if (!activePassage || submitted) return;
    let correct = 0;
    for (const q of activePassage.questions) {
      if (answers[q.id] === q.correctIndex) correct += 1;
    }
    setSubmitted(true);
    recordLangPractice(
      activePassage.id,
      lang,
      'reading',
      correct,
      activePassage.questions.length,
      elapsedSec
    );
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
          Memuat paket {isAr ? 'Qira’ah Fusha (TOAFL)' : 'Academic & Business Reading'}...
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

  // ACTIVE PASSAGE READER + COMPREHENSION QUESTIONS
  if (activePassage) {
    const answeredCount = Object.keys(answers).length;
    const totalQ = activePassage.questions.length;
    const correctCount = submitted
      ? activePassage.questions.filter((q) => answers[q.id] === q.correctIndex).length
      : 0;

    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Sticky Reader Toolbar */}
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              setActivePassageId(null);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Daftar Naskah
          </button>

          <div className="flex flex-wrap items-center gap-3">
            {isAr && (
              <button
                type="button"
                onClick={() => updateSettings({ arabicShowHarakat: !showHarakat })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                {showHarakat ? 'Tampilkan Teks Gundul' : 'Tampilkan Harakat Penuh'}
              </button>
            )}

            {activePassage.vocabularyGlossary && activePassage.vocabularyGlossary.length > 0 && (
              <button
                type="button"
                onClick={() => setShowGlossary((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                {showGlossary ? 'Sembunyikan Glosarium' : 'Glosarium Kata'}
              </button>
            )}

            <span className="inline-flex items-center gap-1.5 text-xs font-mono-num font-semibold text-slate-600 dark:text-slate-300">
              <Clock className="w-3.5 h-3.5" />
              {formatTimer(elapsedSec)}
            </span>
          </div>
        </div>

        {/* Two-column reading layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Passage Panel */}
          <article className="lg:col-span-7 bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-5">
            <div className="space-y-1.5 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="text-xs font-semibold text-slate-500">
                {activePassage.genre} · {activePassage.tracks.map((t) => t.toUpperCase()).join(' · ')} ·
                Estimasi {activePassage.recommendedMinutes} menit
              </div>
              <div className="flex items-start justify-between gap-3">
                <h1
                  dir={isAr ? 'rtl' : 'ltr'}
                  className={`font-bold text-slate-900 dark:text-white ${
                    isAr ? 'font-ar text-2xl sm:text-3xl flex-1' : 'font-display text-xl sm:text-2xl'
                  }`}
                >
                  {renderText(activePassage.title)}
                </h1>
                <button
                  type="button"
                  onClick={() =>
                    speakText(activePassage.paragraphs.join(' '), ttsLocale, isAr ? 0.86 : 0.92)
                  }
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                  aria-label="Bacakan teks dengan TTS"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {activePassage.paragraphs.map((para, pIdx) => (
                <p
                  key={pIdx}
                  dir={isAr ? 'rtl' : 'ltr'}
                  className={
                    isAr
                      ? 'font-ar text-xl sm:text-2xl text-slate-800 dark:text-slate-100'
                      : 'text-[15px] leading-relaxed text-slate-800 dark:text-slate-200'
                  }
                >
                  {renderText(para)}
                </p>
              ))}
            </div>

            {submitted && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <AiExplainButton
                  language={lang}
                  examContext={activePassage.tracks.join(' / ').toUpperCase()}
                  content={`Judul: ${activePassage.title}\nTeks:\n${activePassage.paragraphs.join('\n')}`}
                  label="Terjemahkan & Ringkas Wacana ke Bahasa Indonesia (AI)"
                />
              </div>
            )}

            {showGlossary && activePassage.vocabularyGlossary && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Glosarium Kata Kunci
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activePassage.vocabularyGlossary.map((g) => (
                    <div
                      key={g.term}
                      className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
                    >
                      <div
                        dir={isAr ? 'rtl' : 'ltr'}
                        className={`font-bold text-slate-900 dark:text-white ${
                          isAr ? 'font-ar text-lg' : 'text-sm'
                        }`}
                      >
                        {renderText(g.term)}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">{g.meaningId}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>

          {/* Questions Panel */}
          <section className="lg:col-span-5 space-y-4">
            {submitted && (
              <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Hasil Pemahaman Bacaan
                  </div>
                  <div className="font-mono-num text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                    {correctCount} / {totalQ} Benar ({Math.round((correctCount / totalQ) * 100)}%)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openPassage(activePassage)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Ulangi
                </button>
              </div>
            )}

            {activePassage.questions.map((q, qIdx) => {
              const chosen = answers[q.id];
              const isCorrect = chosen === q.correctIndex;
              const qTypeLabel =
                q.questionType === 'tfng'
                  ? 'True / False / Not Given'
                  : q.questionType === 'inference'
                  ? 'Inferensi'
                  : q.questionType === 'vocab'
                  ? 'Kosakata Kontekstual'
                  : 'Pemahaman Detail';

              return (
                <div
                  key={q.id}
                  className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
                >
                  <div className="text-[11px] font-semibold text-slate-500">
                    Soal {qIdx + 1} · {qTypeLabel}
                  </div>
                  <p
                    dir={isAr ? 'auto' : 'ltr'}
                    className={`font-semibold text-slate-900 dark:text-white ${
                      isAr ? 'text-base leading-relaxed' : 'text-sm leading-relaxed'
                    }`}
                  >
                    {renderText(q.prompt)}
                  </p>

                  <div className="space-y-2">
                    {q.choices.map((choice, cIdx) => {
                      const isSelected = chosen === cIdx;
                      const isRight = cIdx === q.correctIndex;
                      let style =
                        'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400';
                      if (!submitted && isSelected) {
                        style = isAr
                          ? 'border-[#059669] bg-emerald-50 dark:bg-emerald-950/30 text-slate-900 dark:text-white'
                          : 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30 text-slate-900 dark:text-white';
                      } else if (submitted) {
                        if (isRight) {
                          style =
                            'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200';
                        } else if (isSelected) {
                          style =
                            'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200';
                        } else {
                          style = 'border-slate-200 dark:border-slate-800 opacity-55';
                        }
                      }

                      return (
                        <button
                          key={choice}
                          type="button"
                          disabled={submitted}
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: cIdx }))}
                          className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${style}`}
                        >
                          <span className="font-mono-num font-bold mr-2">
                            {String.fromCharCode(65 + cIdx)}.
                          </span>
                          <span dir={isAr ? 'auto' : 'ltr'} className={isAr ? 'font-ar text-base' : ''}>
                            {renderText(choice)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {submitted && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
                      <div
                        className={`inline-flex items-center gap-1 font-bold ${
                          isCorrect
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isCorrect ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        {isCorrect ? 'Tepat' : 'Pembahasan'}
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        {q.explanationId}
                      </p>
                      <AiExplainButton
                        language={lang}
                        examContext={activePassage.tracks.join(' / ').toUpperCase()}
                        content={`Pertanyaan: ${q.prompt}\nJawaban benar: ${q.choices[q.correctIndex]}\nPembahasan: ${q.explanationId}`}
                        label="Jelaskan Lebih Detail (AI)"
                        compact
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {!submitted && (
              <button
                type="button"
                disabled={answeredCount < totalQ}
                onClick={handleSubmit}
                className={`w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40 cursor-pointer ${accentBtnClass}`}
              >
                {answeredCount < totalQ
                  ? `Jawab Semua Soal (${answeredCount}/${totalQ})`
                  : 'Periksa Jawaban & Simpan Skor'}
              </button>
            )}
          </section>
        </div>
      </main>
    );
  }

  // PASSAGE LISTING
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
            {isAr ? 'Fahm al-Maqru’ — Qira’ah Fusha (TOAFL)' : 'Academic & Workplace Reading Hub'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isAr
              ? 'Naskah bacaan Arab Fusha dengan tata letak RTL presisi dan toggle Harakat Penuh / Teks Gundul instan.'
              : 'Naskah TOEFL Academic, IELTS (termasuk True/False/Not Given), dan dokumen bisnis TOEIC Part 7.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAr && (
            <button
              type="button"
              onClick={() => updateSettings({ arabicShowHarakat: !showHarakat })}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Mode Baca: {showHarakat ? 'Harakat Penuh' : 'Teks Gundul'}
            </button>
          )}
          <select
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Jalur ({passages.length})</option>
            {tracks.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPassages.map((passage) => {
          const rec = practiceMap[passage.id];
          return (
            <div
              key={passage.id}
              className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-500">
                  {passage.genre} · {passage.tracks.map((t) => t.toUpperCase()).join(' · ')}
                </div>
                <h2
                  dir={isAr ? 'rtl' : 'ltr'}
                  className={`font-bold text-slate-900 dark:text-white ${
                    isAr ? 'font-ar text-xl' : 'font-display text-lg'
                  }`}
                >
                  {renderText(passage.title)}
                </h2>
                <p
                  dir={isAr ? 'rtl' : 'ltr'}
                  className={`text-slate-600 dark:text-slate-400 line-clamp-3 ${
                    isAr ? 'font-ar text-base' : 'text-xs leading-relaxed'
                  }`}
                >
                  {renderText(passage.paragraphs[0] ?? '')}
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    {passage.questions.length} Soal · {passage.recommendedMinutes} mnt
                  </span>
                  {rec ? (
                    <span className={`font-mono-num font-bold ${accentTextClass}`}>
                      Terbaik {rec.bestScore}/{rec.totalQuestions}
                    </span>
                  ) : (
                    <span>Belum dikerjakan</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openPassage(passage)}
                  className={`w-full py-2.5 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
                >
                  {rec ? 'Baca & Latihan Ulang' : 'Mulai Membaca'}
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
};
