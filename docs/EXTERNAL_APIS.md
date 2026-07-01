# External APIs

## football-data.org Endpoints

| Purpose | Endpoint | When called |
|---|---|---|
| Import all matches | `GET /v4/competitions/WC/matches` | Admin: `/admin/seed` ("Tuo kaikki ottelut") |
| Poll result | `GET /v4/matches/{external_id}` | Edge function every 10 min; manual `/haetulos` |
| Top scorers | `GET /v4/competitions/WC/scorers?limit=N` | `/leaderboard` (2-min cached), `/stats`, `/maaliporssi` |

Competition code: `WC`. Auth header: `X-Auth-Token`.

`score.duration` ('REGULAR'|'EXTRA_TIME'|'PENALTY_SHOOTOUT') and `score.winner` ('HOME_TEAM'|'AWAY_TEAM'|'DRAW'|null)
are read alongside `score.fullTime` to detect and flag matches that can't be auto-scored — see
CLAUDE.md "Extra time / penalties".

## Flashscore via RapidAPI (xG + fast results)

Base URL: `https://flashscore4.p.rapidapi.com/api/flashscore/v2`.
Headers: `x-rapidapi-host: flashscore4.p.rapidapi.com`, `x-rapidapi-key: $RAPIDAPI_KEY`.
WC 2026: `tournament_template_id=lvUBR5F8`, `season_id=185`.
**HARD LIMIT 500 requests/month** — every call logged to `fs_requests`, clients refuse past 450.

| Purpose | Endpoint | When called |
|---|---|---|
| Finished matches + scores | `GET /tournaments/results?...&page=1` | /haetulos fallback when FD lags, **group-stage matches only** (throttle: 1/3 min) |
| xG (in "Expected goals (xG)" stat row) | `GET /matches/match/stats?match_id={fs_match_id}` | Once per match at scoring; ≤3 attempts via cron backfill |
| Resolve knockout match ids | `GET /tournaments/fixtures?...&page=1` | Only when unmapped matches exist (throttle: 1/6 h) |

Estimated tournament spend: ~150–250 requests/month. Check usage: `select count(*) from fs_requests where called_at >= date_trunc('month', now());`

## TheRundown via RapidAPI (pre-match odds)

Base URL: `https://therundown-therundown-v1.p.rapidapi.com`. Sport id `18` = FIFA.
Headers: `x-rapidapi-host: therundown-therundown-v1.p.rapidapi.com`, `x-rapidapi-key: $RAPIDAPI_KEY` (same key as Flashscore).

`fetchDayOdds(dateStr)` (`lib/therundown/client.ts`) returns moneyline odds for every match on a given
date, converted American → decimal, keyed by normalized `"home|away"` team names. Called once per
kickoff-day in `check-upcoming-matches` (cached per run via `getOdds()`) and stored on
`matches.home_odds`/`draw_odds`/`away_odds` when the kickoff message is sent. `scripts/backfill-odds.ts`
fills in odds for matches that were seeded before this existed.
