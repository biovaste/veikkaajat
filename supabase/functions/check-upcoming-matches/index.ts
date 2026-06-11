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

// Finnish TV channels for group stage matches.
// Keys are "HomeTeam|AwayTeam" using English names as stored in the DB (from football-data.org).
// Note: team names must match DB exactly — check matches table if a channel isn't showing.
const MTV3 = 'MTV3 & MTV Katsomo+ Urheilu'
const YLE  = 'Yle TV2 & Yle Areena'
const KATSOMO  = 'MTV Katsomo+ Urheilu'
const YLE_AREENA = 'Yle Areena'

const FI_CHANNELS: Record<string, string> = {
  // Matchday 1 — Thu 11 Jun
  'Mexico|South Africa':            MTV3,
  'South Korea|Czech Republic':     MTV3,
  // Matchday 1 — Fri 12 Jun
  'Canada|Bosnia and Herzegovina':  YLE,
  'United States|Paraguay':         YLE,
  // Matchday 1 — Sat 13 Jun
  'Qatar|Switzerland':              MTV3,
  'Brazil|Morocco':                 MTV3,
  'Haiti|Scotland':                 KATSOMO,
  'Australia|Turkey':               KATSOMO,
  // Matchday 1 — Sun 14 Jun
  'Germany|Curaçao':                YLE,
  'Netherlands|Japan':              YLE,
  'Ivory Coast|Ecuador':            YLE,
  'Sweden|Tunisia':                 YLE,
  // Matchday 1 — Mon 15 Jun
  'Spain|Cape Verde':               MTV3,
  'Belgium|Egypt':                  MTV3,
  'Saudi Arabia|Uruguay':           KATSOMO,
  'Iran|New Zealand':               KATSOMO,
  // Matchday 1 — Tue 16 Jun
  'France|Senegal':                 YLE,
  'Iraq|Norway':                    YLE,
  'Argentina|Algeria':              YLE,
  'Austria|Jordan':                 YLE,
  // Matchday 1 — Wed 17 Jun
  'Portugal|DR Congo':              MTV3,
  'England|Croatia':                MTV3,
  'Ghana|Panama':                   KATSOMO,
  'Uzbekistan|Colombia':            KATSOMO,
  // Matchday 2 — Thu 18 Jun
  'Czech Republic|South Africa':    YLE,
  'Switzerland|Bosnia and Herzegovina': YLE,
  'Canada|Qatar':                   YLE,
  'Mexico|South Korea':             YLE,
  // Matchday 2 — Fri 19 Jun
  'United States|Australia':        MTV3,
  'Scotland|Morocco':               MTV3,
  'Brazil|Haiti':                   KATSOMO,
  'Turkey|Paraguay':                KATSOMO,
  // Matchday 2 — Sat 20 Jun
  'Netherlands|Sweden':             YLE,
  'Germany|Ivory Coast':            YLE,
  'Ecuador|Curaçao':                YLE,
  'Tunisia|Japan':                  YLE,
  // Matchday 2 — Sun 21 Jun
  'Spain|Saudi Arabia':             MTV3,
  'Belgium|Iran':                   MTV3,
  'Uruguay|Cape Verde':             KATSOMO,
  'New Zealand|Egypt':              KATSOMO,
  // Matchday 2 — Mon 22 Jun
  'Argentina|Austria':              YLE,
  'France|Iraq':                    YLE,
  'Norway|Senegal':                 YLE,
  'Jordan|Algeria':                 YLE,
  // Matchday 2 — Tue 23 Jun
  'Portugal|Uzbekistan':            MTV3,
  'England|Ghana':                  MTV3,
  'Panama|Croatia':                 KATSOMO,
  'Colombia|DR Congo':              KATSOMO,
  // Matchday 3 — Wed 24 Jun
  'Switzerland|Canada':             YLE,
  'Bosnia and Herzegovina|Qatar':   YLE_AREENA,
  'Scotland|Brazil':                YLE,
  'Morocco|Haiti':                  YLE_AREENA,
  'Czech Republic|Mexico':          YLE,
  'South Africa|South Korea':       YLE_AREENA,
  // Matchday 3 — Thu 25 Jun
  'Ecuador|Germany':                MTV3,
  'Curaçao|Ivory Coast':            KATSOMO,
  'Japan|Sweden':                   MTV3,
  'Tunisia|Netherlands':            KATSOMO,
  'Turkey|United States':           KATSOMO,
  'Paraguay|Australia':             KATSOMO,
  // Matchday 3 — Fri 26 Jun
  'Norway|France':                  YLE,
  'Senegal|Iraq':                   YLE_AREENA,
  'Cape Verde|Saudi Arabia':        YLE_AREENA,
  'Uruguay|Spain':                  YLE,
  'Egypt|Iran':                     YLE,
  'New Zealand|Belgium':            YLE_AREENA,
  // Matchday 3 — Sat 27 Jun
  'Croatia|Ghana':                  MTV3,
  'Panama|England':                 KATSOMO,
  'Colombia|Portugal':              MTV3,
  'DR Congo|Uzbekistan':            KATSOMO,
  'Algeria|Austria':                YLE,
  'Jordan|Argentina':               YLE,
}

function getFiChannel(home: string, away: string): string | null {
  return FI_CHANNELS[`${home}|${away}`] ?? null
}

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

    const channel = getFiChannel(match.home_team, match.away_team)
    let text = `🔔 <b>${match.home_team} – ${match.away_team}</b>\n`
    if (channel) text += `📺 ${channel}\n`
    text += `\n<b>Veikkaukset:</b>\n`
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
