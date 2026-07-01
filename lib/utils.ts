export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Helsinki',
  }).format(new Date(dateStr))
}

export function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    GROUP_STAGE: 'Lohkovaihe',
    LAST_32: 'Kuudestoistafinaalit',
    LAST_16: 'Kahdeksasfinaalit',
    QUARTER_FINALS: 'Neljännesfinaalit',
    SEMI_FINALS: 'Puolifinaalit',
    THIRD_PLACE: 'Pronssiottelu',
    FINAL: 'Finaali',
  }
  return labels[stage] ?? stage
}

/** Finnish suffix describing how a knockout match was decided, e.g. " (rangaistuspotkut 4–3)". */
export function resultDurationSuffix(match: {
  result_duration?: string | null
  penalties_home?: number | null
  penalties_away?: number | null
}): string {
  if (match.result_duration === 'PENALTY_SHOOTOUT' && match.penalties_home != null && match.penalties_away != null) {
    return ` (rangaistuspotkut ${match.penalties_home}–${match.penalties_away})`
  }
  if (match.result_duration === 'EXTRA_TIME') return ' (jatkoaika)'
  return ''
}

export function resultLabel(home: number, away: number): string {
  if (home > away) return 'K'   // kotijoukkue voittaa
  if (away > home) return 'V'   // vierasjoukkue voittaa
  return 'T'                     // tasapeli
}
