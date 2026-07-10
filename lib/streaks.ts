import { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './supabase/fetch-all'

export type StreakType = 'correct_5p' | 'right_result' | 'wrong_result' | 'zero_p' | 'non_zero_p' | 'non_5p'

export interface StreakState {
  current: number
  best: number
}

export interface PlayerStreaks {
  display_name: string
  streaks: Record<StreakType, StreakState>
}

const STREAK_TYPES: StreakType[] = ['correct_5p', 'right_result', 'wrong_result', 'zero_p', 'non_zero_p', 'non_5p']

function meetsCondition(type: StreakType, points: number, breakdown: { result: number; home_goals: number; away_goals: number }): boolean {
  switch (type) {
    case 'correct_5p':   return points === 5
    case 'right_result': return breakdown.result === 3
    case 'wrong_result': return breakdown.result === 0
    case 'zero_p':       return points === 0
    case 'non_zero_p':   return points > 0
    case 'non_5p':       return points < 5
  }
}


export async function computeStreaks(admin: SupabaseClient): Promise<PlayerStreaks[]> {
  const [{ data: profiles }, { data: log }, { data: seeds }] = await Promise.all([
    admin.from('profiles').select('id, display_name').order('display_name'),
    // scoring_log exceeds PostgREST's 1000-row response cap — page through
    fetchAllRows((from, to) =>
      admin.from('scoring_log')
        .select('user_id, points, breakdown, match_id, matches(kickoff_at)')
        .order('match_id', { ascending: true }).order('id').range(from, to)),
    admin.from('streak_seeds').select('display_name, streak_type, current, hist_best'),
  ])

  // Seed lookup: display_name → streak_type → { current, hist_best }
  const seedMap: Record<string, Record<string, { current: number; hist_best: number }>> = {}
  for (const s of seeds ?? []) {
    if (!seedMap[s.display_name]) seedMap[s.display_name] = {}
    seedMap[s.display_name][s.streak_type] = { current: s.current ?? 0, hist_best: s.hist_best ?? 0 }
  }

  const result: PlayerStreaks[] = []

  for (const profile of profiles ?? []) {
    const playerLog = (log ?? [])
      .filter(r => r.user_id === profile.id)
      .map(r => {
        const m = Array.isArray(r.matches) ? r.matches[0] : r.matches
        return {
          points: r.points as number,
          breakdown: r.breakdown as { result: number; home_goals: number; away_goals: number },
          kickoff_at: m?.kickoff_at ?? '',
        }
      })
      .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))

    const streaks: Record<StreakType, StreakState> = {} as Record<StreakType, StreakState>
    const playerSeeds = seedMap[profile.display_name] ?? {}

    for (const type of STREAK_TYPES) {
      const seed = playerSeeds[type] ?? { current: 0, hist_best: 0 }
      let current = seed.current
      // best starts at max of all-time historical best and the current ongoing streak (seed)
      let best = Math.max(seed.current, seed.hist_best)

      for (const game of playerLog) {
        if (meetsCondition(type, game.points, game.breakdown)) {
          current++
          if (current > best) best = current
        } else {
          current = 0
        }
      }

      streaks[type] = { current, best }
    }

    result.push({ display_name: profile.display_name, streaks })
  }

  return result
}

export const STREAK_LABELS: Record<StreakType, string> = {
  correct_5p:   '⭐ Täysosuma',
  right_result: '✅ Oikea merkki',
  wrong_result: '❌ Väärä merkki',
  zero_p:       '💀 Nollapeli',
  non_zero_p:   '🔥 Pisteitä',
  non_5p:       '🧊 Ei täysosumaa',
}
