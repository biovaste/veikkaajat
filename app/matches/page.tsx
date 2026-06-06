import { createServerClient } from '@/lib/supabase/server'
import { stageLabel } from '@/lib/utils'
import MatchCard from '@/components/MatchCard'
import { redirect } from 'next/navigation'

export const revalidate = 0

export default async function MatchesPage() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: matches }, { data: predictions }] = await Promise.all([
    supabase
      .from('matches')
      .select('*')
      .order('kickoff_at', { ascending: true }),
    supabase
      .from('predictions')
      .select('match_id, home_score_pred, away_score_pred, points')
      .eq('user_id', user.id),
  ])

  if (!matches || matches.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Ottelut</h1>
        <p className="text-gray-400 text-sm">
          Otteluja ei ole vielä tuotu. Admin voi tuoda ne Admin → Tuo ottelut -sivulta.
        </p>
      </div>
    )
  }

  // Index predictions by match_id for O(1) lookup
  const predMap: Record<number, { home_score_pred: number; away_score_pred: number; points: number | null }> = {}
  for (const p of predictions ?? []) {
    predMap[p.match_id] = p
  }

  // Group matches by stage
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
              <MatchCard
                key={m.id}
                match={m}
                prediction={predMap[m.id]}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
