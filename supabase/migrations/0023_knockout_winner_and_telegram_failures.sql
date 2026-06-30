-- Migration 0023: knockout winner tracking + manual-scoring flag + Telegram delivery
-- failure log.
--
-- winner_team / went_to_extra_time / needs_manual_score support:
--   - scoring matches that go to extra time/penalties off the 90-minute score only
--     (football-data.org's "fullTime" field is the final match score, which can
--     include extra-time goals, so those matches are no longer auto-scored by the
--     cron — see lib/poll-and-score.ts and the poll-match-results edge function)
--   - the circular playoff bracket + "knocked out" highlighting, which need to know
--     who advanced even when the 90-minute scoreline was a draw

alter table public.matches add column if not exists winner_team text
  check (winner_team in ('HOME', 'AWAY'));
alter table public.matches add column if not exists went_to_extra_time boolean not null default false;
alter table public.matches add column if not exists needs_manual_score boolean not null default false;

create table if not exists public.telegram_send_failures (
  id          bigserial primary key,
  chat_id     text not null,
  kind        text not null,        -- 'reminder' | 'result' | 'kickoff' | 'category_bet'
  match_id    integer references public.matches(id),
  payload     jsonb not null,       -- enough to retry: text, reply_markup, etc.
  error       text not null,
  attempts    integer not null default 1,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Service role only (no policies for authenticated/anon), same pattern as fs_requests
alter table public.telegram_send_failures enable row level security;
