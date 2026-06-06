import { createServerClient } from '@/lib/supabase/server'

export const revalidate = 60

export default async function LeaderboardPage() {
  const supabase = await createServerClient()

  const { data: rows } = await supabase
    .from('predictions')
    .select('user_id, points, profiles(display_name)')
    .not('points', 'is', null)

  const totals: Record<string, { display_name: string; points: number }> = {}
  for (const row of rows ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    if (!profile) continue
    if (!totals[row.user_id]) {
      totals[row.user_id] = { display_name: profile.display_name, points: 0 }
    }
    totals[row.user_id].points += row.points ?? 0
  }

  const sorted = Object.values(totals).sort((a, b) => b.points - a.points)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sarjataulukko</h1>

      {sorted.length === 0 ? (
        <p className="text-gray-400 text-sm">Pisteitä ei vielä kertynyt — peli alkaa pian!</p>
      ) : (
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
      )}
    </div>
  )
}
