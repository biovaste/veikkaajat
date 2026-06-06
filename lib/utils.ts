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
    ROUND_OF_16: 'Kahdeksasfinaalit',
    QUARTER_FINALS: 'Neljännesfinaalit',
    SEMI_FINALS: 'Puolifinaalit',
    THIRD_PLACE: 'Pronssiotttelu',
    FINAL: 'Finaali',
  }
  return labels[stage] ?? stage
}

export function resultLabel(home: number, away: number): string {
  if (home > away) return 'K'   // kotijoukkue voittaa
  if (away > home) return 'V'   // vierasjoukkue voittaa
  return 'T'                     // tasapeli
}
