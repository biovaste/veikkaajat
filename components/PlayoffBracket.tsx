import { buildBracketLayout, type BracketMatchInput } from '@/lib/bracket-geometry'
import { getCountry } from '@/lib/countries'

function truncateLabel(label: string): string {
  return label.length > 18 ? `${label.slice(0, 16)}...` : label
}

export default function PlayoffBracket({ matches }: { matches: BracketMatchInput[] }) {
  const layout = buildBracketLayout(matches)
  if (!layout) return null

  const { size, center, nodes, paths, dots, champion } = layout
  const outerNodes = nodes.filter((node) => node.ring === 0)
  const innerFlagNodes = nodes.filter((node) => node.ring > 0 && node.team !== 'TBD' && getCountry(node.team).code)

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Pudotuspelikaavio</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-[#fbfaf7] p-1 sm:p-2">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width="100%"
          role="img"
          aria-label="Pudotuspelien ympyrakaavio"
          style={{ maxWidth: 760, margin: '0 auto', display: 'block' }}
        >
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

          {paths.filter((path) => path.kind === 'pairing').map((path, i) => (
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

          {paths.filter((path) => path.kind === 'advance').map((path, i) => (
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

          {outerNodes.map((n, i) => {
            const country = getCountry(n.team)
            const label = n.team === 'TBD' ? '?' : truncateLabel(country.name)
            const labelOffset = n.textAnchor === 'middle' ? 0 : n.textAnchor === 'start' ? 9 : -9
            return (
              <g key={i} opacity={n.eliminated ? 0.38 : 1}>
                {country.code && (
                  <image
                    href={`https://flagcdn.com/w40/${country.code}.png`}
                    x={n.flagX - 13}
                    y={n.flagY - 10}
                    width={26}
                    height={20}
                    preserveAspectRatio="xMidYMid meet"
                  />
                )}
                <text
                  x={n.labelX + labelOffset}
                  y={n.labelY + 4}
                  fontSize={13}
                  fontWeight={n.advancing ? 750 : 560}
                  textAnchor={n.textAnchor}
                  fill={n.advancing ? '#111827' : n.eliminated ? '#94a3b8' : '#334155'}
                  paintOrder="stroke"
                  stroke="#fbfaf7"
                  strokeWidth={4}
                  strokeLinejoin="round"
                >
                  {label}
                </text>
              </g>
            )
          })}

          <g transform={`translate(${center}, ${center})`} textAnchor="middle" filter="url(#bracketSoftShadow)">
            <circle r={58} fill="#fff7ed" stroke="#f59e0b" strokeWidth={2.4} />
            <circle r={43} fill="#fef3c7" stroke="#fbbf24" strokeWidth={1.2} />
            <text y={-7} fontSize={31} textAnchor="middle">🏆</text>
            {champion && (
              <text y={24} fontSize={13} fontWeight={800} textAnchor="middle" fill="#78350f">
                {truncateLabel(getCountry(champion).name)}
              </text>
            )}
          </g>
        </svg>
      </div>
      {champion && (
        <p className="text-center text-sm font-semibold">🏆 Maailmanmestari: {getCountry(champion).name}</p>
      )}
      <p className="text-xs leading-relaxed text-gray-400">
        Himmennetty = pudonnut jatkosta. Kultainen reitti = ratkaistun ottelun voittajan eteneminen.
      </p>
    </div>
  )
}
