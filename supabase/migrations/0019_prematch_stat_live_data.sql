-- Adds live WC2026 predictions to all personal stat functions.
-- Each function now accepts p_team_name (full English name as stored in matches.home_team /
-- away_team) alongside p_team_code (hist 3-letter code). When p_team_name is supplied,
-- current-tournament scored predictions are included via UNION ALL.
--
-- Name normalization: historical predictions join hist_players → profiles to get the
-- current display_name, so hist and live rows group under the same player name.
--
-- stat_perfect_record now also requires the group average to be < 70% so that trivial
-- "everyone predicted the underdog to lose" cases are suppressed.

-- ── stat_kryptonite ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION stat_kryptonite(p_team_code text, p_team_name text DEFAULT NULL)
RETURNS TABLE(player_name text, attempts bigint) AS $$
  WITH combined AS (
    SELECT pr.display_name AS player_name,
      CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END AS correct
    FROM hist_predictions p
    JOIN hist_matches m ON m.id = p.match_id
    JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
    JOIN profiles pr ON pr.id = hp.profile_id
    WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
      AND m.home_goals IS NOT NULL
    UNION ALL
    SELECT pr.display_name AS player_name,
      CASE WHEN pred.points >= 3 THEN 1 ELSE 0 END AS correct
    FROM predictions pred
    JOIN matches m ON m.id = pred.match_id
    JOIN profiles pr ON pr.id = pred.user_id
    WHERE p_team_name IS NOT NULL
      AND (m.home_team = p_team_name OR m.away_team = p_team_name)
      AND pred.points IS NOT NULL
  )
  SELECT player_name, COUNT(*) AS attempts
  FROM combined
  GROUP BY player_name
  HAVING SUM(correct) = 0 AND COUNT(*) >= 3
  ORDER BY attempts DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ── stat_perfect_record ───────────────────────────────────────────────────────
-- Extra filter: group average must be < 70% (with ≥ 5 players) so trivially-obvious
-- underdog losses don't surface as individual achievements.
CREATE OR REPLACE FUNCTION stat_perfect_record(p_team_code text, p_team_name text DEFAULT NULL)
RETURNS TABLE(player_name text, matches bigint) AS $$
  WITH combined AS (
    SELECT pr.display_name AS player_name,
      CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END AS correct
    FROM hist_predictions p
    JOIN hist_matches m ON m.id = p.match_id
    JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
    JOIN profiles pr ON pr.id = hp.profile_id
    WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
      AND m.home_goals IS NOT NULL
    UNION ALL
    SELECT pr.display_name AS player_name,
      CASE WHEN pred.points >= 3 THEN 1 ELSE 0 END AS correct
    FROM predictions pred
    JOIN matches m ON m.id = pred.match_id
    JOIN profiles pr ON pr.id = pred.user_id
    WHERE p_team_name IS NOT NULL
      AND (m.home_team = p_team_name OR m.away_team = p_team_name)
      AND pred.points IS NOT NULL
  ),
  per_player AS (
    SELECT player_name, COUNT(*) AS n, SUM(correct) AS c
    FROM combined
    GROUP BY player_name
    HAVING COUNT(*) >= 3
  ),
  group_stats AS (
    SELECT AVG(c::float / n) AS avg_acc, COUNT(*) AS n_players FROM per_player
  )
  SELECT pp.player_name, pp.n
  FROM per_player pp, group_stats gs
  WHERE pp.c = pp.n
    AND (gs.n_players < 5 OR gs.avg_acc < 0.70)
  ORDER BY pp.n DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ── stat_team_expert ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION stat_team_expert(p_team_code text, p_team_name text DEFAULT NULL)
RETURNS TABLE(player_name text, n_matches bigint, player_pct integer, group_avg_pct integer) AS $$
  WITH combined AS (
    SELECT pr.display_name AS player_name,
      CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END AS correct
    FROM hist_predictions p
    JOIN hist_matches m ON m.id = p.match_id
    JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
    JOIN profiles pr ON pr.id = hp.profile_id
    WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
      AND m.home_goals IS NOT NULL
    UNION ALL
    SELECT pr.display_name AS player_name,
      CASE WHEN pred.points >= 3 THEN 1 ELSE 0 END AS correct
    FROM predictions pred
    JOIN matches m ON m.id = pred.match_id
    JOIN profiles pr ON pr.id = pred.user_id
    WHERE p_team_name IS NOT NULL
      AND (m.home_team = p_team_name OR m.away_team = p_team_name)
      AND pred.points IS NOT NULL
  ),
  per_player AS (
    SELECT player_name, COUNT(*) AS n,
      ROUND(100.0 * SUM(correct) / COUNT(*))::integer AS acc
    FROM combined
    GROUP BY player_name
    HAVING COUNT(*) >= 4
  ),
  grp AS (SELECT ROUND(AVG(acc))::integer AS avg_acc FROM per_player)
  SELECT pp.player_name, pp.n, pp.acc, g.avg_acc
  FROM per_player pp, grp g
  WHERE pp.acc >= g.avg_acc + 15
  ORDER BY (pp.acc - g.avg_acc) DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ── stat_group_tendency ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION stat_group_tendency(p_team_code text, p_team_name text DEFAULT NULL)
RETURNS TABLE(group_avg_pct integer, n_players bigint, is_bad boolean) AS $$
  WITH combined AS (
    SELECT pr.display_name AS player_name,
      CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END AS correct
    FROM hist_predictions p
    JOIN hist_matches m ON m.id = p.match_id
    JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
    JOIN profiles pr ON pr.id = hp.profile_id
    WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
      AND m.home_goals IS NOT NULL
    UNION ALL
    SELECT pr.display_name AS player_name,
      CASE WHEN pred.points >= 3 THEN 1 ELSE 0 END AS correct
    FROM predictions pred
    JOIN matches m ON m.id = pred.match_id
    JOIN profiles pr ON pr.id = pred.user_id
    WHERE p_team_name IS NOT NULL
      AND (m.home_team = p_team_name OR m.away_team = p_team_name)
      AND pred.points IS NOT NULL
  ),
  per_player AS (
    SELECT player_name,
      ROUND(100.0 * SUM(correct) / COUNT(*))::integer AS acc
    FROM combined
    GROUP BY player_name
    HAVING COUNT(*) >= 3
  )
  SELECT ROUND(AVG(acc))::integer, COUNT(*), (AVG(acc) <= 45)
  FROM per_player
  HAVING COUNT(*) >= 4 AND (AVG(acc) <= 45 OR AVG(acc) >= 75);
$$ LANGUAGE sql STABLE;

-- ── stat_scoreline_habit ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION stat_scoreline_habit(p_team_code text, p_team_name text DEFAULT NULL)
RETURNS TABLE(player_name text, home_pred integer, away_pred integer, times_predicted bigint, times_correct bigint) AS $$
  WITH combined AS (
    SELECT pr.display_name AS player_name,
      p.home_pred, p.away_pred,
      CASE WHEN p.home_pred = m.home_goals AND p.away_pred = m.away_goals THEN 1 ELSE 0 END AS exact_correct
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
      CASE WHEN pred.home_score_pred = m.home_score AND pred.away_score_pred = m.away_score THEN 1 ELSE 0 END AS exact_correct
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
      SUM(exact_correct) AS times_correct
    FROM combined
    GROUP BY player_name, home_pred, away_pred
  )
  SELECT player_name, home_pred, away_pred, times_predicted, times_correct
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
