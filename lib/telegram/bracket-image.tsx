import { ImageResponse } from 'next/og'
import { buildBracketLayout, type BracketMatchInput } from '../bracket-geometry'
import { getCountry } from '../countries'

/**
 * Renders the circular playoff bracket as a PNG via Satori (next/og). No flag
 * images here (unlike the web SVG version) — fetching ~30 remote images during
 * server-side image generation is slow and failure-prone; country names alone
 * are clear enough at this size.
 */
export async function renderBracketImage(matches: BracketMatchInput[]): Promise<ArrayBuffer | null> {
  const layout = buildBracketLayout(matches)
  if (!layout) return null

  const { size, center, nodes, lines, champion } = layout
  const leftHalf = (angle: number) => angle > 90 || angle < -90

  const resp = new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: size,
          height: size,
          backgroundColor: '#ffffff',
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#d1d5db" strokeWidth={1.5} />
          ))}
          {nodes.map((n, i) => {
            const country = getCountry(n.team)
            const left = leftHalf(n.angleDeg)
            const label = n.team === 'TBD' ? '?' : country.name
            const tx = n.x + (left ? -10 : 10)
            return (
              <text
                key={i}
                x={tx}
                y={n.y + 4}
                fontSize={13}
                fontWeight={n.advancing ? 700 : 400}
                textAnchor={left ? 'end' : 'start'}
                fill={n.advancing ? '#111827' : n.eliminated ? '#9ca3af' : '#374151'}
              >
                {label}
              </text>
            )
          })}
          <circle cx={center} cy={center} r={42} fill="#fef3c7" stroke="#f59e0b" strokeWidth={2} />
          <text x={center} y={center - 4} fontSize={26} textAnchor="middle">🏆</text>
          {champion && (
            <text x={center} y={center + 18} fontSize={12} fontWeight={700} textAnchor="middle">
              {getCountry(champion).name}
            </text>
          )}
        </svg>
      </div>
    ),
    { width: size, height: size },
  )

  return resp.arrayBuffer()
}
