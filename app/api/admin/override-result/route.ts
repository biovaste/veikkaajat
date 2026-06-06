import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { calculatePoints } from '@/lib/scoring/engine'

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

    // Fetch all predictions for this match
    const { data: predictions, error: predError } = await supabase
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

    // Bulk update predictions.points using service role (bypasses RLS for writes from other users)
    const admin = createServiceRoleClient()

    // Update each prediction's points individually (no bulk update on arbitrary rows in postgrest)
    const updateErrors = await Promise.all(
      updates.map(({ id, points }) =>
        admin.from('predictions').update({ points }).eq('id', id)
      )
    )
    const updateError = updateErrors.find((r) => r.error)?.error

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Insert scoring_log rows
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

    return NextResponse.json({ scored: updates.length, match_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[override-result]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
