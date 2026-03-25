# VEERA Admin Panel

Clean admin dashboard for managing plants, tags, flexible content sections, photos, and QR codes. Built with **Vite**, **React**, **TypeScript**, **Tailwind CSS**, **TanStack Query**, and **Supabase** (Auth, Postgres, Storage, Edge Functions).

## One-time Supabase setup

1. Create a Supabase project.
2. In the SQL Editor, run the entire [`schema.sql`](./schema.sql) file once. It creates tables, RLS policies, helper functions, storage buckets `plant-photos` and `plant-qr`, and storage policies for authenticated admins.
3. **Auth → Triggers**: add a trigger on `auth.users` after insert to call `public.handle_new_user()` so every new user gets a `profiles` row (function is included in `schema.sql`).
4. **Close public signup** (recommended): Supabase **Authentication → Providers → Email** (or main Auth settings) → **disable** open sign-up so accounts can only be created through the gated flow or the Admin API. Otherwise someone could bypass the security questions using `signUp` with the anon key.

   **Auto `admin` on sign-in:** The RPC `ensure_default_admin_role()` runs after each login (from the app). If the user has a **`profiles` row** but **no `user_roles` row**, they automatically get role **`admin`**. That way manually added Auth users (with a profile from `handle_new_user`) can sign in without running SQL for `user_roles`. This is **not** safe if random people can create accounts—keep public signup off.
5. **Admin security questions**: In SQL Editor, insert **at least two** active questions with **bcrypt** hashes (answers are checked as trim + lowercase). Example:

   ```sql
   insert into public.admin_security_questions (question_text, answer_hash, is_active)
   values
     ('What is your internal project codeword?', crypt(lower(trim('your-secret-answer')), gen_salt('bf')), true),
     ('What city is HQ in?', crypt(lower(trim('your-city')), gen_salt('bf')), true);
   ```

6. **Bootstrap `super_admin`** (one SQL line, one time only — for the first person who manages Team / questions):

   ```sql
   insert into public.user_roles (user_id, role)
   values ('YOUR_AUTH_USER_UUID', 'super_admin');
   ```

   Other admins can use **`/signup`** on the site (security questions + email/password) and receive role `admin`, or be added under **Team** by a super admin.

7. Deploy Edge Functions (see below): `plant-qr-upsert` and **`admin-signup`**.

## Edge Function: `plant-qr-upsert`

**Source folder in this repo:** `supabase/functions/plant-qr-upsert/` (entry `index.ts`). The deployed name must be exactly **`plant-qr-upsert`**.

### Deployment checklist

1. **Confirm project ref matches the app** — Your Netlify / `.env` `VITE_SUPABASE_URL` must be `https://<PROJECT_REF>.supabase.co` for the **same** project you deploy functions to. Mismatch is the most common cause of **404** (“function not deployed”).
2. **Install CLI and link** (from repo root):

   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>
   ```

   `PROJECT_REF` is in the dashboard URL: `https://supabase.com/dashboard/project/<PROJECT_REF>`.

3. **Set QR URL prefix** (encoded inside each QR; must match how the mobile app resolves plants):

   ```bash
   supabase secrets set QR_PUBLIC_BASE_URL=https://your-public-domain.com/p
   ```

4. **Deploy the function:**

   ```bash
   supabase functions deploy plant-qr-upsert
   ```

5. **(Optional)** Deploy gated signup too: `supabase functions deploy admin-signup` (same project).

6. **Verify in dashboard:** Supabase → **Edge Functions** → `plant-qr-upsert` appears. Open **Logs** after triggering QR from the admin UI.

7. **Test with curl** (replace placeholders; get `ACCESS_TOKEN` from browser devtools → Application → Local Storage for Supabase session, or sign in via API):

   ```bash
   curl -sS -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/plant-qr-upsert" \
     -H "Authorization: Bearer <ACCESS_TOKEN>" \
     -H "apikey: <ANON_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"plant_id":"<EXISTING_PLANT_UUID>","mode":"ensure_primary"}'
   ```

   Expect **200** and JSON with `ok: true` and `plant_id`, `qr_id`, `qr_token`, `qr_value`, etc., or a clear `error` + `code`.

**Secrets:** Hosted Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into Edge Functions automatically. You still set `QR_PUBLIC_BASE_URL` as above.

**Behavior:** The function validates the caller’s JWT, checks `user_roles` for `admin` / `super_admin`, loads the plant, generates a PNG QR into Storage bucket **`plant-qr`** at `plants/<plant_id>/<token>.png`, and upserts **`plant_qr_codes`** (`pending` → `ready` or `failed`).

**Netlify proxy:** [`netlify.toml`](./netlify.toml) sets `VITE_NETLIFY_EDGE_PROXY=true` so production builds call `/.netlify/functions/supabase-edge?fn=plant-qr-upsert` (same origin). That function forwards to `https://<project>.supabase.co/functions/v1/<fn>` with the same `Authorization` and JSON body. Ensure **Netlify → Functions** lists **`supabase-edge`**. Local `npm run dev` calls Supabase **directly** (no proxy).

**If you still see 404:** The function is missing on the project behind `VITE_SUPABASE_URL`, or the URL/key point at a different project. Redeploy with the steps above using the correct `project-ref`.

## Edge Function: `admin-signup` (gated admin registration)

Creates a **confirmed** Auth user (so they can sign in immediately), a `profiles` row, and `user_roles.role = 'admin'` **only** if two security answers pass `admin_gate_verify_answers` (service role only; answers are never exposed to the browser). To require email confirmation instead, change the Edge function to `email_confirm: false` and keep **Confirm email** on in the Supabase dashboard (with **Site URL** / **Redirect URLs** and SMTP).

**Manual users (Dashboard invite / SQL):** use `scripts/manual-admin-user.sql` after the user exists in Auth. With `schema.sql` applied fully, the `on_auth_user_created` trigger creates a `profiles` row for every new Auth user so **Team** can add roles without extra SQL.

**Unconfirmed accounts:** the login page offers **Resend confirmation email** when Supabase returns `email_not_confirmed`.

```bash
supabase functions deploy admin-signup
```

Uses the same auto-provided secrets as other functions (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). No extra secrets required.

**Flow:** `/signup` loads two random questions via RPC `admin_gate_get_random_questions` (questions only). Submit calls `admin-signup`, which verifies answers server-side, then creates the user.

**Promote to `super_admin`:** still done with SQL or **Team** (existing super admins only).

If signup shows **“Failed to send a request to the Edge Function”** (or a 404 message after our update), the function is **not deployed** to the same Supabase project as `VITE_SUPABASE_URL`. Deploy it:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy admin-signup
```

Ref is in the Supabase dashboard URL: `https://supabase.com/dashboard/project/<ref>`. After deploying, try `/signup` again (no Netlify redeploy required for the function itself).

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

## Troubleshooting: sign-in “does nothing” on Netlify

1. **Environment variables** — `VITE_*` values are baked in at **build** time. In Netlify: Site configuration → Environment variables → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then **Clear cache and deploy site**. If they were missing, the login page will show an amber warning after redeploy.
2. **Admin role** — After a successful password sign-in, you must have a row in `user_roles` for your user (bootstrap SQL above). If not, the app will show a clear message instead of staying silent.
3. **RLS (existing databases)** — If you applied an older schema, run this in the SQL editor so users can read their own roles (required for login):

   ```sql
   drop policy if exists user_roles_select_own on public.user_roles;
   create policy user_roles_select_own on public.user_roles
   for select using (auth.uid() = user_id);
   ```
