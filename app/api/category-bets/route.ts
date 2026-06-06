import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })

  // User's own bets
  const { data: bets } = await supabase
    .from('category_bets')
    .select('category, bet_value, points')
    .eq('user_id', user.id)

  // Groups, teams, and deadlines from matches table
  const { data: matches } = await supabase
    .from('matches')
    .select('home_team, away_team, group_name, kickoff_at')
    .not('group_name', 'is', null)
    .order('kickoff_at', { ascending: true })

  const groups: Record<string, { teams: string[]; deadline: string }> = {}
  let championDeadline: string | null = null

  for (const m of matches ?? []) {
    if (!m.group_name) continue

    // Overall earliest kickoff = champion bet deadline
    if (!championDeadline) championDeadline = m.kickoff_at

    if (!groups[m.group_name]) {
      // First match of this group = its deadline (already ordered asc)
      groups[m.group_name] = { teams: [], deadline: m.kickoff_at }
    }
    const g = groups[m.group_name]
    if (!g.teams.includes(m.home_team)) g.teams.push(m.home_team)
    if (!g.teams.includes(m.away_team)) g.teams.push(m.away_team)
  }

  // Correct outcomes set by admin
  const { data: results } = await supabase
    .from('category_results')
    .select('category, correct_value')

  const betsMap: Record<string, string> = {}
  const pointsMap: Record<string, number | null> = {}
  for (const b of bets ?? []) {
    betsMap[b.category] = b.bet_value
    pointsMap[b.category] = b.points ?? null
  }

  const resultsMap: Record<string, string> = {}
  for (const r of results ?? []) {
    resultsMap[r.category] = r.correct_value
  }

  return NextResponse.json({ bets: betsMap, points: pointsMap, groups, championDeadline, results: resultsMap })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })

  const { category, bet_value } = await request.json()
  if (!category || !bet_value) return NextResponse.json({ error: 'Virheelliset tiedot' }, { status: 400 })

  // Determine deadline
  let deadline: string | null = null
  if (category === 'WORLD_CHAMPION') {
    const { data } = await supabase
      .from('matches')
      .select('kickoff_at')
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .single()
    deadline = data?.kickoff_at ?? null
  } else {
    // Group bet — category is the group_name e.g. "Group A"
    const { data } = await supabase
      .from('matches')
      .select('kickoff_at')
      .eq('group_name', category)
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .single()
    deadline = data?.kickoff_at ?? null
  }

  if (deadline && new Date(deadline) <= new Date()) {
    return NextResponse.json({ error: 'Veikkausaika on umpeutunut' }, { status: 400 })
  }

  const { error } = await supabase
    .from('category_bets')
    .upsert(
      { user_id: user.id, category, bet_value, points: null },
      { onConflict: 'user_id,category' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
