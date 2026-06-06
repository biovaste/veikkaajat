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
| xG data | api-football.com v3 (free tier, 100 req/day) |
| Notifications | Telegram Bot API |

UI language: Finnish. Layout: mobile-first. No open signup — admin invites players by email.

## Environment Variables

**`.env.local` (local) and Vercel dashboard (production):**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never in client code
FOOTBALL_DATA_API_KEY=
API_FOOTBALL_KEY=                 # api-sports.io key for xG data
TELEGRAM_BOT_TOKEN=
TELEGRAM_GROUP_CHAT_ID=
NEXT_PUBLIC_APP_URL=
TELEGRAM_WEBHOOK_SECRET=          # random string — set in both Vercel and when calling setWebhook
```

**Supabase Edge Function secrets** (set via `supabase secrets set`):
```
FOOTBALL_DATA_API_KEY=
API_FOOTBALL_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_GROUP_CHAT_ID=
NEXT_PUBLIC_APP_URL=
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected
```

## Scoring Rules

### Match predictions (max 5 pts per match)
- 3 pts — correct match result (win/draw/loss)
- +1 pt — correct home team goal tally
- +1 pt — correct away team goal tally

### Special bets (category_bets table)
- 10 pts — World Champion (deadline: first match kickoff)
- 5 pts — Top Scorer (deadline: first match kickoff); 50 named players + wildcard per country
- 4 pts — 2 advancing teams per group (BOTH must be correct; 1 correct = 0 pts; deadline: group's first match)

Scoring engine: `lib/scoring/engine.ts` — pure function, unit-tested.
Special bet scoring: `app/api/admin/score-categories/route.ts`.

## Key Architectural Decisions

- **Admin writes**: seed and override API routes use `createServerClient()` (anon key + cookie session). RLS allows writes because `profiles.is_admin = true` for the authenticated user (see migration 0004). `createServiceRoleClient()` is reserved for `auth.admin.*` operations (e.g. inviting users) — it uses `@supabase/supabase-js` `createClient` directly with no cookies. Note: the new Supabase "Secret API key" is NOT the legacy `service_role` JWT and does not bypass RLS — don't confuse them. The edge function bypasses RLS via the service role key directly.
- **Kickoff lock**: enforced both client-side (hide form) and server-side (`POST /api/predictions` rejects if `kickoff_at <= now()`).
- **No open signup**: admin uses `/admin/players` to invite users via `supabase.auth.admin.inviteUserByEmail()`.
- **football-data.org rate limit**: 10 req/min. Group stage seed is one bulk call. The edge function polls one match at a time with a 7s sleep between calls.
- **Scoring log**: `scoring_log` rows are deleted and re-inserted on every score/re-score to prevent point stacking.
- **xG**: fetched from api-football.com after each match is scored (best-effort, non-fatal). `af_fixture_id` cached on match row to avoid re-lookup on re-scoring.
- **Group labels**: football-data.org returns `Group A` etc.; displayed as `Ryhmä A` via `groupLabel()` in `lib/countries.ts`.
- **Types**: Supabase client uses untyped `any` generics for now. Run `supabase gen types typescript --project-id <ref> > types/database.ts` after `supabase login` to get proper types.

## Database Schema

All tables are in `supabase/migrations/`. Migrations 0001–0009 must be applied in order in the Supabase SQL editor.

| Table | Purpose |
|---|---|
| `profiles` | One row per auth user; auto-created via trigger on `auth.users` insert |
| `matches` | Seeded from football-data.org; result + xG fields set after match finishes |
| `predictions` | One row per (player, match); editable until `kickoff_at` |
| `scoring_log` | Audit trail written after each match is scored |
| `category_bets` | Special bets: WORLD_CHAMPION, TOP_SCORER, group advance (one row per user+category) |
| `category_results` | Correct answers for each category, set by admin |

**Key columns added by later migrations:**
- `profiles.telegram_chat_id` — set by player in /settings or admin in /admin/players
- `matches.reminder_sent`, `matches.kickoff_msg_sent` — prevent double Telegram messages
- `matches.af_fixture_id`, `matches.home_xg`, `matches.away_xg` — xG data from api-football.com

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
  leaderboard/page.tsx    # Points leaderboard (match pts + category bonus)
  matches/page.tsx        # Fixture list + prediction entry
  my-predictions/page.tsx # Player's own predictions + points
  bets/page.tsx           # Special bets: champion, top scorer, group advance
  settings/page.tsx       # Player self-service: display name + Telegram chat ID
  admin/
    layout.tsx            # Guards: redirect non-admins to /leaderboard
    page.tsx              # Admin dashboard links
    seed/page.tsx         # Import matches from football-data.org
    matches/page.tsx      # Manual result override (also auto-fetches xG)
    players/page.tsx      # Invite players, set telegram_chat_id
    categories/page.tsx   # Score special bets (champion, scorer, group advance)

components/
  Nav.tsx                 # Sticky top nav; ⚙ settings icon next to sign-out
  MatchCard.tsx           # Match display with prediction form / locked / result
  PredictionForm.tsx      # Score input (home : away), optimistic save
  CountdownTimer.tsx      # Client component, updates every 30s

lib/
  supabase/
    client.ts             # createBrowserClient (client components)
    server.ts             # createServerClient + createServiceRoleClient (server)
  football-data/client.ts # fetchMatches(), fetchMatch()
  api-football/client.ts  # findAfFixtureId(), fetchFixtureXg() — xG from api-sports.io
  telegram/
    bot.ts                # sendMessage(), sendPhoto(), sendPhotoBuffer(), getQuickChartUrl()
    notify.ts             # sendKickoffMessage(), sendResultMessage(), sendReminderDM(),
                          # sendStatsTable() (QuickChart table image), sendChartImage()
  scoring/engine.ts       # calculatePoints() — pure function, unit-tested
  players.ts              # TOP_SCORER_PLAYERS list (50 players), wildcard helpers
  countries.ts            # getCountry(), flagUrl(), groupLabel() (Group X → Ryhmä X)
  utils.ts                # formatDate (Finnish), stageLabel(), resultLabel()

app/api/
  predictions/route.ts            # GET + POST predictions
  category-bets/route.ts          # GET + POST special bets (deadline enforced server-side)
  admin/seed-matches/route.ts     # POST: import from football-data.org
  admin/override-result/route.ts  # POST: set result + score + fetch xG + notify Telegram
  admin/score-categories/route.ts # POST: set category result + score all bets
  admin/invite-player/route.ts    # POST: send magic link invite
  telegram/
    webhook/route.ts              # Telegram bot webhook — /start, /chart, /stats, /help

proxy.ts                # Next.js proxy (was: middleware): session refresh + auth redirect
                        # Excludes /api/ routes so Telegram webhook isn't redirected to /login

supabase/
  migrations/
    0001_initial_schema.sql
    0002_rls_policies.sql
    0003_triggers.sql
    0004_matches_admin_policies.sql
    0005_telegram_fields.sql      # telegram_chat_id on profiles; reminder_sent/kickoff_msg_sent on matches
    0006_onboarded.sql
    0007_leaderboard_rls.sql
    0008_category_bets.sql        # category_bets + category_results tables + RLS
    0009_xg_columns.sql           # af_fixture_id, home_xg, away_xg on matches
  functions/
    poll-match-results/index.ts      # Deno: polls football-data.org, scores, fetches xG, sends result message
    check-upcoming-matches/index.ts  # Deno: sends reminder DMs + kickoff group message

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

## api-football.com (xG)

Base URL: `https://v3.football.api-sports.io`. Auth header: `x-apisports-key`.
World Cup league ID: **1**, season: **2026**.

| Purpose | Endpoint | When called |
|---|---|---|
| Find fixture ID | `GET /fixtures?league=1&season=2026&date=YYYY-MM-DD` | On first score of a match |
| Fetch xG | `GET /fixtures/statistics?fixture={af_fixture_id}` | On score (cached after first fetch) |

Free tier: 100 req/day — sufficient (1 lookup + 1 stats call per match, ~64 matches total).

## Telegram Bot

Bot: `@veikkaajat_apumarko_bot`

**Automatic messages:**
- 🔔 Kickoff message (group): shows all predictions when match starts
- ⚽ Result message (group): result, per-player points, leaderboard with ↑↓→ arrows
- ⏰ Reminder DM: sent 30 min before kickoff (or at 22:00 Helsinki for matches starting 23:00–05:00)

**Commands (group):**
- `/chart` — cumulative points line chart image (QuickChart.io)
- `/stats` — full stats table image: pts, KA, exact scores, correct result %, zero-match %, group/knockout avg, draw/decisive accuracy %, days in lead, xG-pts (when available), champion/scorer picks (after deadline)
- `/help` — lists commands

**Commands (DM):**
- `/start` — bot replies with the user's Telegram chat ID

**Day-in-lead counting:** grouped by Helsinki calendar day with 10:00 Helsinki cutoff (UTC−7 shift), so US late-night matches fall under the correct gameday.

**Special bet picks** in `/stats` are hidden until the first match has kicked off (betting deadline).

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
- Next.js 16 + TypeScript + Tailwind CSS
- Supabase client wrappers, session refresh proxy, magic link login, auth callback
- Auto-create profile trigger on first login

### ✅ Phase 1 — Match Seeding + Admin Foundation
- `lib/football-data/client.ts` — `fetchMatches()`, `fetchMatch()`
- `POST /api/admin/seed-matches` — upsert on `external_id`
- `POST /api/admin/invite-player`
- `/admin`, `/admin/seed`, `/admin/players`, `/matches`, `/leaderboard`, `/my-predictions`

### ✅ Phase 2 — Predictions
- `POST /api/predictions` with server-side kickoff guard
- `MatchCard`, `PredictionForm`, `CountdownTimer` components
- `/matches` page with inline prediction forms

### ✅ Phase 3 — Scoring + Leaderboard
- `lib/scoring/engine.ts` — `calculatePoints()`, unit-tested
- `POST /api/admin/override-result` — scores all players, replaces scoring_log (no stacking)
- `/admin/matches` result override page

### ✅ Phase 4 — Telegram Bot
- Kickoff messages, result messages with leaderboard arrows, reminder DMs
- `/chart`, `/stats` (QuickChart table image), `/help`, `/start` commands
- Webhook at `/api/telegram/webhook` (excludes /api/ from auth redirect in proxy.ts)
- Players self-register Telegram ID via `/settings` page

### ✅ Phase 4b — Special Bets
- `category_bets` + `category_results` tables (migration 0008)
- `/bets` page: World Champion, Top Scorer (50 players + all-country wildcards), group advance
- `/admin/categories` page for admin scoring
- Deadline enforced server-side (first match kickoff for champion/scorer, group's first match for group bets)
- Category bonus included in leaderboard totals and `/stats`

### ✅ Phase 5 — Automated Polling
- `poll-match-results` edge function: runs every 30 min, polls football-data.org, scores predictions, fetches xG, sends Telegram result message
- `check-upcoming-matches` edge function: runs every 5 min, sends reminder DMs and kickoff messages
- pg_cron jobs registered in Supabase
- xG fetched from api-football.com and stored on match row (`af_fixture_id` cached)

### 🔲 Phase 6 — UI Polish
- Responsive pass on all pages
- Finnish copy audit
- Loading states + error boundaries
- Postponed/cancelled match badges
- Favicon + meta tags

### 🔲 Phase 7 — Knockout Rounds (during tournament)
- Admin re-runs "Tuo ottelut" per stage (ROUND_OF_16, QUARTER_FINALS, SEMI_FINALS, FINAL)
- Safe to repeat — upserts on `external_id`
- Verify team names once bracket is confirmed (football-data.org uses TBD placeholders until then)
