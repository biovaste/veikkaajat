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
- 5 pts — Top Scorer (deadline: first match kickoff); named players + wildcard per country
- 4 pts — 2 advancing teams per group (BOTH must be correct; 1 correct = 0 pts; deadline: group's first match)

Scoring engine: `lib/scoring/engine.ts` — pure function, unit-tested.
Special bet scoring: `app/api/admin/score-categories/route.ts`.

## Key Architectural Decisions

- **Admin writes**: seed and override API routes use `createServerClient()` (anon key + cookie session). RLS allows writes because `profiles.is_admin = true` for the authenticated user (see migration 0004). `createServiceRoleClient()` is reserved for `auth.admin.*` operations (e.g. inviting users) and for reading all players' predictions in the leaderboard (bypasses `predictions_select_own` RLS). Note: the new Supabase "Secret API key" is NOT the legacy `service_role` JWT and does not bypass RLS — don't confuse them.
- **Kickoff lock**: enforced both client-side (hide form) and server-side (`POST /api/predictions` rejects if `kickoff_at <= now()`).
- **No open signup**: admin uses `/admin/players` to invite users via `supabase.auth.admin.inviteUserByEmail()`.
- **football-data.org rate limit**: 10 req/min. Group stage seed is one bulk call. The edge function polls one match at a time with a 7s sleep between calls.
- **football-data.org group format**: groups stored as `GROUP_A` (underscore, uppercase). `groupLabel()` in `lib/countries.ts` handles both `GROUP_A` and `Group A` formats → `Ryhmä A`.
- **Scoring log**: `scoring_log` rows are deleted and re-inserted on every score/re-score to prevent point stacking.
- **xG**: fetched from api-football.com after each match is scored (best-effort, non-fatal). `af_fixture_id` cached on match row to avoid re-lookup on re-scoring.
- **Leaderboard page**: uses `force-dynamic` (no ISR) because it reads cookie-based auth. Predictions fetched via service role to get all players' data for Yllätys% and Tas% stats.
- **Chart colors**: players pick a color from a 20-color palette in /settings. First-come-first-serve enforced by a partial unique index on `profiles.chart_color`. Auto-assigned from remaining pool for players without a pick. Logic in `lib/colors.ts`.
- **Types**: Supabase client uses untyped `any` generics for now. Run `supabase gen types typescript --project-id <ref> > types/database.ts` after `supabase login` to get proper types.

## Database Schema

All tables are in `supabase/migrations/`. Migrations 0001–0011 must be applied in order in the Supabase SQL editor.

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
- `profiles.chart_color` — hex string chosen by player in /settings; NULL = auto-assigned
- `profiles.clan` — 'Beeläiset' | 'Ceeläiset' | 'Independents' | NULL; chosen by player in /settings
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
  leaderboard/page.tsx    # Leaderboard + cumulative chart + transposed stats table
                          # force-dynamic; predictions via service role for full stats
  matches/page.tsx        # Fixture list + prediction entry
  my-predictions/page.tsx # Player's own predictions + points + special bets summary
  bets/page.tsx           # Special bets: champion, top scorer (country-grouped + search),
                          # group advance (wildcard for all tournament countries)
                          # confirmedBets state: persistent save indicator, unsaved-change warning
  settings/page.tsx       # Player self-service: display name, Telegram ID, chart color, clan
  admin/
    layout.tsx            # Guards: redirect non-admins to /leaderboard
    page.tsx              # Admin dashboard links
    seed/page.tsx         # Import matches from football-data.org
    matches/page.tsx      # Manual result override (also auto-fetches xG)
    players/page.tsx      # Invite players, set telegram_chat_id, copy login link to clipboard
    categories/page.tsx   # Score special bets (champion, scorer, group advance)

components/
  Nav.tsx                 # Sticky top nav; ⚙ settings icon next to sign-out
  MatchCard.tsx           # Match display with prediction form / locked / result
  PredictionForm.tsx      # Score input (home : away), optimistic save
  CountdownTimer.tsx      # Client component, updates every 30s
  PointsChart.tsx         # Recharts line chart; accepts colors[] prop (one per player)
  ChatBox.tsx             # Client component: live chat on leaderboard page
                          # Supabase Realtime subscription; iMessage-style bubbles; own messages deletable

lib/
  supabase/
    client.ts             # createBrowserClient (client components)
    server.ts             # createServerClient + createServiceRoleClient (server)
  football-data/client.ts # fetchMatches(), fetchMatch()
  api-football/client.ts  # findAfFixtureId(), fetchFixtureXg() — xG from api-sports.io
  telegram/
    bot.ts                # sendMessage(), sendPhoto(), sendPhotoBuffer(), getQuickChartUrl()
    notify.ts             # sendKickoffMessage(), sendResultMessage(), sendReminderDM(),
                          # sendStatsTable() — text summary + link to /leaderboard
                          # sendClanWar() — clan rankings for /luokkasota command
  scoring/engine.ts       # calculatePoints() — pure function, unit-tested
  poll-and-score.ts       # pollAndScoreFinishedMatches() — shared logic for /haetulos and future use
  players.ts              # TOP_SCORER_PLAYERS list (~80 players, no rank field),
                          # sorted by Finnish country name; wildcard helpers
  countries.ts            # getCountry(), flagUrl(), groupLabel()
                          # groupLabel handles both "GROUP_A" and "Group A" → "Ryhmä A"
  colors.ts               # CHART_COLORS (20-color palette), assignColors()
  utils.ts                # formatDate (Finnish), stageLabel(), resultLabel()

app/api/
  predictions/route.ts            # GET + POST predictions
  category-bets/route.ts          # GET + POST special bets (deadline enforced server-side)
  profile/color/route.ts          # POST: pick/release chart color (unique constraint enforced)
  admin/seed-matches/route.ts     # POST: import from football-data.org
  admin/override-result/route.ts  # POST: set result + score + fetch xG + notify Telegram
  admin/score-categories/route.ts # POST: set category result + score all bets
  admin/invite-player/route.ts        # POST: send magic link invite
  admin/generate-login-link/route.ts  # POST: generate magic link and return URL (admin only, no email sent)
  telegram/
    webhook/route.ts              # Telegram bot webhook — /start, /chart, /stats, /luokkasota, /haetulos, /help

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
    0007_leaderboard_rls.sql      # scoring_log readable by all authenticated users
    0008_category_bets.sql        # category_bets + category_results tables + RLS
    0009_xg_columns.sql           # af_fixture_id, home_xg, away_xg on matches
    0010_chart_color.sql          # chart_color on profiles + partial unique index
    0011_clan.sql                 # clan on profiles (CHECK constraint, 3 allowed values)
    0012_chat.sql                 # chat_messages table + RLS (read all, insert/delete own)
  functions/
    poll-match-results/index.ts      # Deno: polls football-data.org, scores, fetches xG, sends result message
    check-upcoming-matches/index.ts  # Deno: sends reminder DMs + kickoff group message

types/
  database.ts            # Hand-written types (replace with supabase gen types)
```

## Leaderboard Stats Table

Transposed layout: stats = rows, players = columns (names rotated 90°).
Leader column tinted yellow, own column tinted blue.

| Column | Description |
|---|---|
| Pts | Total points (match + bonus) |
| KA | Points per match average (match predictions only) |
| Tark | Exact scores (correct result + both goal tallies) |
| Mrk% | Correct result % |
| Nol% | Zero-point match % |
| L-KA | Group stage average |
| J-KA | Knockout stage average |
| Tas% | Draw prediction accuracy (own predictions only) |
| Yllätys% | Correct result when ≤25% of players predicted the same sign. Only minority picks count toward the denominator — majority picks (>25%) are ignored entirely. |
| Jht | Calendar days in the lead (10:00 Helsinki cutoff, UTC−7 shift) |
| xG-Pts | Points if actual scores were rounded xG values (shown when xG data available) |
| Bonus | Category bet bonus (shown after betting deadline if any scored) |

## Top Scorer Player List

`lib/players.ts` — ~80 named players, no `rank` field, sorted alphabetically by Finnish country name then surname within country. Countries covered include: Netherlands, Argentina, Algeria, Australia, Belgium, Bosnia and Herzegovina, Brazil, Ecuador, Egypt, England, Spain, South Africa, South Korea, Ghana, Haiti, Iran, Austria, Japan, Canada, Colombia, DR Congo, Croatia, Morocco, Mexico, Norway, Ivory Coast, Paraguay, Portugal, France, Sweden, Germany, Senegal, Scotland, Switzerland, Czech Republic, Turkey, Uruguay, New Zealand, Uzbekistan, United States. Wildcard option available for all tournament countries (including those with no named players) — sourced from `data.groups` in the bets page.

## Chart Color System

`lib/colors.ts` — 20-color palette (`CHART_COLORS`, `CHART_COLOR_HEXES`), `assignColors()`.

- Players pick a color in `/settings` via `POST /api/profile/color`
- Stored as `profiles.chart_color` (hex string or NULL)
- Unique partial index (`WHERE chart_color IS NOT NULL`) enforces first-come-first-serve at DB level
- API returns 409 on conflict (color already taken)
- `assignColors()`: explicit picks first, remaining pool filled in order for unassigned players
- `PointsChart` accepts `colors?: string[]` prop — one color per player in sorted order

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
- `/stats` — text summary (rank, pts, KA, exact, days in lead) + link to /leaderboard
- `/luokkasota` — clan rankings: total + average pts per clan, members listed under each
- `/haetulos` — admin only; immediately polls football-data.org for any match that kicked off 85+ min ago and isn't scored yet, scores it, and sends the result message
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
- `/chart`, `/stats` (text + link to /leaderboard), `/help`, `/start` commands
- Webhook at `/api/telegram/webhook` (excludes /api/ from auth redirect in proxy.ts)
- Players self-register Telegram ID via `/settings` page

### ✅ Phase 4b — Special Bets
- `category_bets` + `category_results` tables (migration 0008)
- `/bets` page: World Champion, Top Scorer (country-grouped with search, wildcards for all tournament countries), group advance
- `/admin/categories` page for admin scoring
- Deadline enforced server-side (first match kickoff for champion/scorer, group's first match for group bets)
- Category bonus included in leaderboard totals and `/stats`
- `confirmedBets` state tracks server-persisted value separately from current selection: persistent "✓ Tallennettu: X" line always visible, warns if selection changed without saving
- Special bets summary shown on `/my-predictions`: champion, scorer, group picks with flags, points and correct answers revealed after deadline; picks hidden while betting is open

### ✅ Phase 5 — Automated Polling
- `poll-match-results` edge function: runs every 30 min, polls football-data.org, scores predictions, fetches xG, sends Telegram result message
- `check-upcoming-matches` edge function: runs every 5 min, sends reminder DMs and kickoff messages
- pg_cron jobs registered in Supabase
- xG fetched from api-football.com and stored on match row (`af_fixture_id` cached)

### ✅ Phase 5c — Clan War
- `profiles.clan` column (migration 0011): 'Beeläiset' | 'Ceeläiset' | 'Independents' | NULL
- Players pick their clan in `/settings` (radio buttons, saveable independently)
- `/luokkasota` Telegram command: clan totals + averages (ranked by avg), members listed per clan
- `sendClanWar()` in `lib/telegram/notify.ts`

### ✅ Phase 5d — Admin & Chat
- Login link generator: `POST /api/admin/generate-login-link` uses `auth.admin.generateLink()` (service role); button in `/admin/players` copies link to clipboard — no email needed
- Live chat on `/leaderboard`: `ChatBox` client component, `chat_messages` table (migration 0012), Supabase Realtime for instant updates, iMessage-style UI, own messages deletable on hover
- Enable Realtime for chat_messages: `ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;`

### ✅ Phase 5b — Leaderboard & Stats
- Leaderboard: `force-dynamic`, auth guard, all-player predictions via service role
- Transposed stats table (stats = rows, players = columns with rotated names)
- Stats: Pts, KA, Tark, Mrk%, Nol%, L-KA, J-KA, Tas%, Yllätys%, Jht, xG-Pts, Bonus
- Yllätys%: correct result when ≤25% of players predicted same result sign (minority-pick based)
- Cumulative points line chart always visible (empty until first match scored)
- Player-chosen chart colors (20-color palette, first-come-first-serve, stored in DB)
  - `lib/colors.ts`, `app/api/profile/color/route.ts`, migration 0010
  - Color picker in `/settings`

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
