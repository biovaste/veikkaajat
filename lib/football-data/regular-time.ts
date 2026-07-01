import type { FDMatch } from './client'
import type { ResultBreakdown } from '../scoring/score-and-notify'

export interface RegularTimeScore {
  home: number
  away: number
  winnerTeam?: 'HOME' | 'AWAY'
  breakdown: ResultBreakdown
}

/**
 * football-data.org v4 exposes score.regularTime (the 90-minute score) for
 * knockout matches alongside score.extraTime / score.penalties — so those
 * matches can be auto-scored the same as any other, using regularTime instead
 * of fullTime (which is the final aggregate and would over-count ET/pen goals).
 * Returns null when the 90-minute score isn't available yet (still auto-scores
 * on a later poll — never falls back to guessing from fullTime).
 */
export function pickRegularTimeScore(score: FDMatch['score']): RegularTimeScore | null {
  const duration = score.duration ?? 'REGULAR'
  const isKnockout = duration !== 'REGULAR'
  const source = isKnockout ? score.regularTime : score.fullTime
  if (source?.home == null || source?.away == null) return null

  const winnerTeam = score.winner === 'HOME_TEAM' ? 'HOME' : score.winner === 'AWAY_TEAM' ? 'AWAY' : undefined
  const extraTime = isKnockout && score.extraTime?.home != null && score.extraTime?.away != null
    ? { home: score.extraTime.home, away: score.extraTime.away } : null
  const penalties = duration === 'PENALTY_SHOOTOUT' && score.penalties?.home != null && score.penalties?.away != null
    ? { home: score.penalties.home, away: score.penalties.away } : null

  return { home: source.home, away: source.away, winnerTeam, breakdown: { duration, extraTime, penalties } }
}
