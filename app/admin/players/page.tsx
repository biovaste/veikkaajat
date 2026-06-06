'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Player {
  id: string
  email: string
  display_name: string
  is_admin: boolean
  created_at: string
  prediction_count: number
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
      .select('id, email, display_name, is_admin, created_at')
      .order('display_name')

    if (data) {
      // Get prediction counts
      const { data: counts } = await supabase
        .from('predictions')
        .select('user_id')

      const countMap: Record<string, number> = {}
      counts?.forEach((p) => {
        countMap[p.user_id] = (countMap[p.user_id] ?? 0) + 1
      })

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
          <div className="flex gap-2">
            <input
              type="text"
              required
              placeholder="Nimi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="email"
              required
              placeholder="sähköposti@example.fi"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
                <th className="text-right px-4 py-2 font-medium text-gray-600">Veikkauksia</th>
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
                  <td className="px-4 py-2.5 text-right text-gray-600">{p.prediction_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
