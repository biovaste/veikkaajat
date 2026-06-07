export interface Player {
  name: string
  country: string // English country name (matches lib/countries.ts keys)
}

// Sorted alphabetically by Finnish country name, then by player surname within each country.
export const TOP_SCORER_PLAYERS: Player[] = [
  // Alankomaat (Netherlands)
  { name: 'Memphis Depay',         country: 'Netherlands' },
  { name: 'Denzel Dumfries',       country: 'Netherlands' },
  { name: 'Cody Gakpo',            country: 'Netherlands' },
  { name: 'Donyell Malen',         country: 'Netherlands' },

  // Algeria
  { name: 'Riyad Mahrez',          country: 'Algeria' },

  // Australia
  { name: 'Matthew Leckie',        country: 'Australia' },

  // Belgia (Belgium)
  { name: 'Kevin De Bruyne',       country: 'Belgium' },
  { name: 'Charles De Ketelaere',  country: 'Belgium' },
  { name: 'Jérémy Doku',           country: 'Belgium' },
  { name: 'Romelu Lukaku',         country: 'Belgium' },
  { name: 'Loïs Openda',           country: 'Belgium' },

  // Bosnia-Hertsegovina (Bosnia and Herzegovina)
  { name: 'Edin Džeko',            country: 'Bosnia and Herzegovina' },

  // Brasilia (Brazil)
  { name: 'Matheus Cunha',         country: 'Brazil' },
  { name: 'Igor Thiago',           country: 'Brazil' },
  { name: 'Neymar Jr.',            country: 'Brazil' },
  { name: 'Raphinha',              country: 'Brazil' },
  { name: 'Vinícius Júnior',       country: 'Brazil' },

  // Ecuador
  { name: 'Enner Valencia',        country: 'Ecuador' },

  // Egypti (Egypt)
  { name: 'Mohamed Salah',         country: 'Egypt' },

  // Englanti (England)
  { name: 'Jude Bellingham',       country: 'England' },
  { name: 'Harry Kane',            country: 'England' },
  { name: 'Marcus Rashford',       country: 'England' },
  { name: 'Bukayo Saka',           country: 'England' },
  { name: 'Ollie Watkins',         country: 'England' },

  // Espanja (Spain)
  { name: 'Mikel Oyarzabal',       country: 'Spain' },
  { name: 'Ferran Torres',         country: 'Spain' },
  { name: 'Nico Williams',         country: 'Spain' },
  { name: 'Lamine Yamal',          country: 'Spain' },

  // Etelä-Afrikka (South Africa)
  { name: 'Lyle Foster',           country: 'South Africa' },

  // Etelä-Korea (South Korea)
  { name: 'Heung-min Son',         country: 'South Korea' },

  // Ghana
  { name: 'Jordan Ayew',           country: 'Ghana' },

  // Haiti
  { name: 'Duckens Nazon',         country: 'Haiti' },

  // Iran
  { name: 'Mehdi Taremi',          country: 'Iran' },

  // Itävalta (Austria)
  { name: 'Marko Arnautovic',      country: 'Austria' },

  // Japani (Japan)
  { name: 'Ayase Ueda',            country: 'Japan' },

  // Kanada (Canada)
  { name: 'Jonathan David',        country: 'Canada' },
  { name: 'Cyle Larin',            country: 'Canada' },

  // Kolumbia (Colombia)
  { name: 'Luis Díaz',             country: 'Colombia' },
  { name: 'James Rodríguez',       country: 'Colombia' },
  { name: 'Luis Javier Suárez',    country: 'Colombia' },

  // Kongon dem. tasavalta (DR Congo)
  { name: 'Cédric Bakambu',        country: 'DR Congo' },

  // Kroatia (Croatia)
  { name: 'Luka Modrić',           country: 'Croatia' },
  { name: 'Ivan Perišić',          country: 'Croatia' },

  // Marokko (Morocco)
  { name: 'Brahim Díaz',           country: 'Morocco' },

  // Meksiko (Mexico)
  { name: 'Santiago Giménez',      country: 'Mexico' },
  { name: 'Raúl Jiménez',          country: 'Mexico' },

  // Norja (Norway)
  { name: 'Erling Haaland',        country: 'Norway' },

  // Norsunluurannikko (Ivory Coast)
  { name: 'Yan Diomandé',          country: 'Ivory Coast' },
  { name: 'Nicolas Pépé',          country: 'Ivory Coast' },

  // Paraguay
  { name: 'Antonio Sanabria',      country: 'Paraguay' },

  // Portugali (Portugal)
  { name: 'Bruno Fernandes',       country: 'Portugal' },
  { name: 'Rafael Leão',           country: 'Portugal' },
  { name: 'Gonçalo Ramos',         country: 'Portugal' },
  { name: 'Cristiano Ronaldo',     country: 'Portugal' },

  // Ranska (France)
  { name: 'Ousmane Dembélé',       country: 'France' },
  { name: 'Désiré Doué',           country: 'France' },
  { name: 'Olivier Giroud',        country: 'France' },
  { name: 'Kylian Mbappé',         country: 'France' },
  { name: 'Michael Olise',         country: 'France' },

  // Ruotsi (Sweden)
  { name: 'Viktor Gyökeres',       country: 'Sweden' },
  { name: 'Alexander Isak',        country: 'Sweden' },

  // Saksa (Germany)
  { name: 'Kai Havertz',           country: 'Germany' },
  { name: 'Jamal Musiala',         country: 'Germany' },
  { name: 'Leroy Sané',            country: 'Germany' },
  { name: 'Florian Wirtz',         country: 'Germany' },
  { name: 'Nick Woltemade',        country: 'Germany' },

  // Senegal
  { name: 'Sadio Mané',            country: 'Senegal' },

  // Skotlanti (Scotland)
  { name: 'Ché Adams',             country: 'Scotland' },

  // Sveitsi (Switzerland)
  { name: 'Breel Embolo',          country: 'Switzerland' },

  // Tshekki (Czech Republic)
  { name: 'Patrik Schick',         country: 'Czech Republic' },

  // Turkki (Türkiye)
  { name: 'Kerem Aktürkoğlu',      country: 'Türkiye' },

  // Uruguay
  { name: 'Darwin Núñez',          country: 'Uruguay' },

  // Uusi-Seelanti (New Zealand)
  { name: 'Chris Wood',            country: 'New Zealand' },

  // Uzbekistan
  { name: 'Eldor Shomurodov',      country: 'Uzbekistan' },

  // Yhdysvallat (United States)
  { name: 'Folarin Balogun',       country: 'United States' },
  { name: 'Christian Pulisic',     country: 'United States' },
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
