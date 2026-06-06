import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">⚽</div>
        <h1 className="text-2xl font-bold mb-2">Sivua ei löydy</h1>
        <p className="text-gray-500 text-sm mb-6">Osoite on väärä tai sivu on poistettu.</p>
        <Link
          href="/leaderboard"
          className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Takaisin etusivulle
        </Link>
      </div>
    </div>
  )
}
