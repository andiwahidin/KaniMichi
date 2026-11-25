import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { enStudioLoader } from '../data/langPackLoader';
import {
  blobToBase64,
  buildLearnerContext,
  evaluateSpeakingWithAi,
  evaluateWritingWithAi,
  type AiSpeakingEvaluation,
  type AiWritingEvaluation,
} from '../lib/aiTutor';
import type { StudioPromptItem } from '../types/language';
import { speakText, stopSpeech } from '../utils/audio';

export const WritingSpeakingStudio: React.FC = () => {
  const { dataset, state, userProfile, setActiveView, recordStudioAttempt } = useApp();

  const [prompts, setPrompts] = useState<StudioPromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [examFilter, setExamFilter] = useState<'all' | 'ielts' | 'toefl-ibt'>('all');
  const [skillFilter, setSkillFilter] = useState<'all' | 'writing' | 'speaking'>('all');
  const [activePromptId, setActivePromptId] = useState<string | null>(null);

  // Studio workspace states
  const [timerPhase, setTimerPhase] = useState<'prep' | 'response'>('response');
  const [remainingSec, setRemainingSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const [draftText, setDraftText] = useState('');
  const [rightTab, setRightTab] = useState<'ai' | 'rubric' | 'model'>('ai');
  const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Browser audio self-recording for Speaking tasks
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // AI Evaluator states
  const [aiEvaluating, setAiEvaluating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [writingEval, setWritingEval] = useState<AiWritingEvaluation | null>(null);
  const [speakingEval, setSpeakingEval] = useState<AiSpeakingEvaluation | null>(null);

  const enAccent = state.settings.englishAccent ?? 'en-US';

  useEffect(() => {
    let active = true;
    setLoading(true);
    enStudioLoader
      .loadAll()
      .then((loaded) => {
        if (!active) return;
        setPrompts(loaded);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat Studio Writing & Speaking.');
        setLoading(false);
      });
    return () => {
      active = false;
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setElapsedSec((e) => e + 1);
      setRemainingSec((r) => {
        if (r <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [recordingUrl]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      if (examFilter !== 'all' && p.examTrack !== examFilter) return false;
      if (skillFilter !== 'all' && p.skill !== skillFilter) return false;
      return true;
    });
  }, [prompts, examFilter, skillFilter]);

  const activePrompt = useMemo(
    () => prompts.find((p) => p.id === activePromptId) ?? null,
    [prompts, activePromptId]
  );

  const openPrompt = (prompt: StudioPromptItem) => {
    stopSpeech();
    setActivePromptId(prompt.id);
    setDraftText('');
    setCriteriaScores({});
    setSavedNotice(null);
    setRightTab('ai');
    setTimerRunning(false);
    setElapsedSec(0);
    setWritingEval(null);
    setSpeakingEval(null);
    setAiError(null);
    if (prompt.prepSec > 0) {
      setTimerPhase('prep');
      setRemainingSec(prompt.prepSec);
    } else {
      setTimerPhase('response');
      setRemainingSec(prompt.durationSec);
    }
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
    setRecordingBlob(null);
    setRecordingError(null);
    setIsRecording(false);
  };

  const switchTimerPhase = (phase: 'prep' | 'response') => {
    if (!activePrompt) return;
    setTimerRunning(false);
    setTimerPhase(phase);
    setRemainingSec(phase === 'prep' ? activePrompt.prepSec : activePrompt.durationSec);
  };

  const wordCount = useMemo(() => {
    const trimmed = draftText.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [draftText]);

  const startSelfRecording = async () => {
    setRecordingError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecordingError(
        'Perekaman mikrofon tidak tersedia di browser ini. Anda tetap dapat mengetik teks jawaban lisan untuk diperiksa Tutor AI.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        setRecordingBlob(blob);
        setRecordingUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setRecordingError(
        'Izin mikrofon ditolak atau perangkat tidak ditemukan. Anda tetap bisa mengetik jawaban lisan di bawah untuk dinilai AI.'
      );
    }
  };

  const stopSelfRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleEvaluateWithAi = async () => {
    if (!activePrompt || aiEvaluating) return;
    setAiEvaluating(true);
    setAiError(null);
    setSavedNotice(null);
    setRightTab('ai');

    const rubricCriteria = activePrompt.rubricCriteria.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    }));

    const learnerContext = buildLearnerContext(state, dataset, userProfile);

    try {
      if (activePrompt.skill === 'writing') {
        const res = await evaluateWritingWithAi({
          language: 'en',
          examTrack: activePrompt.examTrack,
          taskTitle: activePrompt.title,
          promptBody: activePrompt.promptBody,
          readingExcerpt: activePrompt.readingExcerpt,
          minWords: activePrompt.minWords,
          userEssay: draftText,
          rubricCriteria,
          learnerContext,
        });
        setWritingEval(res);
        // Sync criteria scores automatically so user can review or save immediately
        const mapped: Record<string, number> = {};
        for (const cf of res.criteriaFeedback) {
          mapped[cf.criterionId] = cf.score;
        }
        setCriteriaScores(mapped);
      } else {
        let audioBase64 = '';
        let audioMimeType = 'audio/webm';
        if (recordingBlob) {
          audioBase64 = await blobToBase64(recordingBlob);
          audioMimeType = recordingBlob.type || 'audio/webm';
        }
        const res = await evaluateSpeakingWithAi({
          language: 'en',
          examTrack: activePrompt.examTrack,
          taskTitle: activePrompt.title,
          promptBody: activePrompt.promptBody,
          audioBase64: audioBase64 || undefined,
          audioMimeType,
          transcriptText: draftText.trim() || undefined,
          rubricCriteria,
          learnerContext,
        });
        setSpeakingEval(res);
        const mapped: Record<string, number> = {};
        for (const cf of res.criteriaFeedback) {
          mapped[cf.criterionId] = cf.score;
        }
        setCriteriaScores(mapped);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Gagal memeriksa jawaban dengan Tutor AI.');
    } finally {
      setAiEvaluating(false);
    }
  };

  const handleSaveAiResult = () => {
    if (!activePrompt) return;
    const activeEval = activePrompt.skill === 'writing' ? writingEval : speakingEval;
    if (!activeEval) return;

    const scoresObj: Record<string, number> = {};
    for (const cf of activeEval.criteriaFeedback) {
      scoresObj[cf.criterionId] = cf.score;
    }

    recordStudioAttempt({
      id: `studio_ai_${Date.now()}`,
      promptId: activePrompt.id,
      examTrack: activePrompt.examTrack,
      skill: activePrompt.skill,
      title: activePrompt.title,
      criteriaScores: scoresObj,
      overallScore: activeEval.overallScore,
      maxScore: activeEval.maxScore,
      scoreLabel: `${activeEval.scoreLabel} (AI)`,
      wordCount: activePrompt.skill === 'writing' ? wordCount : undefined,
      elapsedSec,
      completedAt: Date.now(),
    });
    setSavedNotice(`Hasil pemeriksaan AI (${activeEval.scoreLabel}) berhasil disimpan ke riwayat.`);
  };

  const computedScore = useMemo(() => {
    if (!activePrompt) return null;
    const criteria = activePrompt.rubricCriteria;
    const scoredCount = criteria.filter((c) => criteriaScores[c.id] !== undefined).length;
    if (scoredCount === 0) return null;

    const avg = criteria.reduce((sum, c) => sum + (criteriaScores[c.id] ?? 0), 0) / scoredCount;

    if (activePrompt.examTrack === 'ielts') {
      const band = Math.min(9.0, Math.round(avg * 2) / 2);
      return {
        complete: scoredCount === criteria.length,
        overallScore: band,
        maxScore: 9.0,
        scoreLabel: `Band ${band.toFixed(1)}`,
      };
    } else {
      const scaled = Math.min(30, Math.round((avg / 5) * 30));
      return {
        complete: scoredCount === criteria.length,
        overallScore: scaled,
        maxScore: 30,
        scoreLabel: `${scaled} / 30`,
      };
    }
  }, [activePrompt, criteriaScores]);

  const handleSaveEvaluation = () => {
    if (!activePrompt || !computedScore || !computedScore.complete) return;
    recordStudioAttempt({
      id: `studio_${Date.now()}`,
      promptId: activePrompt.id,
      examTrack: activePrompt.examTrack,
      skill: activePrompt.skill,
      title: activePrompt.title,
      criteriaScores,
      overallScore: computedScore.overallScore,
      maxScore: computedScore.maxScore,
      scoreLabel: computedScore.scoreLabel,
      wordCount: activePrompt.skill === 'writing' ? wordCount : undefined,
      elapsedSec,
      completedAt: Date.now(),
    });
    setSavedNotice(`Evaluasi mandiri (${computedScore.scoreLabel}) berhasil disimpan ke riwayat.`);
  };

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
          Memuat Studio Menulis & Berbicara (IELTS & TOEFL iBT)...
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

  // TWO-ZONE SANDBOX WORKSPACE WITH AI EVALUATOR
  if (activePrompt) {
    const isWriting = activePrompt.skill === 'writing';
    const minWords = activePrompt.minWords ?? 0;
    const canEvaluate = isWriting
      ? draftText.trim().length >= 15
      : Boolean(recordingBlob) || draftText.trim().length >= 10;

    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              setTimerRunning(false);
              setActivePromptId(null);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Daftar Tugas Studio
          </button>
          <div className="text-xs font-semibold text-slate-500">
            {activePrompt.examTrack.toUpperCase()} · {activePrompt.taskLabel}
          </div>
        </div>

        {/* Left Workspace (7 cols) / Right AI Evaluator + Rubric + Model (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT ZONE */}
          <section className="lg:col-span-7 space-y-4">
            <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#2563EB] dark:text-blue-400">
                  {activePrompt.taskLabel}
                </div>
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {activePrompt.title}
                </h1>
              </div>

              <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                {activePrompt.promptBody}
              </p>

              {activePrompt.readingExcerpt && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Kutipan Bacaan Tugas
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {activePrompt.readingExcerpt}
                  </p>
                </div>
              )}

              {activePrompt.audioBriefText && (
                <div className="p-3.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-bold text-[#2563EB] dark:text-blue-400">
                      Audio Kuliah / Dialog Tugas:
                    </span>{' '}
                    Putar audio singkat sebelum mulai menulis atau berbicara.
                  </div>
                  <button
                    type="button"
                    onClick={() => speakText(activePrompt.audioBriefText!, enAccent, 0.94)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Putar Audio
                  </button>
                </div>
              )}

              {activePrompt.bulletHints.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Panduan Struktur Jawaban
                  </div>
                  <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    {activePrompt.bulletHints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Timer + Editor / Speaking Recorder + Primary AI Check CTA */}
            <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  {activePrompt.prepSec > 0 && (
                    <button
                      type="button"
                      onClick={() => switchTimerPhase('prep')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                        timerPhase === 'prep'
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Persiapan ({activePrompt.prepSec}d)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => switchTimerPhase('response')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      timerPhase === 'response'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {isWriting ? 'Waktu Menulis' : 'Waktu Berbicara'} (
                    {formatClock(activePrompt.durationSec)})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono-num text-lg font-bold text-slate-900 dark:text-white">
                    <Clock className="w-4 h-4 text-[#2563EB]" />
                    {formatClock(remainingSec)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTimerRunning((r) => !r)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
                  >
                    {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {timerRunning ? 'Jeda' : 'Mulai'}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTimerPhase(timerPhase)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                    aria-label="Reset timer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isWriting ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      Lembar Jawaban Esai
                    </span>
                    <span
                      className={`font-mono-num font-bold ${
                        minWords > 0 && wordCount >= minWords
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {wordCount} kata {minWords > 0 ? `/ target minimal ${minWords} kata` : ''}
                    </span>
                  </div>
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={12}
                    placeholder="Tulis jawaban bahasa Inggris Anda di sini, lalu klik tombol Periksa dengan Tutor AI di bawah..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 text-sm text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          Rekam Suara Anda untuk Diperiksa Tutor AI
                        </div>
                        <div className="text-[11px] text-slate-500">
                          AI akan mentranskripsikan rekaman suara Anda lalu menilai kelancaran, tata
                          bahasa, dan kosakata sesuai rubrik resmi.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={isRecording ? stopSelfRecording : startSelfRecording}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                          isRecording
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        }`}
                      >
                        {isRecording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                        {isRecording ? 'Hentikan Rekaman' : 'Rekam Jawaban Suara'}
                      </button>
                    </div>
                    {recordingError && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">{recordingError}</p>
                    )}
                    {recordingUrl && (
                      <div className="pt-1 space-y-1">
                        <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Rekaman siap diperiksa Tutor AI:
                        </div>
                        <audio controls src={recordingUrl} className="w-full h-9" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Catatan Poin atau Transkrip Jawaban Lisan (Opsional jika sudah merekam audio)
                    </label>
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      rows={5}
                      placeholder="Jika tidak memakai mikrofon, Anda bisa menuliskan jawaban lisan Anda di sini untuk tetap diperiksa oleh Tutor AI..."
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3.5 text-sm text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>
                </div>
              )}

              {/* Primary AI Check Button */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-500">
                  Tutor AI memberi skor, koreksi kalimat, dan saran perbaikan dalam Bahasa Indonesia.
                </p>
                <button
                  type="button"
                  disabled={!canEvaluate || aiEvaluating || isRecording}
                  onClick={() => void handleEvaluateWithAi()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs sm:text-sm font-semibold disabled:opacity-45 cursor-pointer"
                >
                  {aiEvaluating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {aiEvaluating
                    ? isWriting
                      ? 'Tutor AI sedang memeriksa esai...'
                      : 'Tutor AI sedang mendengarkan & menilai...'
                    : isWriting
                    ? 'Periksa Esai dengan Tutor AI'
                    : recordingBlob
                    ? 'Periksa Rekaman Suara dengan AI'
                    : 'Periksa Jawaban Speaking dengan AI'}
                </button>
              </div>
            </div>
          </section>

          {/* RIGHT ZONE — AI FEEDBACK / RUBRIC / MODEL */}
          <aside className="lg:col-span-5 bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setRightTab('ai')}
                className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
                  rightTab === 'ai'
                    ? 'border-[#0284C7] text-[#0284C7] dark:text-sky-400'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Pemeriksa AI
              </button>
              <button
                type="button"
                onClick={() => setRightTab('rubric')}
                className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
                  rightTab === 'rubric'
                    ? 'border-[#2563EB] text-[#2563EB] dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Rubrik Mandiri
              </button>
              <button
                type="button"
                onClick={() => setRightTab('model')}
                className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
                  rightTab === 'model'
                    ? 'border-[#2563EB] text-[#2563EB] dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Model ({activePrompt.modelScoreLabel})
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
              {rightTab === 'ai' && (
                <div className="space-y-4">
                  {aiError && (
                    <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                      {aiError}
                    </div>
                  )}

                  {aiEvaluating && (
                    <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0284C7]" />
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {isWriting
                          ? 'Menganalisis struktur, tata bahasa, dan ketepatan kosakata esai Anda...'
                          : 'Mentranskripsikan rekaman suara dan mengevaluasi kelancaran Speaking Anda...'}
                      </div>
                    </div>
                  )}

                  {!aiEvaluating && !writingEval && !speakingEval && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#0284C7]" />
                        Pemeriksa {isWriting ? 'Writing' : 'Speaking'} Berbasis AI
                      </div>
                      <p>
                        {isWriting
                          ? 'Tulis esai Anda di kolom kiri lalu tekan tombol "Periksa Esai dengan Tutor AI". Anda akan mendapatkan estimasi skor resmi, koreksi kalimat demi kalimat dalam Bahasa Indonesia, serta versi peningkatan dari esai Anda sendiri.'
                          : 'Rekam jawaban lisan Anda menggunakan mikrofon (atau ketik transkripnya) di kolom kiri, lalu tekan "Periksa Rekaman Suara dengan AI". AI akan mendengarkan rekaman Anda, menampilkan transkrip, menilai sesuai rubrik resmi, dan memberi saran pelafalan serta kalimat yang lebih alami.'}
                      </p>
                    </div>
                  )}

                  {/* WRITING AI RESULT */}
                  {!aiEvaluating && isWriting && writingEval && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-900 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Estimasi Skor Resmi (AI)
                          </span>
                          <span className="font-mono-num text-2xl font-bold text-[#0284C7] dark:text-sky-300">
                            {writingEval.scoreLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                          {writingEval.summaryId}
                        </p>
                        <button
                          type="button"
                          onClick={handleSaveAiResult}
                          className="w-full mt-1 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold cursor-pointer"
                        >
                          Simpan Skor AI ke Riwayat Belajar
                        </button>
                        {savedNotice && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            {savedNotice}
                          </div>
                        )}
                      </div>

                      {/* Criteria Breakdown */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Rincian Penilaian Rubrik
                        </div>
                        {writingEval.criteriaFeedback.map((cf) => (
                          <div
                            key={cf.criterionId}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {cf.criterionName}
                              </span>
                              <span className="font-mono-num font-bold text-[#0284C7] dark:text-sky-400">
                                {cf.score}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                              {cf.commentId}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Strengths & Improvements */}
                      <div className="grid grid-cols-1 gap-3 text-xs">
                        <div className="p-3.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 space-y-1">
                          <div className="font-bold text-emerald-800 dark:text-emerald-300">
                            Kelebihan Tulisan Anda
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                            {writingEval.strengthsId.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="p-3.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 space-y-1">
                          <div className="font-bold text-amber-800 dark:text-amber-300">
                            Fokus Perbaikan Agar Skor Naik
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                            {writingEval.improvementsId.map((imp, i) => (
                              <li key={i}>{imp}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Sentence Corrections */}
                      {writingEval.corrections.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Koreksi Kalimat Spesifik
                          </div>
                          {writingEval.corrections.map((c, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
                            >
                              <div className="text-rose-600 dark:text-rose-400 line-through">
                                {c.original}
                              </div>
                              <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {c.corrected}
                              </div>
                              <p className="text-slate-600 dark:text-slate-400">{c.reasonId}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Upgraded Version of User Essay */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Versi Peningkatan Esai Anda
                          </span>
                          <button
                            type="button"
                            onClick={() => speakText(writingEval.improvedSample, enAccent, 0.92)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            Dengar
                          </button>
                        </div>
                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                          {writingEval.improvedSample}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Tips Lulus:{' '}
                          </span>
                          {writingEval.examTipsId}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* SPEAKING AI RESULT */}
                  {!aiEvaluating && !isWriting && speakingEval && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-900 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Estimasi Skor Speaking (AI)
                          </span>
                          <span className="font-mono-num text-2xl font-bold text-[#0284C7] dark:text-sky-300">
                            {speakingEval.scoreLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                          {speakingEval.summaryId}
                        </p>
                        <button
                          type="button"
                          onClick={handleSaveAiResult}
                          className="w-full mt-1 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold cursor-pointer"
                        >
                          Simpan Skor AI ke Riwayat Belajar
                        </button>
                        {savedNotice && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            {savedNotice}
                          </div>
                        )}
                      </div>

                      <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                        <div className="font-bold text-slate-700 dark:text-slate-200">
                          Transkrip yang Terdengar oleh AI:
                        </div>
                        <p className="italic text-slate-700 dark:text-slate-300 leading-relaxed">
                          “{speakingEval.transcript}”
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Rincian Penilaian Rubrik
                        </div>
                        {speakingEval.criteriaFeedback.map((cf) => (
                          <div
                            key={cf.criterionId}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {cf.criterionName}
                              </span>
                              <span className="font-mono-num font-bold text-[#0284C7] dark:text-sky-400">
                                {cf.score}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                              {cf.commentId}
                            </p>
                          </div>
                        ))}
                      </div>

                      {speakingEval.pronunciationAndFluencyId.length > 0 && (
                        <div className="p-3.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 space-y-1 text-xs">
                          <div className="font-bold text-amber-800 dark:text-amber-300">
                            Catatan Kelancaran & Pengucapan
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                            {speakingEval.pronunciationAndFluencyId.map((note, i) => (
                              <li key={i}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {speakingEval.grammarAndVocabFixes.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Perbaikan Ungkapan & Tata Bahasa
                          </div>
                          {speakingEval.grammarAndVocabFixes.map((fix, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
                            >
                              <div className="text-rose-600 dark:text-rose-400 line-through">
                                {fix.original}
                              </div>
                              <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {fix.corrected}
                              </div>
                              <p className="text-slate-600 dark:text-slate-400">{fix.reasonId}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Contoh Jawaban Lisan Alami (Skor Tinggi)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              speakText(speakingEval.naturalPhrasingSample, enAccent, 0.92)
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            Dengarkan Contoh
                          </button>
                        </div>
                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                          {speakingEval.naturalPhrasingSample}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Saran Percaya Diri:{' '}
                          </span>
                          {speakingEval.confidenceTipId}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {rightTab === 'rubric' && (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Nilai jawaban Anda sendiri berdasarkan kriteria resmi{' '}
                    {activePrompt.examTrack === 'ielts' ? 'IELTS Band' : 'TOEFL iBT'}. Anda juga
                    bisa menggunakan tab <strong>Pemeriksa AI</strong> untuk penilaian otomatis.
                  </p>

                  <div className="space-y-4">
                    {activePrompt.rubricCriteria.map((criterion) => {
                      const chosen = criteriaScores[criterion.id];
                      return (
                        <div
                          key={criterion.id}
                          className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5"
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              {criterion.name}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {criterion.description}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            {criterion.levels.map((lvl) => {
                              const active = chosen === lvl.score;
                              return (
                                <button
                                  key={lvl.score}
                                  type="button"
                                  onClick={() =>
                                    setCriteriaScores((prev) => ({
                                      ...prev,
                                      [criterion.id]: lvl.score,
                                    }))
                                  }
                                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                                    active
                                      ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30 text-slate-900 dark:text-white'
                                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                                  }`}
                                >
                                  <div className="font-bold font-mono-num">{lvl.label}</div>
                                  <div className="text-[11px] mt-0.5 leading-snug">
                                    {lvl.descriptor}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Estimasi Skor Mandiri
                      </span>
                      <span className="font-mono-num text-xl font-bold text-[#2563EB] dark:text-blue-400">
                        {computedScore ? computedScore.scoreLabel : '—'}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!computedScore?.complete}
                      onClick={handleSaveEvaluation}
                      className="w-full py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      {computedScore?.complete
                        ? 'Simpan Evaluasi ke Riwayat'
                        : 'Pilih Skor untuk Semua Kriteria'}
                    </button>
                    {savedNotice && (
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        {savedNotice}
                      </div>
                    )}
                  </div>
                </>
              )}

              {rightTab === 'model' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#2563EB] dark:text-blue-400">
                      Referensi {activePrompt.modelScoreLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => speakText(activePrompt.modelAnswer, enAccent, 0.92)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Dengar Model
                    </button>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                    {activePrompt.modelAnswer}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Frasa & Ekspresi Nilai Tinggi
                    </div>
                    {activePrompt.keyExpressions.map((exp) => (
                      <div
                        key={exp.phrase}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-slate-900 dark:text-white">
                            {exp.phrase}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {exp.noteId}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => speakText(exp.phrase, enAccent, 0.94)}
                          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0"
                          aria-label={`Putar ${exp.phrase}`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    );
  }

  // STUDIO TASK CATALOG
  const history = state.langStudioHistory ?? [];

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
            Kembali ke Beranda Bahasa Inggris
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Studio Menulis & Berbicara AI (IELTS · TOEFL iBT)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Latihan terukur dengan timer resmi, penghitung kata, perekam suara, pemeriksaan otomatis
            oleh Tutor AI berbahasa Indonesia, model jawaban Band 8.0 / 28+, dan rubrik resmi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value as 'all' | 'ielts' | 'toefl-ibt')}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold"
          >
            <option value="all">Semua Ujian</option>
            <option value="ielts">IELTS Academic</option>
            <option value="toefl-ibt">TOEFL iBT</option>
          </select>

          <select
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value as 'all' | 'writing' | 'speaking')}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold"
          >
            <option value="all">Menulis & Berbicara</option>
            <option value="writing">Menulis (Writing) Saja</option>
            <option value="speaking">Berbicara (Speaking) Saja</option>
          </select>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPrompts.map((prompt) => {
          const latest = history.find((h) => h.promptId === prompt.id);
          return (
            <div
              key={prompt.id}
              className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[#2563EB] dark:text-blue-400">
                  {prompt.examTrack.toUpperCase()} ·{' '}
                  {prompt.skill === 'writing' ? 'Menulis (Writing)' : 'Berbicara (Speaking)'} ·{' '}
                  {prompt.taskLabel}
                </div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {prompt.title}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                  {prompt.promptBody}
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono-num">
                    {prompt.prepSec > 0 ? `Persiapan ${prompt.prepSec}d · ` : ''}
                    {Math.round(prompt.durationSec / 60) >= 1
                      ? `${Math.round(prompt.durationSec / 60)} menit`
                      : `${prompt.durationSec} detik`}
                    {prompt.minWords ? ` · min ${prompt.minWords} kata` : ''}
                  </span>
                  {latest && (
                    <span className="font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                      {latest.scoreLabel}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openPrompt(prompt)}
                  className="w-full py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
                >
                  Buka Studio & Pemeriksa AI
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {history.length > 0 && (
        <section className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Riwayat Evaluasi Writing & Speaking Terbaru
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.slice(0, 6).map((h) => (
              <div
                key={h.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">{h.title}</span>
                  <span className="text-slate-500 ml-2">
                    {h.examTrack.toUpperCase()} · {h.skill === 'writing' ? 'Menulis' : 'Berbicara'}
                    {h.wordCount ? ` · ${h.wordCount} kata` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono-num">
                  <span className="font-bold text-[#2563EB] dark:text-blue-400">
                    {h.scoreLabel}
                  </span>
                  <span className="text-slate-400">
                    {new Date(h.completedAt).toLocaleDateString('id-ID')}
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
