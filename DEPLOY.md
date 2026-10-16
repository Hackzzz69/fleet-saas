# FleetDesk — Deploy Guide

The app is 100% static (HTML/CSS/JS) + Supabase (Postgres + Auth). No servers to run.

## 1. Create the Supabase project (5 min)

1. Go to https://supabase.com/dashboard → **New project**
2. Name: `fleetdesk`, pick a region near you, set a DB password (save it)
3. Wait for provisioning (~2 min)

## 2. Create the tables (2 min)

1. In the project dashboard: **SQL Editor → New query**
2. Paste the entire contents of `schema.sql` and **Run**
3. Confirm: `Table Editor` should show `orgs`, `org_members`, `profiles`, `trucks`, `trips`, `fuel_purchases`, `ifta_filings`

## 3. Point the app at Supabase (1 min)

1. **Project Settings → API**: copy the **Project URL** and the **anon public** key
2. Edit `js/config.js`:
   ```js
   SUPABASE_URL: "https://xyzcompany.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   ```
3. Commit + push (or re-upload)

> Never put the `service_role` key in the frontend. The anon key is safe —
> row-level security enforces tenant isolation.

## 4. Host the frontend (2 min)

**Option A — GitHub Pages** (free, simplest):
Settings → Pages → Deploy from branch → `main` → `/ (root)`.
Live at `https://<you>.github.io/fleet-saas/`.

**Option B — Cloudflare Pages / Netlify / Vercel**: drag the repo folder in.

## 5. Auth settings

In Supabase: **Authentication → Providers → Email** — enabled by default.
Optional: disable "Confirm email" under **Authentication → Settings** for frictionless signup during beta.

## 6. Smoke test

1. Open the site → **Start free** → create account
2. You get a personal org (you're the owner) — check `app.html`
3. Add a truck → log a trip → log fuel → open **IFTA Calculator**, pick year + quarter
4. Save a filing snapshot → check the **Filings** tab

## Quarterly maintenance

- Update `IFTA_RATES` / `IFTA_SURCHARGES` in `js/ifta.js` from the IFTA, Inc. tax matrix each quarter
- Add that quarter's deadline to `IFTA_DEADLINES` and any fuel-tax holidays to `IFTA_HOLIDAYS`
