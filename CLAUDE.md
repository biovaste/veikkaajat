# Veikkaajat — MM 2026

World Cup 2026 score prediction app for a small group of friends (<20 players).

## Documentation

This file covers what's needed for almost any task: stack, env vars, scoring rules, and the
architectural decisions/gotchas worth knowing before touching the code. Deeper reference material
lives in `docs/` — read the relevant one when you're working in that area:

| Doc | Covers |
|---|---|
| `docs/SCHEMA.md` | Full database schema, all tables/columns, the complete migrations list |
| `docs/PROJECT_STRUCTURE.md` | Full file tree with one-line descriptions of every file |
| `docs/FEATURES.md` | Leaderboard stats table, top scorer list, chart colors, playoff bracket, elimination detection, pre-match fun facts, pre-match odds |
| `docs/EXTERNAL_APIS.md` | football-data.org, Flashscore, and TheRundown endpoint references |
| `docs/TELEGRAM_BOT.md` | Bot commands, automatic messages, inline editing, delivery-failure handling |
| `docs/CHANGELOG.md` | Phase-by-phase build history |

## Stack

| Concern | Technology |
|---|---|
| Frontend + API routes | Next.js 16 App Router, TypeScript |
| Database + Auth | Supabase (Postgres, magic link only, RLS) |
| Hosting | Vercel (free tier) |
| Scheduled polling | Supabase Edge Function + pg_cron |
| Match data | football-data.org v4 API (free tier) |
| xG data + fast results | Flashscore via RapidAPI flashscore4 (HARD 500 req/month) |
| Pre-match odds | TheRundown via RapidAPI (same `RAPIDAPI_KEY`, different host) |
| Pre-match fun facts | Claude Haiku (optional — falls back to a template if not configured) |
| Notifications | Telegram Bot API |

UI language: Finnish. Layout: mobile-first. No open signup — admin invites players by email.

## Environment Variables

**`.env.local` (local) and Vercel dashboard (production):**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never in client code
FOOTBALL_DATA_API_KEY=
RAPIDAPI_KEY=                     # flashscore4 + TheRundown on RapidAPI (different hosts, same key)
                                   # Flashscore: xG + fast results — 500 req/month hard limit!
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
ANTHROPIC_API_KEY=                # optional — pre-match fun facts via Claude Haiku;
                                   # falls back to a template sentence if unset
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected
```

## Scoring Rules

### Match predictions (max 5 pts per match)
- 3 pts — correct match result (win/draw/loss)
- +1 pt — correct home team goal tally
- +1 pt — correct away team goal tally

Scoring always uses the **90-minute (full-time) score** — see "Extra time / penalties" below for why
that's not always what football-data.org's `fullTime` field contains for knockout matches.

### Special bets (category_bets table)
- 10 pts — World Champion (deadline: first match kickoff)
- 5 pts — Top Scorer (deadline: first match kickoff); named players + wildcard per country
- 4 pts — 2 advancing teams per group (BOTH must be correct; 1 correct = 0 pts; deadline: group's first match)

Scoring engine: `lib/scoring/engine.ts` — pure function, unit-tested.
Special bet scoring: `app/api/admin/score-categories/route.ts`.

## Key Architectural Decisions

- **Admin writes**: seed, override, and retry-Telegram-failure API routes use `createServerClient()` (anon key + cookie session). RLS allows writes because `profiles.is_admin = true` for the authenticated user (see migration 0004, and 0026 for `telegram_send_failures`). `createServiceRoleClient()` is reserved for `auth.admin.*` operations (e.g. inviting users), for reading all players' predictions in the leaderboard (bypasses `predictions_select_own` RLS), and for the scheduled cron functions (which have no user session). Note: the new Supabase "Secret API key" is NOT the legacy `service_role` JWT and does not bypass RLS — don't confuse them.
- **Prediction deadline**: 5 minutes before kickoff. Enforced client-side (form hidden, countdown shows "Aikaa kohteen sulkeutumiseen:") and server-side (`POST /api/predictions` rejects if `kickoff_at − 5 min <= now()`). Kickoff time displayed to players is unchanged.
- **No open signup**: admin uses `/admin/players` to invite users via `supabase.auth.admin.inviteUserByEmail()`.
- **football-data.org rate limit**: 10 req/min. Match import is one bulk call (`fetchMatches()`, no stage filter — see "Match import" below). The edge function polls one match at a time with a 7s sleep between calls.
- **football-data.org group format**: groups stored as `GROUP_A` (underscore, uppercase). `groupLabel()` in `lib/countries.ts` handles both `GROUP_A` and `Group A` formats → `Ryhmä A`.
- **Scoring log**: `scoring_log` rows are deleted and re-inserted on every score/re-score to prevent point stacking.
- **Extra time / penalties**: football-data.org's `score.fullTime` field is the *final* match score for a knockout match — for matches with `score.duration !== 'REGULAR'` that can include extra-time goals, not strictly the 90-minute score our rules require, and the API exposes no separate 90-minute-only field. So the cron (`poll-and-score.ts` / `poll-match-results` edge function) never auto-scores those matches: it sets `matches.went_to_extra_time = true`, `matches.needs_manual_score = true`, best-effort fills `matches.winner_team` from `score.winner`, and DMs every admin to enter the real 90-minute score via `/admin/matches` (badge shown there) or `/setscore <id> <h-a> [koti|vieras]`. `winner_team` ('HOME'|'AWAY') records who actually advanced — required for any knockout-stage match that ends in a draw on the 90-minute score (enforced both client-side in `/admin/matches` and server-side in `POST /api/admin/override-result`) — and feeds the playoff bracket and elimination-highlighting features, never point scoring.
- **Match import**: `/admin/seed` is a single "Tuo kaikki ottelut" button calling `fetchMatches()` with no stage filter — there used to be a per-stage selector, removed because a stage-filtered fetch was observed returning `TBD`/`TBD` for matches that an earlier "fetch all" had already resolved with real team names. The upsert in `POST /api/admin/seed-matches` now also guards against this directly: an incoming `'TBD'` team name can never overwrite an already-resolved name in the DB. Safe to re-run any time — upserts on `external_id`.
- **xG + fast results (Flashscore)**: **HARD 500 req/month**, budget-guarded via `fs_requests`. `/haetulos` falls back to Flashscore's results feed for **group-stage matches only** — knockout matches can go to extra time, which Flashscore's results feed can't distinguish from a 90-minute draw, so they always wait for football-data.org's authoritative `duration` field instead. See `docs/EXTERNAL_APIS.md` for endpoints/details.
- **Materialized view for leaderboard stats**: `mv_player_match_log` flattens `scoring_log` ⋈ `matches` into one table so `/leaderboard` reads it in a single query instead of joining + unwrapping nested arrays in JS for every page load (the page is `force-dynamic`, so this runs on every request). Refreshed via `refresh_mv_player_match_log()` (a `SECURITY DEFINER` SQL function wrapping `REFRESH MATERIALIZED VIEW CONCURRENTLY`, execute revoked from `anon`/`public`) called from `lib/scoring/score-and-notify.ts` right after `scoring_log` is written. Sequential/minority-vote stats that need match-by-match ordering (Jht, Yllätys%, Trendi) are still computed in JS over the flattened rows.
- **External API rate limits on hot pages**: `/leaderboard` is `force-dynamic` and calls `fetchTopScorers()` (football-data.org) once betting closes, to detect eliminated top-scorer picks. That call is cached for 2 minutes via Next's fetch data cache (`fetchFD(path, revalidateSeconds)` in `lib/football-data/client.ts`) — football-data.org's free tier is rate-limited to 10 req/min, and this endpoint is also called by the `/stats` and `/maaliporssi` Telegram commands.
- **Leaderboard page**: uses `force-dynamic` (no ISR) because it reads cookie-based auth. Predictions fetched via service role to get all players' data for Yllätys% and Tas% stats.
- **Telegram delivery reliability**: `sendMessage`/`sendMessageWithMarkup` retry once on HTTP 429 before giving up and resolve `{ok, status?, error?}` instead of throwing. Recoverable failures (reminder DMs, result messages, kickoff messages, category-bet announcements) are logged to `telegram_send_failures` — visible and resendable from `/admin/telegram-failures`. See `docs/TELEGRAM_BOT.md`.
- **Playoff bracket / elimination detection**: connecting lines in the circular bracket are a structural approximation (football-data.org exposes no true bracket-tree adjacency) — team labels are always accurate, only line placement is a guess. See `docs/FEATURES.md`.
- **Chart colors**: players pick a color from a 20-color palette in /settings. First-come-first-serve enforced by a partial unique index on `profiles.chart_color`. Auto-assigned from remaining pool for players without a pick. Logic in `lib/colors.ts`.
- **Types**: Supabase client uses untyped `any` generics for now. Run `supabase gen types typescript --project-id <ref> > types/database.ts` after `supabase login` to get proper types.

## Build & Run

```bash
npm install
npm run dev        # local development
npm run build      # production build
npm test           # vitest unit tests
```
