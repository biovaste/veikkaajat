-- Telegram chat ID per player (set when they /start the bot)
ALTER TABLE public.profiles ADD COLUMN telegram_chat_id TEXT;

-- Track which Telegram messages have already been sent per match
ALTER TABLE public.matches ADD COLUMN reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.matches ADD COLUMN kickoff_msg_sent BOOLEAN NOT NULL DEFAULT FALSE;
