-- Add hist_best column to streak_seeds to cache all-time best streaks from historical data.
-- Populated once via the populate script; re-run after each competition is archived.
alter table public.streak_seeds
  add column if not exists hist_best int not null default 0;
