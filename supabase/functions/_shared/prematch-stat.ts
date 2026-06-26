// Generates a fun one-liner stat for the pre-match Telegram message.
// Runs stat queries in parallel, picks the most interesting candidate,
// then asks Claude Haiku to write a punchy Finnish sentence.
//
// All personal stat functions filter to active players only
// (hist_players rows with profile_id IS NOT NULL).

// deno-lint-ignore-file no-explicit-any

// ── Team name mapping ──────────────────────────────────────────────────────────
// football-data.org English names (matches.home_team / away_team)
// → hist_matches 3-letter codes. Teams without historical data are omitted.
export const TEAM_CODE_MAP: Record<string, string> = {
  Algeria: 'ALG',       Argentina: 'ARG',       Australia: 'AUS',
  Austria: 'AUT',       Belgium: 'BEL',          'Bosnia and Herzegovina': 'BIH',
  Brazil: 'BRA',        Chile: 'CHI',             Colombia: 'COL',
  'Costa Rica': 'CRC',  Croatia: 'CRO',           Czechia: 'CZE',
  Ecuador: 'ECU',       Egypt: 'EGY',             England: 'ENG',
  Spain: 'ESP',         France: 'FRA',            Georgia: 'GEO',
  Germany: 'GER',       Ghana: 'GHA',             Greece: 'GRE',
  Hungary: 'HUN',       Iran: 'IRN',              Iceland: 'ISL',
  Italy: 'ITA',         Japan: 'JPN',             'South Korea': 'KOR',
  'Saudi Arabia': 'KSA', Morocco: 'MAR',          Mexico: 'MEX',
  'North Macedonia': 'MKD', Netherlands: 'NED',   'New Zealand': 'NZL',
  Panama: 'PAN',        Paraguay: 'PAR',          Peru: 'PER',
  Poland: 'POL',        Portugal: 'POR',          Romania: 'ROU',
  'South Africa': 'RSA', Russia: 'RUS',           Scotland: 'SCO',
  Senegal: 'SEN',       Serbia: 'SRB',            Switzerland: 'SUI',
  Slovakia: 'SVK',      Slovenia: 'SVN',          Sweden: 'SWE',
  Tunisia: 'TUN',       Turkey: 'TUR',            Ukraine: 'UKR',
  Uruguay: 'URU',       'United States': 'USA',   Wales: 'WAL',
  'Ivory Coast': 'CIV', Cameroon: 'CMR',          Nigeria: 'NGA',
  'North Korea': 'PRK',
}

// Finnish names for hist 3-letter codes
const FI_NAMES: Record<string, string> = {
  ALG: 'Algeria',       ARG: 'Argentiina',      AUS: 'Australia',
  AUT: 'Itävalta',      BEL: 'Belgia',          BIH: 'Bosnia-Hertsegovina',
  BRA: 'Brasilia',      CHI: 'Chile',            CIV: 'Norsunluurannikko',
  CMR: 'Kamerun',       COL: 'Kolumbia',         CRC: 'Costa Rica',
  CRO: 'Kroatia',       CZE: 'Tshekki',          ECU: 'Ecuador',
  EGY: 'Egypti',        ENG: 'Englanti',          ESP: 'Espanja',
  FRA: 'Ranska',        GEO: 'Georgia',           GER: 'Saksa',
  GHA: 'Ghana',         GRE: 'Kreikka',           HUN: 'Unkari',
  IRL: 'Irlanti',       IRN: 'Iran',              ISL: 'Islanti',
  ITA: 'Italia',        JPN: 'Japani',            KOR: 'Etelä-Korea',
  KSA: 'Saudi-Arabia',  MAR: 'Marokko',           MEX: 'Meksiko',
  MKD: 'Pohjois-Makedonia', NED: 'Alankomaat',    NGA: 'Nigeria',
  NZL: 'Uusi-Seelanti', PAN: 'Panama',            PAR: 'Paraguay',
  PER: 'Peru',          POL: 'Puola',             POR: 'Portugali',
  RSA: 'Etelä-Afrikka', ROU: 'Romania',           RUS: 'Venäjä',
  SCO: 'Skotlanti',     SEN: 'Senegal',           SRB: 'Serbia',
  SUI: 'Sveitsi',       SVK: 'Slovakia',          SVN: 'Slovenia',
  SWE: 'Ruotsi',        TUN: 'Tunisia',           TUR: 'Turkki',
  UKR: 'Ukraina',       URU: 'Uruguay',           USA: 'Yhdysvallat',
  WAL: 'Wales',
}

// ── Stage mapping ─────────────────────────────────────────────────────────────
const STAGE_HIST_CODES: Record<string, string[]> = {
  ROUND_OF_16: ['JP'],
  QUARTER_FINALS: ['JPV'],
  SEMI_FINALS: ['JV'],
  FINAL: ['JF', 'JNV'],
}

const STAGE_FI_LABEL: Record<string, string> = {
  ROUND_OF_16: 'pudotuspelissä (1/8)',
  QUARTER_FINALS: 'puolivälierässä',
  SEMI_FINALS: 'välierässä',
  FINAL: 'finaalissa',
}

// ── Stat candidate ────────────────────────────────────────────────────────────
interface StatCandidate {
  type: string
  rawDescription: string  // English — fed to Claude
  fallbackText: string    // Finnish template — used if Claude unavailable
  priority: number        // higher = shown first
  // Scoreline habit metadata: used to validate against tonight's prediction
  // and to build habit_breaking candidates
  playerName?: string
  habitHome?: number
  habitAway?: number
  habitCount?: number
  habitTeamFi?: string
}

// ── SQL-backed stat queries ───────────────────────────────────────────────────

async function queryKryptonite(db: any, code: string, teamName: string): Promise<StatCandidate | null> {
  try {
    const { data, error } = await db.rpc('stat_kryptonite', { p_team_code: code, p_team_name: teamName })
    if (error || !data?.length) return null
    const { player_name: player, attempts } = data[0]
    const fi = FI_NAMES[code] ?? code
    const n = Number(attempts)
    return {
      type: 'result_always_wrong',
      rawDescription: `${player} has never once predicted the correct match result for ${fi} — 0 out of ${n} attempts across all tournaments including this one`,
      fallbackText: `${player} ei ole koskaan arvannut oikein ${fi}-ottelun merkkiä — 0/${n} yrityksellä`,
      priority: 55 + n * 2,
    }
  } catch { return null }
}

async function queryPerfectRecord(db: any, code: string, teamName: string): Promise<StatCandidate | null> {
  try {
    const { data, error } = await db.rpc('stat_perfect_record', { p_team_code: code, p_team_name: teamName })
    if (error || !data?.length) return null
    const { player_name: player, matches } = data[0]
    const fi = FI_NAMES[code] ?? code
    const n = Number(matches)
    return {
      type: 'result_always_right',
      rawDescription: `${player} has correctly predicted the match result for every single ${fi} game — a perfect ${n}/${n} record across all tournaments including this one`,
      fallbackText: `${player} on arvannut oikein jokaisen ${fi}-ottelun merkin — täydellinen ${n}/${n}`,
      priority: 20 + n * 2,
    }
  } catch { return null }
}

async function queryTeamExpert(db: any, code: string, teamName: string): Promise<StatCandidate | null> {
  try {
    const { data, error } = await db.rpc('stat_team_expert', { p_team_code: code, p_team_name: teamName })
    if (error || !data?.length) return null
    const { player_name: player, n_matches, player_pct, group_avg_pct } = data[0]
    const fi = FI_NAMES[code] ?? code
    const gap = Number(player_pct) - Number(group_avg_pct)
    return {
      type: 'team_expert',
      rawDescription: `${player} is the group's best ${fi} predictor at ${player_pct}% correct, while the group average is only ${group_avg_pct}% (across ${n_matches} matches)`,
      fallbackText: `${player} on ryhmän ${fi}-spesialisti: ${player_pct}% oikein (muut keskimäärin ${group_avg_pct}%)`,
      priority: 28 + gap,
    }
  } catch { return null }
}

async function queryGroupTendency(db: any, code: string, teamName: string): Promise<StatCandidate | null> {
  try {
    const { data, error } = await db.rpc('stat_group_tendency', { p_team_code: code, p_team_name: teamName })
    if (error || !data?.length) return null
    const { group_avg_pct, is_bad } = data[0]
    const fi = FI_NAMES[code] ?? code
    if (is_bad) {
      return {
        type: 'group_tendency_bad',
        rawDescription: `The whole group historically struggles with ${fi} predictions — collective average only ${group_avg_pct}% correct`,
        fallbackText: `${fi} on porukan yhteinen kryptoniitti — ryhmäkeskiarvo vain ${group_avg_pct}%`,
        priority: 22,
      }
    } else {
      return {
        type: 'group_tendency_good',
        rawDescription: `The whole group has historically been excellent at predicting ${fi} matches — collective average ${group_avg_pct}% correct`,
        fallbackText: `${fi}-ottelut ovat porukan helppoja — ryhmäkeskiarvo ${group_avg_pct}%`,
        priority: 18,
      }
    }
  } catch { return null }
}

async function queryScorelineHabit(db: any, code: string, teamName: string): Promise<StatCandidate | null> {
  try {
    const { data, error } = await db.rpc('stat_scoreline_habit', { p_team_code: code, p_team_name: teamName })
    if (error || !data?.length) return null
    const { player_name: player, home_pred, away_pred, times_predicted, times_correct, result_correct_count } = data[0]
    const fi = FI_NAMES[code] ?? code
    const n = Number(times_predicted)
    const correct = Number(times_correct)
    const resultCorrect = Number(result_correct_count)
    const score = `${home_pred}–${away_pred}`

    const resultNote = resultCorrect === n
      ? `they always got the match result right but the exact score never matched`
      : resultCorrect === 0
        ? `they also got the match result wrong every time`
        : `they got the match result right ${resultCorrect} of those times, but the exact score never matched`

    const meta = { playerName: player, habitHome: home_pred, habitAway: away_pred, habitCount: n, habitTeamFi: fi }

    if (correct === 0) {
      return {
        type: 'scoreline_always_wrong',
        rawDescription: `${player} has predicted the exact scoreline ${score} for ${fi} matches ${n} times — the exact scoreline has never been correct (${resultNote})`,
        fallbackText: `${player} on veikannut ${fi}-otteluun ${score} jo ${n} kertaa — tarkka tulos ei ole osunut kertaakaan`,
        priority: 32 + n * 2,
        ...meta,
      }
    } else if (correct === n) {
      return {
        type: 'scoreline_always_right',
        rawDescription: `${player} has predicted the exact scoreline ${score} for ${fi} matches ${n} times — and been right on the exact score every single time`,
        fallbackText: `${player} on veikannut ${fi}-otteluun ${score} ${n} kertaa — aina oikein 🔮`,
        priority: 56 + n * 3,
        ...meta,
      }
    } else {
      return {
        type: 'scoreline_obsession',
        rawDescription: `${player} has predicted the exact scoreline ${score} for ${fi} matches ${n} times (exact score correct ${correct} times) — a signature pick`,
        fallbackText: `${player} veikkaa ${fi}-otteluun ${score} kerta toisensa jälkeen — ${n} kertaa, ${correct} osumaa`,
        priority: 35 + n,
        ...meta,
      }
    }
  } catch { return null }
}

async function queryStageFright(db: any, histStages: string[], stageFiLabel: string): Promise<StatCandidate | null> {
  try {
    const { data, error } = await db.rpc('stat_stage_fright', { p_stages: histStages })
    if (error || !data?.length) return null
    const { total_preds, exact_count } = data[0]
    if (Number(total_preds) === 0 || Number(exact_count) > 0) return null
    return {
      type: 'stage_fright',
      rawDescription: `Historically nobody has ever predicted an exact scoreline correctly in a ${stageFiLabel} match — 0 exact scores from ${total_preds} total predictions`,
      fallbackText: `Historiassa kukaan ei ole arvannut tarkkaa tulosta ${stageFiLabel} — onnistuuko tänään?`,
      priority: 15,
    }
  } catch { return null }
}

// ── Normalized prediction type ────────────────────────────────────────────────
interface NormalizedPred { display_name: string; home_score_pred: number; away_score_pred: number }

// ── Head-to-head historical stat ─────────────────────────────────────────────
async function queryHeadToHead(db: any, homeCode: string, awayCode: string): Promise<StatCandidate | null> {
  try {
    const { data, error } = await db.rpc('stat_head_to_head', { p_home_code: homeCode, p_away_code: awayCode })
    if (error || !data?.length) return null
    const { comp_year, comp_type, hist_home, hist_away, actual_home, actual_away,
      exact_correct_players, correct_result_count, total_predictors } = data[0]

    const n = Number(total_predictors)
    if (n < 3) return null

    const exactPlayers: string[] = exact_correct_players ?? []
    const resultCorrect = Number(correct_result_count)
    const homeFi = FI_NAMES[hist_home] ?? hist_home
    const awayFi = FI_NAMES[hist_away] ?? hist_away
    const compLabel = comp_type === 'EC' ? `Euroissa ${comp_year}` : `MM-kisoissa ${comp_year}`
    const actualScore = `${actual_home}–${actual_away}`

    if (exactPlayers.length === 1) {
      const hero = exactPlayers[0]
      return {
        type: 'h2h_exact_hero',
        rawDescription: `Last time ${homeFi} played ${awayFi} (${compLabel}, final score ${actualScore}), ${hero} was the only active player to predict the exact scoreline — the other ${n - 1} missed it`,
        fallbackText: `${compLabel} ${homeFi}–${awayFi} päättyi ${actualScore} — vain ${hero} arvasi tarkan tuloksen oikein`,
        priority: 42,
      }
    }

    if (exactPlayers.length === 0 && resultCorrect <= Math.ceil(n / 4)) {
      return {
        type: 'h2h_hard_match',
        rawDescription: `Last time ${homeFi} played ${awayFi} (${compLabel}), the score was ${actualScore} — nobody predicted the exact scoreline and only ${resultCorrect} of ${n} got the result right`,
        fallbackText: `${compLabel} ${homeFi}–${awayFi}: ${actualScore} — kukaan ei arvannut tarkkaa tulosta, vain ${resultCorrect}/${n} sai merkin oikein`,
        priority: 35,
      }
    }

    if (exactPlayers.length === 0) {
      return {
        type: 'h2h_no_exact',
        rawDescription: `Last time ${homeFi} played ${awayFi} (${compLabel}), the score was ${actualScore} — nobody predicted the exact scoreline (${resultCorrect} of ${n} got the result right)`,
        fallbackText: `${compLabel} ${homeFi}–${awayFi}: ${actualScore} — kukaan ei osunut tarkaan tulokseen`,
        priority: 28,
      }
    }

    return null
  } catch { return null }
}

// ── Claude Haiku formatter ────────────────────────────────────────────────────
async function callClaude(apiKey: string, matchLabel: string, stat: StatCandidate): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        system: 'Olet hauska tilastoanalyytikko suomalaisessa MM-kisojen veikkauskaverusten ryhmässä. Kirjoita täsmälleen yksi lyhyt, naseva suomenkielinen lause (max 110 merkkiä). Älä käytä lainausmerkkejä. TÄRKEÄÄ: käytä täsmälleen tilastossa annettuja pelaajanimiä ja lukuja — älä muuta nimiä, älä keksi uusia nimiä, älä muuta numeroita.',
        messages: [{ role: 'user', content: `Ottelu: ${matchLabel}\nTilasto: ${stat.rawDescription}\n\nKäytä vain näitä tietoja. Älä mainitse muita pelaajia.` }],
      }),
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const json = await res.json() as { content?: Array<{ type: string; text: string }> }
    const text = json.content?.[0]?.text?.trim()
    if (!text) return null
    return text.replace(/^["'„"«»]+|["'""»«]+$/g, '').trim()
  } catch { return null }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function getPreMatchStat(
  db: any,
  anthropicKey: string,
  homeTeam: string,
  awayTeam: string,
  stage: string,
  preds: NormalizedPred[],
): Promise<string | null> {
  try {
    const homeCode = TEAM_CODE_MAP[homeTeam]
    const awayCode = TEAM_CODE_MAP[awayTeam]
    const histStages = STAGE_HIST_CODES[stage] ?? []

    // All team-specific queries run in parallel for both teams
    const teamJobs: Promise<StatCandidate | null>[] = []
    const teamPairs: [string, string][] = []
    if (homeCode) teamPairs.push([homeCode, homeTeam])
    if (awayCode) teamPairs.push([awayCode, awayTeam])

    for (const [code, name] of teamPairs) {
      teamJobs.push(queryKryptonite(db, code, name))
      teamJobs.push(queryPerfectRecord(db, code, name))
      teamJobs.push(queryTeamExpert(db, code, name))
      teamJobs.push(queryGroupTendency(db, code, name))
      teamJobs.push(queryScorelineHabit(db, code, name))
    }

    // Stage fright only for knockout matches
    if (histStages.length > 0 && stage !== 'GROUP_STAGE') {
      teamJobs.push(queryStageFright(db, histStages, STAGE_FI_LABEL[stage] ?? stage))
    }

    // Head-to-head: one call for the pair (only when both codes exist)
    const h2hJob = (homeCode && awayCode)
      ? queryHeadToHead(db, homeCode, awayCode)
      : Promise.resolve(null)

    const [results, h2hResult] = await Promise.all([
      Promise.allSettled(teamJobs),
      h2hJob,
    ])

    const candidates: StatCandidate[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) candidates.push(r.value)
    }
    if (h2hResult) candidates.push(h2hResult)

    // Scoreline habit: only surface if player is predicting that same scoreline tonight.
    // If they broke their habit, convert to a low-priority habit_breaking candidate instead.
    const validCandidates: StatCandidate[] = []
    for (const c of candidates) {
      if (c.habitHome === undefined || c.playerName === undefined) {
        validCandidates.push(c)
        continue
      }
      const playerPred = preds.find(p => p.display_name === c.playerName)
      if (!playerPred) continue // player hasn't predicted tonight
      if (playerPred.home_score_pred === c.habitHome && playerPred.away_score_pred === c.habitAway) {
        validCandidates.push(c) // habit repeating tonight
        continue
      }
      // Player broke their habit — surface as a low-priority curiosity
      const todayScore = `${playerPred.home_score_pred}–${playerPred.away_score_pred}`
      const habitScore = `${c.habitHome}–${c.habitAway}`
      const n = c.habitCount ?? '?'
      const fi = c.habitTeamFi ?? ''
      validCandidates.push({
        type: 'habit_breaking',
        rawDescription: `${c.playerName} has predicted ${habitScore} for ${fi} matches ${n} times before (never getting the exact score right), but tonight is breaking the habit with ${todayScore}`,
        fallbackText: `${c.playerName} rikkoo tottumuksensa: ${n}× ${habitScore} ${fi}-otteluihin on nyt ${todayScore}`,
        priority: 12,
      })
    }

    if (validCandidates.length === 0) return null

    validCandidates.sort((a, b) => b.priority - a.priority)
    const best = validCandidates[0]

    const aiText = anthropicKey ? await callClaude(anthropicKey, `${homeTeam} vs ${awayTeam}`, best) : null
    return aiText ?? best.fallbackText
  } catch (err) {
    console.error('[getPreMatchStat] error', err)
    return null
  }
}
