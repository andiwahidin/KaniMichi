import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  FileText,
  RotateCcw,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { JLPT_LEVELS } from '../data/grammar';
import {
  loadReadingLevel,
  loadReadingManifest,
  READING_PASSAGE_TYPES,
  ReadingManifest,
  stripFuriganaMarkup,
} from '../data/reading';
import { JlptLevel } from '../types/grammar';
import {
  ReadingPassage,
  ReadingPassageType,
} from '../types/reading';
import { speakJapanese } from '../utils/audio';
import { useAutoIndonesian } from '../utils/idTranslator';
import { AiExplainButton } from './AiExplainButton';

/**
 * Renders Japanese text with optional <ruby> furigana from inline kanji[reading] markup.
 * Matches kanji/iteration sequences immediately preceding [reading] brackets.
 */
const RubyText: React.FC<{ text: string; showFurigana: boolean }> = ({
  text,
  showFurigana,
}) => {
  if (!showFurigana) {
    return <>{stripFuriganaMarkup(text)}</>;
  }

  const tokens: React.ReactNode[] = [];
  // Find each `Base[reading]` where Base is the trailing kanji run right before `[`
  const bracketRe = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = bracketRe.exec(text)) !== null) {
    const reading = match[1];
    const before = text.slice(lastIndex, match.index);

    // Split `before` into plain prefix + trailing kanji cluster (supports kanji + 々/ヶ)
    const kanjiTailMatch = before.match(/^(.*?)([\u4e00-\u9faf々ヶ〇]+)$/s);
    if (kanjiTailMatch) {
      if (kanjiTailMatch[1]) {
        tokens.push(<React.Fragment key={keyIdx++}>{kanjiTailMatch[1]}</React.Fragment>);
      }
      tokens.push(
        <ruby key={keyIdx++} className="ruby-align">
          {kanjiTailMatch[2]}
          <rt className="text-[0.58em] text-slate-500 dark:text-slate-400 font-normal select-none">
            {reading}
          </rt>
        </ruby>
      );
    } else {
      // Fallback: keep text without brackets
      tokens.push(<React.Fragment key={keyIdx++}>{before}</React.Fragment>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push(<React.Fragment key={keyIdx++}>{text.slice(lastIndex)}</React.Fragment>);
  }

  return <>{tokens}</>;
};

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getJlptFromReadingId(id: string): JlptLevel | null {
  const match = id.match(/-n([1-5])-/i);
  return match ? (Number(match[1]) as JlptLevel) : null;
}

export const ReadingHub: React.FC = () => {
  const { state, setActiveView, recordReadingAttempt } = useApp();

  const [manifest, setManifest] = useState<ReadingManifest | null>(null);
  const [passagesByLevel, setPassagesByLevel] = useState<
    Partial<Record<JlptLevel, ReadingPassage[]>>
  >({});
  const [loadingLevel, setLoadingLevel] = useState<JlptLevel | null>(5);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Catalog filters
  const [selectedLevel, setSelectedLevel] = useState<JlptLevel>(5);
  const [typeFilter, setTypeFilter] = useState<'all' | ReadingPassageType>('all');

  // Active Reading Passage Session
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [showFurigana, setShowFurigana] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<'base' | 'lg' | 'xl'>('base');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [showGlossary, setShowGlossary] = useState<boolean>(false);
  const [showTranslation, setShowTranslation] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Load lightweight manifest once on mount
  useEffect(() => {
    let active = true;
    loadReadingManifest()
      .then((m) => {
        if (active) setManifest(m);
      })
      .catch((err) => {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : 'Gagal memuat kurikulum Membaca Dokkai.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Load only the selected JLPT level's JSON pack(s) on demand
  useEffect(() => {
    if (passagesByLevel[selectedLevel]) {
      setLoadingLevel(null);
      return;
    }
    let active = true;
    setLoadingLevel(selectedLevel);
    loadReadingLevel(selectedLevel)
      .then((items) => {
        if (!active) return;
        setPassagesByLevel((prev) => ({ ...prev, [selectedLevel]: items }));
        setLoadingLevel(null);
      })
      .catch((err) => {
        if (active) {
          setLoadingLevel(null);
          setLoadError(
            err instanceof Error
              ? err.message
              : `Gagal memuat paket Membaca JLPT N${selectedLevel}.`
          );
        }
      });
    return () => {
      active = false;
    };
  }, [selectedLevel, passagesByLevel]);

  // Stop speech when leaving passage or unmounting
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [activePassageId]);

  // Live timer during an active unsubmitted passage
  useEffect(() => {
    if (!activePassageId || submitted) return;
    const id = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [activePassageId, submitted]);

  const progressMap = state.readingProgress ?? {};

  const passagesById = useMemo(() => {
    const map: Record<string, ReadingPassage> = {};
    for (const list of Object.values(passagesByLevel)) {
      if (!list) continue;
      for (const p of list) {
        map[p.id] = p;
      }
    }
    return map;
  }, [passagesByLevel]);

  const levelStats = useMemo(() => {
    const map: Record<
      JlptLevel,
      {
        total: number;
        completed: number;
        totalQuestions: number;
        bestCorrect: number;
        loaded: boolean;
      }
    > = {
      5: { total: 0, completed: 0, totalQuestions: 0, bestCorrect: 0, loaded: false },
      4: { total: 0, completed: 0, totalQuestions: 0, bestCorrect: 0, loaded: false },
      3: { total: 0, completed: 0, totalQuestions: 0, bestCorrect: 0, loaded: false },
      2: { total: 0, completed: 0, totalQuestions: 0, bestCorrect: 0, loaded: false },
      1: { total: 0, completed: 0, totalQuestions: 0, bestCorrect: 0, loaded: false },
    };

    for (const lvl of [5, 4, 3, 2, 1] as JlptLevel[]) {
      const loadedList = passagesByLevel[lvl];
      if (loadedList) {
        map[lvl].loaded = true;
        map[lvl].total = loadedList.length;
        for (const p of loadedList) {
          map[lvl].totalQuestions += p.questions.length;
          const prog = progressMap[p.id];
          if (prog) {
            if (prog.completedAt !== null) map[lvl].completed += 1;
            map[lvl].bestCorrect += Math.min(prog.bestScore, p.questions.length);
          }
        }
      } else {
        map[lvl].total = manifest?.levels[String(lvl)]?.count ?? 0;
        for (const [id, prog] of Object.entries(progressMap)) {
          if (getJlptFromReadingId(id) !== lvl) continue;
          if (prog.completedAt !== null) map[lvl].completed += 1;
          map[lvl].bestCorrect += prog.bestScore;
        }
      }
    }
    return map;
  }, [manifest, passagesByLevel, progressMap]);

  const totals = useMemo(() => {
    let completed = 0;
    let bestCorrect = 0;
    for (const lvl of [5, 4, 3, 2, 1] as JlptLevel[]) {
      completed += levelStats[lvl].completed;
      bestCorrect += levelStats[lvl].bestCorrect;
    }
    return {
      totalPassages: manifest?.totalCount ?? 50,
      completed,
      bestCorrect,
    };
  }, [levelStats, manifest]);

  const activeLevelMeta = useMemo(
    () => JLPT_LEVELS.find((l) => l.level === selectedLevel) ?? JLPT_LEVELS[0],
    [selectedLevel]
  );

  const selectedLevelPassages = passagesByLevel[selectedLevel] ?? [];

  const filteredPassages = useMemo(() => {
    if (typeFilter === 'all') return selectedLevelPassages;
    return selectedLevelPassages.filter((p) => p.passageType === typeFilter);
  }, [selectedLevelPassages, typeFilter]);

  const activePassageForTrans = activePassageId ? passagesById[activePassageId] ?? null : null;
  const readingTransEntries = useMemo(() => {
    const entries: { text: string; hint?: string }[] = [];
    for (const p of filteredPassages.slice(0, 25)) {
      entries.push({ text: p.titleEn, hint: 'judul wacana JLPT' });
    }
    if (activePassageForTrans) {
      entries.push({ text: activePassageForTrans.titleEn, hint: 'judul wacana JLPT' });
      entries.push({ text: activePassageForTrans.contextEn, hint: 'konteks wacana JLPT' });
      for (const v of activePassageForTrans.keyVocab) {
        entries.push({ text: v.en, hint: `kosakata ${v.word}` });
      }
      for (const para of activePassageForTrans.translationEn) {
        entries.push({ text: para, hint: 'terjemahan wacana JLPT' });
      }
      for (const para of activePassageForTrans.translationBEn ?? []) {
        entries.push({ text: para, hint: 'terjemahan wacana JLPT' });
      }
      for (const q of activePassageForTrans.questions) {
        entries.push({ text: q.promptEn, hint: 'pertanyaan JLPT Dokkai' });
        entries.push({ text: q.explanationEn, hint: 'pembahasan soal JLPT Dokkai' });
      }
    }
    return entries;
  }, [filteredPassages, activePassageForTrans]);

  const { t: tId } = useAutoIndonesian(readingTransEntries);

  const getTypeMeta = (t: ReadingPassageType) =>
    READING_PASSAGE_TYPES.find((m) => m.id === t) ?? READING_PASSAGE_TYPES[0];

  const openPassage = (passage: ReadingPassage) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setActivePassageId(passage.id);
    // Default furigana ON for N5/N4 (learning support), OFF for N3/N2/N1 (authentic JLPT exam simulation)
    setShowFurigana(passage.jlpt >= 4);
    setElapsedSec(0);
    setSelectedAnswers({});
    setSubmitted(false);
    setShowGlossary(false);
    setShowTranslation(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closePassage = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setActivePassageId(null);
  };

  const toggleSpeakPassage = (passage: ReadingPassage) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const parts = [
      ...passage.paragraphs.map(stripFuriganaMarkup),
      ...(passage.paragraphsB ? passage.paragraphsB.map(stripFuriganaMarkup) : []),
    ];
    const fullText = parts.join('。 ');
    setIsSpeaking(true);
    speakJapanese(fullText, passage.jlpt >= 4 ? 0.85 : 0.94);

    // Watch end of speech gracefully
    const checkEnd = window.setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        setIsSpeaking(false);
        window.clearInterval(checkEnd);
      }
    }, 400);
  };

  if (loadError) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-rose-200 dark:border-rose-900 p-6 space-y-3">
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Gagal Memuat Modul Membaca (Dokkai)
          </h1>
          <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!manifest) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
          <div className="font-display text-base font-bold text-slate-900 dark:text-white">
            Memuat Kurikulum Dokkai JLPT N5–N1...
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Menyiapkan wacana pendek, pengumuman, email bisnis, esai opini, dan perbandingan teks A/B.
          </p>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 1: ACTIVE READING EXAM & REVIEW VIEW
  // =========================================================================
  const activePassage = activePassageId ? passagesById[activePassageId] : null;
  if (activePassage) {
    const lvlMeta = JLPT_LEVELS.find((l) => l.level === activePassage.jlpt) ?? JLPT_LEVELS[0];
    const typeMeta = getTypeMeta(activePassage.passageType);
    const allAnswered = activePassage.questions.every(
      (q) => selectedAnswers[q.id] !== undefined
    );
    const correctCount = activePassage.questions.filter(
      (q) => selectedAnswers[q.id] === q.answerIndex
    ).length;
    const targetSec = activePassage.recommendedMinutes * 60;
    const overPace = elapsedSec > targetSec;

    const sameLevelList = passagesByLevel[activePassage.jlpt] ?? [];
    const currentIdxInLevel = sameLevelList.findIndex((p) => p.id === activePassage.id);
    const nextPassage =
      currentIdxInLevel >= 0 && currentIdxInLevel + 1 < sameLevelList.length
        ? sameLevelList[currentIdxInLevel + 1]
        : null;

    const handleSubmit = () => {
      if (!allAnswered || submitted) return;
      setSubmitted(true);
      recordReadingAttempt(
        activePassage.id,
        correctCount,
        activePassage.questions.length,
        elapsedSec
      );
    };

    const textSizeClass =
      fontSize === 'xl'
        ? 'text-lg sm:text-xl leading-[2.25]'
        : fontSize === 'lg'
        ? 'text-base sm:text-lg leading-[2.15]'
        : 'text-sm sm:text-base leading-[2.05]';

    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-5">
        {/* Top Reading Toolbar */}
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={closePassage}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Daftar Wacana
            </button>

            <div className="text-xs font-mono-num text-slate-500 dark:text-slate-400 truncate">
              <span className="font-bold" style={{ color: lvlMeta.accent }}>
                JLPT {lvlMeta.code}
              </span>{' '}
              · {typeMeta.shortLabel} · #{activePassage.order}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live Pace Timer */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono-num font-semibold ${
                overPace
                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200'
              }`}
              title="Waktu baca vs target waktu JLPT"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>
                {formatTimer(elapsedSec)} / {formatTimer(targetSec)}
              </span>
            </div>

            {/* Furigana Toggle */}
            <button
              type="button"
              onClick={() => setShowFurigana((v) => !v)}
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                showFurigana
                  ? 'border-[#0284C7] bg-[#0284C7]/10 text-[#0284C7] dark:text-sky-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {showFurigana ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Furigana {showFurigana ? 'ON' : 'OFF'}
            </button>

            {/* Font size cycle */}
            <button
              type="button"
              onClick={() =>
                setFontSize((s) => (s === 'base' ? 'lg' : s === 'lg' ? 'xl' : 'base'))
              }
              aria-label="Ubah ukuran teks"
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {fontSize === 'base' ? 'A' : fontSize === 'lg' ? 'A+' : 'A++'}
            </button>

            {/* Audio Read-Aloud */}
            <button
              type="button"
              onClick={() => toggleSpeakPassage(activePassage)}
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                isSpeaking
                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#0284C7]'
              }`}
            >
              {isSpeaking ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  Stop
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  Audio
                </>
              )}
            </button>
          </div>
        </div>

        {/* Post-submission Score Banner */}
        {submitted && (
          <div
            className={`rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              correctCount === activePassage.questions.length
                ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30'
                : 'border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/30'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <CheckCircle2
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  correctCount === activePassage.questions.length
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-[#0284C7]'
                }`}
              />
              <div className="min-w-0">
                <div className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Skor Pemahaman: {correctCount} / {activePassage.questions.length} (
                  {Math.round((correctCount / activePassage.questions.length) * 100)}%)
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Waktu baca: <span className="font-mono-num font-semibold">{formatTimer(elapsedSec)}</span>{' '}
                  (target {activePassage.recommendedMinutes} mnt). Terjemahan Inggris lengkap &amp; pembahasan soal kini terbuka.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openPassage(activePassage)}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Ulangi
              </button>
              {nextPassage && (
                <button
                  type="button"
                  onClick={() => openPassage(nextPassage)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold cursor-pointer"
                >
                  Wacana Berikutnya
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Split Reading Workspace (Desktop 7/5, Mobile stacked) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* LEFT: Japanese Passage Column */}
          <article className="lg:col-span-7 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-5 min-w-0">
            <header className="border-b border-slate-100 dark:border-slate-800 pb-4 space-y-1">
              <div className="text-xs font-semibold" style={{ color: typeMeta.accent }}>
                {typeMeta.label} · {tId(activePassage.contextEn)}
              </div>
              <h1 className="font-jp text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-snug">
                <RubyText text={activePassage.titleJp} showFurigana={showFurigana} />
              </h1>
              {submitted && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {tId(activePassage.titleEn)}
                </div>
              )}
            </header>

            {/* Text A / Main Paragraphs */}
            <div className="space-y-4">
              {activePassage.labelA && (
                <div className="text-xs font-bold uppercase tracking-wide text-[#7C3AED] dark:text-violet-400 font-jp">
                  <RubyText text={activePassage.labelA} showFurigana={showFurigana} />
                </div>
              )}
              <div className={`font-jp text-slate-900 dark:text-slate-100 space-y-4 ${textSizeClass}`}>
                {activePassage.paragraphs.map((para, idx) => (
                  <p key={idx} className="whitespace-pre-line break-words">
                    <RubyText text={para} showFurigana={showFurigana} />
                  </p>
                ))}
              </div>
            </div>

            {/* Optional Text B for A/B Comparison */}
            {activePassage.paragraphsB && (
              <div className="pt-5 border-t border-dashed border-slate-200 dark:border-slate-700 space-y-4">
                {activePassage.labelB && (
                  <div className="text-xs font-bold uppercase tracking-wide text-[#DB2777] dark:text-pink-400 font-jp">
                    <RubyText text={activePassage.labelB} showFurigana={showFurigana} />
                  </div>
                )}
                <div className={`font-jp text-slate-900 dark:text-slate-100 space-y-4 ${textSizeClass}`}>
                  {activePassage.paragraphsB.map((para, idx) => (
                    <p key={idx} className="whitespace-pre-line break-words">
                      <RubyText text={para} showFurigana={showFurigana} />
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Key Vocabulary Glossary Drawer */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <button
                type="button"
                onClick={() => setShowGlossary((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#0284C7] cursor-pointer"
              >
                {showGlossary ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                Glosarium Kata Kunci ({activePassage.keyVocab.length} istilah)
              </button>

              {showGlossary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {activePassage.keyVocab.map((v, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-jp font-bold text-sm text-slate-900 dark:text-white">
                          {v.word}
                        </span>
                        <button
                          type="button"
                          onClick={() => speakJapanese(v.reading || v.word, 0.9)}
                          aria-label={`Audio ${v.word}`}
                          className="text-slate-400 hover:text-[#0284C7] cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="font-jp text-[11px] text-slate-500 dark:text-slate-400">
                        {v.reading}
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300">
                        {tId(v.en)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Full Translation & AI Indonesian Explainer (Unlocked after submission) */}
            {submitted && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowTranslation((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer"
                  >
                    {showTranslation ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    {showTranslation
                      ? 'Sembunyikan Terjemahan Referensi'
                      : 'Lihat Terjemahan Referensi'}
                  </button>
                </div>

                <AiExplainButton
                  language="ja"
                  examContext={`JLPT N${activePassage.jlpt} Dokkai (${activePassage.titleJp})`}
                  content={`Wacana: ${activePassage.paragraphs.map((p) => stripFuriganaMarkup(p)).join('\n')}${
                    activePassage.paragraphsB
                      ? `\n\nTeks B:\n${activePassage.paragraphsB.map((p) => stripFuriganaMarkup(p)).join('\n')}`
                      : ''
                  }`}
                  label="Terjemahkan Wacana ke Bahasa Indonesia (AI)"
                />

                {showTranslation && (
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-2.5 leading-relaxed">
                    {activePassage.translationEn.map((para, i) => (
                      <p key={i}>{tId(para)}</p>
                    ))}
                    {activePassage.translationBEn?.map((para, i) => (
                      <p key={`b-${i}`} className="pt-2 border-t border-slate-200 dark:border-slate-800">
                        {tId(para)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>

          {/* RIGHT: Comprehension Questions Column */}
          <section className="lg:col-span-5 space-y-4 min-w-0">
            {activePassage.questions.map((q, qIdx) => {
              const picked = selectedAnswers[q.id];
              const isCorrect = submitted && picked === q.answerIndex;

              return (
                <div
                  key={q.id}
                  className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs font-mono-num">
                      <span className="font-bold text-slate-500 dark:text-slate-400">
                        Pertanyaan {qIdx + 1} / {activePassage.questions.length}
                      </span>
                      {submitted && (
                        <span
                          className={`font-semibold ${
                            isCorrect
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isCorrect ? 'Benar' : 'Kurang Tepat'}
                        </span>
                      )}
                    </div>
                    <h2 className="font-jp text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-relaxed">
                      <RubyText text={q.promptJp} showFurigana={showFurigana} />
                    </h2>
                    {submitted && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {tId(q.promptEn)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {q.choices.map((choice, cIdx) => {
                      const isPicked = picked === cIdx;
                      const isRightChoice = cIdx === q.answerIndex;

                      let style =
                        'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 hover:border-[#0284C7] text-slate-800 dark:text-slate-200';
                      if (!submitted && isPicked) {
                        style =
                          'border-[#0284C7] bg-sky-50/70 dark:bg-sky-950/40 text-slate-950 dark:text-white';
                      } else if (submitted) {
                        if (isRightChoice) {
                          style =
                            'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100';
                        } else if (isPicked && !isRightChoice) {
                          style =
                            'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 text-rose-950 dark:text-rose-100';
                        } else {
                          style =
                            'border-slate-200 dark:border-slate-800 opacity-55 text-slate-500';
                        }
                      }

                      return (
                        <button
                          key={cIdx}
                          type="button"
                          disabled={submitted}
                          onClick={() =>
                            setSelectedAnswers((prev) => ({ ...prev, [q.id]: cIdx }))
                          }
                          className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-lg border text-left flex items-start justify-between gap-2.5 transition-colors cursor-pointer disabled:cursor-default ${style}`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className="font-mono-num text-xs font-bold text-slate-400 mt-0.5 shrink-0">
                              {cIdx + 1}.
                            </span>
                            <span className="font-jp text-xs sm:text-sm font-medium leading-relaxed break-words">
                              <RubyText text={choice} showFurigana={showFurigana} />
                            </span>
                          </div>
                          {submitted && isRightChoice && (
                            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          )}
                          {submitted && isPicked && !isRightChoice && (
                            <X className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {submitted && (
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      <div>
                        <strong className="text-slate-900 dark:text-white">Pembahasan: </strong>
                        {tId(q.explanationEn)}
                      </div>
                      <AiExplainButton
                        language="ja"
                        examContext={`JLPT N${activePassage.jlpt} Dokkai`}
                        content={`Pertanyaan: ${stripFuriganaMarkup(q.promptJp)}\nJawaban benar: ${stripFuriganaMarkup(q.choices[q.answerIndex])}\nCatatan: ${q.explanationEn}`}
                        label="Jelaskan Soal Ini dalam Bahasa Indonesia (AI)"
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
                disabled={!allAnswered}
                onClick={handleSubmit}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {allAnswered
                  ? 'Periksa Jawaban & Lihat Pembahasan'
                  : `Jawab Semua Pertanyaan (${Object.keys(selectedAnswers).length}/${activePassage.questions.length})`}
              </button>
            )}
          </section>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 2: CATALOG OF 25 JLPT DOKKAI PASSAGES (N5–N1)
  // =========================================================================
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* JLPT Prep Module Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-0.5 max-w-full overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveView('grammar')}
            className="px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            1. Grammar (200)
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
            className="px-3 sm:px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 whitespace-nowrap cursor-pointer"
          >
            3. Dokkai ({totals.totalPassages})
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
          {totals.completed} / {totals.totalPassages} Wacana Lulus · {totals.bestCorrect} Soal Benar
        </div>
      </div>

      {/* Header */}
      <div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
          Tahap 3 · Persiapan JLPT N5–N1
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
          Latihan Membaca JLPT (Dokkai N5–N1)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
          {totals.totalPassages} wacana autentik bergaya ujian JLPT — mulai dari pengumuman, email bisnis, wacana pendek, esai opini, hingga perbandingan dua teks (Tōgō Rikai) lengkap dengan pengatur waktu baca, toggle furigana, audio, dan pembahasan bahasa Inggris.
        </p>
      </div>

      {/* N5 - N1 Level Selector */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
        {JLPT_LEVELS.map((lvl) => {
          const st = levelStats[lvl.level];
          const isSelected = selectedLevel === lvl.level;
          const pct = st.total > 0 ? Math.round((st.completed / st.total) * 100) : 0;
          const accPct =
            st.totalQuestions > 0
              ? Math.round((st.bestCorrect / st.totalQuestions) * 100)
              : 0;

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
                  {st.completed}/{st.total}
                </span>
              </div>

              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2.5">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: lvl.accent }}
                />
              </div>

              <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-mono-num">
                <span>
                  {st.loaded ? `${st.totalQuestions} soal` : `${st.total} wacana`}
                </span>
                {st.bestCorrect > 0 && st.loaded && (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {accPct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Passage List Section */}
      <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Wacana {activeLevelMeta.label} ({filteredPassages.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {selectedLevel >= 4
                ? 'Mode belajar: Furigana aktif secara default (bisa dimatikan kapan saja).'
                : 'Mode ujian JLPT: Furigana mati secara default untuk melatih membaca kanji asli (bisa dinyalakan jika butuh).'}
            </p>
          </div>
        </div>

        {/* Passage Format Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              typeFilter === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            Semua Format
          </button>
          {READING_PASSAGE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                typeFilter === t.id
                  ? 'text-white'
                  : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
              style={typeFilter === t.id ? { backgroundColor: t.accent } : undefined}
            >
              {t.shortLabel}
            </button>
          ))}
        </div>

        {loadingLevel === selectedLevel ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Memuat paket wacana JLPT {activeLevelMeta.code}...
          </div>
        ) : filteredPassages.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Belum ada wacana dengan format ini di level {activeLevelMeta.code}. Pilih "Semua Format".
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPassages.map((passage) => {
              const typeMeta = getTypeMeta(passage.passageType);
              const prog = progressMap[passage.id];
              const isPassed = prog && prog.completedAt !== null;

              return (
                <div
                  key={passage.id}
                  className="min-w-0 p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/40 dark:bg-slate-900/30 flex flex-col justify-between gap-4 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold" style={{ color: typeMeta.accent }}>
                        {typeMeta.label}
                      </span>
                      <span className="font-mono-num text-slate-500 dark:text-slate-400">
                        Target {passage.recommendedMinutes} mnt · {passage.questions.length} soal
                      </span>
                    </div>

                    <h3 className="font-jp text-lg font-bold text-slate-900 dark:text-white leading-snug">
                      {stripFuriganaMarkup(passage.titleJp)}
                    </h3>
                    <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">
                      {tId(passage.titleEn)}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 font-jp">
                      {stripFuriganaMarkup(passage.paragraphs[0])}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="text-xs font-mono-num">
                      {prog ? (
                        <span
                          className={
                            isPassed
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'text-amber-600 dark:text-amber-400 font-semibold'
                          }
                        >
                          Terbaik {prog.bestScore}/{prog.totalQuestions}
                          {prog.bestTimeSec !== null
                            ? ` · ${formatTimer(prog.bestTimeSec)}`
                            : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">Belum dikerjakan</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => openPassage(passage)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer"
                      style={{ backgroundColor: activeLevelMeta.accent }}
                    >
                      {prog ? (
                        <>
                          <FileText className="w-3.5 h-3.5" />
                          Kerjakan Ulang
                        </>
                      ) : (
                        <>
                          <BookOpen className="w-3.5 h-3.5" />
                          Mulai Membaca
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};
