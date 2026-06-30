-- Admins can read and resolve telegram_send_failures from the client (the
-- /admin/telegram-failures page queries it directly, and the retry API route
-- uses the anon-key session client per the documented admin-write pattern —
-- service role stays reserved for cron / score-and-notify inserts).

create policy "telegram_send_failures_select_admin"
  on public.telegram_send_failures for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

create policy "telegram_send_failures_update_admin"
  on public.telegram_send_failures for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );
