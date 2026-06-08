-- Simple leaderboard chat
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         serial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  message    text not null check (char_length(message) >= 1 and char_length(message) <= 500),
  created_at timestamptz not null default now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read messages
CREATE POLICY "chat_select_authenticated"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert their own messages
CREATE POLICY "chat_insert_own"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own messages
CREATE POLICY "chat_delete_own"
  ON public.chat_messages FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
