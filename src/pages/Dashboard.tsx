import { useEffect, useId, useState } from 'react'
import { eachDayOfInterval, format, isValid, parseISO } from 'date-fns'
import clsx from 'clsx'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { localDayRangeToUtcIso } from '../lib/date'
import { fetchItemsInBatches } from '../lib/sales'
import { formatQuantity } from '../lib/number'
import { firstName } from '../lib/names'
import { useAuth } from '../contexts/AuthContext'
import { Button, Card, Input, Label, Loader, StatTile, formatCurrency } from '../components/ui'
import { WeatherCard } from '../components/WeatherCard'
import { QuickActions } from '../components/QuickActions'
import { QuickProductModal } from '../components/QuickProductModal'

/** Cores dos losangos do ranking: as cores da pipa, na ordem da logo. */
const RANK_COLORS = ['bg-[#ffc83c]', 'bg-[#ff6b1a]', 'bg-[#7fc8ff]']

interface DayPoint {
  date: string
  label: string
  faturamento: number
  lucro: number
}

interface TopProduct {
  name: string
  quantity: number
}

interface SaleRow {
  id: string
  total: number
  discount: number
  created_at: string
}

/** Um <input type="date"> pode voltar vazio ou incompleto enquanto é digitado. */
function isValidDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value))
}

export function Dashboard() {
  const fieldId = useId()
  const { profile } = useAuth()
  const [quickProductOpen, setQuickProductOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const today = format(new Date(), 'yyyy-MM-dd')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  // período que realmente foi carregado; o cabeçalho lê daqui, nunca dos
  // inputs, senão limpar o campo de data derruba a página
  const [loadedRange, setLoadedRange] = useState({ start: today, end: today })
  const [salesCount, setSalesCount] = useState(0)
  const [faturamento, setFaturamento] = useState(0)
  const [lucro, setLucro] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [series, setSeries] = useState<DayPoint[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!isValidDay(start) || !isValidDay(end) || start > end) return
    setLoading(true)

    const { startIso, endIso } = localDayRangeToUtcIso(start, end)
    const [{ data: sales }, { data: products }] = await Promise.all([
      supabase
        .from('sales')
        .select('id, total, discount, created_at')
        .eq('status', 'completed')
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      supabase.from('products').select('stock_quantity, min_stock').eq('active', true),
    ])

    const saleRows = (sales as SaleRow[]) ?? []
    const saleIds = saleRows.map((s) => s.id)
    const itemRows = saleIds.length > 0 ? await fetchItemsInBatches(saleIds) : []

    const totalFaturamento = saleRows.reduce((s, r) => s + Number(r.total), 0)
    const totalDescontos = saleRows.reduce((s, r) => s + Number(r.discount), 0)
    // lucro bruto dos itens menos o desconto, que é dado sobre o total da venda
    const lucroBruto = itemRows.reduce(
      (s, i) => s + (Number(i.subtotal) - Number(i.cost_price_at_sale) * Number(i.quantity)),
      0,
    )

    setSalesCount(saleRows.length)
    setFaturamento(totalFaturamento)
    setLucro(lucroBruto - totalDescontos)
    setLowStockCount((products ?? []).filter((p) => Number(p.stock_quantity) <= Number(p.min_stock)).length)

    // série diária: faturamento e lucro por dia do período
    const dayOfSale = new Map<string, string>()
    saleRows.forEach((s) => dayOfSale.set(s.id, format(new Date(s.created_at), 'yyyy-MM-dd')))

    const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) })
    const byDay = new Map<string, { faturamento: number; lucro: number }>()
    days.forEach((d) => byDay.set(format(d, 'yyyy-MM-dd'), { faturamento: 0, lucro: 0 }))

    saleRows.forEach((s) => {
      const acc = byDay.get(dayOfSale.get(s.id) ?? '')
      if (!acc) return
      acc.faturamento += Number(s.total)
      acc.lucro -= Number(s.discount)
    })
    itemRows.forEach((i) => {
      const acc = byDay.get(dayOfSale.get(i.sale_id) ?? '')
      if (!acc) return
      acc.lucro += Number(i.subtotal) - Number(i.cost_price_at_sale) * Number(i.quantity)
    })

    setSeries(
      days.map((d) => {
        const key = format(d, 'yyyy-MM-dd')
        const acc = byDay.get(key) ?? { faturamento: 0, lucro: 0 }
        return { date: key, label: format(d, 'dd/MM'), faturamento: acc.faturamento, lucro: acc.lucro }
      }),
    )

    const byProduct = new Map<string, number>()
    itemRows.forEach((i) => {
      byProduct.set(i.description, (byProduct.get(i.description) ?? 0) + Number(i.quantity))
    })
    setTopProducts(
      Array.from(byProduct.entries())
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5),
    )

    setLoadedRange({ start, end })
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // aviso de "produto cadastrado" some sozinho
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  function handleProductSaved(name: string) {
    setNotice(`${name} cadastrado`)
    // produto novo entra com estoque zero e conta no "estoque baixo"
    load()
  }

  const ticketMedio = salesCount > 0 ? faturamento / salesCount : 0
  const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0
  const rangeIsValid = isValidDay(start) && isValidDay(end) && start <= end

  return (
    <div>
      {profile && (
        <>
          <WeatherCard firstName={firstName(profile.full_name)} role={profile.role} />
          <QuickActions role={profile.role} onQuickProduct={() => setQuickProductOpen(true)} />
        </>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 font-display text-[22px] font-extrabold text-[#0e2240]">Período</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div>
            <Label htmlFor={`${fieldId}-start`}>De</Label>
            <Input id={`${fieldId}-start`} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-end`}>Até</Label>
            <Input id={`${fieldId}-end`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button onClick={load} disabled={loading || !rangeIsValid}>
            Filtrar
          </Button>
        </div>
        {!rangeIsValid && (
          <p className="mt-3 text-sm font-bold text-[#a12424]">
            {isValidDay(start) && isValidDay(end)
              ? 'A data inicial não pode ser maior que a final.'
              : 'Informe as duas datas para filtrar.'}
          </p>
        )}
      </Card>

      {loading ? (
        <Loader />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatTile label="Vendas no período" value={String(salesCount)} />
            <StatTile label="Faturamento" value={formatCurrency(faturamento)} />
            <StatTile label="Ticket médio" value={formatCurrency(ticketMedio)} />
            <StatTile
              label="Lucro"
              value={formatCurrency(lucro)}
              tone={lucro < 0 ? 'critical' : 'good'}
              hint={faturamento > 0 ? `margem de ${margem.toFixed(1).replace('.', ',')}%` : undefined}
            />
            <StatTile
              label="Estoque baixo"
              value={String(lowStockCount)}
              tone={lowStockCount > 0 ? 'critical' : 'good'}
              hint={lowStockCount > 0 ? 'produtos precisam de reposição' : 'tudo certo'}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="mb-1 font-display text-[22px] font-extrabold text-[#0e2240]">Faturamento e lucro por dia</h2>
              <p className="mb-4 text-sm font-semibold text-[#52607a]">
                {format(parseISO(loadedRange.start), 'dd/MM/yyyy')} a {format(parseISO(loadedRange.end), 'dd/MM/yyyy')}
              </p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#d5e3f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: '#52607a', fontWeight: 700 }}
                      axisLine={{ stroke: '#8796ae' }}
                      tickLine={false}
                      interval={series.length > 31 ? 'preserveStartEnd' : 0}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#52607a', fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                      tickFormatter={(v) => formatCurrency(v)}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      labelFormatter={(label) => `Dia ${label}`}
                      contentStyle={{ borderRadius: 16, border: '2px solid #d5e3f0', fontSize: 13, fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="faturamento" name="Faturamento" fill="#0e2240" radius={[10, 10, 4, 4]} maxBarSize={28} />
                    <Bar dataKey="lucro" name="Lucro" fill="#d6247a" radius={[10, 10, 4, 4]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-xs font-semibold text-[#52607a]">
                O lucro considera o preço de custo registrado na venda; itens avulsos (Diversos) entram com custo zero.
              </p>
            </Card>

            <Card>
              <h2 className="mb-4 font-display text-[22px] font-extrabold text-[#0e2240]">Mais vendidos</h2>
              {topProducts.length === 0 ? (
                <p className="text-sm font-semibold text-[#52607a]">Sem vendas no período.</p>
              ) : (
                <ol className="space-y-3.5">
                  {topProducts.map((p, i) => (
                    <li key={p.name} className="flex items-center gap-3 text-[15px]">
                      {/* posição dentro de um losango de pipa */}
                      <span
                        className={clsx(
                          'ml-1 flex h-[30px] w-[30px] shrink-0 rotate-45 items-center justify-center rounded-lg',
                          RANK_COLORS[i] ?? 'bg-[#eef2f7]',
                        )}
                      >
                        <span className="-rotate-45 text-[13px] font-extrabold text-[#0e2240]">{i + 1}</span>
                      </span>
                      <span className="min-w-0 flex-1 font-extrabold text-[#0e2240]">{p.name}</span>
                      <span className="shrink-0 font-extrabold text-[#0e2240]">{formatQuantity(p.quantity)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}

      {quickProductOpen && (
        <QuickProductModal open onClose={() => setQuickProductOpen(false)} onSaved={handleProductSaved} />
      )}

      {notice && (
        <p
          role="status"
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2.5 rounded-full bg-[#0e2240] px-5 py-3.5 text-sm font-extrabold text-white shadow-[0_12px_30px_rgba(14,34,64,0.3)] sm:right-8 sm:bottom-8"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 bg-[#ffc83c]" />
          {notice}
        </p>
      )}
    </div>
  )
}
