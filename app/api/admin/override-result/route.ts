import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { calculatePoints } from '@/lib/scoring/engine'
import { sendResultMessage, type LeaderboardRow, type PlayerInfo } from '@/lib/telegram/notify'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    if (!profile?.is_admin) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 403 })

    const { match_id, home_score, away_score } = await request.json()

    if (
      typeof match_id !== 'number' ||
      typeof home_score !== 'number' ||
      typeof away_score !== 'number' ||
      home_score < 0 || away_score < 0
    ) {
      return NextResponse.json({ error: 'Virheelliset tiedot' }, { status: 400 })
    }

    const admin = createServiceRoleClient()

    // Snapshot leaderboard BEFORE scoring this match
    const { data: prevLog } = await admin
      .from('scoring_log')
      .select('user_id, points')
      .neq('match_id', match_id)

    const prevTotals: Record<string, number> = {}
    for (const r of prevLog ?? []) {
      prevTotals[r.user_id] = (prevTotals[r.user_id] ?? 0) + r.points
    }

    // Fetch all players
    const { data: players } = await admin
      .from('profiles')
      .select('id, display_name, telegram_chat_id')
      .order('display_name')

    // Update match result (admin RLS policy allows this)
    const { error: matchError } = await supabase
      .from('matches')
      .update({
        home_score,
        away_score,
        status: 'FINISHED',
        result_confirmed_at: new Date().toISOString(),
      })
      .eq('id', match_id)

    if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 })

    // Fetch all predictions for this match (service role — sees all users' rows)
    const { data: predictions, error: predError } = await admin
      .from('predictions')
      .select('id, user_id, home_score_pred, away_score_pred')
      .eq('match_id', match_id)

    if (predError) return NextResponse.json({ error: predError.message }, { status: 500 })
    if (!predictions || predictions.length === 0) {
      return NextResponse.json({ scored: 0, match_id })
    }

    // Score each prediction
    const result = { home: home_score, away: away_score }
    const updates = predictions.map((p) => {
      const { total, breakdown } = calculatePoints(
        { home: p.home_score_pred, away: p.away_score_pred },
        result
      )
      return { id: p.id, user_id: p.user_id, points: total, breakdown }
    })

    // Bulk update predictions.points (service role — writes to other users' rows)
    const updateErrors = await Promise.all(
      updates.map(({ id, points }) =>
        admin.from('predictions').update({ points }).eq('id', id)
      )
    )
    const updateError = updateErrors.find((r) => r.error)?.error
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Replace scoring_log rows for this match (delete old, insert new)
    await admin.from('scoring_log').delete().eq('match_id', match_id)

    const { error: logError } = await admin
      .from('scoring_log')
      .insert(
        updates.map(({ user_id, breakdown, points }) => ({
          match_id,
          user_id,
          points,
          breakdown,
        }))
      )

    if (logError) console.error('[override-result] scoring_log insert failed:', logError.message)

    // Build new leaderboard for Telegram message
    const newTotals: Record<string, number> = { ...prevTotals }
    for (const u of updates) {
      newTotals[u.user_id] = (newTotals[u.user_id] ?? 0) + u.points
    }

    // Rank helpers
    const rankMap = (totals: Record<string, number>) => {
      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
      return Object.fromEntries(sorted.map(([id], i) => [id, i + 1]))
    }

    const prevRanks = rankMap(prevTotals)
    const newRanks = rankMap(newTotals)

    // All players sorted by new rank for the leaderboard
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

    // Fetch match info for the message
    const { data: matchRow } = await admin
      .from('matches')
      .select('id, home_team, away_team, kickoff_at, home_score, away_score')
      .eq('id', match_id)
      .single()

    // Send Telegram message (non-blocking — don't fail the API response on Telegram errors)
    if (matchRow && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_GROUP_CHAT_ID) {
      const predRows = updates.map((u) => ({
        user_id: u.user_id,
        home_score_pred: predictions.find((p) => p.id === u.id)?.home_score_pred ?? 0,
        away_score_pred: predictions.find((p) => p.id === u.id)?.away_score_pred ?? 0,
        points: u.points,
      }))
      sendResultMessage(
        { ...matchRow, home_score, away_score },
        predRows,
        (players ?? []) as PlayerInfo[],
        leaderboard,
      ).catch((err) => console.error('[override-result] Telegram error:', err))
    }

    return NextResponse.json({ scored: updates.length, match_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[override-result]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
