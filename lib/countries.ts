interface CountryInfo {
  fi: string   // Finnish name
  code: string // ISO 3166-1 alpha-2 (or subdivision code for gb-eng etc.)
}

// Keyed by the English name football-data.org returns in homeTeam.name / awayTeam.name
const COUNTRIES: Record<string, CountryInfo> = {
  // UEFA
  'Germany': { fi: 'Saksa', code: 'de' },
  'France': { fi: 'Ranska', code: 'fr' },
  'Spain': { fi: 'Espanja', code: 'es' },
  'England': { fi: 'Englanti', code: 'gb-eng' },
  'Portugal': { fi: 'Portugali', code: 'pt' },
  'Netherlands': { fi: 'Alankomaat', code: 'nl' },
  'Belgium': { fi: 'Belgia', code: 'be' },
  'Croatia': { fi: 'Kroatia', code: 'hr' },
  'Italy': { fi: 'Italia', code: 'it' },
  'Denmark': { fi: 'Tanska', code: 'dk' },
  'Switzerland': { fi: 'Sveitsi', code: 'ch' },
  'Austria': { fi: 'Itävalta', code: 'at' },
  'Serbia': { fi: 'Serbia', code: 'rs' },
  'Poland': { fi: 'Puola', code: 'pl' },
  'Scotland': { fi: 'Skotlanti', code: 'gb-sct' },
  'Wales': { fi: 'Wales', code: 'gb-wls' },
  'Hungary': { fi: 'Unkari', code: 'hu' },
  'Romania': { fi: 'Romania', code: 'ro' },
  'Slovakia': { fi: 'Slovakia', code: 'sk' },
  'Türkiye': { fi: 'Turkki', code: 'tr' },
  'Turkey': { fi: 'Turkki', code: 'tr' },
  'Ukraine': { fi: 'Ukraina', code: 'ua' },
  'Czech Republic': { fi: 'Tshekki', code: 'cz' },
  'Czechia': { fi: 'Tshekki', code: 'cz' },
  'Albania': { fi: 'Albania', code: 'al' },
  'Greece': { fi: 'Kreikka', code: 'gr' },
  'Norway': { fi: 'Norja', code: 'no' },
  'Sweden': { fi: 'Ruotsi', code: 'se' },
  'Finland': { fi: 'Suomi', code: 'fi' },
  'Slovenia': { fi: 'Slovenia', code: 'si' },
  'Georgia': { fi: 'Georgia', code: 'ge' },
  'Bosnia and Herzegovina': { fi: 'Bosnia-Hertsegovina', code: 'ba' },
  'Bosnia-Herzegovina': { fi: 'Bosnia-Hertsegovina', code: 'ba' },
  'North Macedonia': { fi: 'Pohjois-Makedonia', code: 'mk' },
  'Iceland': { fi: 'Islanti', code: 'is' },
  'Montenegro': { fi: 'Montenegro', code: 'me' },
  'Luxembourg': { fi: 'Luxemburg', code: 'lu' },
  'Israel': { fi: 'Israel', code: 'il' },
  'Kosovo': { fi: 'Kosovo', code: 'xk' },

  // CONMEBOL
  'Argentina': { fi: 'Argentiina', code: 'ar' },
  'Brazil': { fi: 'Brasilia', code: 'br' },
  'Colombia': { fi: 'Kolumbia', code: 'co' },
  'Uruguay': { fi: 'Uruguay', code: 'uy' },
  'Ecuador': { fi: 'Ecuador', code: 'ec' },
  'Paraguay': { fi: 'Paraguay', code: 'py' },
  'Venezuela': { fi: 'Venezuela', code: 've' },
  'Bolivia': { fi: 'Bolivia', code: 'bo' },
  'Chile': { fi: 'Chile', code: 'cl' },
  'Peru': { fi: 'Peru', code: 'pe' },

  // CONCACAF
  'United States': { fi: 'Yhdysvallat', code: 'us' },
  'Mexico': { fi: 'Meksiko', code: 'mx' },
  'Canada': { fi: 'Kanada', code: 'ca' },
  'Jamaica': { fi: 'Jamaika', code: 'jm' },
  'Costa Rica': { fi: 'Costa Rica', code: 'cr' },
  'Panama': { fi: 'Panama', code: 'pa' },
  'Honduras': { fi: 'Honduras', code: 'hn' },
  'El Salvador': { fi: 'El Salvador', code: 'sv' },
  'Guatemala': { fi: 'Guatemala', code: 'gt' },
  'Haiti': { fi: 'Haiti', code: 'ht' },
  'Trinidad and Tobago': { fi: 'Trinidad ja Tobago', code: 'tt' },
  'Cuba': { fi: 'Kuuba', code: 'cu' },
  'Suriname': { fi: 'Suriname', code: 'sr' },
  'Curaçao': { fi: 'Curaçao', code: 'cw' },

  // CAF (Africa)
  'Morocco': { fi: 'Marokko', code: 'ma' },
  'Senegal': { fi: 'Senegal', code: 'sn' },
  'Egypt': { fi: 'Egypti', code: 'eg' },
  'Nigeria': { fi: 'Nigeria', code: 'ng' },
  'Cameroon': { fi: 'Kamerun', code: 'cm' },
  'Ghana': { fi: 'Ghana', code: 'gh' },
  'Tunisia': { fi: 'Tunisia', code: 'tn' },
  'Algeria': { fi: 'Algeria', code: 'dz' },
  'Mali': { fi: 'Mali', code: 'ml' },
  "Côte d'Ivoire": { fi: 'Norsunluurannikko', code: 'ci' },
  'Ivory Coast': { fi: 'Norsunluurannikko', code: 'ci' },
  'South Africa': { fi: 'Etelä-Afrikka', code: 'za' },
  'DR Congo': { fi: 'Kongon dem. tasavalta', code: 'cd' },
  'Congo DR': { fi: 'Kongon dem. tasavalta', code: 'cd' },
  'Democratic Republic of Congo': { fi: 'Kongon dem. tasavalta', code: 'cd' },
  'Tanzania': { fi: 'Tansania', code: 'tz' },
  'Uganda': { fi: 'Uganda', code: 'ug' },
  'Zambia': { fi: 'Sambia', code: 'zm' },
  'Zimbabwe': { fi: 'Zimbabwe', code: 'zw' },
  'Burkina Faso': { fi: 'Burkina Faso', code: 'bf' },
  'Cape Verde': { fi: 'Kap Verde', code: 'cv' },
  'Cape Verde Islands': { fi: 'Kap Verde', code: 'cv' },
  'Gabon': { fi: 'Gabon', code: 'ga' },
  'Mozambique': { fi: 'Mosambik', code: 'mz' },
  'Angola': { fi: 'Angola', code: 'ao' },
  'Namibia': { fi: 'Namibia', code: 'na' },
  'Comoros': { fi: 'Komorit', code: 'km' },
  'Benin': { fi: 'Benin', code: 'bj' },
  'Sudan': { fi: 'Sudan', code: 'sd' },
  'Equatorial Guinea': { fi: 'Päiväntasaajan Guinea', code: 'gq' },

  // AFC (Asia)
  'Japan': { fi: 'Japani', code: 'jp' },
  'Korea Republic': { fi: 'Etelä-Korea', code: 'kr' },
  'South Korea': { fi: 'Etelä-Korea', code: 'kr' },
  'Australia': { fi: 'Australia', code: 'au' },
  'Iran': { fi: 'Iran', code: 'ir' },
  'Saudi Arabia': { fi: 'Saudi-Arabia', code: 'sa' },
  'Qatar': { fi: 'Qatar', code: 'qa' },
  'Iraq': { fi: 'Irak', code: 'iq' },
  'Jordan': { fi: 'Jordania', code: 'jo' },
  'Oman': { fi: 'Oman', code: 'om' },
  'Uzbekistan': { fi: 'Uzbekistan', code: 'uz' },
  'United Arab Emirates': { fi: 'Arabiemiirikunnat', code: 'ae' },
  'China PR': { fi: 'Kiina', code: 'cn' },
  'China': { fi: 'Kiina', code: 'cn' },
  'Indonesia': { fi: 'Indonesia', code: 'id' },
  'Bahrain': { fi: 'Bahrain', code: 'bh' },
  'Palestine': { fi: 'Palestiina', code: 'ps' },
  'Kuwait': { fi: 'Kuwait', code: 'kw' },
  'Vietnam': { fi: 'Vietnam', code: 'vn' },
  'Thailand': { fi: 'Thaimaa', code: 'th' },
  'Philippines': { fi: 'Filippiinit', code: 'ph' },
  'Kyrgyzstan': { fi: 'Kirgisia', code: 'kg' },
  'Tajikistan': { fi: 'Tadžikistan', code: 'tj' },

  // OFC
  'New Zealand': { fi: 'Uusi-Seelanti', code: 'nz' },
  'Fiji': { fi: 'Fidži', code: 'fj' },
  'Papua New Guinea': { fi: 'Papua-Uusi-Guinea', code: 'pg' },
  'Solomon Islands': { fi: 'Salomonsaaret', code: 'sb' },
  'Vanuatu': { fi: 'Vanuatu', code: 'vu' },
  'Tahiti': { fi: 'Tahiti', code: 'pf' },
}

export interface CountryDisplay {
  name: string
  code: string | null // null = unknown country
}

/**
 * Returns Finnish name and ISO code for a country.
 * Falls back to English name + null code if not found.
 */
export function getCountry(englishName: string): CountryDisplay {
  const info = COUNTRIES[englishName]
  if (info) return { name: info.fi, code: info.code }
  return { name: englishName, code: null }
}

/**
 * Returns the flagcdn.com image URL for a country code.
 * e.g. "de" → "https://flagcdn.com/20x15/de.png"
 */
export function flagUrl(code: string): string {
  return `https://flagcdn.com/20x15/${code}.png`
}

/**
 * Translates "Group A" → "Lohko A" etc.
 */
export function groupLabel(group: string | null | undefined): string | null {
  if (!group) return null
  return group.replace(/^Group\s+/i, 'Ryhmä ')
}
