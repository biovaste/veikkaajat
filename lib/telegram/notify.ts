import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendMessage, sendPhoto, getQuickChartUrl } from './bot'

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

export async function sendStatsTable(): Promise<void> {
  const admin = createServiceRoleClient()

  // Total points and breakdown from scoring_log
  const { data: log } = await admin
    .from('scoring_log')
    .select('user_id, points, breakdown')

  // All profiles
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name')
    .order('display_name')

  if (!profiles) {
    await sendMessage(GROUP_CHAT_ID, '⚠️ Tilastoja ei saatavilla.')
    return
  }

  // Compute per-player stats
  type Stats = {
    display_name: string
    total: number
    matches: number
    exact: number
    correct_result: number
  }
  const stats: Record<string, Stats> = {}

  for (const p of profiles) {
    stats[p.id] = { display_name: p.display_name, total: 0, matches: 0, exact: 0, correct_result: 0 }
  }

  for (const row of log ?? []) {
    const s = stats[row.user_id]
    if (!s) continue
    s.total += row.points
    s.matches += 1
    const b = row.breakdown as { result: number; home_goals: number; away_goals: number }
    if (b.result === 3 && b.home_goals === 1 && b.away_goals === 1) s.exact += 1
    if (b.result === 3) s.correct_result += 1
  }

  const sorted = Object.values(stats).sort((a, b) => b.total - a.total)
  const playedCount = (log ?? []).length > 0 ? new Set((log ?? []).map((r) => r.user_id)).size : 0

  // Format as monospace table
  const scoredMatches = sorted[0]?.matches ?? 0
  const header = `📊 <b>Tilastot — ${scoredMatches} ottelua pisteytetty</b>\n\n`
  const colHeader = padR('Pelaaja', 15) + padL('Pts', 4) + padL('KA', 5) + padL('Tark', 5) + padL('Mrk%', 5)
  const separator = '─'.repeat(34)

  const rows = sorted.map((s) => {
    const avg = s.matches > 0 ? (s.total / s.matches).toFixed(1) : '–'
    const merkki = s.matches > 0 ? Math.round((s.correct_result / s.matches) * 100) + '%' : '–'
    return padR(truncate(s.display_name, 14), 15) + padL(String(s.total), 4) + padL(avg, 5) + padL(String(s.exact), 5) + padL(merkki, 5)
  })

  const body = `<code>${colHeader}\n${separator}\n${rows.join('\n')}</code>`
  await sendMessage(GROUP_CHAT_ID, header + body)
}

// ─── Chart image ─────────────────────────────────────────────────────────────

export async function sendChartImage(): Promise<void> {
  const admin = createServiceRoleClient()

  const { data: log } = await admin
    .from('scoring_log')
    .select('user_id, points, match_id, matches(kickoff_at), profiles(display_name)')
    .order('match_id', { ascending: true })

  if (!log || log.length === 0) {
    await sendMessage(GROUP_CHAT_ID, '📈 Ei vielä pisteitä piirrettäväksi.')
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
    await sendPhoto(GROUP_CHAT_ID, url, '📈 MM 2026 — Pistekehitys')
  } catch (err) {
    console.error('[chart]', err)
    await sendMessage(GROUP_CHAT_ID, '⚠️ Kaavio ei onnistu juuri nyt.')
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function padR(s: string, len: number) { return s.slice(0, len).padEnd(len) }
function padL(s: string, len: number) { return s.slice(0, len).padStart(len) }
function truncate(s: string, len: number) { return s.length > len ? s.slice(0, len - 1) + '…' : s }
