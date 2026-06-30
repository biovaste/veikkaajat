import { ImageResponse } from 'next/og'

export interface ImgColumn {
  key: string
  label: string
  /** For stats where a lower value is better (e.g. Nol%) */
  lowerIsBetter?: boolean
  /** Column width in px (default 62) — wider for text columns like picks */
  width?: number
  /** Text alignment (default center) */
  align?: 'left' | 'center'
}

export interface ImgCell {
  display: string
  /** Numeric value used for the color scale; null = no data (no color) */
  num: number | null
  /** Explicit text color override (e.g. red for an eliminated champion/scorer pick) */
  textColor?: string
}

export interface ImgRow {
  rank: number
  name: string
  cells: Record<string, ImgCell>
}

const RANK_W = 40
const NAME_W = 170
const STAT_W = 62
const ROW_H = 30
const PAD = 20

/** t = 1 → solid green (best), t = 0 → solid red (worst) */
function heatColor(t: number): string {
  const hue = Math.round(t * 120)
  return `hsl(${hue}, 65%, 55%)`
}

/**
 * Render the full stats board as a PNG using next/og (Satori).
 * Each stat column is color-coded from green (best) to red (worst).
 */
export async function renderStatsImage(
  title: string,
  columns: ImgColumn[],
  rows: ImgRow[],
): Promise<ArrayBuffer> {
  // Per-column min/max for the color scale
  const range: Record<string, { min: number; max: number } | null> = {}
  for (const col of columns) {
    const nums = rows.map((r) => r.cells[col.key]?.num).filter((n): n is number => n !== null && n !== undefined)
    range[col.key] = nums.length >= 2 ? { min: Math.min(...nums), max: Math.max(...nums) } : null
  }

  const cellBg = (col: ImgColumn, cell: ImgCell | undefined): string => {
    const r = range[col.key]
    if (!r || r.min === r.max || cell?.num === null || cell?.num === undefined) return 'transparent'
    const t = (cell.num - r.min) / (r.max - r.min)
    return heatColor(col.lowerIsBetter ? 1 - t : t)
  }

  const colW = (col: ImgColumn) => col.width ?? STAT_W
  const width = PAD * 2 + RANK_W + NAME_W + columns.reduce((sum, c) => sum + colW(c), 0)
  const height = PAD * 2 + 40 + ROW_H * (rows.length + 1)

  const cellStyle = (w: number, align: 'flex-start' | 'center' = 'center') => ({
    display: 'flex' as const,
    width: w,
    height: ROW_H,
    alignItems: 'center' as const,
    justifyContent: align,
    ...(align === 'flex-start' ? { paddingLeft: 8 } : {}),
  })

  const colCellStyle = (col: ImgColumn) =>
    cellStyle(colW(col), col.align === 'left' ? 'flex-start' : 'center')

  const resp = new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#ffffff',
          padding: PAD,
          fontSize: 14,
          color: '#111827',
        }}
      >
        <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{title}</div>

        {/* Header row */}
        <div style={{ display: 'flex', backgroundColor: '#f3f4f6', fontWeight: 700, fontSize: 13 }}>
          <div style={cellStyle(RANK_W)}>#</div>
          <div style={cellStyle(NAME_W, 'flex-start')}>Pelaaja</div>
          {columns.map((col) => (
            <div key={col.key} style={colCellStyle(col)}>
              {col.label}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {rows.map((row) => (
          <div key={row.rank} style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ ...cellStyle(RANK_W), color: '#6b7280' }}>{row.rank}</div>
            <div style={{ ...cellStyle(NAME_W, 'flex-start'), fontWeight: 600 }}>{row.name}</div>
            {columns.map((col) => {
              const cell = row.cells[col.key]
              return (
                <div
                  key={col.key}
                  style={{ ...colCellStyle(col), backgroundColor: cellBg(col, cell), ...(cell?.textColor ? { color: cell.textColor } : {}) }}
                >
                  {cell?.display ?? '–'}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    ),
    { width, height },
  )

  return resp.arrayBuffer()
}
