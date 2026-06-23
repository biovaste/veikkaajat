import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getPlayerByName, isWildcard, wildcardCountry } from '@/lib/players'
import { sendMessage } from '@/lib/telegram/bot'

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

  // Send Telegram notification
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_GROUP_CHAT_ID) {
    try {
      const winners = bets.filter(b => {
        // re-derive points inline to build winner list
        if (category === 'WORLD_CHAMPION') return b.bet_value === correct_value
        if (category === 'TOP_SCORER') return b.bet_value === correct_value
        try {
          const picked: string[] = JSON.parse(b.bet_value)
          const correct: string[] = JSON.parse(correct_value)
          return picked.filter(t => correct.includes(t)).length === 2
        } catch { return false }
      })

      const categoryLabel =
        category === 'WORLD_CHAMPION' ? 'Maailmanmestari' :
        category === 'TOP_SCORER' ? 'Maalikuningas' :
        `Ryhmä ${category.replace('GROUP_', '')}`

      const pts =
        category === 'WORLD_CHAMPION' ? 10 :
        category === 'TOP_SCORER' ? 5 : 4

      // Fetch winner names
      const winnerIds = winners.map(b => b.id)
      let winnerText = ''
      if (winnerIds.length > 0) {
        const { data: winnerBets } = await admin
          .from('category_bets')
          .select('user_id, profiles(display_name)')
          .in('id', winnerIds)
        const names = (winnerBets ?? []).map(b => {
          const p = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles
          return (p as { display_name: string } | null)?.display_name ?? '?'
        })
        winnerText = names.length > 0
          ? `\n🏆 Pisteet (+${pts}): ${names.join(', ')}`
          : '\n😔 Ei osuneita veikkauksia.'
      } else {
        winnerText = '\n😔 Ei osuneita veikkauksia.'
      }

      const msg = `🎯 <b>${categoryLabel}</b> pisteytetty!\nOikea vastaus: <b>${correct_value}</b>${winnerText}`
      await sendMessage(process.env.TELEGRAM_GROUP_CHAT_ID, msg)
    } catch (err) {
      console.error('[score-categories] Telegram notify error:', err)
    }
  }

  return NextResponse.json({ scored: bets.length, category })
}
