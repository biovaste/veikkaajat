import { ImageResponse } from 'next/og'
import { buildBracketLayout, type BracketMatchInput, type BracketNode } from '../bracket-geometry'
import { getCountry } from '../countries'

/**
 * Renders the circular playoff bracket as a PNG via Satori (next/og), mirroring
 * the web SVG design in components/PlayoffBracket.tsx: team dots per ring, a
 * gray "pairing" arc between every match's two teams (decided or not), one
 * amber advancement path per decided match (winner's dot straight to that same
 * team's dot in the next ring, or the center trophy for the final), and clipped
 * flag circles for resolved inner-ring teams. The outer ring stays text
 * (country name) only — 32 flag fetches there would be the slow/failure-prone
 * case.
 *
 * Satori can't mix SVG <text> with SVG defs/filter/gradient in the same <svg>
 * subtree (it throws "<text> nodes are not currently supported" once a subtree
 * needs its raw-SVG-serialization fallback for filters/gradients). So all
 * graphics — paths, dots, defs/filters/gradient, background rings, trophy
 * circles, and the inner flag images/clipPaths — live in one text-free <svg>,
 * and every text label is a separately absolutely-positioned <div> using
 * Satori's native text layout.
 */
export async function renderBracketImage(matches: BracketMatchInput[]): Promise<ArrayBuffer | null> {
  const layout = buildBracketLayout(matches)
  if (!layout) return null

  const { size, center, nodes, paths, dots, champion } = layout
  const outerNodes = nodes.filter((n) => n.ring === 0)
  const innerFlagNodes = nodes.filter((n) => n.ring > 0 && n.team !== 'TBD' && getCountry(n.team).code)

  function truncateLabel(label: string): string {
    return label.length > 18 ? `${label.slice(0, 16)}...` : label
  }

  function labelStyle(n: BracketNode, x: number, y: number): Record<string, string | number> {
    const base: Record<string, string | number> = {
      position: 'absolute',
      top: y,
      display: 'flex',
      whiteSpace: 'nowrap',
    }
    if (n.textAnchor === 'middle') {
      base.left = x
      base.transform = 'translate(-50%, -50%)'
    } else if (n.textAnchor === 'end') {
      base.right = size - x
      base.transform = 'translateY(-50%)'
      base.justifyContent = 'flex-end'
    } else {
      base.left = x
      base.transform = 'translateY(-50%)'
    }
    return base
  }

  const resp = new ImageResponse(
    (
      <div style={{ display: 'flex', position: 'relative', width: size, height: size, backgroundColor: '#fbfaf7' }}>
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <defs>
              <radialGradient id="bracketCenterGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.96" />
                <stop offset="46%" stopColor="#fde68a" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#fbfaf7" stopOpacity="0" />
              </radialGradient>
              <filter id="bracketSoftShadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#92400e" floodOpacity="0.18" />
              </filter>
              <filter id="bracketActiveGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f59e0b" floodOpacity="0.55" />
              </filter>
              {innerFlagNodes.map((n, i) => (
                <clipPath key={i} id={`inner-flag-${i}`}>
                  <circle cx={n.x} cy={n.y} r={13} />
                </clipPath>
              ))}
            </defs>

            <circle cx={center} cy={center} r={330} fill="none" stroke="#ebe6dc" strokeWidth={1} strokeDasharray="2 12" />
            <circle cx={center} cy={center} r={250} fill="none" stroke="#efe9dd" strokeWidth={1} strokeDasharray="2 10" />
            <circle cx={center} cy={center} r={164} fill="none" stroke="#f2eadc" strokeWidth={1} strokeDasharray="2 9" />
            <circle cx={center} cy={center} r={150} fill="url(#bracketCenterGlow)" />

            {paths.filter((p) => p.kind === 'pairing').map((path, i) => (
              <path
                key={i}
                d={path.d}
                fill="none"
                stroke="#374151"
                strokeWidth={2.35}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.68}
              />
            ))}

            {paths.filter((p) => p.kind === 'advance').map((path, i) => (
              <path
                key={i}
                d={path.d}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={3.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.94}
                filter="url(#bracketActiveGlow)"
              />
            ))}

            {dots.map((dot, i) => (
              <circle
                key={i}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dot.advancing ? '#f59e0b' : dot.eliminated ? '#cbd5e1' : '#475569'}
                stroke="#fbfaf7"
                strokeWidth={1.4}
                opacity={dot.eliminated ? 0.52 : 1}
              />
            ))}

            <circle cx={center} cy={center} r={58} fill="#fff7ed" stroke="#f59e0b" strokeWidth={2.4} filter="url(#bracketSoftShadow)" />
            <circle cx={center} cy={center} r={43} fill="#fef3c7" stroke="#fbbf24" strokeWidth={1.2} />

            {innerFlagNodes.map((n, i) => {
              const country = getCountry(n.team)
              return (
                <g key={i} opacity={n.eliminated ? 0.45 : 1}>
                  <circle cx={n.x} cy={n.y} r={15} fill="#fbfaf7" stroke={n.advancing ? '#f59e0b' : '#cbd5e1'} strokeWidth={2} />
                  <image
                    href={`https://flagcdn.com/w40/${country.code}.png`}
                    x={n.x - 17}
                    y={n.y - 13}
                    width={34}
                    height={26}
                    clipPath={`url(#inner-flag-${i})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                  <circle cx={n.x} cy={n.y} r={13} fill="none" stroke="#fbfaf7" strokeWidth={1.4} />
                </g>
              )
            })}
          </svg>
        </div>

        {outerNodes.map((n, i) => (
          <div
            key={`outer-${i}`}
            style={{
              ...labelStyle(n, n.labelX, n.labelY),
              fontSize: 13,
              fontWeight: n.advancing ? 750 : 560,
              color: n.advancing ? '#111827' : n.eliminated ? '#94a3b8' : '#334155',
              opacity: n.eliminated ? 0.85 : 1,
            }}
          >
            {n.team === 'TBD' ? '?' : truncateLabel(getCountry(n.team).name)}
          </div>
        ))}

        <div
          style={{
            position: 'absolute',
            left: center,
            top: center - 7,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            fontSize: 31,
          }}
        >
          🏆
        </div>
        {champion && (
          <div
            style={{
              position: 'absolute',
              left: center,
              top: center + 24,
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              fontSize: 13,
              fontWeight: 800,
              color: '#78350f',
            }}
          >
            {truncateLabel(getCountry(champion).name)}
          </div>
        )}
      </div>
    ),
    { width: size, height: size },
  )

  return resp.arrayBuffer()
}
