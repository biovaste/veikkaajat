/**
 * Flashscore via RapidAPI (flashscore4) — xG stats + fast match results.
 *
 * HARD LIMIT: 500 requests/month on the subscribed plan. Every call is logged
 * to the fs_requests table and fsFetch() refuses to call once MONTHLY_BUDGET
 * is reached, so a bug can never burn the quota.
 *
 * World Cup 2026 ids (resolved once via /tournaments/ids, stable for the
 * whole tournament): template lvUBR5F8, season 185.
 * matches.fs_match_id holds each match's Flashscore id (pre-mapped for the
 * group stage; knockout matches are resolved from the results feed as they
 * appear).
 *
 * Env: RAPIDAPI_KEY
 */

const BASE = 'https://flashscore4.p.rapidapi.com/api/flashscore/v2'
export const WC_TEMPLATE_ID = 'lvUBR5F8'
export const WC_SEASON_ID = '185'
const MONTHLY_BUDGET = 450 // leave headroom below the 500 hard limit

// Supabase service-role client (untyped in this project)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

async function fsFetch<T>(admin: Admin, endpoint: string): Promise<T | null> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) return null

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { count } = await admin
    .from('fs_requests')
    .select('*', { count: 'exact', head: true })
    .gte('called_at', monthStart.toISOString())
  if ((count ?? 0) >= MONTHLY_BUDGET) {
    console.warn(`[flashscore] monthly request budget reached (${count}) — skipping ${endpoint}`)
    return null
  }
  await admin.from('fs_requests').insert({ endpoint })

  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { 'x-rapidapi-host': 'flashscore4.p.rapidapi.com', 'x-rapidapi-key': key },
  })
  if (!res.ok) {
    console.error(`[flashscore] ${endpoint} → ${res.status}`)
    return null
  }
  return res.json() as Promise<T>
}

export interface FsResultRow {
  match_id: string
  timestamp: number
  home_team: { name: string }
  away_team: { name: string }
  scores: { home: number; away: number } | null
}

/** Finished WC matches with final scores (one request covers all of them). */
export async function fetchFsResults(admin: Admin): Promise<FsResultRow[] | null> {
  const data = await fsFetch<FsResultRow[]>(
    admin,
    `/tournaments/results?tournament_template_id=${WC_TEMPLATE_ID}&season_id=${WC_SEASON_ID}&page=1`,
  )
  return Array.isArray(data) ? data : null
}

/**
 * Like fetchFsResults, but skips the call entirely if one was already made in
 * the last `minMinutesBetween` minutes (e.g. /haetulos pressed repeatedly).
 */
export async function fetchFsResultsThrottled(admin: Admin, minMinutesBetween = 3): Promise<FsResultRow[] | null> {
  const since = new Date(Date.now() - minMinutesBetween * 60_000).toISOString()
  const { count } = await admin
    .from('fs_requests')
    .select('*', { count: 'exact', head: true })
    .gte('called_at', since)
    .like('endpoint', '%tournaments/results%')
  if ((count ?? 0) > 0) return null
  return fetchFsResults(admin)
}

interface FsStatRow { name: string; home_team: number | string; away_team: number | string }

/** xG for a finished match, or null if Flashscore doesn't have it (yet). */
export async function fetchFsXg(
  admin: Admin,
  fsMatchId: string,
): Promise<{ home_xg: number; away_xg: number } | null> {
  const data = await fsFetch<{ match?: FsStatRow[] }>(admin, `/matches/match/stats?match_id=${fsMatchId}`)
  const xg = data?.match?.find((s) => s.name === 'Expected goals (xG)')
  if (!xg || typeof xg.home_team !== 'number' || typeof xg.away_team !== 'number') return null
  return { home_xg: xg.home_team, away_xg: xg.away_team }
}
