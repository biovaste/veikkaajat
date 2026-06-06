import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 403 })

  const { email, display_name } = await request.json()
  if (!email) {
    return NextResponse.json({ error: 'email vaaditaan' }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  // display_name is optional — if omitted, user sets it themselves during onboarding
  const inviteData = display_name ? { display_name } : {}

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: inviteData,
  })
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })

  // If admin provided a name, set it now; otherwise leave the trigger's email-prefix default
  if (display_name) {
    await admin
      .from('profiles')
      .upsert({ id: invited.user.id, email, display_name }, { onConflict: 'id' })
  }

  return NextResponse.json({ user_id: invited.user.id })
}
