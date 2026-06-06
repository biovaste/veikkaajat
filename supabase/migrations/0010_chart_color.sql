-- Player-chosen graph color (hex string, e.g. '#1f77b4').
-- NULL means auto-assigned at render time.
-- Unique constraint enforces first-come-first-serve at DB level.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chart_color text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_chart_color_unique
  ON public.profiles (chart_color)
  WHERE chart_color IS NOT NULL;
