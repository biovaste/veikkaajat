import { NextRequest, NextResponse } from 'next/server'
import { sendMessage, sendPhoto, getQuickChartUrl } from '@/lib/telegram/bot'
import { sendStatsTable, sendChartImage, sendClanWar } from '@/lib/telegram/notify'
import { pollAndScoreFinishedMatches } from '@/lib/poll-and-score'
import { createServiceRoleClient } from '@/lib/supabase/server'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID!
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; first_name: string; username?: string }
    chat: { id: number; type: string }
    text?: string
  }
}

export async function POST(request: NextRequest) {
  // Verify secret token set via setWebhook
  if (WEBHOOK_SECRET) {
    const header = request.headers.get('x-telegram-bot-api-secret-token')
    if (header !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const update: TelegramUpdate = await request.json()
  const msg = update.message
  if (!msg?.text || !msg.from) return NextResponse.json({ ok: true })

  const chatId = msg.chat.id
  // Strip bot username suffix: "/help@veikkaajat_apumarko_bot" → "/help"
  const text = msg.text.trim().split('@')[0].toLowerCase()
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'

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
    // Admin-only: check if sender's Telegram ID matches an admin profile
    const admin = createServiceRoleClient()
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('telegram_chat_id', String(msg.from.id))
      .eq('is_admin', true)
      .maybeSingle()

    if (!adminProfile) {
      await sendMessage(chatId, '⛔ Vain adminit voivat hakea tuloksia.').catch(console.error)
    } else {
      await sendMessage(chatId, '🔄 Haetaan tuloksia…').catch(console.error)
      try {
        const result = await pollAndScoreFinishedMatches()
        if (result.scored > 0) {
          // Result messages are sent by pollAndScoreFinishedMatches itself
        } else if (result.checked === 0) {
          await sendMessage(chatId, 'ℹ️ Ei yhtään käynnissä olevaa tai juuri päättynyttä ottelua.').catch(console.error)
        } else {
          await sendMessage(chatId, `ℹ️ Tarkistettiin ${result.checked} ottelu${result.checked === 1 ? '' : 'a'} — ei vielä valmistunut.`).catch(console.error)
        }
      } catch (err) {
        console.error('[webhook /haetulos]', err)
        await sendMessage(chatId, '⚠️ Tulosten haku epäonnistui.').catch(console.error)
      }
    }
  } else if (text === '/luokkasota' && isGroup) {
    await sendClanWar(chatId).catch(async (err) => {
      console.error('[webhook /luokkasota]', err)
      await sendMessage(chatId, '⚠️ Luokkasota ei onnistu juuri nyt.').catch(console.error)
    })
  } else if (text === '/help') {
    await sendMessage(
      chatId,
      '📋 <b>Komennot (ryhmässä):</b>\n/chart — pistekehityskaavio\n/stats — tilastotaulukko\n/luokkasota — klaanien pistetilanne\n/haetulos — hae tulos heti (vain admin)\n\n' +
      'Veikkaa: ' + (process.env.NEXT_PUBLIC_APP_URL ?? ''),
    ).catch(console.error)
  }

  return NextResponse.json({ ok: true })
}
