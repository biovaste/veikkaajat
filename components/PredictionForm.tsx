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
  const [error, setError] = useState<string | null>(null)

  // hasSaved: true when a prediction exists (loaded from server or just saved)
  const [hasSaved, setHasSaved] = useState(initialHome !== undefined)
  // isDirty: true when user has changed inputs since last save
  const [isDirty, setIsDirty] = useState(false)

  const isSavedClean = hasSaved && !isDirty

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

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
      setHasSaved(true)
      setIsDirty(false)
      onSaved?.(Number(home), Number(away))
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
        onChange={(e) => { setHome(e.target.value); setIsDirty(true) }}
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
        onChange={(e) => { setAway(e.target.value); setIsDirty(true) }}
        className="w-12 text-center border border-gray-300 rounded-lg py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="–"
      />
      <button
        type="submit"
        disabled={saving}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
          isSavedClean
            ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {saving ? '...' : isSavedClean ? 'Muokkaa' : 'Tallenna'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  )
}
