export interface Player {
  rank: number
  name: string
  country: string // English country name (matches lib/countries.ts keys)
}

export const TOP_SCORER_PLAYERS: Player[] = [
  { rank: 1,  name: 'Kylian Mbappé',        country: 'France' },
  { rank: 2,  name: 'Harry Kane',            country: 'England' },
  { rank: 3,  name: 'Lionel Messi',          country: 'Argentina' },
  { rank: 4,  name: 'Erling Haaland',        country: 'Norway' },
  { rank: 5,  name: 'Lamine Yamal',          country: 'Spain' },
  { rank: 6,  name: 'Mikel Oyarzabal',       country: 'Spain' },
  { rank: 7,  name: 'Vinícius Júnior',       country: 'Brazil' },
  { rank: 8,  name: 'Lautaro Martínez',      country: 'Argentina' },
  { rank: 9,  name: 'Cristiano Ronaldo',     country: 'Portugal' },
  { rank: 10, name: 'Jude Bellingham',       country: 'England' },
  { rank: 11, name: 'Phil Foden',            country: 'England' },
  { rank: 12, name: 'Alvaro Morata',         country: 'Spain' },
  { rank: 13, name: 'Olivier Giroud',        country: 'France' },
  { rank: 14, name: 'Antoine Griezmann',     country: 'France' },
  { rank: 15, name: 'Rodrygo',               country: 'Brazil' },
  { rank: 16, name: 'Bukayo Saka',           country: 'England' },
  { rank: 17, name: 'Kai Havertz',           country: 'Germany' },
  { rank: 18, name: 'Florian Wirtz',         country: 'Germany' },
  { rank: 19, name: 'Bruno Fernandes',       country: 'Portugal' },
  { rank: 20, name: 'Gonçalo Ramos',         country: 'Portugal' },
  { rank: 21, name: 'Cody Gakpo',            country: 'Netherlands' },
  { rank: 22, name: 'Memphis Depay',         country: 'Netherlands' },
  { rank: 23, name: 'Julián Álvarez',        country: 'Argentina' },
  { rank: 24, name: 'Gabriel Jesus',         country: 'Brazil' },
  { rank: 25, name: 'Raphinha',              country: 'Brazil' },
  { rank: 26, name: 'Ousmane Dembélé',       country: 'France' },
  { rank: 27, name: 'Marcus Rashford',       country: 'England' },
  { rank: 28, name: 'Ollie Watkins',         country: 'England' },
  { rank: 29, name: 'Niclas Füllkrug',       country: 'Germany' },
  { rank: 30, name: 'Rafael Leão',           country: 'Portugal' },
  { rank: 31, name: 'Dušan Vlahović',        country: 'Serbia' },
  { rank: 32, name: 'Aleksandar Mitrović',   country: 'Serbia' },
  { rank: 33, name: 'Robert Lewandowski',    country: 'Poland' },
  { rank: 34, name: 'Romelu Lukaku',         country: 'Belgium' },
  { rank: 35, name: 'Loïs Openda',           country: 'Belgium' },
  { rank: 36, name: 'Christian Pulisic',     country: 'United States' },
  { rank: 37, name: 'Folarin Balogun',       country: 'United States' },
  { rank: 38, name: 'Jonathan David',        country: 'Canada' },
  { rank: 39, name: 'Cyle Larin',            country: 'Canada' },
  { rank: 40, name: 'Santiago Giménez',      country: 'Mexico' },
  { rank: 41, name: 'Raúl Jiménez',          country: 'Mexico' },
  { rank: 42, name: 'Heung-min Son',         country: 'South Korea' },
  { rank: 43, name: 'Darwin Núñez',          country: 'Uruguay' },
  { rank: 44, name: 'Luis Díaz',             country: 'Colombia' },
  { rank: 45, name: 'Victor Osimhen',        country: 'Nigeria' },
  { rank: 46, name: 'Mohamed Salah',         country: 'Egypt' },
  { rank: 47, name: 'Donyell Malen',         country: 'Netherlands' },
  { rank: 48, name: 'Ferran Torres',         country: 'Spain' },
  { rank: 49, name: 'Neymar Jr.',            country: 'Brazil' },
  { rank: 50, name: 'Assan Ouédraogo',       country: 'Germany' },
]

// Countries in the list, preserving first-appearance order
export function getPlayerCountries(): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const p of TOP_SCORER_PLAYERS) {
    if (!seen.has(p.country)) {
      seen.add(p.country)
      result.push(p.country)
    }
  }
  return result
}

export function getPlayerByName(name: string): Player | undefined {
  return TOP_SCORER_PLAYERS.find(p => p.name === name)
}

// Wildcard helpers — e.g. "OTHER:France"
export const WILDCARD_PREFIX = 'OTHER:'
export const wildcardValue  = (country: string) => `${WILDCARD_PREFIX}${country}`
export const isWildcard     = (value: string)   => value.startsWith(WILDCARD_PREFIX)
export const wildcardCountry = (value: string)  => value.slice(WILDCARD_PREFIX.length)
