'use client'

import { useState } from 'react'

export interface HistoryPlayerRow {
  name: string
  active: boolean
  total: number
  preds: number
  exact: number
  correct: number
  zero: number
  group_pts: number; group_n: number
  knockout_pts: number; knockout_n: number
}

type SortKey = 'rank' | 'total' | 'ka' | 'tark' | 'tark_pct' | 'mrk' | 'nol' | 'lka' | 'jka'

const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 100) : null
const avg = (p: number, n: number) => n > 0 ? p / n : null

function fmt(v: number | null, decimals = 2) {
  if (v === null) return '–'
  return decimals === 0 ? `${v}%` : v.toFixed(decimals).replace('.', ',')
}

export default function HistoryStatsTable({ rows }: { rows: HistoryPlayerRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortAsc, setSortAsc] = useState(false)
  const [hideInactive, setHideInactive] = useState(false)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  function getValue(r: HistoryPlayerRow, key: SortKey): number | null {
    switch (key) {
      case 'rank':    return null
      case 'total':   return r.total
      case 'ka':      return avg(r.total, r.preds)
      case 'tark':    return r.exact
      case 'tark_pct': return pct(r.exact, r.preds)
      case 'mrk':     return pct(r.correct, r.preds)
      case 'nol':     return pct(r.zero, r.preds)
      case 'lka':     return avg(r.group_pts, r.group_n)
      case 'jka':     return avg(r.knockout_pts, r.knockout_n)
    }
  }

  function getDisplay(r: HistoryPlayerRow, key: SortKey): string {
    const v = getValue(r, key)
    if (v === null) return '–'
    switch (key) {
      case 'total': return String(r.total)
      case 'tark':  return String(r.exact)
      case 'ka':
      case 'lka':
      case 'jka':   return fmt(v, 2)
      case 'tark_pct':
      case 'mrk':
      case 'nol':   return fmt(v, 0)
      default:      return String(v)
    }
  }

  const visible = hideInactive ? rows.filter(r => r.active) : rows

  const sorted = [...visible].sort((a, b) => {
    const av = getValue(a, sortKey) ?? -Infinity
    const bv = getValue(b, sortKey) ?? -Infinity
    // For Nol% lower is better — invert default sort
    const asc = sortKey === 'nol' ? !sortAsc : sortAsc
    return asc ? av - bv : bv - av
  })

  const columns: { key: SortKey; label: string; title: string }[] = [
    { key: 'total',    label: 'Pts',    title: 'Pisteet yhteensä' },
    { key: 'ka',       label: 'KA',     title: 'Pistekeskiarvo per ottelu' },
    { key: 'tark',     label: 'Tark',   title: 'Täysosumat (kpl)' },
    { key: 'tark_pct', label: 'Tark%',  title: 'Täysosumat % kaikista veikatuista' },
    { key: 'mrk',      label: 'Mrk%',   title: 'Oikeat merkit %' },
    { key: 'nol',      label: 'Nol%',   title: 'Nollaottelut % (pienempi = parempi)' },
    { key: 'lka',      label: 'L-KA',   title: 'Lohkovaihe KA' },
    { key: 'jka',      label: 'J-KA',   title: 'Jatkopelit KA' },
  ]

  const activeCount = rows.filter(r => r.active).length

  return (
    <div className="space-y-3">
      {/* Filter toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setHideInactive(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            hideInactive
              ? 'bg-green-600 text-white border-green-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
          Vain MM26-pelaajat ({activeCount})
        </button>
        <span className="text-xs text-gray-400">Klikkaa saraketta järjestääksesi</span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-2 font-medium text-gray-500 w-8">#</th>
              <th className="text-left py-2 pr-4 font-medium text-gray-500">Pelaaja</th>
              {columns.map(col => (
                <th
                  key={col.key}
                  title={col.title}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-2 text-right font-medium cursor-pointer select-none whitespace-nowrap transition-colors ${
                    sortKey === col.key
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-0.5 text-xs">{sortAsc ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((r, i) => (
              <tr key={r.name} className={i === 0 ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                <td className="py-2.5 pr-2 text-gray-400 font-medium">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>
                <td className="py-2.5 pr-4 font-medium">
                  <span className="flex items-center gap-1.5">
                    {r.name}
                    {r.active && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Mukana MM26" />
                    )}
                  </span>
                </td>
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 text-right tabular-nums ${
                      col.key === 'total' ? 'font-bold' : 'text-gray-700'
                    } ${sortKey === col.key ? 'bg-blue-50/50' : ''}`}
                  >
                    {getDisplay(r, col.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        KA=pistekeskiarvo · Tark=täysosumat · Tark%=täysosumat kaikista veikatuista · Mrk%=oikeat merkit · Nol%=nollaottelut · L-KA=lohkovaihe KA · J-KA=jatkopelit KA
      </p>
    </div>
  )
}
