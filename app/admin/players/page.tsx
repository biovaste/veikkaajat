'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Player {
  id: string
  email: string
  display_name: string
  is_admin: boolean
  telegram_chat_id: string | null
  prediction_count: number
}

function TelegramIdCell({ player, onSaved }: { player: Player; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(player.telegram_chat_id ?? '')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function save() {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ telegram_chat_id: value.trim() || null })
      .eq('id', player.id)
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="chat_id"
          className="w-32 border border-gray-300 rounded px-2 py-0.5 text-xs font-mono"
        />
        <button onClick={save} disabled={saving} className="text-xs text-blue-600 hover:underline">
          {saving ? '...' : 'OK'}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:underline">
          Peru
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs font-mono text-left hover:underline"
      title="Klikkaa muokataksesi"
    >
      {player.telegram_chat_id ? (
        <span className="text-green-700">{player.telegram_chat_id}</span>
      ) : (
        <span className="text-gray-300 italic">–</span>
      )}
    </button>
  )
}

function LoginLinkButton({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle')

  async function generate() {
    setState('loading')
    try {
      const res = await fetch('/api/admin/generate-login-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) { setState('error'); return }
      await navigator.clipboard.writeText(data.link)
      setState('copied')
      setTimeout(() => setState('idle'), 3000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <button
      onClick={generate}
      disabled={state === 'loading'}
      className={`text-xs px-2 py-1 rounded transition-colors whitespace-nowrap ${
        state === 'copied'
          ? 'bg-green-100 text-green-700'
          : state === 'error'
            ? 'bg-red-100 text-red-600'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {state === 'loading' ? '...' : state === 'copied' ? '✓ Kopioitu' : state === 'error' ? 'Virhe' : 'Kopioi linkki'}
    </button>
  )
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<string | null>(null)

  const supabase = createClient()

  async function loadPlayers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, display_name, is_admin, telegram_chat_id, created_at')
      .order('display_name')

    if (data) {
      const { data: counts } = await supabase.from('predictions').select('user_id')
      const countMap: Record<string, number> = {}
      counts?.forEach((p) => { countMap[p.user_id] = (countMap[p.user_id] ?? 0) + 1 })
      setPlayers(data.map((p) => ({ ...p, prediction_count: countMap[p.id] ?? 0 })))
    }
    setLoading(false)
  }

  useEffect(() => { loadPlayers() }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteResult(null)
    try {
      const res = await fetch('/api/admin/invite-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, display_name: name }),
      })
      const data = await res.json()
      if (data.error) {
        setInviteResult(`Virhe: ${data.error}`)
      } else {
        setInviteResult(`✓ Kutsu lähetetty: ${email}`)
        setEmail('')
        setName('')
        loadPlayers()
      }
    } catch {
      setInviteResult('Verkkovirhe')
    }
    setInviting(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pelaajat</h1>

      {/* Invite form */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-semibold mb-3">Kutsu pelaaja</h2>
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Nimi (vapaaehtoinen — pelaaja voi asettaa itse)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="email"
              required
              placeholder="sähköposti@example.fi"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={inviting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap transition-colors"
            >
              {inviting ? '...' : 'Kutsu'}
            </button>
          </div>
          {inviteResult && (
            <p className={`text-sm ${inviteResult.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>
              {inviteResult}
            </p>
          )}
        </form>
      </div>

      {/* Telegram registration note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <strong>Telegram-rekisteröinti:</strong> Pelaajan täytyy lähettää /start botille,
        jolloin botti kertoo hänen Chat ID:nsä. Syötä se alle Telegram-sarakkeeseen.
      </div>

      {/* Player list */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="p-4 text-sm text-gray-400">Ladataan...</p>
        ) : players.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">Ei pelaajia vielä.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Nimi</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 hidden sm:table-cell">Sähköposti</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Telegram</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Veikkauksia</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {players.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5">
                    {p.display_name}
                    {p.is_admin && <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 rounded px-1">admin</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{p.email}</td>
                  <td className="px-4 py-2.5">
                    <TelegramIdCell player={p} onSaved={loadPlayers} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{p.prediction_count}</td>
                  <td className="px-4 py-2.5 text-right">
                    <LoginLinkButton email={p.email} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
