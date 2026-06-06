'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface Props {
  // Array of { matchIndex, player1: cumPoints, player2: cumPoints, ... }
  data: Record<string, number>[]
  players: string[]
}

// Distinct colours for up to 20 players
const COLOURS = [
  '#2563eb', '#dc2626', '#d97706', '#16a34a', '#9333ea',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0d9488',
  '#7c3aed', '#b45309', '#15803d', '#1d4ed8', '#be185d',
  '#0369a1', '#92400e', '#166534', '#6d28d9', '#9f1239',
]

export default function PointsChart({ data, players }: Props) {
  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Kokonaistilanteen kehitys
      </h2>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <XAxis
            dataKey="match"
            label={{ value: 'Ottelu', position: 'insideBottomRight', offset: -8, fontSize: 11 }}
            tick={{ fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 11 }} width={32} />
          <Tooltip
            formatter={(value, name) => [`${value} p`, name]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend
            iconType="plainline"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
          {players.map((player, i) => (
            <Line
              key={player}
              type="linear"
              dataKey={player}
              stroke={COLOURS[i % COLOURS.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
