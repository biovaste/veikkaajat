import { createServiceRoleClient } from '@/lib/supabase/server'
import { fetchMatch } from '@/lib/football-data/client'
import { fetchFsResultsThrottled, fetchFsXg, type FsResultRow } from '@/lib/flashscore/client'
import { scoreMatchAndNotify } from './scoring/score-and-notify'
import { sendMessage } from '@/lib/telegram/bot'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * football-data.org's score.fullTime for a match that went to extra time is the
 * *final* match score (it can include extra-time goals), not the 90-minute score
 * our scoring rules require — and there's no separate 90-minute-only field. So
 * those matches are never auto-scored; flag them and DM the admins to score them
 * manually (with the real 90-minute score) via /admin/matches.
 */
async function flagForManualScoring(
  admin: SupabaseClient,
  match: { id: number; home_team: string; away_team: string },
  winnerTeam: 'HOME' | 'AWAY' | null,
  adminChatIds: string[],
): Promise<void> {
  await admin.from('matches').update({
    went_to_extra_time: true,
    needs_manual_score: true,
    ...(winnerTeam ? { winner_team: winnerTeam } : {}),
  }).eq('id', match.id)

  const text = `⚠️ <b>${match.home_team} – ${match.away_team}</b> päättyi jatkoajalla/rangaistuspotkuilla — ` +
    `pisteytä käsin 90 min tuloksella osoitteessa /admin/matches.`
  for (const chatId of adminChatIds) {
    await sendMessage(chatId, text).catch(() => {})
  }
}

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
    .select('id, external_id, home_team, away_team, kickoff_at, stage, fs_match_id, fs_xg_attempts')
    .is('home_score', null)
    .eq('status', 'SCHEDULED')
    .eq('needs_manual_score', false)
    .lte('kickoff_at', cutoffEarly)
    .gte('kickoff_at', cutoffLate)
    .order('kickoff_at', { ascending: true })

  if (!candidates || candidates.length === 0) return { checked: 0, scored: 0, names: [] }

  const result: PollResult = { checked: candidates.length, scored: 0, names: [] }

  // Flashscore results feed, fetched lazily at most once per run (throttled)
  let fsResults: FsResultRow[] | null | undefined
  // Admin chat ids for manual-scoring alerts, fetched lazily at most once per run
  let adminChatIds: string[] | undefined

  for (const match of candidates) {
    const fd = await fetchMatch(match.external_id).catch(() => null)

    if (fd?.status === 'FINISHED' && fd.score.duration && fd.score.duration !== 'REGULAR') {
      // football-data.org's fullTime is the FINAL match score for ET/penalty games
      // (it can include extra-time goals) — there's no 90-minute-only field, so this
      // can't be auto-scored. Flag for manual scoring instead of guessing.
      const winnerTeam = fd.score.winner === 'HOME_TEAM' ? 'HOME' : fd.score.winner === 'AWAY_TEAM' ? 'AWAY' : null
      if (adminChatIds === undefined) {
        const { data: admins } = await admin
          .from('profiles')
          .select('telegram_chat_id')
          .eq('is_admin', true)
          .not('telegram_chat_id', 'is', null)
        adminChatIds = (admins ?? []).map((a) => a.telegram_chat_id!)
      }
      await flagForManualScoring(admin, match, winnerTeam, adminChatIds)
      continue
    }

    let home_score: number | null = null
    let away_score: number | null = null

    if (fd?.status === 'FINISHED' && fd.score.fullTime.home !== null && fd.score.fullTime.away !== null) {
      home_score = fd.score.fullTime.home
      away_score = fd.score.fullTime.away
    } else if (
      match.fs_match_id &&
      match.stage === 'GROUP_STAGE' &&  // knockout matches can go to ET — only football-data.org tells us
      Date.now() - +new Date(match.kickoff_at) >= 105 * 60 * 1000
    ) {
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

    if (Object.keys(xgUpdate).length > 0) {
      await admin.from('matches').update(xgUpdate).eq('id', match.id)
    }

    await scoreMatchAndNotify(admin, match.id, home_score, away_score)

    result.scored++
    result.names.push(`${match.home_team} – ${match.away_team} ${home_score}–${away_score}`)
  }

  return result
}
