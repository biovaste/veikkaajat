# Build Progress

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
- Stats: Pts, KA, Tark, Mrk%, Nol%, L-KA, J-KA, Tas%, Yllätys%, Jht, Trendi, xG-Pts, Bonus
- Yllätys%: correct result when ≤25% of players predicted same result sign (minority-pick based)
- Cumulative points line chart always visible (empty until first match scored)
- Player-chosen chart colors (20-color palette, first-come-first-serve, stored in DB)
  - `lib/colors.ts`, `app/api/profile/color/route.ts`, migration 0010
  - Color picker in `/settings`

### ✅ Phase 5f — Historical Data
- **Schema** (migrations 0015–0016): `competitions`, `hist_players`, `hist_matches`, `hist_predictions`, `hist_player_comp_stats` view
- **Import script** `scripts/import-historical.ts`: reads competition CSVs, resolves player names via canonical names + aliases, interactive dry-run before inserting. Usage: `npx tsx scripts/import-historical.ts <csv> <competition-id>`
- **Player registry** (`hist_players`): canonical names linked to live `profiles` via `profile_id`; `aliases` array handles past names (e.g. Kranjech → Pepe Bonito). Add new aliases with `UPDATE hist_players SET aliases = aliases || '{"alias"}' WHERE canonical_name = '...'`
- **Competitions imported**: EM08, MM10, EM12, MM14, EM16, MM18, EM20, EM24 (WC2026 is tracked live via `MM26` — see Phase 5h)
- **Stage codes** in hist_matches: `AL1/AL2/AL3` = group rounds, `JPV` = quarter-finals, `JV` = semi-finals, `JF` = final, `JNV` = final (alternate). GROUP_STAGES set = `{'AL1','AL2','AL3'}` used in view and page logic.
- **`/history` page**: stats table (Pts, KA, Tark, Mrk%, Nol%, L-KA, J-KA) + Turnausvertailu matrix (player × competition). Queries `hist_player_comp_stats` view — never raw prediction rows (avoids Supabase 1000-row default limit). `?comp=EM08` filters stats table; matrix always shows all competitions.
- **Nav**: mobile hamburger added; `Pisteet` and `Ottelut` always visible; all other links (incl. Historia) in dropdown.

### ✅ Phase 5g — Pre-match Fun Facts & Odds
- **Pre-match stat functions** (migrations 0017–0019, 0021–0022): `stat_kryptonite`, `stat_perfect_record`, `stat_team_expert`, `stat_group_tendency`, `stat_scoreline_habit`, `stat_stage_fright`, `stat_head_to_head` — query `hist_predictions`/`hist_matches` (active players only), unioned with live WC2026 predictions
- `supabase/functions/_shared/prematch-stat.ts`: `getPreMatchStat()` scores candidate stats by a priority heuristic, picks the best one, and has Claude Haiku rewrite it into one Finnish sentence; falls back to a template if `ANTHROPIC_API_KEY` is unset — included in the predictions-reveal kickoff message
- **Pre-match odds** (`lib/therundown/client.ts`, migration 0020): `fetchDayOdds()` from TheRundown (RapidAPI), stored on `matches.home_odds`/`draw_odds`/`away_odds`, shown in the kickoff message and in `/odds`
- **`/odds` Telegram command**: per-player KA-kerroin (average odds of their predictions) and ROI% (return on investment, 1 unit staked per prediction), sorted by ROI% descending — `sendOddsReport()` in `lib/telegram/notify.ts`
- `scripts/backfill-odds.ts`: backfills odds for matches seeded before this feature existed
- `scripts/populate-streak-hist-best.ts`: populates `streak_seeds.hist_best` from archived competitions, run once per archived tournament

### ✅ Phase 5h — Knockout Reliability, Bracket & Live History
- **Extra-time/penalty scoring fix**: matches with `score.duration !== 'REGULAR'` are no longer auto-scored off football-data.org's `fullTime` (which is the final, not 90-minute, score for those matches) — flagged `needs_manual_score`, admins DMed, entered manually via `/admin/matches` (badge + "who advanced?" selector for draws) or `/setscore <id> <h-a> [koti|vieras]`
- **`matches.winner_team`** (migration 0023): records who advanced for a knockout-stage draw; required server-side in `POST /api/admin/override-result` and the `/setscore` webhook handler
- **Playoff reminder fix**: `check-upcoming-matches` now matches `status` `SCHEDULED` **or** `TIMED` (was `SCHEDULED` only) — knockout fixtures were silently excluded from reminder DMs before this
- **Match import simplified**: `/admin/seed` is now a single "fetch all" button (no per-stage selector); the upsert guards against an incoming `TBD` team name overwriting an already-resolved one
- **Live MM26 data on `/history`**: `live_player_comp_stats` view (migration 0024) + an `MM26` `competitions` row — concatenated with `hist_player_comp_stats` in `app/history/page.tsx`
- **Circular playoff bracket**: `lib/bracket-geometry.ts` (shared geometry), `components/PlayoffBracket.tsx` (web SVG), `lib/telegram/bracket-image.tsx` (Satori PNG) + `/jatkokaavio` command
- **Eliminated picks shown in red**: `lib/eliminations.ts`, applied to the new champion/scorer picks table on `/leaderboard` and to the `/stats` Telegram image
- **Telegram delivery reliability**: `sendMessage`/`sendMessageWithMarkup` retry once on 429; persistent failures logged to `telegram_send_failures` (migration 0023), resendable from `/admin/telegram-failures` (anon-key admin RLS, migration 0026)
- **`mv_player_match_log` materialized view** (migration 0025): backs `/leaderboard`'s stats query; refreshed from `lib/scoring/score-and-notify.ts` after every scoring event
- **`fetchTopScorers()` 2-minute cache**: added once `/leaderboard` started calling it on every `force-dynamic` page load to detect eliminated Top Scorer picks (football-data.org's free tier is rate-limited to 10 req/min)

### 🔲 Phase 6 — UI Polish
- Responsive pass on all pages
- Finnish copy audit
- Loading states + error boundaries
- Postponed/cancelled match badges
- Favicon + meta tags

### ✅ Phase 7 — Knockout Rounds (during tournament)
- Admin re-runs "Tuo kaikki ottelut" on `/admin/seed` (single button, all stages in one call — the old
  per-stage selector was removed; see Phase 5h)
- Safe to repeat — upserts on `external_id`; a `TBD` team name from the API can never overwrite an
  already-resolved name
- The circular playoff bracket and elimination highlighting pick up new knockout matches automatically
  once they're seeded
