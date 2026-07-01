# Telegram Bot

Bot: `@veikkaajat_apumarko_bot`

**Automatic messages:**
- 🔔 Predictions-reveal message (group): shows all predictions as soon as betting closes (5 min before kickoff; sent by the 5-min cron, so it lands between deadline and kickoff); includes odds (if fetched) and a Claude-Haiku-generated historical fun fact about the matchup, when available
- ⚽ Result message (group): result, per-player points, leaderboard with ↑↓→ arrows
- ⏰ Reminder DM: sent 30 min before kickoff (or at 22:00 Helsinki for matches starting 23:00–05:00); includes "✏️ Veikkaa nyt" inline button to edit directly via bot; sent for matches with status `SCHEDULED` or `TIMED` (both mean "not yet played")

**Commands (group):**
- `/chart` — cumulative points line chart image (QuickChart.io)
- `/stats` — full stats board image (same columns as /leaderboard: Pts, KA, Tark, Mrk%, Nol%, L-KA, J-KA, Tas%, Yllätys%, Jht, Trendi, xG-Pts, Bonus) rendered with next/og; each stat cell color-coded green (best) → red (worst); after the betting deadline also Mestari + Maalikuningas pick columns, shown red if eliminated; caption has legend + link; falls back to text summary on error
- `/jatkokaavio` — circular playoff bracket image (PNG via next/og); replies with an info message if no knockout matches exist yet
- `/odds` — kerroinanalyysi: per-player KA-kerroin (average decimal odds of their predictions across finished, odds-tracked matches) and ROI% (return on investment, 1 unit staked per prediction), sorted by ROI% descending
- `/luokkasota` — clan rankings: total + average pts per clan, members listed under each
- `/maaliporssi` — top 10 tournament scorers from football-data.org (player, Finnish country name, goals, assists); sorted by goals desc then assists desc
- `/putki` — streak overview: top 3 per streak type (correct_5p, right_result, wrong_result, zero_p, non_zero_p, non_5p); current + best per player (best includes historical record via `streak_seeds.hist_best`)
- `/haetulos` — available to all group members; immediately polls football-data.org for any match that kicked off 85+ min ago and isn't scored yet, scores it, and sends the result message. If FD hasn't flipped FINISHED yet (free-tier lag ~20–35 min), falls back to Flashscore's results feed for group-stage matches only (works right after the final whistle; throttled to 1 call/3 min). A knockout match that went to extra time/penalties is never auto-scored here either — it's flagged for manual entry instead
- `/help` — lists commands

**Admin-only commands (group):**
- `/setscore <id> <h-a> [koti|vieras]` — set match result (e.g. `/setscore 42 2-1`); scores predictions + sends result message; the `koti`/`vieras` suffix is required when the match is knockout-stage and the score is a draw, to record who advanced (`winner_team`); caller must have `telegram_chat_id` matching an `is_admin` profile
- `/matchid` — shows 2 previous + 2 next matches with id, teams, score, kickoff time

**Commands (DM):**
- `/start` — bot replies with the user's Telegram chat ID
- `/veikkaukset` — shows the user's predictions for the next 5 open matches; each has an "✏️ Muokkaa / Veikkaa" inline button

**Inline prediction editing (DM):**
- Tapping an edit button triggers a ForceReply prompt: `"Syötä veikkauksesi ottelulle #ID …"`
- User replies with `2-1`; bot parses, enforces the 5-min deadline, saves via service role, confirms
- Works from both `/veikkaukset` and reminder DM buttons

**Day-in-lead counting:** grouped by Helsinki calendar day with 10:00 Helsinki cutoff (UTC−7 shift), so US late-night matches fall under the correct gameday.

**Bonus column** in `/stats` appears only after the betting deadline (first match kickoff) and only if someone has scored bonus points.

**Delivery failures**: any logged-in Telegram send (reminder DM, result message, kickoff message, category-bet announcement) that fails after one 429 retry is written to `telegram_send_failures` and can be resent from `/admin/telegram-failures`.
