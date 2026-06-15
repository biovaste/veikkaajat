-- Migration 0014: streak seeds + category_bets_posted flag on matches

-- When category bets (champion/scorer/group advance) close for a match
-- (i.e. betting window closes), post them to the group once.
alter table public.matches add column if not exists category_bets_posted boolean not null default false;

-- Pre-tournament streak seeds (from previous tournaments/competitions).
-- Streaks are computed as: seed_current (if not yet broken) + tournament games.
-- streak_type values:
--   'correct_5p'   — consecutive 5-point predictions
--   'right_result' — consecutive correct match results
--   'wrong_result' — consecutive wrong match results
--   'zero_p'       — consecutive 0-point predictions
--   'non_zero_p'   — consecutive non-zero-point predictions
--   'non_5p'       — consecutive non-5-point predictions
create table if not exists public.streak_seeds (
  id           serial primary key,
  display_name text    not null,
  streak_type  text    not null check (streak_type in ('correct_5p','right_result','wrong_result','zero_p','non_zero_p','non_5p')),
  current      integer not null default 0,
  unique (display_name, streak_type)
);

alter table public.streak_seeds enable row level security;
create policy "streak_seeds_read" on public.streak_seeds
  for select using (auth.role() = 'authenticated');

-- Seed pre-tournament streaks
insert into public.streak_seeds (display_name, streak_type, current) values
  -- correct_5p
  ('Mr. Ku Runk', 'correct_5p', 1),
  ('Karkki',      'correct_5p', 1),
  ('erno',        'correct_5p', 3),
  -- right_result
  ('Babar',       'right_result', 1),
  ('Mr. Ku Runk', 'right_result', 1),
  ('Zkibu',       'right_result', 1),
  ('Jean-Cul',    'right_result', 1),
  ('Karkki',      'right_result', 1),
  ('Pepe Bonito', 'right_result', 2),
  ('erno',        'right_result', 4),
  -- wrong_result
  ('Zen',         'wrong_result', 1),
  ('Lepe',        'wrong_result', 2),
  ('Hashmeer',    'wrong_result', 2),
  ('Adveleksi',   'wrong_result', 3),
  -- zero_p
  ('Zen',         'zero_p', 1),
  ('Adveleksi',   'zero_p', 2),
  ('Hashmeer',    'zero_p', 2),
  -- non_zero_p
  ('Pepe Bonito', 'non_zero_p', 14),
  ('Jean-Cul',    'non_zero_p', 8),
  ('Mr. Ku Runk', 'non_zero_p', 7),
  ('Karkki',      'non_zero_p', 7),
  ('erno',        'non_zero_p', 7),
  ('Lepe',        'non_zero_p', 6),
  ('Zkibu',       'non_zero_p', 2),
  ('Babar',       'non_zero_p', 1),
  -- non_5p
  ('Zen',         'non_5p', 17),
  ('Babar',       'non_5p', 6),
  ('Lepe',        'non_5p', 4),
  ('Jean-Cul',    'non_5p', 4),
  ('Adveleksi',   'non_5p', 4),
  ('Pepe Bonito', 'non_5p', 4),
  ('Zkibu',       'non_5p', 3),
  ('Hashmeer',    'non_5p', 2)
on conflict (display_name, streak_type) do nothing;
