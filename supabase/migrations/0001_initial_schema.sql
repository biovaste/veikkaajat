-- Profiles: one row per auth user, created automatically via trigger
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  display_name text not null,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Matches: seeded from football-data.org
create table public.matches (
  id                  serial primary key,
  external_id         integer not null unique,
  stage               text not null,       -- GROUP_STAGE | ROUND_OF_16 | QUARTER_FINALS | SEMI_FINALS | THIRD_PLACE | FINAL
  group_name          text,                -- 'Group A'...'Group H', null for knockouts
  match_day           integer,
  home_team           text not null,
  away_team           text not null,
  kickoff_at          timestamptz not null,
  status              text not null default 'SCHEDULED', -- SCHEDULED | FINISHED | POSTPONED | CANCELLED
  home_score          integer,
  away_score          integer,
  result_confirmed_at timestamptz,
  created_at          timestamptz not null default now()
);

-- Predictions: one row per (player, match), editable until kickoff
create table public.predictions (
  id              serial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  match_id        integer not null references public.matches(id) on delete cascade,
  home_score_pred integer not null check (home_score_pred >= 0),
  away_score_pred integer not null check (away_score_pred >= 0),
  points          integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, match_id)
);

-- Scoring log: audit trail for each scored match
create table public.scoring_log (
  id        serial primary key,
  match_id  integer not null references public.matches(id),
  user_id   uuid not null references public.profiles(id),
  points    integer not null,
  breakdown jsonb not null,  -- { "result": 3, "home_goals": 1, "away_goals": 0 }
  scored_at timestamptz not null default now()
);

-- Category bets: stub for future tournament-level predictions
create table public.category_bets (
  id         serial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  category   text not null,  -- 'TOURNAMENT_WINNER', 'TOP_SCORER', etc.
  bet_value  text not null,
  points     integer,
  created_at timestamptz not null default now(),
  unique (user_id, category)
);
