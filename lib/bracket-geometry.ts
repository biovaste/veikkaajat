// Geometry for the circular playoff bracket (web SVG + Telegram PNG share this).
//
// football-data.org gives us stage + external_id + kickoff_at per match, but not
// which match's winner plays which next match. Verified against real WC 2026
// data (Supabase `matches` table) that sorting each stage by `external_id`
// ascending — NOT `kickoff_at`, which reorders unpredictably relative to the
// bracket — groups sibling matches (the two matches that feed the same
// next-round match) as consecutive pairs: e.g. external_id 537415/537416
// (Germany–Paraguay, France–Sweden) both feed the real LAST_16 Paraguay v France
// match; 537417/537418 both feed Canada v Morocco; 537423/537424 both feed
// Brazil v Norway.
//
// But each ring's own slot order still needs to align with its parent ring —
// otherwise a resolved team's dot lands wherever its stage's external_id order
// happens to put it, which can be on the opposite side of the circle from the
// pair that actually produced it (e.g. Brazil/Norway's real LAST_16 match sits
// at natural index 2, but the pair feeding it is at LAST_32 index 8/9 — no
// arithmetic rule connects those two positions). `orderStageByParent()` fixes
// this by reordering each ring, pair by pair, to match wherever a finished
// match's winner actually shows up in the next round (falling back to the
// pair's natural position when the next round isn't resolved yet).
//
// Two kinds of path: a gray "pairing" elbow between a match's two team dots
// (dot -> branch -> arc -> branch -> dot; always drawn, decided or not — it's
// just showing who plays whom, never a guess), and an amber "advance" path per
// decided match that illuminates the winner's own half of that same elbow
// rather than drawing a new line beside it. The advance path retraces the
// winner's radial stub (dot -> branch), rides the pairing arc to the match
// spine (its center angle), then drops straight radially inward onto that same
// team's dot in the next ring (where its flag circle is drawn) — the spine
// angle equals the next-ring dot angle because orderStageByParent aligned
// them, so that last segment is a clean radial hop. Once the next match is
// also decided, another "advance" path illuminates its elbow the same way,
// and so on until the final feeds into the center trophy.

export type BracketStage = 'LAST_32' | 'LAST_16' | 'QUARTER_FINALS' | 'SEMI_FINALS' | 'FINAL'

const STAGE_ORDER: BracketStage[] = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL']

export interface BracketMatchInput {
  stage: string
  external_id: number
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
  /** Where this node's own match-pairing stem bends inward, at branchRadius —
   *  the start of the arc a decided team's advance path rides along, so the
   *  amber illuminates the existing gray elbow rather than a new diagonal. */
  branchX: number
  branchY: number
  /** The match's inward "spine" point: on the pairing arc at branchRadius, at
   *  the match's center angle. Because orderStageByParent aligns each next-round
   *  dot to the pair that produced it, this angle equals the winner's dot angle
   *  in the next ring — so the advance path drops straight (radially) inward
   *  from here onto that dot. */
  spineX: number
  spineY: number
  /** Radius of this node's pairing arc (for drawing the branch→spine arc). */
  branchRadius: number
  /** Raw (unnormalized) angle of this node's own slot and of its match center,
   *  used to pick the arc sweep direction from branch to spine. */
  slotAngleRaw: number
  matchCenterRaw: number
}

export interface BracketPath {
  d: string
  kind: 'pairing' | 'advance'
}

export interface BracketDot {
  x: number
  y: number
  r: number
  kind: 'team'
  eliminated?: boolean
  advancing?: boolean
}

export interface BracketLayout {
  size: number
  center: number
  nodes: BracketNode[]
  /** One path per decided match: winner's dot in this ring straight to the
   *  same team's dot in the next ring (or the center trophy, for the final). */
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

function isFinished(m: BracketMatchInput): boolean {
  return m.status === 'FINISHED' && m.home_score !== null && m.away_score !== null
}

function winnerName(m: BracketMatchInput): string {
  return winnerFor(m, 'HOME') ? m.home_team : m.away_team
}

function labelAnchor(angle: number): 'start' | 'middle' | 'end' {
  if (angle > -110 && angle < -70) return 'middle'
  if (angle > 70 && angle < 110) return 'middle'
  return angle > 90 || angle < -90 ? 'end' : 'start'
}

/** Reorders `natural` (the next stage, in external_id order) so that pair
 *  `pairIdx` in `parent` (two consecutive matches, already in display order)
 *  lines up with the match at display position `pairIdx` here. A pair's target
 *  is resolved by name once its match is finished; unresolved pairs get
 *  whatever position is left over, in order — always a valid full reordering. */
function orderStageByParent(parent: BracketMatchInput[], natural: BracketMatchInput[]): BracketMatchInput[] {
  const n = natural.length
  if (parent.length !== n * 2) return natural

  const targetForPair = new Map<number, number>()
  const usedTargets = new Set<number>()
  for (let pairIdx = 0; pairIdx < n; pairIdx++) {
    for (const pm of [parent[pairIdx * 2], parent[pairIdx * 2 + 1]]) {
      if (!isFinished(pm)) continue
      const foundIdx = natural.findIndex((nm) => nm.home_team === winnerName(pm) || nm.away_team === winnerName(pm))
      if (foundIdx >= 0 && !usedTargets.has(foundIdx)) {
        targetForPair.set(pairIdx, foundIdx)
        usedTargets.add(foundIdx)
        break
      }
    }
  }

  const remaining = Array.from({ length: n }, (_, i) => i).filter((i) => !usedTargets.has(i))
  let ri = 0
  return Array.from({ length: n }, (_, pairIdx) => {
    const targetIdx = targetForPair.get(pairIdx) ?? remaining[ri++]
    return natural[targetIdx]
  })
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

  const byStage = new Map<string, BracketMatchInput[]>()
  stages.forEach((s, i) => {
    const natural = matches.filter((m) => m.stage === s).sort((a, b) => a.external_id - b.external_id)
    const parent = i > 0 ? byStage.get(stages[i - 1]) : undefined
    byStage.set(s, parent ? orderStageByParent(parent, natural) : natural)
  })

  const nodes: BracketNode[] = []
  const dots: BracketDot[] = []
  const paths: BracketPath[] = []

  stages.forEach((stage, ringIdx) => {
    const stageMatches = byStage.get(stage)!
    const radius = outerRadius - ringIdx * ringGap
    const slots = stageMatches.length * 2
    const branchRadius = Math.max(innerRadius - ringGap, radius - branchDepth)

    stageMatches.forEach((m, mi) => {
      const sides: { team: string; won: boolean }[] = [
        { team: m.home_team, won: winnerFor(m, 'HOME') },
        { team: m.away_team, won: winnerFor(m, 'AWAY') },
      ]
      const finished = isFinished(m)
      const outers: { x: number; y: number }[] = []

      // The match's inward "spine": on the pairing arc, at the match's center
      // angle — the point both advance paths ride the arc toward and then drop
      // radially inward from.
      const matchCenterRaw = (mi * 2 + 1) * (360 / slots) - 90
      const spine = polar(center, branchRadius, matchCenterRaw)

      sides.forEach((side, si) => {
        const slotIndex = mi * 2 + si
        const rawAngle = (slotIndex + 0.5) * (360 / slots) - 90
        const angle = normalizeAngle(rawAngle)
        const outer = polar(center, radius, rawAngle)
        const label = polar(center, labelRadius, rawAngle)
        const flag = polar(center, flagRadius, rawAngle)
        const eliminated = finished && !side.won

        const branch = polar(center, branchRadius, rawAngle)

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
          branchX: branch.x,
          branchY: branch.y,
          spineX: spine.x,
          spineY: spine.y,
          branchRadius,
          slotAngleRaw: rawAngle,
          matchCenterRaw,
        })
        dots.push({
          x: outer.x,
          y: outer.y,
          r: ringIdx === 0 ? 3.8 : 3.4,
          kind: 'team',
          eliminated,
          advancing: side.won,
        })
        outers.push(outer)
      })

      // Gray pairing arc: dot -> branch -> arc -> branch -> dot, showing who
      // plays whom. Drawn for every match regardless of outcome, never a guess.
      // A decided match's amber advance path (below) is drawn on top of the
      // winner's half of this exact elbow, so the highlight illuminates the
      // existing bracket line rather than adding a new one.
      if (outers.length === 2) {
        const slotAngleA = (mi * 2 + 0.5) * (360 / slots) - 90
        const slotAngleB = (mi * 2 + 1.5) * (360 / slots) - 90
        const largeArc = Math.abs(slotAngleB - slotAngleA) > 180 ? 1 : 0
        const innerA = polar(center, branchRadius, slotAngleA)
        const innerB = polar(center, branchRadius, slotAngleB)
        paths.push({
          kind: 'pairing',
          d: [
            `M ${pointCmd(outers[0])} L ${pointCmd(innerA)}`,
            `M ${pointCmd(innerA)} A ${fmt(branchRadius)} ${fmt(branchRadius)} 0 ${largeArc} 1 ${pointCmd(innerB)}`,
            `M ${pointCmd(innerB)} L ${pointCmd(outers[1])}`,
          ].join(' '),
        })
      }
    })
  })

  // One advancement path per decided match, illuminating the winner's own
  // existing gray elbow rather than drawing a new diagonal across it:
  //   winner's dot -> its branch point (retraces its own radial stub)
  //     -> along the pairing arc to the match spine (retraces half the arc)
  //       -> straight radially inward onto its dot in the next ring.
  // The spine sits at the match's center angle, which orderStageByParent has
  // aligned to the winner's next-ring dot angle, so that final segment is a
  // clean radial drop landing exactly on the dot (or the center trophy, for
  // the final). If the next round isn't placed yet, only the winner's own
  // stub is lit — never a guess, since the destination is found by name.
  stages.forEach((stage, ringIdx) => {
    const stageMatches = byStage.get(stage)!
    const isFinalRing = ringIdx === stages.length - 1
    for (const m of stageMatches) {
      if (!isFinished(m)) continue
      const winner = winnerName(m)
      const fromNode = nodes.find((n) => n.ring === ringIdx && n.team === winner)
      if (!fromNode) continue

      const to = isFinalRing ? { x: center, y: center } : undefined
      const toNode = isFinalRing ? undefined : nodes.find((n) => n.ring === ringIdx + 1 && n.team === winner)
      const destination = to ?? (toNode && { x: toNode.x, y: toNode.y })

      if (!destination) {
        // Next round not placed yet — just light the winner's own radial stub.
        paths.push({ kind: 'advance', d: `M ${pointCmd({ x: fromNode.x, y: fromNode.y })} L ${pointCmd({ x: fromNode.branchX, y: fromNode.branchY })}` })
        continue
      }

      // Arc sweep from the winner's slot toward the (more central) spine angle.
      const sweep = fromNode.matchCenterRaw > fromNode.slotAngleRaw ? 1 : 0
      const r = fromNode.branchRadius
      paths.push({
        kind: 'advance',
        d: [
          `M ${pointCmd({ x: fromNode.x, y: fromNode.y })}`,
          `L ${pointCmd({ x: fromNode.branchX, y: fromNode.branchY })}`,
          `A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${pointCmd({ x: fromNode.spineX, y: fromNode.spineY })}`,
          `L ${pointCmd(destination)}`,
        ].join(' '),
      })
    }
  })

  const finalStage = stages[stages.length - 1]
  const finalMatch = byStage.get(finalStage)![0]
  let champion: string | null = null
  if (finalMatch && isFinished(finalMatch)) {
    champion = winnerName(finalMatch)
  }

  return { size, center, nodes, paths, dots, champion }
}
