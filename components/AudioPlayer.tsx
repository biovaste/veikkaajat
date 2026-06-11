'use client'

import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'music-enabled'

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  // Start as null until we've read localStorage (avoids flash)
  const [enabled, setEnabled] = useState<boolean | null>(null)

  // Read preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const initial = stored !== null ? stored === 'true' : false
    setEnabled(initial)
  }, [])

  // Play or pause whenever enabled state changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || enabled === null) return
    if (enabled) {
      audio.play().catch(() => {
        // Autoplay blocked by browser — user must interact first, which they did via toggle
      })
    } else {
      audio.pause()
    }
  }, [enabled])

  function toggle() {
    setEnabled(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  // Don't render until preference is known (avoids layout shift)
  if (enabled === null) return null

  return (
    <>
      <audio ref={audioRef} src="/theme.mp3" loop preload="none" />
      <button
        onClick={toggle}
        title={enabled ? 'Mykistä musiikki' : 'Toista musiikki'}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-lg hover:bg-gray-50 transition-colors"
      >
        {enabled ? '🔊' : '🔇'}
      </button>
    </>
  )
}
