import React from 'react';
import { getLevelMeta } from '../data/curriculum';
import { SrsMode } from '../types/curriculum';
import { getSrsPolicy, SRS_STAGE_NAMES } from '../utils/srs';

export interface LevelCategoryProgress {
  mastered: number;
  learning: number;
  total: number;
}

interface LevelProgressBarProps {
  currentLevel: number;
  maxLevel: number;
  tierLabel: string;
  radicals: LevelCategoryProgress;
  kanji: LevelCategoryProgress;
  vocabulary: LevelCategoryProgress;
  requiredKanjiForLevelUp: number;
  kanjiQualifiedForLevelUp: number;
  kanjiStartedCount: number;
  srsMode: SrsMode;
  onAdvanceLevelEarly?: () => void;
  onExploreLevels: () => void;
  onInspectCategory: (category: 'radical' | 'kanji' | 'vocabulary') => void;
}

function toPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function toExactWidth(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

export const LevelProgressBar: React.FC<LevelProgressBarProps> = ({
  currentLevel,
  maxLevel,
  tierLabel,
  radicals,
  kanji,
  vocabulary,
  requiredKanjiForLevelUp,
  kanjiQualifiedForLevelUp,
  kanjiStartedCount,
  srsMode,
  onAdvanceLevelEarly,
  onExploreLevels,
  onInspectCategory,
}) => {
  const levelMeta = getLevelMeta(currentLevel);
  const nextMeta = currentLevel < maxLevel ? getLevelMeta(currentLevel + 1) : null;
  const policy = getSrsPolicy(srsMode);
  const levelUpStageLabel = SRS_STAGE_NAMES[policy.levelUpKanjiStage];
  const canAdvanceEarly =
    policy.allowManualAdvanceOnLessonComplete &&
    currentLevel < maxLevel &&
    kanji.total > 0 &&
    kanjiStartedCount >= requiredKanjiForLevelUp &&
    Boolean(onAdvanceLevelEarly);
  const totalItems = radicals.total + kanji.total + vocabulary.total;
  const totalMastered = radicals.mastered + kanji.mastered + vocabulary.mastered;
  const totalLearning = radicals.learning + kanji.learning + vocabulary.learning;
  const totalRemaining = Math.max(0, totalItems - totalMastered - totalLearning);
  const overallMasteredPct = toPercent(totalMastered, totalItems);

  const radMasteredSeg = toExactWidth(radicals.mastered, totalItems);
  const kanjiMasteredSeg = toExactWidth(kanji.mastered, totalItems);
  const vocabMasteredSeg = toExactWidth(vocabulary.mastered, totalItems);
  const learningSeg = Math.min(
    Math.max(0, 100 - (radMasteredSeg + kanjiMasteredSeg + vocabMasteredSeg)),
    toExactWidth(totalLearning, totalItems)
  );

  const kanjiTargetPct =
    currentLevel < maxLevel && kanji.total > 0
      ? toExactWidth(requiredKanjiForLevelUp, kanji.total)
      : null;

  const kanjiRemainingForLevelUp = Math.max(
    0,
    requiredKanjiForLevelUp - kanjiQualifiedForLevelUp
  );

  const categories: {
    key: 'radical' | 'kanji' | 'vocabulary';
    label: string;
    color: string;
    data: LevelCategoryProgress;
    caption: string;
    targetMarkerPct: number | null;
    targetTooltip?: string;
  }[] = [
    {
      key: 'radical',
      label: 'Radikal',
      color: '#0284C7',
      data: radicals,
      caption:
        radicals.total === 0
          ? 'Tidak ada radikal baru di bab ini'
          : radicals.mastered >= radicals.total
          ? 'Semua radikal bab ini sudah dikuasai'
          : `${radicals.learning} belajar · ${Math.max(
              0,
              radicals.total - radicals.mastered - radicals.learning
            )} tersisa`,
      targetMarkerPct: null,
    },
    {
      key: 'kanji',
      label: 'Kanji',
      color: '#DB2777',
      data: kanji,
      caption:
        currentLevel >= maxLevel
          ? 'Seluruh Materi JLPT N5–N1 Tercapai'
          : kanjiRemainingForLevelUp === 0 && kanji.total > 0
          ? `Syarat lanjut ke ${nextMeta?.jlpt} Bab ${nextMeta?.unitInTier} terpenuhi`
          : `Target ${nextMeta?.jlpt} Bab ${nextMeta?.unitInTier}: ${kanjiQualifiedForLevelUp}/${requiredKanjiForLevelUp} ${levelUpStageLabel} (${kanjiRemainingForLevelUp} lagi)`,
      targetMarkerPct: kanjiTargetPct,
      targetTooltip: `Syarat buka bab berikutnya (${policy.label}): ${requiredKanjiForLevelUp} dari ${kanji.total} Kanji mencapai ${levelUpStageLabel} (90%)`,
    },
    {
      key: 'vocabulary',
      label: 'Kosakata',
      color: '#7C3AED',
      data: vocabulary,
      caption:
        vocabulary.total === 0
          ? 'Tidak ada kosakata di bab ini'
          : vocabulary.mastered >= vocabulary.total
          ? 'Semua kosakata bab ini sudah dikuasai'
          : `${vocabulary.learning} belajar · ${Math.max(
              0,
              vocabulary.total - vocabulary.mastered - vocabulary.learning
            )} tersisa`,
      targetMarkerPct: null,
    },
  ];

  return (
    <section
      aria-labelledby="level-mastery-heading"
      className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5"
    >
      {/* Top Header & Overall Mastery Ratio */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
            <span className="font-mono-num tabular-nums font-semibold text-slate-700 dark:text-slate-300">
              {levelMeta.title}
            </span>
            <span aria-hidden="true">·</span>
            <span>{tierLabel}</span>
            <span aria-hidden="true">·</span>
            <span>Mode {policy.label}</span>
            <span aria-hidden="true">·</span>
            <span>Dikuasai: Guru (SRS 5+)</span>
          </div>
          <h2
            id="level-mastery-heading"
            className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight"
          >
            Progres Penguasaan {levelMeta.jlpt} · Bab {levelMeta.unitInTier}
          </h2>
        </div>

        <div className="flex items-baseline sm:items-end sm:flex-col justify-between gap-2 shrink-0">
          <div className="flex items-baseline gap-2 font-mono-num tabular-nums">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {overallMasteredPct}%
            </span>
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {totalMastered} / {totalItems} item
            </span>
          </div>
          <div className="flex items-center gap-3">
            {canAdvanceEarly && nextMeta && (
              <button
                type="button"
                onClick={onAdvanceLevelEarly}
                className="px-3 py-1.5 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                Buka {nextMeta.jlpt} Bab {nextMeta.unitInTier} Sekarang
              </button>
            )}
            <button
              type="button"
              onClick={onExploreLevels}
              className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Jelajahi Materi JLPT N5–N1 →
            </button>
          </div>
        </div>
      </div>

      {/* Composite Stacked Level Bar */}
      <div className="space-y-2.5">
        <div
          role="progressbar"
          aria-label={`Penguasaan total ${levelMeta.title}: ${totalMastered} dari ${totalItems} item (${overallMasteredPct}%)`}
          aria-valuenow={overallMasteredPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex"
        >
          {radMasteredSeg > 0 && (
            <div
              className="h-full bg-[#0284C7] transition-all duration-300"
              style={{ width: `${radMasteredSeg}%` }}
              title={`Radikal dikuasai: ${radicals.mastered} / ${radicals.total}`}
            />
          )}
          {kanjiMasteredSeg > 0 && (
            <div
              className="h-full bg-[#DB2777] transition-all duration-300"
              style={{ width: `${kanjiMasteredSeg}%` }}
              title={`Kanji dikuasai: ${kanji.mastered} / ${kanji.total}`}
            />
          )}
          {vocabMasteredSeg > 0 && (
            <div
              className="h-full bg-[#7C3AED] transition-all duration-300"
              style={{ width: `${vocabMasteredSeg}%` }}
              title={`Kosakata dikuasai: ${vocabulary.mastered} / ${vocabulary.total}`}
            />
          )}
          {learningSeg > 0 && (
            <div
              className="h-full bg-slate-300 dark:bg-slate-600 transition-all duration-300"
              style={{ width: `${learningSeg}%` }}
              title={`Sedang dipelajari (Apprentice): ${totalLearning} item`}
            />
          )}
        </div>

        {/* Clean Unboxed Legend */}
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#0284C7] shrink-0" aria-hidden="true" />
              <span>Radikal</span>
              <span className="font-mono-num tabular-nums text-slate-900 dark:text-slate-200 font-semibold">
                {radicals.mastered}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#DB2777] shrink-0" aria-hidden="true" />
              <span>Kanji</span>
              <span className="font-mono-num tabular-nums text-slate-900 dark:text-slate-200 font-semibold">
                {kanji.mastered}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#7C3AED] shrink-0" aria-hidden="true" />
              <span>Kosakata</span>
              <span className="font-mono-num tabular-nums text-slate-900 dark:text-slate-200 font-semibold">
                {vocabulary.mastered}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-[2px] bg-slate-300 dark:bg-slate-600 shrink-0"
                aria-hidden="true"
              />
              <span>Sedang Dipelajari</span>
              <span className="font-mono-num tabular-nums text-slate-900 dark:text-slate-200 font-semibold">
                {totalLearning}
              </span>
            </span>
          </div>

          <span className="font-mono-num tabular-nums text-slate-500 dark:text-slate-400">
            Sisa belum mulai: {totalRemaining}
          </span>
        </div>
      </div>

      {/* Per-Category Mastery Bars (Radikal / Kanji / Kosakata) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4 border-t border-slate-100 dark:border-slate-800">
        {categories.map((cat) => {
          const masteredPct = toPercent(cat.data.mastered, cat.data.total);
          const masteredWidth = toExactWidth(cat.data.mastered, cat.data.total);
          const activeWidth = toExactWidth(
            cat.data.mastered + cat.data.learning,
            cat.data.total
          );

          return (
            <div key={cat.key} className="space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onInspectCategory(cat.key)}
                  className="font-semibold text-slate-800 dark:text-slate-200 hover:underline whitespace-nowrap cursor-pointer"
                >
                  {cat.label}
                </button>
                <div className="flex items-center gap-2 font-mono-num tabular-nums shrink-0">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {cat.data.mastered} / {cat.data.total}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 w-9 text-right">
                    {masteredPct}%
                  </span>
                </div>
              </div>

              {/* Dual-layer track (Apprentice tint + Guru+ solid + optional 90% threshold tick) */}
              <div
                role="progressbar"
                aria-label={`${cat.label} Level ${currentLevel}: ${cat.data.mastered} dikuasai dari ${cat.data.total} (${masteredPct}%)`}
                aria-valuenow={masteredPct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="relative h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full"
              >
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  {activeWidth > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 opacity-30"
                      style={{
                        width: `${activeWidth}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  )}
                  {masteredWidth > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                      style={{
                        width: `${masteredWidth}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  )}
                </div>

                {cat.targetMarkerPct !== null && (
                  <span
                    title={cat.targetTooltip}
                    aria-hidden="true"
                    className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-slate-900 dark:bg-white rounded-full"
                    style={{ left: `${cat.targetMarkerPct}%` }}
                  />
                )}
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug font-mono-num tabular-nums truncate">
                {cat.caption}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
