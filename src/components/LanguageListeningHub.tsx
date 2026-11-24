import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Headphones,
  Play,
  RotateCcw,
  Square,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLangListeningLoader } from '../data/langPackLoader';
import type { LangListeningTrack } from '../types/language';
import { formatArabicDisplay } from '../utils/arabic';
import { playMultiLangDialogue, stopSpeech } from '../utils/audio';
import { AiExplainButton } from './AiExplainButton';

interface LanguageListeningHubProps {
  lang: 'en' | 'ar';
}

export const LanguageListeningHub: React.FC<LanguageListeningHubProps> = ({ lang }) => {
  const { state, setActiveView, recordLangPractice, updateSettings } = useApp();

  const [tracks, setTracks] = useState<LangListeningTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [examFilter, setExamFilter] = useState('all');
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [rate, setRate] = useState(0.95);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState<number | null>(null);
  const [listenCount, setListenCount] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(Date.now());

  const cancelPlaybackRef = useRef<(() => void) | null>(null);

  const isAr = lang === 'ar';
  const showHarakat = state.settings.arabicShowHarakat !== false;
  const enAccent = state.settings.englishAccent ?? 'en-US';
  const defaultTtsLocale = isAr ? 'ar-SA' : enAccent;
  const accentBtnClass = isAr
    ? 'bg-[#059669] hover:bg-[#047857] text-white'
    : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white';
  const accentTextClass = isAr
    ? 'text-[#059669] dark:text-emerald-400'
    : 'text-[#2563EB] dark:text-blue-400';

  const stopPlayback = () => {
    if (cancelPlaybackRef.current) {
      cancelPlaybackRef.current();
      cancelPlaybackRef.current = null;
    }
    stopSpeech();
    setIsPlaying(false);
    setActiveLineIdx(null);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setActiveTrackId(null);
    setExamFilter('all');
    stopPlayback();

    getLangListeningLoader(lang)
      .loadAll()
      .then((loaded) => {
        if (!active) return;
        setTracks(loaded);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat materi audio.');
        setLoading(false);
      });

    return () => {
      active = false;
      stopPlayback();
    };
  }, [lang]);

  const practiceMap = state.langPracticeProgress ?? {};

  const examTracks = useMemo(() => {
    const set = new Set<string>();
    tracks.forEach((t) => t.tracks.forEach((tr) => set.add(tr)));
    return Array.from(set);
  }, [tracks]);

  const filteredTracks = useMemo(() => {
    if (examFilter === 'all') return tracks;
    return tracks.filter((t) => t.tracks.includes(examFilter));
  }, [tracks, examFilter]);

  const activeTrack = useMemo(
    () => tracks.find((t) => t.id === activeTrackId) ?? null,
    [tracks, activeTrackId]
  );

  const renderText = (text: string) => (isAr ? formatArabicDisplay(text, showHarakat) : text);

  const openTrack = (track: LangListeningTrack) => {
    stopPlayback();
    setActiveTrackId(track.id);
    setListenCount(0);
    setSelectedChoice(null);
    setSubmitted(false);
    setShowTranscript(false);
    setStartedAt(Date.now());
  };

  const handlePlay = () => {
    if (!activeTrack) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }

    setIsPlaying(true);
    setListenCount((c) => c + 1);
    const cues = activeTrack.lines.map((line, idx) => ({
      id: `${activeTrack.id}_${idx}`,
      role: line.role,
      text: line.text,
      lang: line.localeOverride || defaultTtsLocale,
      pauseAfterMs: 420,
    }));

    cancelPlaybackRef.current = playMultiLangDialogue(cues, {
      defaultLang: defaultTtsLocale,
      rate,
      onCueStart: (_cueId, idx) => setActiveLineIdx(idx),
      onComplete: () => {
        cancelPlaybackRef.current = null;
        setIsPlaying(false);
        setActiveLineIdx(null);
      },
      onError: () => {
        cancelPlaybackRef.current = null;
        setIsPlaying(false);
        setActiveLineIdx(null);
      },
    });
  };

  const handleSubmit = () => {
    if (!activeTrack || selectedChoice === null || submitted) return;
    const isCorrect = selectedChoice === activeTrack.correctIndex;
    const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    setSubmitted(true);
    setShowTranscript(true);
    recordLangPractice(activeTrack.id, lang, 'listening', isCorrect ? 1 : 0, 1, elapsedSec);
  };

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
          Memuat paket {isAr ? 'Fahm al-Masmu’ (Istima’ TOAFL)' : 'Multi-Accent Listening'}...
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

  if (activeTrack) {
    const isCorrect = selectedChoice === activeTrack.correctIndex;
    const currentIdx = filteredTracks.findIndex((t) => t.id === activeTrack.id);
    const nextTrack =
      currentIdx >= 0 && currentIdx + 1 < filteredTracks.length
        ? filteredTracks[currentIdx + 1]
        : null;

    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              stopPlayback();
              setActiveTrackId(null);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Daftar Audio {isAr ? 'Istima’' : 'Listening'}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {isAr ? (
              <button
                type="button"
                onClick={() => updateSettings({ arabicShowHarakat: !showHarakat })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Transkrip: {showHarakat ? 'Harakat Penuh' : 'Teks Gundul'}
              </button>
            ) : (
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => updateSettings({ englishAccent: 'en-US' })}
                  className={`px-2.5 py-1 rounded cursor-pointer ${
                    enAccent === 'en-US' ? 'bg-[#2563EB] text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  US
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ englishAccent: 'en-GB' })}
                  className={`px-2.5 py-1 rounded cursor-pointer ${
                    enAccent === 'en-GB' ? 'bg-[#2563EB] text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  UK
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Audio Player Card */}
        <section className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-500">
              {activeTrack.formatLabel} · {activeTrack.tracks.map((t) => t.toUpperCase()).join(' · ')}
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {activeTrack.title}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">{activeTrack.introText}</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePlay}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer ${accentBtnClass}`}
              >
                {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? 'Hentikan Audio' : 'Putar Percakapan'}
              </button>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {isPlaying && activeLineIdx !== null ? (
                  <span className={`font-semibold ${accentTextClass}`}>
                    Pembicara: {activeTrack.lines[activeLineIdx]?.speaker} ({activeLineIdx + 1}/
                    {activeTrack.lines.length})
                  </span>
                ) : (
                  <span className="font-mono-num">Diputar {listenCount}x</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-slate-500 mr-1">Kecepatan:</span>
              {[0.8, 0.95, 1.1].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setRate(spd)}
                  className={`px-2.5 py-1 rounded-md border font-mono-num cursor-pointer ${
                    rate === spd
                      ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Question */}
          <div className="space-y-3 pt-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pertanyaan Pemahaman Audio
            </div>
            <p
              dir={isAr ? 'auto' : 'ltr'}
              className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-relaxed"
            >
              {renderText(activeTrack.questionPrompt)}
            </p>

            <div className="space-y-2.5">
              {activeTrack.choices.map((choice, cIdx) => {
                const isSelected = selectedChoice === cIdx;
                const isRight = cIdx === activeTrack.correctIndex;
                let style =
                  'border-slate-200 dark:border-slate-800 hover:border-slate-400 text-slate-800 dark:text-slate-200';
                if (!submitted && isSelected) {
                  style = isAr
                    ? 'border-[#059669] bg-emerald-50 dark:bg-emerald-950/30'
                    : 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30';
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
                    onClick={() => setSelectedChoice(cIdx)}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${style}`}
                  >
                    <span className="font-mono-num font-bold mr-2.5">
                      {String.fromCharCode(65 + cIdx)}.
                    </span>
                    <span dir={isAr ? 'auto' : 'ltr'} className={isAr ? 'font-ar text-lg' : ''}>
                      {renderText(choice)}
                    </span>
                  </button>
                );
              })}
            </div>

            {!submitted ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-xs text-slate-500">
                  Transkrip audio terbuka otomatis setelah Anda mengirim jawaban.
                </span>
                <button
                  type="button"
                  disabled={selectedChoice === null}
                  onClick={handleSubmit}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 cursor-pointer ${accentBtnClass}`}
                >
                  Periksa Jawaban
                </button>
              </div>
            ) : (
              <div
                className={`p-4 rounded-lg border space-y-2 ${
                  isCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900'
                    : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900'
                }`}
              >
                <div
                  className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                    isCorrect
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {isCorrect ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  {isCorrect ? 'Jawaban Tepat!' : 'Belum Tepat'}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {activeTrack.explanationId}
                </p>
                <AiExplainButton
                  language={lang}
                  examContext={activeTrack.tracks.join(' / ').toUpperCase()}
                  content={`Pertanyaan: ${activeTrack.questionPrompt}\nJawaban benar: ${activeTrack.choices[activeTrack.correctIndex]}\nDialog: ${activeTrack.lines.map((l) => `${l.speaker}: ${l.text}`).join(' | ')}\nPembahasan: ${activeTrack.explanationId}`}
                  label="Minta Penjelasan & Kosakata Kunci (AI)"
                  compact
                />
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => openTrack(activeTrack)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Ulangi Trek Ini
                  </button>
                  {nextTrack && (
                    <button
                      type="button"
                      onClick={() => openTrack(nextTrack)}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
                    >
                      Lanjut ke Trek Berikutnya
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Transcript Section (unlocked after submit) */}
        {submitted && (
          <section className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Transkrip & Terjemahan Audio
              </h2>
              <button
                type="button"
                onClick={() => setShowTranscript((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                {showTranscript ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showTranscript ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>

            {showTranscript && (
              <div className="space-y-3">
                {activeTrack.lines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-lg border transition-colors ${
                      activeLineIdx === idx
                        ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      {line.speaker}
                      {line.localeOverride ? ` · ${line.localeOverride}` : ''}
                    </div>
                    <p
                      dir={isAr ? 'rtl' : 'ltr'}
                      className={
                        isAr
                          ? 'font-ar text-xl text-slate-900 dark:text-white'
                          : 'text-sm font-medium text-slate-900 dark:text-white'
                      }
                    >
                      {renderText(line.text)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {line.translationId}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
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
            {isAr ? 'Fahm al-Masmu’ — Istima’ TOAFL' : 'Multi-Accent Listening Hub'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isAr
              ? 'Latihan menyimak dialog kampus, pengumuman, dan kuliah singkat Arab Fusha dengan kontrol kecepatan audio.'
              : 'Dialog kampus TOEFL, percakapan aksen Britania/US IELTS, serta pengumuman bisnis TOEIC.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isAr && (
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => updateSettings({ englishAccent: 'en-US' })}
                className={`px-3 py-1.5 rounded cursor-pointer ${
                  enAccent === 'en-US' ? 'bg-[#2563EB] text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                US Audio
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ englishAccent: 'en-GB' })}
                className={`px-3 py-1.5 rounded cursor-pointer ${
                  enAccent === 'en-GB' ? 'bg-[#2563EB] text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                UK Audio
              </button>
            </div>
          )}

          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Jalur ({tracks.length})</option>
            {examTracks.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTracks.map((track) => {
          const rec = practiceMap[track.id];
          return (
            <div
              key={track.id}
              className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-500">
                  {track.formatLabel} · {track.tracks.map((t) => t.toUpperCase()).join(' · ')}
                </div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {track.title}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {track.introText}
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Headphones className="w-3.5 h-3.5" />
                    {track.lines.length} dialog
                  </span>
                  {rec ? (
                    <span
                      className={`font-semibold ${
                        rec.passed ? accentTextClass : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {rec.passed ? 'Lulus' : 'Perlu Ulang'} · {rec.attempts}x
                    </span>
                  ) : (
                    <span>Belum dicoba</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openTrack(track)}
                  className={`w-full py-2.5 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
                >
                  Putar & Jawab Soal
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
};
