/**
 * Compute all-time best streaks from historical data and upsert into streak_seeds.hist_best.
 *
 * Run once after the migration, and again whenever a new competition is archived.
 *
 * Usage:
 *   npx tsx scripts/populate-streak-hist-best.ts
 */

import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from '../lib/supabase/fetch-all'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type StreakType = 'correct_5p' | 'right_result' | 'wrong_result' | 'zero_p' | 'non_zero_p' | 'non_5p'
const STREAK_TYPES: StreakType[] = ['correct_5p', 'right_result', 'wrong_result', 'zero_p', 'non_zero_p', 'non_5p']

function meets(type: StreakType, points: number, signPred: string | null, resultSign: string | null): boolean {
  switch (type) {
    case 'correct_5p':   return points === 5
    case 'right_result': return signPred !== null && signPred === resultSign
    case 'wrong_result': return signPred !== null && signPred !== resultSign
    case 'zero_p':       return points === 0
    case 'non_zero_p':   return points > 0
    case 'non_5p':       return points < 5
  }
}

async function main() {
  // Fetch all hist_predictions with match + competition year for ordering
  // (well over PostgREST's 1000-row response cap — page through)
  const { data: preds, error } = await fetchAllRows((from, to) =>
    supabase
      .from('hist_predictions')
      .select('player_name, points, sign_pred, hist_matches(match_num, result_sign, competition_id, competitions(year))')
      .order('id').range(from, to))

  if (error) throw error

  // Fetch hist_players to map canonical_name → profile display_name
  const { data: histPlayers, error: hpErr } = await supabase
    .from('hist_players')
    .select('canonical_name, profile_id')
  if (hpErr) throw hpErr

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, display_name')
  if (pErr) throw pErr

  const profileById: Record<string, string> = {}
  for (const p of profiles ?? []) profileById[p.id] = p.display_name

  // canonical_name → display_name (only for players with linked profiles)
  const canonicalToDisplay: Record<string, string> = {}
  for (const hp of histPlayers ?? []) {
    if (hp.profile_id && profileById[hp.profile_id]) {
      canonicalToDisplay[hp.canonical_name] = profileById[hp.profile_id]
    }
  }

  // Group predictions by canonical player name, sort chronologically
  type Row = { points: number; signPred: string | null; resultSign: string | null; year: number; matchNum: number }
  const byPlayer: Record<string, Row[]> = {}
  for (const hp of preds ?? []) {
    const m = Array.isArray(hp.hist_matches) ? hp.hist_matches[0] : hp.hist_matches as any
    if (!m) continue
    const comp = Array.isArray(m.competitions) ? m.competitions[0] : m.competitions
    if (!byPlayer[hp.player_name]) byPlayer[hp.player_name] = []
    byPlayer[hp.player_name].push({
      points: hp.points ?? 0,
      signPred: hp.sign_pred,
      resultSign: m.result_sign,
      year: comp?.year ?? 0,
      matchNum: m.match_num,
    })
  }
  for (const rows of Object.values(byPlayer)) {
    rows.sort((a, b) => a.year !== b.year ? a.year - b.year : a.matchNum - b.matchNum)
  }

  // Compute best streak per (canonical_name, streak_type)
  const upsertRows: { display_name: string; streak_type: string; hist_best: number }[] = []

  for (const [canonicalName, rows] of Object.entries(byPlayer)) {
    const displayName = canonicalToDisplay[canonicalName]
    if (!displayName) continue  // player not in WC2026, skip

    for (const type of STREAK_TYPES) {
      let cur = 0, best = 0
      for (const row of rows) {
        if (meets(type, row.points, row.signPred, row.resultSign)) {
          cur++; if (cur > best) best = cur
        } else {
          cur = 0
        }
      }
      if (best > 0) {
        upsertRows.push({ display_name: displayName, streak_type: type, hist_best: best })
      }
    }
  }

  console.log(`Upserting ${upsertRows.length} rows...`)
  for (const row of upsertRows) {
    console.log(`  ${row.display_name} / ${row.streak_type}: hist_best = ${row.hist_best}`)
  }

  // Upsert into streak_seeds — update hist_best where row exists, insert with current=0 where not
  for (const row of upsertRows) {
    const { error: uErr } = await supabase
      .from('streak_seeds')
      .upsert(
        { display_name: row.display_name, streak_type: row.streak_type, hist_best: row.hist_best, current: 0 },
        { onConflict: 'display_name,streak_type', ignoreDuplicates: false }
      )
    if (uErr) {
      // If row exists, just update hist_best
      const { error: upErr } = await supabase
        .from('streak_seeds')
        .update({ hist_best: row.hist_best })
        .eq('display_name', row.display_name)
        .eq('streak_type', row.streak_type)
      if (upErr) console.error(`Failed for ${row.display_name}/${row.streak_type}:`, upErr.message)
    }
  }

  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
