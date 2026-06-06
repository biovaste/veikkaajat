import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getPlayerByName, isWildcard, wildcardCountry } from '@/lib/players'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 403 })

  const { category, correct_value } = await request.json()
  if (!category || !correct_value) return NextResponse.json({ error: 'Virheelliset tiedot' }, { status: 400 })

  const admin = createServiceRoleClient()

  // Store correct answer
  await admin
    .from('category_results')
    .upsert({ category, correct_value, scored_at: new Date().toISOString() }, { onConflict: 'category' })

  // Fetch all bets for this category
  const { data: bets } = await admin
    .from('category_bets')
    .select('id, bet_value')
    .eq('category', category)

  if (!bets || bets.length === 0) return NextResponse.json({ scored: 0 })

  for (const bet of bets) {
    let points = 0

    if (category === 'WORLD_CHAMPION') {
      points = bet.bet_value === correct_value ? 10 : 0
    } else if (category === 'TOP_SCORER') {
      if (bet.bet_value === correct_value) {
        // Exact player match
        points = 5
      } else if (isWildcard(bet.bet_value)) {
        // Wildcard scores if: correct answer is also a wildcard for the same country,
        // OR the correct player is NOT in the named list and is from that country.
        const betCountry = wildcardCountry(bet.bet_value)
        if (isWildcard(correct_value)) {
          points = wildcardCountry(correct_value) === betCountry ? 5 : 0
        } else {
          // Correct value is a named player — wildcard only scores if they're NOT in the list
          const correctPlayer = getPlayerByName(correct_value)
          if (!correctPlayer) {
            // Admin typed a custom name not in the list — can't determine country, no points
            points = 0
          } else {
            // Named player in list — wildcard should NOT score (player was available to pick)
            points = 0
          }
        }
      } else {
        points = 0
      }
    } else {
      // Group advance: 4 pts only if BOTH picked teams are correct
      try {
        const picked: string[] = JSON.parse(bet.bet_value)
        const correct: string[] = JSON.parse(correct_value)
        const correctCount = picked.filter(t => correct.includes(t)).length
        points = correctCount === 2 ? 4 : 0
      } catch {
        points = 0
      }
    }

    await admin.from('category_bets').update({ points }).eq('id', bet.id)
  }

  return NextResponse.json({ scored: bets.length, category })
}
