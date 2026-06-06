// Optimised 20-color palette for line charts.
// Alternates high-saturation / pastel / dark / neon for maximum contrast when lines cross.

export interface ChartColor {
  hex: string
  label: string
}

export const CHART_COLORS: ChartColor[] = [
  { hex: '#1f77b4', label: 'Sininen' },
  { hex: '#aec7e8', label: 'Vaaleansininen' },
  { hex: '#ff7f0e', label: 'Oranssi' },
  { hex: '#ffbb78', label: 'Persikka' },
  { hex: '#2ca02c', label: 'Vihreä' },
  { hex: '#98df8a', label: 'Minttu' },
  { hex: '#d62728', label: 'Punainen' },
  { hex: '#ff9896', label: 'Vaaleanpunainen' },
  { hex: '#9467bd', label: 'Violetti' },
  { hex: '#c5b0d5', label: 'Laventeli' },
  { hex: '#8c564b', label: 'Ruskea' },
  { hex: '#c49c94', label: 'Beige' },
  { hex: '#e377c2', label: 'Pinkki' },
  { hex: '#f7b6d2', label: 'Vaalea pinkki' },
  { hex: '#7f7f7f', label: 'Harmaa' },
  { hex: '#c7c7c7', label: 'Vaalenharmaa' },
  { hex: '#bcbd22', label: 'Oliivi' },
  { hex: '#dbdb8d', label: 'Olki' },
  { hex: '#17becf', label: 'Syaani' },
  { hex: '#9edae5', label: 'Vaalean syaani' },
]

export const CHART_COLOR_HEXES = CHART_COLORS.map(c => c.hex)

/**
 * Assign a final color to each player.
 * Players with an explicit chart_color get that color.
 * Others are assigned sequentially from the remaining pool.
 */
export function assignColors(
  players: { id: string; chart_color: string | null }[],
): Record<string, string> {
  const taken = new Set(players.filter(p => p.chart_color).map(p => p.chart_color!))
  const pool = CHART_COLOR_HEXES.filter(c => !taken.has(c))
  let autoIdx = 0
  const result: Record<string, string> = {}
  for (const p of players) {
    result[p.id] = p.chart_color ?? pool[autoIdx++ % pool.length] ?? '#888888'
  }
  return result
}
