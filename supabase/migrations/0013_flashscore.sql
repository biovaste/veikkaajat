-- Flashscore (RapidAPI flashscore4) integration: xG + fast-result fallback.
-- The plan has a HARD limit of 500 requests/month — every call is logged in
-- fs_requests and clients refuse to call once the monthly budget is reached.

alter table public.matches add column if not exists fs_match_id text;
alter table public.matches add column if not exists fs_xg_attempts integer not null default 0;

create table if not exists public.fs_requests (
  id         serial primary key,
  endpoint   text not null,
  called_at  timestamptz not null default now()
);

-- Service role only (no policies for authenticated/anon)
alter table public.fs_requests enable row level security;
