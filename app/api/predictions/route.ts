import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })

  const { data, error } = await supabase
    .from('predictions')
    .select('*, matches(id, home_team, away_team, kickoff_at, home_score, away_score, status)')
    .eq('user_id', user.id)
    .order('match_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })

    const { match_id, home_score_pred, away_score_pred } = await request.json()

    if (
      typeof match_id !== 'number' ||
      typeof home_score_pred !== 'number' ||
      typeof away_score_pred !== 'number' ||
      home_score_pred < 0 || away_score_pred < 0
    ) {
      return NextResponse.json({ error: 'Virheelliset tiedot' }, { status: 400 })
    }

    // Server-side kickoff lock — defence in depth beyond RLS
    const { data: match } = await supabase
      .from('matches')
      .select('kickoff_at, status')
      .eq('id', match_id)
      .single()

    if (!match) return NextResponse.json({ error: 'Ottelua ei löydy' }, { status: 404 })
    const deadline = new Date(new Date(match.kickoff_at).getTime() - 5 * 60 * 1000)
    if (deadline <= new Date()) {
      return NextResponse.json({ error: 'Veikkausaika on umpeutunut' }, { status: 409 })
    }
    if (match.status === 'CANCELLED' || match.status === 'POSTPONED') {
      return NextResponse.json({ error: 'Ottelu on peruttu tai lykätty' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('predictions')
      .upsert(
        { user_id: user.id, match_id, home_score_pred, away_score_pred },
        { onConflict: 'user_id,match_id' }
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
