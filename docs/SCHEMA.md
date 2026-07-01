# Database Schema

All tables are in `supabase/migrations/` (currently `0001`–`0027`, applied in order via the Supabase SQL editor or the Supabase MCP `apply_migration` tool).

| Table | Purpose |
|---|---|
| `profiles` | One row per auth user; auto-created via trigger on `auth.users` insert |
| `matches` | Seeded from football-data.org; result + xG + odds fields set after match finishes / odds fetched |
| `predictions` | One row per (player, match); editable until 5 min before `kickoff_at` |
| `scoring_log` | Audit trail written after each match is scored |
| `category_bets` | Special bets: WORLD_CHAMPION, TOP_SCORER, group advance (one row per user+category) |
| `category_results` | Correct answers for each category, set by admin |
| `telegram_send_failures` | Failed Telegram sends (chat id, kind, payload, error) for manual retry via `/admin/telegram-failures` (migration 0023) |

**Key columns added by later migrations:**
- `profiles.telegram_chat_id` — set by player in /settings or admin in /admin/players
- `profiles.chart_color` — hex string chosen by player in /settings; NULL = auto-assigned
- `profiles.clan` — 'Beeläiset' | 'Ceeläiset' | 'Independents' | NULL; chosen by player in /settings
- `matches.reminder_sent`, `matches.kickoff_msg_sent` — prevent double Telegram messages
- `matches.home_xg`, `matches.away_xg` — xG data; `matches.fs_match_id`, `matches.fs_xg_attempts` — Flashscore id + fetch attempt cap (migration 0013; `af_fixture_id` is legacy/dormant)
- `matches.category_bets_posted` — boolean; set true after special bets for this match's group/tournament have been posted to Telegram (migration 0014)
- `matches.home_odds`, `matches.draw_odds`, `matches.away_odds` — decimal odds from TheRundown, fetched around kickoff message time (migration 0020)
- `matches.winner_team` ('HOME'|'AWAY'|NULL), `matches.went_to_extra_time`, `matches.needs_manual_score` — extra-time/penalty handling; see CLAUDE.md "Extra time / penalties" (migration 0023)
- `matches.result_duration` ('REGULAR'|'EXTRA_TIME'|'PENALTY_SHOOTOUT'|NULL), `matches.extra_time_home/away`, `matches.penalties_home/away` — the ET/penalty breakdown from `score.regularTime`/`extraTime`/`penalties`, stored for display only, never fed into point scoring (migration 0027)
- `fs_requests` table — log of every Flashscore API call, enforces the 500/month hard limit
- `streak_seeds` table — pre-tournament streak values per player per type; `unique(display_name, streak_type)`; `streak_type` in ('correct_5p','right_result','wrong_result','zero_p','non_zero_p','non_5p') (migration 0014); `hist_best` column (migration 0022) caches the all-time-best value from archived tournaments so a new tournament's streaks can't erase a historical record
- `mv_player_match_log` — materialized view (`scoring_log` ⋈ `matches`), backs `/leaderboard`'s stats; refresh via `refresh_mv_player_match_log()` RPC (migration 0025)

**Pre-match stat functions** (migrations 0017–0019, 0021–0022; query `hist_predictions`/`hist_matches`, optionally unioned with live WC2026 data) — used by `getPreMatchStat()`, see `docs/FEATURES.md`:
`stat_kryptonite`, `stat_perfect_record`, `stat_team_expert`, `stat_group_tendency`, `stat_scoreline_habit` (per-team), `stat_stage_fright` (per-stage), `stat_head_to_head` (per team pair).

**Historical data tables** (read-only via RLS, written by import script):

| Table | Purpose |
|---|---|
| `competitions` | One row per tournament: id (EM08, MM10…), name, type (EC/WC), year, host. Includes `MM26` (the live tournament — see below) |
| `hist_players` | Canonical player names + aliases array + optional link to live `profiles.id` |
| `hist_matches` | Match results per competition; stage uses short codes (AL1–AL3, JPV, JV, JF) |
| `hist_predictions` | Predictions + points per (match, player_name string) |
| `hist_player_comp_stats` | VIEW: aggregated stats per (player_name, competition_id) for past tournaments — use this, not raw rows |
| `live_player_comp_stats` | VIEW: same column shape as `hist_player_comp_stats`, but computed live from `scoring_log`/`matches`/`profiles` for the ongoing `MM26` tournament (migration 0024) — `/history` concatenates both so the current tournament shows up alongside past ones |

**To mark yourself as admin** (run once in Supabase SQL editor after first login):
```sql
UPDATE profiles SET is_admin = true WHERE email = 'your@email.fi';
```

## Migrations

```
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
0017_prematch_stat_functions.sql  # stat_kryptonite, stat_perfect_record, stat_stage_fright (historical only)
0018_prematch_stat_v2.sql         # active-players-only filter; stat_team_expert, stat_group_tendency,
                                   # stat_scoreline_habit
0019_prematch_stat_live_data.sql  # extends all stat_* functions to union in live WC2026 predictions
0020_match_odds.sql               # home_odds/draw_odds/away_odds on matches (TheRundown)
0020_scoreline_result_correct.sql # adds result_correct_count to stat_scoreline_habit (note: two
                                   # migrations share the 0020 prefix — both applied, ordering by
                                   # filename is fine since they touch disjoint objects)
0021_h2h_stat.sql                 # stat_head_to_head(home_code, away_code) — most recent historical meeting
0022_streak_hist_best.sql         # hist_best column on streak_seeds — preserves all-time records
                                   # across tournament archives
0023_knockout_winner_and_telegram_failures.sql # winner_team/went_to_extra_time/needs_manual_score
                                                # on matches; telegram_send_failures table
0024_live_tournament_history.sql  # live_player_comp_stats view; inserts the MM26 competitions row
0025_mv_player_match_log.sql      # mv_player_match_log materialized view + refresh_mv_player_match_log()
0026_telegram_failures_admin_rls.sql # admin select + update RLS policies for telegram_send_failures
```
