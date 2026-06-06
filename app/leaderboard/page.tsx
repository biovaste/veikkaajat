import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PointsChart from '@/components/PointsChart'
import { calculatePoints } from '@/lib/scoring/engine'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const myId = user.id

  // ── Fetch data with explicit error logging ─────────────────────────────────

  const [
    { data: allProfiles, error: profilesError },
    { data: log, error: logError },
    { data: categoryBets, error: betsError },
    { data: preds, error: predsError },
    { data: xgMatches },
    { data: firstMatch },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase.from('scoring_log').select('user_id, points, breakdown, match_id, matches(stage, kickoff_at)').order('match_id', { ascending: true }),
    supabase.from('category_bets').select('user_id, points, category').not('points', 'is', null),
    supabase.from('predictions').select('user_id, home_score_pred, away_score_pred, match_id, matches(home_score, away_score, status)'),
    supabase.from('matches').select('id, home_xg, away_xg').not('home_xg', 'is', null).not('away_xg', 'is', null),
    supabase.from('matches').select('kickoff_at').order('kickoff_at', { ascending: true }).limit(1).maybeSingle(),
  ])

  if (profilesError) console.error('[leaderboard] profiles error:', profilesError)
  if (logError) console.error('[leaderboard] scoring_log error:', logError)
  if (betsError) console.error('[leaderboard] category_bets error:', betsError)
  if (predsError) console.error('[leaderboard] predictions error:', predsError)

  // Profiles with no display_name fall back to email prefix (trigger ensures this, but guard anyway)
  const profiles = (allProfiles ?? []).filter(p => p.display_name)

  const categoryBetsOpen = !firstMatch?.kickoff_at || new Date() < new Date(firstMatch.kickoff_at)

  // ── Per-player stats ───────────────────────────────────────────────────────

  type PlayerStats = {
    id: string
    display_name: string
    total: number
    bonus: number
    match_pts: number
    matches: number
    exact: number
    correct_result: number
    zero_matches: number
    group_pts: number; group_n: number
    knockout_pts: number; knockout_n: number
    draw_preds: number; draw_correct: number
    decisive_preds: number; decisive_correct: number
    lead_count: number
    xg_pts: number; xg_n: number
  }

  const stats: Record<string, PlayerStats> = {}
  for (const p of profiles) {
    stats[p.id] = {
      id: p.id, display_name: p.display_name,
      total: 0, bonus: 0, match_pts: 0, matches: 0,
      exact: 0, correct_result: 0, zero_matches: 0,
      group_pts: 0, group_n: 0, knockout_pts: 0, knockout_n: 0,
      draw_preds: 0, draw_correct: 0, decisive_preds: 0, decisive_correct: 0,
      lead_count: 0, xg_pts: 0, xg_n: 0,
    }
  }

  // Match points
  for (const row of log ?? []) {
    const s = stats[row.user_id]
    if (!s) continue
    s.total += row.points
    s.match_pts += row.points
    s.matches += 1
    if (row.points === 0) s.zero_matches += 1
    const b = row.breakdown as { result: number; home_goals: number; away_goals: number } | null
    if (b && b.result === 3 && b.home_goals === 1 && b.away_goals === 1) s.exact += 1
    if (b && b.result === 3) s.correct_result += 1
    const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
    if (m?.stage === 'GROUP_STAGE') { s.group_pts += row.points; s.group_n += 1 }
    else if (m?.stage) { s.knockout_pts += row.points; s.knockout_n += 1 }
  }

  // Category bonus
  for (const row of categoryBets ?? []) {
    const s = stats[row.user_id]
    if (!s || row.points === null) continue
    s.total += row.points
    s.bonus += row.points
  }

  // Leadership: count calendar days (10:00 Helsinki cutoff = UTC−7)
  {
    const byMatch: Map<number, { user_id: string; points: number; kickoff_at: string }[]> = new Map()
    for (const row of log ?? []) {
      if (!byMatch.has(row.match_id)) byMatch.set(row.match_id, [])
      const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
      byMatch.get(row.match_id)!.push({ user_id: row.user_id, points: row.points, kickoff_at: m?.kickoff_at ?? '' })
    }
    const byDay: Map<string, number[]> = new Map()
    for (const [match_id, rows] of byMatch) {
      const kickoff = rows[0]?.kickoff_at
      const day = kickoff
        ? new Date(new Date(kickoff).getTime() - 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : 'unknown'
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(match_id)
    }
    const running: Record<string, number> = {}
    for (const day of [...byDay.keys()].sort()) {
      for (const match_id of byDay.get(day)!) {
        for (const { user_id, points } of byMatch.get(match_id)!) {
          running[user_id] = (running[user_id] ?? 0) + points
        }
      }
      if (Object.keys(running).length === 0) continue
      const maxPts = Math.max(...Object.values(running))
      for (const [uid, pts] of Object.entries(running)) {
        if (pts === maxPts && stats[uid]) stats[uid].lead_count++
      }
    }
  }

  // Draw / decisive accuracy + xG points
  const xgByMatch: Record<number, { home_xg: number; away_xg: number }> = {}
  for (const m of xgMatches ?? []) {
    if (m.home_xg !== null && m.away_xg !== null) xgByMatch[m.id] = { home_xg: m.home_xg, away_xg: m.away_xg }
  }
  const hasXg = Object.keys(xgByMatch).length > 0

  for (const row of preds ?? []) {
    const s = stats[row.user_id]
    if (!s) continue
    const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
    if (!m || m.status !== 'FINISHED' || m.home_score === null || m.away_score === null) continue
    const predDraw = row.home_score_pred === row.away_score_pred
    const actualDraw = m.home_score === m.away_score
    if (predDraw) { s.draw_preds++; if (actualDraw) s.draw_correct++ }
    else { s.decisive_preds++; if (!actualDraw) s.decisive_correct++ }
    const xg = xgByMatch[row.match_id]
    if (xg) {
      const { total } = calculatePoints(
        { home: row.home_score_pred, away: row.away_score_pred },
        { home: Math.round(xg.home_xg), away: Math.round(xg.away_xg) },
      )
      s.xg_pts += total
      s.xg_n += 1
    }
  }

  const sorted = Object.values(stats).sort((a, b) => b.total - a.total)
  const scoredMatches = sorted.reduce((max, s) => Math.max(max, s.matches), 0)

  const myName = sorted.find(s => s.id === myId)?.display_name ?? null

  // ── Chart data ─────────────────────────────────────────────────────────────

  const players = sorted.map(s => s.display_name)
  const byMatch2: Record<number, { name: string; points: number }[]> = {}
  for (const row of log ?? []) {
    const name = profiles.find(p => p.id === row.user_id)?.display_name
    if (!name) continue
    if (!byMatch2[row.match_id]) byMatch2[row.match_id] = []
    byMatch2[row.match_id].push({ name, points: row.points })
  }
  const chartData: Record<string, number>[] = []
  const running2: Record<string, number> = {}
  for (const p of players) running2[p] = 0
  let matchIndex = 1
  for (const matchId of Object.keys(byMatch2).map(Number)) {
    for (const { name, points } of byMatch2[matchId]) running2[name] = (running2[name] ?? 0) + points
    chartData.push({ match: matchIndex, ...Object.fromEntries(Object.entries(running2)) })
    matchIndex++
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const pct = (n: number, d: number) => d > 0 ? `${Math.round(n / d * 100)}%` : '–'
  const avg = (pts: number, n: number) => n > 0 ? (pts / n).toFixed(1).replace('.', ',') : '–'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sarjataulukko</h1>

      {sorted.length === 0 ? (
        <p className="text-gray-400 text-sm">
          Ei pelaajia vielä — admin lisää pelaajat kutsumalla heidät sähköpostilla.
        </p>
      ) : (
        <>
          {/* ── Leaderboard ── */}
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
                  const isMe = p.id === myId
                  return (
                    <tr key={p.id} className={isMe ? 'bg-blue-50' : i === 0 ? 'bg-yellow-50' : ''}>
                      <td className="px-4 py-2.5 font-medium text-gray-500">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {p.display_name}
                        {isMe && <span className="ml-1.5 text-xs text-blue-400">(sinä)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold">{p.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Chart ── */}
          <PointsChart data={chartData} players={players} />

          {/* ── Stats table ── */}
          {(
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Tilastot</h2>
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="text-xs whitespace-nowrap">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 sticky left-0 bg-gray-50">#</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 sticky left-6 bg-gray-50">Pelaaja</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Pisteet yhteensä">Pts</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Pistekeskiarvo (tulosvedot)">KA</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Täysosumat">Tark</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Oikeat merkit %">Mrk%</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Nollaottelut %">Nol%</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Lohkovaihe KA">L-KA</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Jatkopelit KA">J-KA</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Tasurihakujen osuma %">Tas%</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Voittohakujen osuma %">Ylä%</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600" title="Päiviä johdossa">Jht</th>
                      {hasXg && <th className="text-right px-3 py-2 font-medium text-gray-600" title="xG:n mukainen pistetilanne">xG-Pts</th>}
                      {!categoryBetsOpen && sorted.some(s => s.bonus > 0) && (
                        <th className="text-right px-3 py-2 font-medium text-gray-600" title="Erikoisveikkausten bonus">Bonus</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sorted.map((s, i) => {
                      const isMe = s.id === myId
                      return (
                        <tr key={s.id} className={isMe ? 'bg-blue-50' : i === 0 ? 'bg-yellow-50' : ''}>
                          <td className="px-3 py-2 text-gray-500 sticky left-0 bg-inherit">{i + 1}</td>
                          <td className="px-3 py-2 font-medium sticky left-6 bg-inherit">
                            {s.display_name}
                            {isMe && <span className="ml-1 text-blue-400">(sinä)</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{s.total}</td>
                          <td className="px-3 py-2 text-right">{avg(s.match_pts, s.matches)}</td>
                          <td className="px-3 py-2 text-right">{s.exact}</td>
                          <td className="px-3 py-2 text-right">{pct(s.correct_result, s.matches)}</td>
                          <td className="px-3 py-2 text-right">{pct(s.zero_matches, s.matches)}</td>
                          <td className="px-3 py-2 text-right">{avg(s.group_pts, s.group_n)}</td>
                          <td className="px-3 py-2 text-right">{avg(s.knockout_pts, s.knockout_n)}</td>
                          <td className="px-3 py-2 text-right">{pct(s.draw_correct, s.draw_preds)}</td>
                          <td className="px-3 py-2 text-right">{pct(s.decisive_correct, s.decisive_preds)}</td>
                          <td className="px-3 py-2 text-right">{s.lead_count}</td>
                          {hasXg && <td className="px-3 py-2 text-right">{s.xg_n > 0 ? s.xg_pts : '–'}</td>}
                          {!categoryBetsOpen && sorted.some(p => p.bonus > 0) && (
                            <td className="px-3 py-2 text-right">{s.bonus > 0 ? `+${s.bonus}` : '–'}</td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <p className="text-xs text-gray-400 leading-relaxed">
                KA=pistekeskiarvo (tulosvedot) · Tark=täysosumat · Mrk%=oikeat merkit · Nol%=nollaottelut ·
                L-KA=lohkovaihe KA · J-KA=jatkopelit KA · Tas%=tasurihakujen osuma · Ylä%=voittohakujen osuma ·
                Jht=päiviä johdossa{hasXg ? ' · xG-Pts=xG:n mukainen pistetilanne' : ''}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
