// Supabase Edge Function: poll-match-results
// Runs every 10 minutes via pg_cron.
// Note: football-data.org free tier flips status to FINISHED ~20-35 min after
// full time — that upstream lag, not this schedule, dominates result latency.
// - Finds matches that should be finished and fetches results from football-data.org
// - Scores all predictions, updates scoring_log (replacing previous entries to avoid stacking)
// - Fetches xG from Flashscore (RapidAPI, budget-guarded via fs_requests) and stores it
// - Backfills missing xG and resolves knockout fs_match_ids as they appear
// - Sends Telegram result message with leaderboard and position changes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FD_API_KEY          = Deno.env.get('FOOTBALL_DATA_API_KEY')!
const BOT_TOKEN           = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const GROUP_CHAT_ID       = Deno.env.get('TELEGRAM_GROUP_CHAT_ID')!
const RAPIDAPI_KEY        = Deno.env.get('RAPIDAPI_KEY') ?? ''  // optional

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function tgSend(chatId: string | number, text: string) {
  const res = await fetch(`${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  if (!res.ok) console.error('[tg]', await res.text())
}

function calcPoints(
  pred: { home: number; away: number },
  result: { home: number; away: number },
): { total: number; breakdown: { result: number; home_goals: number; away_goals: number } } {
  const predOutcome = Math.sign(pred.home - pred.away)
  const realOutcome = Math.sign(result.home - result.away)
  const resultPts = predOutcome === realOutcome ? 3 : 0
  const homePts   = pred.home === result.home ? 1 : 0
  const awayPts   = pred.away === result.away ? 1 : 0
  return { total: resultPts + homePts + awayPts, breakdown: { result: resultPts, home_goals: homePts, away_goals: awayPts } }
}

// ─── Flashscore (RapidAPI) — xG + match id resolution ────────────────────────
// HARD LIMIT 500 requests/month: every call is logged to fs_requests and
// fsFetch refuses to call once FS_BUDGET is reached.

const FS_BASE   = 'https://flashscore4.p.rapidapi.com/api/flashscore/v2'
const FS_TT     = 'lvUBR5F8' // World Cup tournament_template_id
const FS_SEASON = '185'      // 2026 season_id
const FS_BUDGET = 450

// deno-lint-ignore no-explicit-any
type Db = any

async function fsFetch(db: Db, endpoint: string): Promise<unknown | null> {
  if (!RAPIDAPI_KEY) return null
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { count } = await db
    .from('fs_requests')
    .select('*', { count: 'exact', head: true })
    .gte('called_at', monthStart.toISOString())
  if ((count ?? 0) >= FS_BUDGET) {
    console.warn(`[fs] monthly budget reached (${count}) — skipping ${endpoint}`)
    return null
  }
  await db.from('fs_requests').insert({ endpoint })
  const res = await fetch(`${FS_BASE}${endpoint}`, {
    headers: { 'x-rapidapi-host': 'flashscore4.p.rapidapi.com', 'x-rapidapi-key': RAPIDAPI_KEY },
  })
  if (!res.ok) {
    console.error(`[fs] ${endpoint} → ${res.status}`)
    return null
  }
  return res.json()
}

async function fetchFsXg(db: Db, fsMatchId: string): Promise<{ home_xg: number; away_xg: number } | null> {
  const data = await fsFetch(db, `/matches/match/stats?match_id=${fsMatchId}`) as
    { match?: { name: string; home_team: unknown; away_team: unknown }[] } | null
  const xg = data?.match?.find(s => s.name === 'Expected goals (xG)')
  if (!xg || typeof xg.home_team !== 'number' || typeof xg.away_team !== 'number') return null
  return { home_xg: xg.home_team, away_xg: xg.away_team }
}

function squashName(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
}

/** Resolve fs_match_id for matches missing one (knockouts) from the fixtures feed. */
async function resolveFsIds(db: Db, matches: { id: number; home_team: string; away_team: string; kickoff_at: string }[]) {
  const fixtures = await fsFetch(db, `/tournaments/fixtures?tournament_template_id=${FS_TT}&season_id=${FS_SEASON}&page=1`) as
    { match_id: string; timestamp: number; home_team: { name: string }; away_team: { name: string } }[] | null
  if (!Array.isArray(fixtures)) return
  const SQUASH_ALIASES: Record<string, string> = { drcongo: 'congodr', czechrepublic: 'czechia', usa: 'unitedstates', bosniaherzegovina: 'bosniaherzegovina' }
  const sq = (s: string) => { const v = squashName(s); return SQUASH_ALIASES[v] ?? v }
  for (const m of matches) {
    const ts = Math.floor(+new Date(m.kickoff_at) / 1000)
    const hit = fixtures.find(f => {
      if (f.timestamp !== ts) return false
      const fh = sq(f.home_team?.name ?? ''), fa = sq(f.away_team?.name ?? '')
      const oh = sq(m.home_team), oa = sq(m.away_team)
      return (fh.includes(oh) || oh.includes(fh)) && (fa.includes(oa) || oa.includes(fa))
    })
    if (hit) await db.from('matches').update({ fs_match_id: hit.match_id }).eq('id', m.id)
  }
}

/**
 * football-data.org's score.fullTime for a match that went to extra time is the
 * *final* match score (it can include extra-time goals), not the 90-minute score
 * our scoring rules require — and there's no separate 90-minute-only field. So
 * those matches are never auto-scored; flag them and DM the admins to score them
 * manually (with the real 90-minute score) via /admin/matches.
 */
async function flagForManualScoring(
  db: Db,
  match: { id: number; home_team: string; away_team: string },
  winnerTeam: 'HOME' | 'AWAY' | null,
  adminChatIds: string[],
) {
  await db.from('matches').update({
    went_to_extra_time: true,
    needs_manual_score: true,
    ...(winnerTeam ? { winner_team: winnerTeam } : {}),
  }).eq('id', match.id)

  const text = `⚠️ <b>${match.home_team} – ${match.away_team}</b> päättyi jatkoajalla/rangaistuspotkuilla — ` +
    `pisteytä käsin 90 min tuloksella osoitteessa /admin/matches.`
  for (const chatId of adminChatIds) {
    await tgSend(chatId, text)
  }
}

// ─── Telegram result message ──────────────────────────────────────────────────

async function sendResultMessage(
  db: ReturnType<typeof createClient>,
  matchId: number,
  homeScore: number,
  awayScore: number,
) {
  const { data: match } = await db
    .from('matches')
    .select('home_team, away_team')
    .eq('id', matchId)
    .single()
  if (!match) return

  const [{ data: preds }, { data: players }, { data: log }, { data: catBets }] = await Promise.all([
    db.from('predictions').select('user_id, home_score_pred, away_score_pred, points').eq('match_id', matchId),
    db.from('profiles').select('id, display_name'),
    db.from('scoring_log').select('user_id, points, match_id, breakdown'),
    db.from('category_bets').select('user_id, points'),
  ])

  const prevTotals: Record<string, number> = {}
  const newTotals: Record<string, number> = {}
  const prevExact: Record<string, number> = {}
  const newExact:  Record<string, number> = {}
  for (const r of log ?? []) {
    const b = r.breakdown as { result: number; home_goals: number; away_goals: number } | null
    const isExact = b?.result === 3 && b?.home_goals === 1 && b?.away_goals === 1
    if (r.match_id !== matchId) {
      prevTotals[r.user_id] = (prevTotals[r.user_id] ?? 0) + r.points
      if (isExact) prevExact[r.user_id] = (prevExact[r.user_id] ?? 0) + 1
    }
    newTotals[r.user_id] = (newTotals[r.user_id] ?? 0) + r.points
    if (isExact) newExact[r.user_id] = (newExact[r.user_id] ?? 0) + 1
  }
  // Include category bet bonus so the leaderboard reflects real standings
  for (const r of catBets ?? []) {
    if (r.points != null) {
      prevTotals[r.user_id] = (prevTotals[r.user_id] ?? 0) + r.points
      newTotals[r.user_id]  = (newTotals[r.user_id]  ?? 0) + r.points
    }
  }

  const rankMap = (totals: Record<string, number>, exact: Record<string, number>) => {
    const sorted = Object.entries(totals).sort(
      (a, b) => b[1] - a[1] || (exact[b[0]] ?? 0) - (exact[a[0]] ?? 0),
    )
    return Object.fromEntries(sorted.map(([id], i) => [id, i + 1]))
  }
  const prevRanks = rankMap(prevTotals, prevExact)
  const newRanks  = rankMap(newTotals, newExact)
  const nameMap   = Object.fromEntries((players ?? []).map(p => [p.id, p.display_name]))
  const predMap   = Object.fromEntries((preds ?? []).map(p => [p.user_id, p]))
  const sortedPreds = [...(preds ?? [])].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))

  let text = `⚽ <b>${match.home_team} – ${match.away_team}</b>\n`
  text += `Tulos: <tg-spoiler><b>${homeScore}–${awayScore}</b>\n\n<b>Pisteet:</b>\n`
  for (const pred of sortedPreds) {
    text += `${nameMap[pred.user_id] ?? '?'}: ${pred.points ?? 0} p (veikkaus ${pred.home_score_pred}–${pred.away_score_pred})\n`
  }
  const predictedIds = new Set((preds ?? []).map(p => p.user_id))
  for (const p of (players ?? []).filter(p => !predictedIds.has(p.id))) {
    text += `${p.display_name}: – (ei veikkaus)\n`
  }
  text += '\n<b>Sarjataulukko:</b>\n'
  const leaderboard = (players ?? [])
    .filter(p => newTotals[p.id] !== undefined)
    .sort((a, b) => (newRanks[a.id] ?? 999) - (newRanks[b.id] ?? 999))
  for (const p of leaderboard) {
    const delta = (prevRanks[p.id] ?? newRanks[p.id]) - (newRanks[p.id] ?? 1)
    const arrow = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : '→'
    text += `${newRanks[p.id]}. ${p.display_name} — ${newTotals[p.id] ?? 0} p <i>(${arrow}, +${predMap[p.id]?.points ?? 0})</i>\n`
  }
  text += '</tg-spoiler>'

  await tgSend(GROUP_CHAT_ID, text)
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Poll matches that kicked off > 115 min ago (90 min + 25 min buffer for stoppages/half-time)
  // This also catches extra-time matches — they'll remain in IN_PLAY until FINISHED
  const pollBefore = new Date(Date.now() - 115 * 60 * 1000)

  const { data: matches } = await db
    .from('matches')
    .select('id, external_id, home_team, away_team, kickoff_at, fs_match_id, fs_xg_attempts')
    .in('status', ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED'])
    .eq('needs_manual_score', false)
    .lt('kickoff_at', pollBefore.toISOString())
    .limit(10)

  let scored = 0
  // Admin chat ids for manual-scoring alerts, fetched lazily at most once per run
  let adminChatIds: string[] | undefined

  for (const match of matches ?? []) {
    try {
      const fdRes = await fetch(
        `https://api.football-data.org/v4/matches/${match.external_id}`,
        { headers: { 'X-Auth-Token': FD_API_KEY } },
      )
      if (!fdRes.ok) {
        console.error(`[fd] ${match.external_id}: ${fdRes.status}`)
        await sleep(7000)
        continue
      }

      const fdMatch = await fdRes.json()
      const status: string = fdMatch.status

      if (status === 'FINISHED') {
        const duration: string | undefined = fdMatch.score?.duration
        if (duration && duration !== 'REGULAR') {
          const winner: string | null = fdMatch.score?.winner ?? null
          const winnerTeam = winner === 'HOME_TEAM' ? 'HOME' : winner === 'AWAY_TEAM' ? 'AWAY' : null
          if (adminChatIds === undefined) {
            const { data: admins } = await db
              .from('profiles')
              .select('telegram_chat_id')
              .eq('is_admin', true)
              .not('telegram_chat_id', 'is', null)
            adminChatIds = (admins ?? []).map((a: { telegram_chat_id: string }) => a.telegram_chat_id)
          }
          await flagForManualScoring(db, match, winnerTeam, adminChatIds)
          await sleep(7000)
          continue
        }

        const homeScore: number = fdMatch.score?.fullTime?.home ?? null
        const awayScore: number = fdMatch.score?.fullTime?.away ?? null

        if (homeScore === null || awayScore === null) {
          await sleep(7000)
          continue
        }

        // Fetch xG from Flashscore (best-effort, non-fatal; backfill pass retries)
        let xgUpdate: Record<string, number> = {}
        if (match.fs_match_id) {
          try {
            const xg = await fetchFsXg(db, match.fs_match_id)
            if (xg) xgUpdate = { ...xg }
          } catch (xgErr) {
            console.warn('[xg] non-fatal:', xgErr)
          }
          xgUpdate = { ...xgUpdate, fs_xg_attempts: (match.fs_xg_attempts ?? 0) + 1 }
        }

        // Update match result + optional xG
        await db.from('matches').update({
          home_score: homeScore,
          away_score: awayScore,
          status: 'FINISHED',
          result_confirmed_at: new Date().toISOString(),
          ...xgUpdate,
        }).eq('id', match.id)

        // Fetch all predictions
        const { data: preds } = await db
          .from('predictions')
          .select('id, user_id, home_score_pred, away_score_pred')
          .eq('match_id', match.id)

        if (preds && preds.length > 0) {
          const result = { home: homeScore, away: awayScore }
          const updates = preds.map(p => {
            const { total, breakdown } = calcPoints(
              { home: p.home_score_pred, away: p.away_score_pred },
              result,
            )
            return { id: p.id, user_id: p.user_id, points: total, breakdown }
          })

          await Promise.all(
            updates.map(({ id, points }) => db.from('predictions').update({ points }).eq('id', id)),
          )

          // Replace scoring_log — delete first to prevent stacking on re-poll
          await db.from('scoring_log').delete().eq('match_id', match.id)
          await db.from('scoring_log').insert(
            updates.map(({ user_id, breakdown, points }) => ({
              match_id: match.id, user_id, points, breakdown,
            })),
          )
          await db.rpc('refresh_mv_player_match_log').then(
            () => {},
            (err: unknown) => console.error('[poll] mv refresh failed:', err),
          )

          if (BOT_TOKEN && GROUP_CHAT_ID) {
            await sendResultMessage(db, match.id, homeScore, awayScore)
          }

          scored++
        }
      } else if (['POSTPONED', 'CANCELLED', 'SUSPENDED'].includes(status)) {
        await db.from('matches').update({ status }).eq('id', match.id)
      }
      // IN_PLAY / PAUSED: leave untouched, will be re-polled in 30 min
    } catch (err) {
      console.error(`[poll] match ${match.id}:`, err)
    }

    await sleep(7000) // respect football-data.org 10 req/min limit
  }

  // ── Flashscore maintenance (cheap, budget-guarded) ──────────────────────────
  if (RAPIDAPI_KEY) {
    try {
      // Retry missing xG for recently finished matches (max 3 attempts each)
      const { data: missingXg } = await db
        .from('matches')
        .select('id, fs_match_id, fs_xg_attempts')
        .eq('status', 'FINISHED')
        .is('home_xg', null)
        .not('fs_match_id', 'is', null)
        .lt('fs_xg_attempts', 3)
        .gte('result_confirmed_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())

      for (const m of missingXg ?? []) {
        const xg = await fetchFsXg(db, m.fs_match_id)
        await db.from('matches').update({ ...(xg ?? {}), fs_xg_attempts: (m.fs_xg_attempts ?? 0) + 1 }).eq('id', m.id)
      }

      // Resolve fs_match_id for newly seeded matches (knockouts) starting within 7 days.
      // Throttled to one fixtures call per 6 h so unresolvable placeholders
      // (TBD team names) can't drain the budget.
      const { data: unresolved } = await db
        .from('matches')
        .select('id, home_team, away_team, kickoff_at')
        .is('fs_match_id', null)
        .gt('kickoff_at', new Date().toISOString())
        .lt('kickoff_at', new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString())

      if (unresolved && unresolved.length > 0) {
        const { count: recentFixtureCalls } = await db
          .from('fs_requests')
          .select('*', { count: 'exact', head: true })
          .gte('called_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
          .like('endpoint', '%tournaments/fixtures%')
        if ((recentFixtureCalls ?? 0) === 0) await resolveFsIds(db, unresolved)
      }
    } catch (fsErr) {
      console.warn('[fs] maintenance non-fatal:', fsErr)
    }
  }

  return new Response(JSON.stringify({ ok: true, polled: (matches ?? []).length, scored }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
