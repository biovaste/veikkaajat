-- Table to store the correct outcome for each special bet category
CREATE TABLE IF NOT EXISTS public.category_results (
  category    TEXT PRIMARY KEY,
  correct_value TEXT NOT NULL,
  scored_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.category_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_results_select_all"
  ON public.category_results FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins (via service role) to insert/update category_results
CREATE POLICY "category_results_admin_all"
  ON public.category_results FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Ensure category_bets RLS is enabled and policies are correct
ALTER TABLE public.category_bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_bets_select_own" ON public.category_bets;
DROP POLICY IF EXISTS "category_bets_insert_own" ON public.category_bets;
DROP POLICY IF EXISTS "category_bets_update_own" ON public.category_bets;
DROP POLICY IF EXISTS "category_bets_select_all" ON public.category_bets;

-- All authenticated users can read all bets (needed for leaderboard)
CREATE POLICY "category_bets_select_all"
  ON public.category_bets FOR SELECT
  TO authenticated
  USING (true);

-- Players can only insert/update their own bets
CREATE POLICY "category_bets_insert_own"
  ON public.category_bets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "category_bets_update_own"
  ON public.category_bets FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());
