import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { getCountry, flagUrl, groupLabel } from '@/lib/countries'
import { isWildcard, wildcardCountry } from '@/lib/players'

export const dynamic = 'force-dynamic'

const DEADLINE_MS = 5 * 60 * 1000 // predictions lock 5 min before kickoff

export default async function AllPredictionsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Service role: RLS only lets players read their own predictions/bets,
  // but here we show everyone's — only for closed (locked) targets.
  const sr = createServiceRoleClient()

  const [
    { data: profiles },
    { data: matches },
    { data: preds },
    { data: catBets },
    { data: catResults },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase.from('matches').select('id, home_team, away_team, kickoff_at, status, home_score, away_score, stage, group_name').order('kickoff_at', { ascending: false }),
    sr.from('predictions').select('user_id, match_id, home_score_pred, away_score_pred, points'),
    sr.from('category_bets').select('user_id, category, bet_value, points'),
    supabase.from('category_results').select('category, result_value'),
  ])

  const now = Date.now()
  const nameOf: Record<string, string> = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
  const resultMap: Record<string, string> = Object.fromEntries((catResults ?? []).map(r => [r.category, r.result_value]))

  // ── Closed matches (betting deadline passed) ────────────────────────────────

  const closedMatches = (matches ?? []).filter(m => new Date(m.kickoff_at).getTime() - DEADLINE_MS <= now)

  type Pred = { user_id: string; match_id: number; home_score_pred: number; away_score_pred: number; points: number | null }
  const predsByMatch: Record<number, Pred[]> = {}
  for (const p of (preds ?? []) as Pred[]) {
    if (!predsByMatch[p.match_id]) predsByMatch[p.match_id] = []
    predsByMatch[p.match_id].push(p)
  }

  // ── Special bet deadlines ───────────────────────────────────────────────────

  // Champion + top scorer close at the first match kickoff
  const firstKickoff = (matches ?? []).reduce<number | null>(
    (min, m) => (min === null ? +new Date(m.kickoff_at) : Math.min(min, +new Date(m.kickoff_at))),
    null,
  )
  const tournamentBetsClosed = firstKickoff !== null && now >= firstKickoff

  // Group advance bets close at the group's first match kickoff
  const normGroup = (g: string) => g.toUpperCase().replace(' ', '_')
  const groupFirstKickoff: Record<string, number> = {}
  for (const m of matches ?? []) {
    if (m.stage !== 'GROUP_STAGE' || !m.group_name) continue
    const key = normGroup(m.group_name)
    const t = +new Date(m.kickoff_at)
    if (!(key in groupFirstKickoff) || t < groupFirstKickoff[key]) groupFirstKickoff[key] = t
  }

  const championBets = (catBets ?? []).filter(b => b.category === 'WORLD_CHAMPION')
  const scorerBets = (catBets ?? []).filter(b => b.category === 'TOP_SCORER')
  const closedGroupCats = [...new Set(
    (catBets ?? [])
      .map(b => b.category)
      .filter(c => c.startsWith('GROUP_') && groupFirstKickoff[c] !== undefined && now >= groupFirstKickoff[c]),
  )].sort()

  const scorerLabel = (v: string) =>
    isWildcard(v) ? `Muu ${getCountry(wildcardCountry(v)).name} pelaaja` : v

  const sortByName = <T extends { user_id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => (nameOf[a.user_id] ?? '').localeCompare(nameOf[b.user_id] ?? '', 'fi'))

  function Flag({ team, size = 16 }: { team: string; size?: number }) {
    const { name, code } = getCountry(team)
    if (!code) return null
    return <img src={flagUrl(code)} alt={name} width={size} height={Math.round(size * 0.75)} className="inline-block rounded-sm shrink-0" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Kaikki veikkaukset</h1>
        <p className="text-xs text-gray-400 mt-1">
          Veikkaukset näkyvät täällä, kun kohde on sulkeutunut.
        </p>
      </div>

      {/* ── Special bets ── */}
      {tournamentBetsClosed && (championBets.length > 0 || scorerBets.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Erikoisveikkaukset</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Pelaaja</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">🏆 Mestari</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">⚽ Maalikuningas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(profiles ?? [])
                  .filter(p => championBets.some(b => b.user_id === p.id) || scorerBets.some(b => b.user_id === p.id))
                  .map(p => {
                    const champ = championBets.find(b => b.user_id === p.id)
                    const scorer = scorerBets.find(b => b.user_id === p.id)
                    const champCorrect = resultMap['WORLD_CHAMPION']
                    const scorerCorrect = resultMap['TOP_SCORER']
                    const champClass = champ && champCorrect
                      ? champ.bet_value === champCorrect ? 'text-green-600 font-semibold' : 'text-gray-400'
                      : ''
                    const scorerClass = scorer && scorerCorrect
                      ? scorer.bet_value === scorerCorrect ? 'text-green-600 font-semibold' : 'text-gray-400'
                      : ''
                    return (
                      <tr key={p.id} className={p.id === user.id ? 'bg-blue-50' : ''}>
                        <td className="px-4 py-2 font-medium">{p.display_name}</td>
                        <td className={`px-4 py-2 ${champClass}`}>
                          {champ ? (
                            <span className="flex items-center gap-1.5">
                              <Flag team={champ.bet_value} />
                              {getCountry(champ.bet_value).name}
                              {champ.points !== null && champ.points > 0 && <span className="text-xs font-bold text-green-600">+{champ.points} p</span>}
                            </span>
                          ) : (
                            <span className="text-gray-300 italic">–</span>
                          )}
                        </td>
                        <td className={`px-4 py-2 ${scorerClass}`}>
                          {scorer ? (
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {scorerLabel(scorer.bet_value)}
                              {scorer.points !== null && scorer.points > 0 && <span className="text-xs font-bold text-green-600">+{scorer.points} p</span>}
                            </span>
                          ) : (
                            <span className="text-gray-300 italic">–</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Group advance bets (per closed group) ── */}
      {closedGroupCats.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lohkoveikkaukset</h2>
          {closedGroupCats.map(cat => {
            const bets = sortByName((catBets ?? []).filter(b => b.category === cat))
            const correct: string[] = resultMap[cat] ? JSON.parse(resultMap[cat]) : []
            return (
              <div key={cat} className="bg-white rounded-lg border border-gray-200">
                <div className="px-4 py-2 border-b border-gray-100 text-sm font-semibold">{groupLabel(cat)}</div>
                <div className="divide-y divide-gray-100">
                  {bets.map(bet => {
                    const teams: string[] = JSON.parse(bet.bet_value)
                    return (
                      <div key={bet.user_id} className={`flex items-center justify-between gap-2 px-4 py-2 ${bet.user_id === user.id ? 'bg-blue-50' : ''}`}>
                        <span className="text-sm font-medium shrink-0">{nameOf[bet.user_id] ?? '?'}</span>
                        <span className="flex items-center gap-1.5 flex-wrap justify-end">
                          {teams.map((team, i) => {
                            const isCorrect = correct.includes(team)
                            const isWrong = correct.length > 0 && !correct.includes(team)
                            return (
                              <span key={team} className="flex items-center gap-1">
                                {i > 0 && <span className="text-gray-300 text-sm mr-0.5">&amp;</span>}
                                <span className={`flex items-center gap-1 text-sm ${isCorrect ? 'text-green-600 font-semibold' : isWrong ? 'text-red-400 line-through' : ''}`}>
                                  <Flag team={team} />
                                  {getCountry(team).name}
                                </span>
                              </span>
                            )
                          })}
                          {bet.points !== null && bet.points > 0 && <span className="text-xs font-bold text-green-600">+{bet.points} p</span>}
                        </span>
                      </div>
                    )
                  })}
                  {bets.length === 0 && <div className="px-4 py-2 text-sm text-gray-300 italic">Ei veikkauksia</div>}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* ── Closed matches ── */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Ottelut ({closedMatches.length})
        </h2>
        {closedMatches.length === 0 && (
          <p className="text-sm text-gray-400">Ei vielä sulkeutuneita otteluita.</p>
        )}
        {closedMatches.map(m => {
          const hasResult = m.home_score !== null && m.away_score !== null
          const matchPreds = sortByName(predsByMatch[m.id] ?? [])
          // Scored matches: best prediction first
          if (hasResult) matchPreds.sort((a, b) => (b.points ?? -1) - (a.points ?? -1))
          const predictedIds = new Set(matchPreds.map(p => p.user_id))
          const notPredicted = (profiles ?? []).filter(p => !predictedIds.has(p.id)).map(p => p.display_name)

          return (
            <div key={m.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1 flex-wrap">
                    <Flag team={m.home_team} size={20} />
                    {getCountry(m.home_team).name}
                    <span className="text-gray-400">–</span>
                    <Flag team={m.away_team} size={20} />
                    {getCountry(m.away_team).name}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{formatDate(m.kickoff_at)}</div>
                </div>
                <div className="text-right shrink-0">
                  {hasResult ? (
                    <span className="text-base font-bold">{m.home_score}–{m.away_score}</span>
                  ) : (
                    <span className="text-xs text-gray-400">Käynnissä / tulossa</span>
                  )}
                </div>
              </div>
              {matchPreds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {matchPreds.map(p => (
                    <span
                      key={p.user_id}
                      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${p.user_id === user.id ? 'bg-blue-50' : 'bg-gray-50'}`}
                    >
                      <span className="text-gray-500">{nameOf[p.user_id] ?? '?'}</span>
                      <span className="font-bold">{p.home_score_pred}–{p.away_score_pred}</span>
                      {hasResult && p.points !== null && (
                        <span className={`font-bold ${p.points >= 3 ? 'text-green-600' : p.points > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {p.points} p
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {notPredicted.length > 0 && (
                <p className="text-xs text-gray-300 italic">Ei veikannut: {notPredicted.join(', ')}</p>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
