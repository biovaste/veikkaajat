'use client'

import { useState } from 'react'

export interface StatCell {
  display: string
  /** Numeric value used for sorting; null = no data (sorted last) */
  num: number | null
}

export interface StatPlayer {
  id: string
  name: string
  isMe: boolean
  cells: Record<string, StatCell>
}

export interface StatRowDef {
  key: string
  label: string
  title: string
  bold?: boolean
  /** For stats where a lower value is better (e.g. Nol%) */
  lowerIsBetter?: boolean
}

/**
 * Transposed stats table (stats = rows, players = columns).
 * Clicking a stat row sorts the player columns by that stat, best first;
 * clicking the active row again reverses the order. Default sort: Pts.
 */
export default function StatsTable({ rows, players }: { rows: StatRowDef[]; players: StatPlayer[] }) {
  const [sortKey, setSortKey] = useState('pts')
  const [reversed, setReversed] = useState(false)

  const sortRow = rows.find((r) => r.key === sortKey) ?? rows[0]

  const sorted = [...players].sort((a, b) => {
    const av = a.cells[sortKey]?.num
    const bv = b.cells[sortKey]?.num
    // Missing values always last
    if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1
    if (bv === null || bv === undefined) return -1
    let cmp = sortRow.lowerIsBetter ? av - bv : bv - av
    if (reversed) cmp = -cmp
    if (cmp !== 0) return cmp
    // Tie-break: total points desc
    return (b.cells['pts']?.num ?? 0) - (a.cells['pts']?.num ?? 0)
  })

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setReversed((r) => !r)
    } else {
      setSortKey(key)
      setReversed(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table className="text-xs whitespace-nowrap w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {/* Stat label column header */}
            <th className="sticky left-0 bg-gray-50 px-3 py-2 w-20" />
            {sorted.map((p, i) => {
              const isLeader = i === 0
              return (
                <th
                  key={p.id}
                  className={`px-2 pt-2 pb-1 text-center font-medium ${p.isMe ? 'bg-blue-50' : isLeader ? 'bg-yellow-50' : 'bg-gray-50'}`}
                >
                  {/* Vertically rotated player name */}
                  <div
                    className="inline-block text-gray-700"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '5rem', fontSize: '11px' }}
                  >
                    {p.name}
                    {p.isMe && ' ★'}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const isActive = row.key === sortKey
            return (
              <tr key={row.key} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td
                  className={`sticky left-0 px-3 py-1.5 font-semibold bg-inherit border-r border-gray-100 cursor-pointer select-none ${isActive ? 'text-blue-600' : 'text-gray-500'}`}
                  title={`${row.title} — järjestä klikkaamalla`}
                  onClick={() => handleSort(row.key)}
                >
                  {row.label}
                  {isActive && <span className="ml-1">{reversed ? '▲' : '▼'}</span>}
                </td>
                {sorted.map((p, i) => {
                  const isLeader = i === 0
                  return (
                    <td
                      key={p.id}
                      className={`px-2 py-1.5 text-center ${row.bold ? 'font-bold' : ''} ${p.isMe ? 'bg-blue-50' : isLeader ? 'bg-yellow-50' : ''}`}
                    >
                      {p.cells[row.key]?.display ?? '–'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
