import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import CompPicker from './CompPicker'
import HistoryStatsTable from './HistoryStatsTable'

export const dynamic = 'force-dynamic'

interface CompStat {
  player_name: string
  competition_id: string
  preds: number
  total_pts: number
  zero_count: number
  correct_results: number
  exact_count: number
  group_pts: number
  group_n: number
  knockout_pts: number
  knockout_n: number
}


export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ comp?: string }>
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { comp } = await searchParams
  const selectedComp = comp ?? 'all'

  const [{ data: competitions }, { data: rawStats }, { data: histPlayers }] = await Promise.all([
    supabase.from('competitions').select('id, name, type, year').order('year'),
    supabase.from('hist_player_comp_stats').select('*'),
    supabase.from('hist_players').select('canonical_name, profile_id'),
  ])

  // Players with a profile_id are active in the current app (WC2026)
  const activePlayers = new Set(
    (histPlayers ?? []).filter(p => p.profile_id).map(p => p.canonical_name)
  )

  const comps = competitions ?? []
  const allStats = (rawStats ?? []) as CompStat[]

  // ── Stats table: aggregate across selected competition(s) ─────────────────
  const filtered = selectedComp === 'all'
    ? allStats
    : allStats.filter(r => r.competition_id === selectedComp)

  const byPlayer = new Map<string, {
    total: number; preds: number; exact: number; correct: number; zero: number
    group_pts: number; group_n: number; knockout_pts: number; knockout_n: number
  }>()

  for (const r of filtered) {
    const s = byPlayer.get(r.player_name) ?? {
      total: 0, preds: 0, exact: 0, correct: 0, zero: 0,
      group_pts: 0, group_n: 0, knockout_pts: 0, knockout_n: 0,
    }
    s.total      += Number(r.total_pts)
    s.preds      += Number(r.preds)
    s.exact      += Number(r.exact_count)
    s.correct    += Number(r.correct_results)
    s.zero       += Number(r.zero_count)
    s.group_pts  += Number(r.group_pts)
    s.group_n    += Number(r.group_n)
    s.knockout_pts += Number(r.knockout_pts)
    s.knockout_n += Number(r.knockout_n)
    byPlayer.set(r.player_name, s)
  }

  const stats = [...byPlayer.entries()]
    .map(([name, s]) => ({ name, active: activePlayers.has(name), ...s }))
    .sort((a, b) => b.total - a.total || b.exact - a.exact)

  // ── Tournament overview matrix ────────────────────────────────────────────
  const compTotals: Record<string, Record<string, number>> = {}
  for (const r of allStats) {
    if (!compTotals[r.player_name]) compTotals[r.player_name] = {}
    compTotals[r.player_name][r.competition_id] = Number(r.total_pts)
  }

  const allTimeTotal = (name: string) =>
    Object.values(compTotals[name] ?? {}).reduce((a, b) => a + b, 0)

  const overviewPlayers = [...new Set(allStats.map(r => r.player_name))]
    .sort((a, b) => allTimeTotal(b) - allTimeTotal(a))

  const selectedName = comps.find(c => c.id === selectedComp)?.name ?? 'Kaikki turnaukset'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Historia</h1>
        <span className="text-sm text-gray-500">{selectedName}</span>
      </div>

      <Suspense>
        <CompPicker competitions={comps.map(c => ({ id: c.id, name: c.id }))} />
      </Suspense>

      {/* ── Stats table ── */}
      {stats.length === 0 ? (
        <p className="text-gray-400 text-sm">Ei dataa.</p>
      ) : (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Tilastot</h2>
          <HistoryStatsTable rows={stats} />
        </div>
      )}

      {/* ── Tournament overview matrix ── */}
      <details className="group" open={selectedComp === 'all'}>
        <summary className="cursor-pointer list-none flex items-center gap-2 text-lg font-semibold select-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="transition-transform group-open:rotate-90 text-gray-400">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Turnausvertailu
        </summary>

        <div className="mt-3 overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-6 font-medium text-gray-500 whitespace-nowrap sticky left-0 bg-white">Pelaaja</th>
                {comps.map(c => (
                  <th key={c.id} className="px-3 py-2 font-medium text-gray-500 text-right whitespace-nowrap">{c.id}</th>
                ))}
                <th className="px-3 py-2 font-medium text-gray-700 text-right whitespace-nowrap">Yht.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overviewPlayers.map((name, i) => {
                const total = allTimeTotal(name)
                return (
                  <tr key={name} className={i === 0 ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                    <td className="py-2.5 pr-6 font-medium sticky left-0 bg-inherit">{name}</td>
                    {comps.map(c => {
                      const pts = compTotals[name]?.[c.id]
                      const compBest = Math.max(...overviewPlayers.map(n => compTotals[n]?.[c.id] ?? 0))
                      const isBest = pts !== undefined && pts === compBest
                      return (
                        <td key={c.id} className={`px-3 py-2.5 text-right tabular-nums ${isBest ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                          {pts ?? '–'}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">Lihavoitu = turnauksen paras. Yht. = historian kokonaispisteet.</p>
        </div>
      </details>
    </div>
  )
}
