const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export async function sendMessage(
  chatId: string | number,
  text: string,
  parseMode: 'HTML' | 'MarkdownV2' = 'HTML',
): Promise<void> {
  const res = await fetch(`${BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`[telegram] sendMessage failed: ${err}`)
  }
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
