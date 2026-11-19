import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileText,
  Headphones,
  Play,
  RotateCcw,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { JLPT_LEVELS } from '../data/grammar';
import {
  LISTENING_TASK_TYPES,
  loadListeningDataset,
} from '../data/listening';
import { stripFuriganaMarkup } from '../data/reading';
import { JlptLevel } from '../types/grammar';
import {
  ListeningDataset,
  ListeningTaskType,
  ListeningTrack,
} from '../types/listening';
import {
  DialogueCue,
  isSpeechSupported,
  playDialogueSequence,
  speakJapanese,
  stopSpeech,
} from '../utils/audio';

const SPEED_OPTIONS = [0.75, 0.9, 1.0, 1.15] as const;

const RubyText: React.FC<{ text: string; showFurigana: boolean }> = ({
  text,
  showFurigana,
}) => {
  if (!showFurigana) {
    return <>{stripFuriganaMarkup(text)}</>;
  }

  const tokens: React.ReactNode[] = [];
  const bracketRe = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = bracketRe.exec(text)) !== null) {
    const reading = match[1];
    const before = text.slice(lastIndex, match.index);
    const kanjiTailMatch = before.match(/^(.*?)([\u4e00-\u9faf々ヶ〇]+)$/s);
    if (kanjiTailMatch) {
      if (kanjiTailMatch[1]) {
        tokens.push(
          <React.Fragment key={keyIdx++}>{kanjiTailMatch[1]}</React.Fragment>
        );
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
      tokens.push(<React.Fragment key={keyIdx++}>{before}</React.Fragment>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push(
      <React.Fragment key={keyIdx++}>{text.slice(lastIndex)}</React.Fragment>
    );
  }

  return <>{tokens}</>;
};

export const ListeningHub: React.FC = () => {
  const { state, setActiveView, recordListeningAttempt } = useApp();

  const [data, setData] = useState<ListeningDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Catalog state
  const [selectedLevel, setSelectedLevel] = useState<JlptLevel>(5);
  const [taskFilter, setTaskFilter] = useState<'all' | ListeningTaskType>('all');

  // Active listening studio state
  const [activeTrack, setActiveTrack] = useState<ListeningTrack | null>(null);
  const [studyMode, setStudyMode] = useState<'exam' | 'practice'>('exam');
  const [playbackRate, setPlaybackRate] = useState<number>(0.9);
  const [showFurigana, setShowFurigana] = useState<boolean>(true);
  const [showScript, setShowScript] = useState<boolean>(false);
  const [showPhrases, setShowPhrases] = useState<boolean>(false);
  const [hideSokujiChoiceText, setHideSokujiChoiceText] = useState<boolean>(false);

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [activeCueIdx, setActiveCueIdx] = useState<number>(-1);
  const [totalCues, setTotalCues] = useState<number>(0);
  const [listenCount, setListenCount] = useState<number>(0);
  const cancelPlaybackRef = useRef<(() => void) | null>(null);

  // Question / submission state
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const speechAvailable = useMemo(() => isSpeechSupported(), []);

  useEffect(() => {
    let active = true;
    loadListeningDataset()
      .then((ds) => {
        if (active) setData(ds);
      })
      .catch((err) => {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : 'Gagal memuat materi Chōkai.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Always stop speech cleanly when unmounting
  useEffect(() => {
    return () => {
      cancelPlaybackRef.current?.();
      stopSpeech();
    };
  }, []);

  const progressMap = state.listeningProgress ?? {};

  const levelStats = useMemo(() => {
    const map: Record<
      JlptLevel,
      { total: number; passed: number; firstListen: number }
    > = {
      5: { total: 0, passed: 0, firstListen: 0 },
      4: { total: 0, passed: 0, firstListen: 0 },
      3: { total: 0, passed: 0, firstListen: 0 },
      2: { total: 0, passed: 0, firstListen: 0 },
      1: { total: 0, passed: 0, firstListen: 0 },
    };

    if (!data) return map;
    for (const track of data.tracks) {
      const b = map[track.jlpt];
      b.total += 1;
      const prog = progressMap[track.id];
      if (prog?.passed) b.passed += 1;
      if (prog?.passedFirstListen) b.firstListen += 1;
    }
    return map;
  }, [data, progressMap]);

  const totals = useMemo(() => {
    let passed = 0;
    let firstListen = 0;
    for (const lvl of [5, 4, 3, 2, 1] as JlptLevel[]) {
      passed += levelStats[lvl].passed;
      firstListen += levelStats[lvl].firstListen;
    }
    return {
      totalTracks: data?.tracks.length ?? 25,
      passed,
      firstListen,
    };
  }, [levelStats, data]);

  const filteredTracks = useMemo(() => {
    if (!data) return [];
    const base = data.byJlpt[selectedLevel] ?? [];
    if (taskFilter === 'all') return base;
    return base.filter((t) => t.taskType === taskFilter);
  }, [data, selectedLevel, taskFilter]);

  const getTaskMeta = (type: ListeningTaskType) =>
    LISTENING_TASK_TYPES.find((t) => t.id === type) ?? LISTENING_TASK_TYPES[0];

  const stopAudio = () => {
    cancelPlaybackRef.current?.();
    cancelPlaybackRef.current = null;
    stopSpeech();
    setIsPlaying(false);
    setActiveCueId(null);
    setActiveCueIdx(-1);
  };

  const openTrack = (track: ListeningTrack) => {
    stopAudio();
    setActiveTrack(track);
    setSelectedChoice(null);
    setSubmitted(false);
    setListenCount(0);
    setShowFurigana(track.jlpt >= 3);
    setShowScript(studyMode === 'practice');
    setShowPhrases(false);
    setHideSokujiChoiceText(track.taskType === 'sokuji' && studyMode === 'exam');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exitTrack = () => {
    stopAudio();
    setActiveTrack(null);
  };

  const buildTrackCues = (track: ListeningTrack): DialogueCue[] => {
    const cues: DialogueCue[] = [
      {
        id: 'intro',
        role: 'narrator',
        text: track.introJp,
        pauseAfterMs: 550,
      },
      ...track.lines.map((line, idx) => ({
        id: `line-${idx}`,
        role: line.role,
        text: line.jp,
        pauseAfterMs: idx === track.lines.length - 1 ? 650 : 380,
      })),
    ];

    if (track.taskType === 'sokuji') {
      // In real JLPT Sokuji Ōtō, all 3 response options are spoken sequentially
      track.choices.forEach((choice, idx) => {
        const spokenNum = idx === 0 ? 'いち。' : idx === 1 ? 'に。' : 'さん。';
        cues.push({
          id: `choice-${idx}`,
          role: track.lines[0]?.role === 'female' ? 'male' : 'female',
          text: `${spokenNum}${choice}`,
          pauseAfterMs: 550,
        });
      });
    } else {
      cues.push({
        id: 'question',
        role: 'narrator',
        text: track.questionJp,
        pauseAfterMs: 300,
      });
    }

    return cues;
  };

  const handlePlayFullTrack = () => {
    if (!activeTrack) return;
    if (isPlaying) {
      stopAudio();
      return;
    }

    const cues = buildTrackCues(activeTrack);
    setTotalCues(cues.length);
    setIsPlaying(true);
    setListenCount((c) => c + 1);

    cancelPlaybackRef.current = playDialogueSequence(cues, {
      rate: playbackRate,
      onCueStart: (cueId, idx) => {
        setActiveCueId(cueId);
        setActiveCueIdx(idx);
      },
      onComplete: () => {
        cancelPlaybackRef.current = null;
        setIsPlaying(false);
        setActiveCueId(null);
        setActiveCueIdx(-1);
      },
      onError: () => {
        cancelPlaybackRef.current = null;
        setIsPlaying(false);
        setActiveCueId(null);
        setActiveCueIdx(-1);
      },
    });
  };

  const handleReplaySingleLine = (
    cueId: string,
    text: string,
    role: ListeningTrack['lines'][number]['role']
  ) => {
    stopAudio();
    setIsPlaying(true);
    setActiveCueId(cueId);
    setActiveCueIdx(-1);
    setTotalCues(0);
    speakJapanese(text, playbackRate, role, () => {
      setIsPlaying(false);
      setActiveCueId(null);
    });
  };

  const handlePlayChoiceAudio = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeTrack) return;
    const role =
      activeTrack.lines[0]?.role === 'female' ? 'male' : 'female';
    handleReplaySingleLine(`choice-${idx}`, activeTrack.choices[idx], role);
  };

  const handleSwitchStudyMode = (nextMode: 'exam' | 'practice') => {
    setStudyMode(nextMode);
    if (nextMode === 'practice') {
      setShowScript(true);
      setHideSokujiChoiceText(false);
    } else if (!submitted) {
      setShowScript(false);
      if (activeTrack?.taskType === 'sokuji') {
        setHideSokujiChoiceText(true);
      }
    }
  };

  const handleSubmit = () => {
    if (!activeTrack || selectedChoice === null || submitted) return;
    stopAudio();
    const isCorrect = selectedChoice === activeTrack.answerIndex;
    setSubmitted(true);
    setShowScript(true);
    setHideSokujiChoiceText(false);
    recordListeningAttempt(activeTrack.id, isCorrect, Math.max(1, listenCount));
  };

  const handleRetry = () => {
    if (!activeTrack) return;
    stopAudio();
    setSelectedChoice(null);
    setSubmitted(false);
    setListenCount(0);
    if (studyMode === 'exam') {
      setShowScript(false);
      setHideSokujiChoiceText(activeTrack.taskType === 'sokuji');
    }
  };

  const handleNextTrack = () => {
    if (!data || !activeTrack) return;
    const sameLevel = data.byJlpt[activeTrack.jlpt] ?? [];
    const idx = sameLevel.findIndex((t) => t.id === activeTrack.id);
    if (idx >= 0 && idx + 1 < sameLevel.length) {
      openTrack(sameLevel[idx + 1]);
    } else {
      exitTrack();
    }
  };

  const describeActiveCue = (): string => {
    if (!activeTrack || !activeCueId) return 'Siap diputar';
    if (activeCueId === 'intro') return 'Pengantar Narator...';
    if (activeCueId === 'question') return 'Pertanyaan Ujian...';
    if (activeCueId.startsWith('choice-')) {
      const idx = Number(activeCueId.replace('choice-', ''));
      return `Memutar Pilihan ${idx + 1}...`;
    }
    if (activeCueId.startsWith('line-')) {
      const idx = Number(activeCueId.replace('line-', ''));
      const line = activeTrack.lines[idx];
      if (line) {
        return `${line.speaker} berbicara (${idx + 1}/${activeTrack.lines.length})...`;
      }
    }
    return 'Memutar audio...';
  };

  if (loadError) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-rose-200 dark:border-rose-900 p-6 space-y-3">
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Gagal Memuat Modul Mendengarkan (Chōkai)
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
            Memuat 25 Audio Latihan Chōkai JLPT N5–N1...
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Menyiapkan dialog multi-pembicara, transkrip furigana, dan pembahasan bahasa Inggris.
          </p>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 1: ACTIVE LISTENING STUDIO
  // =========================================================================
  if (activeTrack) {
    const lvlMeta =
      JLPT_LEVELS.find((l) => l.level === activeTrack.jlpt) ?? JLPT_LEVELS[0];
    const taskMeta = getTaskMeta(activeTrack.taskType);
    const sameLevelList = data.byJlpt[activeTrack.jlpt] ?? [];
    const currentIndex = sameLevelList.findIndex((t) => t.id === activeTrack.id);
    const hasNext = currentIndex >= 0 && currentIndex + 1 < sameLevelList.length;
    const isCorrect =
      submitted && selectedChoice === activeTrack.answerIndex;
    const progressPct =
      totalCues > 0 && activeCueIdx >= 0
        ? Math.min(100, Math.round(((activeCueIdx + 1) / totalCues) * 100))
        : 0;
    const canRevealScript = submitted || studyMode === 'practice';

    return (
      <main className="w-full max-w-full overflow-x-clip">
        {/* Sticky Studio Control Bar */}
        <div className="sticky top-14 sm:top-16 z-20 bg-white/95 dark:bg-[#161A22]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={exitTrack}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white py-1 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Katalog Chōkai</span>
              </button>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                |
              </span>
              <span
                className="font-mono-num text-xs font-extrabold px-2 py-0.5 rounded text-white shrink-0"
                style={{ backgroundColor: lvlMeta.accent }}
              >
                {lvlMeta.code}
              </span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                {taskMeta.label} ({taskMeta.jpLabel})
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar max-w-full">
              {/* Exam vs Practice Switch */}
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSwitchStudyMode('exam')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    studyMode === 'exam'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Mode Ujian
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchStudyMode('practice')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    studyMode === 'practice'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Mode Latihan
                </button>
              </div>

              {/* Speed Cycle */}
              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] p-0.5 shrink-0">
                {SPEED_OPTIONS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setPlaybackRate(spd)}
                    className={`px-2 py-1 rounded text-[11px] font-mono-num font-bold cursor-pointer transition-colors ${
                      playbackRate === spd
                        ? 'bg-[#0284C7] text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Furigana Toggle */}
              <button
                type="button"
                onClick={() => setShowFurigana((v) => !v)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shrink-0 ${
                  showFurigana
                    ? 'border-[#0284C7] bg-[#0284C7]/10 text-[#0284C7]'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {showFurigana ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                <span>ふりがな</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Studio Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN (7 cols): Audio Player Deck + Interactive Transcript */}
          <div className="lg:col-span-7 space-y-5 min-w-0">
            {/* Audio Player Card */}
            <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div
                className="px-5 py-4 text-white"
                style={{ backgroundColor: taskMeta.accent }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/85">
                  <span className="font-semibold">
                    {lvlMeta.code} · {taskMeta.label} ({taskMeta.jpLabel})
                  </span>
                  <span className="font-mono-num">
                    Diputar {listenCount}x · {playbackRate}x
                  </span>
                </div>
                <h1 className="font-jp text-lg sm:text-2xl font-bold mt-1 leading-snug">
                  <RubyText
                    text={activeTrack.titleJp}
                    showFurigana={showFurigana}
                  />
                </h1>
                <p className="text-xs sm:text-sm text-white/90 mt-1">
                  {activeTrack.situationEn}
                </p>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                {!speechAvailable && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                    Browser ini tidak mendukung Web Speech API bahasa Jepang. Aktifkan <strong>Mode Latihan</strong> di atas untuk membaca transkrip dialog.
                  </div>
                )}

                {/* Primary Play/Stop Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePlayFullTrack}
                    className={`min-h-[48px] flex-1 inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm sm:text-base font-semibold transition-colors cursor-pointer ${
                      isPlaying
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-[#0284C7] hover:bg-[#0369A1] text-white'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Square className="w-4 h-4 fill-current" />
                        Hentikan Audio
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        {listenCount === 0
                          ? 'Putar Audio Lengkap (Narator + Dialog)'
                          : 'Putar Ulang Audio Lengkap'}
                      </>
                    )}
                  </button>

                  {activeTrack.taskType !== 'sokuji' && (
                    <button
                      type="button"
                      onClick={() =>
                        handleReplaySingleLine(
                          'question',
                          activeTrack.questionJp,
                          'narrator'
                        )
                      }
                      className="min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-[#0284C7] hover:text-[#0284C7] cursor-pointer whitespace-nowrap"
                    >
                      <Volume2 className="w-4 h-4" />
                      Dengar Pertanyaan
                    </button>
                  )}
                </div>

                {/* Live Playback Progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-medium truncate">
                      <Headphones className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
                      {describeActiveCue()}
                    </span>
                    {totalCues > 0 && isPlaying && (
                      <span className="font-mono-num shrink-0">{progressPct}%</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0284C7] rounded-full transition-all duration-300"
                      style={{
                        width: isPlaying
                          ? `${Math.max(8, progressPct)}%`
                          : listenCount > 0
                          ? '100%'
                          : '0%',
                      }}
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>
                    {studyMode === 'exam' && !submitted
                      ? 'Mode Ujian aktif: transkrip dikunci sampai kamu mengirim jawaban.'
                      : 'Klik ikon speaker pada baris transkrip mana saja untuk mengulang kalimat tersebut.'}
                  </span>
                  {studyMode === 'exam' && !submitted && (
                    <button
                      type="button"
                      onClick={() => handleSwitchStudyMode('practice')}
                      className="text-[#0284C7] font-semibold hover:underline cursor-pointer"
                    >
                      Buka Transkrip
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Interactive Script Card (Unlocked after submit or in Practice Mode) */}
            {canRevealScript && (
              <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowScript((v) => !v)}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <FileText className="w-4 h-4 text-[#0284C7]" />
                    Transkrip Dialog &amp; Terjemahan ({activeTrack.lines.length} Baris)
                  </span>
                  {showScript ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {showScript && (
                  <div className="px-5 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    {/* Intro line */}
                    <div
                      className={`p-3 rounded-lg border transition-colors ${
                        activeCueId === 'intro'
                          ? 'border-[#0284C7] bg-sky-50/70 dark:bg-sky-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Narrator (Intro)
                          </div>
                          <p className="font-jp text-sm sm:text-base text-slate-900 dark:text-slate-100 leading-relaxed">
                            <RubyText
                              text={activeTrack.introJp}
                              showFurigana={showFurigana}
                            />
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {activeTrack.introEn}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleReplaySingleLine(
                              'intro',
                              activeTrack.introJp,
                              'narrator'
                            )
                          }
                          aria-label="Putar ulang intro"
                          className="p-2 min-w-[36px] min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0284C7] hover:border-[#0284C7] shrink-0 flex items-center justify-center cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Dialogue lines */}
                    {activeTrack.lines.map((line, idx) => {
                      const cueId = `line-${idx}`;
                      const isCurrent = activeCueId === cueId;
                      return (
                        <div
                          key={cueId}
                          className={`p-3.5 rounded-lg border transition-colors ${
                            isCurrent
                              ? 'border-[#0284C7] bg-sky-50/80 dark:bg-sky-950/35'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="space-y-1 min-w-0">
                              <div className="text-[11px] font-bold text-[#0284C7]">
                                {line.speaker}
                              </div>
                              <p className="font-jp text-sm sm:text-base text-slate-900 dark:text-slate-100 leading-[1.9]">
                                <RubyText
                                  text={line.jp}
                                  showFurigana={showFurigana}
                                />
                              </p>
                              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                {line.en}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleReplaySingleLine(cueId, line.jp, line.role)
                              }
                              aria-label={`Putar baris ${idx + 1}`}
                              className="p-2 min-w-[36px] min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0284C7] hover:border-[#0284C7] shrink-0 flex items-center justify-center cursor-pointer"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Key Listening Expressions Drawer */}
            <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPhrases((v) => !v)}
                className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Volume2 className="w-4 h-4 text-[#D97706]" />
                  Ungkapan Kunci &amp; Jebakan Chōkai ({activeTrack.keyPhrases.length})
                </span>
                {showPhrases ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showPhrases && (
                <div className="px-5 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {activeTrack.keyPhrases.map((phrase, idx) => (
                    <div
                      key={idx}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-jp text-sm font-bold text-slate-900 dark:text-white">
                          <RubyText
                            text={phrase.jp}
                            showFurigana={showFurigana}
                          />{' '}
                          <span className="font-normal text-xs text-slate-500 dark:text-slate-400">
                            ({phrase.reading})
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          {phrase.en}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleReplaySingleLine(
                            `phrase-${idx}`,
                            phrase.jp,
                            'narrator'
                          )
                        }
                        aria-label={`Putar ungkapan ${phrase.reading}`}
                        className="p-2 min-w-[36px] min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#0284C7] hover:border-[#0284C7] shrink-0 flex items-center justify-center cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN (5 cols): Question & Choices */}
          <div className="lg:col-span-5 space-y-5 min-w-0">
            {/* Result Banner */}
            {submitted && (
              <div
                className={`rounded-xl border p-4 sm:p-5 space-y-3 ${
                  isCorrect
                    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div
                      className={`font-display text-lg font-bold ${
                        isCorrect
                          ? 'text-emerald-800 dark:text-emerald-300'
                          : 'text-rose-800 dark:text-rose-300'
                      }`}
                    >
                      {isCorrect
                        ? listenCount <= 1
                          ? 'Benar pada Dengar ke-1!'
                          : 'Jawaban Benar!'
                        : 'Belum Tepat'}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Jawaban benar: Pilihan {activeTrack.answerIndex + 1} · Transkrip lengkap kini terbuka di samping.
                    </p>
                  </div>
                  <CheckCircle2
                    className={`w-6 h-6 shrink-0 ${
                      isCorrect ? 'text-emerald-600' : 'text-rose-500'
                    }`}
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Coba Lagi
                  </button>
                  {hasNext ? (
                    <button
                      type="button"
                      onClick={handleNextTrack}
                      className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold cursor-pointer"
                    >
                      Audio Berikutnya
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={exitTrack}
                      className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold cursor-pointer"
                    >
                      Selesai · Kembali ke Katalog
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Question Card */}
            <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0284C7] font-mono-num">
                    PERTANYAAN CHŌKAI
                  </span>
                  {activeTrack.taskType === 'sokuji' && !submitted && (
                    <button
                      type="button"
                      onClick={() => setHideSokujiChoiceText((v) => !v)}
                      className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-[#0284C7] cursor-pointer"
                    >
                      {hideSokujiChoiceText
                        ? 'Tampilkan Teks Opsi'
                        : 'Sembunyikan Teks (Audio Only)'}
                    </button>
                  )}
                </div>

                <h2 className="font-jp text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-relaxed">
                  <RubyText
                    text={activeTrack.questionJp}
                    showFurigana={showFurigana}
                  />
                </h2>
                {(submitted || studyMode === 'practice') && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeTrack.questionEn}
                  </p>
                )}
              </div>

              {/* Choices */}
              <div className="space-y-2.5">
                {activeTrack.choices.map((choice, cIdx) => {
                  const isPicked = selectedChoice === cIdx;
                  const isRightChoice = cIdx === activeTrack.answerIndex;
                  const isSpokenNow = activeCueId === `choice-${cIdx}`;

                  let style =
                    'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200';

                  if (submitted) {
                    if (isRightChoice) {
                      style =
                        'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200';
                    } else if (isPicked && !isRightChoice) {
                      style =
                        'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200';
                    } else {
                      style =
                        'border-slate-200 dark:border-slate-800 opacity-60 text-slate-500';
                    }
                  } else if (isPicked) {
                    style =
                      'border-[#0284C7] bg-sky-50/70 dark:bg-sky-950/30 text-slate-900 dark:text-white ring-1 ring-[#0284C7]/30';
                  } else if (isSpokenNow) {
                    style =
                      'border-[#D97706] bg-amber-50/60 dark:bg-amber-950/25 text-slate-900 dark:text-white';
                  }

                  return (
                    <div
                      key={cIdx}
                      role="button"
                      tabIndex={submitted ? -1 : 0}
                      onClick={() => {
                        if (!submitted) setSelectedChoice(cIdx);
                      }}
                      onKeyDown={(e) => {
                        if (!submitted && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setSelectedChoice(cIdx);
                        }
                      }}
                      className={`w-full min-h-[52px] px-3.5 py-3 rounded-lg border text-left flex items-start justify-between gap-2.5 transition-colors ${
                        submitted ? 'cursor-default' : 'cursor-pointer'
                      } ${style}`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span className="font-mono-num text-xs font-bold text-slate-400 mt-0.5 shrink-0">
                          {cIdx + 1}.
                        </span>
                        <div className="min-w-0 space-y-1">
                          {hideSokujiChoiceText && !submitted ? (
                            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                              Pilihan Audio {cIdx + 1} (klik ikon speaker untuk dengar)
                            </div>
                          ) : (
                            <div className="font-jp text-sm leading-relaxed break-words">
                              <RubyText
                                text={choice}
                                showFurigana={showFurigana}
                              />
                            </div>
                          )}
                          {submitted && (
                            <div className="text-xs text-slate-600 dark:text-slate-400">
                              {activeTrack.choicesEn[cIdx]}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {activeTrack.taskType === 'sokuji' && (
                          <button
                            type="button"
                            onClick={(e) => handlePlayChoiceAudio(cIdx, e)}
                            aria-label={`Putar pilihan ${cIdx + 1}`}
                            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0284C7] hover:border-[#0284C7] cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {submitted && isRightChoice && (
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                        {submitted && isPicked && !isRightChoice && (
                          <X className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Post-Submit Explanation (English) */}
              {submitted && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Explanation (English)
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {activeTrack.explanationEn}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              {!submitted && (
                <button
                  type="button"
                  disabled={selectedChoice === null}
                  onClick={handleSubmit}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {selectedChoice !== null
                    ? 'Periksa Jawaban'
                    : 'Pilih salah satu jawaban terlebih dahulu'}
                </button>
              )}
            </section>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 2: LISTENING CATALOG (N5–N1)
  // =========================================================================
  const activeLvlMeta =
    JLPT_LEVELS.find((l) => l.level === selectedLevel) ?? JLPT_LEVELS[0];
  const nextUnpassed = (data.byJlpt[selectedLevel] ?? []).find(
    (t) => !progressMap[t.id]?.passed
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* 4-Tab JLPT Module Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-0.5 max-w-full overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveView('grammar')}
            className="px-3 sm:px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            1. Grammar (100)
          </button>
          <button
            type="button"
            onClick={() => setActiveView('kana-vocab')}
            className="px-3 sm:px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            2. Kana JLPT (150)
          </button>
          <button
            type="button"
            onClick={() => setActiveView('reading')}
            className="px-3 sm:px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            3. Dokkai (25)
          </button>
          <button
            type="button"
            className="px-3 sm:px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 whitespace-nowrap cursor-pointer"
          >
            4. Chōkai (25)
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
          {totals.passed} / {totals.totalTracks} Audio Lulus · {totals.firstListen} Lulus 1x Dengar
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            Tahap 4 · Persiapan JLPT N5–N1
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Latihan Mendengarkan JLPT (Chōkai N5–N1)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
            25 simulasi audio multi-pembicara bergaya ujian JLPT — mencakup <em>Kadai Rikai</em>, <em>Pointo Rikai</em>, <em>Gaiyō Rikai</em>, <em>Sokuji Ōtō</em> (3 pilihan audio), dan <em>Tōgō Rikai</em> lengkap dengan kontrol kecepatan, mode ujian, transkrip furigana, dan pembahasan bahasa Inggris.
          </p>
        </div>

        {nextUnpassed && (
          <button
            type="button"
            onClick={() => openTrack(nextUnpassed)}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
            style={{ backgroundColor: activeLvlMeta.accent }}
          >
            <Headphones className="w-4 h-4" />
            Lanjut Audio {activeLvlMeta.code}
          </button>
        )}
      </div>

      {/* N5 - N1 Level Selector */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
        {JLPT_LEVELS.map((lvl) => {
          const st = levelStats[lvl.level];
          const isSelected = selectedLevel === lvl.level;
          const pct = st.total > 0 ? Math.round((st.passed / st.total) * 100) : 0;

          return (
            <button
              key={lvl.code}
              type="button"
              onClick={() => {
                setSelectedLevel(lvl.level);
                setTaskFilter('all');
              }}
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
                  {st.passed}/{st.total}
                </span>
              </div>

              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2.5">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: lvl.accent }}
                />
              </div>

              <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-mono-num">
                <span>Lulus {pct}%</span>
                {st.firstListen > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    1x: {st.firstListen}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Task Type Filter Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setTaskFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
            taskFilter === 'all'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
              : 'bg-white dark:bg-[#161A22] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
          }`}
        >
          Semua Format ({(data.byJlpt[selectedLevel] ?? []).length})
        </button>
        {LISTENING_TASK_TYPES.map((task) => {
          const count = (data.byJlpt[selectedLevel] ?? []).filter(
            (t) => t.taskType === task.id
          ).length;
          if (count === 0) return null;
          const active = taskFilter === task.id;
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => setTaskFilter(task.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
                active
                  ? 'text-white border-transparent'
                  : 'bg-white dark:bg-[#161A22] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-400'
              }`}
              style={active ? { backgroundColor: task.accent } : undefined}
            >
              {task.label} · {task.jpLabel} ({count})
            </button>
          );
        })}
      </div>

      {/* Track List */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTracks.map((track, idx) => {
          const taskMeta = getTaskMeta(track.taskType);
          const prog = progressMap[track.id];

          return (
            <div
              key={track.id}
              className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
            >
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: taskMeta.accent }}
                    >
                      {taskMeta.label} · {taskMeta.jpLabel}
                    </span>
                    <span className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                      #{idx + 1} · {track.choices.length} Opsi
                    </span>
                  </div>

                  {prog?.passedFirstListen ? (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Lulus 1x Dengar
                    </span>
                  ) : prog?.passed ? (
                    <span className="text-[11px] font-semibold text-[#0284C7]">
                      Lulus
                    </span>
                  ) : prog && prog.attempts > 0 ? (
                    <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      Perlu Ulang ({prog.attempts}x)
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">Belum Dicoba</span>
                  )}
                </div>

                <div>
                  <h2 className="font-jp text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
                    {stripFuriganaMarkup(track.titleJp)}
                  </h2>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                    {track.titleEn}
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {track.situationEn}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  {track.lines.length} giliran bicara
                </span>
                <button
                  type="button"
                  onClick={() => openTrack(track)}
                  className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: activeLvlMeta.accent }}
                >
                  <Headphones className="w-3.5 h-3.5" />
                  {prog?.attempts ? 'Ulangi Audio' : 'Mulai Dengarkan'}
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
};
