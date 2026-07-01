# Project Structure

```
app/
  layout.tsx              # Root layout: Nav + Supabase session
  page.tsx                # Redirect → /login or /leaderboard
  login/page.tsx          # Magic link form (Finnish)
  auth/callback/route.ts  # Supabase magic link callback
  leaderboard/page.tsx    # Leaderboard + cumulative chart + transposed stats table + champion/scorer
                          # picks table (red if eliminated) + playoff bracket
                          # force-dynamic; predictions via service role for full stats
  matches/page.tsx        # Fixture list + prediction entry
  predictions/page.tsx    # All players' predictions for CLOSED targets: matches past the
                          # 5-min deadline (with points once scored) + special bets after
                          # their deadlines (champion/scorer table, group picks per closed group)
  my-predictions/page.tsx # Player's own predictions + points + special bets summary
                          # Special bets always visible; "muokattavissa" tag while open; correct answers revealed after deadline
  bets/page.tsx           # Special bets: champion, top scorer (country-grouped + search),
                          # group advance (wildcard for all tournament countries)
                          # confirmedBets state: persistent save indicator, unsaved-change warning
  settings/page.tsx       # Player self-service: display name, Telegram ID, chart color, clan
  history/page.tsx        # Historical competition browser: stats table + tournament comparison matrix
                          # Competition tabs (All / EM08 / MM10 / … / MM26); queries hist_player_comp_stats
                          # + live_player_comp_stats views
  history/CompPicker.tsx          # Client component: competition tab pills, updates ?comp= URL param
  history/HistoryStatsTable.tsx   # Client component: sortable stats table, "vain MM26-pelaajat" filter
  history/HistoryOverviewTable.tsx # Tournament-comparison matrix (player × competition)
  admin/
    layout.tsx             # Guards: redirect non-admins to /leaderboard
    page.tsx               # Admin dashboard links
    seed/page.tsx           # Import all matches from football-data.org (single button, no stage filter)
    matches/page.tsx        # Manual result override (also auto-fetches xG); shows a
                            # needs_manual_score badge and a "who advanced?" selector for
                            # knockout draws
    players/page.tsx        # Invite players, set telegram_chat_id, copy login link to clipboard
    categories/page.tsx     # Score special bets (champion, scorer, group advance)
    upcoming/page.tsx       # Predictions closing in the next 24h, admin overview
    telegram-failures/page.tsx # Unresolved telegram_send_failures with a "Yritä uudelleen" retry button

components/
  Nav.tsx                 # Sticky top nav; desktop: all links inline; mobile: Pisteet+Ottelut always visible, hamburger dropdown for rest
  MatchCard.tsx           # Match display with prediction form / locked / result
  PredictionForm.tsx      # Score input (home : away), optimistic save
  CountdownTimer.tsx      # Client component, updates every 30s
  PointsChart.tsx         # Recharts line chart; accepts colors[] prop (one per player)
  StatsTable.tsx          # Client component: transposed stats table; click a stat row to sort
                          # player columns by it (best first, click again to reverse); default Pts
  ChatBox.tsx             # Client component: live chat on leaderboard page
                          # Supabase Realtime subscription; iMessage-style bubbles; own messages deletable
  PlayoffBracket.tsx      # Server component: circular SVG knockout bracket with curved branch/connector
                          # paths, flags via flagcdn (outer ring + clipped circles on inner rings),
                          # eliminated nodes dimmed, winner paths glow amber, champion shown in the center

lib/
  supabase/
    client.ts             # createBrowserClient (client components)
    server.ts             # createServerClient + createServiceRoleClient (server)
  football-data/client.ts # fetchMatches(), fetchMatch(), fetchTopScorers() (2-min cached)
                          # FDMatch.score includes winner/duration (extra-time/penalty detection)
  flashscore/client.ts    # fetchFsResults(), fetchFsResultsThrottled(), fetchFsXg()
                          # budget-guarded via fs_requests (500/month hard limit)
  therundown/client.ts    # fetchDayOdds(dateStr) — pre-match decimal odds, same RAPIDAPI_KEY as Flashscore
  api-football/client.ts  # LEGACY (free plan lacks season 2026) — unused
  telegram/
    bot.ts                 # sendMessage(), sendMessageWithMarkup() — retry once on 429, resolve
                           #   {ok, status?, error?} instead of throwing
                           # answerCallbackQuery(), sendPhoto(), sendPhotoBuffer(), sendPhotoBytes(),
                           #   getQuickChartUrl()
    notify.ts              # sendKickoffMessage(), sendResultMessage(), sendReminderDM(),
                           #   sendOddsReport() — KA-kerroin & ROI% per player
                           # sendStatsTable() — full stats board image via stats-image.tsx,
                           #   falls back to text summary if image generation fails
                           # sendBracketImage() — playoff bracket PNG via bracket-image.tsx
                           # Failed sends (sendResultMessage, sendReminderDM) logged to
                           #   telegram_send_failures via logTelegramFailure()
    stats-image.tsx        # renderStatsImage() — next/og (Satori) PNG renderer;
                           # per-stat heatmap: green (best) → red (worst), lowerIsBetter flag for Nol%
                           # ImgCell.textColor overrides heatmap color (used for eliminated picks)
                           # sendClanWar() — clan rankings for /luokkasota command
                           # sendTopScorers() — top 10 scorers for /maaliporssi command
    bracket-image.tsx      # renderBracketImage() — next/og (Satori) PNG of the playoff bracket
                           # (no flag images here — fetching ~30 remote images server-side is slow/flaky)
  scoring/engine.ts           # calculatePoints() — pure function, unit-tested
  scoring/score-and-notify.ts # scoreMatchAndNotify() — shared by /setscore bot cmd, override-result API,
                              # poll-and-score; takes optional winnerTeam; refreshes mv_player_match_log
  poll-and-score.ts           # pollAndScoreFinishedMatches() — shared logic for /haetulos (available to
                              # all group members); flags ET/penalty matches needs_manual_score instead
                              # of auto-scoring them
  bracket-geometry.ts         # buildBracketLayout() — pure geometry (no React/JSX) shared by the web
                              # SVG bracket and the Telegram PNG renderer
  eliminations.ts             # getEliminatedCountries(), isChampionPickEliminated(), isScorerPickEliminated()
  streaks.ts                  # computeStreaks(admin) — reads scoring_log + streak_seeds (current + hist_best),
                              # returns current+best per player per type
  players.ts              # TOP_SCORER_PLAYERS list (~80 players, no rank field),
                          # sorted by Finnish country name; wildcard helpers
  countries.ts            # getCountry(), flagUrl(), groupLabel()
                          # groupLabel handles both "GROUP_A" and "Group A" → "Ryhmä A"
  colors.ts               # CHART_COLORS (20-color palette), assignColors()
  utils.ts                # formatDate (Finnish), stageLabel(), resultLabel()

app/api/
  predictions/route.ts            # GET + POST predictions
  category-bets/route.ts          # GET + POST special bets (deadline enforced server-side)
  profile/color/route.ts          # POST: pick/release chart color (unique constraint enforced)
  admin/seed-matches/route.ts     # POST: import all matches from football-data.org (no stage param);
                                  # guards against a TBD team name overwriting an already-resolved one
  admin/override-result/route.ts  # POST: set result + score + fetch xG + notify Telegram
                                  # accepts winner_team; requires it server-side for a knockout-stage draw
  admin/score-categories/route.ts # POST: set category result + score all bets; logs failed Telegram
                                  # sends to telegram_send_failures
  admin/retry-telegram-failure/route.ts # POST: resend a logged telegram_send_failures payload,
                                        # mark resolved_at on success (anon-key session client, admin RLS)
  admin/invite-player/route.ts        # POST: send magic link invite
  admin/generate-login-link/route.ts  # POST: generate magic link and return URL (admin only, no email sent)
  telegram/
    webhook/route.ts              # Telegram bot webhook — /start, /chart, /stats, /jatkokaavio,
                                  # /odds, /luokkasota, /maaliporssi, /putki, /haetulos, /help (group)
                                  # admin: /setscore <id> <h-a> [koti|vieras], /matchid
                                  # /veikkaukset (DM); callback_query handler for edit:{matchId}; ForceReply prediction editing

proxy.ts                # Next.js proxy (was: middleware): session refresh + auth redirect
                        # Excludes /api/ routes so Telegram webhook isn't redirected to /login

scripts/
  import-historical.ts        # Imports a past competition's CSV into hist_* tables (interactive dry-run)
  backfill-odds.ts            # Backfills home_odds/draw_odds/away_odds for already-seeded matches via TheRundown
  populate-streak-hist-best.ts # Populates streak_seeds.hist_best from archived competition data

supabase/
  migrations/              # see docs/SCHEMA.md for the full list + descriptions
  functions/
    poll-match-results/index.ts      # Deno: polls football-data.org, scores, fetches xG, sends result message
                                     # (spoiler-formatted); flags ET/penalty matches needs_manual_score and
                                     # DMs admins instead of auto-scoring them
    check-upcoming-matches/index.ts  # Deno: sends reminder DMs (status SCHEDULED or TIMED) + predictions-reveal
                                     # group message (with odds + a Claude-Haiku-generated fun fact per match)
                                     # (sent when betting closes, 5 min before kickoff)
                                     # also posts category bets (champion/scorer/group advance) when their
                                     # deadline closes; logs failed sends to telegram_send_failures
    _shared/prematch-stat.ts         # getPreMatchStat() — see docs/FEATURES.md "Pre-match Fun Facts"

types/
  database.ts            # Hand-written types (replace with supabase gen types)
```
