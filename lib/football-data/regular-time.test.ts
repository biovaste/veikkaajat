import { describe, it, expect } from 'vitest'
import { pickRegularTimeScore } from './regular-time'
import type { FDMatch } from './client'

describe('pickRegularTimeScore', () => {
  it('uses fullTime for a regular-time match', () => {
    const r = pickRegularTimeScore({
      winner: 'HOME_TEAM', duration: 'REGULAR',
      fullTime: { home: 2, away: 1 },
    } as FDMatch['score'])
    expect(r).toEqual({ home: 2, away: 1, winnerTeam: 'HOME', breakdown: { duration: 'REGULAR', extraTime: null, penalties: null } })
  })

  it('uses regularTime (not fullTime) for a match decided in extra time', () => {
    const r = pickRegularTimeScore({
      winner: 'HOME_TEAM', duration: 'EXTRA_TIME',
      fullTime: { home: 2, away: 1 },
      regularTime: { home: 1, away: 1 },
      extraTime: { home: 1, away: 0 },
    } as FDMatch['score'])
    expect(r).toEqual({
      home: 1, away: 1, winnerTeam: 'HOME',
      breakdown: { duration: 'EXTRA_TIME', extraTime: { home: 1, away: 0 }, penalties: null },
    })
  })

  it('uses regularTime and stores the penalty result for a shootout', () => {
    const r = pickRegularTimeScore({
      winner: 'HOME_TEAM', duration: 'PENALTY_SHOOTOUT',
      fullTime: { home: 2, away: 1 },
      regularTime: { home: 1, away: 1 },
      extraTime: { home: 0, away: 0 },
      penalties: { home: 4, away: 3 },
    } as FDMatch['score'])
    expect(r?.home).toBe(1)
    expect(r?.away).toBe(1)
    expect(r?.winnerTeam).toBe('HOME')
    expect(r?.breakdown.penalties).toEqual({ home: 4, away: 3 })
  })

  it('returns null when a knockout match is finished but regularTime has not appeared yet', () => {
    const r = pickRegularTimeScore({
      winner: 'HOME_TEAM', duration: 'EXTRA_TIME',
      fullTime: { home: 2, away: 1 },
    } as FDMatch['score'])
    expect(r).toBeNull()
  })

  it('handles a 90-minute draw decided on penalties', () => {
    const r = pickRegularTimeScore({
      winner: 'AWAY_TEAM', duration: 'PENALTY_SHOOTOUT',
      fullTime: { home: 1, away: 2 },
      regularTime: { home: 1, away: 1 },
      penalties: { home: 3, away: 4 },
    } as FDMatch['score'])
    expect(r).toEqual({
      home: 1, away: 1, winnerTeam: 'AWAY',
      breakdown: { duration: 'PENALTY_SHOOTOUT', extraTime: null, penalties: { home: 3, away: 4 } },
    })
  })
})
