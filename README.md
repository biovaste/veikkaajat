# Veikkaajat — MM 2026

A full-stack score prediction app for the 2026 FIFA World Cup, built for a private group of friends. Players predict match scores, earn points, and compete on a live leaderboard throughout the tournament.

## Features

- **Magic link authentication** — admin-controlled invites, no open signup
- **Match predictions** — score input per match, locked 5 minutes before kickoff; 3 pts for correct result + 1 pt per correct goal tally
- **Special bets** — tournament winner (10 pts), top scorer (5 pts, 80+ players across 40 countries), group stage advancement (4 pts per group)
- **Live leaderboard** — 12 computed stats per player including prediction accuracy, days in the lead, and xG-adjusted points; transposed table with cumulative points chart
- **Automated result polling** — Supabase Edge Function polls football-data.org every 30 min, scores predictions, and posts a result summary to Telegram
- **xG data** — expected goals fetched from api-football.com after each match and shown alongside actual results
- **Telegram bot** — automatic kickoff previews, result messages with leaderboard arrows, personalised pre-match reminder DMs with inline edit buttons; `/chart`, `/stats`, `/luokkasota`, `/maaliporssi`, `/haetulos` group commands; `/veikkaukset` DM command with inline prediction editing (ForceReply flow, deadline enforced)
- **Clan war** — players join one of three clans; `/luokkasota` shows clan rankings by average points
- **Live chat** — real-time chat on the leaderboard page via Supabase Realtime

## Stack

| Concern | Technology |
|---|---|
| Frontend + API | Next.js 16 App Router, TypeScript, Tailwind CSS |
| Database + Auth | Supabase (Postgres, Row Level Security, magic link) |
| Realtime | Supabase Realtime |
| Hosting | Vercel |
| Scheduled jobs | Supabase Edge Functions (Deno) + pg_cron |
| Match data | football-data.org v4 API |
| xG data | api-football.com v3 |
| Notifications | Telegram Bot API |

## Architecture highlights

- **RLS throughout** — all tables protected by row-level security policies; service role client used selectively only where cross-player data access is required (leaderboard stats, Telegram notifications)
- **`force-dynamic` on auth-gated pages** — prevents ISR cache from bypassing RLS
- **Scoring engine as a pure function** — `lib/scoring/engine.ts` is unit-tested with Vitest and reused across the web app and edge functions
- **Prediction deadline 5 min before kickoff** — client hides the form and shows a countdown ("Aikaa kohteen sulkeutumiseen:"); server rejects `POST /api/predictions` if `kickoff_at − 5 min <= now()`
- **Chart color uniqueness enforced at the DB level** — partial unique index on `profiles.chart_color WHERE chart_color IS NOT NULL`

## Project structure

```
app/                        # Next.js App Router pages + API routes
  admin/                    # Admin-only pages (seed matches, override results, manage players)
  api/                      # REST endpoints (predictions, bets, admin actions, Telegram webhook)
components/                 # Shared UI components (MatchCard, PointsChart, ChatBox, …)
lib/
  supabase/                 # Browser + server Supabase client wrappers
  football-data/            # football-data.org API client
  api-football/             # api-football.com xG client
  telegram/                 # Bot message helpers and notify functions
  scoring/engine.ts         # Pure scoring function (unit-tested)
  players.ts                # Top scorer player list (~80 players, 40 countries)
  countries.ts              # Finnish country names, flags, group label helpers
  colors.ts                 # 20-color chart palette + color assignment logic
supabase/
  migrations/               # 12 sequential SQL migrations
  functions/                # Deno edge functions (poll-match-results, check-upcoming-matches)
types/database.ts           # Hand-written Supabase table types
```

## Running locally

```bash
npm install
npm run dev    # development server
npm test       # vitest unit tests
npm run build  # production build
```

Requires `.env.local` — see `CLAUDE.md` for the full list of environment variables.
