-- Adds result_correct_count to stat_scoreline_habit so TypeScript can tell Claude
-- how many of the habit predictions had the correct match result (even if exact score was wrong).
-- This prevents Haiku from writing "täysin väärässä" when only the scoreline was off.

CREATE OR REPLACE FUNCTION stat_scoreline_habit(p_team_code text, p_team_name text DEFAULT NULL)
RETURNS TABLE(
  player_name text,
  home_pred integer,
  away_pred integer,
  times_predicted bigint,
  times_correct bigint,
  result_correct_count bigint
) AS $$
  WITH combined AS (
    SELECT pr.display_name AS player_name,
      p.home_pred, p.away_pred,
      CASE WHEN p.home_pred = m.home_goals AND p.away_pred = m.away_goals THEN 1 ELSE 0 END AS exact_correct,
      CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END AS result_correct
    FROM hist_predictions p
    JOIN hist_matches m ON m.id = p.match_id
    JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
    JOIN profiles pr ON pr.id = hp.profile_id
    WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
      AND m.home_goals IS NOT NULL
      AND p.home_pred IS NOT NULL AND p.away_pred IS NOT NULL
    UNION ALL
    SELECT pr.display_name AS player_name,
      pred.home_score_pred AS home_pred, pred.away_score_pred AS away_pred,
      CASE WHEN pred.home_score_pred = m.home_score AND pred.away_score_pred = m.away_score THEN 1 ELSE 0 END AS exact_correct,
      CASE WHEN pred.points >= 3 THEN 1 ELSE 0 END AS result_correct
    FROM predictions pred
    JOIN matches m ON m.id = pred.match_id
    JOIN profiles pr ON pr.id = pred.user_id
    WHERE p_team_name IS NOT NULL
      AND (m.home_team = p_team_name OR m.away_team = p_team_name)
      AND pred.points IS NOT NULL
      AND m.home_score IS NOT NULL
  ),
  habits AS (
    SELECT player_name, home_pred, away_pred,
      COUNT(*) AS times_predicted,
      SUM(exact_correct) AS times_correct,
      SUM(result_correct) AS result_correct_count
    FROM combined
    GROUP BY player_name, home_pred, away_pred
  )
  SELECT player_name, home_pred, away_pred, times_predicted, times_correct, result_correct_count
  FROM habits
  WHERE (times_correct = 0 AND times_predicted >= 3)
    OR  (times_correct = times_predicted AND times_predicted >= 3)
    OR  times_predicted >= 8
  ORDER BY
    CASE WHEN times_correct = 0 THEN 0
         WHEN times_correct = times_predicted THEN 1
         ELSE 2 END,
    times_predicted DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;
