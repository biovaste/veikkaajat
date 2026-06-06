'use client'

import { useState } from 'react'

interface Props {
  matchId: number
  initialHome?: number
  initialAway?: number
  onSaved?: (home: number, away: number) => void
}

export default function PredictionForm({ matchId, initialHome, initialAway, onSaved }: Props) {
  const [home, setHome] = useState(initialHome ?? '')
  const [away, setAway] = useState(initialAway ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const res = await fetch('/api/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_id: matchId,
        home_score_pred: Number(home),
        away_score_pred: Number(away),
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Virhe tallennettaessa')
    } else {
      setSaved(true)
      onSaved?.(Number(home), Number(away))
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
      <input
        type="number"
        min={0}
        max={20}
        required
        value={home}
        onChange={(e) => { setHome(e.target.value); setSaved(false) }}
        className="w-12 text-center border border-gray-300 rounded-lg py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="–"
      />
      <span className="text-gray-400 font-medium">–</span>
      <input
        type="number"
        min={0}
        max={20}
        required
        value={away}
        onChange={(e) => { setAway(e.target.value); setSaved(false) }}
        className="w-12 text-center border border-gray-300 rounded-lg py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="–"
      />
      <button
        type="submit"
        disabled={saving}
        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? '...' : saved ? '✓' : 'Tallenna'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  )
}
