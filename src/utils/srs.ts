import { CurriculumDataset, MAX_LEVEL } from '../data/curriculum';
import {
  CurriculumItem,
  ItemType,
  ReviewHistoryEntry,
  SrsCategory,
  SrsStage,
  UserItemProgress,
  UserState,
} from '../types/curriculum';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Authentic WaniKani SRS intervals from stage N to next review */
export const SRS_INTERVALS_MS: Record<SrsStage, number | null> = {
  0: null,
  1: 4 * HOUR_MS,      // Apprentice I -> 4 jam
  2: 8 * HOUR_MS,      // Apprentice II -> 8 jam
  3: 1 * DAY_MS,       // Apprentice III -> 1 hari
  4: 2 * DAY_MS,       // Apprentice IV -> 2 hari
  5: 7 * DAY_MS,       // Guru I -> 1 minggu
  6: 14 * DAY_MS,      // Guru II -> 2 minggu
  7: 30 * DAY_MS,      // Master -> 1 bulan
  8: 120 * DAY_MS,     // Enlightened -> 4 bulan
  9: null,             // Burned -> Tamat
};

export const SRS_STAGE_NAMES: Record<SrsStage, string> = {
  0: 'Pelajaran',
  1: 'Apprentice I',
  2: 'Apprentice II',
  3: 'Apprentice III',
  4: 'Apprentice IV',
  5: 'Guru I',
  6: 'Guru II',
  7: 'Master',
  8: 'Enlightened',
  9: 'Burned',
};

export function getSrsCategory(stage: SrsStage | null | undefined): SrsCategory {
  if (stage === null || stage === undefined) return 'locked';
  if (stage === 0) return 'lesson';
  if (stage <= 4) return 'apprentice';
  if (stage <= 6) return 'guru';
  if (stage === 7) return 'master';
  if (stage === 8) return 'enlightened';
  return 'burned';
}

export function getCategoryLabel(cat: SrsCategory): string {
  switch (cat) {
    case 'locked': return 'Terkunci';
    case 'lesson': return 'Pelajaran';
    case 'apprentice': return 'Apprentice';
    case 'guru': return 'Guru';
    case 'master': return 'Master';
    case 'enlightened': return 'Enlightened';
    case 'burned': return 'Burned';
  }
}

export function getItemTypeLabel(type: ItemType): string {
  switch (type) {
    case 'radical': return 'Radikal';
    case 'kanji': return 'Kanji';
    case 'vocabulary': return 'Kosakata';
  }
}

export function getTodayDateStr(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function createEmptyProgress(itemId: string): UserItemProgress {
  return {
    itemId,
    srsStage: null,
    unlockedAt: null,
    startedAt: null,
    nextReviewAt: null,
    burnedAt: null,
    meaningCorrect: 0,
    meaningIncorrect: 0,
    readingCorrect: 0,
    readingIncorrect: 0,
    lastReviewedAt: null,
    lastIncorrectAt: null,
    userSynonyms: [],
    meaningNote: '',
    readingNote: '',
  };
}

export function getProgressOrDefault(
  state: UserState,
  itemId: string
): UserItemProgress {
  return state.progress[itemId] ?? createEmptyProgress(itemId);
}

/**
 * Exact WaniKani SRS stage progression formula:
 * - 0 mistakes -> stage + 1 (max 9)
 * - >= 1 mistakes -> drop by ceil(mistakes / 2) * (stage >= 5 ? 2 : 1), min 1
 */
export function calculateNextSrsStage(
  currentStage: SrsStage,
  incorrectCount: number
): SrsStage {
  if (incorrectCount === 0) {
    return Math.min(9, currentStage + 1) as SrsStage;
  }
  const adjustment = Math.ceil(incorrectCount / 2);
  const penaltyFactor = currentStage >= 5 ? 2 : 1;
  return Math.max(1, currentStage - adjustment * penaltyFactor) as SrsStage;
}

/** Round review timestamp down to the top of the hour (WaniKani batching behavior) */
export function calculateNextReviewAt(nextStage: SrsStage, now = Date.now()): number | null {
  const interval = SRS_INTERVALS_MS[nextStage];
  if (interval === null) return null;
  const target = new Date(now + interval);
  target.setMinutes(0, 0, 0);
  return target.getTime();
}

/**
 * Sparse progress reconciler across all 60 levels:
 * - Checks >= 90% Kanji Guru rule for automatic Level Up (up to Level 60)
 * - Unlocks Radicals of <= currentLevel, and unlocks Kanji/Vocab whose dependencies reached Guru (stage >= 5)
 * - Only writes entries into state.progress for unlocked items (keeps localStorage tiny!)
 */
export function reconcileUnlocksAndLevelUp(
  state: UserState,
  dataset: CurriculumDataset,
  now = Date.now()
): { nextState: UserState; newlyUnlockedIds: string[]; leveledUpTo: number | null } {
  const progress: Record<string, UserItemProgress> = { ...state.progress };
  let currentLevel = Math.min(MAX_LEVEL, Math.max(1, state.currentLevel));
  let leveledUpTo: number | null = null;
  const newlyUnlockedIds: string[] = [];

  // Check Level-Up condition: >= 90% of current level's Kanji at Guru (stage >= 5)
  while (currentLevel < MAX_LEVEL) {
    const levelKanji = (dataset.byLevel[currentLevel] ?? []).filter(
      (i) => i.type === 'kanji'
    );
    const guruCount = levelKanji.filter(
      (k) => (progress[k.id]?.srsStage ?? -1) >= 5
    ).length;
    const required = Math.ceil(levelKanji.length * 0.9);
    if (levelKanji.length > 0 && guruCount >= required) {
      currentLevel += 1;
      leveledUpTo = currentLevel;
    } else {
      break;
    }
  }

  // Unlock eligible items for levels 1..currentLevel
  for (let lvl = 1; lvl <= currentLevel; lvl++) {
    const levelItems = dataset.byLevel[lvl] ?? [];
    for (const item of levelItems) {
      const existing = progress[item.id];
      if (existing && existing.srsStage !== null) continue;

      let canUnlock = false;
      if (item.type === 'radical') {
        canUnlock = true;
      } else {
        const deps = item.componentIds ?? [];
        canUnlock =
          deps.length === 0 ||
          deps.every((depId) => {
            const depProg = progress[depId];
            return depProg && depProg.srsStage !== null && depProg.srsStage >= 5;
          });
      }

      if (canUnlock) {
        progress[item.id] = {
          ...(existing ?? createEmptyProgress(item.id)),
          srsStage: 0,
          unlockedAt: now,
        };
        newlyUnlockedIds.push(item.id);
      }
    }
  }

  return {
    nextState: {
      ...state,
      currentLevel,
      progress,
      levelUpNotification: leveledUpTo ?? state.levelUpNotification,
    },
    newlyUnlockedIds,
    leveledUpTo,
  };
}

/** Create a completely fresh Level 1 state (all 16 Level 1 radicals ready in Lesson Queue) */
export function createFreshLevel1State(
  dataset: CurriculumDataset,
  now = Date.now()
): UserState {
  const base: UserState = {
    currentLevel: 1,
    progress: {},
    history: [],
    settings: {
      lessonBatchSize: 5,
      autoplayAudio: true,
      darkMode: false,
      vacationMode: false,
      vacationStartedAt: null,
      dailyReviewGoal: 25,
    },
    streakDays: 0,
    lastActiveDate: null,
    totalReviewsDone: 0,
    levelUpNotification: null,
  };
  return reconcileUnlocksAndLevelUp(base, dataset, now).nextState;
}

/**
 * Create a lively, realistic starter state at Level 1 using real Level 1 IDs from the 60-level dataset:
 * - 10 Level 1 radicals already at Guru I (unlocking Level 1 Kanji & Vocab!)
 * - 8 items (Radicals, Kanji, Vocab) ready for Daily Review immediately
 * - Lessons queue populated and upcoming reviews scheduled across 7 days for the Forecast
 */
export function createStarterState(
  dataset: CurriculumDataset,
  now = Date.now()
): UserState {
  const base = createFreshLevel1State(dataset, now);
  const progress = { ...base.progress };

  const lv1Items = dataset.byLevel[1] ?? [];
  const lv1Rads = lv1Items.filter((i) => i.type === 'radical');
  const lv1Kanji = lv1Items.filter((i) => i.type === 'kanji');
  const lv1Vocab = lv1Items.filter((i) => i.type === 'vocabulary');

  const setItem = (
    id: string,
    stage: SrsStage,
    nextOffsetHours: number | null,
    stats?: { mc?: number; mi?: number; rc?: number; ri?: number; lastErr?: boolean }
  ) => {
    const p = progress[id] ?? createEmptyProgress(id);
    progress[id] = {
      ...p,
      srsStage: stage,
      unlockedAt: now - 5 * DAY_MS,
      startedAt: stage > 0 ? now - 4 * DAY_MS : null,
      nextReviewAt:
        nextOffsetHours === null ? null : now + nextOffsetHours * HOUR_MS,
      burnedAt: stage === 9 ? now - DAY_MS : null,
      meaningCorrect: stats?.mc ?? (stage > 0 ? stage + 1 : 0),
      meaningIncorrect: stats?.mi ?? 0,
      readingCorrect: stats?.rc ?? (stage > 0 ? stage + 1 : 0),
      readingIncorrect: stats?.ri ?? 0,
      lastReviewedAt: stage > 0 ? now - 6 * HOUR_MS : null,
      lastIncorrectAt: stats?.lastErr ? now - 5 * HOUR_MS : null,
    };
  };

  // Promote first 10 Level 1 radicals to Guru I, 2 due right now, 2 upcoming, rest in Lesson queue
  lv1Rads.forEach((rad, idx) => {
    if (idx < 10) {
      setItem(rad.id, 5, 36 + idx * 12, { mc: 5, mi: idx === 3 ? 1 : 0 });
    } else if (idx < 12) {
      setItem(rad.id, 4, -1, { mc: 4, mi: 0 }); // Due now -> promotes to Guru!
    } else if (idx < 14) {
      setItem(rad.id, 2, 2 + (idx - 12) * 3, { mc: 2, mi: 1, lastErr: idx === 12 });
    }
  });

  // Unlock & seed Level 1 Kanji whose radicals are now Guru
  const unlockedKanji = lv1Kanji.filter((k) =>
    (k.componentIds ?? []).every((cid) => (progress[cid]?.srsStage ?? -1) >= 5)
  );
  unlockedKanji.forEach((k, idx) => {
    if (idx < 5) {
      setItem(k.id, 5, 60 + idx * 18, { mc: 5, rc: 5 });
    } else if (idx < 8) {
      setItem(k.id, (4 - (idx - 5)) as SrsStage, -0.5, {
        mc: 3,
        rc: 2,
        ri: idx === 6 ? 1 : 0,
        lastErr: idx === 6,
      }); // Due now!
    } else if (idx < 10) {
      setItem(k.id, 2, 4 + (idx - 8) * 5, { mc: 2, rc: 2 });
    }
  });

  // Unlock & seed Level 1 Vocab whose kanji are now Guru
  const unlockedVocab = lv1Vocab.filter((v) =>
    (v.componentIds ?? []).every((cid) => (progress[cid]?.srsStage ?? -1) >= 5)
  );
  unlockedVocab.slice(0, 8).forEach((v, idx) => {
    if (idx < 3) {
      setItem(v.id, 3, -1, {
        mc: 3,
        rc: 2,
        ri: idx === 1 ? 1 : 0,
        lastErr: idx === 1,
      }); // Due now!
    } else if (idx < 6) {
      setItem(v.id, 2, 3 + (idx - 3) * 6, { mc: 2, rc: 2 });
    } else {
      setItem(v.id, 6, 168, { mc: 7, rc: 7 });
    }
  });

  const history: ReviewHistoryEntry[] = [4, 3, 2, 1, 0].map((daysAgo, idx) => {
    const d = getTodayDateStr(now - daysAgo * DAY_MS);
    const counts = [14, 22, 18, 28, 12];
    const lessons = [5, 5, 4, 5, 3];
    const reviewMins = [9, 14, 11, 19, 8];
    const studyMins = [12, 16, 10, 15, 9];
    const total = counts[idx];
    return {
      date: d,
      reviewsCompleted: total,
      correctCount: Math.round(total * 0.88),
      lessonsCompleted: lessons[idx],
      reviewMinutes: reviewMins[idx],
      studyMinutes: studyMins[idx],
    };
  });

  const seeded: UserState = {
    ...base,
    progress,
    history,
    streakDays: 5,
    lastActiveDate: getTodayDateStr(now),
    totalReviewsDone: 94,
  };

  return reconcileUnlocksAndLevelUp(seeded, dataset, now).nextState;
}

export function getLessonQueue(
  state: UserState,
  dataset: CurriculumDataset
): CurriculumItem[] {
  const queue: CurriculumItem[] = [];
  for (const [id, p] of Object.entries(state.progress)) {
    if (p.srsStage === 0) {
      const item = dataset.byId[id];
      if (item) queue.push(item);
    }
  }
  const typeOrder: Record<ItemType, number> = { radical: 0, kanji: 1, vocabulary: 2 };
  return queue.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return typeOrder[a.type] - typeOrder[b.type];
  });
}

export function getAvailableReviews(
  state: UserState,
  dataset: CurriculumDataset,
  now = Date.now()
): CurriculumItem[] {
  if (state.settings.vacationMode) return [];
  const list: CurriculumItem[] = [];
  for (const [id, p] of Object.entries(state.progress)) {
    if (
      p.srsStage !== null &&
      p.srsStage >= 1 &&
      p.srsStage <= 8 &&
      p.nextReviewAt !== null &&
      p.nextReviewAt <= now
    ) {
      const item = dataset.byId[id];
      if (item) list.push(item);
    }
  }
  return list;
}

export interface SrsDistribution {
  apprentice: { total: number; radical: number; kanji: number; vocabulary: number };
  guru: { total: number; radical: number; kanji: number; vocabulary: number };
  master: { total: number; radical: number; kanji: number; vocabulary: number };
  enlightened: { total: number; radical: number; kanji: number; vocabulary: number };
  burned: { total: number; radical: number; kanji: number; vocabulary: number };
}

export function getSrsDistribution(
  state: UserState,
  dataset: CurriculumDataset
): SrsDistribution {
  const empty = () => ({ total: 0, radical: 0, kanji: 0, vocabulary: 0 });
  const dist: SrsDistribution = {
    apprentice: empty(),
    guru: empty(),
    master: empty(),
    enlightened: empty(),
    burned: empty(),
  };

  for (const [id, p] of Object.entries(state.progress)) {
    const cat = getSrsCategory(p.srsStage);
    if (cat === 'locked' || cat === 'lesson') continue;
    const item = dataset.byId[id];
    if (!item) continue;
    dist[cat].total += 1;
    dist[cat][item.type] += 1;
  }
  return dist;
}

export interface ForecastDay {
  dateKey: string;
  label: string;
  isToday: boolean;
  addedCount: number;
  cumulativeTotal: number;
  hours: { hour: number; label: string; added: number; cumulative: number }[];
}

export function buildReviewForecast(
  state: UserState,
  dataset: CurriculumDataset,
  now = Date.now()
): ForecastDay[] {
  const currentAvailable = getAvailableReviews(state, dataset, now).length;
  const upcomingTimestamps: number[] = [];

  for (const [id, p] of Object.entries(state.progress)) {
    if (
      dataset.byId[id] &&
      p.srsStage !== null &&
      p.srsStage >= 1 &&
      p.srsStage <= 8 &&
      p.nextReviewAt !== null &&
      p.nextReviewAt > now
    ) {
      upcomingTimestamps.push(p.nextReviewAt);
    }
  }

  const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const days: ForecastDay[] = [];
  let runningTotal = currentAvailable;

  for (let d = 0; d < 7; d++) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() + d);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayKey = getTodayDateStr(dayStart.getTime());
    const label =
      d === 0
        ? 'Hari Ini'
        : d === 1
        ? 'Besok'
        : `${dayNames[dayStart.getDay()]}, ${dayStart.getDate()}/${dayStart.getMonth() + 1}`;

    const hourMap = new Map<number, number>();
    let addedDay = 0;

    for (const ts of upcomingTimestamps) {
      if (ts >= dayStart.getTime() && ts < dayEnd.getTime()) {
        const h = new Date(ts).getHours();
        hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
        addedDay += 1;
      }
    }

    const hours = Array.from(hourMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, added]) => {
        runningTotal += added;
        return {
          hour,
          label: `${String(hour).padStart(2, '0')}:00`,
          added,
          cumulative: runningTotal,
        };
      });

    days.push({
      dateKey: dayKey,
      label,
      isToday: d === 0,
      addedCount: addedDay,
      cumulativeTotal: runningTotal,
      hours,
    });
  }

  return days;
}

export function getAccuracyPercent(p: UserItemProgress | undefined): number | null {
  if (!p) return null;
  const total =
    p.meaningCorrect + p.meaningIncorrect + p.readingCorrect + p.readingIncorrect;
  if (total === 0) return null;
  return Math.round(((p.meaningCorrect + p.readingCorrect) / total) * 100);
}

export function formatRelativeTime(targetTs: number | null, now = Date.now()): string {
  if (targetTs === null) return '—';
  const diff = targetTs - now;
  if (diff <= 0) return 'Siap Sekarang';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `dalam ${mins} menit`;
  const hours = Math.round(diff / HOUR_MS);
  if (hours < 24) return `dalam ${hours} jam`;
  const days = Math.round(diff / DAY_MS);
  if (days < 30) return `dalam ${days} hari`;
  const months = Math.round(days / 30);
  return `dalam ${months} bulan`;
}
