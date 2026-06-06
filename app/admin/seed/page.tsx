'use client'

import { useState } from 'react'

const STAGES = [
  { value: 'GROUP_STAGE', label: 'Lohkovaihe' },
  { value: 'ROUND_OF_16', label: 'Kahdeksasfinaalit' },
  { value: 'QUARTER_FINALS', label: 'Neljännesfinaalit' },
  { value: 'SEMI_FINALS', label: 'Puolifinaalit' },
  { value: 'THIRD_PLACE', label: 'Pronssiottelu' },
  { value: 'FINAL', label: 'Finaali' },
  { value: '', label: 'Kaikki vaiheet' },
]

export default function SeedPage() {
  const [stage, setStage] = useState('GROUP_STAGE')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported?: number; error?: string } | null>(null)

  async function handleSeed() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/seed-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: stage || undefined }),
      })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ error: 'Verkkovirhe' })
    }
    setLoading(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tuo ottelut</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Vaihe</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSeed}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Haetaan...' : 'Tuo ottelut'}
        </button>

        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {result.error
              ? `Virhe: ${result.error}`
              : `✓ ${result.imported} ottelua tuotu/päivitetty`}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Toiminto on turvallista toistaa — jo olemassa olevat ottelut päivitetään eikä duplikaatteja synny.
      </p>
    </div>
  )
}
