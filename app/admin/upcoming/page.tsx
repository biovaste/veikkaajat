import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCountry, flagUrl } from '@/lib/countries'
import { formatDate } from '@/lib/utils'

export const revalidate = 0

export default async function UpcomingPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createServiceRoleClient()
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  // Deadline = kickoff - 5 min, so kickoff must be between now+5min and now+24h+5min
  const kickoffFrom = new Date(now.getTime() + 5 * 60 * 1000)
  const kickoffTo   = new Date(in24h.getTime() + 5 * 60 * 1000)

  const [{ data: matches }, { data: allPlayers }, { data: firstMatch }, { data: categoryBets }] = await Promise.all([
    admin
      .from('matches')
      .select('id, home_team, away_team, kickoff_at, group_name')
      .in('status', ['SCHEDULED', 'TIMED'])
      .is('home_score', null)
      .gt('kickoff_at', kickoffFrom.toISOString())
      .lte('kickoff_at', kickoffTo.toISOString())
      .order('kickoff_at', { ascending: true }),
    admin
      .from('profiles')
      .select('id, display_name')
      .order('display_name'),
    admin
      .from('matches')
      .select('kickoff_at, group_name')
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from('category_bets')
      .select('user_id, category'),
  ])

  const playerCount = allPlayers?.length ?? 0
  const firstKickoff = firstMatch?.kickoff_at ? new Date(firstMatch.kickoff_at) : null
  const championDeadlinePassed = firstKickoff ? firstKickoff <= now : true

  // Fetch predictions for all upcoming matches in one query (service role bypasses RLS)
  const matchIds = (matches ?? []).map(m => m.id)
  const { data: predictions } = matchIds.length > 0
    ? await admin
        .from('predictions')
        .select('match_id, user_id')
        .in('match_id', matchIds)
    : { data: [] }

  const predsByMatch: Record<number, Set<string>> = {}
  for (const p of predictions ?? []) {
    if (!predsByMatch[p.match_id]) predsByMatch[p.match_id] = new Set()
    predsByMatch[p.match_id].add(p.user_id)
  }

  // Special bet coverage
  const betsByCategory: Record<string, Set<string>> = {}
  for (const b of categoryBets ?? []) {
    if (!betsByCategory[b.category]) betsByCategory[b.category] = new Set()
    betsByCategory[b.category].add(b.user_id)
  }

  // Special bets that close within the next 24h (or are still open)
  const championOpen = firstKickoff && firstKickoff > now && firstKickoff <= new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Groups whose first match is within next 24h
  const groupDeadlines: { group: string; kickoff: Date }[] = []
  const seenGroups = new Set<string>()
  for (const m of matches ?? []) {
    if (m.group_name && !seenGroups.has(m.group_name)) {
      seenGroups.add(m.group_name)
    }
  }
  // Also check if any upcoming match is a group's first match ever
  // We need the earliest kickoff per group from ALL matches
  const { data: allGroupMatches } = await admin
    .from('matches')
    .select('group_name, kickoff_at')
    .not('group_name', 'is', null)
    .order('kickoff_at', { ascending: true })

  const firstKickoffByGroup: Record<string, Date> = {}
  for (const m of allGroupMatches ?? []) {
    if (m.group_name && !firstKickoffByGroup[m.group_name]) {
      firstKickoffByGroup[m.group_name] = new Date(m.kickoff_at)
    }
  }
  for (const [group, kickoff] of Object.entries(firstKickoffByGroup)) {
    if (kickoff > now && kickoff <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
      groupDeadlines.push({ group, kickoff })
    }
  }
  groupDeadlines.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())

  function MissingChips({ missing }: { missing: { id: string; display_name: string }[] }) {
    if (missing.length === 0) return null
    return (
      <div className="mt-2 pt-2 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-1">Puuttuu:</div>
        <div className="flex flex-wrap gap-1">
          {missing.map(p => (
            <span key={p.id} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
              {p.display_name}
            </span>
          ))}
        </div>
      </div>
    )
  }

  const hasAnything = (matches && matches.length > 0) || championOpen || groupDeadlines.length > 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sulkeutuvat pian</h1>

      {!hasAnything && (
        <p className="text-sm text-gray-400">Ei sulkeutuvia kohteita seuraavan 24 tunnin aikana.</p>
      )}

      {/* Special bets closing soon */}
      {(championOpen || groupDeadlines.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Erikoisveikkaukset</h2>

          {championOpen && firstKickoff && (() => {
            const champBettors = betsByCategory['WORLD_CHAMPION'] ?? new Set()
            const scorerBettors = betsByCategory['TOP_SCORER'] ?? new Set()
            const missingChamp = (allPlayers ?? []).filter(p => !champBettors.has(p.id))
            const missingScorer = (allPlayers ?? []).filter(p => !scorerBettors.has(p.id))
            const minsUntil = Math.round((firstKickoff.getTime() - now.getTime()) / 60_000)
            const urgency = minsUntil < 60 ? 'border-red-300 bg-red-50' : minsUntil < 180 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'
            return (
              <div className={`rounded-lg border px-4 py-3 space-y-3 ${urgency}`}>
                <div className="text-xs text-gray-500">
                  Sulkeutuu: {formatDate(firstKickoff.toISOString())}
                  {minsUntil < 60 && <span className="ml-1 font-semibold text-red-600">({minsUntil} min)</span>}
                </div>
                {[
                  { label: '🏆 Maailmanmestari', missing: missingChamp, count: champBettors.size },
                  { label: '⚽ Paras maalintekijä', missing: missingScorer, count: scorerBettors.size },
                ].map(({ label, missing, count }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{label}</span>
                      <span className={`text-sm font-bold ${count === playerCount ? 'text-green-600' : 'text-gray-700'}`}>
                        {count} / {playerCount}
                      </span>
                    </div>
                    <MissingChips missing={missing} />
                  </div>
                ))}
              </div>
            )
          })()}

          {groupDeadlines.map(({ group, kickoff }) => {
            const bettors = betsByCategory[group] ?? new Set()
            const missing = (allPlayers ?? []).filter(p => !bettors.has(p.id))
            const minsUntil = Math.round((kickoff.getTime() - now.getTime()) / 60_000)
            const urgency = minsUntil < 60 ? 'border-red-300 bg-red-50' : minsUntil < 180 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'
            return (
              <div key={group} className={`rounded-lg border px-4 py-3 ${urgency}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{group.replace('GROUP_', 'Ryhmä ')}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Sulkeutuu: {formatDate(kickoff.toISOString())}
                      {minsUntil < 60 && <span className="ml-1 font-semibold text-red-600">({minsUntil} min)</span>}
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${bettors.size === playerCount ? 'text-green-600' : 'text-gray-700'}`}>
                    {bettors.size} / {playerCount}
                  </span>
                </div>
                <MissingChips missing={missing} />
              </div>
            )
          })}
        </section>
      )}

      {/* Match predictions closing soon */}
      {matches && matches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Otteluveikkaukset</h2>
          {matches.map(match => {
            const deadline = new Date(new Date(match.kickoff_at).getTime() - 5 * 60 * 1000)
            const predicted = predsByMatch[match.id] ?? new Set()
            const missing = (allPlayers ?? []).filter(p => !predicted.has(p.id))
            const home = getCountry(match.home_team)
            const away = getCountry(match.away_team)
            const minsUntil = Math.round((deadline.getTime() - now.getTime()) / 60_000)
            const urgency = minsUntil < 60 ? 'border-red-300 bg-red-50' : minsUntil < 180 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'

            return (
              <div key={match.id} className={`rounded-lg border px-4 py-3 ${urgency}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-sm flex items-center gap-1 flex-wrap">
                      {home.code && <img src={flagUrl(home.code)} alt={home.name} width={18} height={14} className="rounded-sm" />}
                      {home.name}
                      <span className="text-gray-400">–</span>
                      {away.code && <img src={flagUrl(away.code)} alt={away.name} width={18} height={14} className="rounded-sm" />}
                      {away.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Sulkeutuu: {formatDate(deadline.toISOString())}
                      {minsUntil < 60 && <span className="ml-1 font-semibold text-red-600">({minsUntil} min)</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${predicted.size === playerCount ? 'text-green-600' : 'text-gray-700'}`}>
                      {predicted.size} / {playerCount}
                    </div>
                    <div className="text-xs text-gray-400">veikannut</div>
                  </div>
                </div>
                <MissingChips missing={missing} />
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
