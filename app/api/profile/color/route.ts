import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CHART_COLOR_HEXES } from '@/lib/colors'

// POST /api/profile/color
// body: { color: '#1f77b4' } — pick a color
// body: { color: null }     — release current color (go back to auto-assign)
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { color } = await req.json() as { color: string | null }

  // Validate
  if (color !== null && !CHART_COLOR_HEXES.includes(color)) {
    return NextResponse.json({ error: 'Virheellinen väri' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ chart_color: color })
    .eq('id', user.id)

  if (error) {
    // Unique constraint violation — color already taken
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Väri on jo varattu' }, { status: 409 })
    }
    console.error('[color] update error:', error)
    return NextResponse.json({ error: 'Tallennus epäonnistui' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, color })
}
