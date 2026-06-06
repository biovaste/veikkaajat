// Supabase Edge Function: poll-match-results
// Runs every 30 minutes via pg_cron.
// - Finds finished matches and fetches results from football-data.org
// - Scores predictions and updates the DB
// - Sends Telegram result message with leaderboard and position changes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FD_API_KEY = Deno.env.get('FOOTBALL_DATA_API_KEY')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const GROUP_CHAT_ID = Deno.env.get('TELEGRAM_GROUP_CHAT_ID')!

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`

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
  const homePts = pred.home === result.home ? 1 : 0
  const awayPts = pred.away === result.away ? 1 : 0
  return { total: resultPts + homePts + awayPts, breakdown: { result: resultPts, home_goals: homePts, away_goals: awayPts } }
}

async function buildAndSendResultMessage(
  db: ReturnType<typeof createClient>,
  matchId: number,
  homeScore: number,
  awayScore: number,
) {
  // Fetch match info
  const { data: match } = await db
    .from('matches')
    .select('home_team, away_team')
    .eq('id', matchId)
    .single()
  if (!match) return

  // Fetch all predictions with points
  const { data: preds } = await db
    .from('predictions')
    .select('user_id, home_score_pred, away_score_pred, points')
    .eq('match_id', matchId)

  // Fetch all players
  const { data: players } = await db
    .from('profiles')
    .select('id, display_name')

  // Current leaderboard totals (after scoring)
  const { data: log } = await db
    .from('scoring_log')
    .select('user_id, points, match_id')

  const prevTotals: Record<string, number> = {}
  const newTotals: Record<string, number> = {}
  for (const r of log ?? []) {
    if (r.match_id !== matchId) {
      prevTotals[r.user_id] = (prevTotals[r.user_id] ?? 0) + r.points
    }
    newTotals[r.user_id] = (newTotals[r.user_id] ?? 0) + r.points
  }

  const rankMap = (totals: Record<string, number>) => {
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
    return Object.fromEntries(sorted.map(([id], i) => [id, i + 1]))
  }
  const prevRanks = rankMap(prevTotals)
  const newRanks = rankMap(newTotals)

  const nameMap = Object.fromEntries((players ?? []).map((p) => [p.id, p.display_name]))
  const predMap = Object.fromEntries((preds ?? []).map((p) => [p.user_id, p]))

  // Sort predictions by points desc
  const sortedPreds = [...(preds ?? [])].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))

  let text = `⚽ <b>${match.home_team} – ${match.away_team}</b>\n`
  text += `Tulos: <b>${homeScore}–${awayScore}</b>\n\n`
  text += '<b>Pisteet:</b>\n'

  for (const pred of sortedPreds) {
    const name = nameMap[pred.user_id] ?? '?'
    text += `${name}: ${pred.points ?? 0} p (veikkaus ${pred.home_score_pred}–${pred.away_score_pred})\n`
  }

  const predictedIds = new Set((preds ?? []).map((p) => p.user_id))
  const missed = (players ?? []).filter((p) => !predictedIds.has(p.id))
  for (const p of missed) {
    text += `${p.display_name}: – (ei veikkaus)\n`
  }

  text += '\n<b>Sarjataulukko:</b>\n'
  const leaderboard = (players ?? [])
    .filter((p) => newTotals[p.id] !== undefined)
    .sort((a, b) => (newRanks[a.id] ?? 999) - (newRanks[b.id] ?? 999))

  for (const p of leaderboard) {
    const delta = (prevRanks[p.id] ?? newRanks[p.id]) - (newRanks[p.id] ?? 1)
    const arrow = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : '→'
    const pts = newTotals[p.id] ?? 0
    const matchPts = predMap[p.id]?.points ?? 0
    text += `${newRanks[p.id]}. ${p.display_name} — ${pts} p <i>(${arrow}, +${matchPts})</i>\n`
  }

  await tgSend(GROUP_CHAT_ID, text)
}

Deno.serve(async (_req) => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Find matches that should be finished but haven't been scored yet
  // Poll matches that kicked off > 105 min ago (90 min + 15 min buffer)
  const pollBefore = new Date(Date.now() - 105 * 60 * 1000)

  const { data: matches } = await db
    .from('matches')
    .select('id, external_id, home_team, away_team')
    .in('status', ['SCHEDULED', 'IN_PLAY', 'PAUSED', 'TIMED'])
    .is('home_score', null)
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
        { headers: { 'X-Auth-Token': FD_API_KEY }, next: { revalidate: 0 } } as RequestInit,
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

        // Update match
        await db.from('matches').update({
          home_score: homeScore,
          away_score: awayScore,
          status: 'FINISHED',
          result_confirmed_at: new Date().toISOString(),
        }).eq('id', match.id)

        // Score predictions
        const { data: preds } = await db
          .from('predictions')
          .select('id, user_id, home_score_pred, away_score_pred')
          .eq('match_id', match.id)

        if (preds && preds.length > 0) {
          const result = { home: homeScore, away: awayScore }
          const updates = preds.map((p) => {
            const { total, breakdown } = calcPoints(
              { home: p.home_score_pred, away: p.away_score_pred },
              result,
            )
            return { id: p.id, user_id: p.user_id, points: total, breakdown }
          })

          await Promise.all(
            updates.map(({ id, points }) =>
              db.from('predictions').update({ points }).eq('id', id)
            ),
          )

          await db.from('scoring_log').insert(
            updates.map(({ user_id, breakdown, points }) => ({
              match_id: match.id,
              user_id,
              points,
              breakdown,
            })),
          )

          // Send Telegram result message
          if (BOT_TOKEN && GROUP_CHAT_ID) {
            await buildAndSendResultMessage(db, match.id, homeScore, awayScore)
          }
        }

        scored++
      } else if (['POSTPONED', 'CANCELLED', 'SUSPENDED'].includes(status)) {
        await db.from('matches').update({ status }).eq('id', match.id)
      }
    } catch (err) {
      console.error(`[poll] match ${match.id}:`, err)
    }

    await sleep(7000) // respect 10 req/min limit
  }

  return new Response(JSON.stringify({ ok: true, polled: matches.length, scored }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
