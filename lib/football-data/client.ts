const BASE_URL = 'https://api.football-data.org/v4'

async function fetchFD<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY! },
    next: { revalidate: 0 },
  })
  if (!res.ok) {
    throw new Error(`football-data.org ${path} → ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export interface FDMatch {
  id: number
  utcDate: string
  status: string
  stage: string
  group: string | null
  matchday: number | null
  homeTeam: { name: string }
  awayTeam: { name: string }
  score: {
    fullTime: { home: number | null; away: number | null }
  }
}

interface FDMatchesResponse {
  matches: FDMatch[]
}

export type MatchStage =
  | 'GROUP_STAGE'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL'

export async function fetchMatches(stage?: MatchStage): Promise<FDMatch[]> {
  const query = stage ? `?stage=${stage}` : ''
  const data = await fetchFD<FDMatchesResponse>(`/competitions/WC/matches${query}`)
  return data.matches
}

export async function fetchMatch(externalId: number): Promise<FDMatch> {
  const data = await fetchFD<{ match: FDMatch }>(`/matches/${externalId}`)
  return data.match
}

export interface FDScorer {
  player: { name: string }
  team: { name: string }
  goals: number
  assists: number | null
}

export async function fetchTopScorers(limit = 10): Promise<FDScorer[]> {
  const data = await fetchFD<{ scorers: FDScorer[] }>(`/competitions/WC/scorers?limit=${limit}`)
  return data.scorers
}
