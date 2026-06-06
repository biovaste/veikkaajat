# Veikkaajat — MM 2026

World Cup 2026 score prediction app for a small group of friends (<20 players).

## Stack

| Concern | Technology |
|---|---|
| Frontend + API routes | Next.js 16 App Router, TypeScript |
| Database + Auth | Supabase (Postgres, magic link only, RLS) |
| Hosting | Vercel (free tier) |
| Scheduled polling | Supabase Edge Function + pg_cron |
| Match data | football-data.org v4 API (free tier) |
| Notifications | Telegram Bot API |

UI language: Finnish. Layout: mobile-first. No open signup — admin invites players by email.

## Environment Variables

**`.env.local` (local) and Vercel dashboard (production):**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never in client code
FOOTBALL_DATA_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_GROUP_CHAT_ID=
NEXT_PUBLIC_APP_URL=
```

**Supabase Edge Function secrets** (set via `supabase secrets set`):
```
FOOTBALL_DATA_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_GROUP_CHAT_ID=
NEXT_PUBLIC_APP_URL=
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected
```

**Vercel only (not needed by edge functions):**
```
TELEGRAM_WEBHOOK_SECRET=    # random string — set in both Vercel and when calling setWebhook
```

## Scoring Rules

- 3 pts — correct match result (win/draw/loss)
- +1 pt — correct home team goal tally
- +1 pt — correct away team goal tally
- **Max 5 pts per match**

Scoring engine: `lib/scoring/engine.ts` — pure function, unit-tested.

## Key Architectural Decisions

- **Admin writes**: seed and override API routes use `createServerClient()` (anon key + cookie session). RLS allows writes because `profiles.is_admin = true` for the authenticated user (see migration 0004). `createServiceRoleClient()` is reserved for `auth.admin.*` operations (e.g. inviting users) — it uses `@supabase/supabase-js` `createClient` directly with no cookies. Note: the new Supabase "Secret API key" is NOT the legacy `service_role` JWT and does not bypass RLS — don't confuse them. The edge function (Phase 5) bypasses RLS by calling the Supabase REST API directly with the service role key in the `apikey` header, which is a different path. Admin pages use the admin layout which server-side checks `profiles.is_admin`. The proxy (`proxy.ts`) does not check admin status — it only handles session refresh and unauthenticated redirects.
- **Kickoff lock**: enforced both client-side (hide form) and server-side (`POST /api/predictions` rejects if `kickoff_at <= now()`).
- **No open signup**: admin uses `/admin/players` to invite users via `supabase.auth.admin.inviteUserByEmail()`.
- **football-data.org rate limit**: 10 req/min. Group stage seed is one bulk call. The edge function polls one match at a time with a 7s sleep between calls.
- **Types**: Supabase client uses untyped `any` generics for now. Run `supabase gen types typescript --project-id <ref> > types/database.ts` after `supabase login` to get proper types.

## Database Schema

All tables are in `supabase/migrations/`. Run them in order (0001 → 0005) in the Supabase SQL editor.

| Table | Purpose |
|---|---|
| `profiles` | One row per auth user; auto-created via trigger on `auth.users` insert |
| `matches` | Seeded from football-data.org; result fields set after match finishes |
| `predictions` | One row per (player, match); editable until `kickoff_at` |
| `scoring_log` | Audit trail written after each match is scored |
| `category_bets` | Stub table for future tournament-level bets module |

**To mark yourself as admin** (run once in Supabase SQL editor after first login):
```sql
UPDATE profiles SET is_admin = true WHERE email = 'your@email.fi';
```

## Project Structure

```
app/
  layout.tsx              # Root layout: Nav + Supabase session
  page.tsx                # Redirect → /login or /leaderboard
  login/page.tsx          # Magic link form (Finnish)
  auth/callback/route.ts  # Supabase magic link callback
  leaderboard/page.tsx    # Points leaderboard
  matches/page.tsx        # Fixture list + prediction entry (Phase 2)
  my-predictions/page.tsx # Player's own predictions + points
  admin/
    layout.tsx            # Guards: redirect non-admins to /leaderboard
    page.tsx              # Admin dashboard links
    seed/page.tsx         # Import matches from football-data.org
    matches/page.tsx      # Manual result override (Phase 3)
    players/page.tsx      # Invite players, view stats

components/
  Nav.tsx                 # Sticky top nav with sign-out

lib/
  supabase/
    client.ts             # createBrowserClient (client components)
    server.ts             # createServerClient + createServiceRoleClient (server)
  football-data/client.ts # Typed wrapper: fetchMatches(), fetchMatch()
  telegram/
    bot.ts              # sendMessage(), sendPhoto(), getQuickChartUrl() — raw HTTP
    notify.ts           # sendKickoffMessage(), sendResultMessage(), sendReminderDM(),
                        # sendStatsTable(), sendChartImage() — Phase 4
  scoring/engine.ts       # calculatePoints() — Phase 3
  utils.ts                # formatDate (Finnish), stageLabel(), resultLabel()

app/api/
  predictions/route.ts            # GET + POST predictions — Phase 2
  admin/seed-matches/route.ts     # POST: import from football-data.org
  admin/override-result/route.ts  # POST: set result + score + notify — Phase 3
  admin/invite-player/route.ts    # POST: send magic link invite
  telegram/
    webhook/route.ts              # Telegram bot webhook — /start, /chart, /stats

proxy.ts                # Next.js proxy (was: middleware): session refresh + auth redirect
supabase/
  migrations/
    0001_initial_schema.sql
    0002_rls_policies.sql
    0003_triggers.sql
    0004_matches_admin_policies.sql
    0005_telegram_fields.sql      # telegram_chat_id on profiles; reminder_sent/kickoff_msg_sent on matches
  functions/
    poll-match-results/index.ts      # Deno: polls football-data.org, scores, sends result message
    check-upcoming-matches/index.ts  # Deno: sends reminder DMs + kickoff group message
types/
  database.ts            # Hand-written types (replace with supabase gen types)
```

## football-data.org Endpoints

| Purpose | Endpoint | When called |
|---|---|---|
| Seed group stage | `GET /v4/competitions/WC/matches?stage=GROUP_STAGE` | Admin: seed page |
| Seed knockout rounds | `GET /v4/competitions/WC/matches?stage=ROUND_OF_16` etc. | Admin: per stage |
| Poll result | `GET /v4/matches/{external_id}` | Edge function every 30 min |

Competition code: `WC`. Auth header: `X-Auth-Token`.

## Telegram Message Format

Sent after every confirmed result (HTML parse mode):
```
<b>Ottelu: Ranska - Saksa</b>
<b>Tulos: 2 - 1</b>

<b>Pisteet tästä ottelusta:</b>
Matti Meikäläinen — 5 pts
Teppo Testaaja — 3 pts
...muut — 0 pts

<b>Sarjataulukko (top 5):</b>
1. Matti Meikäläinen — 42 pts
2. Teppo Testaaja — 38 pts
```

## Build & Run

```bash
npm install
npm run dev        # local development
npm run build      # production build
npm test           # vitest unit tests
```

---

## Build Progress

### ✅ Phase 0 — Scaffolding + Auth
**Status: Complete**

- Next.js 16 project with TypeScript, Tailwind CSS
- Supabase client wrappers (`lib/supabase/client.ts`, `server.ts`)
- Session refresh proxy (`proxy.ts`)
- Magic link login page (`/login`)
- Auth callback handler (`/auth/callback`)
- Auto-create profile trigger on first login
- All 3 SQL migrations written

**Verify:** Log in via magic link → land on `/leaderboard`. Non-admin hitting `/admin` is redirected.

---

### ✅ Phase 1 — Match Seeding + Admin Foundation
**Status: Complete**

- `lib/football-data/client.ts` — `fetchMatches()`, `fetchMatch()`
- `lib/utils.ts` — `formatDate()`, `stageLabel()`, `resultLabel()`
- `POST /api/admin/seed-matches` — imports matches from football-data.org (upsert on `external_id`)
- `POST /api/admin/invite-player` — sends magic link + creates profile
- `/admin` dashboard, `/admin/seed`, `/admin/players` pages
- `/matches` fixture list (grouped by stage, shows result badges)
- `/leaderboard` page (aggregates `predictions.points`)
- `/my-predictions` page (player's own history)
- `Nav` component (sticky, shows admin link for admins)

**Verify:**
1. Log in → mark self as admin in Supabase SQL editor
2. Admin → Tuo ottelut → "Lohkovaihe" → 48 matches imported
3. `/matches` shows all fixtures grouped by stage
4. Admin → Pelaajat → invite a player → magic link email arrives

---

### ✅ Phase 2 — Predictions
**Status: Complete**

- `app/api/predictions/route.ts` — GET + POST; server-side kickoff guard rejects edits after `kickoff_at`
- `components/PredictionForm.tsx` — score input (home : away), optimistic save feedback
- `components/CountdownTimer.tsx` — client component, updates every 30s
- `components/MatchCard.tsx` — match display with prediction form (pre-kickoff), locked view (post-kickoff), result + points (finished)
- `app/matches/page.tsx` — loads matches + user predictions in parallel, renders MatchCards

**Verify:**
1. `/matches` shows all matches with inline prediction form for future matches
2. Submit a prediction → "✓" confirmation, DB updated
3. Edit prediction → updates existing row
4. Past match shows locked prediction, no form

---

### ✅ Phase 3 — Scoring + Leaderboard
**Goal:** Admin confirms result; points calculated; leaderboard updates.

**Status: Complete**

- `lib/scoring/engine.ts` — `calculatePoints()` pure function; scores full-time only (extra time/pens ignored for knockout matches)
- `lib/scoring/engine.test.ts` — 9 unit tests covering all point combinations (0–5 pts), all pass
- `app/api/admin/override-result/route.ts` — sets match score, scores all predictions, inserts scoring_log
- `app/admin/matches/page.tsx` — filterable match list with inline result override form

**Verify:**
1. Admin → Tulokset → set a result → "✓ N veikkausta pisteytetty"
2. `/leaderboard` shows updated points
3. `/matches` shows result + player's points on that match
4. `/my-predictions` shows points per match

---

### ✅ Phase 4 — Telegram Bot
**Status: Complete**

**What it does:**
- **Kickoff message** (group): when match kicks off, shows all predictions + who didn't predict
- **Result message** (group): after scoring, shows result, predictions with points, leaderboard with position arrows (↑↓→)
- **Reminder DMs**: sent 30 min before kickoff (or at 22:00 Helsinki if match starts 23:00–05:00) to players who haven't predicted
- **`/chart`** (group command): sends cumulative points line chart image via QuickChart.io
- **`/stats`** (group command): sends monospace stats table (pts, avg, exact scores, correct result %)
- **`/start`** (DM to bot): bot replies with the player's Telegram chat ID for admin to register

**New files:**
- `lib/telegram/bot.ts` — raw HTTP helpers
- `lib/telegram/notify.ts` — application-level message functions
- `app/api/telegram/webhook/route.ts` — bot update handler
- `supabase/functions/check-upcoming-matches/index.ts` — Deno, every 5 min
- `supabase/functions/poll-match-results/index.ts` — Deno, every 30 min (also scores + notifies)

**New DB columns (migration 0005):**
- `profiles.telegram_chat_id` — TEXT nullable, set by admin in Players page
- `matches.reminder_sent` — BOOLEAN, prevents double reminders
- `matches.kickoff_msg_sent` — BOOLEAN, prevents double kickoff messages

**Setup steps:**

1. **Create bot**: message @BotFather on Telegram → `/newbot` → copy the token
2. **Add bot to group**: invite it, make it an admin so it can send messages
3. **Get group chat_id**: send a message in the group, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` — look for `message.chat.id` (negative number for groups)
4. **Set env vars** in Vercel dashboard:
   ```
   TELEGRAM_BOT_TOKEN=<token>
   TELEGRAM_GROUP_CHAT_ID=<negative-number>
   TELEGRAM_WEBHOOK_SECRET=<any-random-string>
   ```
5. **Register webhook** (run once after deploying):
   ```
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<your-app>.vercel.app/api/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
6. **Run migration 0005** in Supabase SQL editor
7. **Register players**: each player DMs `/start` to the bot → copies their chat ID → admin enters it in Admin → Pelaajat page

**Bot commands available in the group:**
- `/chart` — sends line chart image
- `/stats` — sends stats table
- `/help` — lists commands

---

### 🔲 Phase 5 — Automated Polling
**Goal:** Results polled and kickoff/reminder messages sent automatically.

**Files:** already created in Phase 4 (both edge functions are complete).

**Setup steps:**
1. Enable `pg_cron` + `pg_net` extensions in Supabase dashboard (Database → Extensions)
2. Install Supabase CLI and authenticate: `supabase login`
3. Link project: `supabase link --project-ref <ref>`
4. Set edge function secrets:
   ```
   supabase secrets set FOOTBALL_DATA_API_KEY=...
   supabase secrets set TELEGRAM_BOT_TOKEN=...
   supabase secrets set TELEGRAM_GROUP_CHAT_ID=...
   supabase secrets set NEXT_PUBLIC_APP_URL=https://...
   ```
5. Deploy both functions:
   ```
   supabase functions deploy poll-match-results
   supabase functions deploy check-upcoming-matches
   ```
6. Register cron jobs in Supabase SQL editor:
   ```sql
   -- Poll results every 30 min
   select cron.schedule(
     'poll-match-results', '*/30 * * * *',
     $$ select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/poll-match-results',
       headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb,
       body := '{}'::jsonb
     ) $$
   );

   -- Check upcoming matches every 5 min
   select cron.schedule(
     'check-upcoming-matches', '*/5 * * * *',
     $$ select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/check-upcoming-matches',
       headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb,
       body := '{}'::jsonb
     ) $$
   );
   ```

Done when: `select * from cron.job_run_details order by start_time desc limit 10;` shows successful runs.

---

### 🔲 Phase 6 — UI Polish
**Goal:** Mobile-friendly, all-Finnish, edge cases handled.

- Responsive pass on all pages
- Finnish copy audit
- Loading states + error boundaries
- Postponed/cancelled match badges
- Favicon + meta tags

---

### 🔲 Phase 7 — Knockout Rounds (during tournament)
**Goal:** Add bracket rounds as they're confirmed.

- Admin re-runs "Tuo ottelut" per stage — safe to repeat (upserts on `external_id`)
- football-data.org uses TBD placeholders until bracket is set; verify team names after
