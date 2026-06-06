-- xG data from API-Football (api-sports.io)
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS af_fixture_id INTEGER,      -- API-Football fixture ID
  ADD COLUMN IF NOT EXISTS home_xg       NUMERIC(4,2), -- Expected goals home
  ADD COLUMN IF NOT EXISTS away_xg       NUMERIC(4,2); -- Expected goals away

COMMENT ON COLUMN matches.af_fixture_id IS 'Fixture ID in api-football.com (v3.football.api-sports.io)';
COMMENT ON COLUMN matches.home_xg IS 'Expected goals for home team (from API-Football fixtures/statistics)';
COMMENT ON COLUMN matches.away_xg IS 'Expected goals for away team (from API-Football fixtures/statistics)';
