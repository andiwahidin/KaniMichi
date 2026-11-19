import React, { useMemo, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FastForward,
  Flame,
  LogIn,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  User as UserIcon,
  X,
} from 'lucide-react';
import { getLevelMeta, MAX_LEVEL } from '../data/curriculum';
import { useApp } from '../context/AppContext';
import { CurriculumItem } from '../types/curriculum';
import {
  buildReviewForecast,
  formatRelativeTime,
  getAccuracyPercent,
  getItemTypeLabel,
  getSrsDistribution,
  getTodayDateStr,
  SRS_STAGE_NAMES,
} from '../utils/srs';

export const Dashboard: React.FC = () => {
  const {
    dataset,
    state,
    now,
    lessonQueue,
    availableReviews,
    setActiveView,
    openItemDetail,
    setSettingsOpen,
    startExtraStudy,
    toggleVacationMode,
    fastForwardTime,
    dismissLevelUpBanner,
    cloudUser,
    userProfile,
    isAdmin,
    openAuthModal,
    announcements,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDay, setExpandedDay] = useState<string>(() => getTodayDateStr(now));
  const [dismissedAnnId, setDismissedAnnId] = useState<string | null>(null);
  const latestAnnouncement = announcements.find((a) => a.id !== dismissedAnnId) ?? null;

  const levelMeta = getLevelMeta(state.currentLevel);

  const srsDist = useMemo(() => getSrsDistribution(state, dataset), [state, dataset]);
  const forecast = useMemo(
    () => buildReviewForecast(state, dataset, now),
    [state, dataset, now]
  );

  // Level Progress metrics (Radicals & Kanji of current level)
  const levelItems = dataset.byLevel[state.currentLevel] ?? [];
  const levelRadicals = useMemo(
    () => levelItems.filter((i) => i.type === 'radical'),
    [levelItems]
  );
  const levelKanji = useMemo(
    () => levelItems.filter((i) => i.type === 'kanji'),
    [levelItems]
  );

  const guruRadicalsCount = levelRadicals.filter(
    (r) => (state.progress[r.id]?.srsStage ?? -1) >= 5
  ).length;
  const guruKanjiCount = levelKanji.filter(
    (k) => (state.progress[k.id]?.srsStage ?? -1) >= 5
  ).length;
  const requiredKanjiForLevelUp = Math.ceil(levelKanji.length * 0.9);

  // Next scheduled review timestamp if 0 available right now
  const nextScheduledReview = useMemo(() => {
    let soonest: number | null = null;
    for (const p of Object.values(state.progress)) {
      if (p.nextReviewAt && p.nextReviewAt > now) {
        if (soonest === null || p.nextReviewAt < soonest) {
          soonest = p.nextReviewAt;
        }
      }
    }
    return soonest;
  }, [state.progress, now]);

  // Critical condition items (accuracy < 85% or recently missed)
  const criticalItems = useMemo(() => {
    const list: CurriculumItem[] = [];
    for (const [id, p] of Object.entries(state.progress)) {
      if (p.srsStage === null || p.srsStage === 0) continue;
      const acc = getAccuracyPercent(p);
      if ((acc !== null && acc < 85) || p.lastIncorrectAt !== null) {
        const item = dataset.byId[id];
        if (item) list.push(item);
      }
    }
    return list
      .sort((a, b) => {
        const accA = getAccuracyPercent(state.progress[a.id]) ?? 100;
        const accB = getAccuracyPercent(state.progress[b.id]) ?? 100;
        return accA - accB;
      })
      .slice(0, 6);
  }, [state.progress, dataset]);

  // Recently unlocked items
  const recentlyUnlocked = useMemo(() => {
    const list: CurriculumItem[] = [];
    for (const [id, p] of Object.entries(state.progress)) {
      if (p.unlockedAt !== null) {
        const item = dataset.byId[id];
        if (item) list.push(item);
      }
    }
    return list
      .sort(
        (a, b) =>
          (state.progress[b.id]?.unlockedAt ?? 0) -
          (state.progress[a.id]?.unlockedAt ?? 0)
      )
      .slice(0, 10);
  }, [state.progress, dataset]);

  // Extra study availability counts
  const recentMistakesCount = useMemo(
    () =>
      Object.values(state.progress).filter((p) => p.lastIncorrectAt !== null).length,
    [state.progress]
  );
  const recentlyLearnedCount = useMemo(
    () =>
      Object.values(state.progress).filter(
        (p) => p.srsStage !== null && p.srsStage >= 1
      ).length,
    [state.progress]
  );
  const burnedCount = srsDist.burned.total;

  // Instant search across all 9,088 items
  const searchResults = useMemo<CurriculumItem[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches: CurriculumItem[] = [];
    for (const item of dataset.items) {
      if (
        item.characters.includes(q) ||
        item.primaryMeaning.toLowerCase().includes(q) ||
        item.acceptedMeanings.some((m) => m.includes(q)) ||
        item.onyomi?.some((r) => r.includes(q)) ||
        item.kunyomi?.some((r) => r.includes(q)) ||
        item.readings?.some((r) => r.includes(q))
      ) {
        matches.push(item);
        if (matches.length >= 10) break;
      }
    }
    return matches;
  }, [searchQuery, dataset]);

  // Daily goal progress
  const todayStr = getTodayDateStr(now);
  const todayStats = state.history.find((h) => h.date === todayStr) ?? {
    date: todayStr,
    reviewsCompleted: 0,
    correctCount: 0,
    lessonsCompleted: 0,
  };

  // Build 7-day activity chart
  const last7Days = useMemo(() => {
    const res: { label: string; count: number; isToday: boolean }[] = [];
    const dayLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    for (let offset = 6; offset >= 0; offset--) {
      const ts = now - offset * 24 * 60 * 60 * 1000;
      const d = new Date(ts);
      const key = getTodayDateStr(ts);
      const entry = state.history.find((h) => h.date === key);
      res.push({
        label: dayLabels[d.getDay()],
        count: entry?.reviewsCompleted ?? 0,
        isToday: offset === 0,
      });
    }
    return res;
  }, [state.history, now]);

  const maxDailyReviews = Math.max(10, ...last7Days.map((d) => d.count));

  const renderProgressPips = (stage: number | null) => {
    const filled = stage === null ? 0 : Math.min(5, stage);
    return (
      <div className="flex items-center gap-0.5 mt-1.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full ${
              filled >= step
                ? filled >= 5
                  ? 'bg-[#7C3AED]'
                  : 'bg-[#DB2777]'
                : 'bg-slate-200 dark:bg-slate-700'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
      {/* Workspace Utility Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 font-mono-num">
            <span>Level {state.currentLevel} / {MAX_LEVEL}</span>
            <span aria-hidden="true">·</span>
            <span className="font-sans">{levelMeta.tier}</span>
            <span aria-hidden="true">·</span>
            <span>
              {dataset.counts.radicals.toLocaleString('id-ID')} Radikal · {dataset.counts.kanji.toLocaleString('id-ID')} Kanji · {dataset.counts.vocabulary.toLocaleString('id-ID')} Kosakata
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
            Dasbor Belajar Harian
          </h1>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Global Instant Search across all 9,088 items */}
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari 9.000+ kanji, arti, hiragana..."
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0284C7]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Hapus pencarian"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      openItemDetail(item.id);
                      setSearchQuery('');
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-left border-b last:border-b-0 border-slate-100 dark:border-slate-800 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`font-jp font-bold text-white text-sm px-2 py-0.5 rounded shrink-0 ${
                          item.type === 'radical'
                            ? 'bg-[#0284C7]'
                            : item.type === 'kanji'
                            ? 'bg-[#DB2777]'
                            : 'bg-[#7C3AED]'
                        }`}
                      >
                        {item.characters}
                      </span>
                      <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {item.primaryMeaning}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 font-mono-num">
                      Lv.{item.level} · {getItemTypeLabel(item.type)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {cloudUser ? (
            <button
              type="button"
              onClick={() => setActiveView(isAdmin ? 'admin' : 'profile')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                isAdmin
                  ? 'border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#7C3AED] dark:text-violet-300 hover:bg-[#7C3AED]/15'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              {isAdmin ? (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Panel Admin
                </>
              ) : (
                <>
                  <UserIcon className="w-4 h-4" />
                  {userProfile?.displayName || 'Profil'}
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              Masuk
            </button>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Pengaturan</span>
          </button>
        </div>
      </div>

      {/* Conditional Banners */}
      {latestAnnouncement && (
        <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Bell className="w-4 h-4 text-[#0284C7] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-slate-900 dark:text-white">
                {latestAnnouncement.title}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                {latestAnnouncement.body}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissedAnnId(latestAnnouncement.id)}
            aria-label="Tutup pengumuman"
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {state.levelUpNotification && (
        <div className="p-4 sm:p-5 rounded-xl bg-[#0284C7] text-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 shrink-0" />
            <div>
              <div className="font-display font-bold text-base">
                Naik ke Level {state.levelUpNotification}!
              </div>
              <div className="text-xs text-white/90">
                Radikal baru di Level {state.levelUpNotification} telah terbuka di antrean Pelajaran.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissLevelUpBanner}
            className="px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {state.settings.vacationMode && (
        <div className="p-4 sm:p-5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-display font-bold text-sm text-amber-900 dark:text-amber-200">
              Mode Libur (Vacation Mode) Sedang Aktif
            </div>
            <div className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Seluruh jadwal review SRS sedang dibekukan. Nonaktifkan saat kamu siap belajar kembali.
            </div>
          </div>
          <button
            type="button"
            onClick={toggleVacationMode}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
          >
            Lanjutkan Jadwal SRS
          </button>
        </div>
      )}

      {/* FOCAL ANCHOR ROW: Lessons + Daily Reviews */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        {/* Lessons Card */}
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[#DB2777]">
                Pelajaran Baru · Batch {state.settings.lessonBatchSize} Item
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Pelajaran (Lessons)
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {lessonQueue.length > 0
                  ? 'Pelajari mnemonik radikal, kanji, dan kosakata baru lalu ikuti kuis singkat.'
                  : 'Semua materi terbuka sudah dipelajari. Naikkan item ke Guru untuk membuka materi baru.'}
              </p>
            </div>
            <div className="font-mono-num text-4xl font-bold text-slate-900 dark:text-white shrink-0">
              {lessonQueue.length}
            </div>
          </div>

          {lessonQueue.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 dark:text-slate-400">Berikutnya:</span>
              {lessonQueue.slice(0, state.settings.lessonBatchSize).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItemDetail(item.id)}
                  className={`font-jp text-sm font-bold text-white px-2 py-0.5 rounded cursor-pointer hover:opacity-90 ${
                    item.type === 'radical'
                      ? 'bg-[#0284C7]'
                      : item.type === 'kanji'
                      ? 'bg-[#DB2777]'
                      : 'bg-[#7C3AED]'
                  }`}
                >
                  {item.characters}
                </button>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Promosi otomatis ke Apprentice I (4 jam)
            </span>
            <button
              type="button"
              disabled={lessonQueue.length === 0}
              onClick={() => setActiveView('lesson')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#DB2777] hover:bg-[#BE185D] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <BookOpen className="w-4 h-4" />
              Mulai Pelajaran
            </button>
          </div>
        </div>

        {/* Daily Reviews Card */}
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[#0284C7]">
                Spaced Repetition · Review Harian
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Review Harian (Reviews)
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {availableReviews.length > 0
                  ? 'Uji kembali arti dan bacaan Hiragana tepat sebelum kurva lupa bekerja.'
                  : nextScheduledReview
                  ? `Review berikutnya tersedia ${formatRelativeTime(nextScheduledReview, now)}.`
                  : 'Selesaikan Pelajaran terlebih dahulu untuk menjadwalkan review SRS.'}
              </p>
            </div>
            <div className="font-mono-num text-4xl font-bold text-[#0284C7] shrink-0">
              {availableReviews.length}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            <span>
              Hari ini: <strong className="text-slate-900 dark:text-white">{todayStats.reviewsCompleted}</strong> / {state.settings.dailyReviewGoal} review
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              Streak <strong className="text-slate-900 dark:text-white">{state.streakDays} hari</strong>
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
            {availableReviews.length === 0 && nextScheduledReview ? (
              <button
                type="button"
                onClick={() => fastForwardTime(4)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                Majukan waktu +4 jam
              </button>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Mendukung IME Romaji → ひらがな otomatis
              </span>
            )}
            <button
              type="button"
              disabled={availableReviews.length === 0}
              onClick={() => setActiveView('review')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-current" />
              Mulai Review
            </button>
          </div>
        </div>
      </section>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* LEVEL PROGRESS CARD */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Progres Level {state.currentLevel} — {levelMeta.tier}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {state.currentLevel < MAX_LEVEL
                    ? `Capai tahap Guru pada minimal 90% Kanji (${requiredKanjiForLevelUp} dari ${levelKanji.length} Kanji) untuk naik ke Level ${state.currentLevel + 1}.`
                    : 'Kamu berada di Level 60 — level tertinggi KaniMichi!'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('levels')}
                className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap cursor-pointer"
              >
                Jelajahi 60 Level →
              </button>
            </div>

            {/* Dual Progress Bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Radikal Guru
                  </span>
                  <span className="font-mono-num text-slate-600 dark:text-slate-400">
                    {guruRadicalsCount} / {levelRadicals.length}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0284C7] rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        levelRadicals.length
                          ? Math.round((guruRadicalsCount / levelRadicals.length) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Kanji Guru (Syarat Naik Level)
                  </span>
                  <span className="font-mono-num text-slate-600 dark:text-slate-400">
                    {guruKanjiCount} / {levelKanji.length} (target {requiredKanjiForLevelUp})
                  </span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#DB2777] rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        levelKanji.length
                          ? Math.round((guruKanjiCount / levelKanji.length) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Interactive Radical & Kanji Tiles */}
            <div className="space-y-5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {levelRadicals.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
                    Radikal Level {state.currentLevel} ({levelRadicals.length})
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {levelRadicals.map((rad) => {
                      const stage = state.progress[rad.id]?.srsStage ?? null;
                      const locked = stage === null;
                      return (
                        <button
                          key={rad.id}
                          type="button"
                          onClick={() => openItemDetail(rad.id)}
                          title={`${rad.characters} — ${rad.primaryMeaning} (${
                            stage === null ? 'Terkunci' : SRS_STAGE_NAMES[stage]
                          })`}
                          className={`p-2 rounded-lg border text-center transition-colors cursor-pointer ${
                            locked
                              ? 'border-dashed border-slate-300 dark:border-slate-700 opacity-50'
                              : 'border-slate-200 dark:border-slate-800 hover:border-[#0284C7] bg-slate-50/70 dark:bg-slate-800/40'
                          }`}
                        >
                          <div className="font-jp text-xl font-bold text-white bg-[#0284C7] rounded py-1.5 leading-none">
                            {rad.characters}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-1">
                            {rad.primaryMeaning}
                          </div>
                          {renderProgressPips(stage)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
                  Kanji Level {state.currentLevel} ({levelKanji.length})
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-2">
                  {levelKanji.map((kanji) => {
                    const stage = state.progress[kanji.id]?.srsStage ?? null;
                    const locked = stage === null;
                    return (
                      <button
                        key={kanji.id}
                        type="button"
                        onClick={() => openItemDetail(kanji.id)}
                        title={`${kanji.characters} — ${kanji.primaryMeaning} (${
                          stage === null
                            ? 'Terkunci — Guru radikalnya dulu'
                            : SRS_STAGE_NAMES[stage]
                        })`}
                        className={`p-2 rounded-lg border text-center transition-colors cursor-pointer ${
                          locked
                            ? 'border-dashed border-slate-300 dark:border-slate-700 opacity-55'
                            : 'border-slate-200 dark:border-slate-800 hover:border-[#DB2777] bg-slate-50/70 dark:bg-slate-800/40'
                        }`}
                      >
                        <div
                          className={`font-jp text-xl font-bold text-white rounded py-1.5 leading-none ${
                            locked ? 'bg-slate-400 dark:bg-slate-700' : 'bg-[#DB2777]'
                          }`}
                        >
                          {kanji.characters}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-1">
                          {kanji.primaryMeaning}
                        </div>
                        {renderProgressPips(stage)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* SRS STAGE DISTRIBUTION MATRIX */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Sebaran Tahap SRS
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Apprentice → Guru → Master → Enlightened → Burned
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(
                [
                  { key: 'apprentice', label: 'Apprentice', color: 'text-[#DB2777]', bar: 'bg-[#DB2777]' },
                  { key: 'guru', label: 'Guru', color: 'text-[#7C3AED]', bar: 'bg-[#7C3AED]' },
                  { key: 'master', label: 'Master', color: 'text-[#2563EB]', bar: 'bg-[#2563EB]' },
                  { key: 'enlightened', label: 'Enlightened', color: 'text-[#0284C7]', bar: 'bg-[#0284C7]' },
                  { key: 'burned', label: 'Burned', color: 'text-slate-700 dark:text-slate-300', bar: 'bg-slate-600' },
                ] as const
              ).map((tier) => {
                const stats = srsDist[tier.key];
                return (
                  <div
                    key={tier.key}
                    className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                  >
                    <div className={`h-1 w-8 rounded-full ${tier.bar} mb-2.5`} />
                    <div className={`text-xs font-semibold ${tier.color}`}>
                      {tier.label}
                    </div>
                    <div className="font-mono-num text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                      {stats.total}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num mt-1.5">
                      R:{stats.radical} · K:{stats.kanji} · V:{stats.vocabulary}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* EXTRA STUDY + CRITICAL & RECENTLY UNLOCKED */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Latihan Tambahan (Extra Study)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Berlatih kapan saja tanpa memengaruhi jadwal SRS utamamu.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <button
                  type="button"
                  disabled={recentMistakesCount === 0}
                  onClick={() => startExtraStudy('recent-mistakes')}
                  className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-left transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      Kesalahan Terakhir
                    </span>
                    <span className="font-mono-num text-xs font-bold text-rose-600">
                      {recentMistakesCount}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Ulangi item yang baru salah
                  </div>
                </button>

                <button
                  type="button"
                  disabled={recentlyLearnedCount === 0}
                  onClick={() => startExtraStudy('recently-learned')}
                  className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-left transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      Baru Dipelajari
                    </span>
                    <span className="font-mono-num text-xs font-bold text-[#0284C7]">
                      {Math.min(12, recentlyLearnedCount)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Perkuat memori jangka pendek
                  </div>
                </button>

                <button
                  type="button"
                  disabled={burnedCount === 0}
                  onClick={() => startExtraStudy('burned-items')}
                  className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-left transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      Item Burned
                    </span>
                    <span className="font-mono-num text-xs font-bold text-slate-600 dark:text-slate-300">
                      {burnedCount}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Segarkan ingatan item tamat
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                  Item Rawan (Perlu Perhatian)
                </h3>
                {criticalItems.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Bagus! Belum ada item dengan tingkat kesalahan tinggi.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {criticalItems.map((item) => {
                      const acc = getAccuracyPercent(state.progress[item.id]);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openItemDetail(item.id)}
                          className="w-full py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded transition-colors text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`font-jp font-bold text-white text-sm px-2 py-0.5 rounded shrink-0 ${
                                item.type === 'radical'
                                  ? 'bg-[#0284C7]'
                                  : item.type === 'kanji'
                                  ? 'bg-[#DB2777]'
                                  : 'bg-[#7C3AED]'
                              }`}
                            >
                              {item.characters}
                            </span>
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                              {item.primaryMeaning}
                            </span>
                          </div>
                          <span className="font-mono-num text-xs font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                            {acc !== null ? `${acc}%` : 'Baru salah'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                  Baru Terbuka
                </h3>
                <div className="flex flex-wrap gap-2">
                  {recentlyUnlocked.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openItemDetail(item.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-white font-jp font-bold text-sm flex items-center gap-1.5 cursor-pointer hover:opacity-90 ${
                        item.type === 'radical'
                          ? 'bg-[#0284C7]'
                          : item.type === 'kanji'
                          ? 'bg-[#DB2777]'
                          : 'bg-[#7C3AED]'
                      }`}
                    >
                      <span>{item.characters}</span>
                      <span className="font-sans text-[11px] font-medium text-white/90">
                        {item.primaryMeaning}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN (4 cols) */}
        <aside className="lg:col-span-4 space-y-6">
          {/* REVIEW FORECAST */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Prakiraan Review
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                7 Hari
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {forecast.map((day) => {
                const isOpen = expandedDay === day.dateKey;
                const barWidth = Math.min(100, day.addedCount * 12);
                return (
                  <div key={day.dateKey} className="py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedDay(isOpen ? '' : day.dateKey)}
                      className="w-full flex items-center justify-between gap-2 text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {day.hours.length > 0 ? (
                          isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        <span
                          className={`text-sm truncate ${
                            day.isToday
                              ? 'font-semibold text-slate-900 dark:text-white'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {day.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 font-mono-num text-xs">
                        <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className="h-full bg-[#0284C7] rounded-full"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[#0284C7] font-semibold">
                          {day.addedCount > 0 ? `+${day.addedCount}` : '0'}
                        </span>
                        <span className="w-8 text-right text-slate-500 dark:text-slate-400">
                          {day.cumulativeTotal}
                        </span>
                      </div>
                    </button>

                    {isOpen && day.hours.length > 0 && (
                      <div className="mt-2 pl-5 space-y-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-2">
                        {day.hours.map((h) => (
                          <div
                            key={h.hour}
                            className="flex items-center justify-between text-xs font-mono-num text-slate-500 dark:text-slate-400"
                          >
                            <span>{h.label}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[#0284C7] font-medium">
                                +{h.added}
                              </span>
                              <span className="w-8 text-right">{h.cumulative}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* DAILY ACTIVITY */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Aktivitas 7 Hari
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                Total {state.totalReviewsDone} review
              </span>
            </div>

            <div className="grid grid-cols-7 gap-2 items-end h-28 pt-3">
              {last7Days.map((d, idx) => {
                const heightPct = Math.max(8, Math.round((d.count / maxDailyReviews) * 100));
                return (
                  <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="font-mono-num text-[10px] text-slate-500 dark:text-slate-400">
                      {d.count > 0 ? d.count : ''}
                    </span>
                    <div
                      className={`w-full rounded-t transition-all ${
                        d.isToday
                          ? 'bg-[#0284C7]'
                          : d.count > 0
                          ? 'bg-slate-300 dark:bg-slate-700'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span
                      className={`text-[11px] ${
                        d.isToday
                          ? 'font-bold text-slate-900 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Ingin uji level 1–60 lebih cepat?</span>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Pengaturan SRS
              </button>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
};
