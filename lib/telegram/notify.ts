import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendMessage, sendPhoto, getQuickChartUrl } from './bot'
import { getCountry } from '../countries'
import { isWildcard, wildcardCountry } from '../players'

const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

// Colours matching PointsChart.tsx
const COLOURS = [
  '#2563eb', '#dc2626', '#d97706', '#16a34a', '#9333ea',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0d9488',
  '#7c3aed', '#b45309', '#15803d', '#1d4ed8', '#be185d',
  '#0369a1', '#92400e', '#166534', '#6d28d9', '#9f1239',
]

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

  const [{ data: log }, { data: profiles }, { data: catBets }, { data: preds }] = await Promise.all([
    admin.from('scoring_log').select('user_id, points, breakdown, match_id, matches(stage, kickoff_at)').order('match_id', { ascending: true }),
    admin.from('profiles').select('id, display_name').order('display_name'),
    admin.from('category_bets').select('user_id, category, bet_value, points'),
    admin.from('predictions').select('user_id, home_score_pred, away_score_pred, matches(home_score, away_score, status)'),
  ])

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

  // Leadership: replay standings after each match (log already ordered by match_id asc)
  // Group rows by match_id, then walk in kickoff order
  {
    const byMatch: Map<number, { user_id: string; points: number }[]> = new Map()
    const matchOrder: { match_id: number; kickoff_at: string }[] = []
    for (const row of log ?? []) {
      if (!byMatch.has(row.match_id)) {
        byMatch.set(row.match_id, [])
        const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
        matchOrder.push({ match_id: row.match_id, kickoff_at: m?.kickoff_at ?? '' })
      }
      byMatch.get(row.match_id)!.push({ user_id: row.user_id, points: row.points })
    }
    matchOrder.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))

    const running: Record<string, number> = {}
    for (const { match_id } of matchOrder) {
      for (const { user_id, points } of byMatch.get(match_id) ?? []) {
        running[user_id] = (running[user_id] ?? 0) + points
      }
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
    if (row.category === 'WORLD_CHAMPION') s.champion_bet = row.bet_value
    if (row.category === 'TOP_SCORER') s.scorer_bet = row.bet_value
  }

  // Draw / decisive prediction accuracy
  for (const row of preds ?? []) {
    const s = stats[row.user_id]
    if (!s) continue
    const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
    if (!m || m.status !== 'FINISHED' || m.home_score === null || m.away_score === null) continue
    const predDraw = row.home_score_pred === row.away_score_pred
    const actualDraw = m.home_score === m.away_score
    if (predDraw) { s.draw_preds++; if (actualDraw) s.draw_correct++ }
    else { s.decisive_preds++; if (!actualDraw) s.decisive_correct++ }
  }

  const sorted = Object.values(stats).sort((a, b) => b.total - a.total)
  const scoredMatches = Math.max(...sorted.map(s => s.matches), 0)

  const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 100) + '%' : '–'
  const avg = (pts: number, n: number) => n > 0 ? (pts / n).toFixed(1).replace('.', ',') : '–'

  // ── Message 1: Standings ──────────────────────────────────────────────────
  const h1 = `📊 <b>Sarjataulukko — ${scoredMatches} ottelua</b>\n\n`
  const c1 = padR('#', 3) + padR('Pelaaja', 13) + padL('Pts', 4) + padL('KA', 5) + padL('Tark', 5) + padL('Mrk%', 5)
  const r1 = sorted.map((s, i) =>
    padR(`${i + 1}.`, 3) + padR(truncate(s.display_name, 12), 13) +
    padL(String(s.total), 4) + padL(avg(s.total - s.bonus, s.matches), 5) +
    padL(String(s.exact), 5) + padL(pct(s.correct_result, s.matches), 5)
  )
  await sendMessage(target, h1 + `<code>${c1}\n${'─'.repeat(35)}\n${r1.join('\n')}</code>`)

  // ── Message 2: Advanced stats ─────────────────────────────────────────────
  const h2 = `📈 <b>Lisätilastot</b>\n\n`
  const c2 = padR('Pelaaja', 13) + padL('Nol%', 5) + padL('L-KA', 5) + padL('J-KA', 5) + padL('Tas%', 5) + padL('Ylä%', 5) + padL('Jht', 4)
  const r2 = sorted.map(s =>
    padR(truncate(s.display_name, 12), 13) +
    padL(pct(s.zero_matches, s.matches), 5) +
    padL(avg(s.group_pts, s.group_n), 5) +
    padL(avg(s.knockout_pts, s.knockout_n), 5) +
    padL(pct(s.draw_correct, s.draw_preds), 5) +
    padL(pct(s.decisive_correct, s.decisive_preds), 5) +
    padL(String(s.lead_count), 4)
  )
  const legend2 = '\n\n<i>Nol%=nollaottelut, L-KA=lohkovaihe KA, J-KA=jatkopelit KA\nTas%=tasurihakujen osuma, Ylä%=voittohakujen osuma, Jht=johtohetket</i>'
  await sendMessage(target, h2 + `<code>${c2}\n${'─'.repeat(42)}\n${r2.join('\n')}</code>` + legend2)

  // ── Message 3: Special bets ───────────────────────────────────────────────
  const hasBets = sorted.some(s => s.champion_bet || s.scorer_bet)
  if (hasBets) {
    const h3 = `🎯 <b>Erikoisveikkaukset</b>\n\n`
    const c3 = padR('Pelaaja', 13) + '  ' + padR('Mestari', 12) + '  Maalikuningas'
    const r3 = sorted.map(s => {
      const champ = s.champion_bet ? getCountry(s.champion_bet).name : '–'
      const scorer = s.scorer_bet
        ? (isWildcard(s.scorer_bet) ? `Muu ${getCountry(wildcardCountry(s.scorer_bet)).name}` : s.scorer_bet)
        : '–'
      return padR(truncate(s.display_name, 12), 13) + '  ' + padR(truncate(champ, 11), 12) + '  ' + truncate(scorer, 18)
    })
    await sendMessage(target, h3 + `<code>${c3}\n${'─'.repeat(45)}\n${r3.join('\n')}</code>`)
  }
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
        borderColor: COLOURS[i % COLOURS.length],
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function padR(s: string, len: number) { return s.slice(0, len).padEnd(len) }
function padL(s: string, len: number) { return s.slice(0, len).padStart(len) }
function truncate(s: string, len: number) { return s.length > len ? s.slice(0, len - 1) + '…' : s }
