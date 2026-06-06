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
  colors?: string[] // one per player, in same order as players array
}

export default function PointsChart({ data, players, colors }: Props) {
  if (data.length === 0 && players.length === 0) return null

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
              stroke={colors?.[i] ?? '#888888'}
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
