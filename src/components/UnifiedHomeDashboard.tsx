import React, { useMemo } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Flame,
  GraduationCap,
  Headphones,
  Layers,
  PenTool,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLevelMeta } from '../data/curriculum';
import {
  FUTURE_LANGUAGE_SLOTS,
  LANGUAGE_REGISTRY,
} from '../data/languageRegistry';
import type { ExamTrackId, SupportedLanguageId } from '../types/language';
import { getSrsPolicy, resolveSrsMode } from '../utils/srs';
import { openAiTutorWithPrompt } from './AiTutorDrawer';

export const UnifiedHomeDashboard: React.FC = () => {
  const {
    state,
    now,
    availableReviews,
    lessonQueue,
    setActiveLanguage,
    setActiveExamTrack,
    setSettingsOpen,
    userProfile,
  } = useApp();

  const srsMode = resolveSrsMode(state.settings);
  const srsPolicy = getSrsPolicy(srsMode);
  const jaMeta = getLevelMeta(state.currentLevel);

  const stats = useMemo(() => {
    let jaLearned = 0;
    let jaBurned = 0;
    for (const p of Object.values(state.progress)) {
      if (p.srsStage !== null && p.srsStage >= 1) jaLearned += 1;
      if (p.srsStage === 9) jaBurned += 1;
    }

    let enLearned = 0;
    let enDue = 0;
    let arLearned = 0;
    let arDue = 0;

    for (const p of Object.values(state.langSrsProgress ?? {})) {
      if (p.srsStage >= 1) {
        if (p.lang === 'en') enLearned += 1;
        if (p.lang === 'ar') arLearned += 1;
      }
      const isDue =
        !state.settings.vacationMode &&
        p.srsStage >= 1 &&
        p.srsStage <= 8 &&
        p.nextReviewAt !== null &&
        p.nextReviewAt <= now;
      if (isDue) {
        if (p.lang === 'en') enDue += 1;
        if (p.lang === 'ar') arDue += 1;
      }
    }

    const totalDue = availableReviews.length + enDue + arDue;
    const totalLearned = jaLearned + enLearned + arLearned;

    const latestByTrack: Partial<Record<ExamTrackId, string>> = {};
    if (state.mockExamHistory && state.mockExamHistory.length > 0) {
      const latestJlpt = state.mockExamHistory[0];
      latestByTrack.jlpt = `${latestJlpt.jlpt} · ${latestJlpt.totalScore}/180`;
    }
    for (const res of state.langMockExamHistory ?? []) {
      if (!latestByTrack[res.examTrack]) {
        latestByTrack[res.examTrack] = res.scaledLabel;
      }
    }

    return {
      jaLearned,
      jaBurned,
      jaDue: availableReviews.length,
      jaLessons: lessonQueue.length,
      enLearned,
      enDue,
      arLearned,
      arDue,
      totalDue,
      totalLearned,
      latestByTrack,
    };
  }, [
    state.progress,
    state.langSrsProgress,
    state.mockExamHistory,
    state.langMockExamHistory,
    state.settings.vacationMode,
    availableReviews.length,
    lessonQueue.length,
    now,
  ]);

  const launchSimulator = (lang: SupportedLanguageId, track: ExamTrackId) => {
    setActiveExamTrack(track);
    if (lang === 'ja') {
      setActiveLanguage('ja', 'mock-exam');
    } else {
      setActiveLanguage(lang, 'lang-exam');
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
      {/* Editorial Hero Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Beranda Gabungan · Mode SRS {srsPolicy.shortLabel} · 3 Bahasa Aktif
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {userProfile?.displayName
              ? `Selamat belajar, ${userProfile.displayName}`
              : 'Platform Belajar Bahasa & Sertifikasi Global'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            Satu mesin Spaced Repetition (SRS) dan simulator ujian terpadu untuk{' '}
            <strong className="text-slate-800 dark:text-slate-200">JLPT</strong>,{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              TOEFL ITP / iBT, IELTS, TOEIC
            </strong>
            , dan{' '}
            <strong className="text-slate-800 dark:text-slate-200">TOAFL</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => openAiTutorWithPrompt(undefined, 'all')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Tanya Tutor AI
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Pengaturan &amp; Audio
          </button>
        </div>
      </section>

      {/* Cross-Language Daily KPI Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Review SRS Jatuh Tempo
          </div>
          <div className="font-mono-num text-2xl sm:text-3xl font-bold text-[#0284C7] mt-1">
            {stats.totalDue}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
            JA {stats.jaDue} · EN {stats.enDue} · AR {stats.arDue}
          </div>
        </div>

        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Total Item Dipelajari
          </div>
          <div className="font-mono-num text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
            {stats.totalLearned.toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
            Lintas Jepang, Inggris &amp; Arab
          </div>
        </div>

        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Streak Belajar Gabungan
          </div>
          <div className="font-mono-num text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1 flex items-center gap-1.5">
            <Flame className="w-5 h-5 text-amber-500 shrink-0" />
            {state.streakDays} hari
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
            {state.totalReviewsDone.toLocaleString('id-ID')} review selesai
          </div>
        </div>

        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Simulasi Selesai
          </div>
          <div className="font-mono-num text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
            {(state.mockExamHistory?.length ?? 0) +
              (state.langMockExamHistory?.length ?? 0)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            6 format sertifikasi resmi
          </div>
        </div>
      </section>

      {/* Active Language Workspaces */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Jalur Bahasa Aktif
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Pilih workspace untuk fokus belajar penuh
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {LANGUAGE_REGISTRY.map((lang) => {
            const langId = lang.id as SupportedLanguageId;
            const isJa = langId === 'ja';
            const isEn = langId === 'en';
            const isAr = langId === 'ar';

            const learned = isJa
              ? stats.jaLearned
              : isEn
              ? stats.enLearned
              : stats.arLearned;
            const due = isJa ? stats.jaDue : isEn ? stats.enDue : stats.arDue;

            return (
              <article
                key={lang.id}
                className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-5"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`text-xs font-semibold ${lang.accentTextClass}`}>
                        {lang.shortCode} · {lang.examTracks.map((t) => t.shortName).join(' · ')}
                      </div>
                      <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                        {lang.name}
                      </h3>
                    </div>
                    <span
                      dir={lang.direction}
                      className={`text-xl font-bold text-slate-400 dark:text-slate-500 shrink-0 ${
                        isAr ? 'font-ar' : isJa ? 'font-jp' : 'font-display'
                      }`}
                    >
                      {lang.nativeLabel}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {lang.summary}
                  </p>

                  {/* Metrics line (zero-pill tabular typography) */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {isJa ? 'Tingkat JLPT Aktif' : 'Item SRS Aktif'}
                      </div>
                      <div className="font-mono-num text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        {isJa
                          ? `${jaMeta.jlpt} · Bab ${jaMeta.unitInTier}/${jaMeta.totalUnitsInTier}`
                          : `${learned} item`}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {isJa ? 'Antrean Review / Lesson' : 'Review Jatuh Tempo'}
                      </div>
                      <div className="font-mono-num text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        {isJa ? `${due} · ${stats.jaLessons}` : `${due} siap`}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveLanguage(langId, isJa ? 'dashboard' : 'lang-home')
                    }
                    style={{ backgroundColor: lang.accentHex }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-95 transition-opacity cursor-pointer"
                  >
                    Buka Workspace {lang.name.replace('Bahasa ', '')}
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {/* Quick module shortcuts */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-1">
                    {isJa ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('ja', 'grammar')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Grammar
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('ja', 'reading')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Dokkai
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('ja', 'listening')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Chōkai
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('ja', 'mock-exam')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Mogi Shiken
                        </button>
                      </>
                    ) : isEn ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('en', 'lang-vocab')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Vocab SRS
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('en', 'lang-grammar')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Grammar
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('en', 'lang-studio')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Writing/Speaking
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('en', 'lang-exam')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Simulasi
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('ar', 'lang-vocab')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Mufradat SRS
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('ar', 'lang-grammar')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Qawaid
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('ar', 'lang-reading')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Qira&apos;ah RTL
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage('ar', 'lang-exam')}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Simulasi TOAFL
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Direct Official Certification Simulator Launcher */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Simulasi Ujian Sertifikasi Resmi
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Skala penilaian &amp; timer mengikuti format resmi
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LANGUAGE_REGISTRY.flatMap((lang) =>
            lang.examTracks.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() =>
                  launchSimulator(lang.id as SupportedLanguageId, track.id)
                }
                className="text-left bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 p-5 transition-colors flex flex-col justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold ${lang.accentTextClass}`}>
                      {lang.name}
                    </span>
                    <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                      Skala {track.scoreRangeLabel}
                    </span>
                  </div>
                  <div className="font-display text-base font-bold text-slate-900 dark:text-white">
                    {track.name}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {track.sections.join(' · ')}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-mono-num">
                    {stats.latestByTrack[track.id]
                      ? `Terakhir: ${stats.latestByTrack[track.id]}`
                      : 'Belum pernah diuji'}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1">
                    Mulai <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Core Capabilities Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setActiveLanguage('en', 'lang-studio')}
          className="text-left bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 p-4 flex items-start gap-3 transition-colors cursor-pointer"
        >
          <PenTool className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
          <div>
            <div className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Studio AI Writing &amp; Speaking
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pemeriksa esai &amp; rekaman suara otomatis oleh AI dengan skor resmi dan koreksi Bahasa Indonesia.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveLanguage('ar', 'lang-reading')}
          className="text-left bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 p-4 flex items-start gap-3 transition-colors cursor-pointer"
        >
          <BookOpen className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" />
          <div>
            <div className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Qira&apos;ah RTL &amp; Sakelar Harakat
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Beralih instan antara Arab Fusha berharakat penuh dan teks gundul ujian TOAFL.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveLanguage('en', 'lang-listening')}
          className="text-left bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 p-4 flex items-start gap-3 transition-colors cursor-pointer"
        >
          <Headphones className="w-5 h-5 text-[#0284C7] shrink-0 mt-0.5" />
          <div>
            <div className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Audio Multi-Aksen &amp; Fusha
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              TTS multi-suara untuk Jepang, Inggris US/UK, dan Arab Fusha di web &amp; Android.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveLanguage('ja', 'levels')}
          className="text-left bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 p-4 flex items-start gap-3 transition-colors cursor-pointer"
        >
          <GraduationCap className="w-5 h-5 text-[#E11D48] shrink-0 mt-0.5" />
          <div>
            <div className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Kurikulum JLPT N5–N1 Lengkap
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Jalur terstruktur N5 hingga N1 untuk Radikal, Kanji, Kosakata, Tata Bahasa, Membaca &amp; Mendengar.
            </p>
          </div>
        </button>
      </section>

      {/* Extensible Language Registry Roadmap */}
      <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Arsitektur Registri Bahasa Terbuka
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Slot ekstensi siap pakai untuk penambahan bahasa berikutnya
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FUTURE_LANGUAGE_SLOTS.map((slot) => (
            <div
              key={slot.id}
              className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-bold text-slate-800 dark:text-slate-200">
                  {slot.name}
                </span>
                <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                  {slot.nativeLabel} · {slot.targetExam}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {slot.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Multi-Language Exam History if available */}
      {(state.langMockExamHistory?.length ?? 0) > 0 && (
        <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#0284C7]" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Riwayat Simulasi Terbaru (Inggris &amp; Arab)
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(state.langMockExamHistory ?? []).slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
              >
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {item.examName}{' '}
                    <span className="font-normal text-xs text-slate-500 dark:text-slate-400">
                      · {new Date(item.completedAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {item.benchmarkLabel} · Benar {item.totalCorrect}/{item.totalQuestions}
                  </div>
                </div>
                <div className="font-mono-num text-base font-bold text-slate-900 dark:text-white">
                  {item.scaledLabel}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
};
