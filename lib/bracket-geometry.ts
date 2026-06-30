// Geometry for the circular playoff bracket (web SVG + Telegram PNG share this).
//
// football-data.org doesn't expose true bracket-tree adjacency (which match's
// winner plays which next match) — only a stage + kickoff time per match. We
// approximate bracket order by sorting each stage's matches by kickoff_at and
// pairing slot i with slot floor(i/2) in the next stage inward. This gives a
// structurally correct-looking bracket; it is not guaranteed to draw each
// connecting line to the literal next match a given team plays (the team
// labels themselves are always accurate, since they come straight from the
// match rows once football-data.org resolves them).

export type BracketStage = 'LAST_32' | 'LAST_16' | 'QUARTER_FINALS' | 'SEMI_FINALS' | 'FINAL'

const STAGE_ORDER: BracketStage[] = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL']

export interface BracketMatchInput {
  stage: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  winner_team: 'HOME' | 'AWAY' | null
  status: string
  kickoff_at: string
}

export interface BracketNode {
  team: string
  x: number
  y: number
  /** Normalized to (-180, 180]; 0 = right, -90 = top, 90 = bottom */
  angleDeg: number
  ring: number
  eliminated: boolean
  advancing: boolean
}

export interface BracketLine {
  x1: number; y1: number; x2: number; y2: number
}

export interface BracketLayout {
  size: number
  center: number
  nodes: BracketNode[]
  lines: BracketLine[]
  champion: string | null
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 540) % 360 - 180
}

export function buildBracketLayout(matches: BracketMatchInput[]): BracketLayout | null {
  const stages = STAGE_ORDER.filter((s) => matches.some((m) => m.stage === s))
  if (stages.length === 0) return null

  const size = 900
  const center = size / 2
  const outerRadius = 410
  const innerRadius = 90
  const ringGap = stages.length > 1 ? (outerRadius - innerRadius) / (stages.length - 1) : 0

  const byStage = new Map<string, BracketMatchInput[]>()
  for (const s of stages) {
    byStage.set(
      s,
      matches.filter((m) => m.stage === s).sort((a, b) => +new Date(a.kickoff_at) - +new Date(b.kickoff_at)),
    )
  }

  const nodes: BracketNode[] = []
  const lines: BracketLine[] = []

  stages.forEach((stage, ringIdx) => {
    const stageMatches = byStage.get(stage)!
    const radius = outerRadius - ringIdx * ringGap
    const slots = stageMatches.length * 2

    stageMatches.forEach((m, mi) => {
      const finished = m.status === 'FINISHED' && m.home_score !== null && m.away_score !== null
      const isDraw = finished && m.home_score === m.away_score
      const homeWon = finished && ((m.home_score! > m.away_score!) || (isDraw && m.winner_team === 'HOME'))
      const awayWon = finished && ((m.away_score! > m.home_score!) || (isDraw && m.winner_team === 'AWAY'))

      const sides: { team: string; won: boolean }[] = [
        { team: m.home_team, won: homeWon },
        { team: m.away_team, won: awayWon },
      ]

      sides.forEach((side, si) => {
        const slotIndex = mi * 2 + si
        const angle = normalizeAngle((slotIndex + 0.5) * (360 / slots) - 90)
        const rad = (angle * Math.PI) / 180
        const x = center + radius * Math.cos(rad)
        const y = center + radius * Math.sin(rad)

        nodes.push({
          team: side.team,
          x, y,
          angleDeg: angle,
          ring: ringIdx,
          eliminated: finished && !side.won,
          advancing: side.won,
        })

        if (ringIdx < stages.length - 1) {
          const nextRadius = outerRadius - (ringIdx + 1) * ringGap
          const nextStageMatches = byStage.get(stages[ringIdx + 1])!
          const nextSlots = Math.max(1, nextStageMatches.length * 2)
          // Clamp: stage match counts are expected to roughly halve round to round,
          // but aren't guaranteed to (e.g. a stage seeded out of order) — without
          // this, an uneven ratio could index past the next ring's slot count.
          const nextSlotIndex = Math.min(Math.floor(slotIndex / 2), nextSlots - 1)
          const nextAngle = (nextSlotIndex + 0.5) * (360 / nextSlots) - 90
          const nextRad = (nextAngle * Math.PI) / 180
          lines.push({
            x1: x, y1: y,
            x2: center + nextRadius * Math.cos(nextRad),
            y2: center + nextRadius * Math.sin(nextRad),
          })
        }
      })
    })
  })

  const finalStage = stages[stages.length - 1]
  const finalMatch = byStage.get(finalStage)![0]
  let champion: string | null = null
  if (finalMatch && finalMatch.status === 'FINISHED' && finalMatch.home_score !== null && finalMatch.away_score !== null) {
    if (finalMatch.home_score > finalMatch.away_score) champion = finalMatch.home_team
    else if (finalMatch.away_score > finalMatch.home_score) champion = finalMatch.away_team
    else if (finalMatch.winner_team === 'HOME') champion = finalMatch.home_team
    else if (finalMatch.winner_team === 'AWAY') champion = finalMatch.away_team
  }

  return { size, center, nodes, lines, champion }
}
