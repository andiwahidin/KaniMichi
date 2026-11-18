-- ============================================================================
-- KaniMichi — Supabase PostgreSQL Schema & Row Level Security (RLS)
-- Jalankan seluruh skrip ini di Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- 1. Tabel penyimpan progres SRS pengguna (sparse JSONB agar hemat kuota free tier)
create table if not exists public.user_srs_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_level integer not null default 1 check (current_level between 1 and 60),
  progress jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  streak_days integer not null default 0,
  last_active_date text,
  total_reviews_done integer not null default 0,
  updated_at timestamptz not null default now()
);

-- 2. Trigger otomatis untuk memperbarui kolom updated_at
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_srs_state_updated_at on public.user_srs_state;
create trigger set_user_srs_state_updated_at
  before update on public.user_srs_state
  for each row
  execute function public.handle_updated_at();

-- 3. Aktifkan Row Level Security (RLS) agar tiap pengguna hanya mengakses datanya sendiri
alter table public.user_srs_state enable row level security;

drop policy if exists "Users can read own SRS state" on public.user_srs_state;
create policy "Users can read own SRS state"
  on public.user_srs_state
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own SRS state" on public.user_srs_state;
create policy "Users can insert own SRS state"
  on public.user_srs_state
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own SRS state" on public.user_srs_state;
create policy "Users can update own SRS state"
  on public.user_srs_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own SRS state" on public.user_srs_state;
create policy "Users can delete own SRS state"
  on public.user_srs_state
  for delete
  using (auth.uid() = user_id);
