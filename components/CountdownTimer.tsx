'use client'

import { useEffect, useState } from 'react'

export default function CountdownTimer({ deadlineAt }: { deadlineAt: string }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    function update() {
      const deadline = new Date(deadlineAt)
      const diff = deadline.getTime() - Date.now()
      if (diff <= 0) {
        setLabel('Suljettu')
        return
      }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)

      // Format closing time as HH:MM with optional +N day suffix
      const timeStr = deadline.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
      const today = new Date()
      const dayDiff =
        Math.floor(deadline.getTime() / 86_400_000) -
        Math.floor(today.getTime() / 86_400_000)
      const daySuffix = dayDiff > 0 ? ` +${dayDiff}` : ''
      const closingTime = `${timeStr}${daySuffix}`

      if (h >= 48) {
        const d = Math.floor(h / 24)
        setLabel(`${d} pv (${closingTime})`)
      } else if (h >= 1) {
        setLabel(`${h}t ${m}min (${closingTime})`)
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
