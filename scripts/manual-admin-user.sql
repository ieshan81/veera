-- =============================================================================
-- VEERA — Manually grant admin access for an existing Supabase Auth user
-- Run in Supabase → SQL Editor. Replace the email and role as needed.
--
-- Prereq: the user must exist under Authentication → Users (invite or “Add user”).
-- If schema.sql’s on_auth_user_created trigger is applied, a profiles row is
-- created automatically on user creation. Otherwise run the INSERT into profiles
-- block below (it is safe to run either way thanks to ON CONFLICT).
--
-- Prefer disabling public self-signup in Auth settings if you use
-- ensure_default_admin_role (auto-admin when profile exists but no role).
-- =============================================================================

-- 1) Ensure profile (required for user_roles foreign key)
insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(split_part(u.email, '@', 1), ''), 'Admin')
from auth.users u
where lower(u.email) = lower('REPLACE_WITH_EMAIL@example.com')
on conflict (id) do update
set display_name = excluded.display_name;

-- 2) Grant role: use 'admin' or 'super_admin'
insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role
from auth.users u
where lower(u.email) = lower('REPLACE_WITH_EMAIL@example.com')
on conflict (user_id, role) do nothing;

-- 3) Verify
select u.id, u.email, u.email_confirmed_at, p.display_name, ur.role
from auth.users u
left join public.profiles p on p.id = u.id
left join public.user_roles ur on ur.user_id = u.id
where lower(u.email) = lower('REPLACE_WITH_EMAIL@example.com');
