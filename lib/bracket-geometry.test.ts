import { describe, it, expect } from 'vitest'
import { buildBracketLayout, type BracketMatchInput } from './bracket-geometry'

function match(overrides: Partial<BracketMatchInput> & { stage: string; external_id: number }): BracketMatchInput {
  return {
    home_team: `M${overrides.external_id}h`,
    away_team: `M${overrides.external_id}a`,
    home_score: null,
    away_score: null,
    winner_team: null,
    status: 'SCHEDULED',
    kickoff_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

// external_id order is what actually encodes sibling adjacency (verified against
// real WC 2026 data — see bracket-geometry.ts header comment), so build fixtures
// with external_id ascending but kickoff_at scrambled to prove kickoff order is
// NOT used for ordering.
function stageMatches(stage: string, firstExternalId: number, count: number): BracketMatchInput[] {
  return Array.from({ length: count }, (_, i) =>
    match({
      stage,
      external_id: firstExternalId + i,
      kickoff_at: `2026-07-${String(count - i).padStart(2, '0')}T00:00:00Z`, // deliberately reversed
    }),
  )
}

function pathEnd(d: string): { x: number; y: number } {
  const [, x, y] = d.match(/L ([\d.-]+) ([\d.-]+)$/)!
  return { x: Number(x), y: Number(y) }
}

function pathStart(d: string): { x: number; y: number } {
  const [, x, y] = d.match(/^M ([\d.-]+) ([\d.-]+)/)!
  return { x: Number(x), y: Number(y) }
}

describe('buildBracketLayout adjacency', () => {
  it('orders nodes by external_id, not kickoff_at', () => {
    const matches = stageMatches('LAST_32', 100, 4)
    const layout = buildBracketLayout(matches)!
    const outerLabels = layout.nodes.filter((n) => n.ring === 0).map((n) => n.team)
    expect(outerLabels).toEqual(['M100h', 'M100a', 'M101h', 'M101a', 'M102h', 'M102a', 'M103h', 'M103a'])
  })

  it('draws one gray pairing elbow per match, decided or not, but no amber advance path for undecided ones', () => {
    const matches = [...stageMatches('LAST_32', 100, 4), ...stageMatches('LAST_16', 200, 2)]
    const layout = buildBracketLayout(matches)!
    // 4 LAST_32 matches + 2 LAST_16 matches = 6 pairing elbows, no advances yet.
    expect(layout.paths.filter((p) => p.kind === 'pairing').length).toBe(6)
    expect(layout.paths.filter((p) => p.kind === 'advance').length).toBe(0)
  })

  it("illuminates the winner's own elbow (dot -> branch -> arc -> spine) then drops radially onto their next-ring dot", () => {
    const matches = [...stageMatches('LAST_32', 100, 4), ...stageMatches('LAST_16', 200, 2)]
    matches[0] = { ...matches[0], status: 'FINISHED', home_score: 2, away_score: 1 }
    matches[4] = { ...matches[4], home_team: 'M100h' } // the LAST_16 match M100h actually advances into
    const layout = buildBracketLayout(matches)!
    const homeNode = layout.nodes.find((n) => n.team === 'M100h')!
    const awayNode = layout.nodes.find((n) => n.team === 'M100a')!
    expect(homeNode.advancing).toBe(true)
    expect(awayNode.eliminated).toBe(true)

    // One continuous amber path for the decided match.
    const advancePaths = layout.paths.filter((p) => p.kind === 'advance')
    expect(advancePaths.length).toBe(1)
    const d = advancePaths[0].d

    // It must START at the winner's own dot (illuminating its stub in place),
    // not somewhere floating — so it reads as the existing bracket line lit up.
    const start = pathStart(d)
    expect(start.x).toBeCloseTo(homeNode.x, 1)
    expect(start.y).toBeCloseTo(homeNode.y, 1)

    // It rides the arc rather than cutting a straight diagonal across the elbow.
    expect(d).toContain(' A ') // arc segment present

    // …and END on the winner's dot in the next ring.
    const nextNode = layout.nodes.find((n) => n.ring === 1 && n.team === 'M100h')!
    const end = pathEnd(d)
    expect(end.x).toBeCloseTo(nextNode.x, 1)
    expect(end.y).toBeCloseTo(nextNode.y, 1)
  })

  it("aligns a resolved next-round match's dot with the pair that actually produced it, even when the next round's own array order disagrees", () => {
    // Mirrors the real WC 2026 data: LAST_32 pair at index 6/7 (mi=6,7) is the
    // 4th pair (floor(6/2)=3), but "Norway" — the winner — sits at LAST_16
    // natural index 0, not index 3. Without reordering, Norway's LAST_16 dot
    // would render wherever natural index 0 happens to sit, unrelated to where
    // its LAST_32 pair is. After reordering, the winner's path must land
    // exactly on Norway's actual LAST_16 dot.
    const last32 = stageMatches('LAST_32', 300, 8)
    last32[6] = { ...last32[6], home_team: 'Norway', status: 'FINISHED', home_score: 2, away_score: 1 }
    const last16 = stageMatches('LAST_16', 400, 4)
    last16[0] = { ...last16[0], home_team: 'Norway' }
    const layout = buildBracketLayout([...last32, ...last16])!

    const norwayNode = layout.nodes.find((n) => n.ring === 1 && n.team === 'Norway')!
    const advancePaths = layout.paths.filter((p) => p.kind === 'advance')
    expect(advancePaths.length).toBe(1)
    const end = pathEnd(advancePaths[0].d)
    // `d` coordinates are rounded to 2 decimals when serialized into the path string.
    expect(end.x).toBeCloseTo(norwayNode.x, 1)
    expect(end.y).toBeCloseTo(norwayNode.y, 1)
  })

  it('draws the champion advancement path into the center trophy', () => {
    const matches = [
      ...stageMatches('SEMI_FINALS', 500, 2),
      match({ stage: 'FINAL', external_id: 600, status: 'FINISHED', home_score: 3, away_score: 1 }),
    ]
    const layout = buildBracketLayout(matches)!
    expect(layout.champion).toBe('M600h')
    const advancePaths = layout.paths.filter((p) => p.kind === 'advance')
    const end = pathEnd(advancePaths[advancePaths.length - 1].d)
    expect(end.x).toBeCloseTo(layout.center, 1)
    expect(end.y).toBeCloseTo(layout.center, 1)
  })

  it('detects the champion from a finished FINAL match', () => {
    const matches = [match({ stage: 'FINAL', external_id: 104, status: 'FINISHED', home_score: 3, away_score: 1 })]
    const layout = buildBracketLayout(matches)!
    expect(layout.champion).toBe('M104h')
  })

  it('returns null when there are no knockout matches', () => {
    expect(buildBracketLayout([])).toBeNull()
  })
})
