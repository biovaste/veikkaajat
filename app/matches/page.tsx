import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MatchList from '@/components/MatchList'

export const revalidate = 0

export default async function MatchesPage() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: matches }, { data: predictions }] = await Promise.all([
    supabase
      .from('matches')
      .select('*')
      .order('kickoff_at', { ascending: true }),
    supabase
      .from('predictions')
      .select('match_id, home_score_pred, away_score_pred, points')
      .eq('user_id', user.id),
  ])

  if (!matches || matches.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Ottelut</h1>
        <p className="text-gray-400 text-sm">
          Otteluja ei ole vielä tuotu. Admin voi tuoda ne Admin → Tuo ottelut -sivulta.
        </p>
      </div>
    )
  }

  const predMap: Record<number, { home_score_pred: number; away_score_pred: number; points: number | null }> = {}
  for (const p of predictions ?? []) {
    predMap[p.match_id] = p
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ottelut</h1>
      <MatchList matches={matches} predMap={predMap} />
    </div>
  )
}
