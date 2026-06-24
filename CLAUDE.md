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
| xG data + fast results | Flashscore via RapidAPI flashscore4 (HARD 500 req/month) |
| Notifications | Telegram Bot API |

UI language: Finnish. Layout: mobile-first. No open signup — admin invites players by email.

## Environment Variables

**`.env.local` (local) and Vercel dashboard (production):**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never in client code
FOOTBALL_DATA_API_KEY=
RAPIDAPI_KEY=                     # flashscore4 on RapidAPI — xG + fast results (500 req/month hard limit!)
TELEGRAM_BOT_TOKEN=
TELEGRAM_GROUP_CHAT_ID=
NEXT_PUBLIC_APP_URL=
TELEGRAM_WEBHOOK_SECRET=          # random string — set in both Vercel and when calling setWebhook
```

**Supabase Edge Function secrets** (set via `supabase secrets set`):
```
FOOTBALL_DATA_API_KEY=
RAPIDAPI_KEY=
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
- **Prediction deadline**: 5 minutes before kickoff. Enforced client-side (form hidden, countdown shows "Aikaa kohteen sulkeutumiseen:") and server-side (`POST /api/predictions` rejects if `kickoff_at − 5 min <= now()`). Kickoff time displayed to players is unchanged.
- **No open signup**: admin uses `/admin/players` to invite users via `supabase.auth.admin.inviteUserByEmail()`.
- **football-data.org rate limit**: 10 req/min. Group stage seed is one bulk call. The edge function polls one match at a time with a 7s sleep between calls.
- **football-data.org group format**: groups stored as `GROUP_A` (underscore, uppercase). `groupLabel()` in `lib/countries.ts` handles both `GROUP_A` and `Group A` formats → `Ryhmä A`.
- **Scoring log**: `scoring_log` rows are deleted and re-inserted on every score/re-score to prevent point stacking.
- **xG + fast results (Flashscore)**: `lib/flashscore/client.ts` — RapidAPI flashscore4, **HARD 500 req/month**. Every call is logged to `fs_requests` and refused past 450/month (budget guard in both the TS client and the Deno edge function). `matches.fs_match_id` pre-mapped for all 72 group matches; knockouts auto-resolved from the fixtures feed (throttled to 1 call/6 h). xG fetched once at scoring (attempts capped at 3 via `fs_xg_attempts`, cron backfills). `/haetulos` falls back to Flashscore's results feed (throttled to 1 call/3 min) when football-data.org hasn't flipped FINISHED yet — manual path only; the cron stays football-data.org-canonical. WC ids: template `lvUBR5F8`, season `185`.
- **api-football (legacy)**: free plan doesn't cover season 2026 — client kept in `lib/api-football/` but unused; `af_fixture_id` column dormant.
- **Leaderboard page**: uses `force-dynamic` (no ISR) because it reads cookie-based auth. Predictions fetched via service role to get all players' data for Yllätys% and Tas% stats.
- **Chart colors**: players pick a color from a 20-color palette in /settings. First-come-first-serve enforced by a partial unique index on `profiles.chart_color`. Auto-assigned from remaining pool for players without a pick. Logic in `lib/colors.ts`.
- **Types**: Supabase client uses untyped `any` generics for now. Run `supabase gen types typescript --project-id <ref> > types/database.ts` after `supabase login` to get proper types.

## Database Schema

All tables are in `supabase/migrations/`. Migrations 0001–0011 must be applied in order in the Supabase SQL editor.

| Table | Purpose |
|---|---|
| `profiles` | One row per auth user; auto-created via trigger on `auth.users` insert |
| `matches` | Seeded from football-data.org; result + xG fields set after match finishes |
| `predictions` | One row per (player, match); editable until 5 min before `kickoff_at` |
| `scoring_log` | Audit trail written after each match is scored |
| `category_bets` | Special bets: WORLD_CHAMPION, TOP_SCORER, group advance (one row per user+category) |
| `category_results` | Correct answers for each category, set by admin |

**Key columns added by later migrations:**
- `profiles.telegram_chat_id` — set by player in /settings or admin in /admin/players
- `profiles.chart_color` — hex string chosen by player in /settings; NULL = auto-assigned
- `profiles.clan` — 'Beeläiset' | 'Ceeläiset' | 'Independents' | NULL; chosen by player in /settings
- `matches.reminder_sent`, `matches.kickoff_msg_sent` — prevent double Telegram messages
- `matches.home_xg`, `matches.away_xg` — xG data; `matches.fs_match_id`, `matches.fs_xg_attempts` — Flashscore id + fetch attempt cap (migration 0013; `af_fixture_id` is legacy/dormant)
- `matches.category_bets_posted` — boolean; set true after special bets for this match's group/tournament have been posted to Telegram (migration 0014)
- `fs_requests` table — log of every Flashscore API call, enforces the 500/month hard limit
- `streak_seeds` table — pre-tournament streak values per player per type; `unique(display_name, streak_type)`; `streak_type` in ('correct_5p','right_result','wrong_result','zero_p','non_zero_p','non_5p') (migration 0014)

**Historical data tables** (read-only via RLS, written by import script):

| Table | Purpose |
|---|---|
| `competitions` | One row per tournament: id (EM08, MM10…), name, type (EC/WC), year, host |
| `hist_players` | Canonical player names + aliases array + optional link to live `profiles.id` |
| `hist_matches` | Match results per competition; stage uses short codes (AL1–AL3, JPV, JV, JF) |
| `hist_predictions` | Predictions + points per (match, player_name string) |
| `hist_player_comp_stats` | VIEW: aggregated stats per (player_name, competition_id) — use this, not raw rows |

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
  predictions/page.tsx    # All players' predictions for CLOSED targets: matches past the
                          # 5-min deadline (with points once scored) + special bets after
                          # their deadlines (champion/scorer table, group picks per closed group)
  my-predictions/page.tsx # Player's own predictions + points + special bets summary
                          # Special bets always visible; "muokattavissa" tag while open; correct answers revealed after deadline
  bets/page.tsx           # Special bets: champion, top scorer (country-grouped + search),
                          # group advance (wildcard for all tournament countries)
                          # confirmedBets state: persistent save indicator, unsaved-change warning
  settings/page.tsx       # Player self-service: display name, Telegram ID, chart color, clan
  history/page.tsx        # Historical competition browser: stats table + tournament comparison matrix
                          # Competition tabs (All / EM08 / MM10 / …); queries hist_player_comp_stats view
  history/CompPicker.tsx  # Client component: competition tab pills, updates ?comp= URL param
  admin/
    layout.tsx            # Guards: redirect non-admins to /leaderboard
    page.tsx              # Admin dashboard links
    seed/page.tsx         # Import matches from football-data.org
    matches/page.tsx      # Manual result override (also auto-fetches xG)
    players/page.tsx      # Invite players, set telegram_chat_id, copy login link to clipboard
    categories/page.tsx   # Score special bets (champion, scorer, group advance)

components/
  Nav.tsx                 # Sticky top nav; desktop: all links inline; mobile: Pisteet+Ottelut always visible, hamburger dropdown for rest
  MatchCard.tsx           # Match display with prediction form / locked / result
  PredictionForm.tsx      # Score input (home : away), optimistic save
  CountdownTimer.tsx      # Client component, updates every 30s
  PointsChart.tsx         # Recharts line chart; accepts colors[] prop (one per player)
  StatsTable.tsx          # Client component: transposed stats table; click a stat row to sort
                          # player columns by it (best first, click again to reverse); default Pts
  ChatBox.tsx             # Client component: live chat on leaderboard page
                          # Supabase Realtime subscription; iMessage-style bubbles; own messages deletable

lib/
  supabase/
    client.ts             # createBrowserClient (client components)
    server.ts             # createServerClient + createServiceRoleClient (server)
  football-data/client.ts # fetchMatches(), fetchMatch()
  flashscore/client.ts    # fetchFsResults(), fetchFsResultsThrottled(), fetchFsXg()
                          # budget-guarded via fs_requests (500/month hard limit)
  api-football/client.ts  # LEGACY (free plan lacks season 2026) — unused
  telegram/
    bot.ts                # sendMessage(), sendMessageWithMarkup(), answerCallbackQuery(),
                          # sendPhoto(), sendPhotoBuffer(), sendPhotoBytes(), getQuickChartUrl()
    notify.ts             # sendKickoffMessage(), sendResultMessage(), sendReminderDM(),
                          # sendStatsTable() — full stats board image via stats-image.tsx,
                          #   falls back to text summary if image generation fails
    stats-image.tsx       # renderStatsImage() — next/og (Satori) PNG renderer;
                          # per-stat heatmap: green (best) → red (worst), lowerIsBetter flag for Nol%
                          # sendClanWar() — clan rankings for /luokkasota command
                          # sendTopScorers() — top 10 scorers for /maaliporssi command
  scoring/engine.ts           # calculatePoints() — pure function, unit-tested
  scoring/score-and-notify.ts # scoreMatchAndNotify() — shared by /setscore bot cmd, override-result API, poll-and-score
  poll-and-score.ts           # pollAndScoreFinishedMatches() — shared logic for /haetulos (available to all group members)
  streaks.ts                  # computeStreaks(admin) — reads scoring_log + streak_seeds, returns current+best per player per type
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
    webhook/route.ts              # Telegram bot webhook — /start, /chart, /stats, /luokkasota, /maaliporssi, /putki, /haetulos, /help (group)
                                  # admin: /setscore, /matchid
                                  # /veikkaukset (DM); callback_query handler for edit:{matchId}; ForceReply prediction editing

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
    0013_flashscore.sql           # fs_match_id + fs_xg_attempts on matches; fs_requests budget log
    0014_streaks_and_bets_posted.sql  # streak_seeds table + category_bets_posted on matches
    0015_historical_data.sql          # competitions, hist_players, hist_matches, hist_predictions tables + RLS
    0016_hist_stats_view.sql          # hist_player_comp_stats view: aggregated (player, competition) stats
  functions/
    poll-match-results/index.ts      # Deno: polls football-data.org, scores, fetches xG, sends result message (spoiler-formatted)
    check-upcoming-matches/index.ts  # Deno: sends reminder DMs + predictions-reveal group message
                                     # (sent when betting closes, 5 min before kickoff)
                                     # also posts category bets (champion/scorer/group advance) when their deadline closes

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
| Poll result | `GET /v4/matches/{external_id}` | Edge function every 10 min |

Competition code: `WC`. Auth header: `X-Auth-Token`.

## Flashscore via RapidAPI (xG + fast results)

Base URL: `https://flashscore4.p.rapidapi.com/api/flashscore/v2`.
Headers: `x-rapidapi-host: flashscore4.p.rapidapi.com`, `x-rapidapi-key: $RAPIDAPI_KEY`.
WC 2026: `tournament_template_id=lvUBR5F8`, `season_id=185`.
**HARD LIMIT 500 requests/month** — every call logged to `fs_requests`, clients refuse past 450.

| Purpose | Endpoint | When called |
|---|---|---|
| Finished matches + scores | `GET /tournaments/results?...&page=1` | /haetulos fallback when FD lags (throttle: 1/3 min) |
| xG (in "Expected goals (xG)" stat row) | `GET /matches/match/stats?match_id={fs_match_id}` | Once per match at scoring; ≤3 attempts via cron backfill |
| Resolve knockout match ids | `GET /tournaments/fixtures?...&page=1` | Only when unmapped matches exist (throttle: 1/6 h) |

Estimated tournament spend: ~150–250 requests/month. Check usage: `select count(*) from fs_requests where called_at >= date_trunc('month', now());`

## Telegram Bot

Bot: `@veikkaajat_apumarko_bot`

**Automatic messages:**
- 🔔 Predictions-reveal message (group): shows all predictions as soon as betting closes (5 min before kickoff; sent by the 5-min cron, so it lands between deadline and kickoff)
- ⚽ Result message (group): result, per-player points, leaderboard with ↑↓→ arrows
- ⏰ Reminder DM: sent 30 min before kickoff (or at 22:00 Helsinki for matches starting 23:00–05:00); includes "✏️ Veikkaa nyt" inline button to edit directly via bot

**Commands (group):**
- `/chart` — cumulative points line chart image (QuickChart.io)
- `/stats` — full stats board image (same columns as /leaderboard: Pts, KA, Tark, Mrk%, Nol%, L-KA, J-KA, Tas%, Yllätys%, Jht, xG-Pts, Bonus) rendered with next/og; each stat cell color-coded green (best) → red (worst); after the betting deadline also Mestari + Maalikuningas pick columns (uncolored text); caption has legend + link; falls back to text summary on error
- `/luokkasota` — clan rankings: total + average pts per clan, members listed under each
- `/maaliporssi` — top 10 tournament scorers from football-data.org (player, Finnish country name, goals, assists); sorted by goals desc then assists desc
- `/putki` — streak overview: top 3 per streak type (correct_5p, right_result, wrong_result, zero_p, non_zero_p, non_5p); current + best per player
- `/haetulos` — available to all group members; immediately polls football-data.org for any match that kicked off 85+ min ago and isn't scored yet, scores it, and sends the result message. If FD hasn't flipped FINISHED yet (free-tier lag ~20–35 min), falls back to Flashscore's results feed (works right after the final whistle; throttled to 1 call/3 min)
- `/help` — lists commands

**Admin-only commands (group):**
- `/setscore <id> <h-a>` — set match result (e.g. `/setscore 42 2-1`); scores predictions + sends result message; caller must have `telegram_chat_id` matching an `is_admin` profile
- `/matchid` — shows 2 previous + 2 next matches with id, teams, score, kickoff time

**Commands (DM):**
- `/start` — bot replies with the user's Telegram chat ID
- `/veikkaukset` — shows the user's predictions for the next 5 open matches; each has an "✏️ Muokkaa / Veikkaa" inline button

**Inline prediction editing (DM):**
- Tapping an edit button triggers a ForceReply prompt: `"Syötä veikkauksesi ottelulle #ID …"`
- User replies with `2-1`; bot parses, enforces the 5-min deadline, saves via service role, confirms
- Works from both `/veikkaukset` and reminder DM buttons

**Day-in-lead counting:** grouped by Helsinki calendar day with 10:00 Helsinki cutoff (UTC−7 shift), so US late-night matches fall under the correct gameday.

**Bonus column** in `/stats` appears only after the betting deadline (first match kickoff) and only if someone has scored bonus points.

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
- `POST /api/predictions` with server-side deadline guard (5 min before kickoff)
- `MatchCard`, `PredictionForm`, `CountdownTimer` components
- `CountdownTimer` counts down to the prediction deadline (not kickoff); shows "Aikaa kohteen sulkeutumiseen:" label
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
- Special bets summary shown on `/my-predictions`: champion, scorer, group picks with flags, always visible; shows "muokattavissa" tag while betting is still open; correct answers and points revealed after deadline

### ✅ Phase 5 — Automated Polling
- `poll-match-results` edge function: runs every 10 min, polls football-data.org, scores predictions, fetches xG from Flashscore, sends Telegram result message; also backfills missing xG and resolves knockout fs_match_ids
- NOTE: football-data.org free tier marks matches FINISHED ~20–35 min after full time (upstream lag) — the cron stays FD-canonical; only manual /haetulos uses the Flashscore fallback. api-football free plan does NOT cover season 2026 (replaced by Flashscore 2026-06-12)
- `check-upcoming-matches` edge function: runs every 5 min, sends reminder DMs and kickoff messages
- pg_cron jobs registered in Supabase — canonical SQL in `supabase/cron.sql` (substitute project ref + anon key!); verify with `cron.job_run_details` and `net._http_response` after changes
- xG fetched from Flashscore and stored on match row (`fs_match_id` pre-mapped/cached)

### ✅ Phase 5c — Clan War
- `profiles.clan` column (migration 0011): 'Beeläiset' | 'Ceeläiset' | 'Independents' | NULL
- Players pick their clan in `/settings` (radio buttons, saveable independently)
- `/luokkasota` Telegram command: clan totals + averages (ranked by avg), members listed per clan
- `sendClanWar()` in `lib/telegram/notify.ts`

### ✅ Phase 5e — Streaks, Spoilers, Tie-breakers & Bot Commands
- **Streak tracking** (`lib/streaks.ts`, `streak_seeds` table, migration 0014):
  - 6 streak types per player: `correct_5p`, `right_result`, `wrong_result`, `zero_p`, `non_zero_p`, `non_5p`
  - Seeds from `streak_seeds` table (pre-tournament values); extended/reset chronologically from `scoring_log`
  - `computeStreaks(admin)` — pure async function, returns current + best per player per type
- **`/putki` Telegram command** (group): top 3 per streak type; calls `sendStreaks()` in `lib/telegram/notify.ts`
- **`/matchid` Telegram command** (admin only): 2 previous + 2 next matches with id, teams, score, date
- **`/setscore <id> <h-a>` Telegram command** (admin only): sets match result + scores predictions + sends Telegram message; calls shared `scoreMatchAndNotify()` in `lib/scoring/score-and-notify.ts`
- **Shared scoring helper** `lib/scoring/score-and-notify.ts`: `scoreMatchAndNotify()` used by `/setscore`, `/admin/override-result`, and `/haetulos`
- **Spoiler formatting**: result messages wrap everything after "Tulos:" in `<tg-spoiler>` (score, per-player points, leaderboard) — both cron (`poll-match-results`) and notify.ts
- **Tark tie-breaker**: leaderboard (`app/leaderboard/page.tsx`), result message sort (`lib/telegram/notify.ts`), and edge function `poll-match-results` all use exact matches (Tark) as secondary sort when points are tied
- **Assists tie-breaker** in `/maaliporssi`: top scorers sorted by goals desc then assists desc
- **Category bets auto-posting** (`category_bets_posted` column, migration 0014): `check-upcoming-matches` edge function posts champion/scorer picks when tournament's first match closes, group advance picks when first match of each group closes. `category_bets.category` values match `group_name` directly (`GROUP_C` etc.)
- **Late-night fix**: `isLateNight()` now uses `h <= 5` (was `h < 5`) — matches at 05:00 Helsinki correctly get the 22:00 reminder

### ✅ Phase 5d — Admin & Chat
- Login link generator: `POST /api/admin/generate-login-link` uses `auth.admin.generateLink()` (service role); button in `/admin/players` copies link to clipboard — no email needed
- Live chat on `/leaderboard`: `ChatBox` client component, `chat_messages` table (migration 0012), Supabase Realtime for instant updates, iMessage-style UI, own messages deletable on hover
- Enable Realtime for chat_messages: `ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;`
- `/maaliporssi` Telegram command: fetches top 10 scorers from `GET /v4/competitions/WC/scorers`; shows player, Finnish country name, goals, assists; `fetchTopScorers()` in `lib/football-data/client.ts`, `sendTopScorers()` in `lib/telegram/notify.ts`
- `/haetulos` opened to all group members (was admin-only)
- `/veikkaukset` DM command: shows next 5 open match predictions with inline "✏️ Muokkaa / Veikkaa" buttons
- Inline prediction editing via Telegram: ForceReply flow — user taps button → bot prompts with `#matchId` embedded → user replies `2-1` → saved via service role with deadline check
- Reminder DMs now include "✏️ Veikkaa nyt" inline button (same edit flow); edge function `check-upcoming-matches` updated
- `lib/telegram/bot.ts` extended with `sendMessageWithMarkup()` and `answerCallbackQuery()`

### ✅ Phase 5b — Leaderboard & Stats
- Leaderboard: `force-dynamic`, auth guard, all-player predictions via service role
- Transposed stats table (stats = rows, players = columns with rotated names)
- Stats: Pts, KA, Tark, Mrk%, Nol%, L-KA, J-KA, Tas%, Yllätys%, Jht, xG-Pts, Bonus
- Yllätys%: correct result when ≤25% of players predicted same result sign (minority-pick based)
- Cumulative points line chart always visible (empty until first match scored)
- Player-chosen chart colors (20-color palette, first-come-first-serve, stored in DB)
  - `lib/colors.ts`, `app/api/profile/color/route.ts`, migration 0010
  - Color picker in `/settings`

### ✅ Phase 5f — Historical Data
- **Schema** (migrations 0015–0016): `competitions`, `hist_players`, `hist_matches`, `hist_predictions`, `hist_player_comp_stats` view
- **Import script** `scripts/import-historical.ts`: reads competition CSVs, resolves player names via canonical names + aliases, interactive dry-run before inserting. Usage: `npx tsx scripts/import-historical.ts <csv> <competition-id>`
- **Player registry** (`hist_players`): canonical names linked to live `profiles` via `profile_id`; `aliases` array handles past names (e.g. Kranjech → Pepe Bonito). Add new aliases with `UPDATE hist_players SET aliases = aliases || '{"alias"}' WHERE canonical_name = '...'`
- **Competitions imported**: EM08, MM10, EM12, MM14, EM16, MM18, EM20, EM24 (WC2026 will be archived here post-tournament)
- **Stage codes** in hist_matches: `AL1/AL2/AL3` = group rounds, `JPV` = quarter-finals, `JV` = semi-finals, `JF` = final, `JNV` = final (alternate). GROUP_STAGES set = `{'AL1','AL2','AL3'}` used in view and page logic.
- **`/history` page**: stats table (Pts, KA, Tark, Mrk%, Nol%, L-KA, J-KA) + Turnausvertailu matrix (player × competition). Queries `hist_player_comp_stats` view — never raw prediction rows (avoids Supabase 1000-row default limit). `?comp=EM08` filters stats table; matrix always shows all competitions.
- **Nav**: mobile hamburger added; `Pisteet` and `Ottelut` always visible; all other links (incl. Historia) in dropdown.

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
