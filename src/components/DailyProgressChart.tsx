import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Flame, Play, SlidersHorizontal } from 'lucide-react';
import type { ReviewHistoryEntry } from '../types/curriculum';
import { getTodayDateStr } from '../utils/srs';

type RangeDays = 7 | 14 | 30;

interface DailyChartDatum {
  dateKey: string;
  shortLabel: string;
  fullDateLabel: string;
  studyMinutes: number;
  reviewMinutes: number;
  totalMinutes: number;
  reviews: number;
  correct: number;
  lessons: number;
  accuracy: number | null;
  goalMet: boolean;
  isToday: boolean;
}

interface DailyProgressChartProps {
  history: ReviewHistoryEntry[];
  now: number;
  dailyReviewGoal: number;
  streakDays: number;
  totalReviewsDone: number;
  hasAvailableReviews: boolean;
  onStartReview: () => void;
  onOpenSettings: () => void;
}

const DAY_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
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

function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} mnt`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}

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

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyChartDatum }>;
  dailyReviewGoal: number;
}

const DailyChartTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  dailyReviewGoal,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#1C212B]/95 backdrop-blur-sm px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 min-w-[205px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-semibold text-slate-900 dark:text-white">
          {d.fullDateLabel}
        </span>
        {d.isToday && (
          <span className="text-[11px] font-semibold text-[#0284C7]">Hari ini</span>
        )}
      </div>

      <div className="space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#0F766E]" />
            Lama Belajar
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {d.studyMinutes} mnt
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
            Lama Review
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {d.reviewMinutes} mnt
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-slate-500 dark:text-slate-400">Total Durasi</span>
          <span className="font-bold text-slate-900 dark:text-white">
            {formatDuration(d.totalMinutes)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Sesi Review</span>
          <span
            className={`font-semibold ${
              d.goalMet
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {d.reviews} / {dailyReviewGoal}
            {d.lessons > 0 ? ` · +${d.lessons} pel.` : ''}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Akurasi</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {d.accuracy !== null ? `${d.accuracy}%` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const DailyProgressChart: React.FC<DailyProgressChartProps> = ({
  history,
  now,
  dailyReviewGoal,
  streakDays,
  totalReviewsDone,
  hasAvailableReviews,
  onStartReview,
  onOpenSettings,
}) => {
  const [rangeDays, setRangeDays] = useState<RangeDays>(7);
  const isDark = useIsDarkMode();

  const historyMap = useMemo(() => {
    const map = new Map<string, ReviewHistoryEntry>();
    for (const h of history) {
      map.set(h.date, h);
    }
    return map;
  }, [history]);

  const series = useMemo<DailyChartDatum[]>(() => {
    const out: DailyChartDatum[] = [];
    for (let offset = rangeDays - 1; offset >= 0; offset--) {
      const ts = now - offset * 24 * 60 * 60 * 1000;
      const dt = new Date(ts);
      const dateKey = getTodayDateStr(ts);
      const entry = historyMap.get(dateKey);
      const reviews = entry?.reviewsCompleted ?? 0;
      const correct = entry?.correctCount ?? 0;
      const lessons = entry?.lessonsCompleted ?? 0;

      const rawReviewMin =
        entry?.reviewMinutes !== undefined
          ? entry.reviewMinutes
          : reviews > 0
          ? Math.max(1, reviews * 0.55)
          : 0;
      const rawStudyMin =
        entry?.studyMinutes !== undefined
          ? entry.studyMinutes
          : lessons > 0
          ? Math.max(1, lessons * 1.8)
          : 0;

      const reviewMinutes = Math.round(rawReviewMin);
      const studyMinutes = Math.round(rawStudyMin);
      const totalMinutes = reviewMinutes + studyMinutes;

      const accuracy =
        reviews > 0 ? Math.min(100, Math.round((correct / reviews) * 100)) : null;

      const dayName = DAY_SHORT_ID[dt.getDay()];
      const dayNum = dt.getDate();
      const monthName = MONTH_SHORT_ID[dt.getMonth()];

      out.push({
        dateKey,
        shortLabel: rangeDays === 7 ? dayName : `${dayNum}/${dt.getMonth() + 1}`,
        fullDateLabel: `${dayName}, ${dayNum} ${monthName}`,
        studyMinutes,
        reviewMinutes,
        totalMinutes,
        reviews,
        correct,
        lessons,
        accuracy,
        goalMet: reviews >= dailyReviewGoal,
        isToday: offset === 0,
      });
    }
    return out;
  }, [rangeDays, now, historyMap, dailyReviewGoal]);

  const summary = useMemo(() => {
    let activeDays = 0;
    let goalMetDays = 0;
    let totalRangeReviews = 0;
    let totalRangeCorrect = 0;
    let totalRangeLessons = 0;
    let totalStudyMinutes = 0;
    let totalReviewMinutes = 0;

    for (const d of series) {
      if (d.totalMinutes > 0 || d.reviews > 0 || d.lessons > 0) activeDays += 1;
      if (d.goalMet) goalMetDays += 1;
      totalRangeReviews += d.reviews;
      totalRangeCorrect += d.correct;
      totalRangeLessons += d.lessons;
      totalStudyMinutes += d.studyMinutes;
      totalReviewMinutes += d.reviewMinutes;
    }

    const avgStudyMin = Math.round(totalStudyMinutes / Math.max(1, rangeDays));
    const avgReviewMin = Math.round(totalReviewMinutes / Math.max(1, rangeDays));
    const consistencyPct = Math.round((activeDays / Math.max(1, rangeDays)) * 100);
    const avgAccuracy =
      totalRangeReviews > 0
        ? Math.min(100, Math.round((totalRangeCorrect / totalRangeReviews) * 100))
        : null;

    return {
      activeDays,
      goalMetDays,
      totalRangeReviews,
      totalRangeLessons,
      totalStudyMinutes,
      totalReviewMinutes,
      avgStudyMin,
      avgReviewMin,
      consistencyPct,
      avgAccuracy,
    };
  }, [series, rangeDays]);

  const hasAnyActivityInRange =
    summary.totalStudyMinutes > 0 ||
    summary.totalReviewMinutes > 0 ||
    summary.totalRangeReviews > 0 ||
    summary.totalRangeLessons > 0;

  const yMaxMinutes = useMemo(() => {
    const peak =
      rangeDays === 30
        ? Math.max(10, ...series.map((d) => d.totalMinutes))
        : Math.max(
            10,
            ...series.map((d) => Math.max(d.studyMinutes, d.reviewMinutes))
          );
    return Math.ceil((peak * 1.22) / 5) * 5;
  }, [series, rangeDays]);

  const gridStroke = isDark ? '#1E293B' : '#EDF2F7';
  const axisTickColor = isDark ? '#94A3B8' : '#64748B';
  const hoverBandColor = isDark
    ? 'rgba(148, 163, 184, 0.08)'
    : 'rgba(15, 23, 42, 0.04)';

  return (
    <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 min-w-0">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Aktivitas Belajar &amp; Review Harian
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Durasi lama belajar dan lama review harian (menit) · Total{' '}
            <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
              {totalReviewsDone}
            </span>{' '}
            review
          </p>
        </div>

        {/* Clean Range Selector Only */}
        <div className="inline-flex self-start sm:self-auto rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs tabular-nums shrink-0">
          {([7, 14, 30] as RangeDays[]).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRangeDays(days)}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                rangeDays === days
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {days}H
            </button>
          ))}
        </div>
      </div>

      {/* 4-Column Refined Tabular KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3.5 border-y border-slate-100 dark:border-slate-800">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Lama Belajar
          </div>
          <div className="font-display text-xl font-bold text-[#0F766E] dark:text-teal-400 tabular-nums mt-0.5">
            {formatDuration(summary.totalStudyMinutes)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            ~{summary.avgStudyMin} mnt/hari · +{summary.totalRangeLessons} pel.
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Lama Review
          </div>
          <div className="font-display text-xl font-bold text-[#0284C7] dark:text-sky-400 tabular-nums mt-0.5">
            {formatDuration(summary.totalReviewMinutes)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            ~{summary.avgReviewMin} mnt/hari · {summary.totalRangeReviews} review
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Hari Aktif
          </div>
          <div className="font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {summary.activeDays}
            <span className="text-sm font-medium text-slate-400 dark:text-slate-500">
              /{rangeDays}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {summary.consistencyPct}% konsisten · {summary.goalMetDays} target
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Streak &amp; Akurasi
          </div>
          <div className="font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{streakDays} hari</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            Akurasi {summary.avgAccuracy !== null ? `${summary.avgAccuracy}%` : '—'}
          </div>
        </div>
      </div>

      {/* Main Bar Chart Canvas (Bar-Only, Side-by-Side Grouped Bars) */}
      {!hasAnyActivityInRange ? (
        <div className="py-10 px-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            Belum ada aktivitas tercatat dalam {rangeDays} hari terakhir
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Mulai pelajaran baru, sesi review SRS, membaca, mendengar, atau latihan menulis hari ini agar durasi harianmu terekam di grafik.
          </p>
          <button
            type="button"
            onClick={onStartReview}
            className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {hasAvailableReviews ? 'Mulai Sesi Review Sekarang' : 'Mulai Pelajaran Pertama'}
          </button>
        </div>
      ) : (
        <div className="w-full h-[235px] sm:h-[255px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              margin={{ top: 18, right: 8, left: -14, bottom: 2 }}
              barGap={rangeDays === 7 ? 4 : 2}
              barCategoryGap={rangeDays === 7 ? '26%' : rangeDays === 14 ? '22%' : '20%'}
            >
              <defs>
                <linearGradient id="kmBarStudy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F766E" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#2DD4BF" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="kmBarReview" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="kmBarTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#14B8A6" stopOpacity={0.82} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 4"
                vertical={false}
                stroke={gridStroke}
              />
              <XAxis
                dataKey="shortLabel"
                tick={{ fill: axisTickColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                dy={6}
                interval={rangeDays === 30 ? 4 : rangeDays === 14 ? 1 : 0}
              />
              <YAxis
                domain={[0, yMaxMinutes]}
                allowDecimals={false}
                tickFormatter={(v) => `${v}m`}
                tick={{ fill: axisTickColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: hoverBandColor, radius: 6 }}
                content={<DailyChartTooltip dailyReviewGoal={dailyReviewGoal} />}
              />

              {rangeDays === 30 ? (
                <Bar
                  dataKey="totalMinutes"
                  name="Total Durasi"
                  fill="url(#kmBarTotal)"
                  radius={[5, 5, 2, 2]}
                  maxBarSize={11}
                />
              ) : (
                <>
                  <Bar
                    dataKey="studyMinutes"
                    name="Lama Belajar"
                    fill="url(#kmBarStudy)"
                    radius={[6, 6, 3, 3]}
                    maxBarSize={rangeDays === 7 ? 20 : 10}
                  >
                    {rangeDays === 7 && (
                      <LabelList
                        dataKey="studyMinutes"
                        position="top"
                        offset={5}
                        formatter={(val: unknown) => {
                          const n = Number(val);
                          return n > 0 ? `${n}m` : '';
                        }}
                        style={{
                          fill: isDark ? '#5EEAD4' : '#0F766E',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      />
                    )}
                  </Bar>
                  <Bar
                    dataKey="reviewMinutes"
                    name="Lama Review"
                    fill="url(#kmBarReview)"
                    radius={[6, 6, 3, 3]}
                    maxBarSize={rangeDays === 7 ? 20 : 10}
                  >
                    {rangeDays === 7 && (
                      <LabelList
                        dataKey="reviewMinutes"
                        position="top"
                        offset={5}
                        formatter={(val: unknown) => {
                          const n = Number(val);
                          return n > 0 ? `${n}m` : '';
                        }}
                        style={{
                          fill: isDark ? '#7DD3FC' : '#0284C7',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      />
                    )}
                  </Bar>
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Compact Daily Consistency Strip */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Jejak Konsistensi {rangeDays} Hari</span>
          <span className="tabular-nums">
            {summary.goalMetDays} capai target ·{' '}
            {Math.max(0, summary.activeDays - summary.goalMetDays)} aktif
          </span>
        </div>
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${rangeDays}, minmax(0, 1fr))`,
          }}
        >
          {series.map((d) => (
            <div
              key={`strip-${d.dateKey}`}
              title={`${d.fullDateLabel}: Belajar ${d.studyMinutes} mnt · Review ${d.reviewMinutes} mnt (${d.reviews} review)`}
              className={`h-2.5 rounded-sm transition-colors ${
                d.goalMet
                  ? 'bg-emerald-500 dark:bg-emerald-400'
                  : d.totalMinutes > 0
                  ? 'bg-[#0284C7]/75 dark:bg-sky-400/75'
                  : 'bg-slate-100 dark:bg-slate-800'
              } ${d.isToday ? 'ring-1 ring-offset-1 ring-slate-900 dark:ring-white dark:ring-offset-[#161A22]' : ''}`}
            />
          ))}
        </div>
      </div>

      {/* Clean Legend & Settings Trigger */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {rangeDays === 30 ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-b from-[#0284C7] to-[#14B8A6] inline-block" />
              Total durasi belajar &amp; review (menit)
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0F766E] inline-block" />
                Lama Belajar (menit)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0284C7] inline-block" />
                Lama Review (menit)
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1.5 font-semibold text-[#0284C7] hover:underline whitespace-nowrap cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Target Review ({dailyReviewGoal}/hari)
        </button>
      </div>
    </section>
  );
};
