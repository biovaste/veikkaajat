# Veikkaajat — MM 2026

World Cup 2026 score prediction app for a small group of friends (<20 players).

## Stack

| Concern | Technology |
|---|---|
| Frontend + API routes | Next.js 16 App Router, TypeScript |
| Database + Auth | Supabase (Postgres, magic link only, RLS) |
| Hosting | Vercel (free tier) |
| Scheduled polling | Supabase Edge Function + pg_cron |
| Match data | football-data.org v4 API (free tier) |
| Notifications | Telegram Bot API |

UI language: Finnish. Layout: mobile-first. No open signup — admin invites players by email.

## Environment Variables

**`.env.local` (local) and Vercel dashboard (production):**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never in client code
FOOTBALL_DATA_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_GROUP_CHAT_ID=
NEXT_PUBLIC_APP_URL=
```

**Supabase Edge Function secrets** (set via `supabase secrets set`):
```
FOOTBALL_DATA_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_GROUP_CHAT_ID=
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected
```

## Scoring Rules

- 3 pts — correct match result (win/draw/loss)
- +1 pt — correct home team goal tally
- +1 pt — correct away team goal tally
- **Max 5 pts per match**

Scoring engine: `lib/scoring/engine.ts` — pure function, unit-tested.

## Key Architectural Decisions

- **Admin check**: use `createServerClient()` (anon key, has session) to verify `auth.getUser()` and `profiles.is_admin`. Use `createServiceRoleClient()` only for the actual privileged DB/auth operations. Do NOT use the service role client for `auth.getUser()` — it has `persistSession: false` and won't read the cookie session. Admin pages use the admin layout which server-side checks `profiles.is_admin`. The proxy (`proxy.ts`) does not check admin status — it only handles session refresh and unauthenticated redirects.
- **Kickoff lock**: enforced both client-side (hide form) and server-side (`POST /api/predictions` rejects if `kickoff_at <= now()`).
- **No open signup**: admin uses `/admin/players` to invite users via `supabase.auth.admin.inviteUserByEmail()`.
- **football-data.org rate limit**: 10 req/min. Group stage seed is one bulk call. The edge function polls one match at a time with a 7s sleep between calls.
- **Types**: Supabase client uses untyped `any` generics for now. Run `supabase gen types typescript --project-id <ref> > types/database.ts` after `supabase login` to get proper types.

## Database Schema

All tables are in `supabase/migrations/`. Run them in order (0001 → 0002 → 0003) in the Supabase SQL editor.

| Table | Purpose |
|---|---|
| `profiles` | One row per auth user; auto-created via trigger on `auth.users` insert |
| `matches` | Seeded from football-data.org; result fields set after match finishes |
| `predictions` | One row per (player, match); editable until `kickoff_at` |
| `scoring_log` | Audit trail written after each match is scored |
| `category_bets` | Stub table for future tournament-level bets module |

**To mark yourself as admin** (run once in Supabase SQL editor after first login):
```sql
UPDATE profiles SET is_admin = true WHERE email = 'your@email.fi';
```

## Project Structure

```
app/
  layout.tsx              # Root layout: Nav + Supabase session
  page.tsx                # Redirect → /login or /leaderboard
  login/page.tsx          # Magic link form (Finnish)
  auth/callback/route.ts  # Supabase magic link callback
  leaderboard/page.tsx    # Points leaderboard
  matches/page.tsx        # Fixture list + prediction entry (Phase 2)
  my-predictions/page.tsx # Player's own predictions + points
  admin/
    layout.tsx            # Guards: redirect non-admins to /leaderboard
    page.tsx              # Admin dashboard links
    seed/page.tsx         # Import matches from football-data.org
    matches/page.tsx      # Manual result override (Phase 3)
    players/page.tsx      # Invite players, view stats

components/
  Nav.tsx                 # Sticky top nav with sign-out

lib/
  supabase/
    client.ts             # createBrowserClient (client components)
    server.ts             # createServerClient + createServiceRoleClient (server)
  football-data/client.ts # Typed wrapper: fetchMatches(), fetchMatch()
  telegram/notify.ts      # sendMatchResultNotification() — Phase 4
  scoring/engine.ts       # calculatePoints() — Phase 3
  utils.ts                # formatDate (Finnish), stageLabel(), resultLabel()

app/api/
  predictions/route.ts            # GET + POST predictions — Phase 2
  admin/seed-matches/route.ts     # POST: import from football-data.org
  admin/override-result/route.ts  # POST: set result + score + notify — Phase 3
  admin/invite-player/route.ts    # POST: send magic link invite

proxy.ts                # Next.js proxy (was: middleware): session refresh + auth redirect
supabase/
  migrations/
    0001_initial_schema.sql
    0002_rls_policies.sql
    0003_triggers.sql
  functions/
    poll-match-results/index.ts   # Deno edge function — Phase 5
types/
  database.ts            # Hand-written types (replace with supabase gen types)
```

## football-data.org Endpoints

| Purpose | Endpoint | When called |
|---|---|---|
| Seed group stage | `GET /v4/competitions/WC/matches?stage=GROUP_STAGE` | Admin: seed page |
| Seed knockout rounds | `GET /v4/competitions/WC/matches?stage=ROUND_OF_16` etc. | Admin: per stage |
| Poll result | `GET /v4/matches/{external_id}` | Edge function every 30 min |

Competition code: `WC`. Auth header: `X-Auth-Token`.

## Telegram Message Format

Sent after every confirmed result (HTML parse mode):
```
<b>Ottelu: Ranska - Saksa</b>
<b>Tulos: 2 - 1</b>

<b>Pisteet tästä ottelusta:</b>
Matti Meikäläinen — 5 pts
Teppo Testaaja — 3 pts
...muut — 0 pts

<b>Sarjataulukko (top 5):</b>
1. Matti Meikäläinen — 42 pts
2. Teppo Testaaja — 38 pts
```

## Build & Run

```bash
npm install
npm run dev        # local development
npm run build      # production build
npm test           # vitest unit tests
```

---

## Build Progress

### ✅ Phase 0 — Scaffolding + Auth
**Status: Complete**

- Next.js 16 project with TypeScript, Tailwind CSS
- Supabase client wrappers (`lib/supabase/client.ts`, `server.ts`)
- Session refresh proxy (`proxy.ts`)
- Magic link login page (`/login`)
- Auth callback handler (`/auth/callback`)
- Auto-create profile trigger on first login
- All 3 SQL migrations written

**Verify:** Log in via magic link → land on `/leaderboard`. Non-admin hitting `/admin` is redirected.

---

### ✅ Phase 1 — Match Seeding + Admin Foundation
**Status: Complete**

- `lib/football-data/client.ts` — `fetchMatches()`, `fetchMatch()`
- `lib/utils.ts` — `formatDate()`, `stageLabel()`, `resultLabel()`
- `POST /api/admin/seed-matches` — imports matches from football-data.org (upsert on `external_id`)
- `POST /api/admin/invite-player` — sends magic link + creates profile
- `/admin` dashboard, `/admin/seed`, `/admin/players` pages
- `/matches` fixture list (grouped by stage, shows result badges)
- `/leaderboard` page (aggregates `predictions.points`)
- `/my-predictions` page (player's own history)
- `Nav` component (sticky, shows admin link for admins)

**Verify:**
1. Log in → mark self as admin in Supabase SQL editor
2. Admin → Tuo ottelut → "Lohkovaihe" → 48 matches imported
3. `/matches` shows all fixtures grouped by stage
4. Admin → Pelaajat → invite a player → magic link email arrives

---

### 🔲 Phase 2 — Predictions
**Goal:** Players submit and edit score predictions up to kickoff.

Files to create:
- `app/api/predictions/route.ts` — GET + POST with kickoff_at server-side guard
- `components/PredictionForm.tsx` — score input (home : away), submit
- `components/CountdownTimer.tsx` — client component, time to kickoff
- `components/MatchCard.tsx` — match display + inline form if pre-kickoff
- Update `app/matches/page.tsx` — add prediction form per match

Done when: player submits prediction → in DB; editing before kickoff works; post-kickoff edit rejected by server.

---

### 🔲 Phase 3 — Scoring + Leaderboard
**Goal:** Admin confirms result; points calculated; leaderboard updates.

Files to create:
- `lib/scoring/engine.ts` — `calculatePoints(pred, result)` pure function with unit tests
- `app/api/admin/override-result/route.ts` — set score → run scoring → insert scoring_log
- `app/admin/matches/page.tsx` — result override UI

Done when: all 5-point scoring cases correct; leaderboard reflects new totals.

---

### 🔲 Phase 4 — Telegram Notifications
**Goal:** Telegram message fires after every scored match.

Files to create:
- `lib/telegram/notify.ts` — `sendMatchResultNotification()`
- Wire into `override-result` route

Prerequisites: create Telegram bot via BotFather, add to group, get chat ID, set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_GROUP_CHAT_ID` env vars.

Done when: manual override triggers correct Telegram message to the group.

---

### 🔲 Phase 5 — Automated Polling
**Goal:** Results polled every 30 min without manual action.

Files to create:
- `supabase/functions/poll-match-results/index.ts` — Deno edge function

Setup steps:
1. Enable `pg_cron` + `pg_net` extensions in Supabase dashboard (Database → Extensions)
2. `supabase functions deploy poll-match-results`
3. `supabase secrets set FOOTBALL_DATA_API_KEY=... TELEGRAM_BOT_TOKEN=... TELEGRAM_GROUP_CHAT_ID=...`
4. Register cron in Supabase SQL editor:
```sql
select cron.schedule(
  'poll-match-results', '*/30 * * * *',
  $$ select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/poll-match-results',
    headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);
```

Done when: edge function invokes successfully; `cron.job_run_details` shows scheduled runs.

---

### 🔲 Phase 6 — UI Polish
**Goal:** Mobile-friendly, all-Finnish, edge cases handled.

- Responsive pass on all pages
- Finnish copy audit
- Loading states + error boundaries
- Postponed/cancelled match badges
- Favicon + meta tags

---

### 🔲 Phase 7 — Knockout Rounds (during tournament)
**Goal:** Add bracket rounds as they're confirmed.

- Admin re-runs "Tuo ottelut" per stage — safe to repeat (upserts on `external_id`)
- football-data.org uses TBD placeholders until bracket is set; verify team names after
