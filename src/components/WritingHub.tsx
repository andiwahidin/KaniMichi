import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Grid,
  HelpCircle,
  Layers,
  PenTool,
  Play,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Undo2,
  Volume2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  buildKanjiWritingEntries,
  getCharacterStrokePaths,
  HIRAGANA_ENTRIES,
  KATAKANA_ENTRIES,
  loadCoreStrokeBank,
} from '../data/writing';
import {
  StrokeEvaluationResult,
  UserStroke,
  WritingBrushStyle,
  WritingCharacterEntry,
  WritingMode,
  WritingScript,
} from '../types/writing';
import { speakJapanese } from '../utils/audio';
import { evaluateFreehandDrawing } from '../utils/strokeGeometry';
import { WritingCanvas } from './WritingCanvas';

type KanjiFilterKind = 'jlpt-5' | 'jlpt-4' | 'jlpt-3' | 'jlpt-2' | 'jlpt-1' | 'current-level' | 'srs-learned' | 'all';

interface DrillSessionState {
  queue: WritingCharacterEntry[];
  index: number;
  mode: 'learn' | 'recall';
  results: { char: string; label: string; score: number; hints: number }[];
  finished: boolean;
}

const KANJI_FILTERS: { id: KanjiFilterKind; label: string }[] = [
  { id: 'jlpt-5', label: 'JLPT N5' },
  { id: 'jlpt-4', label: 'JLPT N4' },
  { id: 'jlpt-3', label: 'JLPT N3' },
  { id: 'jlpt-2', label: 'JLPT N2' },
  { id: 'jlpt-1', label: 'JLPT N1' },
  { id: 'current-level', label: 'Level Saya' },
  { id: 'srs-learned', label: 'Sudah Dipelajari' },
  { id: 'all', label: 'Semua (2.026)' },
];

export const WritingHub: React.FC = () => {
  const {
    dataset,
    state,
    writingTargetChar,
    recordWritingPractice,
    openItemDetail,
  } = useApp();

  const kanjiEntries = useMemo(() => buildKanjiWritingEntries(dataset), [dataset]);

  const entryByChar = useMemo(() => {
    const map = new Map<string, WritingCharacterEntry>();
    for (const e of HIRAGANA_ENTRIES) map.set(e.char, e);
    for (const e of KATAKANA_ENTRIES) map.set(e.char, e);
    for (const e of kanjiEntries) map.set(e.char, e);
    return map;
  }, [kanjiEntries]);

  // Preload core local stroke bank (92 kana + 245 N5/N4 kanji) on mount
  useEffect(() => {
    void loadCoreStrokeBank();
  }, []);

  // Script & Filter state
  const [script, setScript] = useState<WritingScript>('hiragana');
  const [kanjiFilter, setKanjiFilter] = useState<KanjiFilterKind>('jlpt-5');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChar, setSelectedChar] = useState<string>('あ');

  // Canvas & Practice Mode state
  const [mode, setMode] = useState<WritingMode>('learn');
  const [brushStyle, setBrushStyle] = useState<WritingBrushStyle>('fude');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showGuideInFreehand, setShowGuideInFreehand] = useState<boolean>(true);
  const [showStrokeNumbers, setShowStrokeNumbers] = useState<boolean>(true);
  const [recallPeek, setRecallPeek] = useState<boolean>(false);

  // Stroke data & interactive progress for active character
  const [strokePaths, setStrokePaths] = useState<string[] | null>(null);
  const [loadingStrokes, setLoadingStrokes] = useState<boolean>(false);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [strokeScores, setStrokeScores] = useState<number[]>([]);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [mistakeStreak, setMistakeStreak] = useState<number>(0);
  const [hintTrigger, setHintTrigger] = useState<number>(0);
  const [inspectedStrokeIdx, setInspectedStrokeIdx] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [animationSpeed, setAnimationSpeed] = useState<number>(1);
  const [freehandStrokes, setFreehandStrokes] = useState<UserStroke[]>([]);
  const [freehandScore, setFreehandScore] = useState<{
    score: number;
    feedback: string;
  } | null>(null);

  // Feedback banner state
  const [feedback, setFeedback] = useState<{
    tone: 'neutral' | 'success' | 'error';
    text: string;
  }>({
    tone: 'neutral',
    text: 'Tarik goresan mulai dari titik biru bernomor 1 mengikuti garis panduan.',
  });
  const [completedBanner, setCompletedBanner] = useState<{
    score: number;
    passedRecall: boolean;
  } | null>(null);

  // Drill session state (5 or 10 character sequential workout)
  const [drill, setDrill] = useState<DrillSessionState | null>(null);

  // Deep-link support when opening Writing from a specific Kanji detail modal
  useEffect(() => {
    if (!writingTargetChar) return;
    const found = entryByChar.get(writingTargetChar);
    if (!found) return;
    setDrill(null);
    setScript(found.script);
    if (found.script === 'kanji') {
      if (found.jlpt && found.jlpt >= 1 && found.jlpt <= 5) {
        setKanjiFilter(`jlpt-${found.jlpt}` as KanjiFilterKind);
      } else {
        setKanjiFilter('all');
      }
    }
    setSelectedChar(found.char);
  }, [writingTargetChar, entryByChar]);

  const activeEntry: WritingCharacterEntry = useMemo(() => {
    if (drill && !drill.finished && drill.queue[drill.index]) {
      return drill.queue[drill.index];
    }
    return (
      entryByChar.get(selectedChar) ??
      HIRAGANA_ENTRIES[0]
    );
  }, [drill, entryByChar, selectedChar]);

  const resetCanvasState = useCallback(
    (targetMode: WritingMode = mode) => {
      setCompletedCount(0);
      setStrokeScores([]);
      setHintsUsed(0);
      setMistakeStreak(0);
      setHintTrigger(0);
      setInspectedStrokeIdx(null);
      setIsAnimating(false);
      setFreehandStrokes([]);
      setFreehandScore(null);
      setRecallPeek(false);
      setCompletedBanner(null);
      setFeedback({
        tone: 'neutral',
        text:
          targetMode === 'learn'
            ? 'Tarik goresan mulai dari titik biru bernomor 1 mengikuti garis panduan.'
            : targetMode === 'recall'
            ? 'Tulis karakter ini dari ingatan dengan urutan goresan yang benar.'
            : 'Tulis bebas di atas kanvas, lalu klik "Nilai Bentuk" untuk skor proporsi.',
      });
    },
    [mode]
  );

  // Fetch KanjiVG stroke paths whenever active character changes
  useEffect(() => {
    let alive = true;
    const targetChar = activeEntry.char;
    setLoadingStrokes(true);
    setStrokePaths(null);
    resetCanvasState(mode);

    getCharacterStrokePaths(targetChar)
      .then((paths) => {
        if (!alive) return;
        setStrokePaths(paths);
        setLoadingStrokes(false);
      })
      .catch(() => {
        if (!alive) return;
        setStrokePaths(null);
        setLoadingStrokes(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntry.char]);

  // Filtered character list for picker grid
  const visibleEntries = useMemo(() => {
    let base: WritingCharacterEntry[];
    if (script === 'hiragana') {
      base = HIRAGANA_ENTRIES;
    } else if (script === 'katakana') {
      base = KATAKANA_ENTRIES;
    } else {
      base = kanjiEntries.filter((k) => {
        if (kanjiFilter === 'all') return true;
        if (kanjiFilter === 'current-level') return k.level === state.currentLevel;
        if (kanjiFilter === 'srs-learned') {
          return k.curriculumItemId
            ? (state.progress[k.curriculumItemId]?.srsStage ?? -1) >= 1
            : false;
        }
        const jlptNum = Number(kanjiFilter.replace('jlpt-', ''));
        return k.jlpt === jlptNum;
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (e) =>
        e.char.includes(q) ||
        e.primaryLabel.toLowerCase().includes(q) ||
        e.readingHint.toLowerCase().includes(q) ||
        (e.onyomi?.some((r) => r.includes(q)) ?? false) ||
        (e.kunyomi?.some((r) => r.includes(q)) ?? false)
    );
  }, [script, kanjiEntries, kanjiFilter, searchQuery, state.currentLevel, state.progress]);

  // Writing mastery stats
  const writingProgressMap = state.writingProgress ?? {};
  const masteryStats = useMemo(() => {
    const practicedCount = Object.keys(writingProgressMap).length;
    const recallCount = Object.values(writingProgressMap).filter(
      (p) => p.recallPassed
    ).length;
    const hiraDone = HIRAGANA_ENTRIES.filter((e) => writingProgressMap[e.char]).length;
    const kataDone = KATAKANA_ENTRIES.filter((e) => writingProgressMap[e.char]).length;
    const kanjiDone = kanjiEntries.filter((e) => writingProgressMap[e.char]).length;
    return { practicedCount, recallCount, hiraDone, kataDone, kanjiDone };
  }, [writingProgressMap, kanjiEntries]);

  const handleModeChange = (nextMode: WritingMode) => {
    setMode(nextMode);
    resetCanvasState(nextMode);
  };

  const handleScriptChange = (nextScript: WritingScript) => {
    setDrill(null);
    setScript(nextScript);
    setSearchQuery('');
    if (nextScript === 'hiragana') {
      setSelectedChar(HIRAGANA_ENTRIES[0].char);
    } else if (nextScript === 'katakana') {
      setSelectedChar(KATAKANA_ENTRIES[0].char);
    } else {
      const firstN5 = kanjiEntries.find((k) => k.jlpt === 5) ?? kanjiEntries[0];
      if (firstN5) setSelectedChar(firstN5.char);
    }
  };

  const handleStrokeAccepted = (result: StrokeEvaluationResult) => {
    if (!strokePaths) return;
    const nextCompleted = completedCount + 1;
    const nextScores = [...strokeScores, result.score];
    setCompletedCount(nextCompleted);
    setStrokeScores(nextScores);
    setMistakeStreak(0);
    setInspectedStrokeIdx(null);

    if (nextCompleted >= strokePaths.length) {
      const avgRaw =
        nextScores.reduce((sum, v) => sum + v, 0) / Math.max(1, nextScores.length);
      const hintPenalty = hintsUsed * 8 + (recallPeek ? 15 : 0);
      const finalScore = Math.max(40, Math.min(100, Math.round(avgRaw - hintPenalty)));
      const passedRecall = mode === 'recall' && finalScore >= 65 && hintsUsed <= 1 && !recallPeek;

      setCompletedBanner({ score: finalScore, passedRecall });
      setFeedback({
        tone: 'success',
        text: passedRecall
          ? `Lulus Ujian Hafalan! Skor akurasi ${finalScore}% (${strokePaths.length} goresan tepat).`
          : `Selesai! Skor akurasi ${finalScore}% untuk karakter 「${activeEntry.char}」.`,
      });
      recordWritingPractice(activeEntry.char, finalScore, passedRecall);

      // Speak the character upon mastery completion for audio-motor reinforcement
      const speakTarget =
        activeEntry.script === 'kanji'
          ? activeEntry.kunyomi?.[0] || activeEntry.onyomi?.[0] || activeEntry.char
          : activeEntry.char;
      speakJapanese(speakTarget, 0.9);
    } else {
      setFeedback({
        tone: 'success',
        text: `${result.message} (${nextCompleted}/${strokePaths.length})`,
      });
    }
  };

  const handleStrokeRejected = (result: StrokeEvaluationResult) => {
    const nextStreak = mistakeStreak + 1;
    setMistakeStreak(nextStreak);
    setFeedback({
      tone: 'error',
      text: result.message,
    });
    // Show animated hint sweep automatically in Learn mode, or after 2 misses in Recall mode
    if (mode === 'learn' || nextStreak >= 2) {
      setHintTrigger((n) => n + 1);
      if (mode === 'recall' && nextStreak >= 2) {
        setHintsUsed((h) => h + 1);
      }
    }
  };

  const handleTriggerHint = () => {
    if (!strokePaths || completedCount >= strokePaths.length) return;
    setHintsUsed((h) => h + 1);
    setHintTrigger((n) => n + 1);
    setFeedback({
      tone: 'neutral',
      text: `Petunjuk goresan ke-${completedCount + 1}: ikuti sapuan biru dari awal ke ujung.`,
    });
  };

  const handleEvaluateFreehand = () => {
    if (!strokePaths || freehandStrokes.length === 0) return;
    const res = evaluateFreehandDrawing(freehandStrokes, strokePaths);
    setFreehandScore(res);
    setFeedback({
      tone: res.score >= 68 ? 'success' : 'error',
      text: `Skor Bentuk: ${res.score}% — ${res.feedback}`,
    });
    recordWritingPractice(activeEntry.char, res.score, false);
  };

  const handleSelectCharacter = (entry: WritingCharacterEntry) => {
    if (drill) setDrill(null);
    setSelectedChar(entry.char);
  };

  const handlePrevNext = (delta: -1 | 1) => {
    if (visibleEntries.length === 0) return;
    const idx = visibleEntries.findIndex((e) => e.char === activeEntry.char);
    const nextIdx =
      idx === -1
        ? 0
        : (idx + delta + visibleEntries.length) % visibleEntries.length;
    setSelectedChar(visibleEntries[nextIdx].char);
  };

  // Start a structured 5 or 10 character sequential drill
  const startDrillSession = (count: number, drillMode: 'learn' | 'recall') => {
    const pool = visibleEntries.length > 0 ? visibleEntries : HIRAGANA_ENTRIES;
    // Prioritize characters not yet recall-passed or unpracticed
    const prioritized = [...pool].sort((a, b) => {
      const pa = writingProgressMap[a.char];
      const pb = writingProgressMap[b.char];
      const scoreA = pa ? (pa.recallPassed ? 200 + pa.bestScore : pa.bestScore) : -1;
      const scoreB = pb ? (pb.recallPassed ? 200 + pb.bestScore : pb.bestScore) : -1;
      return scoreA - scoreB;
    });
    const queue = prioritized.slice(0, Math.min(count, prioritized.length));
    if (queue.length === 0) return;

    setMode(drillMode);
    setDrill({
      queue,
      index: 0,
      mode: drillMode,
      results: [],
      finished: false,
    });
    setSelectedChar(queue[0].char);
  };

  const advanceDrill = () => {
    if (!drill || !completedBanner) return;
    const nextResults = [
      ...drill.results,
      {
        char: activeEntry.char,
        label: activeEntry.primaryLabel,
        score: completedBanner.score,
        hints: hintsUsed,
      },
    ];
    if (drill.index + 1 >= drill.queue.length) {
      setDrill({
        ...drill,
        results: nextResults,
        finished: true,
      });
    } else {
      const nextIndex = drill.index + 1;
      setDrill({
        ...drill,
        index: nextIndex,
        results: nextResults,
      });
      setSelectedChar(drill.queue[nextIndex].char);
    }
  };

  const activeProgress = writingProgressMap[activeEntry.char];
  const totalStrokes = strokePaths?.length ?? activeEntry.strokes ?? 0;
  const showGuideOnCanvas =
    mode === 'learn' ||
    (mode === 'freehand' && showGuideInFreehand) ||
    (mode === 'recall' && (recallPeek || Boolean(completedBanner)));

  const handlePlayAudio = () => {
    const text =
      activeEntry.script === 'kanji'
        ? activeEntry.kunyomi?.[0] || activeEntry.onyomi?.[0] || activeEntry.char
        : activeEntry.char;
    speakJapanese(text, 0.88);
  };

  // =========================================================================
  // DRILL COMPLETION SUMMARY VIEW
  // =========================================================================
  if (drill?.finished) {
    const avgScore = Math.round(
      drill.results.reduce((s, r) => s + r.score, 0) / Math.max(1, drill.results.length)
    );
    const highCount = drill.results.filter((r) => r.score >= 80).length;

    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="bg-[#0284C7] px-6 py-6 text-white space-y-2">
            <div className="text-xs font-medium text-white/85">
              Ringkasan Sesi Menulis ({drill.mode === 'recall' ? 'Ujian Hafalan' : 'Belajar & Jiplak'})
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2.5">
              <Award className="w-7 h-7 shrink-0" />
              <span>Sesi {drill.results.length} Karakter Selesai</span>
            </h1>
            <p className="text-sm text-white/90">
              Rata-rata akurasi <strong className="font-mono-num">{avgScore}%</strong> ·{' '}
              <strong className="font-mono-num">
                {highCount}/{drill.results.length}
              </strong>{' '}
              karakter sangat rapi (≥ 80%).
            </p>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {drill.results.map((r, i) => (
                <button
                  key={`${r.char}-${i}`}
                  type="button"
                  onClick={() => {
                    setDrill(null);
                    setSelectedChar(r.char);
                  }}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#0284C7] text-center transition-colors cursor-pointer"
                >
                  <div className="font-jp text-3xl font-bold text-slate-900 dark:text-white">
                    {r.char}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
                    {r.label}
                  </div>
                  <div
                    className={`font-mono-num text-xs font-bold mt-1 ${
                      r.score >= 80
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : r.score >= 65
                        ? 'text-[#0284C7]'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {r.score}%
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDrill(null)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Kembali ke Studio
              </button>
              <button
                type="button"
                onClick={() => startDrillSession(drill.queue.length, drill.mode)}
                className="min-h-[44px] px-5 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold cursor-pointer"
              >
                Mulai Sesi Baru ({drill.queue.length} Karakter)
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Top Script Switcher & Unboxed Mastery Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div
          role="tablist"
          aria-label="Pilih aksara latihan menulis"
          className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-1 max-w-full overflow-x-auto no-scrollbar"
        >
          {(
            [
              { id: 'hiragana', label: `Hiragana (${masteryStats.hiraDone}/46)` },
              { id: 'katakana', label: `Katakana (${masteryStats.kataDone}/46)` },
              { id: 'kanji', label: `Kanji (${masteryStats.kanjiDone}/2.026)` },
            ] as { id: WritingScript; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={script === tab.id}
              onClick={() => handleScriptChange(tab.id)}
              className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                script === tab.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
          <span>{masteryStats.practicedCount} Karakter Dilatih</span>
          <span aria-hidden="true">·</span>
          <span>{masteryStats.recallCount} Lulus Hafalan</span>
        </div>
      </div>

      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Studio Latihan Menulis Jepang (Kakitori · 書き取り)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Latih urutan goresan resmi KanjiVG untuk Hiragana, Katakana, dan seluruh 2.026 Kanji JLPT N5–N1 dengan validasi arah kuas secara langsung.
          </p>
        </div>

        {drill && (
          <div className="flex items-center gap-3 text-xs font-mono-num">
            <span className="font-semibold text-[#0284C7]">
              Sesi Drill: {drill.index + 1} / {drill.queue.length}
            </span>
            <button
              type="button"
              onClick={() => setDrill(null)}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
            >
              Keluar Drill
            </button>
          </div>
        )}
      </div>

      {/* Active Drill Progress Bar */}
      {drill && (
        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#0284C7] rounded-full transition-all duration-300"
            style={{
              width: `${Math.round(
                ((drill.index + (completedBanner ? 1 : 0)) / drill.queue.length) * 100
              )}%`,
            }}
          />
        </div>
      )}

      {/* TWO-ZONE EDUCATIONAL SANDBOX LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT ZONE (7 cols): Interactive Calligraphy Stage */}
        <section className="lg:col-span-7 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5 min-w-0">
          {/* Progressive Practice Mode Segmented Control */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-900/70 p-1 max-w-full overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'learn', label: '1. Belajar & Jiplak' },
                  { id: 'recall', label: '2. Ujian Hafalan' },
                  { id: 'freehand', label: '3. Latihan Bebas' },
                ] as { id: WritingMode; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModeChange(m.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    mode === m.id
                      ? 'bg-white dark:bg-[#1E2430] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Brush Style Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setBrushStyle('fude')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  brushStyle === 'fude'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                Kuas Fude
              </button>
              <button
                type="button"
                onClick={() => setBrushStyle('pen')}
                className={`px-2.5 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  brushStyle === 'pen'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Pena
              </button>
            </div>
          </div>

          {/* Character Prompt Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3.5 min-w-0">
              {/* Target Character Preview (Hidden in Recall Mode until solved or peeked) */}
              <div
                className="w-14 h-14 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-center shrink-0"
                aria-label={
                  mode === 'recall' && !completedBanner && !recallPeek
                    ? 'Karakter disembunyikan untuk ujian hafalan'
                    : `Karakter ${activeEntry.char}`
                }
              >
                {mode === 'recall' && !completedBanner && !recallPeek ? (
                  <span className="font-display text-2xl font-bold text-slate-400 dark:text-slate-500">
                    ?
                  </span>
                ) : (
                  <span className="font-jp text-3xl font-bold text-slate-900 dark:text-white">
                    {activeEntry.char}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{activeEntry.groupLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">
                    {totalStrokes > 0 ? `${totalStrokes} goresan` : 'Memuat...'}
                  </span>
                  {activeProgress?.recallPassed && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Lulus Hafalan
                      </span>
                    </>
                  )}
                </div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                  {activeEntry.script === 'kanji'
                    ? activeEntry.primaryLabel
                    : `「${activeEntry.primaryLabel}」`}
                </h2>
                <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                  {activeEntry.readingHint}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePlayAudio}
                title="Putar pelafalan audio"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
              </button>
              {!drill && (
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handlePrevNext(-1)}
                    className="min-h-[40px] px-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrevNext(1)}
                    className="min-h-[40px] px-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-l border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Brush Writing Canvas */}
          <div className="space-y-3">
            <WritingCanvas
              char={activeEntry.char}
              strokePaths={strokePaths}
              loadingStrokes={loadingStrokes}
              mode={mode}
              brushStyle={brushStyle}
              showGrid={showGrid}
              showGuide={showGuideOnCanvas}
              showStrokeNumbers={showStrokeNumbers && mode !== 'recall'}
              completedCount={completedCount}
              freehandStrokes={freehandStrokes}
              hintTrigger={hintTrigger}
              inspectedStrokeIndex={inspectedStrokeIdx}
              isAnimating={isAnimating}
              animationSpeed={animationSpeed}
              onAnimationEnd={() => setIsAnimating(false)}
              onStrokeAccepted={(res) => handleStrokeAccepted(res)}
              onStrokeRejected={handleStrokeRejected}
              onFreehandStrokeAdd={(st) => {
                setFreehandStrokes((prev) => [...prev, st]);
                setFreehandScore(null);
              }}
            />

            {/* Live Dual-Coded Feedback Line (Icon + Explicit Text, Never Hue-Only) */}
            <div
              role="status"
              aria-live="polite"
              className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border text-xs sm:text-sm ${
                feedback.tone === 'success'
                  ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                  : feedback.tone === 'error'
                  ? 'border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {feedback.tone === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : feedback.tone === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                ) : (
                  <PenTool className="w-4 h-4 shrink-0 text-[#0284C7]" />
                )}
                <span className="leading-snug">{feedback.text}</span>
              </div>

              {mode !== 'freehand' && totalStrokes > 0 && (
                <span className="font-mono-num text-xs font-bold shrink-0">
                  {completedCount}/{totalStrokes}
                </span>
              )}
              {mode === 'freehand' && (
                <span className="font-mono-num text-xs font-bold shrink-0">
                  {freehandStrokes.length} goresan
                </span>
              )}
            </div>

            {/* Completion CTA Strip (Next Character / Advance Drill / Retry) */}
            {completedBanner && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/25">
                <div className="text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 font-medium">
                  Skor <strong className="font-mono-num">{completedBanner.score}%</strong> ·{' '}
                  {mode === 'learn'
                    ? 'Siap diuji tanpa bayangan?'
                    : 'Penguasaan tersimpan otomatis ke akunmu.'}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => resetCanvasState(mode)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 cursor-pointer"
                  >
                    Tulis Ulang
                  </button>
                  {mode === 'learn' && !drill && (
                    <button
                      type="button"
                      onClick={() => handleModeChange('recall')}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      Uji Hafalan
                    </button>
                  )}
                  {drill ? (
                    <button
                      type="button"
                      onClick={advanceDrill}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold cursor-pointer"
                    >
                      {drill.index + 1 >= drill.queue.length
                        ? 'Lihat Ringkasan'
                        : 'Karakter Berikutnya'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handlePrevNext(1)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold cursor-pointer"
                    >
                      Berikutnya
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Primary Canvas Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* Stroke-order Animation Play/Stop */}
                {strokePaths && strokePaths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setInspectedStrokeIdx(null);
                      setIsAnimating((v) => !v);
                    }}
                    className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      isAnimating
                        ? 'bg-rose-600 text-white'
                        : 'bg-[#0284C7] hover:bg-[#0369A1] text-white'
                    }`}
                  >
                    {isAnimating ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        Berhenti
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Animasi Urutan
                      </>
                    )}
                  </button>
                )}

                {/* Hint button (Guided modes) */}
                {mode !== 'freehand' && strokePaths && completedCount < strokePaths.length && (
                  <button
                    type="button"
                    onClick={handleTriggerHint}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Petunjuk
                  </button>
                )}

                {/* Recall Peek toggle */}
                {mode === 'recall' && !completedBanner && (
                  <button
                    type="button"
                    onClick={() => setRecallPeek((v) => !v)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                  >
                    {recallPeek ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Sembunyikan
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Intip
                      </>
                    )}
                  </button>
                )}

                {/* Freehand Score & Undo */}
                {mode === 'freehand' && (
                  <>
                    <button
                      type="button"
                      disabled={freehandStrokes.length === 0 || !strokePaths}
                      onClick={handleEvaluateFreehand}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Nilai Bentuk
                    </button>
                    <button
                      type="button"
                      disabled={freehandStrokes.length === 0}
                      onClick={() => {
                        setFreehandStrokes((prev) => prev.slice(0, -1));
                        setFreehandScore(null);
                      }}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Undo
                    </button>
                  </>
                )}

                {/* Reset / Clear Canvas */}
                <button
                  type="button"
                  onClick={() => resetCanvasState(mode)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                >
                  {mode === 'freehand' ? (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      Ulangi
                    </>
                  )}
                </button>
              </div>

              {/* Secondary Visual Toggles (Grid, Guide, Numbers, Speed) */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setShowGrid((v) => !v)}
                  title="Tampilkan / sembunyikan kotak Genkōyōshi"
                  className={`min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                    showGrid
                      ? 'border-slate-900 dark:border-slate-300 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  Grid
                </button>

                {mode === 'freehand' && (
                  <button
                    type="button"
                    onClick={() => setShowGuideInFreehand((v) => !v)}
                    className={`min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                      showGuideInFreehand
                        ? 'border-slate-900 dark:border-slate-300 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Bayangan
                  </button>
                )}

                {mode === 'learn' && (
                  <button
                    type="button"
                    onClick={() => setShowStrokeNumbers((v) => !v)}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                      showStrokeNumbers
                        ? 'border-slate-900 dark:border-slate-300 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    Nomor
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setAnimationSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 0.6 : 1))
                  }
                  title="Kecepatan animasi urutan goresan"
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 font-mono-num text-slate-600 dark:text-slate-300 hover:border-slate-400 cursor-pointer"
                >
                  {animationSpeed}×
                </button>
              </div>
            </div>
          </div>

          {/* Step-by-Step Interactive Stroke-Order Breakdown Strip (Kakijun) */}
          {strokePaths && strokePaths.length > 0 && mode !== 'recall' && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Diagram Urutan Goresan (Kakijun · 書き順)
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Klik nomor untuk menyorot goresan di kanvas
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {strokePaths.map((_, stepIdx) => {
                  const isInspected = inspectedStrokeIdx === stepIdx;
                  const isCurrent = mode === 'learn' && completedCount === stepIdx;
                  const isDone = mode === 'learn' && stepIdx < completedCount;
                  return (
                    <button
                      key={`step-${stepIdx}`}
                      type="button"
                      onClick={() =>
                        setInspectedStrokeIdx((prev) =>
                          prev === stepIdx ? null : stepIdx
                        )
                      }
                      className={`shrink-0 w-14 rounded-lg border p-1.5 flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                        isInspected
                          ? 'border-[#0284C7] bg-sky-50/70 dark:bg-sky-950/30'
                          : isCurrent
                          ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800/70'
                          : isDone
                          ? 'border-emerald-300 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                      }`}
                    >
                      <svg viewBox="0 0 109 109" className="w-10 h-10">
                        {strokePaths.slice(0, stepIdx).map((d, i) => (
                          <path
                            key={i}
                            d={d}
                            fill="none"
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="stroke-slate-400 dark:stroke-slate-500"
                          />
                        ))}
                        <path
                          d={strokePaths[stepIdx]}
                          fill="none"
                          stroke="#0284C7"
                          strokeWidth="7.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="font-mono-num text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {stepIdx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Freehand Score Display */}
          {freehandScore && mode === 'freehand' && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-400">
                Evaluasi proporsi terhadap standar KanjiVG
              </span>
              <span className="font-mono-num text-base font-extrabold text-slate-900 dark:text-white">
                {freehandScore.score} / 100
              </span>
            </div>
          )}
        </section>

        {/* RIGHT ZONE (5 cols): Character Guide, Drill Launcher & Character Picker */}
        <div className="lg:col-span-5 space-y-5 min-w-0">
          {/* Active Character Reference & Tips Card */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-semibold text-[#0284C7]">
                  Catatan &amp; Panduan Karakter
                </div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {activeEntry.script === 'kanji'
                    ? `${activeEntry.primaryLabel}`
                    : `${activeEntry.script === 'hiragana' ? 'Hiragana' : 'Katakana'} "${activeEntry.primaryLabel}"`}
                </h3>
              </div>

              {activeEntry.curriculumItemId && (
                <button
                  type="button"
                  onClick={() => openItemDetail(activeEntry.curriculumItemId!)}
                  className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Detail Kanji →
                </button>
              )}
            </div>

            {activeEntry.meaningMnemonic && (
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {activeEntry.meaningMnemonic}
              </p>
            )}

            {activeEntry.example && (
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Contoh Kata
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                    <span className="font-jp text-base font-bold text-slate-900 dark:text-white">
                      {activeEntry.example.word}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ({activeEntry.example.reading})
                    </span>
                    <span className="text-xs text-slate-700 dark:text-slate-300">
                      — {activeEntry.example.meaning}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => speakJapanese(activeEntry.example!.word, 0.9)}
                  aria-label="Putar contoh kata"
                  className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Personal Mastery Metrics (Unboxed Tabular Figures) */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Skor Terbaik</div>
                <div className="font-mono-num text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {activeProgress ? `${activeProgress.bestScore}%` : '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Latihan</div>
                <div className="font-mono-num text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {activeProgress ? `${activeProgress.attempts}×` : '0×'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Hafalan</div>
                <div
                  className={`text-sm font-bold mt-0.5 ${
                    activeProgress?.recallPassed
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {activeProgress?.recallPassed ? 'Lulus' : 'Belum'}
                </div>
              </div>
            </div>
          </section>

          {/* Structured Drill Session Launcher */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="space-y-0.5">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Sesi Drill Menulis Beruntun
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Otomatis memilih karakter yang belum dikuasai dari daftar aktif di bawah.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={visibleEntries.length === 0}
                onClick={() => startDrillSession(5, 'learn')}
                className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#0284C7] text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer disabled:opacity-45"
              >
                Drill 5 · Belajar
              </button>
              <button
                type="button"
                disabled={visibleEntries.length === 0}
                onClick={() => startDrillSession(5, 'recall')}
                className="min-h-[42px] px-3 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45"
              >
                Drill 5 · Ujian Hafalan
              </button>
            </div>
          </section>

          {/* Character Selector Grid (Hiragana / Katakana / Kanji N5–N1) */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Pilih Karakter ({visibleEntries.length})
              </h3>
              {script === 'kanji' && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  N5–N4 offline · N3–N1 online
                </span>
              )}
            </div>

            {/* Kanji Filter Tabs */}
            {script === 'kanji' && (
              <div className="flex flex-wrap gap-1.5">
                {KANJI_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setKanjiFilter(f.id)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      kanjiFilter === f.id
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {/* Instant Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  script === 'kanji'
                    ? 'Cari kanji, arti Inggris, atau bacaan...'
                    : 'Cari huruf atau romaji (mis. shi, tsu)...'
                }
                className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0284C7]"
              />
            </div>

            {/* Character Grid */}
            {visibleEntries.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Tidak ada karakter yang cocok dengan filter atau pencarianmu.
              </div>
            ) : (
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 max-h-[340px] overflow-y-auto pr-1">
                {visibleEntries.slice(0, 240).map((entry) => {
                  const isActive = entry.char === activeEntry.char;
                  const prog = writingProgressMap[entry.char];
                  return (
                    <button
                      key={entry.char}
                      type="button"
                      onClick={() => handleSelectCharacter(entry)}
                      className={`relative min-h-[54px] p-1.5 rounded-lg border flex flex-col items-center justify-center transition-colors cursor-pointer ${
                        isActive
                          ? 'border-[#0284C7] bg-sky-50/80 dark:bg-sky-950/40 text-slate-950 dark:text-white'
                          : prog?.recallPassed
                          ? 'border-emerald-200 dark:border-emerald-900/80 bg-emerald-50/40 dark:bg-emerald-950/20 text-slate-900 dark:text-white hover:border-emerald-400'
                          : prog
                          ? 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 text-slate-900 dark:text-white hover:border-slate-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
                      }`}
                    >
                      <span className="font-jp text-lg sm:text-xl font-bold leading-none">
                        {entry.char}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-full mt-1">
                        {entry.script === 'kanji'
                          ? entry.primaryLabel
                          : entry.primaryLabel}
                      </span>
                      {prog?.recallPassed && (
                        <Check
                          aria-label="Lulus hafalan"
                          className="w-3 h-3 text-emerald-600 dark:text-emerald-400 absolute top-1 right-1"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {visibleEntries.length > 240 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                Menampilkan 240 pertama dari {visibleEntries.length} karakter — gunakan pencarian atau filter JLPT untuk mempersempit.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};
