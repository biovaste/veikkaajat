import { createServerClient } from '@/lib/supabase/server'
import { formatDate, stageLabel } from '@/lib/utils'

export const revalidate = 60

export default async function MatchesPage() {
  const supabase = await createServerClient()

  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .order('kickoff_at', { ascending: true })

  if (!matches || matches.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Ottelut</h1>
        <p className="text-gray-400 text-sm">Otteluja ei ole vielä tuotu. Admin voi tuoda ne Admin → Tuo ottelut -sivulta.</p>
      </div>
    )
  }

  // Group by stage
  const grouped: Record<string, typeof matches> = {}
  for (const m of matches) {
    if (!grouped[m.stage]) grouped[m.stage] = []
    grouped[m.stage].push(m)
  }

  const stageOrder = ['GROUP_STAGE', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL']

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ottelut</h1>

      {stageOrder.filter((s) => grouped[s]).map((stage) => (
        <section key={stage}>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {stageLabel(stage)}
          </h2>
          <div className="space-y-2">
            {grouped[stage].map((m) => (
              <div
                key={m.id}
                className="bg-white rounded-lg border border-gray-200 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {m.home_team} – {m.away_team}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatDate(m.kickoff_at)}
                      {m.group_name && ` · ${m.group_name}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {m.home_score !== null && m.away_score !== null ? (
                      <span className="font-bold text-sm">{m.home_score}–{m.away_score}</span>
                    ) : m.status === 'POSTPONED' ? (
                      <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5">Lykätty</span>
                    ) : m.status === 'CANCELLED' ? (
                      <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5">Peruttu</span>
                    ) : (
                      <span className="text-xs text-gray-400">Tulossa</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
