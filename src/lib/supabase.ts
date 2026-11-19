import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AdminUserRecord,
  Announcement,
  AnnouncementCategory,
  CurriculumOverride,
  UserProfile,
  UserRole,
  UserState,
} from '../types/curriculum';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as Record<string, string | undefined>)
    : {};
const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').trim();
const supabasePublicKey = (
  env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_ANON_KEY ??
  ''
).trim();

function isValidSupabaseConfig(url: string, key: string): boolean {
  if (!url || !key) return false;
  if (
    url.includes('your-project-ref') ||
    key.includes('your-supabase-anon') ||
    key.includes('your-supabase-publishable')
  ) {
    return false;
  }
  return url.startsWith('https://') || url.startsWith('http://');
}

function createSafeStorage() {
  const memory = new Map<string, string>();
  let canUseLocalStorage = false;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = '__km_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      canUseLocalStorage = true;
    }
  } catch {
    canUseLocalStorage = false;
  }

  return {
    getItem(key: string): string | null {
      if (canUseLocalStorage) {
        try {
          return window.localStorage.getItem(key);
        } catch {
          // fallback to memory
        }
      }
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (canUseLocalStorage) {
        try {
          window.localStorage.setItem(key, value);
          return;
        } catch {
          // fallback to memory
        }
      }
      memory.set(key, value);
    },
    removeItem(key: string): void {
      if (canUseLocalStorage) {
        try {
          window.localStorage.removeItem(key);
          return;
        } catch {
          // fallback to memory
        }
      }
      memory.delete(key);
    },
  };
}

export const isSupabaseConfigured = isValidSupabaseConfig(
  supabaseUrl,
  supabasePublicKey
);

function initSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  try {
    return createClient(supabaseUrl, supabasePublicKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: createSafeStorage(),
        // Avoid navigator.locks SecurityError / deadlocks inside sandboxed iframes & strict mobile browsers
        lock: async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> =>
          fn(),
      },
    });
  } catch {
    return null;
  }
}

export const supabase: SupabaseClient | null = initSupabaseClient();

function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    (err.message ?? '').toLowerCase().includes('does not exist') ||
    (err.message ?? '').toLowerCase().includes('could not find the table')
  );
}

interface UserSrsRow {
  user_id: string;
  current_level: number;
  progress: UserState['progress'];
  history: UserState['history'];
  settings: UserState['settings'];
  streak_days: number;
  last_active_date: string | null;
  total_reviews_done: number;
  updated_at?: string;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  is_suspended: boolean;
  created_at: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  is_active: boolean;
  created_at: string;
}

interface CurriculumOverrideRow {
  item_id: string;
  primary_meaning: string | null;
  meaning_mnemonic: string | null;
  reading_mnemonic: string | null;
  updated_at: string;
}

export async function fetchCloudSrsState(
  userId: string
): Promise<UserState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_srs_state')
    .select(
      'current_level, progress, history, settings, streak_days, last_active_date, total_reviews_done'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  const row = data as Omit<UserSrsRow, 'user_id'>;
  return {
    currentLevel: row.current_level ?? 1,
    progress: row.progress ?? {},
    history: Array.isArray(row.history) ? row.history : [],
    settings: {
      lessonBatchSize: row.settings?.lessonBatchSize ?? 5,
      autoplayAudio: row.settings?.autoplayAudio ?? true,
      darkMode: row.settings?.darkMode ?? false,
      vacationMode: row.settings?.vacationMode ?? false,
      vacationStartedAt: row.settings?.vacationStartedAt ?? null,
      dailyReviewGoal: row.settings?.dailyReviewGoal ?? 25,
    },
    streakDays: row.streak_days ?? 0,
    lastActiveDate: row.last_active_date ?? null,
    totalReviewsDone: row.total_reviews_done ?? 0,
    levelUpNotification: null,
  };
}

export async function saveCloudSrsState(
  userId: string,
  state: UserState
): Promise<void> {
  if (!supabase) return;
  const payload: UserSrsRow = {
    user_id: userId,
    current_level: state.currentLevel,
    progress: state.progress,
    history: state.history,
    settings: state.settings,
    streak_days: state.streakDays,
    last_active_date: state.lastActiveDate,
    total_reviews_done: state.totalReviewsDone,
  };

  const { error } = await supabase
    .from('user_srs_state')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchOrCreateUserProfile(
  userId: string,
  email: string,
  preferredName?: string
): Promise<{ profile: UserProfile | null; schemaMissing: boolean }> {
  if (!supabase) return { profile: null, schemaMissing: false };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, is_suspended, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return { profile: null, schemaMissing: true };
    }
    throw new Error(error.message);
  }

  if (data) {
    const row = data as ProfileRow;
    return {
      profile: {
        id: row.id,
        email: row.email,
        displayName: row.display_name || email.split('@')[0] || 'Pelajar',
        role: row.role === 'admin' ? 'admin' : 'user',
        isSuspended: Boolean(row.is_suspended),
        createdAt: row.created_at,
      },
      schemaMissing: false,
    };
  }

  // Fallback create if trigger did not exist when user signed up
  const displayName = (preferredName ?? '').trim() || email.split('@')[0] || 'Pelajar';
  const { data: inserted, error: insertErr } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email,
      display_name: displayName,
      role: 'user',
      is_suspended: false,
    })
    .select('id, email, display_name, role, is_suspended, created_at')
    .maybeSingle();

  if (insertErr || !inserted) {
    return {
      profile: {
        id: userId,
        email,
        displayName,
        role: 'user',
        isSuspended: false,
        createdAt: new Date().toISOString(),
      },
      schemaMissing: isMissingTableError(insertErr),
    };
  }

  const row = inserted as ProfileRow;
  return {
    profile: {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role === 'admin' ? 'admin' : 'user',
      isSuspended: Boolean(row.is_suspended),
      createdAt: row.created_at,
    },
    schemaMissing: false,
  };
}

export async function updateOwnDisplayName(
  userId: string,
  displayName: string
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName.trim() })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function updateOwnPassword(newPassword: string): Promise<void> {
  if (!supabase) throw new Error('Supabase tidak aktif.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function fetchAnnouncements(includeInactive = false): Promise<Announcement[]> {
  if (!supabase) return [];
  let query = supabase
    .from('announcements')
    .select('id, title, body, category, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as AnnouncementRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}

export async function createAnnouncement(
  userId: string,
  payload: { title: string; body: string; category: AnnouncementCategory }
): Promise<Announcement> {
  if (!supabase) throw new Error('Supabase tidak aktif.');
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: payload.title.trim(),
      body: payload.body.trim(),
      category: payload.category,
      is_active: true,
      created_by: userId,
    })
    .select('id, title, body, category, is_active, created_at')
    .single();

  if (error) throw new Error(error.message);
  const row = data as AnnouncementRow;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export async function toggleAnnouncementActive(
  id: string,
  isActive: boolean
): Promise<void> {
  if (!supabase) throw new Error('Supabase tidak aktif.');
  const { error } = await supabase
    .from('announcements')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase tidak aktif.');
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchCurriculumOverrides(): Promise<
  Record<string, CurriculumOverride>
> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('curriculum_overrides')
    .select('item_id, primary_meaning, meaning_mnemonic, reading_mnemonic, updated_at');

  if (error) {
    if (isMissingTableError(error)) return {};
    throw new Error(error.message);
  }

  const map: Record<string, CurriculumOverride> = {};
  for (const row of (data ?? []) as CurriculumOverrideRow[]) {
    map[row.item_id] = {
      itemId: row.item_id,
      primaryMeaning: row.primary_meaning,
      meaningMnemonic: row.meaning_mnemonic,
      readingMnemonic: row.reading_mnemonic,
      updatedAt: row.updated_at,
    };
  }
  return map;
}

export async function upsertCurriculumOverride(
  adminUserId: string,
  override: {
    itemId: string;
    primaryMeaning: string;
    meaningMnemonic: string;
    readingMnemonic?: string;
  }
): Promise<CurriculumOverride> {
  if (!supabase) throw new Error('Supabase tidak aktif.');
  const { data, error } = await supabase
    .from('curriculum_overrides')
    .upsert(
      {
        item_id: override.itemId,
        primary_meaning: override.primaryMeaning.trim() || null,
        meaning_mnemonic: override.meaningMnemonic.trim() || null,
        reading_mnemonic: override.readingMnemonic?.trim() || null,
        updated_by: adminUserId,
      },
      { onConflict: 'item_id' }
    )
    .select('item_id, primary_meaning, meaning_mnemonic, reading_mnemonic, updated_at')
    .single();

  if (error) throw new Error(error.message);
  const row = data as CurriculumOverrideRow;
  return {
    itemId: row.item_id,
    primaryMeaning: row.primary_meaning,
    meaningMnemonic: row.meaning_mnemonic,
    readingMnemonic: row.reading_mnemonic,
    updatedAt: row.updated_at,
  };
}

export async function deleteCurriculumOverride(itemId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase tidak aktif.');
  const { error } = await supabase
    .from('curriculum_overrides')
    .delete()
    .eq('item_id', itemId);
  if (error) throw new Error(error.message);
}

export async function fetchAllUsersForAdmin(): Promise<AdminUserRecord[]> {
  if (!supabase) return [];

  const [{ data: profiles, error: pErr }, { data: srsRows, error: sErr }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, display_name, role, is_suspended, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('user_srs_state')
        .select('user_id, current_level, streak_days, total_reviews_done, last_active_date, updated_at'),
    ]);

  if (pErr) throw new Error(pErr.message);
  if (sErr && !isMissingTableError(sErr)) throw new Error(sErr.message);

  const srsById = new Map<
    string,
    {
      current_level: number;
      streak_days: number;
      total_reviews_done: number;
      last_active_date: string | null;
      updated_at: string | null;
    }
  >();

  for (const row of (srsRows ?? []) as Array<{
    user_id: string;
    current_level: number;
    streak_days: number;
    total_reviews_done: number;
    last_active_date: string | null;
    updated_at: string | null;
  }>) {
    srsById.set(row.user_id, row);
  }

  return ((profiles ?? []) as ProfileRow[]).map((p) => {
    const srs = srsById.get(p.id);
    return {
      id: p.id,
      email: p.email,
      displayName: p.display_name || p.email.split('@')[0] || 'Pelajar',
      role: p.role === 'admin' ? 'admin' : 'user',
      isSuspended: Boolean(p.is_suspended),
      createdAt: p.created_at,
      currentLevel: srs?.current_level ?? 1,
      streakDays: srs?.streak_days ?? 0,
      totalReviewsDone: srs?.total_reviews_done ?? 0,
      lastActiveDate: srs?.last_active_date ?? null,
      srsUpdatedAt: srs?.updated_at ?? null,
    };
  });
}

export async function adminUpdateUserProfile(
  targetUserId: string,
  updates: { role?: UserRole; isSuspended?: boolean; displayName?: string }
): Promise<void> {
  if (!supabase) throw new Error('Supabase tidak aktif.');
  const payload: Record<string, unknown> = {};
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.isSuspended !== undefined) payload.is_suspended = updates.isSuspended;
  if (updates.displayName !== undefined) payload.display_name = updates.displayName.trim();

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', targetUserId);
  if (error) throw new Error(error.message);
}

export async function adminSetUserLevel(
  targetUserId: string,
  newLevel: number
): Promise<void> {
  if (!supabase) throw new Error('Supabase tidak aktif.');
  const clamped = Math.min(60, Math.max(1, Math.floor(newLevel)));
  const { error } = await supabase
    .from('user_srs_state')
    .upsert(
      {
        user_id: targetUserId,
        current_level: clamped,
      },
      { onConflict: 'user_id' }
    );
  if (error) throw new Error(error.message);
}
