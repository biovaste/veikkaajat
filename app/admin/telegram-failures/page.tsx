'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Failure {
  id: number
  chat_id: string
  kind: string
  match_id: number | null
  payload: { text: string; reply_markup?: object | null }
  error: string
  attempts: number
  resolved_at: string | null
  created_at: string
}

export default function TelegramFailuresPage() {
  const [failures, setFailures] = useState<Failure[]>([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState<number | null>(null)

  const supabase = createClient()

  async function load() {
    const { data } = await supabase
      .from('telegram_send_failures')
      .select('*')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
    setFailures(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function retry(id: number) {
    setRetrying(id)
    const res = await fetch('/api/admin/retry-telegram-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    if (data.resolved) await load()
    else alert(`Yritys epäonnistui: ${data.error ?? 'tuntematon virhe'}`)
    setRetrying(null)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Telegram-virheet</h1>

      {loading ? (
        <p className="text-sm text-gray-400">Ladataan...</p>
      ) : failures.length === 0 ? (
        <p className="text-sm text-gray-400">Ei ratkaisemattomia virheitä. 🎉</p>
      ) : (
        <div className="space-y-2">
          {failures.map((f) => (
            <div key={f.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400">
                    {f.kind} · chat {f.chat_id} · {f.attempts} yritystä · {new Date(f.created_at).toLocaleString('fi-FI')}
                  </div>
                  <div className="text-sm mt-1 whitespace-pre-wrap">{f.payload?.text}</div>
                  <div className="text-xs text-red-600 mt-1">{f.error}</div>
                </div>
                <button
                  onClick={() => retry(f.id)}
                  disabled={retrying === f.id}
                  className="shrink-0 px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {retrying === f.id ? '...' : 'Yritä uudelleen'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
