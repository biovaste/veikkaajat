'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, stageLabel } from '@/lib/utils'

interface Match {
  id: number
  home_team: string
  away_team: string
  kickoff_at: string
  stage: string
  group_name: string | null
  home_score: number | null
  away_score: number | null
  status: string
}

function OverrideForm({ match, onDone }: { match: Match; onDone: () => void }) {
  const [home, setHome] = useState(match.home_score ?? '')
  const [away, setAway] = useState(match.away_score ?? '')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setResult(null)
    const res = await fetch('/api/admin/override-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_id: match.id,
        home_score: Number(home),
        away_score: Number(away),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setResult(`Virhe: ${data.error}`)
    } else {
      setResult(`✓ ${data.scored} veikkausta pisteytetty`)
      onDone()
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2 flex-wrap">
      <input
        type="number" min={0} max={30} required
        value={home} onChange={(e) => setHome(e.target.value)}
        className="w-14 text-center border border-gray-300 rounded px-2 py-1 text-sm font-bold"
      />
      <span className="text-gray-400">–</span>
      <input
        type="number" min={0} max={30} required
        value={away} onChange={(e) => setAway(e.target.value)}
        className="w-14 text-center border border-gray-300 rounded px-2 py-1 text-sm font-bold"
      />
      <button
        type="submit" disabled={saving}
        className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? '...' : 'Aseta tulos'}
      </button>
      {result && (
        <span className={`text-xs ${result.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
          {result}
        </span>
      )}
    </form>
  )
}

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('all')

  const supabase = createClient()

  async function load() {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .order('kickoff_at', { ascending: true })
    setMatches(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const stages = [...new Set(matches.map((m) => m.stage))]
  const filtered = stageFilter === 'all' ? matches : matches.filter((m) => m.stage === stageFilter)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tulokset</h1>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStageFilter('all')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${stageFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Kaikki
        </button>
        {stages.map((s) => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${stageFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {stageLabel(s)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Ladataan...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">Ei otteluja.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div key={m.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{m.home_team} – {m.away_team}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formatDate(m.kickoff_at)}
                    {m.group_name && ` · ${m.group_name}`}
                  </div>
                </div>
                {m.home_score !== null && m.away_score !== null && (
                  <span className="font-bold text-sm text-green-700">
                    {m.home_score}–{m.away_score}
                  </span>
                )}
              </div>
              <OverrideForm match={m} onDone={load} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
