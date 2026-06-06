import { createServerClient } from '@/lib/supabase/server'
import PointsChart from '@/components/PointsChart'

export const revalidate = 60

export default async function LeaderboardPage() {
  const supabase = await createServerClient()

  // Fetch scoring log joined with match kickoff time and player name, ordered chronologically
  const { data: log } = await supabase
    .from('scoring_log')
    .select('user_id, points, match_id, matches(kickoff_at), profiles(display_name)')
    .order('match_id', { ascending: true })

  // Aggregate total points per player for the table
  const totals: Record<string, { display_name: string; points: number }> = {}
  for (const row of log ?? []) {
    const name = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.display_name
    if (!name) continue
    if (!totals[name]) totals[name] = { display_name: name, points: 0 }
    totals[name].points += row.points
  }
  const sorted = Object.values(totals).sort((a, b) => b.points - a.points)
  const players = sorted.map((p) => p.display_name)

  // Build chart data: one entry per match, cumulative points per player
  const chartData: Record<string, number>[] = []
  const running: Record<string, number> = {}
  for (const p of players) running[p] = 0

  // Group log rows by match_id in order
  const byMatch: Record<number, { name: string; points: number }[]> = {}
  for (const row of log ?? []) {
    const name = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.display_name
    if (!name) continue
    if (!byMatch[row.match_id]) byMatch[row.match_id] = []
    byMatch[row.match_id].push({ name, points: row.points })
  }

  let matchIndex = 1
  for (const matchId of Object.keys(byMatch).map(Number)) {
    for (const { name, points } of byMatch[matchId]) {
      running[name] = (running[name] ?? 0) + points
    }
    chartData.push({ match: matchIndex, ...Object.fromEntries(Object.entries(running)) })
    matchIndex++
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sarjataulukko</h1>

      {sorted.length === 0 ? (
        <p className="text-gray-400 text-sm">Pisteitä ei vielä kertynyt — peli alkaa pian!</p>
      ) : (
        <>
          {/* Standings table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 w-8">#</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Pelaaja</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Pisteet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((p, i) => (
                  <tr key={p.display_name} className={i === 0 ? 'bg-yellow-50' : ''}>
                    <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{p.display_name}</td>
                    <td className="px-4 py-2.5 text-right font-bold">{p.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cumulative points chart */}
          {chartData.length > 0 && (
            <PointsChart data={chartData} players={players} />
          )}
        </>
      )}
    </div>
  )
}
