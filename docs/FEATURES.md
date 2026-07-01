# Feature Reference

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
| Trendi | Average points from the player's last 3 match predictions (rolling window) |
| xG-Pts | Points if actual scores were rounded xG values (shown when xG data available) |
| Bonus | Category bet bonus (shown after betting deadline if any scored) |

Below the stats table, a **champion/scorer picks table** shows each player's World Champion and Top
Scorer bet (revealed after the betting deadline) — a pick renders in red once it's been knocked out
(see "Elimination Detection" below). Further below, the **playoff bracket** (circular SVG) appears
once any knockout-stage match exists.

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

## Playoff Bracket

`lib/bracket-geometry.ts` (`buildBracketLayout()`) computes a circular bracket layout from `matches`
rows alone — no React/JSX, shared by both renderers. It exposes both a legacy simple shape (`lines`)
and a richer shape (`paths` + `dots`) built from the same underlying node positions:

- **Rings** (outer → inner): whichever of `LAST_32 → LAST_16 → QUARTER_FINALS → SEMI_FINALS → FINAL` have
  at least one match seeded. Each match in a ring occupies two "team slots" (home, away); a ring with N
  matches has 2N slots evenly spaced around the circle.
- **Bracket adjacency is a structural approximation**: slot *i* in one ring pairs with slot ⌊i/2⌋ in the
  next ring inward (clamped to that ring's slot count), since football-data.org doesn't expose which
  match's winner plays which next match — only `stage` + `kickoff_at`. Team labels are always accurate
  (they come straight from the match rows); only which branch a given team's node connects to is a guess.
- **Elimination styling**: a finished match's loser is dimmed; the winner (by score, or by `winner_team`
  for a draw) is highlighted, with its path to the next round drawn as a glowing amber line. The champion
  (final match winner) shows in the center trophy circle.
- **Web** (`components/PlayoffBracket.tsx`, used on `/leaderboard`): renders `paths` (curved branch/connector
  SVG paths between each match pair, converging inward) and `dots` (team/junction/winner markers) for a
  polished circular knockout-tree look, with flag images (`flagcdn.com`) around the outer ring and as
  clipped circles on resolved inner-ring teams. Labels stay upright (not rotated around the circle).
  In-progress design notes: `docs/BRACKET_VISUAL_HANDOFF.md`.
- **Telegram** (`lib/telegram/bracket-image.tsx`, sent by `/jatkokaavio`): still renders the older, simpler
  `lines` shape via `next/og`'s `ImageResponse` (Satori) — no flag images (fetching ~30 remote images
  server-side during PNG generation is slow and failure-prone), country names only. Not yet redesigned to
  match the web renderer's newer look.

## Elimination Detection

`lib/eliminations.ts`:
- `getEliminatedCountries(matches)` — walks all `FINISHED` knockout-stage matches and adds the loser to
  the eliminated set (by score, or by `winner_team` when the 90-minute score was a draw; a draw with no
  `winner_team` set yet is skipped — not resolved either way until an admin enters it).
- `isChampionPickEliminated(betValue, eliminated)` — true if the picked country is in the set.
- `isScorerPickEliminated(betValue, eliminated, leadingScorerNames)` — true if the picked player's
  country is eliminated **and** they're not currently in the live top-10 scorers list (so a player whose
  country is out but who's still leading the golden boot race isn't flagged).

Used on `/leaderboard`'s champion/scorer picks table and in the `/stats` Telegram image (red text via
`ImgCell.textColor`).

## Pre-match Fun Facts

`supabase/functions/_shared/prematch-stat.ts` — `getPreMatchStat()` generates one Finnish one-liner per
match for the predictions-reveal message, based on each team's historical head-to-head record against
the group:

- Postgres functions `stat_kryptonite`, `stat_perfect_record`, `stat_team_expert`, `stat_group_tendency`,
  `stat_scoreline_habit`, `stat_stage_fright`, `stat_head_to_head` (migrations `0017`–`0019`, `0021`–`0022`)
  query `hist_predictions`/`hist_matches`, unioned with live WC2026 predictions, filtered to active
  players (those with a `profile_id` link in `hist_players`).
- Candidates are scored by a priority heuristic and the top one is rewritten by Claude Haiku
  (`claude-haiku-4-5-20251001`, max 80 tokens) into a punchy sentence using only the real names/numbers
  supplied — falls back to a template sentence if `ANTHROPIC_API_KEY` is unset or the call fails.
- Optional feature; the predictions-reveal message works fine without it.

## Pre-match Odds

`lib/therundown/client.ts` — same `RAPIDAPI_KEY` as Flashscore, different host
(`therundown-therundown-v1.p.rapidapi.com`, sport id `18` = FIFA). `fetchDayOdds(dateStr)` returns
moneyline odds for all matches on a date, converted to decimal and keyed by normalized `"home|away"`
team names. Stored on `matches.home_odds`/`draw_odds`/`away_odds` (migration `0020_match_odds.sql`)
when the kickoff/predictions-reveal message is sent. `scripts/backfill-odds.ts` backfills odds for
already-seeded matches. Shown in the kickoff Telegram message and in the `/odds` command (per-player
KA-kerroin and ROI%) — see `docs/TELEGRAM_BOT.md`.
