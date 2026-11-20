import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Search } from 'lucide-react';
import { getTierForLevel, LEVEL_TIERS, MAX_LEVEL } from '../data/curriculum';
import { useApp } from '../context/AppContext';
import { ItemType, SrsCategory } from '../types/curriculum';
import { getCategoryLabel, getItemTypeLabel, getSrsCategory } from '../utils/srs';

interface CurriculumBrowserProps {
  mode: 'levels' | 'radicals' | 'kanji' | 'vocabulary';
}

const SRS_FILTERS: { id: 'all' | SrsCategory; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'lesson', label: 'Pelajaran' },
  { id: 'apprentice', label: 'Apprentice' },
  { id: 'guru', label: 'Guru' },
  { id: 'master', label: 'Master' },
  { id: 'enlightened', label: 'Enlightened' },
  { id: 'burned', label: 'Burned' },
  { id: 'locked', label: 'Terkunci' },
];

const PAGE_SIZE = 60;

export const CurriculumBrowser: React.FC<CurriculumBrowserProps> = ({ mode }) => {
  const { dataset, state, openItemDetail, setActiveView } = useApp();

  // Levels Hierarchy state (60 levels grouped into 6 WaniKani tiers)
  const [selectedLevel, setSelectedLevel] = useState<number>(state.currentLevel);
  const [selectedTierId, setSelectedTierId] = useState<string>(
    () => getTierForLevel(state.currentLevel).id
  );

  // Directory filters
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [exactLevelFilter, setExactLevelFilter] = useState<number | 'all'>('all');
  const [srsFilter, setSrsFilter] = useState<'all' | SrsCategory>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Reset pagination when filters or mode change
  useEffect(() => {
    setPage(1);
  }, [mode, tierFilter, exactLevelFilter, srsFilter, query]);

  // ============================================================================
  // LEVELS HIERARCHY VIEW (ALL 60 LEVELS IN 6 WANIKANI TIERS)
  // ============================================================================
  if (mode === 'levels') {
    const activeTier =
      LEVEL_TIERS.find((t) => t.id === selectedTierId) ?? LEVEL_TIERS[0];
    const levelsInTier = Array.from(
      { length: activeTier.endLevel - activeTier.startLevel + 1 },
      (_, idx) => activeTier.startLevel + idx
    );

    const items = dataset.byLevel[selectedLevel] ?? [];
    const radicals = items.filter((i) => i.type === 'radical');
    const kanjis = items.filter((i) => i.type === 'kanji');
    const vocabs = items.filter((i) => i.type === 'vocabulary');
    const selectedLevelTier = getTierForLevel(selectedLevel);

    const renderGroup = (
      title: string,
      subtitle: string,
      type: ItemType,
      list: typeof items
    ) => {
      const bg =
        type === 'radical'
          ? 'bg-[#0284C7]'
          : type === 'kanji'
          ? 'bg-[#DB2777]'
          : 'bg-[#7C3AED]';
      const guruCount = list.filter(
        (i) => (state.progress[i.id]?.srsStage ?? -1) >= 5
      ).length;

      return (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {title} ({list.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            </div>
            <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
              {guruCount} / {list.length} mencapai Guru
            </span>
          </div>

          {list.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
              Level ini menggunakan kombinasi radikal dari level sebelumnya (tidak ada radikal baru).
            </p>
          ) : (
            <div
              className={
                type === 'vocabulary'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5'
                  : 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5'
              }
            >
              {list.map((item) => {
                const p = state.progress[item.id];
                const cat = getSrsCategory(p?.srsStage);
                const locked = cat === 'locked';

                if (type === 'vocabulary') {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openItemDetail(item.id)}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        locked
                          ? 'border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-[#161A22]/60 opacity-70'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-[#7C3AED]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`font-jp text-base font-bold text-white px-2.5 py-1 rounded shrink-0 ${
                            locked ? 'bg-slate-400 dark:bg-slate-700' : bg
                          }`}
                        >
                          {item.characters}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {item.primaryMeaning}
                          </div>
                          <div className="font-jp text-xs text-slate-500 dark:text-slate-400 truncate">
                            {item.readings?.[0]}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
                        {locked ? <Lock className="w-3.5 h-3.5" /> : getCategoryLabel(cat)}
                      </span>
                    </button>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItemDetail(item.id)}
                    className={`min-w-0 p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                      locked
                        ? 'border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-[#161A22]/60 opacity-70'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    <div
                      className={`font-jp text-2xl font-bold text-white rounded-lg py-2 leading-none ${
                        locked ? 'bg-slate-400 dark:bg-slate-700' : bg
                      }`}
                    >
                      {item.characters}
                    </div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white mt-2 truncate">
                      {item.primaryMeaning}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {item.type === 'kanji' && (
                        <span className="font-jp">
                          {item.primaryReadingType === 'kunyomi'
                            ? item.kunyomi?.[0] ?? item.onyomi?.[0]
                            : item.onyomi?.[0] ?? item.kunyomi?.[0]}
                        </span>
                      )}
                      {item.type === 'kanji' && ' · '}
                      <span>{getCategoryLabel(cat)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      );
    };

    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            60 Level Lengkap · {dataset.counts.radicals.toLocaleString('id-ID')} Radikal · {dataset.counts.kanji.toLocaleString('id-ID')} Kanji · {dataset.counts.vocabulary.toLocaleString('id-ID')} Kosakata
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Hierarki 60 Level KaniMichi
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Disusun mengikuti 6 tahapan penuh WaniKani (Pleasant hingga Reality). Klik level mana pun untuk memeriksa struktur Radikal → Kanji → Kosakata.
          </p>
        </div>

        {/* 6 WaniKani Tier Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-x-auto">
          {LEVEL_TIERS.map((tier) => {
            const active = tier.id === selectedTierId;
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => {
                  setSelectedTierId(tier.id);
                  if (selectedLevel < tier.startLevel || selectedLevel > tier.endLevel) {
                    setSelectedLevel(tier.startLevel);
                  }
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tier.name} ({tier.startLevel}–{tier.endLevel})
              </button>
            );
          })}
        </div>

        {/* 10 Levels Grid inside Selected Tier */}
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {levelsInTier.map((lvl) => {
            const isSelected = selectedLevel === lvl;
            const isUnlockedLevel = lvl <= state.currentLevel;
            const lvlKanji = (dataset.byLevel[lvl] ?? []).filter(
              (i) => i.type === 'kanji'
            );
            const lvlKanjiGuru = lvlKanji.filter(
              (k) => (state.progress[k.id]?.srsStage ?? -1) >= 5
            ).length;
            const pct = lvlKanji.length
              ? Math.round((lvlKanjiGuru / lvlKanji.length) * 100)
              : 0;

            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setSelectedLevel(lvl)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#0284C7] bg-white dark:bg-[#161A22] ring-1 ring-[#0284C7]'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono-num">
                  <span className="font-display font-bold text-slate-900 dark:text-white">
                    Lv {lvl}
                  </span>
                  {!isUnlockedLevel ? (
                    <Lock className="w-3 h-3 text-slate-400" />
                  ) : (
                    <span className="text-[#0284C7] font-semibold">{pct}%</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
                  {lvlKanji.length} kanji
                </div>
                <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-[#0284C7] rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Level Hierarchy Detail */}
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {selectedLevelTier.name} ({selectedLevelTier.labelId}) ·{' '}
                {selectedLevel <= state.currentLevel
                  ? 'Level Terbuka'
                  : 'Level Terkunci (Pratinjau)'}
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                Level {selectedLevel} dari {MAX_LEVEL}
              </h2>
            </div>
            <div className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
              {radicals.length} Radikal · {kanjis.length} Kanji · {vocabs.length} Kosakata
            </div>
          </div>

          {renderGroup(
            '1. Radikal (Fondasi Bentuk)',
            'Pelajari komponen visual dasar hingga tahap Guru.',
            'radical',
            radicals
          )}

          {renderGroup(
            '2. Kanji (Kombinasi Radikal)',
            'Terbuka otomatis saat semua radikal penyusunnya mencapai Guru.',
            'kanji',
            kanjis
          )}

          {renderGroup(
            '3. Kosakata (Penerapan Nyata)',
            'Terbuka otomatis saat kanji penyusunnya mencapai Guru.',
            'vocabulary',
            vocabs
          )}
        </div>
      </main>
    );
  }

  // ============================================================================
  // DIRECTORY VIEW: RADICALS (478) / KANJI (2,026) / VOCABULARY (6,584)
  // ============================================================================
  const targetType: ItemType =
    mode === 'radicals' ? 'radical' : mode === 'kanji' ? 'kanji' : 'vocabulary';

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeTierObj =
      tierFilter === 'all'
        ? null
        : LEVEL_TIERS.find((t) => t.id === tierFilter) ?? null;

    return dataset.byType[targetType].filter((item) => {
      if (exactLevelFilter !== 'all' && item.level !== exactLevelFilter) {
        return false;
      }
      if (
        exactLevelFilter === 'all' &&
        activeTierObj &&
        (item.level < activeTierObj.startLevel || item.level > activeTierObj.endLevel)
      ) {
        return false;
      }
      if (srsFilter !== 'all') {
        const cat = getSrsCategory(state.progress[item.id]?.srsStage);
        if (cat !== srsFilter) return false;
      }
      if (q) {
        const matchChar = item.characters.includes(q);
        const matchMeaning =
          item.primaryMeaning.toLowerCase().includes(q) ||
          item.acceptedMeanings.some((m) => m.includes(q));
        const matchReading =
          item.onyomi?.some((r) => r.includes(q)) ||
          item.kunyomi?.some((r) => r.includes(q)) ||
          item.readings?.some((r) => r.includes(q));
        if (!matchChar && !matchMeaning && !matchReading) return false;
      }
      return true;
    });
  }, [dataset, targetType, tierFilter, exactLevelFilter, srsFilter, query, state.progress]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredItems.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const accentBg =
    targetType === 'radical'
      ? 'bg-[#0284C7]'
      : targetType === 'kanji'
      ? 'bg-[#DB2777]'
      : 'bg-[#7C3AED]';

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {mode === 'vocabulary' && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-0.5 max-w-full overflow-x-auto no-scrollbar">
            <button
              type="button"
              className="px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 whitespace-nowrap cursor-pointer"
            >
              Kosakata Kanji ({dataset.counts.vocabulary.toLocaleString('id-ID')})
            </button>
            <button
              type="button"
              onClick={() => setActiveView('kana-vocab')}
              className="px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
            >
              Kosakata Non-Kanji JLPT (200)
            </button>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Kana-only, Katakana &amp; Onomatope N5–N1 tersedia di tab Non-Kanji
          </span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            Katalog Penuh · Level 1–{MAX_LEVEL}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-0.5">
            Daftar {getItemTypeLabel(targetType)} ({filteredItems.length.toLocaleString('id-ID')})
          </h1>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full md:w-auto">
          <select
            aria-label="Filter level spesifik"
            value={exactLevelFilter}
            onChange={(e) => {
              const v = e.target.value;
              setExactLevelFilter(v === 'all' ? 'all' : Number(v));
            }}
            className="px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] text-slate-900 dark:text-white shrink-0"
          >
            <option value="all">Semua Level</option>
            {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((lvl) => (
              <option key={lvl} value={lvl}>
                Level {lvl}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[160px] md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Cari ${getItemTypeLabel(targetType).toLowerCase()}...`}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
            />
          </div>
        </div>
      </div>

      {/* Tier + SRS Filter Bars */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white dark:bg-[#161A22] p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setTierFilter('all');
              setExactLevelFilter('all');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              tierFilter === 'all' && exactLevelFilter === 'all'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Semua (1–60)
          </button>
          {LEVEL_TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTierFilter(t.id);
                setExactLevelFilter('all');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer font-mono-num ${
                tierFilter === t.id && exactLevelFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.startLevel}–{t.endLevel}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
          {SRS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSrsFilter(f.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                srsFilter === f.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results Grid */}
      {pageItems.length === 0 ? (
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Tidak ada item yang cocok dengan filter pencarianmu.
        </div>
      ) : targetType === 'vocabulary' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pageItems.map((item) => {
            const cat = getSrsCategory(state.progress[item.id]?.srsStage);
            const locked = cat === 'locked';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openItemDetail(item.id)}
                className={`p-4 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                  locked
                    ? 'border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-[#161A22]/70 opacity-75'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-[#7C3AED]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`font-jp text-lg font-bold text-white px-2.5 py-1 rounded shrink-0 ${
                      locked ? 'bg-slate-400 dark:bg-slate-700' : accentBg
                    }`}
                  >
                    {item.characters}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {item.primaryMeaning}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      <span className="font-jp">{item.readings?.[0]}</span> · Lv.{item.level}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  {getCategoryLabel(cat)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {pageItems.map((item) => {
            const cat = getSrsCategory(state.progress[item.id]?.srsStage);
            const locked = cat === 'locked';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openItemDetail(item.id)}
                className={`min-w-0 p-3 rounded-xl border text-center transition-colors cursor-pointer ${
                  locked
                    ? 'border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-[#161A22]/70 opacity-75'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <div
                  className={`font-jp text-3xl font-bold text-white rounded-lg py-3 leading-none ${
                    locked ? 'bg-slate-400 dark:bg-slate-700' : accentBg
                  }`}
                >
                  {item.characters}
                </div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white mt-2 truncate">
                  {item.primaryMeaning}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate font-mono-num">
                  Lv.{item.level} · {getCategoryLabel(cat)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            Halaman {safePage} dari {totalPages} · Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filteredItems.length)} dari{' '}
            {filteredItems.length.toLocaleString('id-ID')} item
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
            >
              Berikutnya
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
