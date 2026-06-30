-- Migration 0025: materialized view flattening scoring_log + matches into one
-- table, so /leaderboard reads one row set instead of joining + unwrapping
-- nested arrays in JS. Refreshed by refresh_mv_player_match_log(), called from
-- lib/scoring/score-and-notify.ts (the shared scoring helper used by the cron,
-- /setscore, and the manual override route) right after scoring_log is written.

create materialized view public.mv_player_match_log as
select
  sl.user_id, sl.match_id, sl.points, sl.breakdown,
  m.stage, m.kickoff_at, m.match_day, m.home_score, m.away_score, m.status,
  m.home_xg, m.away_xg
from public.scoring_log sl
join public.matches m on m.id = sl.match_id;

create unique index mv_player_match_log_uniq on public.mv_player_match_log (user_id, match_id);

create or replace function public.refresh_mv_player_match_log()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently public.mv_player_match_log;
$$;

grant execute on function public.refresh_mv_player_match_log() to authenticated, service_role;
revoke execute on function public.refresh_mv_player_match_log() from public;
revoke execute on function public.refresh_mv_player_match_log() from anon;

-- Populate immediately so the view isn't empty until the next scored match
select public.refresh_mv_player_match_log();
