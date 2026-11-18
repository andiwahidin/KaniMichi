import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserState } from '../types/curriculum';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

function isValidSupabaseConfig(url: string, key: string): boolean {
  if (!url || !key) return false;
  if (url.includes('your-project-ref') || key.includes('your-supabase-anon')) {
    return false;
  }
  return url.startsWith('https://') || url.startsWith('http://');
}

export const isSupabaseConfigured = isValidSupabaseConfig(
  supabaseUrl,
  supabaseAnonKey
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

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
