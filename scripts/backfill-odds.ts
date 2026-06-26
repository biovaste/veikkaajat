/**
 * Backfill pre-match odds from TheRundown into the matches table.
 *
 * Usage:
 *   npx tsx scripts/backfill-odds.ts [--dry-run]
 *
 * Fetches odds for every past match (kickoff_msg_sent = true, home_odds IS NULL)
 * by calling TheRundown once per unique UTC date. Updates home_odds, draw_odds,
 * away_odds on matched rows. Prints a summary of hits and misses.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !RAPIDAPI_KEY) {
  console.error('Missing required env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAPIDAPI_KEY)')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const TR_AFFILIATE_PRIORITY = [19, 23, 6, 28, 4, 11, 22, 21, 2, 12, 14, 16, 27, 25, 26]

const NAME_ALIASES: Record<string, string> = {
  'czechia': 'czech republic',
  'usa': 'united states',
  'republic of ireland': 'ireland',
  'dr congo': 'congo dr',
  'cape verde islands': 'cape verde',
  'bosnia-herzegovina': 'bosnia and herzegovina',
  'turkiye': 'turkey',
}

function normalizeName(s: string): string {
  const n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  return NAME_ALIASES[n] ?? n
}

function americanToDecimal(a: number): number {
  return a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1
}

interface MatchOdds { homeWin: number; draw: number; awayWin: number }

async function fetchDayOdds(dateStr: string): Promise<Map<string, MatchOdds>> {
  const result = new Map<string, MatchOdds>()
  const res = await fetch(
    `https://therundown-therundown-v1.p.rapidapi.com/sports/18/events/${dateStr}`,
    { headers: { 'x-rapidapi-host': 'therundown-therundown-v1.p.rapidapi.com', 'x-rapidapi-key': RAPIDAPI_KEY } },
  )
  if (!res.ok) {
    console.warn(`  [TheRundown] ${dateStr} → HTTP ${res.status}`)
    return result
  }
  const data = await res.json() as { events?: unknown[] }
  for (const event of (data.events ?? []) as any[]) {
    const away = event.teams?.[0]?.name as string
    const home = event.teams?.[1]?.name as string
    if (!away || !home || !event.lines) continue
    for (const affId of TR_AFFILIATE_PRIORITY) {
      const ml = event.lines[String(affId)]?.moneyline
      if (!ml) continue
      const { moneyline_home: mh, moneyline_away: ma, moneyline_draw: md } = ml
      if (Math.abs(mh) < 0.01 || Math.abs(ma) < 0.01 || Math.abs(md) < 0.01) continue
      result.set(`${normalizeName(home)}|${normalizeName(away)}`, {
        homeWin: +americanToDecimal(mh).toFixed(2),
        draw: +americanToDecimal(md).toFixed(2),
        awayWin: +americanToDecimal(ma).toFixed(2),
      })
      break
    }
  }
  return result
}

async function main() {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: matches, error } = await db
    .from('matches')
    .select('id, home_team, away_team, kickoff_at')
    .eq('kickoff_msg_sent', true)
    .is('home_odds', null)
    .order('kickoff_at')

  if (error) { console.error('DB error:', error); process.exit(1) }
  if (!matches?.length) { console.log('No matches need backfilling.'); return }

  console.log(`Found ${matches.length} matches missing odds across ${new Set(matches.map(m => m.kickoff_at.slice(0, 10))).size} dates.`)
  if (DRY_RUN) console.log('DRY RUN — no DB writes.\n')

  // Group by date
  const byDate = new Map<string, typeof matches>()
  for (const m of matches) {
    const d = m.kickoff_at.slice(0, 10)
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(m)
  }

  let hits = 0, misses = 0

  for (const [date, dayMatches] of byDate) {
    console.log(`\n${date} (${dayMatches.length} matches)`)
    const oddsMap = await fetchDayOdds(date)
    console.log(`  TheRundown returned ${oddsMap.size} events`)

    for (const match of dayMatches) {
      const key = `${normalizeName(match.home_team)}|${normalizeName(match.away_team)}`
      const odds = oddsMap.get(key)

      if (!odds) {
        console.log(`  ✗ MISS  ${match.home_team} vs ${match.away_team}  (key: "${key}")`)
        misses++
        continue
      }

      console.log(`  ✓ HIT   ${match.home_team} vs ${match.away_team}  K ${odds.homeWin} · T ${odds.draw} · V ${odds.awayWin}`)
      hits++

      if (!DRY_RUN) {
        const { error: upErr } = await db
          .from('matches')
          .update({ home_odds: odds.homeWin, draw_odds: odds.draw, away_odds: odds.awayWin })
          .eq('id', match.id)
        if (upErr) console.error(`    DB update error:`, upErr)
      }
    }

    // Respect TheRundown rate limits — brief pause between date requests
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\nDone. ${hits} updated, ${misses} missing odds.`)
  if (misses > 0) {
    console.log('\nMisses likely due to team name mismatches. Check the key printed above against TheRundown team names.')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
