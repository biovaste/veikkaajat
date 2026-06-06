'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [displayName, setDisplayName] = useState('')
  const [telegramId, setTelegramId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, telegram_chat_id')
        .eq('id', user.id)
        .single()

      if (profile) {
        setDisplayName(profile.display_name ?? '')
        setTelegramId(profile.telegram_chat_id ?? '')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const trimmedName = displayName.trim()
    if (!trimmedName) {
      setError('Näyttönimi ei voi olla tyhjä.')
      setSaving(false)
      return
    }

    const { error: err } = await supabase
      .from('profiles')
      .update({
        display_name: trimmedName,
        telegram_chat_id: telegramId.trim() || null,
      })
      .eq('id', user.id)

    setSaving(false)
    if (err) {
      setError('Tallennus epäonnistui. Yritä uudelleen.')
    } else {
      setSaved(true)
    }
  }

  if (loading) {
    return <div className="text-gray-400 text-sm">Ladataan...</div>
  }

  return (
    <div className="space-y-6 max-w-sm">
      <h1 className="text-2xl font-bold">Asetukset</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Näyttönimi</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setSaved(false) }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Nimi sarjataulukossa"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Telegram-tunniste</label>
          <input
            type="text"
            value={telegramId}
            onChange={(e) => { setTelegramId(e.target.value); setSaved(false) }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="esim. 123456789"
          />
          <p className="text-xs text-gray-400">
            Lähetä <span className="font-mono">/start</span> botille{' '}
            <a
              href="https://t.me/veikkaajat_apumarko_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              @veikkaajat_apumarko_bot
            </a>{' '}
            yksityisviestinä ja kopioi vastauksessa oleva numero tähän.
            Tarvitaan veikkausmuistutuksia varten.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          onClick={save}
          disabled={saving}
          className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            saved
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {saving ? 'Tallennetaan…' : saved ? '✓ Tallennettu' : 'Tallenna'}
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
        <p className="text-xs font-medium text-blue-800">Näin rekisteröit Telegramisi:</p>
        <ol className="text-xs text-blue-700 space-y-0.5 list-decimal list-inside">
          <li>Avaa Telegram ja hae <span className="font-mono">@veikkaajat_apumarko_bot</span></li>
          <li>Lähetä sille viesti <span className="font-mono">/start</span></li>
          <li>Kopioi botin vastauksessa oleva numero</li>
          <li>Liitä se yllä olevaan kenttään ja tallenna</li>
        </ol>
      </div>
    </div>
  )
}
