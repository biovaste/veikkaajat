import { NextRequest, NextResponse } from 'next/server'
import { sendMessage, sendPhoto, getQuickChartUrl } from '@/lib/telegram/bot'
import { sendStatsTable, sendChartImage } from '@/lib/telegram/notify'
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
  const text = msg.text.trim()
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'
  const isPrivate = msg.chat.type === 'private'

  try {
    if (text.startsWith('/start')) {
      // Register: reply with chat ID so admin can link the account
      const reply =
        `Moi! 👋\n\n` +
        `Chat ID-si on: <code>${chatId}</code>\n\n` +
        `Kopioi numero ja liitä se sovelluksen Asetukset-sivulle (⚙), niin saat henkilökohtaiset muistutukset veikkaamattomista otteluista.`
      await sendMessage(chatId, reply)
    } else if (text === '/chart' && isGroup) {
      await sendChartImage()
    } else if (text === '/stats' && isGroup) {
      await sendStatsTable()
    } else if (text === '/help' && isGroup) {
      await sendMessage(
        chatId,
        '📋 Komennot:\n/chart — pistekehityskaavio\n/stats — tilastotaulukko\n\n' +
        'Veikkaa osoitteessa: ' + (process.env.NEXT_PUBLIC_APP_URL ?? ''),
      )
    }
  } catch (err) {
    console.error('[webhook]', err)
  }

  return NextResponse.json({ ok: true })
}
