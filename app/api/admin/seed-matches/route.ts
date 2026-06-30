import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { fetchMatches } from '@/lib/football-data/client'

export async function POST(_request: NextRequest) {
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

    const matches = await fetchMatches()

    // Never let an unresolved 'TBD' team name from the API overwrite a name we
    // already resolved — football-data.org has been observed returning TBD for
    // matches it previously reported with real team names.
    const externalIds = matches.map((m) => m.id)
    const { data: existing } = await supabase
      .from('matches')
      .select('external_id, home_team, away_team')
      .in('external_id', externalIds)
    const existingMap = new Map((existing ?? []).map((r) => [r.external_id, r]))

    const rows = matches.map((m) => {
      const prior = existingMap.get(m.id)
      const incomingHome = m.homeTeam.name ?? 'TBD'
      const incomingAway = m.awayTeam.name ?? 'TBD'
      return {
        external_id: m.id,
        stage: m.stage,
        group_name: m.group ?? null,
        match_day: m.matchday ?? null,
        home_team: incomingHome === 'TBD' && prior && prior.home_team !== 'TBD' ? prior.home_team : incomingHome,
        away_team: incomingAway === 'TBD' && prior && prior.away_team !== 'TBD' ? prior.away_team : incomingAway,
        kickoff_at: m.utcDate,
        status: m.status,
      }
    })

    const { error } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'external_id', count: 'exact' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ imported: rows.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[seed-matches]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
