-- =============================================================================
-- VEERA — Supabase / PostgreSQL schema (source of truth)
-- Apply in Supabase SQL Editor or via supabase db push / migrations.
-- Conventions: snake_case, uuid PKs, timestamptz, RLS enabled on all public tables.
--
-- After apply: insert first super_admin (one-time), e.g.:
--   insert into public.user_roles (user_id, role)
--   values ('YOUR_AUTH_USER_UUID', 'super_admin');
-- =============================================================================

create extension if not exists "pgcrypto";

do $$ begin
  create type public.plant_status as enum ('active', 'inactive', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.app_role as enum ('admin', 'super_admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.plant_qr_status as enum ('pending', 'ready', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.import_batch_status as enum ('pending', 'processing', 'completed', 'failed');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists user_roles_user_id_idx on public.user_roles (user_id);

create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  common_name text not null,
  scientific_name text,
  status public.plant_status not null default 'active',
  summary text,
  light_level text,
  water_level text,
  internal_notes text,
  -- Optional external product/reference URL for staff (not used for QR encoding). QR payloads are app deep links only.
  qr_target_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plants_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint plants_slug_unique unique (slug)
);

-- Existing databases: add column if missing
alter table public.plants add column if not exists qr_target_url text;

create index if not exists plants_status_idx on public.plants (status);
create index if not exists plants_updated_at_idx on public.plants (updated_at desc);

drop trigger if exists plants_set_updated_at on public.plants;
create trigger plants_set_updated_at
before update on public.plants
for each row execute function public.set_updated_at();

create table if not exists public.plant_catalog_photos (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order int not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint plant_catalog_photos_path_unique unique (storage_path)
);

create index if not exists plant_catalog_photos_plant_id_idx on public.plant_catalog_photos (plant_id);

create unique index if not exists plant_catalog_photos_one_cover_per_plant
on public.plant_catalog_photos (plant_id)
where is_cover = true;

create table if not exists public.plant_qr_codes (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  qr_token text not null,
  -- Full URL encoded in the QR image (e.g. https://veera.example.com/p/<qr_token>); set by Edge Function from QR_PUBLIC_BASE_URL.
  qr_value text not null,
  qr_image_path text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  status public.plant_qr_status not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plant_qr_codes_token_unique unique (qr_token)
);

create index if not exists plant_qr_codes_plant_id_idx on public.plant_qr_codes (plant_id);
create index if not exists plant_qr_codes_primary_idx on public.plant_qr_codes (plant_id) where is_primary = true;

drop trigger if exists plant_qr_codes_set_updated_at on public.plant_qr_codes;
create trigger plant_qr_codes_set_updated_at
before update on public.plant_qr_codes
for each row execute function public.set_updated_at();

create table if not exists public.plant_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plant_tags_slug_unique unique (slug)
);

create index if not exists plant_tags_active_idx on public.plant_tags (is_active, sort_order);

drop trigger if exists plant_tags_set_updated_at on public.plant_tags;
create trigger plant_tags_set_updated_at
before update on public.plant_tags
for each row execute function public.set_updated_at();

create table if not exists public.plant_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  tag_id uuid not null references public.plant_tags (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (plant_id, tag_id)
);

create index if not exists plant_tag_assignments_tag_id_idx on public.plant_tag_assignments (tag_id);

create table if not exists public.plant_content_sections (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  section_key text not null,
  section_label text not null,
  content text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plant_content_sections_key_per_plant unique (plant_id, section_key)
);

create index if not exists plant_content_sections_plant_sort_idx
on public.plant_content_sections (plant_id, sort_order);

drop trigger if exists plant_content_sections_set_updated_at on public.plant_content_sections;
create trigger plant_content_sections_set_updated_at
before update on public.plant_content_sections
for each row execute function public.set_updated_at();

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  source_name text,
  status public.import_batch_status not null default 'pending',
  total_rows int,
  processed_rows int,
  error_summary jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- -----------------------------------------------------------------------------
-- Admin signup gate: security questions (answers stored as bcrypt hashes only)
-- Frontend fetches questions via admin_gate_get_random_questions (no answers).
-- Verification runs only from Edge Function using service role + admin_gate_verify_answers.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_security_questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  answer_hash text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_security_questions_active_idx
on public.admin_security_questions (is_active) where is_active = true;

drop trigger if exists admin_security_questions_set_updated_at on public.admin_security_questions;
create trigger admin_security_questions_set_updated_at
before update on public.admin_security_questions
for each row execute function public.set_updated_at();

-- RLS: block direct reads of answer_hash from clients; RPC + service role bypass RLS.
alter table public.admin_security_questions enable row level security;

-- RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.plants enable row level security;
alter table public.plant_catalog_photos enable row level security;
alter table public.plant_qr_codes enable row level security;
alter table public.plant_tags enable row level security;
alter table public.plant_tag_assignments enable row level security;
alter table public.plant_content_sections enable row level security;
alter table public.import_batches enable row level security;

-- Random active questions for signup UI (id + text only; never exposes answer_hash)
create or replace function public.admin_gate_get_random_questions(p_limit int default 2)
returns table (id uuid, question_text text)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.question_text
  from public.admin_security_questions q
  where q.is_active = true
  order by random()
  limit greatest(1, least(p_limit, 10));
$$;

-- Server-side only: compares bcrypt hash using normalized answer (trim + lower)
create or replace function public.admin_gate_verify_answers(p_ids uuid[], p_answers text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  v_hash text;
  v_answer text;
begin
  if coalesce(array_length(p_ids, 1), 0) is distinct from 2
     or coalesce(array_length(p_answers, 1), 0) is distinct from 2 then
    return false;
  end if;
  if p_ids[1] = p_ids[2] then
    return false;
  end if;

  for i in 1..2 loop
    select aq.answer_hash into v_hash
    from public.admin_security_questions aq
    where aq.id = p_ids[i] and aq.is_active = true;

    if v_hash is null then
      return false;
    end if;

    v_answer := trim(lower(coalesce(p_answers[i], '')));
    if v_answer = '' then
      return false;
    end if;

    if crypt(v_answer, v_hash) is distinct from v_hash then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.admin_gate_get_random_questions(int) from public;
grant execute on function public.admin_gate_get_random_questions(int) to anon, authenticated, service_role;

revoke all on function public.admin_gate_verify_answers(uuid[], text[]) from public;
grant execute on function public.admin_gate_verify_answers(uuid[], text[]) to service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'super_admin')
  );
$$;

grant execute on function public.is_admin() to authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'::public.app_role
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- After sign-in: if the user has a profile but no row in user_roles, grant `admin`.
-- Use only when public email signup is disabled (see README). Lets manually created Auth users sign in without a separate SQL bootstrap for user_roles.
create or replace function public.ensure_default_admin_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = uid) then
    return;
  end if;
  if not exists (select 1 from public.profiles p where p.id = uid) then
    return;
  end if;
  insert into public.user_roles (user_id, role)
  values (uid, 'admin'::public.app_role);
exception
  when unique_violation then
    null;
end;
$$;

revoke all on function public.ensure_default_admin_role() from public;
grant execute on function public.ensure_default_admin_role() to authenticated;

-- Profiles: own row + admins can read all (team / ops)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select using (auth.uid() = id or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update using (auth.uid() = id);

-- Users can always read their own role rows (needed for login + fetchRoles without chicken/egg with is_admin()).
drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
for select using (auth.uid() = user_id);

drop policy if exists user_roles_select_admin on public.user_roles;
create policy user_roles_select_admin on public.user_roles
for select using (public.is_admin());

drop policy if exists user_roles_insert_super_admin on public.user_roles;
create policy user_roles_insert_super_admin on public.user_roles
for insert with check (public.is_super_admin());

drop policy if exists user_roles_update_super_admin on public.user_roles;
create policy user_roles_update_super_admin on public.user_roles
for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists user_roles_delete_super_admin on public.user_roles;
create policy user_roles_delete_super_admin on public.user_roles
for delete using (public.is_super_admin());

drop policy if exists plants_admin_all on public.plants;
create policy plants_admin_all on public.plants
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists plant_catalog_photos_admin_all on public.plant_catalog_photos;
create policy plant_catalog_photos_admin_all on public.plant_catalog_photos
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists plant_qr_codes_admin_all on public.plant_qr_codes;
create policy plant_qr_codes_admin_all on public.plant_qr_codes
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists plant_tags_admin_all on public.plant_tags;
create policy plant_tags_admin_all on public.plant_tags
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists plant_tag_assignments_admin_all on public.plant_tag_assignments;
create policy plant_tag_assignments_admin_all on public.plant_tag_assignments
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists plant_content_sections_admin_all on public.plant_content_sections;
create policy plant_content_sections_admin_all on public.plant_content_sections
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists import_batches_admin_all on public.import_batches;
create policy import_batches_admin_all on public.import_batches
for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Storage
insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('plant-qr', 'plant-qr', false)
on conflict (id) do nothing;

drop policy if exists storage_plant_photos_select on storage.objects;
drop policy if exists storage_plant_photos_insert on storage.objects;
drop policy if exists storage_plant_photos_update on storage.objects;
drop policy if exists storage_plant_photos_delete on storage.objects;
drop policy if exists storage_plant_qr_select on storage.objects;
drop policy if exists storage_plant_qr_insert on storage.objects;
drop policy if exists storage_plant_qr_update on storage.objects;
drop policy if exists storage_plant_qr_delete on storage.objects;

create policy storage_plant_photos_select on storage.objects
for select to authenticated
using (bucket_id = 'plant-photos' and public.is_admin());

create policy storage_plant_photos_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'plant-photos' and public.is_admin());

create policy storage_plant_photos_update on storage.objects
for update to authenticated
using (bucket_id = 'plant-photos' and public.is_admin());

create policy storage_plant_photos_delete on storage.objects
for delete to authenticated
using (bucket_id = 'plant-photos' and public.is_admin());

create policy storage_plant_qr_select on storage.objects
for select to authenticated
using (bucket_id = 'plant-qr' and public.is_admin());

create policy storage_plant_qr_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'plant-qr' and public.is_admin());

create policy storage_plant_qr_update on storage.objects
for update to authenticated
using (bucket_id = 'plant-qr' and public.is_admin());

create policy storage_plant_qr_delete on storage.objects
for delete to authenticated
using (bucket_id = 'plant-qr' and public.is_admin());

-- -----------------------------------------------------------------------------
-- Admin gate: seed at least TWO active questions before using /signup.
-- Answers are stored as bcrypt hashes; compare uses trim(lower(user_input)).
--
-- insert into public.admin_security_questions (question_text, answer_hash, is_active)
-- values
--   ('Your first question here?', crypt(lower(trim('correct answer one')), gen_salt('bf')), true),
--   ('Your second question here?', crypt(lower(trim('correct answer two')), gen_salt('bf')), true);
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- New Auth users get a profiles row (required for user_roles FK + Team page).
-- Run in Supabase SQL Editor if this errors (rare): ensure handle_new_user exists above first.
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
