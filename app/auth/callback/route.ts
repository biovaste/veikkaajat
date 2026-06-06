import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Supabase sends token_hash + type for invite links in some configurations
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'invite' | 'signup' | 'magiclink' | 'email' | null

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  let userId: string | null = null

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) userId = data.user?.id ?? null
  } else if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) userId = data.user?.id ?? null
  }

  if (userId) {
    // Redirect new users (not yet onboarded) to the username setup page
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarded')
      .eq('id', userId)
      .single()

    const dest = profile?.onboarded ? '/leaderboard' : '/onboarding'
    return NextResponse.redirect(`${origin}${dest}`)
  }

  return NextResponse.redirect(`${origin}/login?error=kirjautuminen_epaonnistui`)
}
