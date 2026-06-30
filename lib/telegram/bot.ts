const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export interface TelegramSendResult {
  ok: boolean
  status?: number
  error?: string
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

// Retries once on 429 (rate limit), honoring Telegram's retry_after hint, before
// giving up. Callers that need to know about persistent failures (so they can be
// logged for manual retry — see telegram_send_failures) should check the result.
async function callTelegram(method: string, body: object, retriesLeft = 2): Promise<TelegramSendResult> {
  const res = await fetch(`${BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 429 && retriesLeft > 0) {
    const data = await res.json().catch(() => null) as { parameters?: { retry_after?: number } } | null
    const retryAfter = data?.parameters?.retry_after ?? 1
    await sleep((retryAfter + 1) * 1000)
    return callTelegram(method, body, retriesLeft - 1)
  }
  if (!res.ok) {
    const err = await res.text()
    console.error(`[telegram] ${method} failed: ${err}`)
    return { ok: false, status: res.status, error: err }
  }
  return { ok: true }
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  parseMode: 'HTML' | 'MarkdownV2' = 'HTML',
): Promise<TelegramSendResult> {
  return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: parseMode })
}

export async function sendMessageWithMarkup(
  chatId: string | number,
  text: string,
  replyMarkup: object,
): Promise<TelegramSendResult> {
  return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup })
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await callTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) })
}

export async function sendPhoto(
  chatId: string | number,
  photoUrl: string,
  caption?: string,
): Promise<void> {
  const res = await fetch(`${BASE}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: 'HTML',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`[telegram] sendPhoto failed: ${err}`)
  }
}

/** Send raw PNG bytes as a file upload */
export async function sendPhotoBytes(
  chatId: string | number,
  bytes: ArrayBuffer,
  caption?: string,
): Promise<void> {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('photo', new Blob([bytes], { type: 'image/png' }), 'stats.png')
  if (caption) {
    form.append('caption', caption)
    form.append('parse_mode', 'HTML')
  }

  const res = await fetch(`${BASE}/sendPhoto`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[telegram] sendPhotoBytes failed: ${err}`)
  }
}

/** Fetch an image URL and send it as a file upload (bypasses Telegram's URL size/format limits) */
export async function sendPhotoBuffer(
  chatId: string | number,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`)
  await sendPhotoBytes(chatId, await imgRes.arrayBuffer(), caption)
}

// POST chart config to QuickChart, returns a stable shareable URL
export async function getQuickChartUrl(
  chartConfig: object,
  width = 800,
  height = 420,
): Promise<string> {
  const res = await fetch('https://quickchart.io/chart/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chart: chartConfig, width, height, backgroundColor: 'white' }),
  })
  if (!res.ok) throw new Error(`QuickChart error: ${await res.text()}`)
  const json = await res.json() as { success: boolean; url: string }
  if (!json.success) throw new Error('QuickChart did not return success')
  return json.url
}
