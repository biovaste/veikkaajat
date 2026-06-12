import { createServiceRoleClient } from '@/lib/supabase/server'
import { fetchMatch } from '@/lib/football-data/client'
import { calculatePoints } from '@/lib/scoring/engine'
import { sendResultMessage, type LeaderboardRow, type PlayerInfo } from '@/lib/telegram/notify'
import { fetchFsResultsThrottled, fetchFsXg, type FsResultRow } from '@/lib/flashscore/client'

export interface PollResult {
  checked: number   // matches inspected
  scored: number    // matches newly scored
  names: string[]  // e.g. ["Ranska – Saksa 2-1"]
}

/**
 * Looks for unscored matches that kicked off at least 85 minutes ago,
 * fetches their status from football-data.org, and scores any that are FINISHED.
 * football-data.org's free tier flips FINISHED ~20-35 min after full time, so
 * for matches well past kickoff a Flashscore fallback (near-realtime, budget-
 * guarded) supplies the result — that makes manual /haetulos work right after
 * the final whistle.
 * Safe to call multiple times — already-scored matches are skipped by the DB query.
 */
export async function pollAndScoreFinishedMatches(): Promise<PollResult> {
  const admin = createServiceRoleClient()

  // Matches that should be done but haven't been scored yet
  const cutoffEarly = new Date(Date.now() - 85 * 60 * 1000).toISOString()   // 85 min ago
  const cutoffLate  = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() // 5 h ago (don't go further back)

  const { data: candidates } = await admin
    .from('matches')
    .select('id, external_id, home_team, away_team, kickoff_at, fs_match_id, fs_xg_attempts')
    .is('home_score', null)
    .eq('status', 'SCHEDULED')
    .lte('kickoff_at', cutoffEarly)
    .gte('kickoff_at', cutoffLate)
    .order('kickoff_at', { ascending: true })

  if (!candidates || candidates.length === 0) return { checked: 0, scored: 0, names: [] }

  const result: PollResult = { checked: candidates.length, scored: 0, names: [] }

  // Flashscore results feed, fetched lazily at most once per run (throttled)
  let fsResults: FsResultRow[] | null | undefined

  for (const match of candidates) {
    const fd = await fetchMatch(match.external_id).catch(() => null)

    let home_score: number | null = null
    let away_score: number | null = null

    if (fd?.status === 'FINISHED' && fd.score.fullTime.home !== null && fd.score.fullTime.away !== null) {
      home_score = fd.score.fullTime.home
      away_score = fd.score.fullTime.away
    } else if (match.fs_match_id && Date.now() - +new Date(match.kickoff_at) >= 105 * 60 * 1000) {
      // football-data.org hasn't confirmed yet — check Flashscore's results feed
      if (fsResults === undefined) fsResults = await fetchFsResultsThrottled(admin).catch(() => null)
      const fsRow = fsResults?.find(r => r.match_id === match.fs_match_id)
      if (fsRow?.scores && typeof fsRow.scores.home === 'number' && typeof fsRow.scores.away === 'number') {
        home_score = fsRow.scores.home
        away_score = fsRow.scores.away
      }
    }

    if (home_score === null || away_score === null) continue

    // xG from Flashscore (best-effort, attempts capped — backfill retries via cron)
    let xgUpdate: Record<string, unknown> = {}
    if (match.fs_match_id) {
      try {
        const xg = await fetchFsXg(admin, match.fs_match_id)
        if (xg) xgUpdate = { ...xg }
      } catch { /* non-fatal */ }
      xgUpdate = { ...xgUpdate, fs_xg_attempts: (match.fs_xg_attempts ?? 0) + 1 }
    }

    // Update match
    await admin.from('matches').update({
      home_score, away_score, status: 'FINISHED',
      result_confirmed_at: new Date().toISOString(),
      ...xgUpdate,
    }).eq('id', match.id)

    // Snapshot leaderboard before this match
    const { data: prevLog } = await admin.from('scoring_log').select('user_id, points').neq('match_id', match.id)
    const prevTotals: Record<string, number> = {}
    for (const r of prevLog ?? []) prevTotals[r.user_id] = (prevTotals[r.user_id] ?? 0) + r.points

    // Score predictions
    const { data: players } = await admin.from('profiles').select('id, display_name, telegram_chat_id').order('display_name')
    const { data: predictions } = await admin.from('predictions').select('id, user_id, home_score_pred, away_score_pred').eq('match_id', match.id)

    if (predictions && predictions.length > 0) {
      const updates = predictions.map(p => {
        const { total, breakdown } = calculatePoints(
          { home: p.home_score_pred, away: p.away_score_pred },
          { home: home_score, away: away_score },
        )
        return { id: p.id, user_id: p.user_id, points: total, breakdown }
      })

      await Promise.all(updates.map(({ id, points }) => admin.from('predictions').update({ points }).eq('id', id)))
      await admin.from('scoring_log').delete().eq('match_id', match.id)
      await admin.from('scoring_log').insert(updates.map(({ user_id, points, breakdown }) => ({ match_id: match.id, user_id, points, breakdown })))

      // Build leaderboard
      const newTotals = { ...prevTotals }
      for (const u of updates) newTotals[u.user_id] = (newTotals[u.user_id] ?? 0) + u.points

      const rankMap = (t: Record<string, number>) => {
        const sorted = Object.entries(t).sort((a, b) => b[1] - a[1])
        return Object.fromEntries(sorted.map(([id], i) => [id, i + 1]))
      }
      const prevRanks = rankMap(prevTotals)
      const newRanks  = rankMap(newTotals)

      const leaderboard: LeaderboardRow[] = (players ?? [])
        .filter(p => newTotals[p.id] !== undefined || prevTotals[p.id] !== undefined)
        .sort((a, b) => (newRanks[a.id] ?? 999) - (newRanks[b.id] ?? 999))
        .map(p => ({
          user_id: p.id,
          display_name: p.display_name,
          total: newTotals[p.id] ?? 0,
          prev_position: prevRanks[p.id] ?? (Object.keys(prevRanks).length + 1),
          new_position:  newRanks[p.id]  ?? (Object.keys(newRanks).length + 1),
        }))

      const predRows = updates.map(u => ({
        user_id: u.user_id,
        home_score_pred: predictions.find(p => p.id === u.id)?.home_score_pred ?? 0,
        away_score_pred: predictions.find(p => p.id === u.id)?.away_score_pred ?? 0,
        points: u.points,
      }))

      await sendResultMessage(
        { id: match.id, home_team: match.home_team, away_team: match.away_team, kickoff_at: match.kickoff_at, home_score, away_score },
        predRows,
        (players ?? []) as PlayerInfo[],
        leaderboard,
      ).catch(err => console.error('[poll-and-score] Telegram error:', err))
    }

    result.scored++
    result.names.push(`${match.home_team} – ${match.away_team} ${home_score}–${away_score}`)
  }

  return result
}
