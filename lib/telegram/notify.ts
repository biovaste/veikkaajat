import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendMessage, sendMessageWithMarkup, sendPhoto, sendPhotoBuffer, sendPhotoBytes, getQuickChartUrl } from './bot'
import { resultDurationSuffix } from '../utils'
import { getCountry } from '../countries'
import { isWildcard, wildcardCountry } from '../players'
import { calculatePoints } from '../scoring/engine'
import { assignColors } from '../colors'
import { getEliminatedCountries, isChampionPickEliminated, isScorerPickEliminated } from '../eliminations'
import { fetchTopScorers } from '../football-data/client'
import { fetchAllRows } from '../supabase/fetch-all'

const ELIMINATED_COLOR = '#dc2626'

const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

/** Log a failed Telegram send for manual retry via /admin/telegram-failures. */
async function logTelegramFailure(args: {
  chatId: string | number; kind: string; matchId?: number; text: string; replyMarkup?: object; error: string
}): Promise<void> {
  const admin = createServiceRoleClient()
  await admin.from('telegram_send_failures').insert({
    chat_id: String(args.chatId),
    kind: args.kind,
    match_id: args.matchId ?? null,
    payload: { text: args.text, reply_markup: args.replyMarkup ?? null },
    error: args.error,
  }).then(() => {}, (err: unknown) => console.error('[logTelegramFailure]', err))
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MatchInfo {
  id: number
  home_team: string
  away_team: string
  kickoff_at: string
  home_score: number
  away_score: number
  result_duration?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | null
  extra_time_home?: number | null
  extra_time_away?: number | null
  penalties_home?: number | null
  penalties_away?: number | null
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
  text += `Tulos: <tg-spoiler><b>${match.home_score}–${match.away_score}</b>${resultDurationSuffix(match)}\n\n`
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
  text += '</tg-spoiler>'

  const res = await sendMessage(GROUP_CHAT_ID, text)
  if (!res.ok) await logTelegramFailure({ chatId: GROUP_CHAT_ID, kind: 'result', matchId: match.id, text, error: res.error ?? 'unknown' })
}

// ─── Individual reminder ──────────────────────────────────────────────────────

export async function sendReminderDM(
  chatId: string,
  match: Pick<MatchInfo, 'id' | 'home_team' | 'away_team'>,
): Promise<void> {
  const text =
    `⏰ Muistutus!\n` +
    `<b>${match.home_team} – ${match.away_team}</b> alkaa pian.\n` +
    `Et ole vielä veikannut tätä ottelua.`
  const replyMarkup = {
    inline_keyboard: [[
      { text: '✏️ Veikkaa nyt', callback_data: `edit:${match.id}` },
    ]],
  }
  const res = await sendMessageWithMarkup(chatId, text, replyMarkup)
  if (!res.ok) await logTelegramFailure({ chatId, kind: 'reminder', matchId: match.id, text, replyMarkup, error: res.error ?? 'unknown' })
}

// ─── Stats table ─────────────────────────────────────────────────────────────

export async function sendStatsTable(chatId?: number | string): Promise<void> {
  const target = String(chatId ?? GROUP_CHAT_ID)
  const admin = createServiceRoleClient()

  const [{ data: log }, { data: profiles }, { data: catBets }, { data: preds }, { data: firstMatch }, { data: xgMatches }, { data: koMatches }] = await Promise.all([
    // scoring_log/predictions exceed PostgREST's 1000-row response cap — page through
    fetchAllRows((from, to) =>
      admin.from('scoring_log').select('user_id, points, breakdown, match_id, matches(stage, kickoff_at)')
        .order('match_id', { ascending: true }).order('id').range(from, to)),
    admin.from('profiles').select('id, display_name').order('display_name'),
    admin.from('category_bets').select('user_id, category, bet_value, points'),
    fetchAllRows((from, to) =>
      admin.from('predictions').select('user_id, home_score_pred, away_score_pred, match_id, matches(home_score, away_score, status, home_xg, away_xg)')
        .order('id').range(from, to)),
    admin.from('matches').select('kickoff_at').order('kickoff_at', { ascending: true }).limit(1).single(),
    admin.from('matches').select('id, home_xg, away_xg').not('home_xg', 'is', null).not('away_xg', 'is', null),
    admin.from('matches').select('home_team, away_team, home_score, away_score, winner_team, stage, status'),
  ])

  // Special bet picks are hidden until the betting deadline (first match kickoff) has passed
  const categoryBetsOpen = !firstMatch?.kickoff_at || new Date() < new Date(firstMatch.kickoff_at)

  const eliminatedCountries = getEliminatedCountries(koMatches ?? [])
  const leadingScorerNames = new Set(
    await fetchTopScorers(10).then((s) => s.map((p) => p.player.name)).catch(() => []),
  )

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
    yllatys_correct: number; yllatys_total: number
    lead_count: number
    xg_pts: number; xg_n: number
    trend_pts: number; trend_n: number
    champion_bet: string | null
    scorer_bet: string | null
  }

  const stats: Record<string, PlayerStats> = {}
  for (const p of profiles) {
    stats[p.id] = {
      display_name: p.display_name, total: 0, bonus: 0, matches: 0,
      exact: 0, correct_result: 0, zero_matches: 0,
      group_pts: 0, group_n: 0, knockout_pts: 0, knockout_n: 0,
      draw_preds: 0, draw_correct: 0, yllatys_correct: 0, yllatys_total: 0,
      lead_count: 0,
      xg_pts: 0, xg_n: 0,
      trend_pts: 0, trend_n: 0,
      champion_bet: null, scorer_bet: null,
    }
  }

  // Match points from scoring_log
  const perPlayerMatchPts: Record<string, number[]> = {}
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
    if (!perPlayerMatchPts[row.user_id]) perPlayerMatchPts[row.user_id] = []
    perPlayerMatchPts[row.user_id].push(row.points)
  }
  // Trend: average of last 3 match predictions
  for (const [uid, pts] of Object.entries(perPlayerMatchPts)) {
    const last3 = pts.slice(-3)
    const s = stats[uid]
    if (!s) continue
    s.trend_pts = last3.reduce((a, b) => a + b, 0)
    s.trend_n = last3.length
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

  // Group prediction signs by match for Yllätys%
  type PredEntry = { user_id: string; pred_sign: number; actual_sign: number }
  const predsByMatch: Record<number, PredEntry[]> = {}

  for (const row of preds ?? []) {
    const s = stats[row.user_id]
    const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
    if (!m || m.status !== 'FINISHED' || m.home_score === null || m.away_score === null) continue

    const pred_sign = Math.sign(row.home_score_pred - row.away_score_pred)
    const actual_sign = Math.sign(m.home_score - m.away_score)

    if (s) {
      // Draw accuracy
      if (pred_sign === 0) { s.draw_preds++; if (actual_sign === 0) s.draw_correct++ }

      // xG-based points: recalculate using 0.75xg=1 goal conversion
      const xg = xgByMatch[row.match_id]
      if (xg) {
        const { total } = calculatePoints(
          { home: row.home_score_pred, away: row.away_score_pred },
          { home: Math.floor(xg.home_xg / 0.75), away: Math.floor(xg.away_xg / 0.75) },
        )
        s.xg_pts += total
        s.xg_n += 1
      }
    }

    if (!predsByMatch[row.match_id]) predsByMatch[row.match_id] = []
    predsByMatch[row.match_id].push({ user_id: row.user_id, pred_sign, actual_sign })
  }

  // Yllätys%: player predicted a minority result (≤25% of predictors chose the same sign)
  for (const entries of Object.values(predsByMatch)) {
    const total = entries.length
    if (total === 0) continue
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

  const sorted = Object.values(stats).sort((a, b) => b.total - a.total || b.exact - a.exact)
  const scoredMatches = Math.max(...sorted.map(s => s.matches), 0)

  const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 100) + '%' : '–'
  const avg = (pts: number, n: number) => n > 0 ? (pts / n).toFixed(1).replace('.', ',') : '–'

  const hasBonus = !categoryBetsOpen && sorted.some(s => s.bonus > 0)
  const hasPicks = !categoryBetsOpen && sorted.some(s => s.champion_bet || s.scorer_bet)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const scorerLabel = (v: string) =>
    isWildcard(v) ? `Muu ${getCountry(wildcardCountry(v)).name} pelaaja` : v

  // Cells carry both the display string and a numeric value for the color scale
  const pctCell = (n: number, d: number) => ({ display: pct(n, d), num: d > 0 ? n / d * 100 : null })
  const pctNCell = (n: number, d: number) => ({ display: d > 0 ? `${pct(n, d)} (${d})` : '–', num: d > 0 ? n / d * 100 : null })
  const avgCell = (p: number, n: number) => ({ display: avg(p, n), num: n > 0 ? p / n : null })
  const numCell = (v: number) => ({ display: String(v), num: v })

  // Full stats board as an image (same columns as /leaderboard),
  // each stat color-coded green (best) → red (worst)
  const columns = [
    { key: 'pts', label: 'Pts' },
    { key: 'ka', label: 'KA' },
    { key: 'tark', label: 'Tark' },
    { key: 'mrk', label: 'Mrk%' },
    { key: 'nol', label: 'Nol%', lowerIsBetter: true },
    { key: 'lka', label: 'L-KA' },
    { key: 'jka', label: 'J-KA' },
    { key: 'tas', label: 'Tas%' },
    { key: 'yll', label: 'Yllätys%' },
    { key: 'jht', label: 'Jht' },
    { key: 'trendi', label: 'Trendi' },
    ...(hasXg ? [{ key: 'xg', label: 'xG-Pts' }] : []),
    ...(hasBonus ? [{ key: 'bonus', label: 'Bonus' }] : []),
    ...(hasPicks ? [
      { key: 'champ', label: 'Mestari', width: 130, align: 'left' as const },
      { key: 'scorer', label: 'Maalikuningas', width: 160, align: 'left' as const },
    ] : []),
  ]
  const rows = sorted.map((s, i) => ({
    rank: i + 1,
    name: s.display_name,
    cells: {
      pts: numCell(s.total),
      ka: avgCell(s.total - s.bonus, s.matches),
      tark: numCell(s.exact),
      mrk: pctCell(s.correct_result, s.matches),
      nol: pctCell(s.zero_matches, s.matches),
      lka: avgCell(s.group_pts, s.group_n),
      jka: avgCell(s.knockout_pts, s.knockout_n),
      tas: pctNCell(s.draw_correct, s.draw_preds),
      yll: pctNCell(s.yllatys_correct, s.yllatys_total),
      jht: numCell(s.lead_count),
      trendi: s.trend_n > 0 ? avgCell(s.trend_pts, s.trend_n) : { display: '–', num: null },
      ...(hasXg ? { xg: s.xg_n > 0 ? numCell(s.xg_pts) : { display: '–', num: null } } : {}),
      ...(hasBonus ? { bonus: s.bonus > 0 ? { display: `+${s.bonus}`, num: s.bonus } : { display: '–', num: null } } : {}),
      ...(hasPicks ? {
        champ: {
          display: s.champion_bet ? truncate(getCountry(s.champion_bet).name, 16) : '–',
          num: null,
          ...(s.champion_bet && isChampionPickEliminated(s.champion_bet, eliminatedCountries) ? { textColor: ELIMINATED_COLOR } : {}),
        },
        scorer: {
          display: s.scorer_bet ? truncate(scorerLabel(s.scorer_bet), 21) : '–',
          num: null,
          ...(s.scorer_bet && isScorerPickEliminated(s.scorer_bet, eliminatedCountries, leadingScorerNames) ? { textColor: ELIMINATED_COLOR } : {}),
        },
      } : {}),
    },
  }))

  const caption =
    `📊 <b>MM 2026 — Tilastot — ${scoredMatches} ottelua</b>\n` +
    `<i>KA=pistekeskiarvo · Tark=täysosumat · Mrk%=oikeat merkit · Nol%=nollaottelut · ` +
    `L-KA=lohkovaihe · J-KA=jatkopelit · Tas%=tasurit · Yllätys%=oikea merkki kun ≤25% veikkasi samoin · Jht=päiviä johdossa</i>\n` +
    `🔗 ${appUrl}/leaderboard`

  try {
    const { renderStatsImage } = await import('./stats-image')
    const png = await renderStatsImage(`MM 2026 — Tilastot (${scoredMatches} ottelua)`, columns, rows)
    await sendPhotoBytes(target, png, caption)
  } catch (err) {
    // Fall back to the plain text summary if image generation fails
    console.error('[stats] table image failed, falling back to text:', err)
    const lines = sorted.map((s, i) =>
      `${i + 1}. ${s.display_name} — ${s.total} p  KA ${avg(s.total - s.bonus, s.matches)}  Tark ${s.exact}  Jht ${s.lead_count}`
    )
    const text =
      `📊 <b>MM 2026 — Tilastot — ${scoredMatches} ottelua</b>\n\n` +
      `<code>${lines.join('\n')}</code>\n\n` +
      `🔗 Kaikki tilastot: ${appUrl}/leaderboard`
    await sendMessage(target, text)
  }
}

// ─── Playoff bracket image ───────────────────────────────────────────────────

export async function sendBracketImage(chatId?: number | string): Promise<void> {
  const target = String(chatId ?? GROUP_CHAT_ID)
  const admin = createServiceRoleClient()

  const { data: matches } = await admin
    .from('matches')
    .select('stage, external_id, home_team, away_team, home_score, away_score, winner_team, status, kickoff_at')

  if (!matches || !matches.some((m) => m.stage !== 'GROUP_STAGE')) {
    await sendMessage(target, 'ℹ️ Pudotuspelit eivät ole vielä alkaneet.')
    return
  }

  try {
    const { renderBracketImage } = await import('./bracket-image')
    const png = await renderBracketImage(matches)
    if (!png) {
      await sendMessage(target, 'ℹ️ Pudotuspelit eivät ole vielä alkaneet.')
      return
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    await sendPhotoBytes(target, png, `🏆 <b>MM 2026 — Pudotuspelikaavio</b>\n🔗 ${appUrl}/leaderboard`)
  } catch (err) {
    console.error('[bracket] image failed:', err)
    await sendMessage(target, '⚠️ Kaavio ei onnistu juuri nyt.')
  }
}

// ─── Chart image ─────────────────────────────────────────────────────────────

export async function sendChartImage(chatId?: number | string): Promise<void> {
  const target = String(chatId ?? GROUP_CHAT_ID)
  const admin = createServiceRoleClient()

  const [{ data: profiles }, { data: log }, { data: catBets }] = await Promise.all([
    admin.from('profiles').select('id, display_name, chart_color').order('display_name'),
    fetchAllRows((from, to) =>
      admin.from('scoring_log').select('user_id, points, match_id')
        .order('match_id', { ascending: true }).order('id').range(from, to)),
    admin.from('category_bets').select('user_id, points'),
  ])

  if (!log || log.length === 0) {
    await sendMessage(target, '📈 Ei vielä pisteitä piirrettäväksi.')
    return
  }

  // Sort players by total points (match + bonus) descending — the same order
  // as /leaderboard, so assignColors() resolves identically and the chart
  // colors match the leaderboard page
  const totals: Record<string, number> = {}
  for (const p of profiles ?? []) totals[p.id] = 0
  for (const row of log) totals[row.user_id] = (totals[row.user_id] ?? 0) + row.points
  for (const row of catBets ?? []) {
    if (row.points !== null) totals[row.user_id] = (totals[row.user_id] ?? 0) + row.points
  }

  const sorted = [...(profiles ?? [])].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0))
  const colorMap = assignColors(sorted.map((p) => ({ id: p.id, chart_color: p.chart_color ?? null })))

  // Build cumulative chart data (same logic as leaderboard page)
  const byMatch: Record<number, { user_id: string; points: number }[]> = {}
  for (const row of log) {
    if (!byMatch[row.match_id]) byMatch[row.match_id] = []
    byMatch[row.match_id].push(row)
  }

  const running: Record<string, number> = Object.fromEntries(sorted.map((p) => [p.id, 0]))
  const labels: number[] = []
  const series: Record<string, number[]> = Object.fromEntries(sorted.map((p) => [p.id, []]))

  let idx = 1
  for (const matchId of Object.keys(byMatch).map(Number)) {
    for (const { user_id, points } of byMatch[matchId]) {
      running[user_id] = (running[user_id] ?? 0) + points
    }
    labels.push(idx++)
    for (const p of sorted) series[p.id].push(running[p.id] ?? 0)
  }

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: sorted.map((p) => ({
        label: p.display_name,
        data: series[p.id],
        borderColor: colorMap[p.id],
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
    fetchAllRows((from, to) =>
      admin.from('scoring_log').select('user_id, points').order('id').range(from, to)),
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

export async function sendTopScorers(chatId?: number | string): Promise<void> {
  const target = String(chatId ?? GROUP_CHAT_ID)
  const { fetchTopScorers } = await import('../football-data/client')
  const { getCountry } = await import('../countries')

  const rawScorers = await fetchTopScorers(10)
  const scorers = [...rawScorers].sort(
    (a, b) => b.goals - a.goals || (b.assists ?? 0) - (a.assists ?? 0),
  )

  if (scorers.length === 0) {
    await sendMessage(target, 'ℹ️ Maalipörssi ei ole vielä käytettävissä.')
    return
  }

  const medals = ['🥇', '🥈', '🥉']
  let text = '⚽ <b>Turnauksen maalipörssi</b>\n\n'
  scorers.forEach((s, i) => {
    const rank = medals[i] ?? `${i + 1}.`
    const teamFi = getCountry(s.team.name).name
    const assists = s.assists ? `, ${s.assists} sy.` : ''
    text += `${rank} ${s.player.name} (${teamFi}) — ${s.goals} maalia${assists}\n`
  })

  await sendMessage(target, text.trim())
}

// ─── /odds command ───────────────────────────────────────────────────────────

export async function sendOddsReport(chatId?: number | string): Promise<void> {
  const target = String(chatId ?? GROUP_CHAT_ID)
  const db = createServiceRoleClient()

  // All finished matches with stored odds
  const { data: matches } = await db
    .from('matches')
    .select('id, home_team, away_team, kickoff_at, home_score, away_score, home_odds, draw_odds, away_odds')
    .eq('status', 'FINISHED')
    .order('kickoff_at', { ascending: true })

  if (!matches?.length) {
    await sendMessage(target, 'ℹ️ Ei vielä päättyneitä otteluita.')
    return
  }

  function getMatchOdds(m: NonNullable<typeof matches>[0]) {
    if (m.home_odds == null || m.draw_odds == null || m.away_odds == null) return null
    return { homeWin: Number(m.home_odds), draw: Number(m.draw_odds), awayWin: Number(m.away_odds) }
  }

  const uniqueDates = [...new Set(matches.map((m) => m.kickoff_at.slice(0, 10)))]

  // All predictions on finished matches — exceeds PostgREST's 1000-row cap, page through
  const matchIds = matches.map((m) => m.id)
  const { data: preds } = await fetchAllRows((from, to) =>
    db.from('predictions')
      .select('user_id, match_id, home_score_pred, away_score_pred, points')
      .in('match_id', matchIds).order('id').range(from, to))

  const { data: players } = await db
    .from('profiles')
    .select('id, display_name')
    .order('display_name')

  if (!preds?.length || !players?.length) {
    await sendMessage(target, 'ℹ️ Ei riittävästi dataa.')
    return
  }

  // Build match lookup
  const matchById = Object.fromEntries(matches.map((m) => [m.id, m]))

  // Per-player stats
  type Stats = { sumOdds: number; roi: number; n: number }
  const stats: Record<string, Stats> = {}
  for (const p of players) stats[p.id] = { sumOdds: 0, roi: 0, n: 0 }

  let matchesWithOdds = 0

  for (const pred of preds) {
    const match = matchById[pred.match_id]
    if (!match) continue
    const odds = getMatchOdds(match)
    if (!odds) continue

    // What outcome did the player predict?
    const ph = pred.home_score_pred
    const pa = pred.away_score_pred
    const predictedOutcome = ph > pa ? 'home' : ph < pa ? 'away' : 'draw'
    const predictedOdds =
      predictedOutcome === 'home' ? odds.homeWin
      : predictedOutcome === 'away' ? odds.awayWin
      : odds.draw

    // Was the prediction correct (3 pts = correct result)?
    const correct = (pred.points ?? 0) >= 3

    const st = stats[pred.user_id]
    if (!st) continue
    st.sumOdds += predictedOdds
    // ROI: stake 1, return = odds if correct, 0 if not
    st.roi += correct ? predictedOdds - 1 : -1
    st.n++
    matchesWithOdds++
  }

  // Sort by ROI descending
  const rows = players
    .map((p) => ({ name: p.display_name, ...stats[p.id] }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.roi / b.n - a.roi / a.n)

  if (!rows.length) {
    await sendMessage(target, 'ℹ️ Ei löydy veikkauksia otteluille joille on kertoimet.')
    return
  }

  // Format table: Name | Avg odds | ROI%
  const NL = 12, NO = 6, NR = 7
  let table = `${padR('Pelaaja', NL)} ${padL('KA-k', NO)} ${padL('ROI', NR)}\n`
  table += '─'.repeat(NL + NO + NR + 2) + '\n'
  for (const r of rows) {
    const avgOdds = (r.sumOdds / r.n).toFixed(2)
    const roi = r.roi / r.n * 100
    const roiStr = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%'
    table += `${padR(truncate(r.name, NL), NL)} ${padL(avgOdds, NO)} ${padL(roiStr, NR)}\n`
  }

  const uniqueMatchDates = uniqueDates.length
  const text =
    `📈 <b>Kerroinanalyysi</b>\n\n` +
    `<pre>${table}</pre>\n` +
    `<i>KA-k = veikkauksen kerroin keskimäärin\n` +
    `ROI = tuotto per veikkaus (1 yksikön panos)\n` +
    `${matches.length} ottelua · ${uniqueMatchDates} ottelupäivää</i>`

  await sendMessage(target, text)
}

// ─── Streaks ─────────────────────────────────────────────────────────────────

export async function sendStreaks(chatId?: number | string): Promise<void> {
  const target = String(chatId ?? GROUP_CHAT_ID)
  const admin = createServiceRoleClient()
  const { computeStreaks, STREAK_LABELS } = await import('../streaks')
  const players = await computeStreaks(admin)

  if (players.length === 0) {
    await sendMessage(target, 'ℹ️ Ei putkitietoja saatavilla.')
    return
  }

  const types = Object.keys(STREAK_LABELS) as (keyof typeof STREAK_LABELS)[]

  let text = '🔥 <b>Putket</b>\n'
  text += '<i>Nyk = nykyinen putki · Max = pisimmillään</i>\n\n'

  for (const type of types) {
    const label = STREAK_LABELS[type]
    const entries = players
      .map(p => ({ name: p.display_name, ...p.streaks[type] }))
      .filter(p => p.current > 0 || p.best > 0)
      .sort((a, b) => b.current - a.current || b.best - a.best)
      .slice(0, 3)

    if (entries.length === 0) continue

    text += `${label}\n`
    for (const e of entries) {
      text += `  ${e.name}: <b>${e.current}</b>`
      if (e.best > e.current) text += ` (max ${e.best})`
      text += '\n'
    }
    text += '\n'
  }

  await sendMessage(target, text.trim())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function padR(s: string, len: number) { return s.slice(0, len).padEnd(len) }
function padL(s: string, len: number) { return s.slice(0, len).padStart(len) }
function truncate(s: string, len: number) { return s.length > len ? s.slice(0, len - 1) + '…' : s }
