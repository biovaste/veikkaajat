import { describe, it, expect } from 'vitest'
import { calculatePoints } from './engine'

describe('calculatePoints', () => {
  it('awards 5 points for exact score (home win)', () => {
    const r = calculatePoints({ home: 2, away: 1 }, { home: 2, away: 1 })
    expect(r.total).toBe(5)
    expect(r.breakdown).toEqual({ result: 3, home_goals: 1, away_goals: 1 })
  })

  it('awards 5 points for exact score (draw)', () => {
    const r = calculatePoints({ home: 1, away: 1 }, { home: 1, away: 1 })
    expect(r.total).toBe(5)
  })

  it('awards 5 points for exact score (away win)', () => {
    const r = calculatePoints({ home: 0, away: 3 }, { home: 0, away: 3 })
    expect(r.total).toBe(5)
  })

  it('awards 4 points: correct result + one correct tally', () => {
    // correct home win + correct home goals, wrong away goals
    const r = calculatePoints({ home: 2, away: 0 }, { home: 2, away: 1 })
    expect(r.total).toBe(4)
    expect(r.breakdown).toEqual({ result: 3, home_goals: 1, away_goals: 0 })
  })

  it('awards 3 points: correct result only', () => {
    const r = calculatePoints({ home: 3, away: 1 }, { home: 2, away: 0 })
    expect(r.total).toBe(3)
    expect(r.breakdown).toEqual({ result: 3, home_goals: 0, away_goals: 0 })
  })

  it('awards 1 point: wrong result but one correct tally', () => {
    // predicted draw, actual home win — but home goals correct
    const r = calculatePoints({ home: 1, away: 1 }, { home: 1, away: 0 })
    expect(r.total).toBe(1)
    expect(r.breakdown).toEqual({ result: 0, home_goals: 1, away_goals: 0 })
  })

  it('awards 0 points for completely wrong prediction', () => {
    const r = calculatePoints({ home: 0, away: 0 }, { home: 3, away: 2 })
    expect(r.total).toBe(0)
    expect(r.breakdown).toEqual({ result: 0, home_goals: 0, away_goals: 0 })
  })

  it('correctly identifies draw vs win (0-0 vs 1-0)', () => {
    // predicted 0-0 draw, actual 1-0 home win — no points for result
    const r = calculatePoints({ home: 0, away: 0 }, { home: 1, away: 0 })
    expect(r.breakdown.result).toBe(0)
    expect(r.breakdown.away_goals).toBe(1) // both away scores are 0
  })

  it('ignores extra time — uses full-time score only', () => {
    // In a knockout match ending 1-1 after 90 min (home wins on pens),
    // we score on full-time 1-1, not the penalty outcome
    const r = calculatePoints({ home: 1, away: 1 }, { home: 1, away: 1 })
    expect(r.total).toBe(5)
  })
})
