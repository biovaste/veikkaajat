'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

interface NavProps {
  isAdmin: boolean
}

export default function Nav({ isAdmin }: NavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Close dropdown when navigating or clicking outside
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const primaryLinks = [
    { href: '/leaderboard', label: 'Pisteet' },
    { href: '/matches', label: 'Ottelut' },
  ]

  const allLinks = [
    { href: '/leaderboard', label: 'Pisteet' },
    { href: '/matches', label: 'Ottelut' },
    { href: '/my-predictions', label: 'Veikkaukseni' },
    { href: '/predictions', label: 'Kaikki veikkaukset' },
    { href: '/bets', label: 'Erikoisveikkaukset' },
    { href: '/history', label: 'Historia' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ]

  const isActive = (href: string) => pathname.startsWith(href)
  const currentIsSecondary = !primaryLinks.some(l => isActive(l.href))

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">

          {/* ── Desktop: all links inline ── */}
          <div className="hidden sm:flex items-center gap-1">
            {allLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive(link.href)
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* ── Mobile: primary links + hamburger ── */}
          <div className="flex sm:hidden items-center gap-1" ref={menuRef}>
            {primaryLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive(link.href)
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {/* Hamburger button — tinted blue when current page is a secondary link */}
            <button
              onClick={() => setOpen(v => !v)}
              className={`ml-1 px-2.5 py-1.5 rounded text-sm font-medium transition-colors ${
                open
                  ? 'bg-gray-200 text-gray-900'
                  : currentIsSecondary
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              aria-label="Valikko"
            >
              {open ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>

            {/* Dropdown */}
            {open && (
              <div className="absolute top-12 left-0 right-0 bg-white border-b border-gray-200 shadow-md z-20">
                <div className="max-w-2xl mx-auto px-4 py-2 flex flex-col gap-1">
                  {allLinks.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        isActive(link.href)
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                  <div className="border-t border-gray-100 mt-1 pt-1 flex items-center gap-3">
                    <Link href="/settings" className="px-3 py-2 rounded text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                      ⚙ Asetukset
                    </Link>
                    <button onClick={signOut} className="px-3 py-2 rounded text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                      Kirjaudu ulos
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Settings + sign out (desktop only) ── */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Link href="/settings" className="text-xs text-gray-400 hover:text-gray-600 transition-colors" title="Asetukset">
              ⚙
            </Link>
            <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap">
              Ulos
            </button>
          </div>

        </div>
      </div>
    </nav>
  )
}
