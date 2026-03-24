# VEERA Admin Panel

Clean admin dashboard for managing plants, tags, flexible content sections, photos, and QR codes. Built with **Vite**, **React**, **TypeScript**, **Tailwind CSS**, **TanStack Query**, and **Supabase** (Auth, Postgres, Storage, Edge Functions).

## One-time Supabase setup

1. Create a Supabase project.
2. In the SQL Editor, run the entire [`schema.sql`](./schema.sql) file once. It creates tables, RLS policies, helper functions, storage buckets `plant-photos` and `plant-qr`, and storage policies for authenticated admins.
3. **Auth → Triggers**: add a trigger on `auth.users` after insert to call `public.handle_new_user()` so every new user gets a `profiles` row (function is included in `schema.sql`).
4. Create your first admin user (Auth → Users → Add user) and confirm they can sign in.
5. **Bootstrap `super_admin`** (one SQL line, one time only):

   ```sql
   insert into public.user_roles (user_id, role)
   values ('YOUR_AUTH_USER_UUID', 'super_admin');
   ```

   After this, additional admins can be granted roles from **Team** in the app (super admins only).

6. Deploy the Edge Function and secrets (see below).

## Edge Function: `plant-qr-upsert`

From the repo root (with [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your project):

```bash
supabase secrets set QR_PUBLIC_BASE_URL=https://your-app-domain.com/p
supabase functions deploy plant-qr-upsert
```

Required function secrets (usually auto-provided by Supabase): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Set `QR_PUBLIC_BASE_URL` to the URL prefix encoded in each QR (must match what the mobile app will resolve).

The function verifies the caller’s JWT, checks `user_roles` for `admin` / `super_admin`, then creates or regenerates the primary QR PNG in Storage and updates `plant_qr_codes`.

## Local development

```bash
cp .env.example .env
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Do **not** put the service role key in `.env` for Vite—only anon + URL.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_SUPABASE_URL` | Netlify + `.env` | Supabase API URL |
| `VITE_SUPABASE_ANON_KEY` | Netlify + `.env` | Public anon key (browser) |
| `QR_PUBLIC_BASE_URL` | Edge Function secrets | Prefix for `qr_value` inside each QR |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge only (managed) | Storage upload + admin DB in function |

## GitHub → Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import from Git**, pick the repo.
3. Build settings: **Build command** `npm run build`, **Publish directory** `dist` (already set in [`netlify.toml`](./netlify.toml)).
4. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. In Supabase **Auth → URL configuration**, add your Netlify site URL (and `http://localhost:5173` for local) to redirect allow list as needed.

## Daily operations

After the one-time setup, routine work is done **only in this admin UI**: plants, tags, sections, photos, QR retry/regenerate, CSV import, and team roles (super admin). You should not need the Supabase Table Editor for normal content tasks.

## Schema source of truth

[`schema.sql`](./schema.sql) is the contract for the shared VEERA backend (this admin app and the future mobile app). Apply changes via migrations in production when you evolve the schema.

## Project structure

- `src/` — React app (routes under `src/pages`, auth in `src/auth`, UI primitives in `src/components/ui`)
- `schema.sql` — Postgres + RLS + storage setup
- `supabase/functions/plant-qr-upsert` — QR generation and storage upload
