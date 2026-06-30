'use client'

import { useState } from 'react'

export default function SeedPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported?: number; error?: string } | null>(null)

  async function handleSeed() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/seed-matches', { method: 'POST' })
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
        <button
          onClick={handleSeed}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Haetaan...' : 'Tuo kaikki ottelut'}
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
        Hakee kaikki ottelut kaikista vaiheista football-data.org:sta. Toiminto on turvallista
        toistaa — jo olemassa olevat ottelut päivitetään eikä duplikaatteja synny. Joukkueiden
        nimiä ei koskaan päivitetä takaisin &quot;TBD&quot;:ksi, jos oikea nimi on jo tiedossa.
      </p>
    </div>
  )
}
