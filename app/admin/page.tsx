import Link from 'next/link'

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin</h1>
      <div className="grid gap-3">
        <Link
          href="/admin/seed"
          className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
        >
          <div className="font-medium">Tuo ottelut</div>
          <div className="text-sm text-gray-500 mt-0.5">Hae ottelut football-data.org:sta</div>
        </Link>
        <Link
          href="/admin/matches"
          className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
        >
          <div className="font-medium">Tulokset</div>
          <div className="text-sm text-gray-500 mt-0.5">Syötä tai korjaa ottelutuloksia</div>
        </Link>
        <Link
          href="/admin/players"
          className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
        >
          <div className="font-medium">Pelaajat</div>
          <div className="text-sm text-gray-500 mt-0.5">Kutsu pelaajia ja tarkastele tilastoja</div>
        </Link>
      </div>
    </div>
  )
}
