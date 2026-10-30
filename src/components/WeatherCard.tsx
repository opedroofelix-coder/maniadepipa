import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  Moon,
  Scissors,
  Snowflake,
  Sun,
  Wind,
} from 'lucide-react'
import clsx from 'clsx'
import type { Role } from '../types/database'
import { canOpen } from '../lib/access'
import {
  STORE_LOCATION,
  WIND_IDEAL_MAX,
  WIND_IDEAL_MIN,
  describeCode,
  fetchWeather,
  type DayKind,
  type Weather,
} from '../lib/weather'

/** Losango de pipa com as varetas, no traço dos ícones da lucide. */
export function KiteIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l7 8-7 10-7-10z" />
      <path d="M5 10h14M12 2v18" />
    </svg>
  )
}

const KIND_STYLE: Record<
  DayKind,
  { background: string; badge: string; badgeText: string; label: string; labelColor: string; tip: string }
> = {
  pipa: {
    background: 'bg-[#ffe69a]',
    badge: 'Hoje é dia de pipa',
    badgeText: 'text-[#ffe69a]',
    label: 'pipa',
    labelColor: 'text-[#0a6b34]',
    tip: 'Tempo firme e vento bom. Deixe linha, rabiola e carretilha perto do caixa.',
  },
  producao: {
    background: 'bg-[#d5e3f0]',
    badge: 'Hoje é dia de produção',
    badgeText: 'text-[#a9dbff]',
    label: 'produção',
    labelColor: 'text-[#2b4fa8]',
    tip: 'Chuva no caminho. Bom momento pra montar pipas, cortar papel de seda e repor o estoque.',
  },
  'vento-fraco': {
    background: 'bg-[#fff1c7]',
    badge: 'Hoje é dia de vitrine',
    badgeText: 'text-[#fff1c7]',
    label: 'vitrine',
    labelColor: 'text-[#52607a]',
    tip: 'Tempo seco, mas o vento está fraco. Bom dia pra caprichar na vitrine e nas pipas expostas.',
  },
  'vento-forte': {
    background: 'bg-[#ffd9c2]',
    badge: 'Vento forte hoje',
    badgeText: 'text-[#ffd9c2]',
    label: 'vento forte',
    labelColor: 'text-[#9a3412]',
    tip: 'Vento acima do ideal. Linha mais grossa e pipas resistentes devem sair mais.',
  },
}

function WeatherIcon({ code, isDay = true, size }: { code: number; isDay?: boolean; size: number }) {
  const props = { size, strokeWidth: 2.2, 'aria-hidden': true as const }
  if (code === 0) return isDay ? <Sun {...props} /> : <Moon {...props} />
  if (code <= 2) return isDay ? <CloudSun {...props} /> : <CloudMoon {...props} />
  if (code === 3) return <Cloud {...props} />
  if (code === 45 || code === 48) return <CloudFog {...props} />
  if (code >= 51 && code <= 57) return <CloudDrizzle {...props} />
  if (code >= 71 && code <= 77) return <Snowflake {...props} />
  if (code >= 95) return <CloudLightning {...props} />
  return <CloudRain {...props} />
}

function greeting(now: Date) {
  const hour = now.getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function weekday(date: string) {
  const label = format(parseISO(date), 'EEE', { locale: ptBR }).replace('.', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Posição do vento na régua fraco | ideal | forte (0 a 100%). */
const WIND_SCALE_MAX = 45
function windPosition(wind: number) {
  return Math.min(Math.max(wind, 0), WIND_SCALE_MAX) / WIND_SCALE_MAX
}

/**
 * Cabeçalho do Dashboard: saudação e o clima da loja, dizendo se hoje é dia
 * de pipa (vender) ou de produção (montar e repor). Sem internet ou com a API
 * fora do ar, mostra só a saudação.
 */
export function WeatherCard({ firstName, role }: { firstName: string; role: Role }) {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const now = new Date()

  useEffect(() => {
    const controller = new AbortController()
    fetchWeather(controller.signal)
      .then((data) => {
        setWeather(data)
        setStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [])

  const style = weather ? KIND_STYLE[weather.kind] : null
  const upcoming = weather?.days.slice(1, 4) ?? []
  const nextKiteDay = weather && weather.kind !== 'pipa' ? upcoming.find((d) => d.kind === 'pipa') : undefined
  const dateLabel = format(now, "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <section
      aria-label="Saudação e clima"
      className={clsx(
        'mb-5 flex flex-wrap items-stretch gap-6 rounded-[28px] p-5 sm:p-7',
        style ? style.background : 'bg-white',
      )}
    >
      <div className="flex min-w-0 flex-[1_1_320px] flex-col justify-center gap-2.5">
        <p className="text-sm font-bold text-[#3b4a66] first-letter:uppercase">{dateLabel}</p>
        <h1 className="font-display text-[34px] leading-[1.05] font-extrabold text-[#0e2240] sm:text-[40px]">
          {greeting(now)}
          {firstName ? `, ${firstName}` : ''}!
        </h1>

        {style && weather && (
          <>
            <p
              className={clsx(
                'inline-flex items-center gap-2 self-start rounded-full bg-[#0e2240] px-4 py-2 font-display text-lg font-extrabold',
                style.badgeText,
              )}
            >
              {weather.kind === 'producao' ? <Scissors size={18} strokeWidth={2.4} aria-hidden="true" /> : <KiteIcon />}
              {style.badge}
            </p>
            <p className="max-w-[460px] text-[15px] leading-normal font-semibold text-[#0e2240]">
              {style.tip}
              {nextKiteDay && ` ${weekday(nextKiteDay.date)} vem com tempo de pipa.`}
            </p>
            {weather.kind === 'producao' && canOpen('/estoque', role) && (
              <div className="mt-1 flex flex-wrap gap-2">
                <Link
                  to="/estoque"
                  className="inline-flex min-h-12 items-center rounded-full bg-[#0e2240] px-5 text-sm font-extrabold text-white hover:bg-[#1c3561]"
                >
                  Ver estoque baixo
                </Link>
                <Link
                  to="/estoque?aba=movimentacoes"
                  className="inline-flex min-h-12 items-center rounded-full bg-white px-5 text-sm font-extrabold text-[#0e2240] hover:bg-[#eef2f7]"
                >
                  Registrar produção
                </Link>
              </div>
            )}
          </>
        )}
        {status === 'loading' && (
          <p role="status" className="text-sm font-semibold text-[#52607a]">
            Olhando o céu de {STORE_LOCATION.name}…
          </p>
        )}
        {status === 'error' && (
          <p className="text-sm font-semibold text-[#52607a]">Não deu pra ver o clima agora. Confira a internet.</p>
        )}
      </div>

      {weather && (
        <div className="flex flex-[0_1_380px] flex-col gap-4 rounded-[20px] bg-white/70 p-5">
          <div className="flex items-center gap-3.5 text-[#0e2240]">
            <WeatherIcon code={weather.code} isDay={weather.isDay} size={52} />
            <div>
              <p className="font-display text-4xl leading-none font-extrabold">{Math.round(weather.temperature)}°</p>
              <p className="text-sm font-bold text-[#3b4a66]">
                {describeCode(weather.code)} · {STORE_LOCATION.name}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex justify-between text-[13px] font-extrabold text-[#0e2240]">
              <span className="inline-flex items-center gap-1.5">
                <Wind size={15} aria-hidden="true" /> Vento {Math.round(weather.wind)} km/h
              </span>
              <span>
                {weather.wind < WIND_IDEAL_MIN ? 'fraco' : weather.wind > WIND_IDEAL_MAX ? 'forte' : 'bom pra soltar'}
              </span>
            </div>
            <div className="relative flex h-2.5 gap-1" aria-hidden="true">
              <span className="rounded-l-md bg-[#cfe6fa]" style={{ flex: WIND_IDEAL_MIN }} />
              <span className="bg-[#7fd6a4]" style={{ flex: WIND_IDEAL_MAX - WIND_IDEAL_MIN }} />
              <span className="rounded-r-md bg-[#ffb27a]" style={{ flex: WIND_SCALE_MAX - WIND_IDEAL_MAX }} />
              <span
                className="absolute -top-[5px] h-4 w-4 -translate-x-1/2 rotate-45 rounded-[3px] border-2 border-white bg-[#0e2240]"
                style={{ left: `${windPosition(weather.wind) * 100}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs font-bold text-[#52607a]" aria-hidden="true">
              <span>fraco</span>
              <span>ideal</span>
              <span>forte</span>
            </div>
          </div>

          {upcoming.length > 0 && (
            <ul className="flex gap-2" aria-label="Próximos dias">
              {upcoming.map((day) => (
                <li key={day.date} className="flex flex-1 flex-col items-center gap-0.5 rounded-[14px] bg-white p-2">
                  <span className="text-xs font-extrabold text-[#52607a]">{weekday(day.date)}</span>
                  <span className="text-[#0e2240]" title={describeCode(day.code)}>
                    <WeatherIcon code={day.code} size={22} />
                  </span>
                  <span className={clsx('text-xs font-extrabold', KIND_STYLE[day.kind].labelColor)}>
                    {KIND_STYLE[day.kind].label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-right text-xs font-semibold text-[#52607a]">
            Dados:{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">
              Open-Meteo
            </a>
          </p>
        </div>
      )}
    </section>
  )
}
