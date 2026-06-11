import type { Metadata } from 'next'
import './globals.css'
import { createServerClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import AudioPlayer from '@/components/AudioPlayer'

export const metadata: Metadata = {
  title: 'Veikkaajat — MM 2026',
  description: 'Jalkapallon MM 2026 tulosveikkaus kaveriporukalle',
  openGraph: {
    title: 'Veikkaajat — MM 2026',
    description: 'Jalkapallon MM 2026 tulosveikkaus kaveriporukalle',
    type: 'website',
  },
  viewport: 'width=device-width, initial-scale=1',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.is_admin ?? false
  }

  return (
    <html lang="fi">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {user && <Nav isAdmin={isAdmin} />}
        <main className="max-w-2xl mx-auto px-4 py-6">
          {children}
        </main>
        {user && <AudioPlayer />}
      </body>
    </html>
  )
}
