'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface NavProps {
  isAdmin: boolean
}

export default function Nav({ isAdmin }: NavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const links = [
    { href: '/leaderboard', label: 'Pisteet', short: 'Pisteet' },
    { href: '/matches', label: 'Ottelut', short: 'Ottelut' },
    { href: '/my-predictions', label: 'Veikkaukseni', short: 'Omat' },
    { href: '/bets', label: 'Erikoisveikkaukset', short: 'Bonus' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', short: 'Admin' }] : []),
  ]

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-2.5 sm:px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap ${
                  pathname.startsWith(link.href)
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <span className="sm:hidden">{link.short}</span>
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            ))}
          </div>
          <div className="ml-2 flex items-center gap-2 shrink-0">
            <Link
              href="/settings"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              title="Asetukset"
            >
              ⚙
            </Link>
            <button
              onClick={signOut}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
            >
              Ulos
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
