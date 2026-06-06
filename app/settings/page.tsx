'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CHART_COLORS } from '@/lib/colors'

export default function SettingsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [displayName, setDisplayName] = useState('')
  const [telegramId, setTelegramId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Color picker
  const [myColor, setMyColor] = useState<string | null>(null)          // current saved color
  const [takenColors, setTakenColors] = useState<Set<string>>(new Set()) // colors taken by others
  const [colorSaving, setColorSaving] = useState(false)
  const [colorError, setColorError] = useState<string | null>(null)
  const [colorSaved, setColorSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Fetch own profile + all taken colors from other players
      const [{ data: profile }, { data: allColors }] = await Promise.all([
        supabase.from('profiles').select('display_name, telegram_chat_id, chart_color').eq('id', user.id).single(),
        supabase.from('profiles').select('chart_color').not('chart_color', 'is', null).neq('id', user.id),
      ])

      if (profile) {
        setDisplayName(profile.display_name ?? '')
        setTelegramId(profile.telegram_chat_id ?? '')
        setMyColor(profile.chart_color ?? null)
      }
      setTakenColors(new Set((allColors ?? []).map(r => r.chart_color as string)))
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
      .update({ display_name: trimmedName, telegram_chat_id: telegramId.trim() || null })
      .eq('id', user.id)

    setSaving(false)
    if (err) setError('Tallennus epäonnistui. Yritä uudelleen.')
    else setSaved(true)
  }

  async function pickColor(hex: string | null) {
    setColorSaving(true)
    setColorError(null)
    setColorSaved(false)

    const res = await fetch('/api/profile/color', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: hex }),
    })
    const data = await res.json()
    setColorSaving(false)

    if (!res.ok) {
      setColorError(data.error ?? 'Virhe')
    } else {
      setMyColor(hex)
      setColorSaved(true)
    }
  }

  if (loading) return <div className="text-gray-400 text-sm">Ladataan...</div>

  return (
    <div className="space-y-6 max-w-sm">
      <h1 className="text-2xl font-bold">Asetukset</h1>

      {/* ── Profile ── */}
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
            <a href="https://t.me/veikkaajat_apumarko_bot" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
              @veikkaajat_apumarko_bot
            </a>{' '}
            yksityisviestinä ja kopioi vastauksessa oleva numero tähän.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

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

      {/* ── Graph color ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-medium text-gray-700">Väri pistekaaviossa</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Valitse oma värisi. Harmaat värit on jo varattu muille pelaajille.
          </p>
        </div>

        <div className="grid grid-cols-10 gap-1.5">
          {CHART_COLORS.map(({ hex, label }) => {
            const isMine = myColor === hex
            const isTaken = takenColors.has(hex)
            return (
              <button
                key={hex}
                title={isTaken ? `${label} (varattu)` : isMine ? `${label} (sinun)` : label}
                disabled={isTaken || colorSaving}
                onClick={() => pickColor(isMine ? null : hex)}
                className={`relative w-full aspect-square rounded-md transition-all ${
                  isTaken
                    ? 'opacity-30 cursor-not-allowed'
                    : isMine
                      ? 'ring-2 ring-offset-1 ring-gray-800 scale-110'
                      : 'hover:scale-110 hover:ring-2 hover:ring-offset-1 hover:ring-gray-400'
                }`}
                style={{ backgroundColor: hex }}
              >
                {isMine && (
                  <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow">
                    ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {myColor && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: myColor }}
              />
              {CHART_COLORS.find(c => c.hex === myColor)?.label ?? myColor}
            </div>
            <button
              onClick={() => pickColor(null)}
              disabled={colorSaving}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Poista valinta
            </button>
          </div>
        )}

        {!myColor && (
          <p className="text-xs text-gray-400">Ei valittua väriä — väri määräytyy automaattisesti.</p>
        )}

        {colorError && <p className="text-xs text-red-600">{colorError}</p>}
        {colorSaved && <p className="text-xs text-green-600">✓ Väri tallennettu</p>}
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
