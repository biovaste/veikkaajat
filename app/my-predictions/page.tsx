import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { getCountry, flagUrl } from '@/lib/countries'

export const revalidate = 0

export default async function MyPredictionsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: predictions } = await supabase
    .from('predictions')
    .select('*, matches(home_team, away_team, kickoff_at, home_score, away_score, status)')
    .eq('user_id', user.id)
    .order('matches(kickoff_at)', { ascending: true })

  const now = new Date()

  const upcoming = (predictions ?? []).filter((p) => {
    const match = Array.isArray(p.matches) ? p.matches[0] : p.matches
    return match && new Date(match.kickoff_at) > now && match.home_score === null
  })

  const played = (predictions ?? []).filter((p) => {
    const match = Array.isArray(p.matches) ? p.matches[0] : p.matches
    return match && (new Date(match.kickoff_at) <= now || match.home_score !== null)
  })

  const totalScored = played.reduce((sum, p) => sum + (p.points ?? 0), 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function PredRow({ p }: { p: any }) {
    const match = Array.isArray(p.matches) ? p.matches[0] : p.matches
    if (!match) return null
    const hasResult = match.home_score !== null && match.away_score !== null

    return (
      <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium flex items-center gap-1 flex-wrap">
              {(() => {
                const h = getCountry(match.home_team)
                const a = getCountry(match.away_team)
                return (
                  <>
                    {h.code && <img src={flagUrl(h.code)} alt={h.name} width={20} height={15} className="inline-block rounded-sm shrink-0" />}
                    {h.name}
                    <span className="text-gray-400">–</span>
                    {a.code && <img src={flagUrl(a.code)} alt={a.name} width={20} height={15} className="inline-block rounded-sm shrink-0" />}
                    {a.name}
                  </>
                )
              })()}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{formatDate(match.kickoff_at)}</div>
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <div className="text-sm font-bold">{p.home_score_pred}–{p.away_score_pred}</div>
            {hasResult && (
              <div className="text-xs text-gray-400">
                Tulos: {match.home_score}–{match.away_score}
              </div>
            )}
            {p.points !== null && (
              <div className={`text-xs font-bold ${p.points >= 3 ? 'text-green-600' : p.points > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                {p.points} p
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!predictions || predictions.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Veikkaukseni</h1>
        <p className="text-gray-400 text-sm">Et ole vielä veikannut yhtään ottelua.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Veikkaukseni</h1>
        {played.length > 0 && (
          <span className="text-sm text-gray-500">{totalScored} / {played.length * 5} p</span>
        )}
      </div>

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Tulossa ({upcoming.length})
          </h2>
          {upcoming.map((p) => <PredRow key={p.id} p={p} />)}
        </section>
      )}

      {played.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Pelattu ({played.length})
          </h2>
          {played.map((p) => <PredRow key={p.id} p={p} />)}
        </section>
      )}
    </div>
  )
}
