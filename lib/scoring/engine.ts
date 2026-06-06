export interface ScoreInput {
  home: number
  away: number
}

export interface ScoreBreakdown {
  result: number    // 3 if correct W/D/L, else 0
  home_goals: number  // 1 if correct home tally, else 0
  away_goals: number  // 1 if correct away tally, else 0
}

export interface ScoreResult {
  total: number
  breakdown: ScoreBreakdown
}

// Scoring is based on full-time score only (90 min).
// Extra time and penalties are ignored for knockout matches.
export function calculatePoints(pred: ScoreInput, result: ScoreInput): ScoreResult {
  const predOutcome = Math.sign(pred.home - pred.away)    // -1 away win, 0 draw, 1 home win
  const realOutcome = Math.sign(result.home - result.away)

  const resultPoints = predOutcome === realOutcome ? 3 : 0
  const homeGoalPoints = pred.home === result.home ? 1 : 0
  const awayGoalPoints = pred.away === result.away ? 1 : 0

  return {
    total: resultPoints + homeGoalPoints + awayGoalPoints,
    breakdown: {
      result: resultPoints,
      home_goals: homeGoalPoints,
      away_goals: awayGoalPoints,
    },
  }
}
