import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  Flag,
  Play,
  RotateCcw,
  Square,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  getLangGrammarLoader,
  getLangListeningLoader,
  getLangReadingLoader,
  getLangVocabLoader,
} from '../data/langPackLoader';
import {
  convertIeltsScore,
  convertToaflScore,
  convertToeflIbtScore,
  convertToeflItpScore,
  convertToeicScore,
  getExamTrackDefinition,
} from '../data/languageRegistry';
import type {
  ExamTrackId,
  LangGrammarItem,
  LangListeningTrack,
  LangReadingPassage,
  LangVocabItem,
  MultiExamResult,
  MultiExamSectionResult,
} from '../types/language';
import { formatArabicDisplay } from '../utils/arabic';
import { playMultiLangDialogue, stopSpeech } from '../utils/audio';

type MultiTrackId = Exclude<ExamTrackId, 'jlpt'>;

interface ExamQuestion {
  id: string;
  sectionId: string;
  sectionLabel: string;
  kind: 'listening' | 'structure' | 'reading' | 'vocab';
  prompt: string;
  stimulusText?: string;
  passageTitle?: string;
  passageParagraphs?: string[];
  listeningTrack?: LangListeningTrack;
  choices: string[];
  correctIndex: number;
  explanationId: string;
}

interface BuiltExam {
  trackId: MultiTrackId;
  examName: string;
  mode: 'quick' | 'standard';
  durationSec: number;
  sections: { id: string; label: string }[];
  questions: ExamQuestion[];
}

interface MultiExamSimulatorHubProps {
  lang: 'en' | 'ar';
}

const EN_TRACKS: MultiTrackId[] = ['toefl-itp', 'toefl-ibt', 'ielts', 'toeic'];

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export const MultiExamSimulatorHub: React.FC<MultiExamSimulatorHubProps> = ({ lang }) => {
  const {
    state,
    activeExamTrack,
    setActiveExamTrack,
    setActiveView,
    recordMultiExamResult,
  } = useApp();

  const isAr = lang === 'ar';
  const defaultTrack: MultiTrackId = isAr
    ? 'toafl'
    : activeExamTrack && EN_TRACKS.includes(activeExamTrack as MultiTrackId)
    ? (activeExamTrack as MultiTrackId)
    : 'toefl-itp';

  const [selectedTrack, setSelectedTrack] = useState<MultiTrackId>(defaultTrack);
  const [selectedMode, setSelectedMode] = useState<'quick' | 'standard'>('quick');

  const [vocabPool, setVocabPool] = useState<LangVocabItem[]>([]);
  const [grammarPool, setGrammarPool] = useState<LangGrammarItem[]>([]);
  const [readingPool, setReadingPool] = useState<LangReadingPassage[]>([]);
  const [listeningPool, setListeningPool] = useState<LangListeningTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active exam session state
  const [exam, setExam] = useState<BuiltExam | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [remainingSec, setRemainingSec] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<MultiExamResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // TOAFL defaults to teks gundul during exam (authentic TOAFL conditions)
  const [examShowHarakat, setExamShowHarakat] = useState(false);

  // Listening playback tracking (capped 2 replays per question)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const cancelAudioRef = useRef<(() => void) | null>(null);

  const enAccent = state.settings.englishAccent ?? 'en-US';
  const defaultTtsLocale = isAr ? 'ar-SA' : enAccent;
  const accentBtnClass = isAr
    ? 'bg-[#059669] hover:bg-[#047857] text-white'
    : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white';
  const accentTextClass = isAr
    ? 'text-[#059669] dark:text-emerald-400'
    : 'text-[#2563EB] dark:text-blue-400';

  const stopAudio = () => {
    if (cancelAudioRef.current) {
      cancelAudioRef.current();
      cancelAudioRef.current = null;
    }
    stopSpeech();
    setIsPlayingAudio(false);
  };

  useEffect(() => {
    if (isAr) {
      setSelectedTrack('toafl');
    } else if (activeExamTrack && EN_TRACKS.includes(activeExamTrack as MultiTrackId)) {
      setSelectedTrack(activeExamTrack as MultiTrackId);
    }
  }, [lang, isAr, activeExamTrack]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setExam(null);
    setResult(null);
    stopAudio();

    Promise.all([
      getLangVocabLoader(lang).loadAll(),
      getLangGrammarLoader(lang).loadAll(),
      getLangReadingLoader(lang).loadAll(),
      getLangListeningLoader(lang).loadAll(),
    ])
      .then(([v, g, r, l]) => {
        if (!active) return;
        setVocabPool(v);
        setGrammarPool(g);
        setReadingPool(r);
        setListeningPool(l);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat bank soal simulasi.');
        setLoading(false);
      });

    return () => {
      active = false;
      stopAudio();
    };
  }, [lang]);

  useEffect(() => {
    if (!exam || result) return;
    const id = window.setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [exam, result]);

  useEffect(() => {
    if (exam && !result && remainingSec === 0) {
      finalizeExam(exam, answers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec]);

  const renderExamText = (text: string) =>
    isAr ? formatArabicDisplay(text, examShowHarakat) : text;

  const buildExam = (trackId: MultiTrackId, mode: 'quick' | 'standard'): BuiltExam => {
    const def = getExamTrackDefinition(trackId);
    const examName = def?.name ?? trackId.toUpperCase();
    const isStd = mode === 'standard';

    const filterByTrack = <T extends { tracks: string[] }>(pool: T[], prefer: string[]) => {
      const matched = pool.filter((item) => prefer.some((t) => item.tracks.includes(t)));
      return matched.length > 0 ? matched : pool;
    };

    const makeListeningQs = (
      secId: string,
      secLabel: string,
      preferTracks: string[],
      count: number
    ): ExamQuestion[] => {
      const pool = shuffle(filterByTrack(listeningPool, preferTracks));
      const fallback = pool.length < count ? shuffle(listeningPool) : pool;
      const picked: LangListeningTrack[] = [];
      for (const item of [...pool, ...fallback]) {
        if (picked.length >= count) break;
        if (!picked.some((p) => p.id === item.id)) picked.push(item);
      }
      return picked.map((t, idx) => ({
        id: `${secId}_l_${idx}_${t.id}`,
        sectionId: secId,
        sectionLabel: secLabel,
        kind: 'listening',
        prompt: t.questionPrompt,
        stimulusText: t.introText,
        listeningTrack: t,
        choices: t.choices,
        correctIndex: t.correctIndex,
        explanationId: t.explanationId,
      }));
    };

    const makeGrammarVocabQs = (
      secId: string,
      secLabel: string,
      preferTracks: string[],
      gramCount: number,
      vocabCount: number
    ): ExamQuestion[] => {
      const gPool = shuffle(filterByTrack(grammarPool, preferTracks));
      const gAll = [...gPool, ...shuffle(grammarPool)];
      const pickedG: LangGrammarItem[] = [];
      for (const g of gAll) {
        if (pickedG.length >= gramCount) break;
        if (!pickedG.some((x) => x.id === g.id)) pickedG.push(g);
      }

      const vPool = shuffle(filterByTrack(vocabPool, preferTracks));
      const vAll = [...vPool, ...shuffle(vocabPool)];
      const pickedV: LangVocabItem[] = [];
      for (const v of vAll) {
        if (pickedV.length >= vocabCount) break;
        if (!pickedV.some((x) => x.id === v.id)) pickedV.push(v);
      }

      const gQs: ExamQuestion[] = pickedG.map((g, idx) => ({
        id: `${secId}_g_${idx}_${g.id}`,
        sectionId: secId,
        sectionLabel: secLabel,
        kind: 'structure',
        prompt: g.quiz.prompt,
        stimulusText: g.quiz.sentence,
        choices: g.quiz.choices,
        correctIndex: g.quiz.correctIndex,
        explanationId: g.quiz.explanationId,
      }));

      const vQs: ExamQuestion[] = pickedV.map((v, idx) => ({
        id: `${secId}_v_${idx}_${v.id}`,
        sectionId: secId,
        sectionLabel: secLabel,
        kind: 'vocab',
        prompt: `${v.term} — ${v.quiz.prompt}`,
        choices: v.quiz.choices,
        correctIndex: v.quiz.correctIndex,
        explanationId: v.quiz.explanationId,
      }));

      return [...gQs, ...vQs];
    };

    const makeReadingQs = (
      secId: string,
      secLabel: string,
      preferTracks: string[],
      passageCount: number
    ): ExamQuestion[] => {
      const rPool = shuffle(filterByTrack(readingPool, preferTracks));
      const rAll = [...rPool, ...shuffle(readingPool)];
      const pickedR: LangReadingPassage[] = [];
      for (const r of rAll) {
        if (pickedR.length >= passageCount) break;
        if (!pickedR.some((x) => x.id === r.id)) pickedR.push(r);
      }
      const qs: ExamQuestion[] = [];
      pickedR.forEach((p) => {
        p.questions.forEach((q, qIdx) => {
          qs.push({
            id: `${secId}_r_${p.id}_${qIdx}`,
            sectionId: secId,
            sectionLabel: secLabel,
            kind: 'reading',
            prompt: q.prompt,
            passageTitle: p.title,
            passageParagraphs: p.paragraphs,
            choices: q.choices,
            correctIndex: q.correctIndex,
            explanationId: q.explanationId,
          });
        });
      });
      return qs;
    };

    if (trackId === 'toafl') {
      const s1 = makeListeningQs(
        'istima',
        'Sesi 1 · Fahm al-Masmu’ (Istima’)',
        ['toafl'],
        isStd ? 8 : 4
      );
      const s2 = makeGrammarVocabQs(
        'tarakib',
        'Sesi 2 · At-Tarakib wa al-Qawaid',
        ['toafl'],
        isStd ? 10 : 5,
        isStd ? 4 : 2
      );
      const s3 = makeReadingQs(
        'qiraah',
        'Sesi 3 · Fahm al-Maqru’ (Qira’ah)',
        ['toafl'],
        isStd ? 4 : 2
      );
      return {
        trackId,
        examName,
        mode,
        durationSec: isStd ? 35 * 60 : 18 * 60,
        sections: [
          { id: 'istima', label: 'Fahm al-Masmu’ (Istima’)' },
          { id: 'tarakib', label: 'At-Tarakib wa al-Qawaid' },
          { id: 'qiraah', label: 'Fahm al-Maqru’ (Qira’ah)' },
        ],
        questions: [...s1, ...s2, ...s3],
      };
    }

    if (trackId === 'toefl-itp') {
      const s1 = makeListeningQs(
        'listening',
        'Section 1 · Listening Comprehension',
        ['toefl-itp', 'toefl-ibt'],
        isStd ? 8 : 4
      );
      const s2 = makeGrammarVocabQs(
        'structure',
        'Section 2 · Structure & Written Expression',
        ['toefl-itp'],
        isStd ? 12 : 6,
        0
      );
      const s3 = makeReadingQs(
        'reading',
        'Section 3 · Reading Comprehension',
        ['toefl-itp', 'toefl-ibt'],
        isStd ? 3 : 2
      );
      return {
        trackId,
        examName,
        mode,
        durationSec: isStd ? 35 * 60 : 18 * 60,
        sections: [
          { id: 'listening', label: 'Listening Comprehension' },
          { id: 'structure', label: 'Structure & Written Expression' },
          { id: 'reading', label: 'Reading Comprehension' },
        ],
        questions: [...s1, ...s2, ...s3],
      };
    }

    if (trackId === 'toefl-ibt') {
      const s1 = makeReadingQs(
        'reading',
        'Section 1 · Academic Reading',
        ['toefl-ibt', 'toefl-itp'],
        isStd ? 3 : 2
      );
      const s2 = makeListeningQs(
        'listening',
        'Section 2 · Academic Listening',
        ['toefl-ibt', 'toefl-itp'],
        isStd ? 8 : 4
      );
      const s3 = makeGrammarVocabQs(
        'language',
        'Section 3 · Academic Usage & Integrated Language',
        ['toefl-ibt', 'ielts'],
        isStd ? 6 : 3,
        isStd ? 6 : 3
      );
      return {
        trackId,
        examName,
        mode,
        durationSec: isStd ? 35 * 60 : 18 * 60,
        sections: [
          { id: 'reading', label: 'Academic Reading' },
          { id: 'listening', label: 'Academic Listening' },
          { id: 'language', label: 'Academic Language Usage' },
        ],
        questions: [...s1, ...s2, ...s3],
      };
    }

    if (trackId === 'ielts') {
      const s1 = makeListeningQs(
        'listening',
        'Section 1 · IELTS Listening (UK/International)',
        ['ielts'],
        isStd ? 8 : 4
      );
      const s2 = makeReadingQs(
        'reading',
        'Section 2 · Academic Reading (TFNG & Inference)',
        ['ielts'],
        isStd ? 3 : 2
      );
      const s3 = makeGrammarVocabQs(
        'language',
        'Section 3 · Lexical Resource & Academic Grammar',
        ['ielts'],
        isStd ? 6 : 3,
        isStd ? 6 : 3
      );
      return {
        trackId,
        examName,
        mode,
        durationSec: isStd ? 35 * 60 : 18 * 60,
        sections: [
          { id: 'listening', label: 'Listening' },
          { id: 'reading', label: 'Academic Reading' },
          { id: 'language', label: 'Lexical & Academic Grammar' },
        ],
        questions: [...s1, ...s2, ...s3],
      };
    }

    // TOEIC
    const s1 = makeListeningQs(
      'listening',
      'Section 1 · TOEIC Listening (Workplace & Announcements)',
      ['toeic'],
      isStd ? 8 : 4
    );
    const s2a = makeGrammarVocabQs(
      'reading',
      'Section 2 · TOEIC Reading (Business Cloze & Documents)',
      ['toeic'],
      isStd ? 8 : 4,
      isStd ? 4 : 2
    );
    const s2b = makeReadingQs(
      'reading',
      'Section 2 · TOEIC Reading (Business Cloze & Documents)',
      ['toeic'],
      isStd ? 3 : 2
    );
    return {
      trackId: 'toeic',
      examName,
      mode,
      durationSec: isStd ? 30 * 60 : 16 * 60,
      sections: [
        { id: 'listening', label: 'Listening (5–495)' },
        { id: 'reading', label: 'Reading (5–495)' },
      ],
      questions: [...s1, ...s2a, ...s2b],
    };
  };

  const startExam = () => {
    stopAudio();
    const built = buildExam(selectedTrack, selectedMode);
    setExam(built);
    setCurrentIdx(0);
    setAnswers({});
    setFlagged({});
    setPlayCounts({});
    setRemainingSec(built.durationSec);
    setStartedAt(Date.now());
    setResult(null);
    setReviewOpen(false);
    setExamShowHarakat(false);
  };

  const finalizeExam = (currentExam: BuiltExam, currentAnswers: Record<string, number>) => {
    stopAudio();
    const sectionCounts: Record<string, { correct: number; total: number }> = {};
    for (const sec of currentExam.sections) {
      sectionCounts[sec.id] = { correct: 0, total: 0 };
    }

    let totalCorrect = 0;
    for (const q of currentExam.questions) {
      const bucket = sectionCounts[q.sectionId] ?? { correct: 0, total: 0 };
      bucket.total += 1;
      if (currentAnswers[q.id] === q.correctIndex) {
        bucket.correct += 1;
        totalCorrect += 1;
      }
      sectionCounts[q.sectionId] = bucket;
    }

    const ratioOf = (secId: string) => {
      const b = sectionCounts[secId];
      if (!b || b.total === 0) return 0;
      return b.correct / b.total;
    };

    let sectionsResult: MultiExamSectionResult[] = [];
    let scaledTotal = 0;
    let scaledLabel = '';
    let benchmarkLabel = '';
    let passed = false;

    if (currentExam.trackId === 'toefl-itp') {
      const conv = convertToeflItpScore(
        ratioOf('listening'),
        ratioOf('structure'),
        ratioOf('reading')
      );
      scaledTotal = conv.total;
      scaledLabel = `${conv.total} / 677`;
      benchmarkLabel = conv.benchmarkLabel;
      passed = conv.passed;
      sectionsResult = [
        { id: 'listening', label: 'Listening', ...sectionCounts.listening, scaledScore: conv.listening, scaledMax: 68 },
        { id: 'structure', label: 'Structure', ...sectionCounts.structure, scaledScore: conv.structure, scaledMax: 68 },
        { id: 'reading', label: 'Reading', ...sectionCounts.reading, scaledScore: conv.reading, scaledMax: 67 },
      ];
    } else if (currentExam.trackId === 'toafl') {
      const conv = convertToaflScore(ratioOf('istima'), ratioOf('tarakib'), ratioOf('qiraah'));
      scaledTotal = conv.total;
      scaledLabel = `${conv.total} / 677`;
      benchmarkLabel = conv.benchmarkLabel;
      passed = conv.passed;
      sectionsResult = [
        { id: 'istima', label: 'Fahm al-Masmu’ (Istima’)', ...sectionCounts.istima, scaledScore: conv.istima, scaledMax: 68 },
        { id: 'tarakib', label: 'At-Tarakib wa al-Qawaid', ...sectionCounts.tarakib, scaledScore: conv.tarakib, scaledMax: 68 },
        { id: 'qiraah', label: 'Fahm al-Maqru’ (Qira’ah)', ...sectionCounts.qiraah, scaledScore: conv.qiraah, scaledMax: 67 },
      ];
    } else if (currentExam.trackId === 'ielts') {
      const conv = convertIeltsScore(
        ratioOf('listening'),
        ratioOf('reading'),
        ratioOf('language')
      );
      scaledTotal = conv.overall;
      scaledLabel = `Band ${conv.overall.toFixed(1)}`;
      benchmarkLabel = conv.benchmarkLabel;
      passed = conv.passed;
      sectionsResult = [
        { id: 'listening', label: 'Listening', ...sectionCounts.listening, scaledScore: conv.listening, scaledMax: 9 },
        { id: 'reading', label: 'Academic Reading', ...sectionCounts.reading, scaledScore: conv.reading, scaledMax: 9 },
        { id: 'language', label: 'Lexical & Grammar', ...sectionCounts.language, scaledScore: conv.language, scaledMax: 9 },
      ];
    } else if (currentExam.trackId === 'toeic') {
      const conv = convertToeicScore(ratioOf('listening'), ratioOf('reading'));
      scaledTotal = conv.total;
      scaledLabel = `${conv.total} / 990`;
      benchmarkLabel = conv.benchmarkLabel;
      passed = conv.passed;
      sectionsResult = [
        { id: 'listening', label: 'Listening', ...sectionCounts.listening, scaledScore: conv.listening, scaledMax: 495 },
        { id: 'reading', label: 'Reading', ...sectionCounts.reading, scaledScore: conv.reading, scaledMax: 495 },
      ];
    } else {
      const conv = convertToeflIbtScore(
        ratioOf('reading'),
        ratioOf('listening'),
        ratioOf('language')
      );
      scaledTotal = conv.total;
      scaledLabel = `${conv.total} / 120`;
      benchmarkLabel = conv.benchmarkLabel;
      passed = conv.passed;
      sectionsResult = [
        { id: 'reading', label: 'Reading', ...sectionCounts.reading, scaledScore: conv.reading, scaledMax: 30 },
        { id: 'listening', label: 'Listening', ...sectionCounts.listening, scaledScore: conv.listening, scaledMax: 30 },
        { id: 'language', label: 'Academic Language', ...sectionCounts.language, scaledScore: conv.integratedEstimate, scaledMax: 60 },
      ];
    }

    const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const examResult: MultiExamResult = {
      id: `mexam_${Date.now()}`,
      lang,
      examTrack: currentExam.trackId,
      examName: currentExam.examName,
      mode: currentExam.mode,
      sections: sectionsResult,
      totalCorrect,
      totalQuestions: currentExam.questions.length,
      scaledTotal,
      scaledLabel,
      benchmarkLabel,
      passed,
      elapsedSec,
      completedAt: Date.now(),
    };

    setResult(examResult);
    recordMultiExamResult(examResult);
  };

  const handlePlayQuestionAudio = (q: ExamQuestion) => {
    if (!q.listeningTrack) return;
    if (isPlayingAudio) {
      stopAudio();
      return;
    }
    const used = playCounts[q.id] ?? 0;
    if (used >= 2) return;

    setPlayCounts((prev) => ({ ...prev, [q.id]: used + 1 }));
    setIsPlayingAudio(true);

    const cues = q.listeningTrack.lines.map((line, idx) => ({
      id: `${q.id}_${idx}`,
      role: line.role,
      text: line.text,
      lang: line.localeOverride || defaultTtsLocale,
      pauseAfterMs: 400,
    }));

    cancelAudioRef.current = playMultiLangDialogue(cues, {
      defaultLang: defaultTtsLocale,
      rate: 0.95,
      onComplete: () => {
        cancelAudioRef.current = null;
        setIsPlayingAudio(false);
      },
      onError: () => {
        cancelAudioRef.current = null;
        setIsPlayingAudio(false);
      },
    });
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
          Menyiapkan mesin Simulasi Tes {isAr ? 'TOAFL' : 'TOEFL / IELTS / TOEIC'}...
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

  // RESULT REPORT CARD
  if (exam && result) {
    return (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Laporan Skor Resmi Simulasi · {result.examName} (
                {result.mode === 'standard' ? 'Mode Standar' : 'Mode Ringkas'})
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold font-mono-num text-slate-900 dark:text-white">
                {result.scaledLabel}
              </h1>
              <p className={`text-sm font-semibold ${accentTextClass}`}>{result.benchmarkLabel}</p>
            </div>

            <div className="text-left sm:text-right space-y-1">
              <div className="text-xs text-slate-500">Akurasi Mentah</div>
              <div className="font-mono-num text-xl font-bold text-slate-900 dark:text-white">
                {result.totalCorrect} / {result.totalQuestions} (
                {Math.round((result.totalCorrect / Math.max(1, result.totalQuestions)) * 100)}%)
              </div>
              <div className="text-xs text-slate-500 font-mono-num">
                Durasi: {formatTimer(result.elapsedSec)}
              </div>
            </div>
          </div>

          {/* Section Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {result.sections.map((sec) => (
              <div
                key={sec.id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5"
              >
                <div className="text-xs font-semibold text-slate-500">{sec.label}</div>
                <div className="font-mono-num text-2xl font-bold text-slate-900 dark:text-white">
                  {result.examTrack === 'ielts'
                    ? `Band ${sec.scaledScore.toFixed(1)}`
                    : `${sec.scaledScore} / ${sec.scaledMax}`}
                </div>
                <div className="text-xs text-slate-500 font-mono-num">
                  Benar {sec.correct}/{sec.total}
                </div>
              </div>
            ))}
          </div>

          {result.examTrack === 'toafl' && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">
                Ambang Kelulusan TOAFL Standar UIN/PTKIN
              </div>
              <div>
                375+ (S1 Non-Agama) · 400+ (S1 Studi Islam) · 450+ (Magister S2) · 500+ (Bahasa
                Arab / S3)
              </div>
            </div>
          )}

          {(result.examTrack === 'ielts' || result.examTrack === 'toefl-ibt') && (
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-700 dark:text-slate-300">
                Lanjutkan latihan produktif <strong>Writing & Speaking</strong> dengan rubrik resmi
                di Studio.
              </div>
              <button
                type="button"
                onClick={() => setActiveView('lang-studio')}
                className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shrink-0 cursor-pointer"
              >
                Buka Writing & Speaking Studio
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setReviewOpen((v) => !v)}
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              {reviewOpen ? 'Tutup Pembahasan Soal' : 'Lihat Pembahasan Lengkap'}
            </button>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setExam(null);
                  setResult(null);
                }}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Pilih Ujian Lain
              </button>
              <button
                type="button"
                onClick={startExam}
                className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Ulangi Simulasi
              </button>
            </div>
          </div>
        </div>

        {reviewOpen && (
          <section className="space-y-3">
            {exam.questions.map((q, idx) => {
              const userAns = answers[q.id];
              const isCorrect = userAns === q.correctIndex;
              return (
                <div
                  key={q.id}
                  className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-500">
                      Soal {idx + 1} · {q.sectionLabel}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        isCorrect
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                      {isCorrect ? 'Benar' : 'Salah'}
                    </span>
                  </div>
                  {q.stimulusText && (
                    <div
                      dir={isAr ? 'rtl' : 'ltr'}
                      className={
                        isAr
                          ? 'font-ar text-lg text-slate-800 dark:text-slate-200'
                          : 'text-xs text-slate-600 dark:text-slate-400'
                      }
                    >
                      {formatArabicDisplay(q.stimulusText, true)}
                    </div>
                  )}
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{q.prompt}</p>
                  <div className="text-xs space-y-1">
                    <div>
                      Jawaban Anda:{' '}
                      <span className="font-semibold">
                        {userAns !== undefined ? q.choices[userAns] : '(Tidak dijawab)'}
                      </span>
                    </div>
                    <div className="text-emerald-700 dark:text-emerald-400">
                      Kunci Jawaban:{' '}
                      <span className="font-semibold">{q.choices[q.correctIndex]}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 pt-1">{q.explanationId}</p>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>
    );
  }

  // ACTIVE EXAM RUNNER
  if (exam) {
    const q = exam.questions[currentIdx];
    const answeredCount = Object.keys(answers).length;
    const playsUsed = playCounts[q.id] ?? 0;

    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Top Exam Status Bar */}
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">
              {exam.examName} · {q.sectionLabel}
            </div>
            <div className="text-[11px] text-slate-500 font-mono-num">
              Soal {currentIdx + 1} dari {exam.questions.length} · Terjawab {answeredCount}/
              {exam.questions.length}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isAr && (
              <button
                type="button"
                onClick={() => setExamShowHarakat((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                {examShowHarakat ? 'Mode TOAFL Gundul' : 'Bantuan Harakat'}
              </button>
            )}
            <span
              className={`inline-flex items-center gap-1.5 font-mono-num text-sm font-bold px-3 py-1.5 rounded-lg border ${
                remainingSec < 120
                  ? 'border-rose-300 text-rose-600 bg-rose-50 dark:bg-rose-950/30'
                  : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              {formatTimer(remainingSec)}
            </span>
            <button
              type="button"
              onClick={() => finalizeExam(exam, answers)}
              className="px-4 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
            >
              Selesaikan & Nilai
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Question Workspace */}
          <section className="lg:col-span-8 bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            {q.passageParagraphs && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3 max-h-72 overflow-y-auto">
                {q.passageTitle && (
                  <div
                    dir={isAr ? 'rtl' : 'ltr'}
                    className={`font-bold text-slate-900 dark:text-white ${
                      isAr ? 'font-ar text-xl' : 'text-sm'
                    }`}
                  >
                    {renderExamText(q.passageTitle)}
                  </div>
                )}
                {q.passageParagraphs.map((para, pIdx) => (
                  <p
                    key={pIdx}
                    dir={isAr ? 'rtl' : 'ltr'}
                    className={
                      isAr
                        ? 'font-ar text-lg text-slate-800 dark:text-slate-200'
                        : 'text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed'
                    }
                  >
                    {renderExamText(para)}
                  </p>
                ))}
              </div>
            )}

            {q.listeningTrack && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {q.listeningTrack.title}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Batas putar ujian: <span className="font-mono-num">{playsUsed}/2</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!isPlayingAudio && playsUsed >= 2}
                  onClick={() => handlePlayQuestionAudio(q)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer ${accentBtnClass}`}
                >
                  {isPlayingAudio ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlayingAudio ? 'Hentikan Audio' : 'Putar Audio Soal'}
                </button>
              </div>
            )}

            {q.stimulusText && !q.listeningTrack && (
              <div
                dir={isAr ? 'rtl' : 'ltr'}
                className={`p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white ${
                  isAr ? 'font-ar text-2xl' : 'text-sm sm:text-base font-medium leading-relaxed'
                }`}
              >
                {renderExamText(q.stimulusText)}
              </div>
            )}

            <p
              dir={isAr ? 'auto' : 'ltr'}
              className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-relaxed"
            >
              {renderExamText(q.prompt)}
            </p>

            <div className="space-y-2.5">
              {q.choices.map((choice, cIdx) => {
                const chosen = answers[q.id] === cIdx;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: cIdx }))}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                      chosen
                        ? isAr
                          ? 'border-[#059669] bg-emerald-50 dark:bg-emerald-950/30 text-slate-900 dark:text-white'
                          : 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span className="font-mono-num font-bold mr-2.5">
                      {String.fromCharCode(65 + cIdx)}.
                    </span>
                    <span dir={isAr ? 'auto' : 'ltr'} className={isAr ? 'font-ar text-lg' : ''}>
                      {renderExamText(choice)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                  flagged[q.id]
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                {flagged[q.id] ? 'Ditandai Ragu-ragu' : 'Tandai Ragu-ragu'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => {
                    stopAudio();
                    setCurrentIdx((i) => Math.max(0, i - 1));
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  Sebelumnya
                </button>
                {currentIdx + 1 < exam.questions.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopAudio();
                      setCurrentIdx((i) => Math.min(exam.questions.length - 1, i + 1));
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
                  >
                    Berikutnya
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => finalizeExam(exam, answers)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${accentBtnClass}`}
                  >
                    Kumpulkan Ujian
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Question Navigator Sidebar */}
          <aside className="lg:col-span-4 bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Navigasi Nomor Soal
            </div>
            <div className="grid grid-cols-6 gap-2">
              {exam.questions.map((item, idx) => {
                const isAnswered = answers[item.id] !== undefined;
                const isFlagged = flagged[item.id];
                const isCurrent = idx === currentIdx;
                let cls =
                  'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400';
                if (isCurrent) {
                  cls = isAr
                    ? 'border-[#059669] bg-[#059669] text-white'
                    : 'border-[#2563EB] bg-[#2563EB] text-white';
                } else if (isFlagged) {
                  cls =
                    'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300';
                } else if (isAnswered) {
                  cls =
                    'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white';
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      stopAudio();
                      setCurrentIdx(idx);
                    }}
                    className={`h-9 rounded-lg border text-xs font-mono-num font-bold cursor-pointer ${cls}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-slate-500 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>Klik nomor untuk melompat ke soal mana saja.</div>
              <div>Audio Listening dapat diputar maksimal 2 kali per soal.</div>
            </div>
          </aside>
        </div>
      </main>
    );
  }

  // SETUP SCREEN
  const trackDef = getExamTrackDefinition(selectedTrack);
  const trackOptions: MultiTrackId[] = isAr ? ['toafl'] : EN_TRACKS;
  const pastResults = (state.langMockExamHistory ?? []).filter((r) => r.lang === lang);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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
          {isAr
            ? 'Simulasi Tes TOAFL Resmi (Skala 310–677)'
            : 'Simulasi Sertifikasi Inggris (TOEFL ITP · iBT · IELTS · TOEIC)'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isAr
            ? 'Mengikuti struktur 3 sesi resmi UIN/PTKIN dengan tampilan default teks gundul dan konversi skala 310–677.'
            : 'Pilih jalur ujian internasional, selesaikan setiap sesi berbatas waktu, dan dapatkan konversi skor resmi.'}
        </p>
      </div>

      {/* Exam Track Selector (for EN) */}
      {!isAr && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {trackOptions.map((tid) => {
            const def = getExamTrackDefinition(tid);
            if (!def) return null;
            const active = selectedTrack === tid;
            return (
              <button
                key={tid}
                type="button"
                onClick={() => {
                  setSelectedTrack(tid);
                  setActiveExamTrack(tid);
                }}
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'border-[#2563EB] bg-blue-50/60 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-slate-400'
                }`}
              >
                <div className="text-xs font-bold font-mono-num text-[#2563EB] dark:text-blue-400">
                  {def.scoreRangeLabel}
                </div>
                <div className="font-display text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {def.name}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{def.summary}</div>
              </button>
            );
          })}
        </section>
      )}

      {/* Exam Configuration Card */}
      {trackDef && (
        <section className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className={`text-xs font-bold uppercase tracking-wider ${accentTextClass}`}>
                {trackDef.name} · Skala {trackDef.scoreRangeLabel}
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {trackDef.summary}
              </p>

              <div className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Struktur Sesi Ujian
                </div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {trackDef.sections.join(' · ')}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                {trackDef.passingBenchmarks.map((b) => (
                  <div
                    key={b.label}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
                  >
                    <div className="text-[11px] text-slate-500">{b.label}</div>
                    <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {b.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full lg:w-80 shrink-0 space-y-4 p-5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Pilih Durasi Simulasi
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedMode('quick')}
                  className={`w-full text-left p-3 rounded-lg border text-xs cursor-pointer ${
                    selectedMode === 'quick'
                      ? isAr
                        ? 'border-[#059669] bg-white dark:bg-[#161A22]'
                        : 'border-[#2563EB] bg-white dark:bg-[#161A22]'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-slate-900 dark:text-white">
                    Mode Ringkas (~16–18 Menit)
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Cepat untuk evaluasi harian & kalibrasi estimasi skor.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('standard')}
                  className={`w-full text-left p-3 rounded-lg border text-xs cursor-pointer ${
                    selectedMode === 'standard'
                      ? isAr
                        ? 'border-[#059669] bg-white dark:bg-[#161A22]'
                        : 'border-[#2563EB] bg-white dark:bg-[#161A22]'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-slate-900 dark:text-white">
                    Mode Standar (~30–35 Menit)
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Paket lengkap lintas seluruh sesi ujian untuk simulasi mendalam.
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={startExam}
                className={`w-full py-3 rounded-lg text-sm font-semibold cursor-pointer ${accentBtnClass}`}
              >
                Mulai Simulasi {trackDef.shortName}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Past History */}
      {pastResults.length > 0 && (
        <section className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Award className={`w-4 h-4 ${accentTextClass}`} />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Riwayat Simulasi {isAr ? 'TOAFL' : 'Bahasa Inggris'}
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pastResults.slice(0, 8).map((r) => (
              <div
                key={r.id}
                className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">{r.examName}</span>
                  <span className="text-slate-500 ml-2">
                    {r.mode === 'standard' ? 'Standar' : 'Ringkas'} · {r.totalCorrect}/
                    {r.totalQuestions} benar · {r.benchmarkLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono-num">
                  <span className={`font-bold ${accentTextClass}`}>{r.scaledLabel}</span>
                  <span className="text-slate-400">
                    {new Date(r.completedAt).toLocaleDateString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
};
