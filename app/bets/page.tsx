'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCountry, flagUrl } from '@/lib/countries'
import { TOP_SCORER_PLAYERS, getPlayerCountries, wildcardValue, isWildcard, wildcardCountry } from '@/lib/players'
import { useRouter } from 'next/navigation'

interface GroupInfo {
  teams: string[]
  deadline: string
}

interface BetsData {
  bets: Record<string, string>
  points: Record<string, number | null>
  groups: Record<string, GroupInfo>
  championDeadline: string | null
  results: Record<string, string>
}

function TeamButton({
  team,
  selected,
  disabled,
  locked,
  correct,
  onClick,
}: {
  team: string
  selected: boolean
  disabled: boolean
  locked: boolean
  correct: boolean | null // null = not yet scored
  onClick: () => void
}) {
  const { name, code } = getCountry(team)

  if (locked) {
    const colorClass =
      correct === true
        ? 'bg-green-100 text-green-700 border-green-300'
        : correct === false && selected
          ? 'bg-red-50 text-red-500 border-red-200'
          : selected
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-gray-50 text-gray-400 border-gray-100'

    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs ${colorClass}`}>
        {code && <img src={flagUrl(code)} alt={name} width={16} height={12} className="rounded-sm shrink-0" />}
        <span className="flex-1">{name}</span>
        {selected && correct === true && <span>✓</span>}
        {selected && correct === false && <span>✗</span>}
        {selected && correct === null && <span className="text-blue-400">✓</span>}
        {!selected && correct === true && <span className="text-green-500">✓</span>}
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled && !selected}
      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs transition-colors ${
        selected
          ? 'bg-blue-600 text-white border-blue-600'
          : disabled
            ? 'text-gray-300 border-gray-100 cursor-not-allowed'
            : 'text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600'
      }`}
    >
      {code && <img src={flagUrl(code)} alt={name} width={16} height={12} className="rounded-sm shrink-0" />}
      <span className="flex-1">{name}</span>
      {selected && <span className="text-xs">✓</span>}
    </button>
  )
}

export default function BetsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [data, setData] = useState<BetsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [championPick, setChampionPick] = useState('')
  const [scorerPick, setScorerPick] = useState('')
  const [groupPicks, setGroupPicks] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [scorerSearch, setScorerSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const res = await fetch('/api/category-bets')
      if (!res.ok) { setLoading(false); return }

      const d: BetsData = await res.json()
      setData(d)
      setChampionPick(d.bets['WORLD_CHAMPION'] ?? '')
      setScorerPick(d.bets['TOP_SCORER'] ?? '')

      const picks: Record<string, string[]> = {}
      for (const group of Object.keys(d.groups)) {
        picks[group] = d.bets[group] ? JSON.parse(d.bets[group]) : []
      }
      setGroupPicks(picks)
      setLoading(false)
    }
    load()
  }, [])

  async function saveChampion() {
    if (!championPick) return
    setSaving(s => ({ ...s, WORLD_CHAMPION: true }))
    setSaved(s => ({ ...s, WORLD_CHAMPION: false }))
    setErrors(e => ({ ...e, WORLD_CHAMPION: '' }))

    const res = await fetch('/api/category-bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'WORLD_CHAMPION', bet_value: championPick }),
    })
    const d = await res.json()
    setSaving(s => ({ ...s, WORLD_CHAMPION: false }))
    if (res.ok) {
      setSaved(s => ({ ...s, WORLD_CHAMPION: true }))
    } else {
      setErrors(e => ({ ...e, WORLD_CHAMPION: d.error ?? 'Virhe' }))
    }
  }

  async function saveScorer() {
    if (!scorerPick) return
    setSaving(s => ({ ...s, TOP_SCORER: true }))
    setSaved(s => ({ ...s, TOP_SCORER: false }))
    setErrors(e => ({ ...e, TOP_SCORER: '' }))
    const res = await fetch('/api/category-bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'TOP_SCORER', bet_value: scorerPick }),
    })
    const d = await res.json()
    setSaving(s => ({ ...s, TOP_SCORER: false }))
    if (res.ok) setSaved(s => ({ ...s, TOP_SCORER: true }))
    else setErrors(e => ({ ...e, TOP_SCORER: d.error ?? 'Virhe' }))
  }

  async function saveGroup(group: string) {
    const picks = groupPicks[group] ?? []
    if (picks.length !== 2) return
    setSaving(s => ({ ...s, [group]: true }))
    setSaved(s => ({ ...s, [group]: false }))

    const res = await fetch('/api/category-bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: group, bet_value: JSON.stringify(picks) }),
    })
    const d = await res.json()
    setSaving(s => ({ ...s, [group]: false }))
    if (res.ok) {
      setSaved(s => ({ ...s, [group]: true }))
    } else {
      setErrors(e => ({ ...e, [group]: d.error ?? 'Virhe' }))
    }
  }

  function toggleGroupTeam(group: string, team: string) {
    setSaved(s => ({ ...s, [group]: false }))
    setGroupPicks(prev => {
      const current = prev[group] ?? []
      if (current.includes(team)) return { ...prev, [group]: current.filter(t => t !== team) }
      if (current.length < 2) return { ...prev, [group]: [...current, team] }
      return prev
    })
  }

  if (loading) return <div className="text-gray-400 text-sm">Ladataan...</div>
  if (!data) return <div className="text-red-500 text-sm">Virhe ladattaessa veikkauksia.</div>

  const now = new Date()
  const championLocked = data.championDeadline ? new Date(data.championDeadline) <= now : false
  const championResult = data.results['WORLD_CHAMPION']
  const championPoints = data.points['WORLD_CHAMPION']

  const allTeams = Array.from(new Set(Object.values(data.groups).flatMap(g => g.teams)))
    .sort((a, b) => getCountry(a).name.localeCompare(getCountry(b).name, 'fi'))

  const sortedGroups = Object.entries(data.groups).sort(([a], [b]) => a.localeCompare(b))

  // Total bonus points earned so far
  const totalBonus = Object.values(data.points).reduce<number>((sum, p) => sum + (p ?? 0), 0)
  const maxBonus = 10 + 5 + sortedGroups.length * 4 // champion + scorer + groups

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Erikoisveikkaukset</h1>
        {totalBonus > 0 && (
          <span className="text-sm text-gray-500">{totalBonus} / {maxBonus} p</span>
        )}
      </div>

      {/* ── World Champion ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">🏆 Maailmanmestari</h2>
            <p className="text-xs text-gray-400 mt-0.5">10 pistettä oikeasta vastauksesta</p>
          </div>
          {championPoints !== null && (
            <span className={`text-sm font-bold shrink-0 ${championPoints > 0 ? 'text-green-600' : 'text-gray-400'}`}>
              {championPoints} / 10 p
            </span>
          )}
        </div>

        {championResult && (
          <p className="text-xs text-gray-500">
            Oikea vastaus: <strong>{getCountry(championResult).name}</strong>
          </p>
        )}

        {championLocked ? (
          <div className="text-sm">
            {championPick ? (
              <span className="text-gray-600">
                Veikkauksesi: <strong>{getCountry(championPick).name}</strong>
                {(() => {
                  const { code } = getCountry(championPick)
                  return code ? <img src={flagUrl(code)} alt="" width={16} height={12} className="inline ml-1 rounded-sm" /> : null
                })()}
                <span className="ml-1.5 text-xs text-gray-400">(lukittu)</span>
              </span>
            ) : (
              <span className="text-gray-300 text-xs">Et veikannut maailmanmestaria</span>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <select
              value={championPick}
              onChange={e => { setChampionPick(e.target.value); setSaved(s => ({ ...s, WORLD_CHAMPION: false })) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Valitse joukkue...</option>
              {allTeams.map(team => (
                <option key={team} value={team}>{getCountry(team).name}</option>
              ))}
            </select>
            {errors['WORLD_CHAMPION'] && (
              <p className="text-xs text-red-600">{errors['WORLD_CHAMPION']}</p>
            )}
            <button
              onClick={saveChampion}
              disabled={!championPick || saving['WORLD_CHAMPION']}
              className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                saved['WORLD_CHAMPION']
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
              }`}
            >
              {saving['WORLD_CHAMPION'] ? 'Tallennetaan…' : saved['WORLD_CHAMPION'] ? '✓ Tallennettu' : 'Tallenna'}
            </button>
          </div>
        )}
      </div>

      {/* ── Top scorer ── */}
      {(() => {
        const scorerLocked = championLocked // same deadline as world champion
        const scorerResult = data.results['TOP_SCORER']
        const scorerPoints = data.points['TOP_SCORER']

        return (
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">⚽ Paras maalintekijä</h2>
                <p className="text-xs text-gray-400 mt-0.5">5 pistettä oikeasta vastauksesta</p>
              </div>
              {scorerPoints !== null && (
                <span className={`text-sm font-bold shrink-0 ${scorerPoints > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {scorerPoints} / 5 p
                </span>
              )}
            </div>

            {scorerResult && (
              <p className="text-xs text-gray-500">
                Oikea vastaus:{' '}
                <strong>
                  {isWildcard(scorerResult)
                    ? `Muu ${getCountry(wildcardCountry(scorerResult)).name} pelaaja`
                    : scorerResult}
                </strong>
              </p>
            )}

            {scorerLocked ? (
              <div className="text-sm">
                {scorerPick ? (
                  <span className="text-gray-600">
                    Veikkauksesi:{' '}
                    <strong>
                      {isWildcard(scorerPick)
                        ? `Muu ${getCountry(wildcardCountry(scorerPick)).name} pelaaja`
                        : scorerPick}
                    </strong>
                    <span className="ml-1.5 text-xs text-gray-400">(lukittu)</span>
                  </span>
                ) : (
                  <span className="text-gray-300 text-xs">Et veikannut parasta maalintekijää</span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Search box */}
                <input
                  type="search"
                  placeholder="Hae pelaajaa tai maata…"
                  value={scorerSearch}
                  onChange={e => setScorerSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
                  {/* Players grouped by country */}
                  {(() => {
                    const q = scorerSearch.trim().toLowerCase()
                    // Build country groups preserving sorted order from players.ts
                    const countries = getPlayerCountries()
                    const groups = countries.map(country => {
                      const { name: countryFi, code } = getCountry(country)
                      const players = TOP_SCORER_PLAYERS.filter(p => p.country === country)
                      const matchesCountry = !q || countryFi.toLowerCase().includes(q)
                      const filteredPlayers = matchesCountry
                        ? players
                        : players.filter(p => p.name.toLowerCase().includes(q))
                      const showWildcard = matchesCountry || `muu ${countryFi}`.toLowerCase().includes(q)
                      return { country, countryFi, code, filteredPlayers, showWildcard }
                    }).filter(g => g.filteredPlayers.length > 0 || g.showWildcard)

                    if (groups.length === 0) {
                      return <p className="px-3 py-4 text-sm text-gray-400 text-center">Ei tuloksia</p>
                    }

                    return groups.map(({ country, countryFi, code, filteredPlayers, showWildcard }) => {
                      const wv = wildcardValue(country)
                      return (
                        <div key={country}>
                          {/* Country header */}
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                            {code && <img src={flagUrl(code)} alt={countryFi} width={16} height={12} className="rounded-sm shrink-0" />}
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{countryFi}</span>
                          </div>
                          {/* Named players */}
                          {filteredPlayers.map(player => {
                            const isSelected = scorerPick === player.name
                            return (
                              <button
                                key={player.name}
                                onClick={() => { setScorerPick(isSelected ? '' : player.name); setSaved(s => ({ ...s, TOP_SCORER: false })) }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-b border-gray-100 last:border-0 ${
                                  isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                                }`}
                              >
                                <span className="flex-1">{player.name}</span>
                                {isSelected && <span className="text-blue-500 text-xs">✓</span>}
                              </button>
                            )
                          })}
                          {/* Wildcard for this country */}
                          {showWildcard && (() => {
                            const isSelected = scorerPick === wv
                            return (
                              <button
                                onClick={() => { setScorerPick(isSelected ? '' : wv); setSaved(s => ({ ...s, TOP_SCORER: false })) }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-b border-gray-100 last:border-0 ${
                                  isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                                }`}
                              >
                                <span className="flex-1 italic text-gray-500">Muu {countryFi} pelaaja</span>
                                {isSelected && <span className="text-blue-500 text-xs">✓</span>}
                              </button>
                            )
                          })()}
                        </div>
                      )
                    })
                  })()}
                </div>

                {errors['TOP_SCORER'] && <p className="text-xs text-red-600">{errors['TOP_SCORER']}</p>}

                <button
                  onClick={saveScorer}
                  disabled={!scorerPick || saving['TOP_SCORER']}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                    saved['TOP_SCORER']
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                  }`}
                >
                  {saving['TOP_SCORER'] ? 'Tallennetaan…' : saved['TOP_SCORER'] ? '✓ Tallennettu' : scorerPick ? 'Tallenna' : 'Valitse pelaaja'}
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Group advance bets ── */}
      <div className="space-y-3">
        <div>
          <h2 className="font-semibold">Ryhmien jatkajat</h2>
          <p className="text-xs text-gray-400 mt-0.5">Valitse 2 joukkuetta per ryhmä jotka jatkavat · 4 pistettä per oikea</p>
        </div>

        {sortedGroups.map(([group, info]) => {
          const isLocked = new Date(info.deadline) <= now
          const picks = groupPicks[group] ?? []
          const groupPoints = data.points[group]
          const groupResult = data.results[group]
          const resultTeams: string[] = groupResult ? JSON.parse(groupResult) : []
          const groupFi = group.replace('Group ', 'Ryhmä ')
          const remaining = 2 - picks.length

          return (
            <div key={group} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">{groupFi}</h3>
                <div className="flex items-center gap-2">
                  {isLocked && picks.length === 0 && (
                    <span className="text-xs text-gray-300">Ei veikkausta</span>
                  )}
                  {groupPoints !== null && (
                    <span className={`text-xs font-bold ${groupPoints > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {groupPoints} / 4 p
                    </span>
                  )}
                </div>
              </div>

              {resultTeams.length > 0 && (
                <p className="text-xs text-gray-500">
                  Jatkajat: <strong>{resultTeams.map(t => getCountry(t).name).join(' & ')}</strong>
                </p>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                {info.teams.map(team => {
                  const isSelected = picks.includes(team)
                  const isCorrect = resultTeams.length > 0 ? resultTeams.includes(team) : null

                  return (
                    <TeamButton
                      key={team}
                      team={team}
                      selected={isSelected}
                      disabled={picks.length >= 2}
                      locked={isLocked}
                      correct={isSelected ? isCorrect : (resultTeams.includes(team) ? true : null)}
                      onClick={() => toggleGroupTeam(group, team)}
                    />
                  )
                })}
              </div>

              {!isLocked && (
                <>
                  {errors[group] && <p className="text-xs text-red-600">{errors[group]}</p>}
                  <button
                    onClick={() => saveGroup(group)}
                    disabled={picks.length !== 2 || saving[group]}
                    className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
                      saved[group]
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : picks.length === 2
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {saving[group]
                      ? 'Tallennetaan…'
                      : saved[group]
                        ? '✓ Tallennettu'
                        : picks.length === 2
                          ? 'Tallenna'
                          : `Valitse ${remaining} joukkue${remaining === 1 ? '' : 'tta'}`}
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
