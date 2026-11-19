-- ============================================================================
-- KaniMichi — Supabase PostgreSQL Schema, Role-Based Access Control (User & Admin),
-- Pengumuman Global, & Editor Kurikulum
-- Aman dijalankan ulang (idempotent) di Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- 1. Helper trigger untuk memperbarui kolom updated_at
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Tabel profil pengguna & peran (user / admin)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- Helper SECURITY DEFINER untuk mengecek apakah pengguna saat ini adalah Admin aktif
-- (mencegah rekursi tak terbatas pada policy RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_suspended = false
  );
$$;

-- Trigger otomatis membuat profil saat user baru mendaftar (Email maupun Google).
-- Email ndwahidin@gmail.com otomatis ditetapkan sebagai 'admin', akun lain menjadi 'user'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
  fallback_name text;
begin
  if lower(coalesce(new.email, '')) = 'ndwahidin@gmail.com' then
    assigned_role := 'admin';
  else
    assigned_role := 'user';
  end if;

  fallback_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, 'pelajar'), '@', 1)
  );

  insert into public.profiles (id, email, display_name, role)
  values (new.id, coalesce(new.email, ''), fallback_name, assigned_role)
  on conflict (id) do update
    set role = case
      when lower(excluded.email) = 'ndwahidin@gmail.com' then 'admin'
      else public.profiles.role
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Sinkronkan user yang mungkin sudah terlanjur terdaftar sebelum trigger dibuat
insert into public.profiles (id, email, display_name, role)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(u.email, 'pelajar'), '@', 1)
  ),
  case
    when lower(coalesce(u.email, '')) = 'ndwahidin@gmail.com' then 'admin'
    else 'user'
  end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Pastikan ndwahidin@gmail.com langsung berstatus admin jika sudah ada di tabel profiles
update public.profiles
set role = 'admin'
where lower(email) = 'ndwahidin@gmail.com';

-- RLS untuk tabel profiles
alter table public.profiles enable row level security;

drop policy if exists "Users read own profile or admin reads all" on public.profiles;
create policy "Users read own profile or admin reads all"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "Users insert own profile as user" on public.profiles;
create policy "Users insert own profile as user"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and role = 'user'
    and is_suspended = false
  );

drop policy if exists "Users update own display_name only" on public.profiles;
create policy "Users update own display_name only"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and is_suspended = (select p.is_suspended from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Admins manage all profiles" on public.profiles;
create policy "Admins manage all profiles"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- 3. Tabel penyimpan progres SRS pengguna
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

drop trigger if exists set_user_srs_state_updated_at on public.user_srs_state;
create trigger set_user_srs_state_updated_at
  before update on public.user_srs_state
  for each row
  execute function public.handle_updated_at();

alter table public.user_srs_state enable row level security;

drop policy if exists "Users can read own SRS state" on public.user_srs_state;
create policy "Users can read own SRS state"
  on public.user_srs_state for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can insert own SRS state" on public.user_srs_state;
create policy "Users can insert own SRS state"
  on public.user_srs_state for insert
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can update own SRS state" on public.user_srs_state;
create policy "Users can update own SRS state"
  on public.user_srs_state for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can delete own SRS state" on public.user_srs_state;
create policy "Users can delete own SRS state"
  on public.user_srs_state for delete
  using (auth.uid() = user_id or public.is_admin());

-- 4. Tabel pengumuman global (dikelola Admin, dibaca seluruh User)
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'info' check (category in ('info', 'update', 'event')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop policy if exists "Anyone can read active announcements or admin reads all" on public.announcements;
create policy "Anyone can read active announcements or admin reads all"
  on public.announcements for select
  using (is_active = true or public.is_admin());

drop policy if exists "Admins can insert announcements" on public.announcements;
create policy "Admins can insert announcements"
  on public.announcements for insert
  with check (public.is_admin());

drop policy if exists "Admins can update announcements" on public.announcements;
create policy "Admins can update announcements"
  on public.announcements for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete announcements" on public.announcements;
create policy "Admins can delete announcements"
  on public.announcements for delete
  using (public.is_admin());

-- 5. Tabel editor/override kurikulum & mnemonik Indonesia (dikelola Admin)
create table if not exists public.curriculum_overrides (
  item_id text primary key,
  primary_meaning text,
  meaning_mnemonic text,
  reading_mnemonic text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_curriculum_overrides_updated_at on public.curriculum_overrides;
create trigger set_curriculum_overrides_updated_at
  before update on public.curriculum_overrides
  for each row
  execute function public.handle_updated_at();

alter table public.curriculum_overrides enable row level security;

drop policy if exists "Anyone can read curriculum overrides" on public.curriculum_overrides;
create policy "Anyone can read curriculum overrides"
  on public.curriculum_overrides for select
  using (true);

drop policy if exists "Admins can insert curriculum overrides" on public.curriculum_overrides;
create policy "Admins can insert curriculum overrides"
  on public.curriculum_overrides for insert
  with check (public.is_admin());

drop policy if exists "Admins can update curriculum overrides" on public.curriculum_overrides;
create policy "Admins can update curriculum overrides"
  on public.curriculum_overrides for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete curriculum overrides" on public.curriculum_overrides;
create policy "Admins can delete curriculum overrides"
  on public.curriculum_overrides for delete
  using (public.is_admin());

-- ============================================================================
-- CATATAN: Jika kamu ingin menjadikan email tertentu sebagai Admin secara manual,
-- jalankan baris ini (hilangkan tanda -- di awal):
-- update public.profiles set role = 'admin' where email = 'emailkamu@gmail.com';
-- ============================================================================
