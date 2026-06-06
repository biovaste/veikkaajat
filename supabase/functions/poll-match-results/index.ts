// Supabase Edge Function: poll-match-results
// Runs every 30 minutes via pg_cron.
// - Finds matches that should be finished and fetches results from football-data.org
// - Scores all predictions, updates scoring_log (replacing previous entries to avoid stacking)
// - Fetches xG from API-Football and stores it on the match row
// - Sends Telegram result message with leaderboard and position changes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FD_API_KEY          = Deno.env.get('FOOTBALL_DATA_API_KEY')!
const BOT_TOKEN           = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const GROUP_CHAT_ID       = Deno.env.get('TELEGRAM_GROUP_CHAT_ID')!
const AF_API_KEY          = Deno.env.get('API_FOOTBALL_KEY') ?? ''  // optional

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

// ─── xG from API-Football ────────────────────────────────────────────────────

const AF_BASE       = 'https://v3.football.api-sports.io'
const WC_LEAGUE_ID  = 1
const WC_SEASON     = 2026

function normalize(s: string) { return s.toLowerCase().replace(/[^a-z]/g, '') }

async function findAfFixtureId(kickoffAt: string, homeTeam: string, awayTeam: string): Promise<number | null> {
  if (!AF_API_KEY) return null
  const date = kickoffAt.slice(0, 10)
  const res = await fetch(`${AF_BASE}/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&date=${date}`, {
    headers: { 'x-apisports-key': AF_API_KEY },
  })
  if (!res.ok) return null
  const data = await res.json()
  const homeN = normalize(homeTeam)
  const awayN = normalize(awayTeam)
  for (const f of data.response ?? []) {
    const fH = normalize(f.teams.home.name)
    const fA = normalize(f.teams.away.name)
    if ((fH.includes(homeN) || homeN.includes(fH)) && (fA.includes(awayN) || awayN.includes(fA))) {
      return f.fixture.id as number
    }
  }
  return null
}

async function fetchXg(afId: number): Promise<{ home_xg: number; away_xg: number } | null> {
  if (!AF_API_KEY) return null
  const res = await fetch(`${AF_BASE}/fixtures/statistics?fixture=${afId}`, {
    headers: { 'x-apisports-key': AF_API_KEY },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.response || data.response.length < 2) return null
  const getXg = (team: { statistics: { type: string; value: string | null }[] }) => {
    const stat = team.statistics.find((s: { type: string }) =>
      s.type === 'Expected Goals' || s.type === 'expected_goals'
    )
    if (!stat?.value) return null
    const n = parseFloat(String(stat.value))
    return isNaN(n) ? null : n
  }
  const home_xg = getXg(data.response[0])
  const away_xg = getXg(data.response[1])
  if (home_xg === null || away_xg === null) return null
  return { home_xg, away_xg }
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

  const [{ data: preds }, { data: players }, { data: log }] = await Promise.all([
    db.from('predictions').select('user_id, home_score_pred, away_score_pred, points').eq('match_id', matchId),
    db.from('profiles').select('id, display_name'),
    db.from('scoring_log').select('user_id, points, match_id'),
  ])

  const prevTotals: Record<string, number> = {}
  const newTotals: Record<string, number> = {}
  for (const r of log ?? []) {
    if (r.match_id !== matchId) prevTotals[r.user_id] = (prevTotals[r.user_id] ?? 0) + r.points
    newTotals[r.user_id] = (newTotals[r.user_id] ?? 0) + r.points
  }

  const rankMap = (totals: Record<string, number>) => {
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
    return Object.fromEntries(sorted.map(([id], i) => [id, i + 1]))
  }
  const prevRanks = rankMap(prevTotals)
  const newRanks  = rankMap(newTotals)
  const nameMap   = Object.fromEntries((players ?? []).map(p => [p.id, p.display_name]))
  const predMap   = Object.fromEntries((preds ?? []).map(p => [p.user_id, p]))
  const sortedPreds = [...(preds ?? [])].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))

  let text = `⚽ <b>${match.home_team} – ${match.away_team}</b>\n`
  text += `Tulos: <b>${homeScore}–${awayScore}</b>\n\n<b>Pisteet:</b>\n`
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
    .select('id, external_id, home_team, away_team, kickoff_at, af_fixture_id')
    .in('status', ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED'])
    .lt('kickoff_at', pollBefore.toISOString())
    .limit(10)

  if (!matches || matches.length === 0) {
    return new Response(JSON.stringify({ ok: true, polled: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let scored = 0

  for (const match of matches) {
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
        const homeScore: number = fdMatch.score?.fullTime?.home ?? null
        const awayScore: number = fdMatch.score?.fullTime?.away ?? null

        if (homeScore === null || awayScore === null) {
          await sleep(7000)
          continue
        }

        // Fetch xG from API-Football (best-effort, non-fatal)
        let xgUpdate: Record<string, number> = {}
        if (AF_API_KEY) {
          try {
            let afId: number | null = match.af_fixture_id ?? null
            if (!afId) afId = await findAfFixtureId(match.kickoff_at, match.home_team, match.away_team)
            if (afId) {
              const xg = await fetchXg(afId)
              if (xg) xgUpdate = { af_fixture_id: afId, ...xg }
              else if (afId !== match.af_fixture_id) xgUpdate = { af_fixture_id: afId }
            }
          } catch (xgErr) {
            console.warn('[xg] non-fatal:', xgErr)
          }
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

  return new Response(JSON.stringify({ ok: true, polled: matches.length, scored }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
