-- Returns the most recent historical match between two teams with prediction stats
-- for currently active players (profile_id IS NOT NULL).
-- Used to surface "last time these teams played, X was the only one to get the score right".

CREATE OR REPLACE FUNCTION stat_head_to_head(p_home_code text, p_away_code text)
RETURNS TABLE(
  comp_id text,
  comp_year integer,
  comp_type text,
  hist_home text,
  hist_away text,
  actual_home integer,
  actual_away integer,
  exact_correct_players text[],
  correct_result_count bigint,
  total_predictors bigint
) AS $$
  SELECT
    c.id,
    c.year,
    c.type,
    m.home_team,
    m.away_team,
    m.home_goals,
    m.away_goals,
    ARRAY_AGG(pr.display_name ORDER BY pr.display_name) FILTER (
      WHERE p.home_pred = m.home_goals AND p.away_pred = m.away_goals
    ),
    SUM(CASE WHEN p.sign_pred = m.result_sign THEN 1 ELSE 0 END),
    COUNT(*)
  FROM hist_matches m
  JOIN competitions c ON c.id = m.competition_id
  JOIN hist_predictions p ON p.match_id = m.id
  JOIN hist_players hp ON hp.canonical_name = p.player_name AND hp.profile_id IS NOT NULL
  JOIN profiles pr ON pr.id = hp.profile_id
  WHERE (m.home_team = p_home_code AND m.away_team = p_away_code)
     OR (m.home_team = p_away_code AND m.away_team = p_home_code)
  GROUP BY c.id, c.year, c.type, m.id, m.home_team, m.away_team, m.home_goals, m.away_goals
  ORDER BY c.year DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;
