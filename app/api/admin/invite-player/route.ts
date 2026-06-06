import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 403 })

  const { email, display_name } = await request.json()
  if (!email || !display_name) {
    return NextResponse.json({ error: 'email ja display_name vaaditaan' }, { status: 400 })
  }

  // Create auth user and send magic link invite
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { display_name },
  })
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })

  // Upsert profile with the correct display_name (trigger may have already run with a fallback)
  await supabase
    .from('profiles')
    .upsert({ id: invited.user.id, email, display_name }, { onConflict: 'id' })

  return NextResponse.json({ user_id: invited.user.id })
}
