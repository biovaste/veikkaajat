-- Historical competition data: past tournaments (EM08, MM10, EM12, MM14, EM16, MM18, EM20, MM26...)
-- WC2026 live data (matches/predictions tables) will be archived here after the tournament ends.

create table public.competitions (
  id          text primary key,       -- 'EM08', 'MM10', 'WC26', etc.
  name        text not null,          -- 'EM 2008', 'MM 2010'
  type        text not null           -- 'EC' | 'WC'
               check (type in ('EC', 'WC')),
  year        int  not null,
  host        text,                   -- host country or countries
  created_at  timestamptz not null default now()
);

-- Canonical player registry. Players are matched by canonical_name or any alias.
-- profile_id links to the live profiles table when the player is also a WC2026 participant.
create table public.hist_players (
  id             serial primary key,
  canonical_name text not null unique,
  aliases        text[] not null default '{}',  -- e.g. ['Kranjech'] for Pepe Bonito
  profile_id     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table public.hist_matches (
  id             serial primary key,
  competition_id text not null references public.competitions(id),
  match_num      int  not null,
  stage          text not null,  -- AL1/AL2/AL3/JPV/JV/JF (EC) or AL1-3/R16/JPV/JV/JF (WC)
  home_team      text not null,
  away_team      text not null,
  home_goals     int,
  away_goals     int,
  result_sign    text check (result_sign in ('1', 'x', '2')),
  unique (competition_id, match_num)
);

create table public.hist_predictions (
  id             serial primary key,
  match_id       int  not null references public.hist_matches(id) on delete cascade,
  player_name    text not null,  -- canonical_name from hist_players
  home_pred      int,
  away_pred      int,
  sign_pred      text check (sign_pred in ('1', 'x', '2')),
  points         int,
  unique (match_id, player_name)
);

-- RLS: readable by all authenticated users, not writable via client
alter table public.competitions    enable row level security;
alter table public.hist_players    enable row level security;
alter table public.hist_matches    enable row level security;
alter table public.hist_predictions enable row level security;

create policy "competitions_select" on public.competitions
  for select to authenticated using (true);

create policy "hist_players_select" on public.hist_players
  for select to authenticated using (true);

create policy "hist_matches_select" on public.hist_matches
  for select to authenticated using (true);

create policy "hist_predictions_select" on public.hist_predictions
  for select to authenticated using (true);
