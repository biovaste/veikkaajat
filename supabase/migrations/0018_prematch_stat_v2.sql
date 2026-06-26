-- v2 of pre-match stat functions.
-- All personal stat functions now filter to active players only
-- (those who have a linked profile_id in hist_players).
-- Adds team_expert, group_tendency, and scoreline_habit stat types.

-- ── Update existing functions with active-player filter ───────────────────────

CREATE OR REPLACE FUNCTION stat_kryptonite(p_team_code text)
RETURNS TABLE(player_name text, attempts bigint) AS $$
  SELECT p.player_name, COUNT(*) AS attempts
  FROM hist_predictions p
  JOIN hist_matches m ON m.id = p.match_id
  JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
  WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
    AND m.home_goals IS NOT NULL
  GROUP BY p.player_name
  HAVING SUM(CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END) = 0
     AND COUNT(*) >= 3
  ORDER BY attempts DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION stat_perfect_record(p_team_code text)
RETURNS TABLE(player_name text, matches bigint) AS $$
  SELECT p.player_name, COUNT(*) AS matches
  FROM hist_predictions p
  JOIN hist_matches m ON m.id = p.match_id
  JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
  WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
    AND m.home_goals IS NOT NULL
  GROUP BY p.player_name
  HAVING SUM(CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END) = COUNT(*)
     AND COUNT(*) >= 3
  ORDER BY matches DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ── New: player significantly above group average for a team ──────────────────
-- Returns the player who is ≥15pp better than the group average (≥4 matches each).
CREATE OR REPLACE FUNCTION stat_team_expert(p_team_code text)
RETURNS TABLE(player_name text, n_matches bigint, player_pct integer, group_avg_pct integer) AS $$
  WITH per_player AS (
    SELECT
      p.player_name,
      COUNT(*) AS n,
      ROUND(100.0 * SUM(CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END) / COUNT(*))::integer AS acc
    FROM hist_predictions p
    JOIN hist_matches m ON m.id = p.match_id
    JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
    WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
      AND m.home_goals IS NOT NULL
    GROUP BY p.player_name
    HAVING COUNT(*) >= 4
  ),
  grp AS (
    SELECT ROUND(AVG(acc))::integer AS avg_acc FROM per_player
  )
  SELECT pp.player_name, pp.n, pp.acc, g.avg_acc
  FROM per_player pp, grp g
  WHERE pp.acc >= g.avg_acc + 15
  ORDER BY (pp.acc - g.avg_acc) DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ── New: whole group is collectively bad or good at predicting a team ─────────
-- Bad: group average ≤ 45%. Good: group average ≥ 75%. Requires ≥ 4 players.
CREATE OR REPLACE FUNCTION stat_group_tendency(p_team_code text)
RETURNS TABLE(group_avg_pct integer, n_players bigint, is_bad boolean) AS $$
  WITH per_player AS (
    SELECT
      p.player_name,
      COUNT(*) AS n,
      ROUND(100.0 * SUM(CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END) / COUNT(*))::integer AS acc
    FROM hist_predictions p
    JOIN hist_matches m ON m.id = p.match_id
    JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
    WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
      AND m.home_goals IS NOT NULL
    GROUP BY p.player_name
    HAVING COUNT(*) >= 3
  )
  SELECT
    ROUND(AVG(acc))::integer AS group_avg_pct,
    COUNT(*) AS n_players,
    (AVG(acc) <= 45) AS is_bad
  FROM per_player
  HAVING COUNT(*) >= 4
    AND (AVG(acc) <= 45 OR AVG(acc) >= 75);
$$ LANGUAGE sql STABLE;

-- ── New: player with a "signature scoreline" for a team ───────────────────────
-- Finds the most-repeated exact prediction (home_pred:away_pred) any active player
-- has made for matches involving this team.
--
-- Priority order inside the function:
--   1. always wrong (0 correct) with ≥ 3 predictions
--   2. always right (all correct) with ≥ 3 predictions
--   3. high repetition (≥ 8 predictions, any hit rate)
--
-- Returns one row with times_correct so TypeScript can distinguish the case.
CREATE OR REPLACE FUNCTION stat_scoreline_habit(p_team_code text)
RETURNS TABLE(player_name text, home_pred integer, away_pred integer, times_predicted bigint, times_correct bigint) AS $$
  WITH habits AS (
    SELECT
      p.player_name,
      p.home_pred,
      p.away_pred,
      COUNT(*) AS times_predicted,
      SUM(CASE WHEN p.home_pred = m.home_goals AND p.away_pred = m.away_goals THEN 1 ELSE 0 END) AS times_correct
    FROM hist_predictions p
    JOIN hist_matches m ON m.id = p.match_id
    JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
    WHERE (m.home_team = p_team_code OR m.away_team = p_team_code)
      AND m.home_goals IS NOT NULL
      AND p.home_pred IS NOT NULL AND p.away_pred IS NOT NULL
    GROUP BY p.player_name, p.home_pred, p.away_pred
  )
  SELECT player_name, home_pred, away_pred, times_predicted, times_correct
  FROM habits
  WHERE
    (times_correct = 0 AND times_predicted >= 3)
    OR (times_correct = times_predicted AND times_predicted >= 3)
    OR times_predicted >= 8
  ORDER BY
    -- Rank: always-wrong first, then always-right, then high-repetition
    CASE
      WHEN times_correct = 0 THEN 0
      WHEN times_correct = times_predicted THEN 1
      ELSE 2
    END,
    times_predicted DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;
