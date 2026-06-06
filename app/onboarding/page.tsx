'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, onboarded')
        .eq('id', user.id)
        .single()

      if (profile?.onboarded) { router.push('/leaderboard'); return }

      // Pre-fill with whatever name the admin set (or email prefix)
      setName(profile?.display_name ?? '')
      setLoading(false)
    }
    init()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), onboarded: true })
      .eq('id', user.id)

    if (err) {
      setError('Tallennus epäonnistui. Yritä uudelleen.')
      setSaving(false)
      return
    }

    router.push('/leaderboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Ladataan...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold mb-1">Tervetuloa mukaan!</h1>
          <p className="text-gray-500 text-sm">Valitse nimi, jolla sinut näytetään sarjataulukossa.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Nimi sarjataulukossa
            </label>
            <input
              id="name"
              type="text"
              required
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Etu Sukunimi"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">Max 30 merkkiä</p>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Tallennetaan...' : 'Aloita veikkaaminen →'}
          </button>
        </form>
      </div>
    </div>
  )
}
