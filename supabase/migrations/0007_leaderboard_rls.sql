-- The leaderboard needs all players to see all scoring_log entries.
-- Previously only own rows were readable, which broke the leaderboard for everyone except themselves.
DROP POLICY IF EXISTS "scoring_log_select_own" ON public.scoring_log;

CREATE POLICY "scoring_log_select_all"
  ON public.scoring_log FOR SELECT
  TO authenticated
  USING (true);
