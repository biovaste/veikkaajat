import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Veikkaajat — MM 2026',
  description: 'Jalkapallon MM 2026 tulosveikkaus',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fi">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
