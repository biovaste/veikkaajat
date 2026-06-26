-- Postgres helper functions for pre-match fun stats.
-- Called via db.rpc() from the check-upcoming-matches edge function.
-- All functions are STABLE (read-only) and work on hist_predictions + hist_matches.

-- Returns the player with the most attempts on a given team who has NEVER gotten the
-- result correct (0 correct, ≥ 3 attempts). One row or empty.
CREATE OR REPLACE FUNCTION stat_kryptonite(p_team_code text)
RETURNS TABLE(player_name text, attempts bigint) AS $$
  SELECT p.player_name, COUNT(*) AS attempts
  FROM hist_predictions p
  JOIN hist_matches m ON m.id = p.match_id
  WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
    AND m.home_goals IS NOT NULL
  GROUP BY p.player_name
  HAVING SUM(CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END) = 0
     AND COUNT(*) >= 3
  ORDER BY attempts DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Returns the player with the most correct predictions for a given team who has a
-- perfect record (all correct, ≥ 3 matches). One row or empty.
CREATE OR REPLACE FUNCTION stat_perfect_record(p_team_code text)
RETURNS TABLE(player_name text, matches bigint) AS $$
  SELECT p.player_name, COUNT(*) AS matches
  FROM hist_predictions p
  JOIN hist_matches m ON m.id = p.match_id
  WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
    AND m.home_goals IS NOT NULL
  GROUP BY p.player_name
  HAVING SUM(CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END) = COUNT(*)
     AND COUNT(*) >= 3
  ORDER BY matches DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Returns aggregate counts for predictions at specific stages.
-- Use to detect "zero exact scores ever at this stage" (stage_fright).
-- Pass e.g. ARRAY['JPV'] for quarter-finals.
CREATE OR REPLACE FUNCTION stat_stage_fright(p_stages text[])
RETURNS TABLE(total_preds bigint, exact_count bigint) AS $$
  SELECT
    COUNT(*) AS total_preds,
    SUM(
      CASE WHEN p.sign_pred = m.result_sign
            AND p.home_pred = m.home_goals
            AND p.away_pred = m.away_goals
           THEN 1 ELSE 0 END
    ) AS exact_count
  FROM hist_predictions p
  JOIN hist_matches m ON m.id = p.match_id
  WHERE m.stage = ANY(p_stages)
    AND m.home_goals IS NOT NULL;
$$ LANGUAGE sql STABLE;
