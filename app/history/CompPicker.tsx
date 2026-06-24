'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export default function CompPicker({ competitions }: { competitions: { id: string; name: string }[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const current = params.get('comp') ?? 'all'

  const tabs = [{ id: 'all', name: 'Kaikki' }, ...competitions]

  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map(c => (
        <button
          key={c.id}
          onClick={() => router.push(c.id === 'all' ? '/history' : `/history?comp=${c.id}`)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            current === c.id
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}
