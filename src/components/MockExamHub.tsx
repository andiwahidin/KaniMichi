import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Flag,
  Headphones,
  Play,
  RotateCcw,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AiExplainButton } from './AiExplainButton';
import {
  GrammarManifest,
  JLPT_LEVELS,
  loadGrammarLevels,
  loadGrammarManifest,
} from '../data/grammar';
import {
  KanaVocabManifest,
  loadKanaVocabLevels,
  loadKanaVocabManifest,
} from '../data/kanaVocab';
import {
  ListeningManifest,
  loadListeningLevels,
  loadListeningManifest,
} from '../data/listening';
import {
  generateMockExamPaper,
  gradeMockExamPaper,
  JLPT_OFFICIAL_RULES,
  MOCK_EXAM_MODE_CONFIG,
} from '../data/mockExam';
import {
  loadReadingLevels,
  loadReadingManifest,
  ReadingManifest,
  stripFuriganaMarkup,
} from '../data/reading';
import { GrammarDataset, JlptLevel } from '../types/grammar';
import { KanaVocabDataset } from '../types/kanaVocab';
import { ListeningDataset, ListeningTrack } from '../types/listening';
import {
  MockExamChoiceQuestion,
  MockExamLength,
  MockExamPaper,
  MockExamPartId,
  MockExamResult,
} from '../types/mockExam';
import { ReadingDataset } from '../types/reading';
import {
  DialogueCue,
  playDialogueSequence,
  speakJapanese,
  stopSpeech,
} from '../utils/audio';

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

function formatClock(totalSec: number): string {
  const clamped = Math.max(0, totalSec);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface AllJlptBanks {
  grammar: GrammarDataset;
  kanaVocab: KanaVocabDataset;
  reading: ReadingDataset;
  listening: ListeningDataset;
}

interface AllJlptManifests {
  grammar: GrammarManifest;
  kanaVocab: KanaVocabManifest;
  reading: ReadingManifest;
  listening: ListeningManifest;
}

function getJlptFromItemId(id: string): JlptLevel | null {
  const match = id.match(/-n([1-5])-/i);
  return match ? (Number(match[1]) as JlptLevel) : null;
}

const PART_TABS: { id: MockExamPartId; label: string; shortLabel: string }[] = [
  { id: 'moji-goi', label: '1. Kanji & Kosakata', shortLabel: '1. Moji·Goi' },
  { id: 'bunpou', label: '2. Tata Bahasa', shortLabel: '2. Bunpō' },
  { id: 'dokkai', label: '3. Membaca', shortLabel: '3. Dokkai' },
  { id: 'choukai', label: '4. Mendengarkan', shortLabel: '4. Chōkai' },
];

export const MockExamHub: React.FC = () => {
  const { dataset, state, setActiveView, recordMockExamResult } = useApp();

  const [manifests, setManifests] = useState<AllJlptManifests | null>(null);
  const [banksByLevel, setBanksByLevel] = useState<
    Partial<Record<JlptLevel, AllJlptBanks>>
  >({});
  const [loadingLevel, setLoadingLevel] = useState<JlptLevel | null>(5);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Overview state
  const [selectedLevel, setSelectedLevel] = useState<JlptLevel>(5);
  const [examLength, setExamLength] = useState<MockExamLength>('standard');

  // Track recently drawn IDs across consecutive runs in this session to avoid repeating questions
  const recentIdsRef = useRef<{
    vocab: Set<string>;
    kana: Set<string>;
    grammar: Set<string>;
    passages: Set<string>;
    tracks: Set<string>;
  }>({
    vocab: new Set(),
    kana: new Set(),
    grammar: new Set(),
    passages: new Set(),
    tracks: new Set(),
  });

  // Active Exam Runner state
  const [paper, setPaper] = useState<MockExamPaper | null>(null);
  const [activePart, setActivePart] = useState<MockExamPartId>('moji-goi');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [confirmExit, setConfirmExit] = useState<boolean>(false);
  const [confirmSubmit, setConfirmSubmit] = useState<boolean>(false);

  // Exam Chōkai Audio Playback state
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [activeCueLabel, setActiveCueLabel] = useState<string>('');
  const [trackPlayCounts, setTrackPlayCounts] = useState<Record<string, number>>({});
  const cancelAudioRef = useRef<(() => void) | null>(null);

  // Submitted Result & Review state
  const [completedResult, setCompletedResult] = useState<MockExamResult | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | MockExamPartId>('all');

  // Load 4 tiny manifests on mount (~1.8 KB total) for instant 5-level Readiness overview
  useEffect(() => {
    let active = true;
    Promise.all([
      loadGrammarManifest(),
      loadKanaVocabManifest(),
      loadReadingManifest(),
      loadListeningManifest(),
    ])
      .then(([grammar, kanaVocab, reading, listening]) => {
        if (active) {
          setManifests({ grammar, kanaVocab, reading, listening });
        }
      })
      .catch((err) => {
        if (active) {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'Gagal memuat indeks bank soal Mogi Shiken.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Load ONLY the selected JLPT level's 4 question banks on demand
  useEffect(() => {
    if (banksByLevel[selectedLevel]) {
      setLoadingLevel(null);
      return;
    }
    let active = true;
    setLoadingLevel(selectedLevel);
    Promise.all([
      loadGrammarLevels([selectedLevel]),
      loadKanaVocabLevels([selectedLevel]),
      loadReadingLevels([selectedLevel]),
      loadListeningLevels([selectedLevel]),
    ])
      .then(([grammar, kanaVocab, reading, listening]) => {
        if (!active) return;
        setBanksByLevel((prev) => ({
          ...prev,
          [selectedLevel]: { grammar, kanaVocab, reading, listening },
        }));
        setLoadingLevel(null);
      })
      .catch((err) => {
        if (active) {
          setLoadingLevel(null);
          setLoadError(
            err instanceof Error
              ? err.message
              : `Gagal memuat bank soal Mogi Shiken JLPT N${selectedLevel}.`
          );
        }
      });
    return () => {
      active = false;
    };
  }, [selectedLevel, banksByLevel]);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      cancelAudioRef.current?.();
      stopSpeech();
    };
  }, []);

  const stopExamAudio = () => {
    cancelAudioRef.current?.();
    cancelAudioRef.current = null;
    stopSpeech();
    setPlayingTrackId(null);
    setActiveCueLabel('');
  };

  // Refs to avoid stale closures on timer auto-submit
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const paperRef = useRef(paper);
  paperRef.current = paper;

  const finalizeExam = (elapsedOverride?: number) => {
    const activePaper = paperRef.current;
    if (!activePaper || completedResult) return;
    stopExamAudio();
    const elapsed =
      elapsedOverride ??
      Math.max(1, activePaper.timeLimitSec - remainingSec);
    const result = gradeMockExamPaper(activePaper, answersRef.current, elapsed);
    setCompletedResult(result);
    setConfirmSubmit(false);
    setConfirmExit(false);
    setReviewFilter('all');
    recordMockExamResult(result);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Live countdown timer while exam is active and not yet submitted
  useEffect(() => {
    if (!paper || completedResult) return;
    const id = window.setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          finalizeExam(paper.timeLimitSec);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper, completedResult]);

  // Compute 5-pillar JLPT Readiness Index across N5–N1
  const readinessByLevel = useMemo(() => {
    const map = {} as Record<
      JlptLevel,
      {
        kanjiVocabPct: number;
        kanjiVocabDone: number;
        kanjiVocabTotal: number;
        kanaPct: number;
        kanaDone: number;
        kanaTotal: number;
        grammarPct: number;
        grammarDone: number;
        grammarTotal: number;
        dokkaiPct: number;
        dokkaiDone: number;
        dokkaiTotal: number;
        choukaiPct: number;
        choukaiDone: number;
        choukaiTotal: number;
        compositePct: number;
        bestMock: MockExamResult | null;
        passedMock: boolean;
      }
    >;

    const history = state.mockExamHistory ?? [];

    for (const lvl of [5, 4, 3, 2, 1] as JlptLevel[]) {
      // Pillar 1: Kanji & Kanji-Vocab in KaniMichi core curriculum tagged with this JLPT level
      const coreItems = dataset.items.filter(
        (it) => (it.type === 'kanji' || it.type === 'vocabulary') && it.jlpt === lvl
      );
      let coreGuru = 0;
      for (const it of coreItems) {
        if ((state.progress[it.id]?.srsStage ?? -1) >= 5) coreGuru += 1;
      }
      const kanjiVocabTotal = coreItems.length;
      const kanjiVocabPct =
        kanjiVocabTotal > 0 ? Math.round((coreGuru / kanjiVocabTotal) * 100) : 0;

      const lvlBank = banksByLevel[lvl];
      const lvlKey = String(lvl);

      // Pillar 2: Non-Kanji Kana Vocab
      const kanaList = lvlBank?.kanaVocab.byJlpt[lvl];
      const kanaTotal =
        kanaList?.length ?? (manifests?.kanaVocab.levels[lvlKey]?.count || 30);
      let kanaDone = 0;
      if (kanaList) {
        for (const it of kanaList) {
          if ((state.kanaVocabProgress?.[it.id]?.srsStage ?? 0) >= 5) kanaDone += 1;
        }
      } else {
        for (const [id, prog] of Object.entries(state.kanaVocabProgress ?? {})) {
          if (getJlptFromItemId(id) === lvl && prog.srsStage >= 5) kanaDone += 1;
        }
      }
      const kanaPct = Math.round((kanaDone / Math.max(1, kanaTotal)) * 100);

      // Pillar 3: Grammar
      const gramList = lvlBank?.grammar.byJlpt[lvl];
      const grammarTotal =
        gramList?.length ?? (manifests?.grammar.levels[lvlKey]?.count || 20);
      let grammarDone = 0;
      if (gramList) {
        for (const pt of gramList) {
          if ((state.grammarProgress?.[pt.id]?.srsStage ?? 0) >= 5) grammarDone += 1;
        }
      } else {
        for (const [id, prog] of Object.entries(state.grammarProgress ?? {})) {
          if (getJlptFromItemId(id) === lvl && prog.srsStage >= 5) grammarDone += 1;
        }
      }
      const grammarPct = Math.round((grammarDone / Math.max(1, grammarTotal)) * 100);

      // Pillar 4: Dokkai Reading
      const readList = lvlBank?.reading.byJlpt[lvl];
      const dokkaiTotal =
        readList?.length ?? (manifests?.reading.levels[lvlKey]?.count || 10);
      let dokkaiDone = 0;
      if (readList) {
        for (const p of readList) {
          const prog = state.readingProgress?.[p.id];
          if (prog && prog.bestScore >= Math.ceil(prog.totalQuestions * 0.6)) {
            dokkaiDone += 1;
          }
        }
      } else {
        for (const [id, prog] of Object.entries(state.readingProgress ?? {})) {
          if (
            getJlptFromItemId(id) === lvl &&
            prog.bestScore >= Math.ceil(prog.totalQuestions * 0.6)
          ) {
            dokkaiDone += 1;
          }
        }
      }
      const dokkaiPct = Math.round((dokkaiDone / Math.max(1, dokkaiTotal)) * 100);

      // Pillar 5: Chōkai Listening
      const listTracks = lvlBank?.listening.byJlpt[lvl];
      const choukaiTotal =
        listTracks?.length ?? (manifests?.listening.levels[lvlKey]?.count || 10);
      let choukaiDone = 0;
      if (listTracks) {
        for (const t of listTracks) {
          if (state.listeningProgress?.[t.id]?.passed) choukaiDone += 1;
        }
      } else {
        for (const [id, prog] of Object.entries(state.listeningProgress ?? {})) {
          if (getJlptFromItemId(id) === lvl && prog.passed) choukaiDone += 1;
        }
      }
      const choukaiPct = Math.round((choukaiDone / Math.max(1, choukaiTotal)) * 100);

      // Weighted composite readiness matching official JLPT score weightings:
      // Kanji/Vocab 25% + Non-Kanji 10% + Grammar 15% + Dokkai 25% + Chōkai 25%
      const compositePct = Math.round(
        kanjiVocabPct * 0.25 +
          kanaPct * 0.1 +
          grammarPct * 0.15 +
          dokkaiPct * 0.25 +
          choukaiPct * 0.25
      );

      const levelMocks = history.filter((h) => h.jlpt === lvl);
      const bestMock =
        levelMocks.length > 0
          ? levelMocks.reduce((best, cur) =>
              cur.totalScore > best.totalScore ? cur : best
            )
          : null;
      const passedMock = levelMocks.some((h) => h.passed);

      map[lvl] = {
        kanjiVocabPct,
        kanjiVocabDone: coreGuru,
        kanjiVocabTotal,
        kanaPct,
        kanaDone,
        kanaTotal,
        grammarPct,
        grammarDone,
        grammarTotal,
        dokkaiPct,
        dokkaiDone,
        dokkaiTotal,
        choukaiPct,
        choukaiDone,
        choukaiTotal,
        compositePct,
        bestMock,
        passedMock,
      };
    }

    return map;
  }, [
    dataset.items,
    state.progress,
    state.kanaVocabProgress,
    state.grammarProgress,
    state.readingProgress,
    state.listeningProgress,
    state.mockExamHistory,
    banksByLevel,
    manifests,
  ]);

  const startMockExam = (lvl: JlptLevel, modeOverride?: MockExamLength) => {
    const levelBanks = banksByLevel[lvl];
    if (!levelBanks) return;
    stopExamAudio();
    const chosenMode = modeOverride ?? examLength;
    const recent = recentIdsRef.current;

    const generated = generateMockExamPaper(
      lvl,
      {
        curriculum: dataset,
        grammar: levelBanks.grammar,
        kanaVocab: levelBanks.kanaVocab,
        reading: levelBanks.reading,
        listening: levelBanks.listening,
      },
      {
        lengthMode: chosenMode,
        excludeIds: recent,
      }
    );

    // Record drawn IDs so subsequent runs draw fresh passages, audio, and grammar first
    for (const q of generated.mojiGoiQuestions) {
      if (!q.sourceId) continue;
      if (q.id.startsWith('mg-kana-')) recent.kana.add(q.sourceId);
      else recent.vocab.add(q.sourceId);
    }
    for (const q of generated.bunpouQuestions) {
      if (q.sourceId) recent.grammar.add(q.sourceId);
    }
    for (const p of generated.dokkaiPassages) recent.passages.add(p.id);
    for (const t of generated.choukaiTracks) recent.tracks.add(t.id);

    // Prevent sets from growing endlessly once a full cycle is exhausted
    if (recent.passages.size >= (manifests?.reading.totalCount || 100)) {
      recent.passages.clear();
    }
    if (recent.tracks.size >= (manifests?.listening.totalCount || 100)) {
      recent.tracks.clear();
    }
    if (recent.grammar.size >= (manifests?.grammar.totalCount || 200)) {
      recent.grammar.clear();
    }
    if (recent.kana.size >= (manifests?.kanaVocab.totalCount || 250)) {
      recent.kana.clear();
    }

    setPaper(generated);
    setActivePart('moji-goi');
    setAnswers({});
    setFlagged({});
    setRemainingSec(generated.timeLimitSec);
    setTrackPlayCounts({});
    setCompletedResult(null);
    setConfirmExit(false);
    setConfirmSubmit(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exitMockExam = () => {
    stopExamAudio();
    setPaper(null);
    setCompletedResult(null);
    setConfirmExit(false);
    setConfirmSubmit(false);
  };

  const handlePlayExamTrack = (track: ListeningTrack) => {
    if (playingTrackId === track.id) {
      stopExamAudio();
      return;
    }
    stopExamAudio();

    const cues: DialogueCue[] = [
      { id: 'intro', role: 'narrator', text: track.introJp, pauseAfterMs: 500 },
      ...track.lines.map((line, i) => ({
        id: `line-${i}`,
        role: line.role,
        text: line.jp,
        pauseAfterMs: i === track.lines.length - 1 ? 600 : 360,
      })),
    ];

    if (track.taskType === 'sokuji') {
      track.choices.forEach((choice, idx) => {
        const spokenNum = idx === 0 ? 'いち。' : idx === 1 ? 'に。' : 'さん。';
        cues.push({
          id: `choice-${idx}`,
          role: track.lines[0]?.role === 'female' ? 'male' : 'female',
          text: `${spokenNum}${choice}`,
          pauseAfterMs: 500,
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

    setPlayingTrackId(track.id);
    setTrackPlayCounts((prev) => ({
      ...prev,
      [track.id]: (prev[track.id] ?? 0) + 1,
    }));

    cancelAudioRef.current = playDialogueSequence(cues, {
      rate: 0.94,
      onCueStart: (cueId) => {
        if (cueId === 'intro') setActiveCueLabel('Pengantar Narator...');
        else if (cueId === 'question') setActiveCueLabel('Pertanyaan Ujian...');
        else if (cueId.startsWith('choice-'))
          setActiveCueLabel(
            `Pilihan ${Number(cueId.replace('choice-', '')) + 1}...`
          );
        else if (cueId.startsWith('line-')) {
          const idx = Number(cueId.replace('line-', ''));
          setActiveCueLabel(
            `${track.lines[idx]?.speaker ?? 'Pembicara'} (${idx + 1}/${track.lines.length})...`
          );
        }
      },
      onComplete: () => {
        cancelAudioRef.current = null;
        setPlayingTrackId(null);
        setActiveCueLabel('');
      },
      onError: () => {
        cancelAudioRef.current = null;
        setPlayingTrackId(null);
        setActiveCueLabel('');
      },
    });
  };

  if (loadError) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-rose-200 dark:border-rose-900 p-6 space-y-3">
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Gagal Memuat Simulasi Mogi Shiken
          </h1>
          <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!manifests) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
          <div className="font-display text-base font-bold text-slate-900 dark:text-white">
            Menyiapkan Bank Soal Mogi Shiken JLPT N5–N1...
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Menghubungkan modul Kanji, Kana JLPT, Grammar, Dokkai, dan Chōkai.
          </p>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 1: OFFICIAL JLPT SCORE CERTIFICATE & ANSWER REVIEW
  // =========================================================================
  if (paper && completedResult) {
    const lvlMeta =
      JLPT_LEVELS.find((l) => l.level === completedResult.jlpt) ?? JLPT_LEVELS[0];

    const reviewQuestions = paper.allQuestions.filter((q) => {
      if (reviewFilter === 'wrong') return answers[q.id] !== q.answerIndex;
      if (reviewFilter === 'all') return true;
      return q.part === reviewFilter;
    });

    // Identify weakest part for direct training CTA
    const sortedParts = [...completedResult.parts].sort(
      (a, b) => a.correct / Math.max(1, a.total) - b.correct / Math.max(1, b.total)
    );
    const weakest = sortedParts[0];

    const jumpToWeakest = () => {
      if (!weakest) return;
      if (weakest.part === 'moji-goi') setActiveView('kana-vocab');
      else if (weakest.part === 'bunpou') setActiveView('grammar');
      else if (weakest.part === 'dokkai') setActiveView('reading');
      else setActiveView('listening');
    };

    return (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Top Return Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={exitMockExam}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Pusat Mogi Shiken
          </button>

          <button
            type="button"
            onClick={() =>
              startMockExam(completedResult.jlpt, completedResult.lengthMode ?? examLength)
            }
            className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs sm:text-sm font-semibold cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Ujian Baru {lvlMeta.code} (Soal Baru Acak)
          </button>
        </div>

        {/* Official-Style JLPT Score Certificate */}
        <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div
            className={`px-6 py-6 text-white ${
              completedResult.passed
                ? 'bg-emerald-600 dark:bg-emerald-700'
                : 'bg-rose-600 dark:bg-rose-700'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/85">
                  Hasil Simulasi Resmi · Mogi Shiken JLPT {lvlMeta.code} ·{' '}
                  {completedResult.lengthMode === 'full'
                    ? 'Simulasi Penuh'
                    : 'Simulasi Ringkas'}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold flex items-center gap-2.5">
                  <Award className="w-7 h-7 shrink-0" />
                  <span>
                    {completedResult.passed
                      ? `合格 · LULUS JLPT ${lvlMeta.code}`
                      : `不合格 · BELUM LULUS JLPT ${lvlMeta.code}`}
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-white/90">
                  {completedResult.passed
                    ? 'Skor total dan seluruh nilai minimum per bagian memenuhi standar kelulusan resmi JLPT.'
                    : completedResult.failedByCutoff
                    ? 'Skor total sudah mencapai ambang lulus, tetapi ada bagian yang di bawah nilai minimum (Ashikiri / 足切り).'
                    : `Skor total perlu minimal ${completedResult.passThreshold}/180 dan setiap bagian wajib memenuhi ambang batas minimum.`}
                </p>
              </div>

              <div className="bg-white/15 rounded-xl px-5 py-3 text-center shrink-0">
                <div className="text-[11px] uppercase tracking-wider text-white/85 font-semibold">
                  Total Skor Skala
                </div>
                <div className="font-mono-num text-3xl sm:text-4xl font-extrabold">
                  {completedResult.totalScore}
                  <span className="text-base font-semibold text-white/80">/180</span>
                </div>
                <div className="text-[11px] font-mono-num text-white/85">
                  Target ≥ {completedResult.passThreshold} · Waktu{' '}
                  {formatClock(completedResult.elapsedSec)}
                </div>
              </div>
            </div>
          </div>

          {/* Official Sectional Score Bars */}
          <div className="p-5 sm:p-6 space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Skor Resmi per Bagian (Aturan Ambang Batas JLPT)
                </h2>
                <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                  Akurasi: {completedResult.totalCorrect}/{completedResult.totalQuestions} soal (
                  {Math.round(
                    (completedResult.totalCorrect /
                      Math.max(1, completedResult.totalQuestions)) *
                      100
                  )}
                  %)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {completedResult.sections.map((sec) => {
                  const pct = Math.round((sec.score / sec.maxScore) * 100);
                  const cutoffPct = Math.round((sec.minPass / sec.maxScore) * 100);
                  return (
                    <div
                      key={sec.id}
                      className={`p-4 rounded-xl border ${
                        sec.passed
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40'
                          : 'border-rose-300 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-jp text-xs font-bold text-slate-900 dark:text-white">
                            {sec.jpLabel}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {sec.label}
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded shrink-0 ${
                            sec.passed
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {sec.passed ? 'AMAN' : 'ASHIKIRI'}
                        </span>
                      </div>

                      <div className="font-mono-num text-2xl font-extrabold text-slate-900 dark:text-white mt-2">
                        {sec.score}
                        <span className="text-xs font-normal text-slate-500">
                          /{sec.maxScore}
                        </span>
                      </div>

                      {/* Score bar with cutoff tick */}
                      <div className="relative h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-visible mt-2">
                        <div
                          className={`h-full rounded-full ${
                            sec.passed ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                        <span
                          title={`Batas minimum: ${sec.minPass}/${sec.maxScore}`}
                          className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-slate-900 dark:bg-white"
                          style={{ left: `${cutoffPct}%` }}
                        />
                      </div>

                      <div className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400 mt-1.5">
                        Minimum lulus bagian: ≥ {sec.minPass}/{sec.maxScore}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4-Part Granular Breakdown + Weakest Spot Action */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1">
                {completedResult.parts.map((pt) => {
                  const pPct =
                    pt.total > 0 ? Math.round((pt.correct / pt.total) * 100) : 0;
                  return (
                    <div
                      key={pt.part}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22]"
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {pt.label}
                      </div>
                      <div className="font-mono-num text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        {pt.correct}/{pt.total}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          ({pPct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {weakest && weakest.correct < weakest.total && (
                <button
                  type="button"
                  onClick={jumpToWeakest}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Perkuat {weakest.label.split(' ')[0]}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Detailed Answer Review */}
        <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Pembahasan Lengkap ({reviewQuestions.length} Soal)
            </h2>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'wrong', label: 'Salah Saja' },
                  { id: 'moji-goi', label: 'Moji·Goi' },
                  { id: 'bunpou', label: 'Bunpō' },
                  { id: 'dokkai', label: 'Dokkai' },
                  { id: 'choukai', label: 'Chōkai' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setReviewFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border cursor-pointer ${
                    reviewFilter === f.id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-[#161A22] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {reviewQuestions.length === 0 ? (
            <div className="py-8 text-center text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
              Tidak ada soal salah di kategori ini!
            </div>
          ) : (
            <div className="space-y-4">
              {reviewQuestions.map((q, idx) => {
                const picked = answers[q.id];
                const isRight = picked === q.answerIndex;
                const parentTrack = q.trackId
                  ? paper.choukaiTracks.find((t) => t.id === q.trackId)
                  : undefined;

                return (
                  <div
                    key={q.id}
                    className={`p-4 rounded-xl border space-y-3 ${
                      isRight
                        ? 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/30 dark:bg-emerald-950/15'
                        : 'border-rose-200 dark:border-rose-900/70 bg-rose-50/30 dark:bg-rose-950/15'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono-num">
                        #{idx + 1} · {q.sublabel}
                      </span>
                      <span
                        className={`text-xs font-bold inline-flex items-center gap-1 ${
                          isRight
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {isRight ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Benar
                          </>
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5" />{' '}
                            {picked === undefined ? 'Tidak Dijawab' : 'Salah'}
                          </>
                        )}
                      </span>
                    </div>

                    <div className="font-jp text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-relaxed">
                      <RubyText text={q.promptJp} showFurigana={true} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {q.choices.map((ch, cIdx) => {
                        const isAns = cIdx === q.answerIndex;
                        const isUserPick = picked === cIdx;
                        return (
                          <div
                            key={cIdx}
                            className={`px-3 py-2 rounded-lg border font-jp ${
                              isAns
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-semibold'
                                : isUserPick
                                ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200'
                                : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {cIdx + 1}. <RubyText text={ch} showFurigana={true} />
                            {isAns && ' ✓'}
                            {isUserPick && !isAns && ' (Jawabanmu)'}
                          </div>
                        );
                      })}
                    </div>

                    <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2 leading-relaxed">
                      <div>
                        <span className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wide block mb-0.5">
                          Pembahasan Soal
                        </span>
                        {q.explanationEn}
                      </div>
                      <AiExplainButton
                        language="ja"
                        examContext={`Simulasi JLPT N${paper.jlpt} · ${q.sublabel}`}
                        content={`Soal: ${q.promptJp}\nJawaban benar: ${q.choices[q.answerIndex]}\nPembahasan: ${q.explanationEn}`}
                        label="Minta Penjelasan Bahasa Indonesia (AI)"
                        compact
                      />
                    </div>

                    {/* Unlocked audio script for Chōkai questions */}
                    {parentTrack && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[#0284C7] uppercase">
                            Transkrip Audio Chōkai
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePlayExamTrack(parentTrack)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            {playingTrackId === parentTrack.id
                              ? 'Hentikan'
                              : 'Putar Ulang Audio'}
                          </button>
                        </div>
                        <div className="space-y-1.5 text-xs">
                          {parentTrack.lines.map((ln, lIdx) => (
                            <div key={lIdx} className="space-y-0.5">
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {ln.speaker}:{' '}
                              </span>
                              <span className="font-jp text-slate-900 dark:text-slate-100">
                                <RubyText text={ln.jp} showFurigana={true} />
                              </span>
                              <div className="text-slate-500 dark:text-slate-400 pl-2">
                                {ln.en}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    );
  }

  // =========================================================================
  // VIEW 2: LIVE TIMED MOCK EXAM RUNNER
  // =========================================================================
  if (paper) {
    const lvlMeta =
      JLPT_LEVELS.find((l) => l.level === paper.jlpt) ?? JLPT_LEVELS[0];
    const examFurigana = paper.jlpt >= 4; // Authentic: N5–N4 show furigana, N3–N1 exam mode hides furigana
    const answeredCount = Object.keys(answers).length;
    const totalCount = paper.allQuestions.length;
    const unansweredCount = totalCount - answeredCount;
    const isLowTime = remainingSec <= 300;
    const isCriticalTime = remainingSec <= 120;

    const getPartQuestions = (partId: MockExamPartId): MockExamChoiceQuestion[] => {
      if (partId === 'moji-goi') return paper.mojiGoiQuestions;
      if (partId === 'bunpou') return paper.bunpouQuestions;
      if (partId === 'dokkai') return paper.dokkaiQuestions;
      return paper.choukaiQuestions;
    };

    const partOrder: MockExamPartId[] = ['moji-goi', 'bunpou', 'dokkai', 'choukai'];
    const currentPartIdx = partOrder.indexOf(activePart);

    const renderQuestionCard = (q: MockExamChoiceQuestion, displayNum: number) => {
      const picked = answers[q.id];
      const isFlagged = Boolean(flagged[q.id]);

      return (
        <div
          key={q.id}
          className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#0284C7] font-mono-num">
              SOAL {displayNum} · {q.sublabel}
            </span>
            <button
              type="button"
              onClick={() =>
                setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
              }
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                isFlagged
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Flag className="w-3 h-3" />
              {isFlagged ? 'Ditandai' : 'Tandai'}
            </button>
          </div>

          <div className="space-y-1">
            <h3 className="font-jp text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-relaxed break-words">
              <RubyText text={q.promptJp} showFurigana={examFurigana} />
            </h3>
            {q.promptSub && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {q.promptSub}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {q.choices.map((ch, cIdx) => {
              const selected = picked === cIdx;
              return (
                <button
                  key={cIdx}
                  type="button"
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [q.id]: cIdx }))
                  }
                  className={`min-h-[48px] px-3.5 py-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-colors cursor-pointer ${
                    selected
                      ? 'border-[#0284C7] bg-sky-50/75 dark:bg-sky-950/35 text-slate-900 dark:text-white ring-1 ring-[#0284C7]/30'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span className="font-mono-num text-xs font-bold text-slate-400 mt-0.5 shrink-0">
                    {cIdx + 1}.
                  </span>
                  <span className="font-jp text-sm leading-relaxed break-words">
                    <RubyText text={ch} showFurigana={examFurigana} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <main className="w-full max-w-full overflow-x-clip">
        {/* Sticky Exam Header Bar */}
        <div className="sticky top-14 sm:top-16 z-20 bg-white/95 dark:bg-[#161A22]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setConfirmExit(true)}
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-rose-600 cursor-pointer py-1"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
              <span
                className="font-mono-num text-xs font-extrabold px-2 py-0.5 rounded text-white"
                style={{ backgroundColor: lvlMeta.accent }}
              >
                MOGI {lvlMeta.code}
              </span>
              <span className="text-xs font-mono-num text-slate-600 dark:text-slate-300">
                {answeredCount}/{totalCount} dijawab
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono-num text-xs sm:text-sm font-bold border ${
                  isCriticalTime
                    ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300'
                    : isLowTime
                    ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {formatClock(remainingSec)}
              </span>

              <button
                type="button"
                onClick={() => {
                  if (unansweredCount > 0) setConfirmSubmit(true);
                  else finalizeExam();
                }}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
              >
                Kumpulkan Ujian
              </button>
            </div>
          </div>

          {/* 4-Part Stepper */}
          <div className="max-w-6xl mx-auto px-3 sm:px-6 pb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {PART_TABS.map((tab) => {
              const qs = getPartQuestions(tab.id);
              const doneInPart = qs.filter((q) => answers[q.id] !== undefined).length;
              const isActive = activePart === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    stopExamAudio();
                    setActivePart(tab.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-[#161A22] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>{tab.shortLabel}</span>
                  <span className="font-mono-num opacity-80">
                    ({doneInPart}/{qs.length})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Inline Confirm Exit Banner */}
        {confirmExit && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4">
            <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs sm:text-sm text-rose-900 dark:text-rose-200 font-medium">
                Keluar sekarang akan membatalkan sesi ujian ini tanpa menyimpan skor.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmExit(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold cursor-pointer"
                >
                  Lanjut Ujian
                </button>
                <button
                  type="button"
                  onClick={exitMockExam}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Ya, Batalkan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inline Confirm Submit Banner (when unanswered questions remain) */}
        {confirmSubmit && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4">
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Masih ada <strong>{unansweredCount} soal</strong> belum dijawab. Yakin ingin mengumpulkan sekarang?
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmSubmit(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold cursor-pointer"
                >
                  Periksa Lagi
                </button>
                <button
                  type="button"
                  onClick={() => finalizeExam()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Kumpulkan Sekarang
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Exam Part Body */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          {activePart === 'moji-goi' && (
            <>
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Bagian 1: Kanji &amp; Kosakata (文字・語彙)
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Pilih bacaan kanji, arti kosakata, dan kata non-kanji yang paling tepat.
                </p>
              </div>
              <div className="space-y-4">
                {paper.mojiGoiQuestions.map((q, i) => renderQuestionCard(q, i + 1))}
              </div>
            </>
          )}

          {activePart === 'bunpou' && (
            <>
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Bagian 2: Tata Bahasa (文法)
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Lengkapi bagian kosong dengan pola tata bahasa {lvlMeta.code} yang tepat.
                </p>
              </div>
              <div className="space-y-4">
                {paper.bunpouQuestions.map((q, i) => renderQuestionCard(q, i + 1))}
              </div>
            </>
          )}

          {activePart === 'dokkai' && (
            <>
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Bagian 3: Membaca (読解 · {paper.dokkaiPassages.length} Wacana)
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Bacalah setiap wacana dengan cermat lalu jawab pertanyaan di bawahnya.
                  {!examFurigana && ' (Mode ujian N3–N1: furigana disembunyikan.)'}
                </p>
              </div>

              <div className="space-y-8">
                {paper.dokkaiPassages.map((passage, pIdx) => {
                  const pQuestions = paper.dokkaiQuestions.filter(
                    (q) => q.passageId === passage.id
                  );
                  return (
                    <div key={passage.id} className="space-y-4">
                      <article className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                          <div className="text-xs font-bold text-[#D97706] font-mono-num">
                            WACANA {pIdx + 1} · {lvlMeta.code}
                          </div>
                          <h2 className="font-jp text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                            <RubyText
                              text={passage.titleJp}
                              showFurigana={examFurigana}
                            />
                          </h2>
                        </div>

                        <div className="space-y-3 font-jp text-base sm:text-lg leading-[2] text-slate-900 dark:text-slate-100">
                          {passage.paragraphsB && (
                            <div className="text-xs font-bold uppercase tracking-wide text-[#0284C7] font-sans">
                              {passage.labelA || 'Text A'}
                            </div>
                          )}
                          {passage.paragraphs.map((para, idx) => (
                            <p key={idx} className="break-words">
                              <RubyText text={para} showFurigana={examFurigana} />
                            </p>
                          ))}
                        </div>

                        {passage.paragraphsB && (
                          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 font-jp text-base sm:text-lg leading-[2] text-slate-900 dark:text-slate-100">
                            <div className="text-xs font-bold uppercase tracking-wide text-[#7C3AED] font-sans">
                              {passage.labelB || 'Text B'}
                            </div>
                            {passage.paragraphsB.map((para, idx) => (
                              <p key={idx} className="break-words">
                                <RubyText text={para} showFurigana={examFurigana} />
                              </p>
                            ))}
                          </div>
                        )}
                      </article>

                      <div className="space-y-3">
                        {pQuestions.map((q, qIdx) =>
                          renderQuestionCard(q, qIdx + 1)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activePart === 'choukai' && (
            <>
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Bagian 4: Mendengarkan (聴解 · {paper.choukaiTracks.length} Audio)
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Putar setiap audio dialog lalu pilih jawaban yang tepat. Transkrip baru terbuka setelah ujian dikumpulkan.
                </p>
              </div>

              <div className="space-y-5">
                {paper.choukaiTracks.map((track, tIdx) => {
                  const q = paper.choukaiQuestions[tIdx];
                  const isTrackPlaying = playingTrackId === track.id;
                  const plays = trackPlayCounts[track.id] ?? 0;

                  return (
                    <div
                      key={track.id}
                      className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="text-xs font-bold text-[#E11D48] font-mono-num">
                            AUDIO {tIdx + 1} · {track.taskType.toUpperCase()}
                            {plays > 0 && ` · Diputar ${plays}x`}
                          </div>
                          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                            {track.situationEn}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePlayExamTrack(track)}
                          className={`min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                            isTrackPlaying
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : 'bg-[#0284C7] hover:bg-[#0369A1] text-white'
                          }`}
                        >
                          {isTrackPlaying ? (
                            <>
                              <Square className="w-3.5 h-3.5 fill-current" />
                              Hentikan ({activeCueLabel || 'Memutar'})
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              {plays === 0 ? 'Putar Audio Ujian' : 'Putar Ulang'}
                            </>
                          )}
                        </button>
                      </div>

                      <div className="space-y-3">
                        <h3 className="font-jp text-base font-bold text-slate-900 dark:text-white">
                          <RubyText text={q.promptJp} showFurigana={examFurigana} />
                        </h3>

                        <div className="space-y-2">
                          {q.choices.map((ch, cIdx) => {
                            const selected = answers[q.id] === cIdx;
                            return (
                              <div
                                key={cIdx}
                                role="button"
                                tabIndex={0}
                                onClick={() =>
                                  setAnswers((prev) => ({ ...prev, [q.id]: cIdx }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setAnswers((prev) => ({
                                      ...prev,
                                      [q.id]: cIdx,
                                    }));
                                  }
                                }}
                                className={`min-h-[48px] px-3.5 py-2.5 rounded-lg border text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                                  selected
                                    ? 'border-[#0284C7] bg-sky-50/75 dark:bg-sky-950/35 text-slate-900 dark:text-white ring-1 ring-[#0284C7]/30'
                                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <span className="font-mono-num text-xs font-bold text-slate-400 mt-0.5 shrink-0">
                                    {cIdx + 1}.
                                  </span>
                                  <span className="font-jp text-sm leading-relaxed break-words">
                                    <RubyText
                                      text={ch}
                                      showFurigana={examFurigana}
                                    />
                                  </span>
                                </div>
                                {track.taskType === 'sokuji' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      stopExamAudio();
                                      speakJapanese(ch, 0.94, 'female');
                                    }}
                                    aria-label={`Putar pilihan ${cIdx + 1}`}
                                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-[#0284C7] shrink-0 cursor-pointer"
                                  >
                                    <Volume2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Bottom Part Navigation */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={currentPartIdx === 0}
              onClick={() => {
                stopExamAudio();
                setActivePart(partOrder[Math.max(0, currentPartIdx - 1)]);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Bagian Sebelumnya
            </button>

            {currentPartIdx < partOrder.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  stopExamAudio();
                  setActivePart(partOrder[currentPartIdx + 1]);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold cursor-pointer"
              >
                Bagian Berikutnya
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (unansweredCount > 0) setConfirmSubmit(true);
                  else finalizeExam();
                }}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Selesai &amp; Nilai Ujian
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 3: OVERVIEW — JLPT READINESS INDEX + MOCK EXAM LAUNCHER + HISTORY
  // =========================================================================
  const activeLvlMeta =
    JLPT_LEVELS.find((l) => l.level === selectedLevel) ?? JLPT_LEVELS[0];
  const activeRule = JLPT_OFFICIAL_RULES[selectedLevel];
  const activeReadiness = readinessByLevel[selectedLevel];
  const recentHistory = (state.mockExamHistory ?? []).slice(0, 8);

  const pillars = [
    {
      label: 'Kanji & Kosakata Kanji (Guru+)',
      done: activeReadiness.kanjiVocabDone,
      total: activeReadiness.kanjiVocabTotal,
      pct: activeReadiness.kanjiVocabPct,
      color: '#DB2777',
      action: () => setActiveView('kanji'),
      cta: 'Latih Kanji',
    },
    {
      label: 'Kosakata Non-Kanji Kana/Katakana (Guru+)',
      done: activeReadiness.kanaDone,
      total: activeReadiness.kanaTotal,
      pct: activeReadiness.kanaPct,
      color: '#0D9488',
      action: () => setActiveView('kana-vocab'),
      cta: 'Latih Kana',
    },
    {
      label: 'Tata Bahasa / Bunpō SRS (Guru+)',
      done: activeReadiness.grammarDone,
      total: activeReadiness.grammarTotal,
      pct: activeReadiness.grammarPct,
      color: '#7C3AED',
      action: () => setActiveView('grammar'),
      cta: 'Latih Grammar',
    },
    {
      label: 'Membaca / Dokkai (Wacana Lulus)',
      done: activeReadiness.dokkaiDone,
      total: activeReadiness.dokkaiTotal,
      pct: activeReadiness.dokkaiPct,
      color: '#D97706',
      action: () => setActiveView('reading'),
      cta: 'Latih Dokkai',
    },
    {
      label: 'Mendengarkan / Chōkai (Audio Lulus)',
      done: activeReadiness.choukaiDone,
      total: activeReadiness.choukaiTotal,
      pct: activeReadiness.choukaiPct,
      color: '#E11D48',
      action: () => setActiveView('listening'),
      cta: 'Latih Chōkai',
    },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* 5-Tab JLPT Module Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-0.5 max-w-full overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveView('grammar')}
            className="px-3 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            1. Grammar
          </button>
          <button
            type="button"
            onClick={() => setActiveView('kana-vocab')}
            className="px-3 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            2. Kana JLPT
          </button>
          <button
            type="button"
            onClick={() => setActiveView('reading')}
            className="px-3 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            3. Dokkai
          </button>
          <button
            type="button"
            onClick={() => setActiveView('listening')}
            className="px-3 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            4. Chōkai
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md text-xs sm:text-sm font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 whitespace-nowrap cursor-pointer"
          >
            5. Mogi Shiken
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
          {(state.mockExamHistory ?? []).length} Simulasi Selesai ·{' '}
          {([5, 4, 3, 2, 1] as JlptLevel[]).filter(
            (l) => readinessByLevel[l].passedMock
          ).length}
          /5 Level Lulus (合格)
        </div>
      </div>

      {/* Header */}
      <div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
          Tahap 5 · Simulasi Ujian &amp; Kesiapan Kelulusan JLPT
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
          Mogi Shiken JLPT N5–N1 (Skor Resmi 0–180)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
          Uji kesiapanmu dengan simulasi 4 bagian berwaktu (Moji·Goi, Bunpō, Dokkai, Chōkai) memakai sistem penilaian skala resmi JLPT 0–180 beserta aturan nilai minimum per bagian (<em>Ashikiri</em>).
        </p>
      </div>

      {/* N5 - N1 Selector Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
        {JLPT_LEVELS.map((lvl) => {
          const rd = readinessByLevel[lvl.level];
          const rule = JLPT_OFFICIAL_RULES[lvl.level];
          const isSelected = selectedLevel === lvl.level;

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
              <div className="flex items-center justify-between gap-1">
                <span
                  className="font-display text-base sm:text-lg font-extrabold"
                  style={{ color: lvl.accent }}
                >
                  {lvl.code}
                </span>
                {rd.passedMock ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    合格
                  </span>
                ) : (
                  <span className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
                    ≥{rule.passTotal}
                  </span>
                )}
              </div>

              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2.5">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${rd.compositePct}%`,
                    backgroundColor: lvl.accent,
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-mono-num">
                <span>Siap {rd.compositePct}%</span>
                {rd.bestMock && (
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {rd.bestMock.totalScore}/180
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Main 2-Col Split: Exam Launch Card + 5-Pillar Readiness Diagnostic */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT (5 cols): Launch Exam Card */}
        <section className="lg:col-span-5 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div
            className="p-5 sm:p-6 text-white space-y-2"
            style={{ backgroundColor: activeLvlMeta.accent }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-white/85">
              {MOCK_EXAM_MODE_CONFIG[examLength].label} · {activeLvlMeta.label}
            </div>
            <h2 className="font-display text-2xl font-extrabold">
              Mogi Shiken JLPT {activeLvlMeta.code}
            </h2>
            <p className="text-xs sm:text-sm text-white/90">
              Bank soal {manifests.reading.totalCount} wacana Dokkai, {manifests.listening.totalCount} audio Chōkai, {manifests.grammar.totalCount} Grammar, {manifests.kanaVocab.totalCount} Kana JLPT &amp; ribuan Kanji/Kosakata — diacak otomatis anti-ulang setiap kali mulai.
            </p>
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            {/* Mode Toggle: Standard vs Full-Length */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Pilih Panjang Simulasi:
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['standard', 'full'] as MockExamLength[]).map((mode) => {
                  const cfg = MOCK_EXAM_MODE_CONFIG[mode];
                  const mins =
                    mode === 'full'
                      ? activeRule.fullTimeLimitMin
                      : activeRule.timeLimitMin;
                  const active = examLength === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setExamLength(mode)}
                      className={`min-h-[48px] px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
                        active
                          ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
                      }`}
                    >
                      <div className="text-xs font-bold">
                        {mode === 'full' ? 'Penuh (Full)' : 'Ringkas'}
                      </div>
                      <div
                        className={`text-[11px] font-mono-num mt-0.5 ${
                          active
                            ? 'text-white/80 dark:text-slate-600'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {cfg.approxQuestionsLabel} · {mins} mnt
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">Durasi Ujian</div>
                <div className="font-mono-num text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {examLength === 'full'
                    ? activeRule.fullTimeLimitMin
                    : activeRule.timeLimitMin}{' '}
                  Menit
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">Syarat Lulus</div>
                <div className="font-mono-num text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  ≥ {activeRule.passTotal} / 180
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="font-semibold text-slate-900 dark:text-white">
                Struktur Soal &amp; Ambang Minimum Resmi:
              </div>
              {(() => {
                const cfg = MOCK_EXAM_MODE_CONFIG[examLength];
                const mojiTotal = cfg.readingVocab + cfg.meaningVocab + cfg.kana;
                return (
                  <ul className="space-y-1 list-disc list-inside text-slate-600 dark:text-slate-400">
                    <li>Bagian 1: Kanji &amp; Kosakata ({mojiTotal} soal)</li>
                    <li>Bagian 2: Tata Bahasa / Bunpō ({cfg.grammar} soal)</li>
                    <li>
                      Bagian 3: Membaca / Dokkai ({cfg.dokkaiPassages} wacana ·{' '}
                      {examLength === 'full' ? '8–10' : '4–5'} soal)
                    </li>
                    <li>
                      Bagian 4: Mendengarkan / Chōkai ({cfg.choukaiTracks} audio ·{' '}
                      {cfg.choukaiTracks} soal)
                    </li>
                  </ul>
                );
              })()}
              <div className="pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {activeRule.combinedLangReading
                  ? `Batas minimum ${activeRule.code}: Pengetahuan Bahasa + Membaca ≥ 38/120 dan Mendengarkan ≥ 19/60.`
                  : `Batas minimum ${activeRule.code}: Pengetahuan Bahasa ≥ 19/60, Membaca ≥ 19/60, dan Mendengarkan ≥ 19/60.`}
              </div>
            </div>

            <button
              type="button"
              disabled={!banksByLevel[selectedLevel] || loadingLevel === selectedLevel}
              onClick={() => startMockExam(selectedLevel, examLength)}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white text-sm sm:text-base font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer disabled:cursor-wait"
              style={{ backgroundColor: activeLvlMeta.accent }}
            >
              <Play className="w-4 h-4 fill-current" />
              {!banksByLevel[selectedLevel] || loadingLevel === selectedLevel
                ? `Menyiapkan Paket Soal ${activeLvlMeta.code}...`
                : `Mulai Mogi Shiken ${activeLvlMeta.code} (${
                    examLength === 'full' ? 'Penuh' : 'Ringkas'
                  })`}
            </button>
          </div>
        </section>

        {/* RIGHT (7 cols): 5-Pillar Readiness Diagnostic */}
        <section className="lg:col-span-7 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Indeks Kesiapan JLPT {activeLvlMeta.code} (5 Pilar)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Dihitung otomatis dari progres SRS Guru+ dan modul Dokkai/Chōkai yang sudah kamu selesaikan.
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono-num text-3xl font-extrabold text-slate-900 dark:text-white">
                {activeReadiness.compositePct}%
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {activeReadiness.compositePct >= 80
                  ? 'Sangat Siap Ujian'
                  : activeReadiness.compositePct >= 50
                  ? 'Progres Bagus'
                  : 'Perlu Latihan Rutin'}
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            {pillars.map((p) => (
              <div key={p.label} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {p.label}
                  </span>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-mono-num text-slate-500 dark:text-slate-400">
                      {p.done}/{p.total} ({p.pct}%)
                    </span>
                    <button
                      type="button"
                      onClick={p.action}
                      className="text-[11px] font-semibold text-[#0284C7] hover:underline cursor-pointer"
                    >
                      {p.cta} →
                    </button>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${p.pct}%`, backgroundColor: p.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Mock Exam History */}
      <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Riwayat Skor Mogi Shiken
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            Tersimpan otomatis ke akunmu
          </span>
        </div>

        {recentHistory.length === 0 ? (
          <div className="py-8 text-center space-y-1">
            <Headphones className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada riwayat simulasi ujian. Mulai Mogi Shiken pertamamu di atas!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentHistory.map((h) => {
              const lvl = JLPT_LEVELS.find((l) => l.level === h.jlpt);
              const dateLabel = new Date(h.completedAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });
              return (
                <div
                  key={h.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="font-mono-num text-xs font-extrabold px-2 py-0.5 rounded text-white shrink-0"
                      style={{ backgroundColor: lvl?.accent ?? '#0284C7' }}
                    >
                      N{h.jlpt}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white font-mono-num">
                        {h.totalScore} / 180{' '}
                        <span
                          className={`text-xs font-sans font-semibold ml-1 ${
                            h.passed
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {h.passed
                            ? '合格 LULUS'
                            : h.failedByCutoff
                            ? '不合格 (Ashikiri)'
                            : '不合格 BELUM LULUS'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                        {dateLabel} ·{' '}
                        {h.lengthMode === 'full' ? 'Penuh' : 'Ringkas'} ·{' '}
                        {h.totalCorrect}/{h.totalQuestions} benar ·{' '}
                        {formatClock(h.elapsedSec)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-num">
                    {h.sections.map((s) => (
                      <span
                        key={s.id}
                        className={`px-2 py-0.5 rounded border ${
                          s.passed
                            ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            : 'border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-bold'
                        }`}
                      >
                        {s.jpLabel.slice(0, 4)}: {s.score}/{s.maxScore}
                      </span>
                    ))}
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
