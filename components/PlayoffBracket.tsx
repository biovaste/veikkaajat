import { buildBracketLayout, type BracketMatchInput } from '@/lib/bracket-geometry'
import { getCountry } from '@/lib/countries'

export default function PlayoffBracket({ matches }: { matches: BracketMatchInput[] }) {
  const layout = buildBracketLayout(matches)
  if (!layout) return null

  const { size, center, nodes, lines, champion } = layout
  const leftHalf = (angle: number) => angle > 90 || angle < -90

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Pudotuspelikaavio</h2>
      <div className="bg-white rounded-lg border border-gray-200 p-2 overflow-x-auto">
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 700, margin: '0 auto', display: 'block' }}>
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#d1d5db" strokeWidth={1.5} />
          ))}
          {nodes.map((n, i) => {
            const country = getCountry(n.team)
            const left = leftHalf(n.angleDeg)
            const labelRotate = left ? n.angleDeg + 180 : n.angleDeg
            return (
              <g key={i} transform={`translate(${n.x}, ${n.y})`} opacity={n.eliminated ? 0.35 : 1}>
                {country.code && (
                  <image
                    href={`https://flagcdn.com/w20/${country.code}.png`}
                    x={left ? -28 : 8} y={-7} width={18} height={13}
                  />
                )}
                <text
                  x={left ? -10 : 30}
                  y={4}
                  fontSize={11}
                  fontWeight={n.advancing ? 700 : 400}
                  textAnchor={left ? 'end' : 'start'}
                  transform={`rotate(${labelRotate})`}
                  fill={n.advancing ? '#111827' : n.eliminated ? '#9ca3af' : '#374151'}
                >
                  {n.team === 'TBD' ? '?' : country.name}
                </text>
              </g>
            )
          })}
          <g transform={`translate(${center}, ${center})`} textAnchor="middle">
            <circle r={40} fill="#fef3c7" stroke="#f59e0b" strokeWidth={2} />
            <text y={-6} fontSize={22} textAnchor="middle">🏆</text>
            {champion && (
              <text y={18} fontSize={11} fontWeight={700} textAnchor="middle">{getCountry(champion).name}</text>
            )}
          </g>
        </svg>
      </div>
      {champion && (
        <p className="text-sm text-center font-semibold">🏆 Maailmanmestari: {getCountry(champion).name}</p>
      )}
      <p className="text-xs text-gray-400">
        Himmennetty = pudonnut jatkosta. Yhdyslinjat ovat suuntaa-antavia (football-data.org ei kerro täsmällistä lohkopuuta).
      </p>
    </div>
  )
}
