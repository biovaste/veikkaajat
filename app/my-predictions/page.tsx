import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { getCountry, flagUrl, groupLabel } from '@/lib/countries'
import { isWildcard, wildcardCountry } from '@/lib/players'

export const revalidate = 0

export default async function MyPredictionsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: predictions },
    { data: categoryBets },
    { data: categoryResults },
    { data: firstMatch },
  ] = await Promise.all([
    supabase
      .from('predictions')
      .select('*, matches(home_team, away_team, kickoff_at, home_score, away_score, status)')
      .eq('user_id', user.id)
      .order('matches(kickoff_at)', { ascending: true }),
    supabase
      .from('category_bets')
      .select('category, bet_value, points')
      .eq('user_id', user.id),
    supabase
      .from('category_results')
      .select('category, result_value'),
    supabase
      .from('matches')
      .select('kickoff_at')
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const betsOpen = !firstMatch?.kickoff_at || new Date() < new Date(firstMatch.kickoff_at)
  const betMap = Object.fromEntries((categoryBets ?? []).map(b => [b.category, b]))
  const resultMap = Object.fromEntries((categoryResults ?? []).map(r => [r.category, r.result_value]))

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

      {/* ── Special bets ── */}
      {categoryBets && categoryBets.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Erikoisveikkaukset
          </h2>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">

            {/* World champion */}
            {(() => {
              const bet = betMap['WORLD_CHAMPION']
              if (!bet) return null
              const picked = betsOpen ? null : bet.bet_value
              const correct = resultMap['WORLD_CHAMPION']
              const pts = bet.points
              return (
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">🏆 Maailmanmestari</div>
                    {picked ? (
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {(() => { const { name, code } = getCountry(picked); return (<>{code && <img src={flagUrl(code)} alt={name} width={18} height={14} className="rounded-sm" />}{name}</>) })()}
                        {correct && picked !== correct && (
                          <span className="text-xs text-gray-400 ml-1">
                            (oikea: {getCountry(correct).name})
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-300 italic">{betsOpen ? 'Veikkaukset auki' : 'Ei veikkausta'}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {pts !== null ? (
                      <span className={`text-sm font-bold ${pts > 0 ? 'text-green-600' : 'text-gray-400'}`}>{pts} / 10 p</span>
                    ) : picked ? (
                      <span className="text-xs text-gray-300">10 p</span>
                    ) : null}
                  </div>
                </div>
              )
            })()}

            {/* Top scorer */}
            {(() => {
              const bet = betMap['TOP_SCORER']
              if (!bet) return null
              const picked = betsOpen ? null : bet.bet_value
              const correct = resultMap['TOP_SCORER']
              const pts = bet.points
              const pickedLabel = picked
                ? isWildcard(picked) ? `Muu ${getCountry(wildcardCountry(picked)).name} pelaaja` : picked
                : null
              const correctLabel = correct
                ? isWildcard(correct) ? `Muu ${getCountry(wildcardCountry(correct)).name} pelaaja` : correct
                : null
              return (
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">⚽ Paras maalintekijä</div>
                    {pickedLabel ? (
                      <div className="text-sm font-medium">
                        {pickedLabel}
                        {correctLabel && picked !== correct && (
                          <span className="text-xs text-gray-400 ml-1">(oikea: {correctLabel})</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-300 italic">{betsOpen ? 'Veikkaukset auki' : 'Ei veikkausta'}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {pts !== null ? (
                      <span className={`text-sm font-bold ${pts > 0 ? 'text-green-600' : 'text-gray-400'}`}>{pts} / 5 p</span>
                    ) : pickedLabel ? (
                      <span className="text-xs text-gray-300">5 p</span>
                    ) : null}
                  </div>
                </div>
              )
            })()}

            {/* Group advance bets */}
            {(categoryBets ?? [])
              .filter(b => b.category.startsWith('GROUP_'))
              .sort((a, b) => a.category.localeCompare(b.category))
              .map(bet => {
                const teams: string[] = JSON.parse(bet.bet_value)
                const correct: string[] = resultMap[bet.category] ? JSON.parse(resultMap[bet.category]) : []
                const pts = bet.points
                return (
                  <div key={bet.category} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">{groupLabel(bet.category)}</div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {teams.map((team, i) => {
                          const { name, code } = getCountry(team)
                          const isCorrect = correct.includes(team)
                          const isWrong = correct.length > 0 && !correct.includes(team)
                          return (
                            <>
                              {i > 0 && <span key={`sep-${i}`} className="text-gray-300 text-sm">&amp;</span>}
                              <span key={team} className={`flex items-center gap-1 text-sm font-medium ${isCorrect ? 'text-green-600' : isWrong ? 'text-red-400 line-through' : ''}`}>
                                {code && <img src={flagUrl(code)} alt={name} width={16} height={12} className="rounded-sm" />}
                                {name}
                              </span>
                            </>
                          )
                        })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {pts !== null ? (
                        <span className={`text-sm font-bold ${pts > 0 ? 'text-green-600' : 'text-gray-400'}`}>{pts} / 4 p</span>
                      ) : (
                        <span className="text-xs text-gray-300">4 p</span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </section>
      )}

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
