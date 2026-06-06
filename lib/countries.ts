interface CountryInfo {
  fi: string   // Finnish name
  flag: string // emoji flag
}

// Keyed by the English name football-data.org returns in homeTeam.name / awayTeam.name
const COUNTRIES: Record<string, CountryInfo> = {
  // UEFA
  'Germany': { fi: 'Saksa', flag: '🇩🇪' },
  'France': { fi: 'Ranska', flag: '🇫🇷' },
  'Spain': { fi: 'Espanja', flag: '🇪🇸' },
  'England': { fi: 'Englanti', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  'Portugal': { fi: 'Portugali', flag: '🇵🇹' },
  'Netherlands': { fi: 'Alankomaat', flag: '🇳🇱' },
  'Belgium': { fi: 'Belgia', flag: '🇧🇪' },
  'Croatia': { fi: 'Kroatia', flag: '🇭🇷' },
  'Italy': { fi: 'Italia', flag: '🇮🇹' },
  'Denmark': { fi: 'Tanska', flag: '🇩🇰' },
  'Switzerland': { fi: 'Sveitsi', flag: '🇨🇭' },
  'Austria': { fi: 'Itävalta', flag: '🇦🇹' },
  'Serbia': { fi: 'Serbia', flag: '🇷🇸' },
  'Poland': { fi: 'Puola', flag: '🇵🇱' },
  'Scotland': { fi: 'Skotlanti', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  'Wales': { fi: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
  'Hungary': { fi: 'Unkari', flag: '🇭🇺' },
  'Romania': { fi: 'Romania', flag: '🇷🇴' },
  'Slovakia': { fi: 'Slovakia', flag: '🇸🇰' },
  'Türkiye': { fi: 'Turkki', flag: '🇹🇷' },
  'Turkey': { fi: 'Turkki', flag: '🇹🇷' },
  'Ukraine': { fi: 'Ukraina', flag: '🇺🇦' },
  'Czech Republic': { fi: 'Tshekki', flag: '🇨🇿' },
  'Czechia': { fi: 'Tshekki', flag: '🇨🇿' },
  'Albania': { fi: 'Albania', flag: '🇦🇱' },
  'Greece': { fi: 'Kreikka', flag: '🇬🇷' },
  'Norway': { fi: 'Norja', flag: '🇳🇴' },
  'Sweden': { fi: 'Ruotsi', flag: '🇸🇪' },
  'Finland': { fi: 'Suomi', flag: '🇫🇮' },
  'Slovenia': { fi: 'Slovenia', flag: '🇸🇮' },
  'Georgia': { fi: 'Georgia', flag: '🇬🇪' },
  'Bosnia and Herzegovina': { fi: 'Bosnia-Hertsegovina', flag: '🇧🇦' },
  'North Macedonia': { fi: 'Pohjois-Makedonia', flag: '🇲🇰' },
  'Iceland': { fi: 'Islanti', flag: '🇮🇸' },
  'Montenegro': { fi: 'Montenegro', flag: '🇲🇪' },
  'Luxembourg': { fi: 'Luxemburg', flag: '🇱🇺' },
  'Israel': { fi: 'Israel', flag: '🇮🇱' },
  'Kosovo': { fi: 'Kosovo', flag: '🇽🇰' },

  // CONMEBOL
  'Argentina': { fi: 'Argentiina', flag: '🇦🇷' },
  'Brazil': { fi: 'Brasilia', flag: '🇧🇷' },
  'Colombia': { fi: 'Kolumbia', flag: '🇨🇴' },
  'Uruguay': { fi: 'Uruguay', flag: '🇺🇾' },
  'Ecuador': { fi: 'Ecuador', flag: '🇪🇨' },
  'Paraguay': { fi: 'Paraguay', flag: '🇵🇾' },
  'Venezuela': { fi: 'Venezuela', flag: '🇻🇪' },
  'Bolivia': { fi: 'Bolivia', flag: '🇧🇴' },
  'Chile': { fi: 'Chile', flag: '🇨🇱' },
  'Peru': { fi: 'Peru', flag: '🇵🇪' },

  // CONCACAF
  'United States': { fi: 'Yhdysvallat', flag: '🇺🇸' },
  'Mexico': { fi: 'Meksiko', flag: '🇲🇽' },
  'Canada': { fi: 'Kanada', flag: '🇨🇦' },
  'Jamaica': { fi: 'Jamaika', flag: '🇯🇲' },
  'Costa Rica': { fi: 'Costa Rica', flag: '🇨🇷' },
  'Panama': { fi: 'Panama', flag: '🇵🇦' },
  'Honduras': { fi: 'Honduras', flag: '🇭🇳' },
  'El Salvador': { fi: 'El Salvador', flag: '🇸🇻' },
  'Guatemala': { fi: 'Guatemala', flag: '🇬🇹' },
  'Haiti': { fi: 'Haiti', flag: '🇭🇹' },
  'Trinidad and Tobago': { fi: 'Trinidad ja Tobago', flag: '🇹🇹' },
  'Cuba': { fi: 'Kuuba', flag: '🇨🇺' },
  'Suriname': { fi: 'Suriname', flag: '🇸🇷' },

  // CAF (Africa)
  'Morocco': { fi: 'Marokko', flag: '🇲🇦' },
  'Senegal': { fi: 'Senegal', flag: '🇸🇳' },
  'Egypt': { fi: 'Egypti', flag: '🇪🇬' },
  'Nigeria': { fi: 'Nigeria', flag: '🇳🇬' },
  'Cameroon': { fi: 'Kamerun', flag: '🇨🇲' },
  'Ghana': { fi: 'Ghana', flag: '🇬🇭' },
  'Tunisia': { fi: 'Tunisia', flag: '🇹🇳' },
  'Algeria': { fi: 'Algeria', flag: '🇩🇿' },
  'Mali': { fi: 'Mali', flag: '🇲🇱' },
  "Côte d'Ivoire": { fi: 'Norsunluurannikko', flag: '🇨🇮' },
  'Ivory Coast': { fi: 'Norsunluurannikko', flag: '🇨🇮' },
  'South Africa': { fi: 'Etelä-Afrikka', flag: '🇿🇦' },
  'DR Congo': { fi: 'Kongon dem. tasavalta', flag: '🇨🇩' },
  'Democratic Republic of Congo': { fi: 'Kongon dem. tasavalta', flag: '🇨🇩' },
  'Tanzania': { fi: 'Tansania', flag: '🇹🇿' },
  'Uganda': { fi: 'Uganda', flag: '🇺🇬' },
  'Zambia': { fi: 'Sambia', flag: '🇿🇲' },
  'Zimbabwe': { fi: 'Zimbabwe', flag: '🇿🇼' },
  'Burkina Faso': { fi: 'Burkina Faso', flag: '🇧🇫' },
  'Cape Verde': { fi: 'Kap Verde', flag: '🇨🇻' },
  'Gabon': { fi: 'Gabon', flag: '🇬🇦' },
  'Mozambique': { fi: 'Mosambik', flag: '🇲🇿' },
  'Angola': { fi: 'Angola', flag: '🇦🇴' },
  'Namibia': { fi: 'Namibia', flag: '🇳🇦' },
  'Comoros': { fi: 'Komorit', flag: '🇰🇲' },
  'Benin': { fi: 'Benin', flag: '🇧🇯' },
  'Sudan': { fi: 'Sudan', flag: '🇸🇩' },
  'Equatorial Guinea': { fi: 'Päiväntasaajan Guinea', flag: '🇬🇶' },

  // AFC (Asia)
  'Japan': { fi: 'Japani', flag: '🇯🇵' },
  'Korea Republic': { fi: 'Etelä-Korea', flag: '🇰🇷' },
  'South Korea': { fi: 'Etelä-Korea', flag: '🇰🇷' },
  'Australia': { fi: 'Australia', flag: '🇦🇺' },
  'Iran': { fi: 'Iran', flag: '🇮🇷' },
  'Saudi Arabia': { fi: 'Saudi-Arabia', flag: '🇸🇦' },
  'Qatar': { fi: 'Qatar', flag: '🇶🇦' },
  'Iraq': { fi: 'Irak', flag: '🇮🇶' },
  'Jordan': { fi: 'Jordania', flag: '🇯🇴' },
  'Oman': { fi: 'Oman', flag: '🇴🇲' },
  'Uzbekistan': { fi: 'Uzbekistan', flag: '🇺🇿' },
  'United Arab Emirates': { fi: 'Arabiemiirikunnat', flag: '🇦🇪' },
  'China PR': { fi: 'Kiina', flag: '🇨🇳' },
  'China': { fi: 'Kiina', flag: '🇨🇳' },
  'Indonesia': { fi: 'Indonesia', flag: '🇮🇩' },
  'Bahrain': { fi: 'Bahrain', flag: '🇧🇭' },
  'Palestine': { fi: 'Palestiina', flag: '🇵🇸' },
  'Kuwait': { fi: 'Kuwait', flag: '🇰🇼' },
  'Vietnam': { fi: 'Vietnam', flag: '🇻🇳' },
  'Thailand': { fi: 'Thaimaa', flag: '🇹🇭' },
  'Philippines': { fi: 'Filippiinit', flag: '🇵🇭' },
  'Kyrgyzstan': { fi: 'Kirgisia', flag: '🇰🇬' },
  'Tajikistan': { fi: 'Tadžikistan', flag: '🇹🇯' },

  // OFC
  'New Zealand': { fi: 'Uusi-Seelanti', flag: '🇳🇿' },
  'Fiji': { fi: 'Fidži', flag: '🇫🇯' },
  'Papua New Guinea': { fi: 'Papua-Uusi-Guinea', flag: '🇵🇬' },
  'Solomon Islands': { fi: 'Salomonsaaret', flag: '🇸🇧' },
  'Vanuatu': { fi: 'Vanuatu', flag: '🇻🇺' },
  'Tahiti': { fi: 'Tahiti', flag: '🇵🇫' },
}

/**
 * Returns the Finnish display name and flag emoji for a country.
 * Falls back to the original English name with no flag if not found.
 */
export function getCountry(englishName: string): { name: string; flag: string } {
  const info = COUNTRIES[englishName]
  if (info) return { name: info.fi, flag: info.flag }
  return { name: englishName, flag: '' }
}

/**
 * Translates "Group A" → "Lohko A" etc.
 */
export function groupLabel(group: string | null | undefined): string | null {
  if (!group) return null
  return group.replace(/^Group\s+/i, 'Lohko ')
}
