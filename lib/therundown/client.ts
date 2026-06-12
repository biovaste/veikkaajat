// TheRundown odds client — FIFA World Cup 1X2 moneyline odds
// Sport ID 18 = FIFA. RapidAPI host: therundown-therundown-v1.p.rapidapi.com
// Same RAPIDAPI_KEY as Flashscore (different host header).

const BASE = 'https://therundown-therundown-v1.p.rapidapi.com'
const FIFA_SPORT_ID = 18

// Affiliate priority: prefer sharper/more reliable books first
const AFFILIATE_PRIORITY = [19, 23, 6, 28, 4, 11, 22, 21, 2, 12, 14, 16, 27, 25, 26]

export interface MatchOdds {
  homeWin: number  // decimal odds
  draw: number
  awayWin: number
  affiliate: string
}

function americanToDecimal(american: number): number {
  if (american > 0) return american / 100 + 1
  return 100 / Math.abs(american) + 1
}

function isSentinel(v: number): boolean {
  return Math.abs(v) < 0.01
}

function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Returns odds keyed by "homeTeam|awayTeam" using normalized names
export async function fetchDayOdds(
  dateStr: string, // YYYY-MM-DD
): Promise<Map<string, MatchOdds>> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw new Error('RAPIDAPI_KEY not set')

  const url = `${BASE}/sports/${FIFA_SPORT_ID}/events/${dateStr}`
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-host': 'therundown-therundown-v1.p.rapidapi.com',
      'x-rapidapi-key': key,
    },
  })
  if (!res.ok) throw new Error(`TheRundown ${res.status}: ${await res.text()}`)

  const data = await res.json()
  const result = new Map<string, MatchOdds>()

  for (const event of data.events ?? []) {
    const away = event.teams?.[0]?.name as string
    const home = event.teams?.[1]?.name as string
    if (!away || !home || !event.lines) continue

    // Find best affiliate with actual moneyline odds
    let odds: MatchOdds | null = null
    for (const affId of AFFILIATE_PRIORITY) {
      const line = event.lines[String(affId)]
      if (!line?.moneyline) continue
      const { moneyline_home, moneyline_away, moneyline_draw } = line.moneyline
      if (isSentinel(moneyline_home) || isSentinel(moneyline_away) || isSentinel(moneyline_draw)) continue
      odds = {
        homeWin: +americanToDecimal(moneyline_home).toFixed(2),
        draw: +americanToDecimal(moneyline_draw).toFixed(2),
        awayWin: +americanToDecimal(moneyline_away).toFixed(2),
        affiliate: line.affiliate?.affiliate_name ?? String(affId),
      }
      break
    }
    if (!odds) continue

    const key = `${normalizeName(home)}|${normalizeName(away)}`
    result.set(key, odds)
  }

  return result
}

// Look up odds for a specific match using home/away team names from our DB.
// Returns null if no odds found (API miss, pre-match window not yet open, etc.)
export function lookupOdds(
  oddsMap: Map<string, MatchOdds>,
  homeTeam: string,
  awayTeam: string,
): MatchOdds | null {
  const key = `${normalizeName(homeTeam)}|${normalizeName(awayTeam)}`
  return oddsMap.get(key) ?? null
}

export function formatOddsLine(odds: MatchOdds): string {
  return `📊 Kertoimet: K ${odds.homeWin} · T ${odds.draw} · V ${odds.awayWin}`
}
