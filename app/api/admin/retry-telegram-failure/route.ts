import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendMessage, sendMessageWithMarkup } from '@/lib/telegram/bot'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 403 })

  const { id } = await request.json()
  if (typeof id !== 'number') return NextResponse.json({ error: 'Virheelliset tiedot' }, { status: 400 })

  // Admin writes use the anon-key session client (RLS allows it via is_admin),
  // not the service role client — consistent with override-result/seed-matches.
  const { data: failure } = await supabase
    .from('telegram_send_failures')
    .select('id, chat_id, payload, attempts')
    .eq('id', id)
    .single()

  if (!failure) return NextResponse.json({ error: 'Ei löydy' }, { status: 404 })

  const payload = failure.payload as { text: string; reply_markup?: object | null }
  const result = payload.reply_markup
    ? await sendMessageWithMarkup(failure.chat_id, payload.text, payload.reply_markup)
    : await sendMessage(failure.chat_id, payload.text)

  if (result.ok) {
    await supabase.from('telegram_send_failures').update({ resolved_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ resolved: true })
  }

  await supabase.from('telegram_send_failures').update({
    attempts: (failure.attempts ?? 1) + 1,
    error: result.error ?? 'unknown',
  }).eq('id', id)

  return NextResponse.json({ resolved: false, error: result.error })
}
