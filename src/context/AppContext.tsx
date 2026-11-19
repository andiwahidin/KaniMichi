import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  fetchAnnouncements,
  fetchCloudSrsState,
  fetchCurriculumOverrides,
  fetchOrCreateUserProfile,
  isSupabaseConfigured,
  saveCloudSrsState,
  supabase,
  updateOwnDisplayName,
  updateOwnPassword,
} from '../lib/supabase';
import {
  CurriculumDataset,
  loadCurriculumDataset,
  MAX_LEVEL,
} from '../data/curriculum';
import {
  ActiveView,
  Announcement,
  CurriculumItem,
  CurriculumOverride,
  ExtraStudyMode,
  SrsStage,
  UserProfile,
  UserSettings,
  UserState,
} from '../types/curriculum';
import {
  calculateNextReviewAt,
  calculateNextSrsStage,
  createEmptyProgress,
  createFreshLevel1State,
  createStarterState,
  getAvailableReviews,
  getLessonQueue,
  getTodayDateStr,
  reconcileUnlocksAndLevelUp,
} from '../utils/srs';

const STORAGE_KEY = 'kanimichi_srs_state_v2';

export type AuthModalTab = 'login' | 'register';

export interface ReviewOutcome {
  itemId: string;
  previousStage: SrsStage;
  newStage: SrsStage;
  meaningErrors: number;
  readingErrors: number;
  newlyUnlockedIds: string[];
  leveledUpTo: number | null;
}

interface AppContextValue {
  dataset: CurriculumDataset;
  state: UserState;
  now: number;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  selectedItemId: string | null;
  openItemDetail: (itemId: string) => void;
  closeItemDetail: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  authModalOpen: boolean;
  authModalTab: AuthModalTab;
  openAuthModal: (tab?: AuthModalTab) => void;
  closeAuthModal: () => void;
  extraStudyMode: ExtraStudyMode;
  startExtraStudy: (mode: ExtraStudyMode) => void;
  lessonQueue: CurriculumItem[];
  availableReviews: CurriculumItem[];
  completeLessonBatch: (itemIds: string[]) => void;
  submitItemReview: (
    itemId: string,
    meaningErrors: number,
    readingErrors: number
  ) => ReviewOutcome;
  updateUserNotes: (
    itemId: string,
    updates: { userSynonyms?: string[]; meaningNote?: string; readingNote?: string }
  ) => void;
  resurrectBurnedItem: (itemId: string) => void;
  updateSettings: (partial: Partial<UserSettings>) => void;
  toggleVacationMode: () => void;
  fastForwardTime: (hours: number) => void;
  forceAllReviewsDue: () => void;
  jumpToLevel: (targetLevel: number) => void;
  resetProgress: (mode: 'fresh' | 'starter') => void;
  importStateJson: (jsonStr: string) => { ok: boolean; error?: string };
  dismissLevelUpBanner: () => void;
  isSupabaseEnabled: boolean;
  cloudUser: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  schemaNeedsUpdate: boolean;
  cloudSyncing: boolean;
  lastCloudSyncAt: number | null;
  cloudError: string | null;
  announcements: Announcement[];
  curriculumOverrides: Record<string, CurriculumOverride>;
  refreshAnnouncements: () => Promise<void>;
  refreshCurriculumOverrides: () => Promise<void>;
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; message?: string }>;
  signInWithGoogle: () => Promise<{ ok: boolean; message?: string }>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ ok: boolean; message?: string }>;
  signOutCloud: () => Promise<void>;
  syncNow: () => Promise<{ ok: boolean; message?: string }>;
  updateProfileName: (newName: string) => Promise<{ ok: boolean; message?: string }>;
  changePassword: (newPassword: string) => Promise<{ ok: boolean; message?: string }>;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadSavedState(dataset: CurriculumDataset): UserState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserState;
      if (parsed && typeof parsed.currentLevel === 'number' && parsed.progress) {
        return reconcileUnlocksAndLevelUp(parsed, dataset).nextState;
      }
    }
  } catch {
    // Fallback to starter state
  }
  return createStarterState(dataset);
}

function applyCurriculumOverrides(
  base: CurriculumDataset,
  overrides: Record<string, CurriculumOverride>
): CurriculumDataset {
  const keys = Object.keys(overrides);
  if (keys.length === 0) return base;

  const byId: Record<string, CurriculumItem> = { ...base.byId };
  let changed = false;

  for (const itemId of keys) {
    const ov = overrides[itemId];
    const orig = byId[itemId];
    if (!orig) continue;
    changed = true;
    const nextPrimary = ov.primaryMeaning?.trim() || orig.primaryMeaning;
    const accepted = nextPrimary
      ? Array.from(new Set([nextPrimary.toLowerCase(), ...orig.acceptedMeanings]))
      : orig.acceptedMeanings;

    byId[itemId] = {
      ...orig,
      primaryMeaning: nextPrimary,
      acceptedMeanings: accepted,
      meaningMnemonic: ov.meaningMnemonic?.trim() || orig.meaningMnemonic,
      readingMnemonic: ov.readingMnemonic?.trim() || orig.readingMnemonic,
    };
  }

  if (!changed) return base;

  const items = base.items.map((item) => byId[item.id] ?? item);
  const byLevel: Record<number, CurriculumItem[]> = {};
  for (const [lvl, list] of Object.entries(base.byLevel)) {
    byLevel[Number(lvl)] = list.map((item) => byId[item.id] ?? item);
  }
  const byType: CurriculumDataset['byType'] = {
    radical: base.byType.radical.map((item) => byId[item.id] ?? item),
    kanji: base.byType.kanji.map((item) => byId[item.id] ?? item),
    vocabulary: base.byType.vocabulary.map((item) => byId[item.id] ?? item),
  };

  return {
    ...base,
    items,
    byId,
    byLevel,
    byType,
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [baseDataset, setBaseDataset] = useState<CurriculumDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<UserState | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>('login');
  const [extraStudyMode, setExtraStudyMode] = useState<ExtraStudyMode>('recent-mistakes');

  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [schemaNeedsUpdate, setSchemaNeedsUpdate] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [curriculumOverrides, setCurriculumOverrides] = useState<
    Record<string, CurriculumOverride>
  >({});

  const stateRef = useRef<UserState | null>(null);
  const skipNextCloudSaveRef = useRef(false);
  const cloudHydratedUserRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dataset = useMemo(
    () => (baseDataset ? applyCurriculumOverrides(baseDataset, curriculumOverrides) : null),
    [baseDataset, curriculumOverrides]
  );

  const isAdmin = Boolean(userProfile?.role === 'admin' && !userProfile.isSuspended);

  const refreshAnnouncements = useCallback(async () => {
    if (!supabase) return;
    try {
      const list = await fetchAnnouncements(false);
      setAnnouncements(list);
    } catch {
      // Ignore quietly if table not provisioned yet
    }
  }, []);

  const refreshCurriculumOverrides = useCallback(async () => {
    if (!supabase) return;
    try {
      const overrides = await fetchCurriculumOverrides();
      setCurriculumOverrides(overrides);
    } catch {
      // Ignore quietly if table not provisioned yet
    }
  }, []);

  // Load 60-level curriculum dataset once on startup
  useEffect(() => {
    let active = true;
    loadCurriculumDataset()
      .then((ds) => {
        if (!active) return;
        setBaseDataset(ds);
        setState(loadSavedState(ds));
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Gagal memuat data kurikulum.');
      });
    return () => {
      active = false;
    };
  }, []);

  // Load global announcements & admin curriculum overrides on startup when Supabase is enabled
  useEffect(() => {
    if (!supabase) return;
    void refreshAnnouncements();
    void refreshCurriculumOverrides();
  }, [refreshAnnouncements, refreshCurriculumOverrides]);

  // Persist sparse user state to localStorage
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
  }, [state]);

  // Sync dark mode class on <html>
  useEffect(() => {
    if (!state) return;
    const root = document.documentElement;
    if (state.settings.darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state?.settings.darkMode]);

  // Refresh clock every 30s so scheduled reviews arrive automatically
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Subscribe to Supabase Auth session when configured
  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setCloudUser(data.session?.user ?? null);
      })
      .catch(() => {
        // Ignore offline session check failure
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setCloudUser(nextUser);
      if (!nextUser) {
        cloudHydratedUserRef.current = null;
        setUserProfile(null);
        setSchemaNeedsUpdate(false);
        setLastCloudSyncAt(null);
        setCloudError(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Fetch user profile (role & display name) whenever cloudUser changes
  useEffect(() => {
    if (!supabase || !cloudUser) return;
    let active = true;
    const meta = cloudUser.user_metadata ?? {};
    const metaName =
      (typeof meta.display_name === 'string' && meta.display_name) ||
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      undefined;

    fetchOrCreateUserProfile(cloudUser.id, cloudUser.email ?? '', metaName)
      .then(({ profile, schemaMissing }) => {
        if (!active) return;
        setSchemaNeedsUpdate(schemaMissing);
        if (profile) {
          if (profile.isSuspended) {
            void supabase?.auth.signOut();
            setCloudError('Akun ini sedang ditangguhkan oleh Admin.');
            return;
          }
          setUserProfile(profile);
        } else {
          setUserProfile({
            id: cloudUser.id,
            email: cloudUser.email ?? '',
            displayName: metaName || (cloudUser.email ?? 'Pelajar').split('@')[0],
            role: 'user',
            isSuspended: false,
            createdAt: cloudUser.created_at ?? new Date().toISOString(),
          });
        }
      })
      .catch(() => {
        if (!active) return;
        setUserProfile({
          id: cloudUser.id,
          email: cloudUser.email ?? '',
          displayName: metaName || (cloudUser.email ?? 'Pelajar').split('@')[0],
          role: 'user',
          isSuspended: false,
          createdAt: cloudUser.created_at ?? new Date().toISOString(),
        });
      });

    return () => {
      active = false;
    };
  }, [cloudUser]);

  // Redirect away from admin view if user logs out or loses admin role
  useEffect(() => {
    if (activeView === 'admin' && !isAdmin && !cloudSyncing && (!cloudUser || userProfile)) {
      setActiveView('dashboard');
    }
    if (activeView === 'profile' && !cloudUser) {
      setActiveView('dashboard');
    }
  }, [activeView, isAdmin, cloudUser, userProfile, cloudSyncing]);

  // Initial cloud hydration or seed when user signs in
  useEffect(() => {
    if (!supabase || !cloudUser || !baseDataset || !stateRef.current) return;
    if (cloudHydratedUserRef.current === cloudUser.id) return;

    let active = true;
    const userId = cloudUser.id;
    setCloudSyncing(true);
    setCloudError(null);

    fetchCloudSrsState(userId)
      .then(async (remoteState) => {
        if (!active) return;
        if (remoteState) {
          const reconciled = reconcileUnlocksAndLevelUp(remoteState, baseDataset).nextState;
          skipNextCloudSaveRef.current = true;
          setState(reconciled);
        } else if (stateRef.current) {
          await saveCloudSrsState(userId, stateRef.current);
        }
        if (!active) return;
        cloudHydratedUserRef.current = userId;
        setLastCloudSyncAt(Date.now());
      })
      .catch((err) => {
        if (!active) return;
        setCloudError(
          err instanceof Error ? err.message : 'Gagal menyinkronkan data dari Supabase.'
        );
      })
      .finally(() => {
        if (active) setCloudSyncing(false);
      });

    return () => {
      active = false;
    };
  }, [cloudUser, baseDataset, Boolean(state)]);

  // Debounced auto-save to Supabase whenever local state updates
  useEffect(() => {
    if (!supabase || !cloudUser || !state) return;
    if (cloudHydratedUserRef.current !== cloudUser.id) return;

    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false;
      return;
    }

    const userId = cloudUser.id;
    const snapshot = state;
    const timer = window.setTimeout(() => {
      setCloudSyncing(true);
      saveCloudSrsState(userId, snapshot)
        .then(() => {
          setLastCloudSyncAt(Date.now());
          setCloudError(null);
        })
        .catch((err) => {
          setCloudError(
            err instanceof Error ? err.message : 'Gagal menyimpan progres ke Supabase.'
          );
        })
        .finally(() => {
          setCloudSyncing(false);
        });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [cloudUser, state]);

  const lessonQueue = useMemo(
    () => (state && dataset ? getLessonQueue(state, dataset) : []),
    [state, dataset]
  );

  const availableReviews = useMemo(
    () => (state && dataset ? getAvailableReviews(state, dataset, now) : []),
    [state, dataset, now]
  );

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-slate-900 p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h1 className="font-display text-xl font-bold">Gagal Memuat Kurikulum 60 Level</h1>
          <p className="text-sm text-slate-600">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-[#0284C7] text-white text-sm font-semibold hover:bg-[#0369A1] cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (!dataset || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] dark:bg-[#0F1115] text-slate-900 dark:text-slate-100 p-6">
        <div className="text-center space-y-2">
          <div className="font-display text-2xl font-extrabold tracking-tight">KaniMichi</div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Memuat 60 level kurikulum (478 Radikal · 2.026 Kanji · 6.584 Kosakata)...
          </p>
        </div>
      </div>
    );
  }

  const updateHistoryAndStreak = (
    prev: UserState,
    deltaReviews: number,
    deltaCorrect: number,
    deltaLessons: number,
    timestamp: number
  ): Pick<UserState, 'history' | 'streakDays' | 'lastActiveDate' | 'totalReviewsDone'> => {
    const today = getTodayDateStr(timestamp);
    const history = [...prev.history];
    const idx = history.findIndex((h) => h.date === today);
    if (idx >= 0) {
      history[idx] = {
        ...history[idx],
        reviewsCompleted: history[idx].reviewsCompleted + deltaReviews,
        correctCount: history[idx].correctCount + deltaCorrect,
        lessonsCompleted: history[idx].lessonsCompleted + deltaLessons,
      };
    } else {
      history.push({
        date: today,
        reviewsCompleted: deltaReviews,
        correctCount: deltaCorrect,
        lessonsCompleted: deltaLessons,
      });
    }

    let streakDays = prev.streakDays;
    if (prev.lastActiveDate !== today) {
      const yesterday = getTodayDateStr(timestamp - 24 * 60 * 60 * 1000);
      streakDays = prev.lastActiveDate === yesterday ? prev.streakDays + 1 : 1;
    }

    return {
      history: history.slice(-30),
      streakDays,
      lastActiveDate: today,
      totalReviewsDone: prev.totalReviewsDone + deltaReviews,
    };
  };

  const completeLessonBatch = (itemIds: string[]) => {
    const ts = Date.now();
    setNow(ts);
    setState((prev) => {
      if (!prev) return prev;
      const progress = { ...prev.progress };
      for (const id of itemIds) {
        const existing = progress[id];
        if (!existing || existing.srsStage !== 0) continue;
        progress[id] = {
          ...existing,
          srsStage: 1,
          startedAt: ts,
          nextReviewAt: calculateNextReviewAt(1, ts),
        };
      }
      const activity = updateHistoryAndStreak(prev, 0, 0, itemIds.length, ts);
      return reconcileUnlocksAndLevelUp(
        {
          ...prev,
          ...activity,
          progress,
        },
        dataset,
        ts
      ).nextState;
    });
  };

  const submitItemReview = (
    itemId: string,
    meaningErrors: number,
    readingErrors: number
  ): ReviewOutcome => {
    const ts = Date.now();
    setNow(ts);

    let outcome: ReviewOutcome = {
      itemId,
      previousStage: 1,
      newStage: 1,
      meaningErrors,
      readingErrors,
      newlyUnlockedIds: [],
      leveledUpTo: null,
    };

    setState((prev) => {
      if (!prev) return prev;
      const existing = prev.progress[itemId];
      if (!existing || existing.srsStage === null || existing.srsStage === 0) {
        return prev;
      }

      const prevStage = existing.srsStage;
      const totalErrors = meaningErrors + readingErrors;
      const newStage = calculateNextSrsStage(prevStage, totalErrors);
      const nextReviewAt = calculateNextReviewAt(newStage, ts);

      const updatedProgress = {
        ...prev.progress,
        [itemId]: {
          ...existing,
          srsStage: newStage,
          nextReviewAt,
          burnedAt: newStage === 9 ? ts : null,
          meaningCorrect: existing.meaningCorrect + (meaningErrors === 0 ? 1 : 0),
          meaningIncorrect: existing.meaningIncorrect + meaningErrors,
          readingCorrect: existing.readingCorrect + (readingErrors === 0 ? 1 : 0),
          readingIncorrect: existing.readingIncorrect + readingErrors,
          lastReviewedAt: ts,
          lastIncorrectAt: totalErrors > 0 ? ts : existing.lastIncorrectAt,
        },
      };

      const activity = updateHistoryAndStreak(
        prev,
        1,
        totalErrors === 0 ? 1 : 0,
        0,
        ts
      );

      const reconciled = reconcileUnlocksAndLevelUp(
        {
          ...prev,
          ...activity,
          progress: updatedProgress,
        },
        dataset,
        ts
      );

      outcome = {
        itemId,
        previousStage: prevStage,
        newStage,
        meaningErrors,
        readingErrors,
        newlyUnlockedIds: reconciled.newlyUnlockedIds,
        leveledUpTo: reconciled.leveledUpTo,
      };

      return reconciled.nextState;
    });

    return outcome;
  };

  const updateUserNotes = (
    itemId: string,
    updates: { userSynonyms?: string[]; meaningNote?: string; readingNote?: string }
  ) => {
    setState((prev) => {
      if (!prev) return prev;
      const existing = prev.progress[itemId] ?? createEmptyProgress(itemId);
      return {
        ...prev,
        progress: {
          ...prev.progress,
          [itemId]: {
            ...existing,
            userSynonyms: updates.userSynonyms ?? existing.userSynonyms,
            meaningNote: updates.meaningNote ?? existing.meaningNote,
            readingNote: updates.readingNote ?? existing.readingNote,
          },
        },
      };
    });
  };

  const resurrectBurnedItem = (itemId: string) => {
    const ts = Date.now();
    setNow(ts);
    setState((prev) => {
      if (!prev) return prev;
      const existing = prev.progress[itemId];
      if (!existing || existing.srsStage !== 9) return prev;
      return {
        ...prev,
        progress: {
          ...prev.progress,
          [itemId]: {
            ...existing,
            srsStage: 1,
            burnedAt: null,
            nextReviewAt: calculateNextReviewAt(1, ts),
          },
        },
      };
    });
  };

  const updateSettings = (partial: Partial<UserSettings>) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            settings: {
              ...prev.settings,
              ...partial,
            },
          }
        : prev
    );
  };

  const toggleVacationMode = () => {
    const ts = Date.now();
    setNow(ts);
    setState((prev) => {
      if (!prev) return prev;
      if (!prev.settings.vacationMode) {
        return {
          ...prev,
          settings: {
            ...prev.settings,
            vacationMode: true,
            vacationStartedAt: ts,
          },
        };
      }
      const pausedDuration = prev.settings.vacationStartedAt
        ? Math.max(0, ts - prev.settings.vacationStartedAt)
        : 0;
      const progress = { ...prev.progress };
      for (const [id, p] of Object.entries(progress)) {
        if (p.nextReviewAt !== null) {
          progress[id] = {
            ...p,
            nextReviewAt: p.nextReviewAt + pausedDuration,
          };
        }
      }
      return {
        ...prev,
        progress,
        settings: {
          ...prev.settings,
          vacationMode: false,
          vacationStartedAt: null,
        },
      };
    });
  };

  const fastForwardTime = (hours: number) => {
    const shiftMs = hours * 60 * 60 * 1000;
    const ts = Date.now();
    setNow(ts);
    setState((prev) => {
      if (!prev) return prev;
      const progress = { ...prev.progress };
      for (const [id, p] of Object.entries(progress)) {
        if (p.nextReviewAt !== null) {
          progress[id] = {
            ...p,
            nextReviewAt: p.nextReviewAt - shiftMs,
          };
        }
      }
      return { ...prev, progress };
    });
  };

  const forceAllReviewsDue = () => {
    const ts = Date.now();
    setNow(ts);
    setState((prev) => {
      if (!prev) return prev;
      const progress = { ...prev.progress };
      for (const [id, p] of Object.entries(progress)) {
        if (p.srsStage !== null && p.srsStage >= 1 && p.srsStage <= 8) {
          progress[id] = {
            ...p,
            nextReviewAt: ts - 60000,
          };
        }
      }
      return { ...prev, progress };
    });
  };

  const jumpToLevel = (targetLevel: number) => {
    const clamped = Math.min(MAX_LEVEL, Math.max(1, Math.floor(targetLevel)));
    const ts = Date.now();
    setNow(ts);
    setState((prev) => {
      if (!prev) return prev;
      const progress = { ...prev.progress };
      for (let lvl = 1; lvl < clamped; lvl++) {
        for (const item of dataset.byLevel[lvl] ?? []) {
          if (item.type === 'radical' || item.type === 'kanji') {
            const existing = progress[item.id] ?? createEmptyProgress(item.id);
            if ((existing.srsStage ?? -1) < 5) {
              progress[item.id] = {
                ...existing,
                srsStage: 5,
                unlockedAt: existing.unlockedAt ?? ts,
                startedAt: existing.startedAt ?? ts,
                nextReviewAt: calculateNextReviewAt(5, ts),
              };
            }
          }
        }
      }
      const next: UserState = {
        ...prev,
        currentLevel: clamped,
        progress,
        levelUpNotification: null,
      };
      return reconcileUnlocksAndLevelUp(next, dataset, ts).nextState;
    });
  };

  const resetProgress = (mode: 'fresh' | 'starter') => {
    const ts = Date.now();
    setNow(ts);
    const next =
      mode === 'fresh'
        ? createFreshLevel1State(dataset, ts)
        : createStarterState(dataset, ts);
    setState({
      ...next,
      settings: {
        ...next.settings,
        darkMode: state.settings.darkMode,
      },
    });
    setActiveView('dashboard');
  };

  const importStateJson = (jsonStr: string): { ok: boolean; error?: string } => {
    try {
      const parsed = JSON.parse(jsonStr) as UserState;
      if (!parsed || typeof parsed.currentLevel !== 'number' || !parsed.progress) {
        return { ok: false, error: 'Format file cadangan tidak valid.' };
      }
      const reconciled = reconcileUnlocksAndLevelUp(parsed, dataset).nextState;
      setState(reconciled);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal membaca JSON. Pastikan isi file valid.' };
    }
  };

  const dismissLevelUpBanner = () => {
    setState((prev) => (prev ? { ...prev, levelUpNotification: null } : prev));
  };

  const openItemDetail = (itemId: string) => setSelectedItemId(itemId);
  const closeItemDetail = () => setSelectedItemId(null);

  const openAuthModal = (tab: AuthModalTab = 'login') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };
  const closeAuthModal = () => setAuthModalOpen(false);

  const startExtraStudy = (mode: ExtraStudyMode) => {
    setExtraStudyMode(mode);
    setActiveView('extra-study');
  };

  const mapAuthError = (msg: string): string => {
    const lower = msg.toLowerCase();
    if (lower.includes('invalid login credentials')) {
      return 'Email atau kata sandi tidak cocok.';
    }
    if (lower.includes('email not confirmed')) {
      return 'Email belum dikonfirmasi. Periksa kotak masuk emailmu atau matikan Confirm Email di Supabase.';
    }
    if (lower.includes('user already registered')) {
      return 'Email ini sudah terdaftar. Silakan masuk.';
    }
    if (lower.includes('password should be at least')) {
      return 'Kata sandi minimal 6 karakter.';
    }
    if (lower.includes('provider is not enabled')) {
      return 'Login Google belum diaktifkan di Supabase. Aktifkan provider Google di Supabase -> Authentication -> Providers.';
    }
    return msg;
  };

  const signInWithEmail = async (
    email: string,
    password: string
  ): Promise<{ ok: boolean; message?: string }> => {
    if (!supabase) {
      return { ok: false, message: 'Supabase belum dikonfigurasi pada environment.' };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user) {
      return { ok: false, message: mapAuthError(error?.message ?? 'Gagal masuk.') };
    }

    const { profile, schemaMissing } = await fetchOrCreateUserProfile(
      data.user.id,
      data.user.email ?? email.trim()
    );
    setSchemaNeedsUpdate(schemaMissing);

    if (profile?.isSuspended) {
      await supabase.auth.signOut();
      return {
        ok: false,
        message: 'Akun ini sedang ditangguhkan oleh Admin. Hubungi pengelola untuk informasi lebih lanjut.',
      };
    }

    if (profile) {
      setUserProfile(profile);
    }
    setAuthModalOpen(false);
    return {
      ok: true,
      message:
        profile?.role === 'admin'
          ? 'Berhasil masuk sebagai Administrator.'
          : 'Berhasil masuk. Menarik progres cloud...',
    };
  };

  const signInWithGoogle = async (): Promise<{ ok: boolean; message?: string }> => {
    if (!supabase) {
      return { ok: false, message: 'Supabase belum dikonfigurasi pada environment.' };
    }
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) {
      return { ok: false, message: mapAuthError(error.message) };
    }
    return { ok: true, message: 'Mengalihkan ke halaman login Google...' };
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<{ ok: boolean; message?: string }> => {
    if (!supabase) {
      return { ok: false, message: 'Supabase belum dikonfigurasi pada environment.' };
    }
    const cleanName = (displayName ?? '').trim() || email.trim().split('@')[0];
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: cleanName,
        },
      },
    });
    if (error) {
      return { ok: false, message: mapAuthError(error.message) };
    }
    if (!data.session) {
      return {
        ok: true,
        message: 'Akun dibuat! Periksa emailmu untuk verifikasi sebelum masuk.',
      };
    }
    setAuthModalOpen(false);
    return { ok: true, message: 'Akun berhasil dibuat dan langsung tersinkronisasi.' };
  };

  const signOutCloud = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    cloudHydratedUserRef.current = null;
    setCloudUser(null);
    setUserProfile(null);
    setLastCloudSyncAt(null);
    setCloudError(null);
    if (activeView === 'admin' || activeView === 'profile') {
      setActiveView('dashboard');
    }
  };

  const syncNow = async (): Promise<{ ok: boolean; message?: string }> => {
    if (!supabase || !cloudUser) {
      return { ok: false, message: 'Masuk terlebih dahulu untuk sinkronisasi cloud.' };
    }
    setCloudSyncing(true);
    setCloudError(null);
    try {
      await saveCloudSrsState(cloudUser.id, state);
      setLastCloudSyncAt(Date.now());
      return { ok: true, message: 'Progres berhasil disinkronkan ke Supabase.' };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal menyinkronkan ke Supabase.';
      setCloudError(msg);
      return { ok: false, message: msg };
    } finally {
      setCloudSyncing(false);
    }
  };

  const updateProfileName = async (
    newName: string
  ): Promise<{ ok: boolean; message?: string }> => {
    if (!cloudUser) return { ok: false, message: 'Belum masuk akun.' };
    const trimmed = newName.trim();
    if (trimmed.length < 2) {
      return { ok: false, message: 'Nama tampilan minimal 2 karakter.' };
    }
    try {
      await updateOwnDisplayName(cloudUser.id, trimmed);
      setUserProfile((prev) => (prev ? { ...prev, displayName: trimmed } : prev));
      return { ok: true, message: 'Nama profil berhasil diperbarui.' };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Gagal memperbarui nama profil.',
      };
    }
  };

  const changePassword = async (
    newPassword: string
  ): Promise<{ ok: boolean; message?: string }> => {
    if (newPassword.length < 6) {
      return { ok: false, message: 'Kata sandi baru minimal 6 karakter.' };
    }
    try {
      await updateOwnPassword(newPassword);
      return { ok: true, message: 'Kata sandi berhasil diperbarui.' };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Gagal mengubah kata sandi.',
      };
    }
  };

  return (
    <AppContext.Provider
      value={{
        dataset,
        state,
        now,
        activeView,
        setActiveView,
        selectedItemId,
        openItemDetail,
        closeItemDetail,
        settingsOpen,
        setSettingsOpen,
        authModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        extraStudyMode,
        startExtraStudy,
        lessonQueue,
        availableReviews,
        completeLessonBatch,
        submitItemReview,
        updateUserNotes,
        resurrectBurnedItem,
        updateSettings,
        toggleVacationMode,
        fastForwardTime,
        forceAllReviewsDue,
        jumpToLevel,
        resetProgress,
        importStateJson,
        dismissLevelUpBanner,
        isSupabaseEnabled: isSupabaseConfigured,
        cloudUser,
        userProfile,
        isAdmin,
        schemaNeedsUpdate,
        cloudSyncing,
        lastCloudSyncAt,
        cloudError,
        announcements,
        curriculumOverrides,
        refreshAnnouncements,
        refreshCurriculumOverrides,
        signInWithEmail,
        signInWithGoogle,
        signUpWithEmail,
        signOutCloud,
        syncNow,
        updateProfileName,
        changePassword,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
