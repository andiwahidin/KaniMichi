import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Play } from 'lucide-react';
import type { CurriculumDataset } from '../data/curriculum';
import type { UserState } from '../types/curriculum';
import type { SrsDistribution } from '../utils/srs';

type WeekRange = 4 | 8 | 12;
type MasteryViewMode = 'category' | 'srs';

interface WeeklyDatum {
  weekKey: string;
  axisLabel: string;
  rangeLabel: string;
  isCurrentWeek: boolean;
  reviews: number;
  correct: number;
  lessons: number;
  activeDays: number;
  totalMinutes: number;
  accuracy: number | null;
  accuracyDelta: number | null;
  cumulativeLearned: number;
}

interface CategoryMasteryDatum {
  name: string;
  apprentice: number;
  guruToEnlightened: number;
  burned: number;
  masteredTotal: number;
  startedTotal: number;
}

interface SrsTierDatum {
  tier: string;
  radical: number;
  kanji: number;
  vocabulary: number;
  total: number;
}

interface ProfileProgressChartsProps {
  state: UserState;
  dataset: CurriculumDataset;
  srsDist: SrsDistribution;
  onStartLesson: () => void;
  onStartReview: () => void;
}

const MONTH_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }
    const update = () =>
      setIsDark(document.documentElement.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, []);

  return isDark;
}

function parseLocalDate(dateStr: string): Date | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/** Return local midnight on Monday of the week containing `date`. */
function getWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offsetFromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offsetFromMonday);
  return d;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatShortDate(d: Date): string {
  return `${d.getDate()} ${MONTH_SHORT_ID[d.getMonth()]}`;
}

function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} mnt`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}

function getAccuracyStatus(acc: number): {
  label: string;
  colorClass: string;
  dotColor: string;
} {
  if (acc >= 80) {
    return {
      label: 'Sangat Baik',
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      dotColor: '#16A34A',
    };
  }
  if (acc >= 60) {
    return {
      label: 'Cukup Baik',
      colorClass: 'text-amber-600 dark:text-amber-400',
      dotColor: '#D97706',
    };
  }
  return {
    label: 'Perlu Review Ulang',
    colorClass: 'text-rose-600 dark:text-rose-400',
    dotColor: '#DC2626',
  };
}

// =========================================================================
// CUSTOM TOOLTIPS
// =========================================================================

const WeeklyProgressTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ payload: WeeklyDatum }>;
}> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#1C212B]/95 backdrop-blur-sm px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 min-w-[215px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-semibold text-slate-900 dark:text-white">
          {d.rangeLabel}
        </span>
        {d.isCurrentWeek && (
          <span className="text-[11px] font-semibold text-[#0284C7]">
            Minggu ini
          </span>
        )}
      </div>

      <div className="space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-xs bg-[#0284C7]" />
            Review Selesai
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {d.reviews.toLocaleString('id-ID')}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-xs bg-[#0F766E]" />
            Pelajaran Baru
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            +{d.lessons.toLocaleString('id-ID')}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#7C3AED]" />
            Total Item Aktif
          </span>
          <span className="font-bold text-[#7C3AED] dark:text-violet-400">
            {d.cumulativeLearned.toLocaleString('id-ID')}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
          <span>Hari Aktif · Durasi</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {d.activeDays}/7 hr · {formatDuration(d.totalMinutes)}
          </span>
        </div>
      </div>
    </div>
  );
};

const MasteryTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ payload: CategoryMasteryDatum | SrsTierDatum }>;
  mode: MasteryViewMode;
}> = ({ active, payload, mode }) => {
  if (!active || !payload || payload.length === 0) return null;

  if (mode === 'category') {
    const d = payload[0].payload as CategoryMasteryDatum;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#1C212B]/95 backdrop-blur-sm px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 min-w-[200px]">
        <div className="font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1.5">
          {d.name}
        </div>
        <div className="space-y-1 tabular-nums">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2 h-2 rounded-xs bg-[#D97706]" />
              Burned (Tamat)
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {d.burned.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2 h-2 rounded-xs bg-[#0F766E]" />
              Guru – Enlightened
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {d.guruToEnlightened.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2 h-2 rounded-xs bg-[#38BDF8]" />
              Apprentice (Belajar)
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {d.apprentice.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">
              Total Dikuasai (Guru+)
            </span>
            <span className="font-bold text-[#0F766E] dark:text-teal-400">
              {d.masteredTotal.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const d = payload[0].payload as SrsTierDatum;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#1C212B]/95 backdrop-blur-sm px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 min-w-[190px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-semibold text-slate-900 dark:text-white">
          Tahap {d.tier}
        </span>
        <span className="font-mono-num font-bold text-slate-700 dark:text-slate-200">
          {d.total.toLocaleString('id-ID')} item
        </span>
      </div>
      <div className="space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-xs bg-[#0284C7]" />
            Radikal
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {d.radical.toLocaleString('id-ID')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-xs bg-[#DB2777]" />
            Kanji
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {d.kanji.toLocaleString('id-ID')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-xs bg-[#7C3AED]" />
            Kosakata
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {d.vocabulary.toLocaleString('id-ID')}
          </span>
        </div>
      </div>
    </div>
  );
};

const WeeklyAccuracyTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ payload: WeeklyDatum }>;
}> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  const status = d.accuracy !== null ? getAccuracyStatus(d.accuracy) : null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#1C212B]/95 backdrop-blur-sm px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 min-w-[215px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-semibold text-slate-900 dark:text-white">
          {d.rangeLabel}
        </span>
        {d.isCurrentWeek && (
          <span className="text-[11px] font-semibold text-[#0284C7]">
            Minggu ini
          </span>
        )}
      </div>

      {d.accuracy === null ? (
        <div className="text-slate-500 dark:text-slate-400">
          Tidak ada sesi review tercatat pada minggu ini.
        </div>
      ) : (
        <div className="space-y-1 tabular-nums">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Akurasi Mingguan</span>
            <span className={`font-bold ${status?.colorClass ?? 'text-slate-900 dark:text-white'}`}>
              {d.accuracy}% · {status?.label}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Jawaban Benar</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {d.correct.toLocaleString('id-ID')} / {d.reviews.toLocaleString('id-ID')} review
            </span>
          </div>
          {d.accuracyDelta !== null && (
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">vs Minggu Aktif Lalu</span>
              <span
                className={`font-semibold ${
                  d.accuracyDelta > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : d.accuracyDelta < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {d.accuracyDelta > 0 ? `+${d.accuracyDelta}%` : `${d.accuracyDelta}%`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AccuracyDotProps {
  cx?: number;
  cy?: number;
  payload?: WeeklyDatum;
  isDark: boolean;
}

const AccuracyDot: React.FC<AccuracyDotProps> = ({ cx, cy, payload, isDark }) => {
  if (cx === undefined || cy === undefined || !payload || payload.accuracy === null) {
    return null;
  }
  const { dotColor } = getAccuracyStatus(payload.accuracy);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4.5}
      fill={dotColor}
      stroke={isDark ? '#161A22' : '#FFFFFF'}
      strokeWidth={2}
    />
  );
};

// =========================================================================
// MAIN COMPONENT
// =========================================================================

export const ProfileProgressCharts: React.FC<ProfileProgressChartsProps> = ({
  state,
  dataset,
  srsDist,
  onStartLesson,
  onStartReview,
}) => {
  const [rangeWeeks, setRangeWeeks] = useState<WeekRange>(8);
  const [masteryMode, setMasteryMode] = useState<MasteryViewMode>('category');
  const isDark = useIsDarkMode();

  // 1. Collect all learned timestamps across Curriculum + Grammar + Kana JLPT
  const learnedTimestamps = useMemo(() => {
    const timestamps: Array<number | null> = [];
    for (const [id, p] of Object.entries(state.progress)) {
      if (dataset.byId[id] && p.srsStage !== null && p.srsStage >= 1) {
        timestamps.push(p.startedAt ?? p.lastReviewedAt ?? p.unlockedAt);
      }
    }
    for (const gp of Object.values(state.grammarProgress ?? {})) {
      if (gp.srsStage >= 1) {
        timestamps.push(gp.startedAt ?? gp.lastReviewedAt);
      }
    }
    for (const kp of Object.values(state.kanaVocabProgress ?? {})) {
      if (kp.srsStage >= 1) {
        timestamps.push(kp.startedAt ?? kp.lastReviewedAt);
      }
    }
    return timestamps;
  }, [state.progress, state.grammarProgress, state.kanaVocabProgress, dataset.byId]);

  // 2. Build Monday–Sunday weekly series for Riwayat Progres & Akurasi per Minggu
  const weeklySeries = useMemo<WeeklyDatum[]>(() => {
    const today = new Date();
    const currentWeekMonday = getWeekMonday(today);

    // Group history entries by their week Monday key
    const weekMap = new Map<
      string,
      {
        reviews: number;
        correct: number;
        lessons: number;
        activeDays: number;
        totalMinutes: number;
      }
    >();

    for (const entry of state.history) {
      const dt = parseLocalDate(entry.date);
      if (!dt) continue;
      const mondayKey = toDateKey(getWeekMonday(dt));
      const existing = weekMap.get(mondayKey) ?? {
        reviews: 0,
        correct: 0,
        lessons: 0,
        activeDays: 0,
        totalMinutes: 0,
      };
      const reviews = entry.reviewsCompleted ?? 0;
      const correct = entry.correctCount ?? 0;
      const lessons = entry.lessonsCompleted ?? 0;
      const reviewMin =
        entry.reviewMinutes !== undefined
          ? entry.reviewMinutes
          : reviews > 0
          ? Math.max(1, reviews * 0.55)
          : 0;
      const studyMin =
        entry.studyMinutes !== undefined
          ? entry.studyMinutes
          : lessons > 0
          ? Math.max(1, lessons * 1.8)
          : 0;

      existing.reviews += reviews;
      existing.correct += correct;
      existing.lessons += lessons;
      existing.totalMinutes += reviewMin + studyMin;
      if (reviews > 0 || lessons > 0 || reviewMin + studyMin > 0) {
        existing.activeDays += 1;
      }
      weekMap.set(mondayKey, existing);
    }

    const out: WeeklyDatum[] = [];
    let prevActiveAccuracy: number | null = null;

    for (let offset = rangeWeeks - 1; offset >= 0; offset--) {
      const monday = new Date(currentWeekMonday);
      monday.setDate(monday.getDate() - offset * 7);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const sundayEndMs = new Date(
        sunday.getFullYear(),
        sunday.getMonth(),
        sunday.getDate(),
        23,
        59,
        59,
        999
      ).getTime();

      const weekKey = toDateKey(monday);
      const agg = weekMap.get(weekKey);
      const reviews = agg?.reviews ?? 0;
      const correct = agg?.correct ?? 0;
      const lessons = agg?.lessons ?? 0;
      const activeDays = agg?.activeDays ?? 0;
      const totalMinutes = Math.round(agg?.totalMinutes ?? 0);

      const accuracy =
        reviews > 0 ? Math.min(100, Math.round((correct / reviews) * 100)) : null;
      const accuracyDelta =
        accuracy !== null && prevActiveAccuracy !== null
          ? accuracy - prevActiveAccuracy
          : null;
      if (accuracy !== null) {
        prevActiveAccuracy = accuracy;
      }

      let cumulativeLearned = 0;
      for (const ts of learnedTimestamps) {
        if (ts === null || ts <= sundayEndMs) {
          cumulativeLearned += 1;
        }
      }

      out.push({
        weekKey,
        axisLabel: offset === 0 ? 'Mgg Ini' : formatShortDate(monday),
        rangeLabel: `${formatShortDate(monday)} – ${formatShortDate(sunday)}`,
        isCurrentWeek: offset === 0,
        reviews,
        correct,
        lessons,
        activeDays,
        totalMinutes,
        accuracy,
        accuracyDelta,
        cumulativeLearned,
      });
    }

    return out;
  }, [state.history, rangeWeeks, learnedTimestamps]);

  // 3. Weekly aggregates for crisp inline summaries
  const weeklySummary = useMemo(() => {
    let totalReviews = 0;
    let totalCorrect = 0;
    let totalLessons = 0;
    let totalMinutes = 0;
    let activeWeeks = 0;
    let bestWeekAcc: { acc: number; label: string } | null = null;
    let latestAcc: { acc: number; delta: number | null } | null = null;

    for (const w of weeklySeries) {
      totalReviews += w.reviews;
      totalCorrect += w.correct;
      totalLessons += w.lessons;
      totalMinutes += w.totalMinutes;
      if (w.reviews > 0 || w.lessons > 0 || w.totalMinutes > 0) {
        activeWeeks += 1;
      }
      if (w.accuracy !== null) {
        if (!bestWeekAcc || w.accuracy > bestWeekAcc.acc) {
          bestWeekAcc = { acc: w.accuracy, label: w.axisLabel };
        }
        latestAcc = { acc: w.accuracy, delta: w.accuracyDelta };
      }
    }

    const periodAvgAcc =
      totalReviews > 0
        ? Math.min(100, Math.round((totalCorrect / totalReviews) * 100))
        : null;

    return {
      totalReviews,
      totalLessons,
      totalMinutes,
      activeWeeks,
      periodAvgAcc,
      bestWeekAcc,
      latestAcc,
      hasHistory: totalReviews > 0 || totalLessons > 0,
      hasAccuracy: periodAvgAcc !== null,
    };
  }, [weeklySeries]);

  // 4. Mastery breakdown across Category (Radikal, Kanji, Kosakata, Grammar, Kana JLPT) & SRS Tier
  const masteryData = useMemo(() => {
    const makeRow = (
      name: string,
      apprentice: number,
      guruToEnlightened: number,
      burned: number
    ): CategoryMasteryDatum => ({
      name,
      apprentice,
      guruToEnlightened,
      burned,
      masteredTotal: guruToEnlightened + burned,
      startedTotal: apprentice + guruToEnlightened + burned,
    });

    const radRow = makeRow(
      'Radikal',
      srsDist.apprentice.radical,
      srsDist.guru.radical + srsDist.master.radical + srsDist.enlightened.radical,
      srsDist.burned.radical
    );
    const kanjiRow = makeRow(
      'Kanji',
      srsDist.apprentice.kanji,
      srsDist.guru.kanji + srsDist.master.kanji + srsDist.enlightened.kanji,
      srsDist.burned.kanji
    );
    const vocabRow = makeRow(
      'Kosakata',
      srsDist.apprentice.vocabulary,
      srsDist.guru.vocabulary + srsDist.master.vocabulary + srsDist.enlightened.vocabulary,
      srsDist.burned.vocabulary
    );

    let gApp = 0;
    let gMid = 0;
    let gBurn = 0;
    for (const gp of Object.values(state.grammarProgress ?? {})) {
      if (gp.srsStage >= 1 && gp.srsStage <= 4) gApp += 1;
      else if (gp.srsStage >= 5 && gp.srsStage <= 8) gMid += 1;
      else if (gp.srsStage === 9) gBurn += 1;
    }
    const grammarRow = makeRow('Grammar', gApp, gMid, gBurn);

    let kApp = 0;
    let kMid = 0;
    let kBurn = 0;
    for (const kp of Object.values(state.kanaVocabProgress ?? {})) {
      if (kp.srsStage >= 1 && kp.srsStage <= 4) kApp += 1;
      else if (kp.srsStage >= 5 && kp.srsStage <= 8) kMid += 1;
      else if (kp.srsStage === 9) kBurn += 1;
    }
    const kanaRow = makeRow('Kana JLPT', kApp, kMid, kBurn);

    const categories = [radRow, kanjiRow, vocabRow, grammarRow, kanaRow];

    const srsTiers: SrsTierDatum[] = [
      { tier: 'Apprentice', ...srsDist.apprentice },
      { tier: 'Guru', ...srsDist.guru },
      { tier: 'Master', ...srsDist.master },
      { tier: 'Enlightened', ...srsDist.enlightened },
      { tier: 'Burned', ...srsDist.burned },
    ];

    const totalMastered = categories.reduce((s, r) => s + r.masteredTotal, 0);
    const totalBurned = categories.reduce((s, r) => s + r.burned, 0);
    const totalApprentice = categories.reduce((s, r) => s + r.apprentice, 0);
    const hasAnyMastery = totalMastered + totalApprentice > 0;

    return {
      categories,
      srsTiers,
      totalMastered,
      totalBurned,
      totalApprentice,
      hasAnyMastery,
    };
  }, [srsDist, state.grammarProgress, state.kanaVocabProgress]);

  const gridStroke = isDark ? '#1E293B' : '#EDF2F7';
  const axisTickColor = isDark ? '#94A3B8' : '#64748B';
  const hoverBandColor = isDark
    ? 'rgba(148, 163, 184, 0.08)'
    : 'rgba(15, 23, 42, 0.04)';

  return (
    <section className="space-y-6" aria-label="Analitik Progres Belajar">
      {/* Section Header + Shared Weekly Timeframe Selector */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Analitik Progres &amp; Penguasaan
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Riwayat belajar mingguan, distribusi item yang dikuasai, dan tren akurasi review SRS
          </p>
        </div>

        <div
          role="group"
          aria-label="Rentang waktu grafik mingguan"
          className="inline-flex self-start sm:self-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-0.5 text-xs tabular-nums shrink-0"
        >
          {([4, 8, 12] as WeekRange[]).map((weeks) => (
            <button
              key={weeks}
              type="button"
              onClick={() => setRangeWeeks(weeks)}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                rangeWeeks === weeks
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {weeks} Minggu
            </button>
          ))}
        </div>
      </div>

      {/* CHART 1: RIWAYAT PROGRES BELAJAR (Full Width) */}
      <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Riwayat Progres Belajar Mingguan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Volume review &amp; pelajaran baru per minggu dibandingkan pertumbuhan total item dipelajari
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-num text-slate-600 dark:text-slate-300">
            <span>
              Review{' '}
              <strong className="text-[#0284C7]">
                {weeklySummary.totalReviews.toLocaleString('id-ID')}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Pelajaran{' '}
              <strong className="text-[#0F766E] dark:text-teal-400">
                +{weeklySummary.totalLessons.toLocaleString('id-ID')}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Durasi{' '}
              <strong className="text-slate-900 dark:text-white">
                {formatDuration(weeklySummary.totalMinutes)}
              </strong>
            </span>
          </div>
        </div>

        {!weeklySummary.hasHistory && learnedTimestamps.length === 0 ? (
          <div className="py-10 px-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              Belum ada riwayat belajar dalam {rangeWeeks} minggu terakhir
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Selesaikan pelajaran baru atau sesi review SRS pertamamu agar grafik pertumbuhan mingguan mulai terisi.
            </p>
            <button
              type="button"
              onClick={onStartLesson}
              className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Mulai Pelajaran Pertama
            </button>
          </div>
        ) : (
          <>
            <div className="w-full h-[240px] sm:h-[265px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={weeklySeries}
                  margin={{ top: 10, right: 8, left: -12, bottom: 2 }}
                  barGap={3}
                  barCategoryGap={rangeWeeks === 4 ? '28%' : '22%'}
                >
                  <CartesianGrid
                    strokeDasharray="3 4"
                    vertical={false}
                    stroke={gridStroke}
                  />
                  <XAxis
                    dataKey="axisLabel"
                    tick={{ fill: axisTickColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    dy={6}
                    interval={rangeWeeks === 12 ? 1 : 0}
                  />
                  <YAxis
                    yAxisId="activity"
                    allowDecimals={false}
                    tick={{ fill: axisTickColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="cumulative"
                    orientation="right"
                    allowDecimals={false}
                    tick={{ fill: isDark ? '#A78BFA' : '#7C3AED', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    cursor={{ fill: hoverBandColor, radius: 6 }}
                    content={<WeeklyProgressTooltip />}
                  />
                  <Bar
                    yAxisId="activity"
                    dataKey="reviews"
                    name="Review Selesai"
                    fill="#0284C7"
                    radius={[5, 5, 2, 2]}
                    maxBarSize={rangeWeeks === 4 ? 26 : 16}
                  />
                  <Bar
                    yAxisId="activity"
                    dataKey="lessons"
                    name="Pelajaran Baru"
                    fill="#0F766E"
                    radius={[5, 5, 2, 2]}
                    maxBarSize={rangeWeeks === 4 ? 26 : 16}
                  />
                  <Line
                    yAxisId="cumulative"
                    type="monotone"
                    dataKey="cumulativeLearned"
                    name="Total Item Aktif"
                    stroke="#7C3AED"
                    strokeWidth={2.25}
                    dot={{
                      r: 3.5,
                      fill: '#7C3AED',
                      stroke: isDark ? '#161A22' : '#FFFFFF',
                      strokeWidth: 1.5,
                    }}
                    activeDot={{ r: 5.5, fill: '#7C3AED' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#0284C7] inline-block" />
                  Review selesai / minggu
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#0F766E] inline-block" />
                  Pelajaran baru / minggu
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#7C3AED] inline-block rounded-full" />
                  Total item dipelajari (sumbu kanan)
                </span>
              </div>
              <span className="font-mono-num">
                {weeklySummary.activeWeeks}/{rangeWeeks} minggu aktif
              </span>
            </div>
          </>
        )}
      </div>

      {/* BOTTOM ROW: CHART 2 (ITEM DIKUASAI) + CHART 3 (AKURASI PER MINGGU) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* CHART 2: JUMLAH ITEM YANG DIKUASAI */}
        <div className="lg:col-span-6 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col justify-between gap-4 min-w-0">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Jumlah Item yang Dikuasai
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Sebaran penguasaan Radikal, Kanji, Kosakata, Grammar &amp; Kana
                </p>
              </div>

              <div
                role="group"
                aria-label="Mode tampilan item dikuasai"
                className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-[11px] shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setMasteryMode('category')}
                  className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    masteryMode === 'category'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Kategori
                </button>
                <button
                  type="button"
                  onClick={() => setMasteryMode('srs')}
                  className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    masteryMode === 'srs'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Tahap SRS
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-num text-slate-600 dark:text-slate-300 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span>
                Dikuasai (Guru+){' '}
                <strong className="text-[#0F766E] dark:text-teal-400">
                  {masteryData.totalMastered.toLocaleString('id-ID')}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Burned{' '}
                <strong className="text-[#D97706] dark:text-amber-400">
                  {masteryData.totalBurned.toLocaleString('id-ID')}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Belajar{' '}
                <strong className="text-[#0284C7]">
                  {masteryData.totalApprentice.toLocaleString('id-ID')}
                </strong>
              </span>
            </div>
          </div>

          {!masteryData.hasAnyMastery ? (
            <div className="py-10 px-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3 my-auto">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Belum ada item yang dikuasai
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Capai tahap Guru pada radikal, kanji, kosakata, atau tata bahasa untuk melihat sebaran penguasaanmu di sini.
              </p>
              <button
                type="button"
                onClick={onStartLesson}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Mulai Belajar
              </button>
            </div>
          ) : (
            <>
              <div className="w-full h-[225px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  {masteryMode === 'category' ? (
                    <BarChart
                      data={masteryData.categories}
                      margin={{ top: 8, right: 8, left: -16, bottom: 2 }}
                      barCategoryGap="24%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 4"
                        vertical={false}
                        stroke={gridStroke}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: axisTickColor, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        dy={6}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: axisTickColor, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: hoverBandColor, radius: 6 }}
                        content={<MasteryTooltip mode="category" />}
                      />
                      <Bar
                        dataKey="burned"
                        stackId="m"
                        name="Burned"
                        fill="#D97706"
                        maxBarSize={34}
                      />
                      <Bar
                        dataKey="guruToEnlightened"
                        stackId="m"
                        name="Guru–Enlightened"
                        fill="#0F766E"
                        maxBarSize={34}
                      />
                      <Bar
                        dataKey="apprentice"
                        stackId="m"
                        name="Apprentice"
                        fill="#38BDF8"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={34}
                      />
                    </BarChart>
                  ) : (
                    <BarChart
                      data={masteryData.srsTiers}
                      margin={{ top: 8, right: 8, left: -16, bottom: 2 }}
                      barCategoryGap="24%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 4"
                        vertical={false}
                        stroke={gridStroke}
                      />
                      <XAxis
                        dataKey="tier"
                        tick={{ fill: axisTickColor, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        dy={6}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: axisTickColor, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: hoverBandColor, radius: 6 }}
                        content={<MasteryTooltip mode="srs" />}
                      />
                      <Bar
                        dataKey="radical"
                        stackId="s"
                        name="Radikal"
                        fill="#0284C7"
                        maxBarSize={34}
                      />
                      <Bar
                        dataKey="kanji"
                        stackId="s"
                        name="Kanji"
                        fill="#DB2777"
                        maxBarSize={34}
                      />
                      <Bar
                        dataKey="vocabulary"
                        stackId="s"
                        name="Kosakata"
                        fill="#7C3AED"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={34}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                {masteryMode === 'category' ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#D97706] inline-block" />
                      Burned (Tamat)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#0F766E] inline-block" />
                      Guru – Enlightened
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#38BDF8] inline-block" />
                      Apprentice (Belajar)
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#0284C7] inline-block" />
                      Radikal
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#DB2777] inline-block" />
                      Kanji
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#7C3AED] inline-block" />
                      Kosakata
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* CHART 3: AKURASI PER MINGGU */}
        <div className="lg:col-span-6 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col justify-between gap-4 min-w-0">
          <div className="space-y-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Akurasi Review per Minggu
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Persentase jawaban benar mingguan terhadap batas sehat retensi SRS (80%)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-num text-slate-600 dark:text-slate-300 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span>
                Rata-rata{' '}
                <strong className="text-[#0284C7]">
                  {weeklySummary.periodAvgAcc !== null
                    ? `${weeklySummary.periodAvgAcc}%`
                    : '—'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Terbaik{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {weeklySummary.bestWeekAcc
                    ? `${weeklySummary.bestWeekAcc.acc}% (${weeklySummary.bestWeekAcc.label})`
                    : '—'}
                </strong>
              </span>
              {weeklySummary.latestAcc && weeklySummary.latestAcc.delta !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Tren{' '}
                    <strong
                      className={
                        weeklySummary.latestAcc.delta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {weeklySummary.latestAcc.delta > 0
                        ? `+${weeklySummary.latestAcc.delta}%`
                        : `${weeklySummary.latestAcc.delta}%`}
                    </strong>
                  </span>
                </>
              )}
            </div>
          </div>

          {!weeklySummary.hasAccuracy ? (
            <div className="py-10 px-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3 my-auto">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Belum ada data akurasi mingguan
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Selesaikan minimal satu sesi review agar grafik akurasi mingguan dan tren konsistensimu muncul.
              </p>
              <button
                type="button"
                onClick={onStartReview}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Mulai Sesi Review
              </button>
            </div>
          ) : (
            <>
              <div className="w-full h-[225px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={weeklySeries}
                    margin={{ top: 12, right: 10, left: -14, bottom: 2 }}
                  >
                    <defs>
                      <linearGradient id="kmProfileAccFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0284C7" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 4"
                      vertical={false}
                      stroke={gridStroke}
                    />
                    <XAxis
                      dataKey="axisLabel"
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      dy={6}
                      interval={rangeWeeks === 12 ? 1 : 0}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine
                      y={80}
                      stroke={isDark ? '#34D399' : '#16A34A'}
                      strokeDasharray="4 4"
                      strokeOpacity={0.65}
                      label={{
                        value: 'Target 80%',
                        position: 'insideTopRight',
                        fill: isDark ? '#34D399' : '#15803D',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                    <Tooltip
                      cursor={{ stroke: isDark ? '#475569' : '#CBD5E1', strokeDasharray: '3 3' }}
                      content={<WeeklyAccuracyTooltip />}
                    />
                    <Area
                      type="monotone"
                      dataKey="accuracy"
                      name="Akurasi Mingguan"
                      stroke="#0284C7"
                      strokeWidth={2.5}
                      fill="url(#kmProfileAccFill)"
                      connectNulls
                      dot={<AccuracyDot isDark={isDark} />}
                      activeDot={{
                        r: 6,
                        fill: '#0284C7',
                        stroke: isDark ? '#161A22' : '#FFFFFF',
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A] inline-block" />
                  ≥80% Sangat Baik
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D97706] inline-block" />
                  60–79% Cukup
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] inline-block" />
                  &lt;60% Perlu Review
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
