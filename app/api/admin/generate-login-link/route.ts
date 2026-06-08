import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/admin/generate-login-link
// body: { email: string }
// Returns: { link: string }
export async function POST(req: Request) {
  // Verify caller is an admin
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email } = await req.json() as { email: string }
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const admin = createServiceRoleClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (error || !data?.properties?.action_link) {
    console.error('[generate-login-link]', error)
    return NextResponse.json({ error: error?.message ?? 'Link generation failed' }, { status: 500 })
  }

  return NextResponse.json({ link: data.properties.action_link })
}
