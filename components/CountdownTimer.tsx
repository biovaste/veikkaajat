'use client'

import { useEffect, useState } from 'react'

export default function CountdownTimer({ kickoffAt }: { kickoffAt: string }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    function update() {
      const diff = new Date(kickoffAt).getTime() - Date.now()
      if (diff <= 0) {
        setLabel('Alkanut')
        return
      }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      if (h >= 48) {
        const d = Math.floor(h / 24)
        setLabel(`${d} pv`)
      } else if (h >= 1) {
        setLabel(`${h}t ${m}min`)
      } else {
        setLabel(`${m}min`)
      }
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [kickoffAt])

  return <span>{label}</span>
}
