'use client'

import { useEffect, useState } from 'react'

export default function CountdownTimer({ deadlineAt }: { deadlineAt: string }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    function update() {
      const diff = new Date(deadlineAt).getTime() - Date.now()
      if (diff <= 0) {
        setLabel('Suljettu')
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
  }, [deadlineAt])

  return (
    <span className="text-right">
      <span className="block text-xs text-gray-400">Aikaa kohteen sulkeutumiseen:</span>
      <span className="text-xs font-medium text-gray-600">{label}</span>
    </span>
  )
}
