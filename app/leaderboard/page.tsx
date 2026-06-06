import { createServerClient } from '@/lib/supabase/server'
import PointsChart from '@/components/PointsChart'

export const revalidate = 60

export default async function LeaderboardPage() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Get the logged-in user's display name for row highlighting
  let myName: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    myName = profile?.display_name ?? null
  }

  const [{ data: log }, { data: allProfiles }] = await Promise.all([
    supabase
      .from('scoring_log')
      .select('user_id, points, match_id, matches(kickoff_at), profiles(display_name)')
      .order('match_id', { ascending: true }),
    supabase
      .from('profiles')
      .select('display_name')
      .not('display_name', 'is', null)
      .order('display_name'),
  ])

  // Start with all registered players at 0 points
  const totals: Record<string, { display_name: string; points: number }> = {}
  for (const profile of allProfiles ?? []) {
    if (profile.display_name) {
      totals[profile.display_name] = { display_name: profile.display_name, points: 0 }
    }
  }
  // Add points from scored matches
  for (const row of log ?? []) {
    const name = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.display_name
    if (!name) continue
    if (!totals[name]) totals[name] = { display_name: name, points: 0 }
    totals[name].points += row.points
  }
  const sorted = Object.values(totals).sort((a, b) => b.points - a.points)
  const players = sorted.map((p) => p.display_name)

  // Build cumulative chart data
  const byMatch: Record<number, { name: string; points: number }[]> = {}
  for (const row of log ?? []) {
    const name = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.display_name
    if (!name) continue
    if (!byMatch[row.match_id]) byMatch[row.match_id] = []
    byMatch[row.match_id].push({ name, points: row.points })
  }

  const chartData: Record<string, number>[] = []
  const running: Record<string, number> = {}
  for (const p of players) running[p] = 0

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
                {sorted.map((p, i) => {
                  const isMe = myName && p.display_name === myName
                  const isFirst = i === 0
                  return (
                    <tr
                      key={p.display_name}
                      className={isMe ? 'bg-blue-50' : isFirst ? 'bg-yellow-50' : ''}
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-500">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {p.display_name}
                        {isMe && <span className="ml-1.5 text-xs text-blue-400">(sinä)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold">{p.points}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {chartData.length > 0 && (
            <PointsChart data={chartData} players={players} />
          )}
        </>
      )}
    </div>
  )
}
