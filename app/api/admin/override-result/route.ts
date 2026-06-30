import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { fetchFsXg } from '@/lib/flashscore/client'
import { scoreMatchAndNotify } from '@/lib/scoring/score-and-notify'

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

    const { match_id, home_score, away_score, winner_team } = await request.json()

    if (
      typeof match_id !== 'number' ||
      typeof home_score !== 'number' ||
      typeof away_score !== 'number' ||
      home_score < 0 || away_score < 0 ||
      (winner_team !== undefined && winner_team !== 'HOME' && winner_team !== 'AWAY')
    ) {
      return NextResponse.json({ error: 'Virheelliset tiedot' }, { status: 400 })
    }

    const admin = createServiceRoleClient()

    // A knockout-stage draw needs winner_team to record who actually advanced
    // (the UI enforces this too, but that's client-side only — enforce it here
    // as well so a direct API call can't leave a match "finished" with both
    // teams looking eliminated in the bracket/elimination views).
    if (home_score === away_score && !winner_team) {
      const { data: matchStage } = await admin.from('matches').select('stage').eq('id', match_id).single()
      if (matchStage && matchStage.stage !== 'GROUP_STAGE') {
        return NextResponse.json({ error: 'Jatkopeli päättyi tasan — valitse kuka eteni jatkoon' }, { status: 400 })
      }
    }

    // Fetch xG from Flashscore (best-effort; skipped if already stored)
    try {
      const { data: matchMeta } = await admin
        .from('matches')
        .select('fs_match_id, fs_xg_attempts, home_xg')
        .eq('id', match_id)
        .single()

      if (matchMeta?.fs_match_id && matchMeta.home_xg === null) {
        const xgData = await fetchFsXg(admin, matchMeta.fs_match_id)
        await admin
          .from('matches')
          .update({ ...(xgData ?? {}), fs_xg_attempts: (matchMeta.fs_xg_attempts ?? 0) + 1 })
          .eq('id', match_id)
      }
    } catch (xgErr) {
      console.warn('[override-result] xG fetch failed (non-fatal):', xgErr)
    }

    const { scored, error } = await scoreMatchAndNotify(admin, match_id, home_score, away_score, winner_team)
    if (error) return NextResponse.json({ error }, { status: 500 })

    return NextResponse.json({ scored, match_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[override-result]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
