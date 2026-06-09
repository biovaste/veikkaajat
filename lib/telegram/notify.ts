import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendMessage, sendPhoto, sendPhotoBuffer, getQuickChartUrl } from './bot'
import { getCountry } from '../countries'
import { isWildcard, wildcardCountry } from '../players'
import { calculatePoints } from '../scoring/engine'
import { CHART_COLOR_HEXES } from '../colors'

const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MatchInfo {
  id: number
  home_team: string
  away_team: string
  kickoff_at: string
  home_score: number
  away_score: number
}

export interface PredictionRow {
  user_id: string
  home_score_pred: number
  away_score_pred: number
  points: number
}

export interface PlayerInfo {
  id: string
  display_name: string
  telegram_chat_id: string | null
}

export interface LeaderboardRow {
  user_id: string
  display_name: string
  total: number
  prev_position: number
  new_position: number
}

// ─── Kickoff message ──────────────────────────────────────────────────────────

export async function sendKickoffMessage(
  match: Pick<MatchInfo, 'home_team' | 'away_team'>,
  predictions: Pick<PredictionRow, 'user_id' | 'home_score_pred' | 'away_score_pred'>[],
  players: PlayerInfo[],
): Promise<void> {
  const nameMap = Object.fromEntries(players.map((p) => [p.id, p.display_name]))
  const predictedIds = new Set(predictions.map((p) => p.user_id))

  const lines = predictions.map(
    (p) => `${nameMap[p.user_id] ?? '?'}: ${p.home_score_pred}–${p.away_score_pred}`,
  )
  const notPredicted = players.filter((p) => !predictedIds.has(p.id)).map((p) => p.display_name)

  let text = `🔔 <b>${match.home_team} – ${match.away_team}</b>\n\n`
  text += '<b>Veikkaukset:</b>\n'
  if (lines.length) text += lines.join('\n') + '\n'
  if (notPredicted.length) text += `\n<i>Ei veikannut: ${notPredicted.join(', ')}</i>`

  await sendMessage(GROUP_CHAT_ID, text)
}

// ─── Result message ───────────────────────────────────────────────────────────

export async function sendResultMessage(
  match: MatchInfo,
  predictions: PredictionRow[],
  players: PlayerInfo[],
  leaderboard: LeaderboardRow[],
): Promise<void> {
  const nameMap = Object.fromEntries(players.map((p) => [p.id, p.display_name]))
  const predMap = Object.fromEntries(
    predictions.map((p) => [p.user_id, p]),
  )

  // Sort predictions by points descending for the match summary
  const sorted = [...predictions].sort((a, b) => b.points - a.points)

  let text = `⚽ <b>${match.home_team} – ${match.away_team}</b>\n`
  text += `Tulos: <b>${match.home_score}–${match.away_score}</b>\n\n`
  text += '<b>Pisteet:</b>\n'

  for (const pred of sorted) {
    const name = nameMap[pred.user_id] ?? '?'
    text += `${name}: ${pred.points} p (veikkaus ${pred.home_score_pred}–${pred.away_score_pred})\n`
  }

  // Players who didn't predict
  const predictedIds = new Set(predictions.map((p) => p.user_id))
  const missed = players.filter((p) => !predictedIds.has(p.id))
  if (missed.length) {
    text += missed.map((p) => `${p.display_name}: – (ei veikkaus)`).join('\n') + '\n'
  }

  // Leaderboard with position arrows
  text += '\n<b>Sarjataulukko:</b>\n'
  for (const row of leaderboard) {
    const delta = row.prev_position - row.new_position // positive = moved up
    const arrow = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : '→'
    const matchPoints = predMap[row.user_id]?.points ?? 0
    text += `${row.new_position}. ${row.display_name} — ${row.total} p <i>(${arrow}, +${matchPoints})</i>\n`
  }

  await sendMessage(GROUP_CHAT_ID, text)
}

// ─── Individual reminder ──────────────────────────────────────────────────────

export async function sendReminderDM(
  chatId: string,
  match: Pick<MatchInfo, 'home_team' | 'away_team'>,
): Promise<void> {
  const text =
    `⏰ Muistutus!\n` +
    `<b>${match.home_team} – ${match.away_team}</b> alkaa pian.\n` +
    `Et ole vielä veikannut tätä ottelua.\n` +
    `Veikkaa: ${APP_URL}/matches`
  await sendMessage(chatId, text)
}

// ─── Stats table ─────────────────────────────────────────────────────────────

export async function sendStatsTable(chatId?: number | string): Promise<void> {
  const target = String(chatId ?? GROUP_CHAT_ID)
  const admin = createServiceRoleClient()

  const [{ data: log }, { data: profiles }, { data: catBets }, { data: preds }, { data: firstMatch }, { data: xgMatches }] = await Promise.all([
    admin.from('scoring_log').select('user_id, points, breakdown, match_id, matches(stage, kickoff_at)').order('match_id', { ascending: true }),
    admin.from('profiles').select('id, display_name').order('display_name'),
    admin.from('category_bets').select('user_id, category, bet_value, points'),
    admin.from('predictions').select('user_id, home_score_pred, away_score_pred, match_id, matches(home_score, away_score, status, home_xg, away_xg)'),
    admin.from('matches').select('kickoff_at').order('kickoff_at', { ascending: true }).limit(1).single(),
    admin.from('matches').select('id, home_xg, away_xg').not('home_xg', 'is', null).not('away_xg', 'is', null),
  ])

  // Special bet picks are hidden until the betting deadline (first match kickoff) has passed
  const categoryBetsOpen = !firstMatch?.kickoff_at || new Date() < new Date(firstMatch.kickoff_at)

  if (!profiles) {
    await sendMessage(target, '⚠️ Tilastoja ei saatavilla.')
    return
  }

  type PlayerStats = {
    display_name: string
    total: number
    bonus: number
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
    champion_bet: string | null
    scorer_bet: string | null
  }

  const stats: Record<string, PlayerStats> = {}
  for (const p of profiles) {
    stats[p.id] = {
      display_name: p.display_name, total: 0, bonus: 0, matches: 0,
      exact: 0, correct_result: 0, zero_matches: 0,
      group_pts: 0, group_n: 0, knockout_pts: 0, knockout_n: 0,
      draw_preds: 0, draw_correct: 0, decisive_preds: 0, decisive_correct: 0,
      lead_count: 0,
      xg_pts: 0, xg_n: 0,
      champion_bet: null, scorer_bet: null,
    }
  }

  // Match points from scoring_log
  for (const row of log ?? []) {
    const s = stats[row.user_id]
    if (!s) continue
    s.total += row.points
    s.matches += 1
    if (row.points === 0) s.zero_matches += 1
    const b = row.breakdown as { result: number; home_goals: number; away_goals: number }
    if (b.result === 3 && b.home_goals === 1 && b.away_goals === 1) s.exact += 1
    if (b.result === 3) s.correct_result += 1
    const stage = (Array.isArray(row.matches) ? row.matches[0] : row.matches)?.stage
    if (stage === 'GROUP_STAGE') { s.group_pts += row.points; s.group_n += 1 }
    else if (stage) { s.knockout_pts += row.points; s.knockout_n += 1 }
  }

  // Leadership: count calendar days (Helsinki, UTC+3) each player led at end of day
  {
    const byMatch: Map<number, { user_id: string; points: number; kickoff_at: string }[]> = new Map()
    for (const row of log ?? []) {
      if (!byMatch.has(row.match_id)) byMatch.set(row.match_id, [])
      const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
      byMatch.get(row.match_id)!.push({ user_id: row.user_id, points: row.points, kickoff_at: m?.kickoff_at ?? '' })
    }

    // Group matches by "accounting day": resets at 10:00 Helsinki (UTC+3).
    // Shift = Helsinki offset (3h) minus 10h = -7h from UTC, so games finishing
    // after midnight Helsinki (US kick-offs) still fall under the previous day.
    const byDay: Map<string, number[]> = new Map()
    for (const [match_id, rows] of byMatch) {
      const kickoff = rows[0]?.kickoff_at
      const helsinkiDate = kickoff
        ? new Date(new Date(kickoff).getTime() - 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : 'unknown'
      if (!byDay.has(helsinkiDate)) byDay.set(helsinkiDate, [])
      byDay.get(helsinkiDate)!.push(match_id)
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

  // Category bets
  for (const row of catBets ?? []) {
    const s = stats[row.user_id]
    if (!s) continue
    if (row.points !== null) { s.total += row.points; s.bonus += row.points }
    // Only reveal picks after betting has closed
    if (!categoryBetsOpen) {
      if (row.category === 'WORLD_CHAMPION') s.champion_bet = row.bet_value
      if (row.category === 'TOP_SCORER') s.scorer_bet = row.bet_value
    }
  }

  // Draw / decisive prediction accuracy + xG-based points
  // Build a lookup: match_id → { home_xg, away_xg }
  const xgByMatch: Record<number, { home_xg: number; away_xg: number }> = {}
  for (const m of xgMatches ?? []) {
    if (m.home_xg !== null && m.away_xg !== null) {
      xgByMatch[m.id] = { home_xg: m.home_xg, away_xg: m.away_xg }
    }
  }
  const hasXg = Object.keys(xgByMatch).length > 0

  for (const row of preds ?? []) {
    const s = stats[row.user_id]
    if (!s) continue
    const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
    if (!m || m.status !== 'FINISHED' || m.home_score === null || m.away_score === null) continue

    // Draw / decisive accuracy
    const predDraw = row.home_score_pred === row.away_score_pred
    const actualDraw = m.home_score === m.away_score
    if (predDraw) { s.draw_preds++; if (actualDraw) s.draw_correct++ }
    else { s.decisive_preds++; if (!actualDraw) s.decisive_correct++ }

    // xG-based points: recalculate using rounded xG as the "actual" result
    const xg = xgByMatch[row.match_id]
    if (xg) {
      const xgHome = Math.round(xg.home_xg)
      const xgAway = Math.round(xg.away_xg)
      const { total } = calculatePoints(
        { home: row.home_score_pred, away: row.away_score_pred },
        { home: xgHome, away: xgAway },
      )
      s.xg_pts += total
      s.xg_n += 1
    }
  }

  const sorted = Object.values(stats).sort((a, b) => b.total - a.total)
  const scoredMatches = Math.max(...sorted.map(s => s.matches), 0)

  const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 100) + '%' : '–'
  const avg = (pts: number, n: number) => n > 0 ? (pts / n).toFixed(1).replace('.', ',') : '–'

  const hasBets = !categoryBetsOpen && sorted.some(s => s.champion_bet || s.scorer_bet)

  // Text summary + link to full stats on /leaderboard
  const lines = sorted.map((s, i) =>
    `${i + 1}. ${s.display_name} — ${s.total} p  KA ${avg(s.total - s.bonus, s.matches)}  Tark ${s.exact}  Jht ${s.lead_count}`
  )
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const text =
    `📊 <b>MM 2026 — Tilastot — ${scoredMatches} ottelua</b>\n\n` +
    `<code>${lines.join('\n')}</code>\n\n` +
    `🔗 Kaikki tilastot: ${appUrl}/leaderboard`
  await sendMessage(target, text)
}

// ─── Chart image ─────────────────────────────────────────────────────────────

export async function sendChartImage(chatId?: number | string): Promise<void> {
  const target = String(chatId ?? GROUP_CHAT_ID)
  const admin = createServiceRoleClient()

  const { data: log } = await admin
    .from('scoring_log')
    .select('user_id, points, match_id, matches(kickoff_at), profiles(display_name)')
    .order('match_id', { ascending: true })

  if (!log || log.length === 0) {
    await sendMessage(target, '📈 Ei vielä pisteitä piirrettäväksi.')
    return
  }

  // Build cumulative chart data (same logic as leaderboard page)
  const playerNames = new Set<string>()
  const byMatch: Record<number, { name: string; points: number }[]> = {}

  for (const row of log ?? []) {
    const name = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.display_name
    if (!name) continue
    playerNames.add(name)
    if (!byMatch[row.match_id]) byMatch[row.match_id] = []
    byMatch[row.match_id].push({ name, points: row.points })
  }

  const players = [...playerNames]
  const running: Record<string, number> = Object.fromEntries(players.map((n) => [n, 0]))
  const labels: number[] = []
  const datasets: Record<string, number[]>[] = players.map(() => ({ data: [] as number[] }))

  let idx = 1
  for (const matchId of Object.keys(byMatch).map(Number)) {
    for (const { name, points } of byMatch[matchId]) {
      running[name] = (running[name] ?? 0) + points
    }
    labels.push(idx++)
    players.forEach((name, i) => datasets[i].data.push(running[name] ?? 0))
  }

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: players.map((name, i) => ({
        label: name,
        data: datasets[i].data,
        borderColor: CHART_COLOR_HEXES[i % CHART_COLOR_HEXES.length],
        backgroundColor: 'transparent',
        fill: false,
        tension: 0,
        pointRadius: 2,
        borderWidth: 2,
      })),
    },
    options: {
      title: { display: true, text: 'MM 2026 — Pistekehitys', fontSize: 16 },
      legend: { position: 'bottom' },
      scales: {
        xAxes: [{ scaleLabel: { display: true, labelString: 'Ottelu' } }],
        yAxes: [{ scaleLabel: { display: true, labelString: 'Pisteet' } }],
      },
    },
  }

  try {
    const url = await getQuickChartUrl(chartConfig, 900, 500)
    await sendPhoto(target, url, '📈 MM 2026 — Pistekehitys')
  } catch (err) {
    console.error('[chart]', err)
    await sendMessage(target, '⚠️ Kaavio ei onnistu juuri nyt.')
  }
}

// ─── Clan war ────────────────────────────────────────────────────────────────

const CLAN_EMOJI: Record<string, string> = {
  'Beeläiset':   '🅱️',
  'Ceeläiset':   '©️',
  'Independents': '🏴',
}

export async function sendClanWar(chatId?: number | string): Promise<void> {
  const target = String(chatId ?? GROUP_CHAT_ID)
  const admin = createServiceRoleClient()

  const [{ data: profiles }, { data: log }, { data: catBets }] = await Promise.all([
    admin.from('profiles').select('id, display_name, clan').order('display_name'),
    admin.from('scoring_log').select('user_id, points'),
    admin.from('category_bets').select('user_id, points'),
  ])

  if (!profiles) {
    await sendMessage(target, '⚠️ Tietoja ei saatavilla.')
    return
  }

  // Total points per player
  const pts: Record<string, number> = {}
  for (const p of profiles) pts[p.id] = 0
  for (const row of log ?? [])     pts[row.user_id] = (pts[row.user_id] ?? 0) + row.points
  for (const row of catBets ?? []) pts[row.user_id] = (pts[row.user_id] ?? 0) + (row.points ?? 0)

  // Group by clan
  const CLANS = ['Beeläiset', 'Ceeläiset', 'Independents']
  const groups: Record<string, { display_name: string; total: number }[]> = {
    'Beeläiset': [], 'Ceeläiset': [], 'Independents': [],
  }
  const noClan: { display_name: string; total: number }[] = []

  for (const p of profiles) {
    const entry = { display_name: p.display_name, total: pts[p.id] ?? 0 }
    if (p.clan && CLANS.includes(p.clan as string)) {
      groups[p.clan as string].push(entry)
    } else {
      noClan.push(entry)
    }
  }

  // Sort members within each clan by points desc
  for (const clan of CLANS) groups[clan].sort((a, b) => b.total - a.total)

  // Clan totals and averages
  const clanStats = CLANS.map(clan => {
    const members = groups[clan]
    const total = members.reduce((s, m) => s + m.total, 0)
    const avg = members.length > 0 ? total / members.length : 0
    return { clan, members, total, avg }
  }).sort((a, b) => b.avg - a.avg) // rank by average (fairer if unequal sizes)

  let text = '⚔️ <b>Luokkasota</b>\n\n'

  for (let i = 0; i < clanStats.length; i++) {
    const { clan, members, total, avg } = clanStats[i]
    const emoji = CLAN_EMOJI[clan] ?? '🏳️'
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'
    text += `${rank} ${emoji} <b>${clan}</b> — ${total} p  KA ${avg.toFixed(1).replace('.', ',')}\n`
    for (const m of members) {
      text += `   ${m.display_name} — ${m.total} p\n`
    }
    if (members.length === 0) text += `   <i>Ei jäseniä</i>\n`
    text += '\n'
  }

  if (noClan.length > 0) {
    text += `<i>Ilman luokkaa: ${noClan.map(m => m.display_name).join(', ')}</i>`
  }

  await sendMessage(target, text.trim())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function padR(s: string, len: number) { return s.slice(0, len).padEnd(len) }
function padL(s: string, len: number) { return s.slice(0, len).padStart(len) }
function truncate(s: string, len: number) { return s.length > len ? s.slice(0, len - 1) + '…' : s }
