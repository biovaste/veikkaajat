'use client'

import { useState } from 'react'

interface Props {
  comps: { id: string }[]
  players: string[]
  totals: Record<string, Record<string, number>> // player → comp → pts
}

export default function HistoryOverviewTable({ comps, players, totals }: Props) {
  const [sortComp, setSortComp] = useState<string>('total')
  const [sortAsc, setSortAsc] = useState(false)

  function handleSort(key: string) {
    if (sortComp === key) setSortAsc(v => !v)
    else { setSortComp(key); setSortAsc(false) }
  }

  const allTimeTotal = (name: string) =>
    Object.values(totals[name] ?? {}).reduce((a, b) => a + b, 0)

  const getValue = (name: string, key: string) =>
    key === 'total' ? allTimeTotal(name) : (totals[name]?.[key] ?? -1)

  const sorted = [...players].sort((a, b) => {
    const diff = getValue(b, sortComp) - getValue(a, sortComp)
    return sortAsc ? -diff : diff
  })

  function th(key: string, label: string) {
    const active = sortComp === key
    return (
      <th
        key={key}
        onClick={() => handleSort(key)}
        className={`px-3 py-2 text-right font-medium cursor-pointer select-none whitespace-nowrap transition-colors ${
          active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
        }`}
      >
        {label}
        {active && <span className="ml-0.5 text-xs">{sortAsc ? '↑' : '↓'}</span>}
      </th>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">Klikkaa saraketta järjestääksesi</p>
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-6 font-medium text-gray-500 whitespace-nowrap sticky left-0 bg-white">Pelaaja</th>
              {comps.map(c => th(c.id, c.id))}
              {th('total', 'Yht.')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((name, i) => {
              const total = allTimeTotal(name)
              return (
                <tr key={name} className={i === 0 ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                  <td className="py-2.5 pr-6 font-medium sticky left-0 bg-inherit">{name}</td>
                  {comps.map(c => {
                    const pts = totals[name]?.[c.id]
                    const compBest = Math.max(...players.map(n => totals[n]?.[c.id] ?? 0))
                    const isBest = pts !== undefined && pts === compBest
                    const isActiveSort = sortComp === c.id
                    return (
                      <td
                        key={c.id}
                        className={`px-3 py-2.5 text-right tabular-nums ${isBest ? 'font-bold text-gray-900' : 'text-gray-600'} ${isActiveSort ? 'bg-blue-50/50' : ''}`}
                      >
                        {pts ?? '–'}
                      </td>
                    )
                  })}
                  <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${sortComp === 'total' ? 'bg-blue-50/50' : ''}`}>
                    {total}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-2">Lihavoitu = turnauksen paras. Yht. = historian kokonaispisteet.</p>
      </div>
    </div>
  )
}
