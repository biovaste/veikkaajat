import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import CompPicker from './CompPicker'

export const dynamic = 'force-dynamic'

interface HMatch {
  id: number
  competition_id: string
  stage: string
  home_goals: number | null
  away_goals: number | null
  result_sign: string | null
}

interface HPred {
  match_id: number
  player_name: string
  home_pred: number | null
  away_pred: number | null
  sign_pred: string | null
  points: number | null
}

interface PlayerStats {
  name: string
  total: number
  preds: number
  exact: number
  correct: number
  zero: number
  group_pts: number; group_n: number
  knockout_pts: number; knockout_n: number
}

// Stage codes used in hist_matches
const GROUP_STAGES = new Set(['AL1', 'AL2', 'AL3'])

function emptyStats(name: string): PlayerStats {
  return { name, total: 0, preds: 0, exact: 0, correct: 0, zero: 0, group_pts: 0, group_n: 0, knockout_pts: 0, knockout_n: 0 }
}

function computeStats(matches: HMatch[], preds: HPred[]): PlayerStats[] {
  const matchById = new Map(matches.map(m => [m.id, m]))
  const byPlayer = new Map<string, PlayerStats>()

  for (const p of preds) {
    if (!byPlayer.has(p.player_name)) byPlayer.set(p.player_name, emptyStats(p.player_name))
    const s = byPlayer.get(p.player_name)!
    const m = matchById.get(p.match_id)
    if (!m || m.home_goals === null) continue

    const pts = p.points ?? 0
    s.total += pts
    s.preds += 1
    if (pts === 0) s.zero += 1
    if (p.sign_pred === m.result_sign) s.correct += 1
    if (
      p.sign_pred === m.result_sign &&
      p.home_pred === m.home_goals &&
      p.away_pred === m.away_goals
    ) s.exact += 1

    if (GROUP_STAGES.has(m.stage)) { s.group_pts += pts; s.group_n += 1 }
    else { s.knockout_pts += pts; s.knockout_n += 1 }
  }

  return [...byPlayer.values()].sort((a, b) => b.total - a.total || b.exact - a.exact)
}

const pct = (n: number, d: number) => d > 0 ? `${Math.round(n / d * 100)}%` : '–'
const avg = (p: number, n: number) => n > 0 ? (p / n).toFixed(2).replace('.', ',') : '–'

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

  const [
    { data: competitions },
    { data: allMatches },
    { data: allPreds },
  ] = await Promise.all([
    supabase.from('competitions').select('id, name, type, year').order('year'),
    supabase.from('hist_matches').select('id, competition_id, stage, home_goals, away_goals, result_sign'),
    supabase.from('hist_predictions').select('match_id, player_name, home_pred, away_pred, sign_pred, points'),
  ])

  const comps = competitions ?? []
  const matches = (allMatches ?? []) as HMatch[]
  const preds = (allPreds ?? []) as HPred[]

  // Filter to selected competition
  const filteredMatches = selectedComp === 'all'
    ? matches
    : matches.filter(m => m.competition_id === selectedComp)

  const filteredMatchIds = new Set(filteredMatches.map(m => m.id))
  const filteredPreds = preds.filter(p => filteredMatchIds.has(p.match_id))

  const stats = computeStats(filteredMatches, filteredPreds)

  // Tournament overview: player → competition → total points
  const allPlayers = [...new Set(preds.map(p => p.player_name))].sort()
  const compTotals: Record<string, Record<string, number>> = {}
  for (const p of preds) {
    const m = matches.find(m => m.id === p.match_id)
    if (!m) continue
    if (!compTotals[p.player_name]) compTotals[p.player_name] = {}
    compTotals[p.player_name][m.competition_id] =
      (compTotals[p.player_name][m.competition_id] ?? 0) + (p.points ?? 0)
  }
  // Sort players by all-time total descending
  const allTimeTotal = (name: string) => Object.values(compTotals[name] ?? {}).reduce((a, b) => a + b, 0)
  const overviewPlayers = allPlayers.sort((a, b) => allTimeTotal(b) - allTimeTotal(a))

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
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">#</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">Pelaaja</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Pts</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">KA</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Tark</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Mrk%</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Nol%</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">L-KA</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">J-KA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.map((s, i) => (
                  <tr key={s.name} className={i === 0 ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                    <td className="py-2.5 pr-4 text-gray-400 font-medium">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{s.total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{avg(s.total, s.preds)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{s.exact}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{pct(s.correct, s.preds)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{pct(s.zero, s.preds)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{avg(s.group_pts, s.group_n)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{avg(s.knockout_pts, s.knockout_n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            KA=pistekeskiarvo · Tark=täysosumat · Mrk%=oikeat merkit · Nol%=nollaottelut · L-KA=lohkovaihe KA · J-KA=jatkopelit KA
          </p>
        </div>
      )}

      {/* ── Tournament overview matrix ── */}
      <details className="group" open={selectedComp === 'all'}>
        <summary className="cursor-pointer list-none flex items-center gap-2 text-lg font-semibold select-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="transition-transform group-open:rotate-90 text-gray-400"
          >
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
                      // Best in this competition
                      const compBest = Math.max(...overviewPlayers.map(n => compTotals[n]?.[c.id] ?? 0))
                      const isBest = pts !== undefined && pts === compBest
                      return (
                        <td
                          key={c.id}
                          className={`px-3 py-2.5 text-right tabular-nums ${isBest ? 'font-bold text-gray-900' : 'text-gray-600'}`}
                        >
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
