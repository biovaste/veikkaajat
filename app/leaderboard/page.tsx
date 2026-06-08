import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PointsChart from '@/components/PointsChart'
import ChatBox from '@/components/ChatBox'
import { calculatePoints } from '@/lib/scoring/engine'
import { assignColors } from '@/lib/colors'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const myId = user.id

  // ── Fetch data with explicit error logging ─────────────────────────────────

  // Service role client bypasses RLS — needed to read all players' predictions
  const srSupabase = createServiceRoleClient()

  const [
    { data: allProfiles, error: profilesError },
    { data: log, error: logError },
    { data: categoryBets, error: betsError },
    { data: preds, error: predsError },
    { data: xgMatches },
    { data: firstMatch },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name, chart_color').order('display_name'),
    supabase.from('scoring_log').select('user_id, points, breakdown, match_id, matches(stage, kickoff_at)').order('match_id', { ascending: true }),
    supabase.from('category_bets').select('user_id, points, category').not('points', 'is', null),
    srSupabase.from('predictions').select('user_id, home_score_pred, away_score_pred, match_id, matches(home_score, away_score, status)'),
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
    yllatys_correct: number; yllatys_total: number
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
      draw_preds: 0, draw_correct: 0, yllatys_correct: 0, yllatys_total: 0,
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

  // xG points
  const xgByMatch: Record<number, { home_xg: number; away_xg: number }> = {}
  for (const m of xgMatches ?? []) {
    if (m.home_xg !== null && m.away_xg !== null) xgByMatch[m.id] = { home_xg: m.home_xg, away_xg: m.away_xg }
  }
  const hasXg = Object.keys(xgByMatch).length > 0

  // Per-match prediction stats: draw accuracy, xG, and Yllätys%.
  // preds comes via service role so we have ALL players' predictions.
  {
    // Group by match_id for Yllätys% computation
    type PredEntry = { user_id: string; pred_sign: number; actual_sign: number }
    const byMatch: Record<number, PredEntry[]> = {}

    for (const row of preds ?? []) {
      const s = stats[row.user_id]
      const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
      if (!m || m.status !== 'FINISHED' || m.home_score === null || m.away_score === null) continue

      const pred_sign = Math.sign(row.home_score_pred - row.away_score_pred)
      const actual_sign = Math.sign(m.home_score - m.away_score)

      // Draw accuracy (own stat)
      if (s) {
        if (pred_sign === 0) { s.draw_preds++; if (actual_sign === 0) s.draw_correct++ }
      }

      // xG points (own stat)
      if (s) {
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

      if (!byMatch[row.match_id]) byMatch[row.match_id] = []
      byMatch[row.match_id].push({ user_id: row.user_id, pred_sign, actual_sign })
    }

    // Yllätys%: player predicted a minority result (≤25% of predictors chose the same sign).
    // - Predicted minority + correct  → yllatys_total++ AND yllatys_correct++
    // - Predicted minority + wrong    → yllatys_total++ only
    // - Predicted majority            → nothing
    for (const entries of Object.values(byMatch)) {
      const total = entries.length
      if (total === 0) continue

      // Count how many players predicted each result sign
      const signCount: Record<number, number> = {}
      for (const { pred_sign } of entries) signCount[pred_sign] = (signCount[pred_sign] ?? 0) + 1

      for (const { user_id, pred_sign, actual_sign } of entries) {
        const fraction = (signCount[pred_sign] ?? 0) / total
        if (fraction > 0.25) continue // majority prediction — doesn't count
        const s = stats[user_id]
        if (!s) continue
        s.yllatys_total++
        if (pred_sign === actual_sign) s.yllatys_correct++
      }
    }
  }

  const sorted = Object.values(stats).sort((a, b) => b.total - a.total)
  const scoredMatches = sorted.reduce((max, s) => Math.max(max, s.matches), 0)

  // Assign chart colors (explicit picks first, rest filled from pool)
  const colorMap = assignColors(
    sorted.map(s => ({
      id: s.id,
      chart_color: profiles.find(p => p.id === s.id)?.chart_color ?? null,
    }))
  )
  // Array of colors in sorted order, for the chart
  const playerColors = sorted.map(s => colorMap[s.id])

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

  // ── Stats rows definition (transposed table) ────────────────────────────────

  type StatRow = { label: string; title: string; value: (s: typeof sorted[0]) => string; bold?: boolean }
  const statRows: StatRow[] = [
    { label: 'Pts',      title: 'Pisteet yhteensä',                              bold: true, value: s => String(s.total) },
    { label: 'KA',       title: 'Pistekeskiarvo (tulosvedot)',                               value: s => avg(s.match_pts, s.matches) },
    { label: 'Tark',     title: 'Täysosumat (oikea tulos ja molemmat maalit)',               value: s => String(s.exact) },
    { label: 'Mrk%',     title: 'Oikeat merkit %',                                           value: s => pct(s.correct_result, s.matches) },
    { label: 'Nol%',     title: 'Nollaottelut %',                                            value: s => pct(s.zero_matches, s.matches) },
    { label: 'L-KA',     title: 'Lohkovaihe KA',                                            value: s => avg(s.group_pts, s.group_n) },
    { label: 'J-KA',     title: 'Jatkopelit KA',                                            value: s => avg(s.knockout_pts, s.knockout_n) },
    { label: 'Tas%',     title: 'Tasurihakujen osuma %',                                    value: s => pct(s.draw_correct, s.draw_preds) },
    { label: 'Yllätys%', title: 'Oikea merkki kun ≤25% veikkasi samoin',                   value: s => pct(s.yllatys_correct, s.yllatys_total) },
    { label: 'Jht',      title: 'Päiviä johdossa',                                          value: s => String(s.lead_count) },
    ...(hasXg ? [{ label: 'xG-Pts', title: 'xG:n mukainen pistetilanne', value: (s: typeof sorted[0]) => s.xg_n > 0 ? String(s.xg_pts) : '–' }] : []),
    ...(!categoryBetsOpen && sorted.some(x => x.bonus > 0)
      ? [{ label: 'Bonus', title: 'Erikoisveikkausten bonus', value: (s: typeof sorted[0]) => s.bonus > 0 ? `+${s.bonus}` : '–' }]
      : []),
  ]

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
          <PointsChart data={chartData} players={players} colors={playerColors} />

          {/* ── Stats table (transposed: stats = rows, players = columns) ── */}
          {(
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Tilastot</h2>
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="text-xs whitespace-nowrap w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {/* Stat label column header */}
                      <th className="sticky left-0 bg-gray-50 px-3 py-2 w-20" />
                      {sorted.map((p, i) => {
                        const isMe = p.id === myId
                        const isLeader = i === 0
                        return (
                          <th
                            key={p.id}
                            className={`px-2 pt-2 pb-1 text-center font-medium ${isMe ? 'bg-blue-50' : isLeader ? 'bg-yellow-50' : 'bg-gray-50'}`}
                          >
                            {/* Vertically rotated player name */}
                            <div
                              className="inline-block text-gray-700"
                              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '5rem', fontSize: '11px' }}
                            >
                              {p.display_name}
                              {isMe && ' ★'}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {statRows.map((row, ri) => (
                      <tr key={row.label} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td
                          className="sticky left-0 px-3 py-1.5 font-semibold text-gray-500 bg-inherit border-r border-gray-100"
                          title={row.title}
                        >
                          {row.label}
                        </td>
                        {sorted.map((p, i) => {
                          const isMe = p.id === myId
                          const isLeader = i === 0
                          return (
                            <td
                              key={p.id}
                              className={`px-2 py-1.5 text-center ${row.bold ? 'font-bold' : ''} ${isMe ? 'bg-blue-50' : isLeader ? 'bg-yellow-50' : ''}`}
                            >
                              {row.value(p)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <p className="text-xs text-gray-400 leading-relaxed">
                KA=pistekeskiarvo · Tark=täysosumat · Mrk%=oikeat merkit · Nol%=nollaottelut ·
                L-KA=lohkovaihe KA · J-KA=jatkopelit KA · Tas%=tasurihakujen osuma ·
                Yllätys%=oikea merkki kun ≤25% veikkasi samoin · Jht=päiviä johdossa
                {hasXg ? ' · xG-Pts=xG:n mukainen pistetilanne' : ''}
              </p>
            </div>
          )}
        </>
      )}
      {/* ── Chat ── */}
      <ChatBox myId={myId} />
    </div>
  )
}
