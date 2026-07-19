import { NextRequest, NextResponse } from 'next/server'
import { sendMessage, sendMessageWithMarkup, answerCallbackQuery } from '@/lib/telegram/bot'
import { sendStatsTable, sendChartImage, sendClanWar, sendTopScorers, sendOddsReport, sendStreaks, sendBracketImage } from '@/lib/telegram/notify'
import { scoreMatchAndNotify } from '@/lib/scoring/score-and-notify'
import { pollAndScoreFinishedMatches } from '@/lib/poll-and-score'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getCountry } from '@/lib/countries'
import { formatDate } from '@/lib/utils'

const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID!
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''

interface TelegramMessage {
  message_id: number
  from?: { id: number; first_name: string; username?: string }
  chat: { id: number; type: string }
  text?: string
  reply_to_message?: TelegramMessage
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: {
    id: string
    from: { id: number; first_name: string; username?: string }
    message: TelegramMessage
    data?: string
  }
}

export async function POST(request: NextRequest) {
  if (WEBHOOK_SECRET) {
    const header = request.headers.get('x-telegram-bot-api-secret-token')
    if (header !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const update: TelegramUpdate = await request.json()

  // ── Callback query (inline button tap) ──────────────────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query
    await answerCallbackQuery(cq.id)

    if (cq.data?.startsWith('edit:')) {
      const matchId = parseInt(cq.data.split(':')[1], 10)
      const chatId = cq.message.chat.id
      await handleEditCallback(chatId, matchId)
    }
    return NextResponse.json({ ok: true })
  }

  const msg = update.message
  if (!msg?.from) return NextResponse.json({ ok: true })

  const chatId = msg.chat.id
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'
  const isDM = msg.chat.type === 'private'

  // ── Reply to bot's ForceReply (prediction editing) ──────────────────────────
  if (isDM && msg.text && msg.reply_to_message?.text) {
    const match = msg.reply_to_message.text.match(/#(\d+)/)
    if (match) {
      await handlePredictionReply(chatId, msg.from.id, parseInt(match[1], 10), msg.text.trim())
      return NextResponse.json({ ok: true })
    }
  }

  if (!msg.text) return NextResponse.json({ ok: true })

  // Strip bot username suffix: "/help@bot" → "/help"
  const text = msg.text.trim().split('@')[0].toLowerCase()

  if (text.startsWith('/start')) {
    const reply =
      `Moi! 👋\n\n` +
      `Chat ID-si on: <code>${chatId}</code>\n\n` +
      `Kopioi numero ja liitä se sovelluksen Asetukset-sivulle (⚙), niin saat henkilökohtaiset muistutukset veikkaamattomista otteluista.`
    await sendMessage(chatId, reply).catch(console.error)
  } else if (text === '/chart' && isGroup) {
    await sendChartImage(chatId).catch(async (err) => {
      console.error('[webhook /chart]', err)
      await sendMessage(chatId, '⚠️ Kaavio ei onnistu juuri nyt.').catch(console.error)
    })
  } else if (text === '/stats' && isGroup) {
    await sendStatsTable(chatId).catch(async (err) => {
      console.error('[webhook /stats]', err)
      await sendMessage(chatId, '⚠️ Tilastot ei onnistu juuri nyt.').catch(console.error)
    })
  } else if (text === '/haetulos' && isGroup) {
    await sendMessage(chatId, '🔄 Haetaan tuloksia…').catch(console.error)
    try {
      const result = await pollAndScoreFinishedMatches()
      if (result.scored === 0) {
        if (result.checked === 0) {
          await sendMessage(chatId, 'ℹ️ Ei yhtään käynnissä olevaa tai juuri päättynyttä ottelua.').catch(console.error)
        } else {
          await sendMessage(chatId, `ℹ️ Tarkistettiin ${result.checked} ottelu${result.checked === 1 ? '' : 'a'} — ei vielä valmistunut.`).catch(console.error)
        }
      }
    } catch (err) {
      console.error('[webhook /haetulos]', err)
      await sendMessage(chatId, '⚠️ Tulosten haku epäonnistui.').catch(console.error)
    }
  } else if (text === '/jatkokaavio' && isGroup) {
    await sendBracketImage(chatId).catch(async (err) => {
      console.error('[webhook /jatkokaavio]', err)
      await sendMessage(chatId, '⚠️ Kaavio ei onnistu juuri nyt.').catch(console.error)
    })
  } else if (text === '/maaliporssi' && isGroup) {
    await sendTopScorers(chatId).catch(async (err) => {
      console.error('[webhook /maaliporssi]', err)
      await sendMessage(chatId, '⚠️ Maalipörssi ei onnistu juuri nyt.').catch(console.error)
    })
  } else if (text === '/luokkasota' && isGroup) {
    await sendClanWar(chatId).catch(async (err) => {
      console.error('[webhook /luokkasota]', err)
      await sendMessage(chatId, '⚠️ Luokkasota ei onnistu juuri nyt.').catch(console.error)
    })
  } else if (text === '/putki' && isGroup) {
    await sendStreaks(chatId).catch(async (err) => {
      console.error('[webhook /putki]', err)
      await sendMessage(chatId, '⚠️ Putket ei onnistu juuri nyt.').catch(console.error)
    })
  } else if (text === '/matchid' && (isGroup || isDM)) {
    await handleMatchId(chatId, msg.from.id).catch(async (err) => {
      console.error('[webhook /matchid]', err)
      await sendMessage(chatId, '⚠️ Ottelutunnukset ei onnistu juuri nyt.').catch(console.error)
    })
  } else if (text.startsWith('/setscore') && (isGroup || isDM)) {
    await handleSetScore(chatId, msg.from.id, text).catch(async (err) => {
      console.error('[webhook /setscore]', err)
      await sendMessage(chatId, '⚠️ Tulosasetus epäonnistui.').catch(console.error)
    })
  } else if (text === '/tj' && (isGroup || isDM)) {
    await sendMessage(chatId, buildTournamentCountdown()).catch(console.error)
  } else if (text === '/odds' && isGroup) {
    await sendOddsReport(chatId).catch(async (err) => {
      console.error('[webhook /odds]', err)
      await sendMessage(chatId, '⚠️ Kerroinanalyysi ei onnistu juuri nyt.').catch(console.error)
    })
  } else if (text === '/chatid') {
    // Diagnostic: report this chat's id and whether it matches the configured group id
    const configured = process.env.TELEGRAM_GROUP_CHAT_ID ?? ''
    const matches = String(chatId) === configured
    await sendMessage(
      chatId,
      `Chat ID: <code>${chatId}</code>\n` +
      (isGroup ? (matches ? '✅ Vastaa asetettua TELEGRAM_GROUP_CHAT_ID:tä.' : '⚠️ EI vastaa asetettua TELEGRAM_GROUP_CHAT_ID:tä!') : ''),
    ).catch(console.error)
  } else if (text === '/veikkaukset' && isDM) {
    await handleVeikkaukset(chatId, msg.from.id).catch(async (err) => {
      console.error('[webhook /veikkaukset]', err)
      await sendMessage(chatId, '⚠️ Veikkausten haku epäonnistui.').catch(console.error)
    })
  } else if (text === '/help') {
    const dmNote = isDM ? '\n\n📩 <b>Omat komennot (yksityisviesti):</b>\n/veikkaukset — seuraavat 5 veikkaustasi' : ''
    await sendMessage(
      chatId,
      '📋 <b>Komennot (ryhmässä):</b>\n/chart — pistekehityskaavio\n/stats — tilastotaulukko\n/jatkokaavio — pudotuspelikaavio\n/odds — kerroinanalyysi (KA-kerroin & ROI)\n/luokkasota — klaanien pistetilanne\n/maaliporssi — turnauksen maalipörssi (top 10)\n/putki — peräkkäisputket (top 3)\n/haetulos — hae tulos heti\n/tj — aikaa seuraaviin turnauksiin\n/setscore &lt;id&gt; &lt;k-v&gt; [koti|vieras] — aseta tulos (vain admin)\n/matchid — ottelutunnukset (vain admin)' +
      dmNote +
      '\n\nVeikkaa: ' + (process.env.NEXT_PUBLIC_APP_URL ?? ''),
    ).catch(console.error)
  }

  return NextResponse.json({ ok: true })
}

// ── /tj handler (time until next major tournaments) ─────────────────────────

const MAJOR_TOURNAMENTS = [
  { name: 'EM 2028', start: new Date('2028-06-09T00:00:00Z') },
  { name: 'MM 2030', start: new Date('2030-06-13T00:00:00Z') },
]

function timeUntil(target: Date, now: Date): { years: number; days: number; hours: number } {
  let years = target.getFullYear() - now.getFullYear()
  const cursor = new Date(now)
  cursor.setFullYear(cursor.getFullYear() + years)
  if (cursor > target) {
    years--
    cursor.setFullYear(cursor.getFullYear() - 1)
  }
  const remainingMs = target.getTime() - cursor.getTime()
  const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return { years, days, hours }
}

function buildTournamentCountdown(): string {
  const now = new Date()
  const upcoming = MAJOR_TOURNAMENTS
    .filter(t => t.start > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  if (upcoming.length === 0) return 'ℹ️ Ei tulevia turnauksia listalla.'

  const lines = upcoming.map(t => {
    const { years, days, hours } = timeUntil(t.start, now)
    return `${t.name} alkuun aikaa ${years} vuotta, ${days} päivää, ${hours} tuntia`
  })

  return '🏆 <b>Seuraavat turnaukset</b>\n\n' + lines.join('\n')
}

// ── /matchid handler (admin only) ────────────────────────────────────────────

async function handleMatchId(chatId: number, telegramUserId: number): Promise<void> {
  const admin = createServiceRoleClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('telegram_chat_id', String(telegramUserId))
    .maybeSingle()

  if (!profile?.is_admin) {
    await sendMessage(chatId, '🔒 Tämä komento on vain admineille.')
    return
  }

  const now = new Date().toISOString()

  const [{ data: prev }, { data: next }] = await Promise.all([
    admin.from('matches')
      .select('id, home_team, away_team, kickoff_at, home_score, away_score, status')
      .lt('kickoff_at', now)
      .order('kickoff_at', { ascending: false })
      .limit(2),
    admin.from('matches')
      .select('id, home_team, away_team, kickoff_at, status')
      .gte('kickoff_at', now)
      .order('kickoff_at', { ascending: true })
      .limit(2),
  ])

  const fmt = (m: { id: number; home_team: string; away_team: string; kickoff_at: string; home_score?: number | null; away_score?: number | null }) => {
    const homeFi = getCountry(m.home_team).name
    const awayFi = getCountry(m.away_team).name
    const date = formatDate(m.kickoff_at)
    const score = m.home_score != null ? ` ${m.home_score}–${m.away_score}` : ''
    return `#${m.id} ${homeFi} – ${awayFi}${score} <i>(${date})</i>`
  }

  let text = '🔢 <b>Ottelutunnukset</b>\n\n'
  text += '<b>Edelliset:</b>\n'
  for (const m of (prev ?? []).reverse()) text += fmt(m) + '\n'
  text += '\n<b>Seuraavat:</b>\n'
  for (const m of next ?? []) text += fmt(m) + '\n'

  await sendMessage(chatId, text)
}

// ── /setscore handler (admin only) ───────────────────────────────────────────

async function handleSetScore(chatId: number, telegramUserId: number, text: string): Promise<void> {
  const admin = createServiceRoleClient()

  // Check admin
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_admin')
    .eq('telegram_chat_id', String(telegramUserId))
    .maybeSingle()

  if (!profile?.is_admin) {
    await sendMessage(chatId, '🔒 Tämä komento on vain admineille.')
    return
  }

  // Parse: /setscore <id> <home>-<away> [koti|vieras]
  // The koti/vieras suffix is required for a knockout-stage draw decided by
  // extra time/penalties, to record who actually advanced.
  const parts = text.trim().split(/\s+/)
  const matchId = parseInt(parts[1] ?? '', 10)
  const scoreStr = parts[2] ?? ''
  const winnerStr = (parts[3] ?? '').toLowerCase()
  const scoreMatch = scoreStr.match(/^(\d+)\s*[-–:]\s*(\d+)$/)

  if (isNaN(matchId) || !scoreMatch) {
    await sendMessage(chatId, '⚠️ Käyttö: /setscore &lt;ottelu-id&gt; &lt;koti-vieras&gt; [koti|vieras]\nEsim: /setscore 42 2-1\nJatkoaika/rangaistuspotkut: /setscore 87 1-1 koti')
    return
  }

  const homeScore = parseInt(scoreMatch[1], 10)
  const awayScore = parseInt(scoreMatch[2], 10)

  let winnerTeam: 'HOME' | 'AWAY' | undefined
  if (winnerStr === 'koti') winnerTeam = 'HOME'
  else if (winnerStr === 'vieras') winnerTeam = 'AWAY'

  // Verify match exists
  const { data: match } = await admin
    .from('matches')
    .select('id, home_team, away_team, stage')
    .eq('id', matchId)
    .single()

  if (!match) {
    await sendMessage(chatId, `⚠️ Ottelua #${matchId} ei löydy.`)
    return
  }

  if (match.stage !== 'GROUP_STAGE' && homeScore === awayScore && !winnerTeam) {
    await sendMessage(chatId, '⚠️ Jatkopeli päättyi tasan — kerro kuka eteni jatkoon: /setscore ' + matchId + ' ' + scoreStr + ' koti (tai vieras)')
    return
  }

  const homeFi = getCountry(match.home_team).name
  const awayFi = getCountry(match.away_team).name

  await sendMessage(chatId, `⏳ Asetetaan tulos ${homeFi} – ${awayFi}: ${homeScore}–${awayScore}…`)

  const { scored, error } = await scoreMatchAndNotify(admin, matchId, homeScore, awayScore, winnerTeam)

  if (error) {
    await sendMessage(chatId, `⚠️ Virhe: ${error}`)
    return
  }

  await sendMessage(chatId, `✅ Tulos asetettu: ${homeFi} – ${awayFi} ${homeScore}–${awayScore}\n${scored} veikkausta pisteytetty.`)
}

// ── /veikkaukset handler ──────────────────────────────────────────────────────

async function handleVeikkaukset(chatId: number, telegramUserId: number): Promise<void> {
  const admin = createServiceRoleClient()

  // Resolve user profile
  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('telegram_chat_id', String(telegramUserId))
    .maybeSingle()

  if (!profile) {
    await sendMessage(chatId,
      '⚠️ Telegram-tiliäsi ei ole yhdistetty sovellukseen.\n' +
      'Lisää Chat ID asetuksiin: ' + (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/settings'
    )
    return
  }

  const now = new Date()
  const deadline5min = new Date(now.getTime() + 5 * 60 * 1000)

  // Next 5 matches where prediction deadline hasn't passed yet
  const { data: matches } = await admin
    .from('matches')
    .select('id, home_team, away_team, kickoff_at')
    .gt('kickoff_at', deadline5min.toISOString())
    .in('status', ['SCHEDULED', 'TIMED'])
    .order('kickoff_at', { ascending: true })
    .limit(5)

  if (!matches || matches.length === 0) {
    await sendMessage(chatId, 'ℹ️ Ei tulevia otteluita joihin voit vielä veikkata.')
    return
  }

  // Fetch existing predictions for these matches
  const matchIds = matches.map(m => m.id)
  const { data: predictions } = await admin
    .from('predictions')
    .select('match_id, home_score_pred, away_score_pred')
    .eq('user_id', profile.id)
    .in('match_id', matchIds)

  const predMap = Object.fromEntries((predictions ?? []).map(p => [p.match_id, p]))

  await sendMessage(chatId, `🗓 <b>Seuraavat veikkauksesi, ${profile.display_name}:</b>`)

  for (const match of matches) {
    const pred = predMap[match.id]
    const homeFi = getCountry(match.home_team).name
    const awayFi = getCountry(match.away_team).name
    const dateStr = formatDate(match.kickoff_at)
    const predStr = pred ? `✅ Veikkauksesi: <b>${pred.home_score_pred}–${pred.away_score_pred}</b>` : '❌ Ei veikkausta'
    const btnLabel = pred ? '✏️ Muokkaa' : '✏️ Veikkaa'

    const text = `<b>${homeFi} – ${awayFi}</b>\n${dateStr}\n${predStr}`
    await sendMessageWithMarkup(chatId, text, {
      inline_keyboard: [[
        { text: btnLabel, callback_data: `edit:${match.id}` },
      ]],
    })
  }
}

// ── edit:{matchId} callback handler ──────────────────────────────────────────

async function handleEditCallback(chatId: number, matchId: number): Promise<void> {
  const admin = createServiceRoleClient()

  const { data: match } = await admin
    .from('matches')
    .select('id, home_team, away_team, kickoff_at')
    .eq('id', matchId)
    .single()

  if (!match) {
    await sendMessage(chatId, '⚠️ Ottelua ei löydy.')
    return
  }

  const deadline = new Date(new Date(match.kickoff_at).getTime() - 5 * 60 * 1000)
  if (deadline <= new Date()) {
    await sendMessage(chatId, '🔒 Veikkausaika on umpeutunut tälle ottelulle.')
    return
  }

  const homeFi = getCountry(match.home_team).name
  const awayFi = getCountry(match.away_team).name

  // Embed match ID in text so the reply handler can extract it
  await sendMessageWithMarkup(chatId,
    `✏️ Syötä veikkauksesi ottelulle #${match.id}\n<b>${homeFi} – ${awayFi}</b>\nKirjoita tulos muodossa: koti-vieras (esim. 2-1)`,
    { force_reply: true, selective: true },
  )
}

// ── Reply with prediction score ───────────────────────────────────────────────

async function handlePredictionReply(chatId: number, telegramUserId: number, matchId: number, text: string): Promise<void> {
  // Parse "2-1", "2–1", "2:1", "2 1"
  const scoreMatch = text.match(/^(\d+)\s*[-–:]\s*(\d+)$/)
  if (!scoreMatch) {
    await sendMessage(chatId, '⚠️ En ymmärtänyt tulosta. Kirjoita muodossa: 2-1')
    return
  }

  const home = parseInt(scoreMatch[1], 10)
  const away = parseInt(scoreMatch[2], 10)

  const admin = createServiceRoleClient()

  // Resolve user
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('telegram_chat_id', String(telegramUserId))
    .maybeSingle()

  if (!profile) {
    await sendMessage(chatId, '⚠️ Telegram-tiliäsi ei ole yhdistetty sovellukseen.')
    return
  }

  // Check deadline
  const { data: match } = await admin
    .from('matches')
    .select('home_team, away_team, kickoff_at')
    .eq('id', matchId)
    .single()

  if (!match) {
    await sendMessage(chatId, '⚠️ Ottelua ei löydy.')
    return
  }

  const deadline = new Date(new Date(match.kickoff_at).getTime() - 5 * 60 * 1000)
  if (deadline <= new Date()) {
    await sendMessage(chatId, '🔒 Veikkausaika on umpeutunut tälle ottelulle.')
    return
  }

  const { error } = await admin
    .from('predictions')
    .upsert(
      { user_id: profile.id, match_id: matchId, home_score_pred: home, away_score_pred: away },
      { onConflict: 'user_id,match_id' },
    )

  if (error) {
    await sendMessage(chatId, '⚠️ Tallennus epäonnistui. Yritä uudelleen.')
    return
  }

  const homeFi = getCountry(match.home_team).name
  const awayFi = getCountry(match.away_team).name
  await sendMessage(chatId, `✅ Tallennettu: <b>${homeFi} – ${awayFi}</b> → ${home}–${away}`)
}
