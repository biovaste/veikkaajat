-- Track whether the user has completed onboarding (chosen their display name)
ALTER TABLE public.profiles ADD COLUMN onboarded BOOLEAN NOT NULL DEFAULT FALSE;

-- All existing users are already onboarded (they have names set by admin)
UPDATE public.profiles SET onboarded = TRUE;
