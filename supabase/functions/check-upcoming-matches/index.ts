// Supabase Edge Function: check-upcoming-matches
// Runs every 5 minutes via pg_cron.
// - Sends reminder DMs to players who haven't predicted (30 min before, or 22:00 for late-night)
// - Sends kickoff group message when match starts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const GROUP_CHAT_ID = Deno.env.get('TELEGRAM_GROUP_CHAT_ID')!
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`

async function tgSend(chatId: string | number, text: string, replyMarkup?: object) {
  await fetch(`${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
  })
}

// Helsinki is EEST (UTC+3) during WC 2026 (June–July)
function helsinkiHour(date: Date): number {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).getUTCHours()
}
function helsinkiMinute(date: Date): number {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).getUTCMinutes()
}

function isLateNight(kickoffAt: Date): boolean {
  const h = helsinkiHour(kickoffAt)
  return h >= 23 || h < 5
}

function shouldSendReminder(kickoffAt: Date, now: Date): boolean {
  if (isLateNight(kickoffAt)) {
    // Send once at 22:00 Helsinki time
    const h = helsinkiHour(now)
    const m = helsinkiMinute(now)
    return h === 22 && m < 5 && kickoffAt > now
  }
  // Send 30 min before kickoff (within this 5-min cron window)
  const diffMs = kickoffAt.getTime() - now.getTime()
  return diffMs > 25 * 60 * 1000 && diffMs <= 35 * 60 * 1000
}

Deno.serve(async (_req) => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const now = new Date()

  // ── Kickoff messages ────────────────────────────────────────────────────────
  // Matches that kicked off in the last 5 minutes, message not yet sent
  const kickoffWindow = new Date(now.getTime() - 5 * 60 * 1000)

  const { data: kMatches } = await db
    .from('matches')
    .select('id, home_team, away_team, kickoff_at')
    .eq('kickoff_msg_sent', false)
    .lte('kickoff_at', now.toISOString())
    .gte('kickoff_at', kickoffWindow.toISOString())

  for (const match of kMatches ?? []) {
    // Fetch all predictions for this match with player names
    const { data: preds } = await db
      .from('predictions')
      .select('user_id, home_score_pred, away_score_pred, profiles(display_name)')
      .eq('match_id', match.id)

    // All players
    const { data: allPlayers } = await db.from('profiles').select('id, display_name')

    const predictedIds = new Set((preds ?? []).map((p) => p.user_id))
    const notPredicted = (allPlayers ?? [])
      .filter((p) => !predictedIds.has(p.id))
      .map((p) => p.display_name)

    const predLines = (preds ?? []).map((p) => {
      const name = (Array.isArray(p.profiles) ? p.profiles[0] : p.profiles)?.display_name ?? '?'
      return `${name}: ${p.home_score_pred}–${p.away_score_pred}`
    })

    let text = `🔔 <b>${match.home_team} – ${match.away_team}</b>\n\n<b>Veikkaukset:</b>\n`
    if (predLines.length) text += predLines.join('\n') + '\n'
    if (notPredicted.length) text += `\n<i>Ei veikannut: ${notPredicted.join(', ')}</i>`

    await tgSend(GROUP_CHAT_ID, text)

    await db.from('matches').update({ kickoff_msg_sent: true }).eq('id', match.id)
  }

  // ── Reminder DMs ────────────────────────────────────────────────────────────
  // Upcoming matches that need reminders sent
  // Look at matches starting within the next 6 hours that haven't had reminders sent
  const horizon = new Date(now.getTime() + 6 * 60 * 60 * 1000)

  const { data: upcoming } = await db
    .from('matches')
    .select('id, home_team, away_team, kickoff_at')
    .eq('reminder_sent', false)
    .eq('status', 'SCHEDULED')
    .gt('kickoff_at', now.toISOString())
    .lt('kickoff_at', horizon.toISOString())

  for (const match of upcoming ?? []) {
    const kickoffAt = new Date(match.kickoff_at)
    if (!shouldSendReminder(kickoffAt, now)) continue

    // Find players who haven't predicted
    const { data: preds } = await db
      .from('predictions')
      .select('user_id')
      .eq('match_id', match.id)

    const predictedIds = new Set((preds ?? []).map((p) => p.user_id))

    const { data: players } = await db
      .from('profiles')
      .select('id, display_name, telegram_chat_id')

    const needsReminder = (players ?? []).filter(
      (p) => !predictedIds.has(p.id) && p.telegram_chat_id,
    )

    for (const player of needsReminder) {
      const text =
        `⏰ Muistutus!\n` +
        `<b>${match.home_team} – ${match.away_team}</b> alkaa pian.\n` +
        `Et ole vielä veikannut tätä ottelua.`
      await tgSend(player.telegram_chat_id!, text, {
        inline_keyboard: [[
          { text: '✏️ Veikkaa nyt', callback_data: `edit:${match.id}` },
        ]],
      })
    }

    await db.from('matches').update({ reminder_sent: true }).eq('id', match.id)
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
