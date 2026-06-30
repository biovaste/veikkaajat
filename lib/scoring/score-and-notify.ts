import { SupabaseClient } from '@supabase/supabase-js'
import { calculatePoints } from './engine'
import { sendResultMessage, type LeaderboardRow, type PlayerInfo } from '../telegram/notify'

/**
 * Scores all predictions for a match, updates scoring_log, and sends the
 * Telegram result message. Safe to call multiple times — scoring_log rows
 * are deleted and re-inserted so points don't stack.
 */
export async function scoreMatchAndNotify(
  admin: SupabaseClient,
  matchId: number,
  homeScore: number,
  awayScore: number,
  winnerTeam?: 'HOME' | 'AWAY',
): Promise<{ scored: number; error?: string }> {
  // Snapshot leaderboard BEFORE scoring this match (exclude current match's log)
  const [{ data: prevLog }, { data: catBets }] = await Promise.all([
    admin.from('scoring_log').select('user_id, points, breakdown').neq('match_id', matchId),
    admin.from('category_bets').select('user_id, points'),
  ])

  const prevTotals: Record<string, number> = {}
  const prevExact: Record<string, number> = {}
  for (const r of prevLog ?? []) {
    prevTotals[r.user_id] = (prevTotals[r.user_id] ?? 0) + r.points
    const b = r.breakdown as { result: number; home_goals: number; away_goals: number } | null
    if (b?.result === 3 && b?.home_goals === 1 && b?.away_goals === 1) {
      prevExact[r.user_id] = (prevExact[r.user_id] ?? 0) + 1
    }
  }
  // Include category bet bonus in totals so the leaderboard reflects the real standings
  for (const r of catBets ?? []) {
    if (r.points != null) prevTotals[r.user_id] = (prevTotals[r.user_id] ?? 0) + r.points
  }

  const { data: players } = await admin
    .from('profiles')
    .select('id, display_name, telegram_chat_id')
    .order('display_name')

  // Update match result. winner_team (HOME/AWAY) records who actually advanced for
  // knockout matches decided by extra time/penalties — never fed into point scoring,
  // which always uses the 90-minute home_score/away_score above.
  await admin.from('matches').update({
    home_score: homeScore,
    away_score: awayScore,
    status: 'FINISHED',
    result_confirmed_at: new Date().toISOString(),
    needs_manual_score: false,
    ...(winnerTeam ? { winner_team: winnerTeam } : {}),
  }).eq('id', matchId)

  const { data: predictions, error: predError } = await admin
    .from('predictions')
    .select('id, user_id, home_score_pred, away_score_pred')
    .eq('match_id', matchId)

  if (predError) return { scored: 0, error: predError.message }
  if (!predictions || predictions.length === 0) return { scored: 0 }

  const result = { home: homeScore, away: awayScore }
  const updates = predictions.map((p) => {
    const { total, breakdown } = calculatePoints(
      { home: p.home_score_pred, away: p.away_score_pred },
      result,
    )
    return { id: p.id, user_id: p.user_id, points: total, breakdown }
  })

  await Promise.all(
    updates.map(({ id, points }) => admin.from('predictions').update({ points }).eq('id', id)),
  )

  await admin.from('scoring_log').delete().eq('match_id', matchId)
  await admin.from('scoring_log').insert(
    updates.map(({ user_id, breakdown, points }) => ({
      match_id: matchId, user_id, points, breakdown,
    })),
  )

  // Keep the leaderboard's materialized view in sync (best-effort; the page
  // still works off the underlying tables if a refresh is ever missed).
  const { error: mvError } = await admin.rpc('refresh_mv_player_match_log')
  if (mvError) console.error('[score-and-notify] mv refresh failed:', mvError)

  // Build leaderboard with Tark tie-breaker
  const newTotals: Record<string, number> = { ...prevTotals }
  const newExact: Record<string, number> = { ...prevExact }
  for (const u of updates) {
    newTotals[u.user_id] = (newTotals[u.user_id] ?? 0) + u.points
    const b = u.breakdown as { result: number; home_goals: number; away_goals: number }
    if (b?.result === 3 && b?.home_goals === 1 && b?.away_goals === 1) {
      newExact[u.user_id] = (newExact[u.user_id] ?? 0) + 1
    }
  }

  const rankMap = (totals: Record<string, number>, exact: Record<string, number>) => {
    const sorted = Object.entries(totals).sort(
      (a, b) => b[1] - a[1] || (exact[b[0]] ?? 0) - (exact[a[0]] ?? 0),
    )
    return Object.fromEntries(sorted.map(([id], i) => [id, i + 1]))
  }

  const prevRanks = rankMap(prevTotals, prevExact)
  const newRanks = rankMap(newTotals, newExact)

  const leaderboard: LeaderboardRow[] = (players ?? [])
    .filter((p) => newTotals[p.id] !== undefined || prevTotals[p.id] !== undefined)
    .sort((a, b) => (newRanks[a.id] ?? 999) - (newRanks[b.id] ?? 999))
    .map((p) => ({
      user_id: p.id,
      display_name: p.display_name,
      total: newTotals[p.id] ?? 0,
      prev_position: prevRanks[p.id] ?? (Object.keys(prevRanks).length + 1),
      new_position: newRanks[p.id] ?? (Object.keys(newRanks).length + 1),
    }))

  const { data: matchRow } = await admin
    .from('matches')
    .select('id, home_team, away_team, kickoff_at, home_score, away_score')
    .eq('id', matchId)
    .single()

  if (matchRow && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_GROUP_CHAT_ID) {
    const predRows = updates.map((u) => ({
      user_id: u.user_id,
      home_score_pred: predictions.find((p) => p.id === u.id)?.home_score_pred ?? 0,
      away_score_pred: predictions.find((p) => p.id === u.id)?.away_score_pred ?? 0,
      points: u.points,
    }))
    await sendResultMessage(
      { ...matchRow, home_score: homeScore, away_score: awayScore },
      predRows,
      (players ?? []) as PlayerInfo[],
      leaderboard,
    ).catch((err) => console.error('[score-and-notify] Telegram error:', err))
  }

  return { scored: updates.length }
}
