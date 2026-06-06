import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'

export const revalidate = 0

export default async function MyPredictionsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: predictions } = await supabase
    .from('predictions')
    .select('*, matches(home_team, away_team, kickoff_at, home_score, away_score, status)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const total = predictions?.reduce((sum, p) => sum + (p.points ?? 0), 0) ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Veikkaukseni</h1>
        {(predictions?.length ?? 0) > 0 && (
          <span className="text-sm text-gray-500">{total} pistettä yhteensä</span>
        )}
      </div>

      {!predictions || predictions.length === 0 ? (
        <p className="text-gray-400 text-sm">Et ole vielä veikannut yhtään ottelua.</p>
      ) : (
        <div className="space-y-2">
          {predictions.map((p) => {
            const match = Array.isArray(p.matches) ? p.matches[0] : p.matches
            if (!match) return null
            return (
              <div key={p.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {match.home_team} – {match.away_team}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{formatDate(match.kickoff_at)}</div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="text-sm font-bold">{p.home_score_pred}–{p.away_score_pred}</div>
                    {match.home_score !== null && match.away_score !== null && (
                      <div className="text-xs text-gray-400">
                        Tulos: {match.home_score}–{match.away_score}
                      </div>
                    )}
                    {p.points !== null && (
                      <div className={`text-xs font-medium ${p.points > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {p.points} p
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
