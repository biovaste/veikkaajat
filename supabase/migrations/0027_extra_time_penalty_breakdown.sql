-- football-data.org v4's score object exposes score.regularTime (the 90-minute
-- score) alongside score.extraTime and score.penalties for knockout matches
-- decided past 90 minutes. Scoring already used only the 90-minute score
-- (home_score/away_score) — these columns store the ET/penalty breakdown
-- separately so it can be displayed, without ever affecting point scoring.
alter table public.matches add column if not exists extra_time_home integer;
alter table public.matches add column if not exists extra_time_away integer;
alter table public.matches add column if not exists penalties_home  integer;
alter table public.matches add column if not exists penalties_away  integer;

-- Distinguishes "decided in extra time" vs "decided on penalties" for display;
-- went_to_extra_time (0023) stays as the coarser flag the bracket/elimination
-- features already depend on.
alter table public.matches add column if not exists result_duration text
  check (result_duration in ('REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'));

-- Matches previously flagged for manual scoring can now be auto-scored on the
-- next poll (the poller reads regularTime instead of refusing to guess).
update public.matches set needs_manual_score = false
  where needs_manual_score and home_score is null;
