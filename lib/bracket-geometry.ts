// Geometry for the circular playoff bracket (web SVG + Telegram PNG share this).
//
// football-data.org does not expose true bracket-tree adjacency (which match's
// winner plays which next match), only stage + kickoff time. We approximate
// bracket order by sorting each stage by kickoff_at. Team labels remain accurate;
// only the connecting tree can be approximate until the API resolves more data.

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
  labelX: number
  labelY: number
  flagX: number
  flagY: number
  /** Normalized to (-180, 180]; 0 = right, -90 = top, 90 = bottom */
  angleDeg: number
  ring: number
  eliminated: boolean
  advancing: boolean
  textAnchor: 'start' | 'middle' | 'end'
}

export interface BracketLine {
  x1: number; y1: number; x2: number; y2: number
}

export interface BracketPath {
  d: string
  kind: 'branch' | 'connector' | 'final'
}

export interface BracketDot {
  x: number
  y: number
  r: number
  kind: 'team' | 'junction' | 'winner'
  eliminated?: boolean
  advancing?: boolean
}

export interface BracketLayout {
  size: number
  center: number
  nodes: BracketNode[]
  /** Legacy simple spoke lines, kept for Telegram until that renderer is redesigned. */
  lines: BracketLine[]
  /** Rich circular bracket paths for the web SVG renderer. */
  paths: BracketPath[]
  dots: BracketDot[]
  champion: string | null
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 540) % 360 - 180
}

function polar(center: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: center + radius * Math.cos(rad),
    y: center + radius * Math.sin(rad),
  }
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString()
}

function pointCmd(p: { x: number; y: number }): string {
  return `${fmt(p.x)} ${fmt(p.y)}`
}

function winnerFor(m: BracketMatchInput, side: 'HOME' | 'AWAY'): boolean {
  if (m.status !== 'FINISHED' || m.home_score === null || m.away_score === null) return false
  if (m.home_score === m.away_score) return m.winner_team === side
  return side === 'HOME' ? m.home_score > m.away_score : m.away_score > m.home_score
}

function labelAnchor(angle: number): 'start' | 'middle' | 'end' {
  if (angle > -110 && angle < -70) return 'middle'
  if (angle > 70 && angle < 110) return 'middle'
  return angle > 90 || angle < -90 ? 'end' : 'start'
}

export function buildBracketLayout(matches: BracketMatchInput[]): BracketLayout | null {
  const stages = STAGE_ORDER.filter((s) => matches.some((m) => m.stage === s))
  if (stages.length === 0) return null

  const size = 960
  const center = size / 2
  const outerRadius = 342
  const labelRadius = 392
  const flagRadius = 370
  const innerRadius = 118
  const ringGap = stages.length > 1 ? (outerRadius - innerRadius) / (stages.length - 1) : 0
  const branchDepth = stages.length > 1 ? Math.min(56, Math.max(34, ringGap * 0.58)) : 54
  const centerClearance = 78

  const byStage = new Map<string, BracketMatchInput[]>()
  for (const s of stages) {
    byStage.set(
      s,
      matches.filter((m) => m.stage === s).sort((a, b) => +new Date(a.kickoff_at) - +new Date(b.kickoff_at)),
    )
  }

  const nodes: BracketNode[] = []
  const lines: BracketLine[] = []
  const paths: BracketPath[] = []
  const dots: BracketDot[] = []

  stages.forEach((stage, ringIdx) => {
    const stageMatches = byStage.get(stage)!
    const radius = outerRadius - ringIdx * ringGap
    const slots = stageMatches.length * 2
    const isFinalRing = ringIdx === stages.length - 1

    stageMatches.forEach((m, mi) => {
      const homeWon = winnerFor(m, 'HOME')
      const awayWon = winnerFor(m, 'AWAY')
      const finished = m.status === 'FINISHED' && m.home_score !== null && m.away_score !== null
      const sides: { team: string; won: boolean }[] = [
        { team: m.home_team, won: homeWon },
        { team: m.away_team, won: awayWon },
      ]
      const matchPoints: { outer: { x: number; y: number }; inner: { x: number; y: number } }[] = []

      sides.forEach((side, si) => {
        const slotIndex = mi * 2 + si
        const rawAngle = (slotIndex + 0.5) * (360 / slots) - 90
        const angle = normalizeAngle(rawAngle)
        const branchRadius = Math.max(centerClearance, radius - branchDepth)
        const outer = polar(center, radius, rawAngle)
        const inner = polar(center, isFinalRing ? centerClearance : branchRadius, rawAngle)
        const label = polar(center, labelRadius, rawAngle)
        const flag = polar(center, flagRadius, rawAngle)
        const eliminated = finished && !side.won

        nodes.push({
          team: side.team,
          x: outer.x,
          y: outer.y,
          labelX: label.x,
          labelY: label.y,
          flagX: flag.x,
          flagY: flag.y,
          angleDeg: angle,
          ring: ringIdx,
          eliminated,
          advancing: side.won,
          textAnchor: labelAnchor(angle),
        })
        dots.push({
          x: outer.x,
          y: outer.y,
          r: ringIdx === 0 ? 3.8 : 3.4,
          kind: 'team',
          eliminated,
          advancing: side.won,
        })
        matchPoints.push({ outer, inner })

        if (ringIdx < stages.length - 1) {
          const nextRadius = outerRadius - (ringIdx + 1) * ringGap
          const nextStageMatches = byStage.get(stages[ringIdx + 1])!
          const nextSlots = Math.max(1, nextStageMatches.length * 2)
          const nextSlotIndex = Math.min(Math.floor(slotIndex / 2), nextSlots - 1)
          const nextAngle = (nextSlotIndex + 0.5) * (360 / nextSlots) - 90
          const nextPoint = polar(center, nextRadius, nextAngle)
          lines.push({ x1: outer.x, y1: outer.y, x2: nextPoint.x, y2: nextPoint.y })
        }
      })

      if (matchPoints.length !== 2) return

      const slotAngleA = (mi * 2 + 0.5) * (360 / slots) - 90
      const slotAngleB = (mi * 2 + 1.5) * (360 / slots) - 90
      const midAngle = slotAngleA + ((slotAngleB - slotAngleA) / 2)
      const branchRadius = Math.max(centerClearance, radius - branchDepth)
      const mid = polar(center, isFinalRing ? centerClearance : branchRadius, midAngle)

      if (isFinalRing) {
        paths.push({
          kind: 'final',
          d: `M ${pointCmd(matchPoints[0].outer)} L ${pointCmd(matchPoints[0].inner)} M ${pointCmd(matchPoints[1].outer)} L ${pointCmd(matchPoints[1].inner)}`,
        })
        dots.push({ x: matchPoints[0].inner.x, y: matchPoints[0].inner.y, r: 4.2, kind: 'winner' })
        dots.push({ x: matchPoints[1].inner.x, y: matchPoints[1].inner.y, r: 4.2, kind: 'winner' })
      } else {
        const largeArc = Math.abs(slotAngleB - slotAngleA) > 180 ? 1 : 0
        paths.push({
          kind: 'branch',
          d: [
            `M ${pointCmd(matchPoints[0].outer)} L ${pointCmd(matchPoints[0].inner)}`,
            `M ${pointCmd(matchPoints[0].inner)} A ${fmt(branchRadius)} ${fmt(branchRadius)} 0 ${largeArc} 1 ${pointCmd(matchPoints[1].inner)}`,
            `M ${pointCmd(matchPoints[1].inner)} L ${pointCmd(matchPoints[1].outer)}`,
          ].join(' '),
        })
        dots.push({ x: matchPoints[0].inner.x, y: matchPoints[0].inner.y, r: 3.4, kind: 'junction' })
        dots.push({ x: matchPoints[1].inner.x, y: matchPoints[1].inner.y, r: 3.4, kind: 'junction' })
        dots.push({ x: mid.x, y: mid.y, r: 4.2, kind: 'winner' })

        if (ringIdx < stages.length - 1) {
          const nextRadius = outerRadius - (ringIdx + 1) * ringGap
          const nextStageMatches = byStage.get(stages[ringIdx + 1])!
          const nextSlots = Math.max(1, nextStageMatches.length * 2)
          const nextSlotIndex = Math.min(mi, nextSlots - 1)
          const nextAngle = (nextSlotIndex + 0.5) * (360 / nextSlots) - 90
          const target = polar(center, nextRadius, nextAngle)
          const controlRadius = (branchRadius + nextRadius) / 2
          const controlAngle = midAngle + (nextAngle - midAngle) * 0.45
          const control = polar(center, controlRadius, controlAngle)
          paths.push({
            kind: 'connector',
            d: `M ${pointCmd(mid)} Q ${pointCmd(control)} ${pointCmd(target)}`,
          })
        }
      }
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

  return { size, center, nodes, lines, paths, dots, champion }
}

