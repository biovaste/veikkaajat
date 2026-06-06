export interface Player {
  name: string
  country: string // English country name (matches lib/countries.ts keys)
}

// Sorted alphabetically by Finnish country name, then by player surname within each country.
export const TOP_SCORER_PLAYERS: Player[] = [
  // Alankomaat (Netherlands)
  { name: 'Memphis Depay',       country: 'Netherlands' },
  { name: 'Cody Gakpo',          country: 'Netherlands' },
  { name: 'Donyell Malen',       country: 'Netherlands' },

  // Argentiina (Argentina)
  { name: 'Julián Álvarez',      country: 'Argentina' },
  { name: 'Lautaro Martínez',    country: 'Argentina' },
  { name: 'Lionel Messi',        country: 'Argentina' },

  // Belgia (Belgium)
  { name: 'Kevin De Bruyne',     country: 'Belgium' },
  { name: 'Charles De Ketelaere', country: 'Belgium' },
  { name: 'Romelu Lukaku',       country: 'Belgium' },
  { name: 'Loïs Openda',         country: 'Belgium' },
  { name: 'Hans Vanaken',        country: 'Belgium' },

  // Brasilia (Brazil)
  { name: 'Matheus Cunha',       country: 'Brazil' },
  { name: 'Neymar Jr.',          country: 'Brazil' },
  { name: 'Raphinha',            country: 'Brazil' },
  { name: 'Igor Thiago',         country: 'Brazil' },
  { name: 'Vinícius Júnior',     country: 'Brazil' },

  // Ecuador
  { name: 'Enner Valencia',      country: 'Ecuador' },

  // Egypti (Egypt)
  { name: 'Mohamed Salah',       country: 'Egypt' },

  // Englanti (England)
  { name: 'Jude Bellingham',     country: 'England' },
  { name: 'Harry Kane',          country: 'England' },
  { name: 'Marcus Rashford',     country: 'England' },
  { name: 'Bukayo Saka',         country: 'England' },
  { name: 'Ollie Watkins',       country: 'England' },

  // Espanja (Spain)
  { name: 'Mikel Oyarzabal',     country: 'Spain' },
  { name: 'Ferran Torres',       country: 'Spain' },
  { name: 'Nico Williams',       country: 'Spain' },
  { name: 'Lamine Yamal',        country: 'Spain' },

  // Etelä-Korea (South Korea)
  { name: 'Heung-min Son',       country: 'South Korea' },

  // Kanada (Canada)
  { name: 'Jonathan David',      country: 'Canada' },
  { name: 'Cyle Larin',          country: 'Canada' },

  // Kolumbia (Colombia)
  { name: 'Luis Díaz',           country: 'Colombia' },
  { name: 'Luis Javier Suárez',  country: 'Colombia' },

  // Meksiko (Mexico)
  { name: 'Santiago Giménez',    country: 'Mexico' },
  { name: 'Raúl Jiménez',        country: 'Mexico' },

  // Norja (Norway)
  { name: 'Erling Haaland',      country: 'Norway' },

  // Portugali (Portugal)
  { name: 'Bruno Fernandes',     country: 'Portugal' },
  { name: 'Rafael Leão',         country: 'Portugal' },
  { name: 'Gonçalo Ramos',       country: 'Portugal' },
  { name: 'Cristiano Ronaldo',   country: 'Portugal' },

  // Ranska (France)
  { name: 'Ousmane Dembélé',     country: 'France' },
  { name: 'Désiré Doué',         country: 'France' },
  { name: 'Olivier Giroud',      country: 'France' },
  { name: 'Kylian Mbappé',       country: 'France' },
  { name: 'Michael Olise',       country: 'France' },

  // Ruotsi (Sweden)
  { name: 'Viktor Gyökeres',     country: 'Sweden' },

  // Saksa (Germany)
  { name: 'Niclas Füllkrug',     country: 'Germany' },
  { name: 'Serge Gnabry',        country: 'Germany' },
  { name: 'Kai Havertz',         country: 'Germany' },
  { name: 'Jamal Musiala',       country: 'Germany' },
  { name: 'Florian Wirtz',       country: 'Germany' },
  { name: 'Nick Woltemade',      country: 'Germany' },

  // Uruguay
  { name: 'Darwin Núñez',        country: 'Uruguay' },

  // Yhdysvallat (United States)
  { name: 'Folarin Balogun',     country: 'United States' },
  { name: 'Christian Pulisic',   country: 'United States' },
]

// Countries in the list, preserving sorted order
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
export const wildcardValue   = (country: string) => `${WILDCARD_PREFIX}${country}`
export const isWildcard      = (value: string)   => value.startsWith(WILDCARD_PREFIX)
export const wildcardCountry = (value: string)   => value.slice(WILDCARD_PREFIX.length)
