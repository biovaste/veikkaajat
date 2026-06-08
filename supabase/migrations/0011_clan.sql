-- Add clan field to profiles
-- Valid values: 'Beeläiset' | 'Ceeläiset' | 'Independents' | NULL (unset)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clan text
  CHECK (clan IN ('Beeläiset', 'Ceeläiset', 'Independents'));
