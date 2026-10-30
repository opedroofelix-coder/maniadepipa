// Clima da loja pela Open-Meteo (https://open-meteo.com): sem chave de API e
// com CORS liberado, então o navegador chama direto. Os dados são CC BY 4.0 e
// pedem atribuição, que fica no rodapé do cartão do clima.
// Atenção: a API gratuita é para uso não comercial; uso comercial pede o plano pago.

export const STORE_LOCATION = { name: 'Jandira, SP', latitude: -23.5275, longitude: -46.9025 }

/**
 * Vento (km/h, medido a 10 m de altura) que separa "fraco", "ideal" e "forte"
 * para soltar pipa. Ponto de partida: ajustar com a experiência da loja.
 */
export const WIND_IDEAL_MIN = 10
export const WIND_IDEAL_MAX = 30
/** Chance de chuva (%) a partir da qual o dia já conta como de produção. */
export const RAIN_CHANCE_LIMIT = 60

export type DayKind = 'pipa' | 'producao' | 'vento-fraco' | 'vento-forte'

export interface DayForecast {
  date: string // yyyy-MM-dd
  code: number
  min: number
  max: number
  rainChance: number
  windMax: number
  kind: DayKind
}

export interface Weather {
  fetchedAt: number
  temperature: number
  code: number
  wind: number
  isDay: boolean
  /** classificação de hoje: tempo de agora + chance de chuva do dia */
  kind: DayKind
  /** hoje e os próximos 3 dias */
  days: DayForecast[]
}

/** Códigos WMO de garoa, chuva, pancadas e trovoada. */
export function isRainCode(code: number) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
}

export function classify({ code, wind, rainChance = 0 }: { code: number; wind: number; rainChance?: number }): DayKind {
  if (isRainCode(code) || rainChance >= RAIN_CHANCE_LIMIT) return 'producao'
  if (wind < WIND_IDEAL_MIN) return 'vento-fraco'
  if (wind > WIND_IDEAL_MAX) return 'vento-forte'
  return 'pipa'
}

export function describeCode(code: number): string {
  if (code === 0) return 'Céu limpo'
  if (code === 1) return 'Quase sem nuvens'
  if (code === 2) return 'Parcialmente nublado'
  if (code === 3) return 'Nublado'
  if (code === 45 || code === 48) return 'Neblina'
  if (code >= 51 && code <= 57) return 'Garoa'
  if (code >= 61 && code <= 67) return 'Chuva'
  if (code >= 71 && code <= 77) return 'Neve'
  if (code >= 80 && code <= 82) return 'Pancadas de chuva'
  if (code >= 95) return 'Trovoada'
  return 'Tempo instável'
}

const CACHE_KEY = 'maniadepipa-clima'
const CACHE_MS = 30 * 60 * 1000

function readCache(): Weather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as Weather
    return Date.now() - cached.fetchedAt < CACHE_MS ? cached : null
  } catch {
    return null
  }
}

function writeCache(weather: Weather) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(weather))
  } catch {
    // aba anônima ou armazenamento cheio: segue sem cache
  }
}

interface ApiResponse {
  current: {
    temperature_2m: number
    precipitation: number
    weather_code: number
    wind_speed_10m: number
    is_day: number
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: (number | null)[]
    wind_speed_10m_max: number[]
  }
}

/** Clima de agora e dos próximos dias, com cache de 30 minutos no aparelho. */
export async function fetchWeather(signal?: AbortSignal): Promise<Weather> {
  const cached = readCache()
  if (cached) return cached

  const params = new URLSearchParams({
    latitude: String(STORE_LOCATION.latitude),
    longitude: String(STORE_LOCATION.longitude),
    current: 'temperature_2m,precipitation,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    timezone: 'America/Sao_Paulo',
    forecast_days: '4',
    wind_speed_unit: 'kmh',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal })
  if (!response.ok) throw new Error(`Open-Meteo respondeu ${response.status}`)
  const data = (await response.json()) as ApiResponse

  const days: DayForecast[] = data.daily.time.map((date, i) => {
    const day = {
      date,
      code: data.daily.weather_code[i],
      min: data.daily.temperature_2m_min[i],
      max: data.daily.temperature_2m_max[i],
      rainChance: data.daily.precipitation_probability_max[i] ?? 0,
      windMax: data.daily.wind_speed_10m_max[i],
    }
    return { ...day, kind: classify({ code: day.code, wind: day.windMax, rainChance: day.rainChance }) }
  })

  const { current } = data
  const raining = current.precipitation > 0
  const weather: Weather = {
    fetchedAt: Date.now(),
    temperature: current.temperature_2m,
    code: current.weather_code,
    wind: current.wind_speed_10m,
    isDay: current.is_day === 1,
    // garoa fraca às vezes vem com código de nublado, mas com milímetros medidos
    kind: raining
      ? 'producao'
      : classify({ code: current.weather_code, wind: current.wind_speed_10m, rainChance: days[0]?.rainChance ?? 0 }),
    days,
  }
  writeCache(weather)
  return weather
}
