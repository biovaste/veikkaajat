import { getPlayerByName, isWildcard, wildcardCountry } from './players'

export interface MatchForElimination {
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  winner_team: 'HOME' | 'AWAY' | null
  stage: string
  status: string
}

/**
 * English team names eliminated from the tournament — lost a finished knockout-stage
 * match. For a draw on the 90-minute scoreline (decided by extra time/penalties),
 * winner_team tells us who actually advanced; without it we can't tell, so that
 * match is skipped (not yet resolved for elimination purposes).
 */
export function getEliminatedCountries(matches: MatchForElimination[]): Set<string> {
  const eliminated = new Set<string>()
  for (const m of matches) {
    if (m.stage === 'GROUP_STAGE' || m.status !== 'FINISHED') continue
    if (m.home_score === null || m.away_score === null) continue
    if (m.home_score === m.away_score) {
      if (!m.winner_team) continue
      eliminated.add(m.winner_team === 'HOME' ? m.away_team : m.home_team)
    } else {
      eliminated.add(m.home_score > m.away_score ? m.away_team : m.home_team)
    }
  }
  return eliminated
}

/** True if a WORLD_CHAMPION pick (a country name) has been eliminated. */
export function isChampionPickEliminated(betValue: string, eliminated: Set<string>): boolean {
  return eliminated.has(betValue)
}

/**
 * True if a TOP_SCORER pick is "out" — their country is eliminated and they're not
 * currently among the leaders, so the bet has no realistic path to scoring.
 */
export function isScorerPickEliminated(
  betValue: string,
  eliminated: Set<string>,
  leadingScorerNames: Set<string>,
): boolean {
  if (leadingScorerNames.has(betValue)) return false
  const country = isWildcard(betValue) ? wildcardCountry(betValue) : getPlayerByName(betValue)?.country
  if (!country) return false
  return eliminated.has(country)
}
