import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { fetchMatches, type MatchStage } from '@/lib/football-data/client'

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

    const body = await request.json().catch(() => ({}))
    const stage = (body.stage ?? undefined) as MatchStage | undefined

    const matches = await fetchMatches(stage)

    const rows = matches.map((m) => ({
      external_id: m.id,
      stage: m.stage,
      group_name: m.group ?? null,
      match_day: m.matchday ?? null,
      home_team: m.homeTeam.name ?? 'TBD',
      away_team: m.awayTeam.name ?? 'TBD',
      kickoff_at: m.utcDate,
      status: m.status,
    }))

    const { error, count } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'external_id', count: 'exact' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const stages = [...new Set(matches.map((m) => m.stage))]
    return NextResponse.json({ imported: count ?? rows.length, fetched: rows.length, stage: stage ?? 'all', stages })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[seed-matches]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
