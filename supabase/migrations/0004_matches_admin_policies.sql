-- Allow admin users to insert and update matches
-- (seeding from football-data.org, manual result overrides)
-- Regular users remain read-only on matches.

create policy "matches_insert_admin"
  on public.matches for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

create policy "matches_update_admin"
  on public.matches for update
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
