'use client'

import { useEffect, useState } from 'react'
import { getCountry, flagUrl } from '@/lib/countries'
import { TOP_SCORER_PLAYERS, wildcardValue, isWildcard, wildcardCountry } from '@/lib/players'

interface GroupInfo {
  teams: string[]
  deadline: string
}

interface PageData {
  groups: Record<string, GroupInfo>
  results: Record<string, string>
}

export default function AdminCategoriesPage() {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [championInput, setChampionInput] = useState('')
  const [scorerInput, setScorerInput] = useState('')
  const [groupInputs, setGroupInputs] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Record<string, string>>({}) // category -> "✓ N veikkausta pisteytetty"

  useEffect(() => {
    fetch('/api/category-bets')
      .then(r => r.json())
      .then(d => {
        setData({ groups: d.groups ?? {}, results: d.results ?? {} })
        if (d.results?.['WORLD_CHAMPION']) setChampionInput(d.results['WORLD_CHAMPION'])
        if (d.results?.['TOP_SCORER']) setScorerInput(d.results['TOP_SCORER'])
        const inputs: Record<string, string[]> = {}
        for (const group of Object.keys(d.groups ?? {})) {
          inputs[group] = d.results?.[group] ? JSON.parse(d.results[group]) : []
        }
        setGroupInputs(inputs)
        setLoading(false)
      })
  }, [])

  async function score(category: string, correct_value: string) {
    setSaving(s => ({ ...s, [category]: true }))
    const res = await fetch('/api/admin/score-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, correct_value }),
    })
    const d = await res.json()
    setSaving(s => ({ ...s, [category]: false }))
    if (res.ok) {
      setDone(prev => ({ ...prev, [category]: `✓ ${d.scored} veikkausta pisteytetty` }))
      setData(prev => prev ? { ...prev, results: { ...prev.results, [category]: correct_value } } : prev)
    } else {
      alert('Virhe: ' + (d.error ?? 'Tuntematon virhe'))
    }
  }

  function toggleGroupTeam(group: string, team: string) {
    setGroupInputs(prev => {
      const current = prev[group] ?? []
      if (current.includes(team)) return { ...prev, [group]: current.filter(t => t !== team) }
      if (current.length < 2) return { ...prev, [group]: [...current, team] }
      return prev
    })
    setDone(prev => { const n = { ...prev }; delete n[group]; return n })
  }

  if (loading) return <div className="text-gray-400 text-sm">Ladataan...</div>
  if (!data) return null

  const allTeams = Array.from(new Set(Object.values(data.groups).flatMap(g => g.teams)))
    .sort((a, b) => getCountry(a).name.localeCompare(getCountry(b).name, 'fi'))

  const sortedGroups = Object.entries(data.groups).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Erikoisveikkausten pisteytys</h1>

      {/* World Champion */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div>
          <h2 className="font-semibold">🏆 Maailmanmestari</h2>
          <p className="text-xs text-gray-400 mt-0.5">10 pistettä oikeasta vastauksesta</p>
        </div>
        {data.results['WORLD_CHAMPION'] && (
          <p className="text-xs text-green-600">
            Pisteytetty: <strong>{getCountry(data.results['WORLD_CHAMPION']).name}</strong>
          </p>
        )}
        <select
          value={championInput}
          onChange={e => { setChampionInput(e.target.value); setDone(p => { const n = { ...p }; delete n['WORLD_CHAMPION']; return n }) }}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Valitse mestari...</option>
          {allTeams.map(t => (
            <option key={t} value={t}>{getCountry(t).name}</option>
          ))}
        </select>
        {done['WORLD_CHAMPION'] ? (
          <p className="text-sm text-green-600">{done['WORLD_CHAMPION']}</p>
        ) : (
          <button
            onClick={() => championInput && score('WORLD_CHAMPION', championInput)}
            disabled={!championInput || saving['WORLD_CHAMPION']}
            className="w-full py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving['WORLD_CHAMPION'] ? 'Pisteytetään…' : 'Pisteytä'}
          </button>
        )}
      </div>

      {/* Top scorer scoring */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div>
          <h2 className="font-semibold">⚽ Paras maalintekijä</h2>
          <p className="text-xs text-gray-400 mt-0.5">5 pistettä oikeasta vastauksesta</p>
        </div>
        {data.results['TOP_SCORER'] && (
          <p className="text-xs text-green-600">
            Pisteytetty:{' '}
            <strong>
              {isWildcard(data.results['TOP_SCORER'])
                ? `Muu ${getCountry(wildcardCountry(data.results['TOP_SCORER'])).name} pelaaja`
                : data.results['TOP_SCORER']}
            </strong>
          </p>
        )}
        <div className="max-h-64 overflow-y-auto rounded border border-gray-200 divide-y divide-gray-100">
          {TOP_SCORER_PLAYERS.map(player => {
            const { name: countryFi, code } = getCountry(player.country)
            const isSelected = scorerInput === player.name
            return (
              <button
                key={player.name}
                onClick={() => { setScorerInput(isSelected ? '' : player.name); setDone(p => { const n = { ...p }; delete n['TOP_SCORER']; return n }) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
              >
                <span className="text-gray-300 w-5 text-right shrink-0">{player.rank}</span>
                {code && <img src={flagUrl(code)} alt={countryFi} width={14} height={11} className="rounded-sm shrink-0" />}
                <span className="flex-1">{player.name}</span>
                <span className="text-gray-400">{countryFi}</span>
                {isSelected && <span className="text-blue-500">✓</span>}
              </button>
            )
          })}
          <div className="bg-gray-50 px-3 py-1">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Muu pelaaja</span>
          </div>
          {allTeams.map(country => {
            const wv = wildcardValue(country)
            const { name: countryFi, code } = getCountry(country)
            const isSelected = scorerInput === wv
            return (
              <button
                key={wv}
                onClick={() => { setScorerInput(isSelected ? '' : wv); setDone(p => { const n = { ...p }; delete n['TOP_SCORER']; return n }) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
              >
                <span className="w-5 shrink-0" />
                {code && <img src={flagUrl(code)} alt={countryFi} width={14} height={11} className="rounded-sm shrink-0" />}
                <span className="flex-1 text-gray-600">Muu {countryFi} pelaaja</span>
                {isSelected && <span className="text-blue-500">✓</span>}
              </button>
            )
          })}
        </div>
        {done['TOP_SCORER'] ? (
          <p className="text-xs text-green-600">{done['TOP_SCORER']}</p>
        ) : (
          <button
            onClick={() => scorerInput && score('TOP_SCORER', scorerInput)}
            disabled={!scorerInput || saving['TOP_SCORER']}
            className="w-full py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving['TOP_SCORER'] ? 'Pisteytetään…' : 'Pisteytä'}
          </button>
        )}
      </div>

      {/* Group advance scoring */}
      <div className="space-y-3">
        <div>
          <h2 className="font-semibold">Ryhmien jatkajat</h2>
          <p className="text-xs text-gray-400 mt-0.5">Valitse 2 jatkajaa per ryhmä ja pisteytä · 4 p per oikea joukkue</p>
        </div>

        {sortedGroups.map(([group, info]) => {
          const picks = groupInputs[group] ?? []
          const groupFi = group.replace('Group ', 'Ryhmä ')

          return (
            <div key={group} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">{groupFi}</h3>
                {data.results[group] && (
                  <span className="text-xs text-green-600">
                    {JSON.parse(data.results[group]).map((t: string) => getCountry(t).name).join(' & ')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1">
                {info.teams.map(team => (
                  <button
                    key={team}
                    onClick={() => toggleGroupTeam(group, team)}
                    className={`px-2.5 py-1.5 rounded text-xs border transition-colors ${
                      picks.includes(team)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : picks.length >= 2
                          ? 'text-gray-300 border-gray-100 cursor-not-allowed'
                          : 'text-gray-700 border-gray-200 hover:border-blue-400'
                    }`}
                  >
                    {getCountry(team).name}
                  </button>
                ))}
              </div>

              {done[group] ? (
                <p className="text-xs text-green-600">{done[group]}</p>
              ) : (
                <button
                  onClick={() => picks.length === 2 && score(group, JSON.stringify(picks))}
                  disabled={picks.length !== 2 || saving[group]}
                  className="w-full py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving[group]
                    ? 'Pisteytetään…'
                    : picks.length === 2
                      ? 'Pisteytä'
                      : `Valitse ${2 - picks.length} joukkue${2 - picks.length === 1 ? '' : 'tta'}`}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
