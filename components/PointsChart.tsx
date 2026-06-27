'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Brush,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface Props {
  data: Record<string, number>[]
  players: string[]
  colors?: string[]
}

type Mode = 'pisteet' | 'sijainti' | 'ero' | 'ka-ero'

function SortedTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: number
  mode: Mode
}) {
  if (!active || !payload || payload.length === 0) return null

  const sorted = [...payload].sort((a, b) =>
    mode === 'sijainti' ? a.value - b.value : b.value - a.value
  )

  return (
    <div className="bg-white border border-gray-200 rounded shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-500 mb-1">Ottelu {label}</p>
      {sorted.map((entry, i) => {
        const display =
          mode === 'pisteet' ? `${entry.value} p`
          : mode === 'ero' ? (entry.value === 0 ? 'johtaa' : `${entry.value} p`)
          : mode === 'ka-ero' ? (entry.value === 0 ? '= KA' : `${entry.value > 0 ? '+' : ''}${entry.value} p`)
          : `${entry.value}. sija`
        return (
          <div key={entry.name} className="flex items-center gap-2 leading-5">
            <span className="w-4 text-right text-gray-400 shrink-0">
              {mode !== 'sijainti' ? `${i + 1}.` : ''}
            </span>
            <span className="inline-block w-3 h-0.5 shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="flex-1 truncate max-w-[120px]">{entry.name}</span>
            <span className="font-medium tabular-nums ml-1 text-gray-700">{display}</span>
          </div>
        )
      })}
    </div>
  )
}

const TABS: { key: Mode; label: string; title: string }[] = [
  { key: 'pisteet',  label: 'Pisteet',  title: 'Kumulatiiviset pisteet' },
  { key: 'sijainti', label: 'Sijainti', title: 'Sijoitus ottelun jälkeen' },
  { key: 'ero',      label: 'Ero',      title: 'Pisteet suhteessa johtajaan' },
  { key: 'ka-ero',   label: 'KA-ero',   title: 'Pisteet suhteessa keskiarvoon' },
]

function ChartInner({
  activeData,
  players,
  colors,
  mode,
  height,
  totalPlayers,
}: {
  activeData: Record<string, number>[]
  players: string[]
  colors?: string[]
  mode: Mode
  height: number
  totalPlayers: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={activeData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <XAxis
          dataKey="match"
          label={{ value: 'Ottelu', position: 'insideBottomRight', offset: -8, fontSize: 11 }}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          width={36}
          reversed={mode === 'sijainti'}
          tickFormatter={mode === 'sijainti' ? (v: number) => `${v}.` : undefined}
          domain={mode === 'sijainti' ? [1, totalPlayers] : undefined}
          allowDecimals={false}
        />
        <Tooltip content={<SortedTooltip mode={mode} />} />
        <Brush dataKey="match" height={20} travellerWidth={8} stroke="#d1d5db" />
        {(mode === 'ero' || mode === 'ka-ero') && <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="4 4" />}
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
  )
}

export default function PointsChart({ data, players, colors }: Props) {
  const [mode, setMode] = useState<Mode>('pisteet')
  const [expanded, setExpanded] = useState(false)
  const [hiddenPlayers, setHiddenPlayers] = useState<Set<string>>(new Set())

  function togglePlayer(name: string) {
    setHiddenPlayers(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const rankData = useMemo<Record<string, number>[]>(() => {
    return data.map(row => {
      const entries = players.map(p => ({ name: p, pts: row[p] ?? 0 }))
      entries.sort((a, b) => b.pts - a.pts)
      const result: Record<string, number> = { match: row.match }
      entries.forEach((e, i) => { result[e.name] = i + 1 })
      return result
    })
  }, [data, players])

  const gapData = useMemo<Record<string, number>[]>(() => {
    return data.map(row => {
      const max = Math.max(...players.map(p => row[p] ?? 0))
      const result: Record<string, number> = { match: row.match }
      players.forEach(p => { result[p] = (row[p] ?? 0) - max })
      return result
    })
  }, [data, players])

  const avgGapData = useMemo<Record<string, number>[]>(() => {
    return data.map(row => {
      const vals = players.map(p => row[p] ?? 0)
      const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1)
      const result: Record<string, number> = { match: row.match }
      players.forEach(p => { result[p] = Math.round(((row[p] ?? 0) - avg) * 10) / 10 })
      return result
    })
  }, [data, players])

  const close = useCallback(() => setExpanded(false), [])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [expanded, close])

  if (data.length === 0 && players.length === 0) return null

  const activeData = mode === 'pisteet' ? data : mode === 'sijainti' ? rankData : mode === 'ero' ? gapData : avgGapData
  const visiblePlayers = players.filter(p => !hiddenPlayers.has(p))
  const visibleColors = colors?.filter((_, i) => !hiddenPlayers.has(players[i]))
  const title = TABS.find(t => t.key === mode)?.title

  const pillRow = (
    <div className="flex flex-wrap gap-2 mb-3">
      {players.map((player, i) => {
        const color = colors?.[i] ?? '#888888'
        const hidden = hiddenPlayers.has(player)
        return (
          <button
            key={player}
            onClick={() => togglePlayer(player)}
            className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
            style={
              hidden
                ? { backgroundColor: 'white', color, border: `1.5px solid ${color}` }
                : { backgroundColor: color, color: 'white', border: `1.5px solid ${color}` }
            }
          >
            {player}
          </button>
        )
      })}
      {hiddenPlayers.size > 0 && (
        <button
          onClick={() => setHiddenPlayers(new Set())}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
        >
          Kaikki
        </button>
      )}
    </div>
  )

  const header = (onExpand?: () => void) => (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                mode === t.key ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {onExpand && (
          <button
            onClick={onExpand}
            title="Laajenna koko näytölle"
            className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Inline card */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        {header(() => setExpanded(true))}
        {pillRow}
        <ChartInner activeData={activeData} players={visiblePlayers} colors={visibleColors} mode={mode} height={510} totalPlayers={players.length} />
      </div>

      {/* Fullscreen overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) close() }}
        >
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[95vh] flex flex-col p-5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                  {TABS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setMode(t.key)}
                      className={`px-3 py-1.5 font-medium transition-colors ${
                        mode === t.key ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={close}
                  title="Sulje (Esc)"
                  className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {pillRow}
              <ChartInner activeData={activeData} players={visiblePlayers} colors={visibleColors} mode={mode} height={630} totalPlayers={players.length} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
