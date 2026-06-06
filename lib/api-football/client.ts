/**
 * API-Football (v3.football.api-sports.io) client
 * Used to fetch xG (expected goals) per fixture.
 *
 * Free tier: 100 requests/day. We call this at most once per match (after scoring).
 *
 * Env: API_FOOTBALL_KEY
 */

const BASE_URL = 'https://v3.football.api-sports.io'
const WC_LEAGUE_ID = 1    // FIFA World Cup in API-Football
const WC_SEASON   = 2026

function headers() {
  return { 'x-apisports-key': process.env.API_FOOTBALL_KEY ?? '' }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() })
  if (!res.ok) throw new Error(`API-Football ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

interface FixtureSearchResponse {
  response: Array<{
    fixture: { id: number }
    teams: {
      home: { name: string }
      away: { name: string }
    }
  }>
}

interface StatisticsResponse {
  response: Array<{
    team: { id: number; name: string }
    statistics: Array<{ type: string; value: string | null }>
  }>
}

/**
 * Find the API-Football fixture ID for a World Cup match on a given date.
 * Matches by checking that both team names contain the same substring or vice versa.
 * Returns null if not found or if API key is not configured.
 */
export async function findAfFixtureId(
  kickoffAt: string,
  homeTeam: string,
  awayTeam: string,
): Promise<number | null> {
  if (!process.env.API_FOOTBALL_KEY) return null

  const date = kickoffAt.slice(0, 10) // YYYY-MM-DD
  const data = await get<FixtureSearchResponse>(
    `/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&date=${date}`,
  )

  if (!data.response?.length) return null

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const homeN = normalize(homeTeam)
  const awayN = normalize(awayTeam)

  for (const f of data.response) {
    const fHomeN = normalize(f.teams.home.name)
    const fAwayN = normalize(f.teams.away.name)
    // Accept if either name contains the other (handles abbreviations like "Korea Republic" vs "South Korea")
    const homeMatch = fHomeN.includes(homeN) || homeN.includes(fHomeN)
    const awayMatch = fAwayN.includes(awayN) || awayN.includes(fAwayN)
    if (homeMatch && awayMatch) return f.fixture.id
  }

  return null
}

/**
 * Fetch xG for a fixture from API-Football.
 * Returns { home_xg, away_xg } or null if unavailable.
 */
export async function fetchFixtureXg(
  afFixtureId: number,
): Promise<{ home_xg: number; away_xg: number } | null> {
  if (!process.env.API_FOOTBALL_KEY) return null

  const data = await get<StatisticsResponse>(`/fixtures/statistics?fixture=${afFixtureId}`)

  if (!data.response || data.response.length < 2) return null

  const getXg = (teamStats: StatisticsResponse['response'][number]) => {
    const stat = teamStats.statistics.find(
      s => s.type === 'Expected Goals' || s.type === 'expected_goals',
    )
    if (!stat?.value) return null
    const n = parseFloat(String(stat.value))
    return isNaN(n) ? null : n
  }

  const home_xg = getXg(data.response[0])
  const away_xg = getXg(data.response[1])

  if (home_xg === null || away_xg === null) return null
  return { home_xg, away_xg }
}
