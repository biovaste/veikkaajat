-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;
alter table public.scoring_log enable row level security;
alter table public.category_bets enable row level security;

-- =========================================================
-- profiles
-- =========================================================

-- All authenticated users can read all profiles (needed for leaderboard)
create policy "profiles_select"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can update their own profile
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- =========================================================
-- matches
-- =========================================================

-- Anyone (including anon) can read matches
create policy "matches_select"
  on public.matches for select
  using (true);

-- No player writes — only service role (admin API routes, edge functions)

-- =========================================================
-- predictions
-- =========================================================

-- Players can only read their own predictions
create policy "predictions_select_own"
  on public.predictions for select
  to authenticated
  using (auth.uid() = user_id);

-- Players can insert their own prediction only if match has not kicked off
create policy "predictions_insert_own"
  on public.predictions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.kickoff_at > now()
    )
  );

-- Players can update their own prediction only if match has not kicked off
create policy "predictions_update_own"
  on public.predictions for update
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.kickoff_at > now()
    )
  )
  with check (auth.uid() = user_id);

-- =========================================================
-- scoring_log
-- =========================================================

-- Players can read their own scoring log entries
create policy "scoring_log_select_own"
  on public.scoring_log for select
  to authenticated
  using (auth.uid() = user_id);

-- No writes from client — only service role

-- =========================================================
-- category_bets
-- =========================================================

create policy "category_bets_select_own"
  on public.category_bets for select
  to authenticated
  using (auth.uid() = user_id);

create policy "category_bets_insert_own"
  on public.category_bets for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "category_bets_update_own"
  on public.category_bets for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
