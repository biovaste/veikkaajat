-- Store pre-match odds (decimal) fetched from TheRundown on the matches table.
-- NULL = odds were not available / not yet fetched for this match.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS home_odds  numeric(5,2),
  ADD COLUMN IF NOT EXISTS draw_odds  numeric(5,2),
  ADD COLUMN IF NOT EXISTS away_odds  numeric(5,2);
