'use client'

import { useState } from 'react'
import MatchCard from './MatchCard'
import { stageLabel } from '@/lib/utils'

interface Match {
  id: number
  home_team: string
  away_team: string
  kickoff_at: string
  status: string
  stage: string
  group_name: string | null
  home_score: number | null
  away_score: number | null
}

interface Prediction {
  home_score_pred: number
  away_score_pred: number
  points: number | null
}

interface Props {
  matches: Match[]
  predMap: Record<number, Prediction>
}

const STAGE_ORDER = ['GROUP_STAGE', 'LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL']

export default function MatchList({ matches, predMap }: Props) {
  const now = new Date()
  const hasUpcoming = matches.some((m) => new Date(m.kickoff_at) > now)
  const [filter, setFilter] = useState<'upcoming' | 'all'>(hasUpcoming ? 'upcoming' : 'all')

  const visible = filter === 'upcoming'
    ? matches.filter((m) => new Date(m.kickoff_at) > now || m.status === 'SCHEDULED')
    : matches

  // Group by stage
  const grouped: Record<string, Match[]> = {}
  for (const m of visible) {
    if (!grouped[m.stage]) grouped[m.stage] = []
    grouped[m.stage].push(m)
  }

  return (
    <div className="space-y-6">
      {/* Filter toggle */}
      {hasUpcoming && (
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('upcoming')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filter === 'upcoming' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Tulevat
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Kaikki
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-gray-400 text-sm">Ei tulevia otteluja.</p>
      ) : (
        STAGE_ORDER.filter((s) => grouped[s]).map((stage) => (
          <section key={stage}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {stageLabel(stage)}
            </h2>
            <div className="space-y-2">
              {grouped[stage].map((m) => (
                <MatchCard key={m.id} match={m} prediction={predMap[m.id]} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
