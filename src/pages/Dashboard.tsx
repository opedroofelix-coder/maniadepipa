import { useEffect, useId, useState } from 'react'
import { eachDayOfInterval, format, isValid, parseISO } from 'date-fns'
import clsx from 'clsx'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { localDayRangeToUtcIso } from '../lib/date'
import { fetchItemsInBatches } from '../lib/sales'
import { raffleDailyEntries, type RaffleForMath } from '../lib/raffles'
import { formatQuantity, roundMoney } from '../lib/number'
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
  rifas: number
  lucro: number
}

/** O que cada rifa trouxe no período: dinheiro das cotas e lucro (src/lib/raffles.ts). */
interface RafflePeriod {
  id: string
  name: string
  tickets: number
  money: number
  profit: number
}

type RaffleRow = RaffleForMath & { id: string; name: string }

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
  const [rafflesInPeriod, setRafflesInPeriod] = useState<RafflePeriod[]>([])
  const [series, setSeries] = useState<DayPoint[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!isValidDay(start) || !isValidDay(end) || start > end) return
    setLoading(true)

    const { startIso, endIso } = localDayRangeToUtcIso(start, end)
    const [{ data: sales }, { data: products }, { data: raffles }] = await Promise.all([
      supabase
        .from('sales')
        .select('id, total, discount, created_at')
        .eq('status', 'completed')
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      supabase.from('products').select('stock_quantity, min_stock').eq('active', true),
      // cotas de rifa entram como dinheiro e lucro do dia em que foram vendidas;
      // rifa cancelada não entra (ver raffleDailyEntries)
      supabase
        .from('raffles')
        .select(
          'id, name, status, ticket_price, total_tickets, amount_received, closed_at, raffle_items(quantity, cost_price_at_raffle), raffle_ticket_sales(sale_date, quantity)',
        )
        .neq('status', 'cancelada'),
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

    // rifas: o que cada uma trouxe dentro do período, dia a dia
    const raffleRows = (raffles as unknown as RaffleRow[]) ?? []
    const inPeriod = (day: string) => day >= start && day <= end
    const raffleDays = new Map<string, { money: number; profit: number }>()
    const perRaffle: RafflePeriod[] = []
    raffleRows.forEach((r) => {
      const entries = raffleDailyEntries(r).filter((e) => inPeriod(e.date))
      if (entries.length === 0) return
      entries.forEach((e) => {
        const acc = raffleDays.get(e.date) ?? { money: 0, profit: 0 }
        acc.money += e.money
        acc.profit += e.profit
        raffleDays.set(e.date, acc)
      })
      perRaffle.push({
        id: r.id,
        name: r.name,
        tickets: r.raffle_ticket_sales.filter((t) => inPeriod(t.sale_date)).reduce((sum, t) => sum + Number(t.quantity), 0),
        money: roundMoney(entries.reduce((sum, e) => sum + e.money, 0)),
        profit: roundMoney(entries.reduce((sum, e) => sum + e.profit, 0)),
      })
    })
    perRaffle.sort((a, b) => b.money - a.money)

    setSalesCount(saleRows.length)
    setFaturamento(totalFaturamento)
    setLucro(lucroBruto - totalDescontos)
    setRafflesInPeriod(perRaffle)
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
        const raffle = raffleDays.get(key) ?? { money: 0, profit: 0 }
        return {
          date: key,
          label: format(d, 'dd/MM'),
          faturamento: roundMoney(acc.faturamento),
          rifas: roundMoney(raffle.money),
          lucro: roundMoney(acc.lucro + raffle.profit),
        }
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

  const raffleMoney = roundMoney(rafflesInPeriod.reduce((sum, r) => sum + r.money, 0))
  const raffleProfit = roundMoney(rafflesInPeriod.reduce((sum, r) => sum + r.profit, 0))
  const raffleTickets = rafflesInPeriod.reduce((sum, r) => sum + r.tickets, 0)
  // entrou = vendas da loja + cotas de rifa; o lucro soma os dois
  const entrou = roundMoney(faturamento + raffleMoney)
  const lucroTotal = roundMoney(lucro + raffleProfit)
  const ticketMedio = salesCount > 0 ? faturamento / salesCount : 0
  const margem = entrou > 0 ? (lucroTotal / entrou) * 100 : 0
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
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="Entrou no período"
              value={formatCurrency(entrou)}
              hint={rafflesInPeriod.length > 0 ? `vendas ${formatCurrency(faturamento)} + rifas ${formatCurrency(raffleMoney)}` : 'vendas da loja'}
            />
            <StatTile label="Vendas no período" value={String(salesCount)} />
            <StatTile label="Ticket médio" value={formatCurrency(ticketMedio)} hint="só vendas da loja" />
            <StatTile
              label="Cotas de rifa"
              value={String(raffleTickets)}
              hint={rafflesInPeriod.length > 0 ? `em ${rafflesInPeriod.length} ${rafflesInPeriod.length === 1 ? 'rifa' : 'rifas'}` : 'nenhuma no período'}
            />
            <StatTile
              label="Lucro"
              value={formatCurrency(lucroTotal)}
              tone={lucroTotal < 0 ? 'critical' : 'good'}
              hint={
                rafflesInPeriod.length > 0
                  ? `vendas ${formatCurrency(roundMoney(lucro))} + rifas ${formatCurrency(raffleProfit)}`
                  : entrou > 0
                    ? `margem de ${margem.toFixed(1).replace('.', ',')}%`
                    : undefined
              }
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
              <h2 className="mb-1 font-display text-[22px] font-extrabold text-[#0e2240]">Dinheiro que entrou e lucro por dia</h2>
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
                      // mesma ordem das barras e da legenda
                      itemSorter={(item) => ['faturamento', 'rifas', 'lucro'].indexOf(String(item.dataKey))}
                      formatter={(value) => formatCurrency(Number(value))}
                      labelFormatter={(label) => `Dia ${label}`}
                      contentStyle={{ borderRadius: 16, border: '2px solid #d5e3f0', fontSize: 13, fontWeight: 700 }}
                    />
                    {/* na ordem das barras (vendas, rifas, lucro), não em ordem alfabética */}
                    <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={null} />
                    {/* vendas e cotas de rifa empilhadas: a coluna inteira é o que entrou no dia */}
                    <Bar dataKey="faturamento" name="Vendas" stackId="entrou" fill="#0e2240" maxBarSize={28} />
                    <Bar dataKey="rifas" name="Cotas de rifa" stackId="entrou" fill="#ffc83c" radius={[10, 10, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="lucro" name="Lucro" fill="#d6247a" radius={[10, 10, 4, 4]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-xs font-semibold text-[#52607a]">
                O lucro das vendas considera o preço de custo registrado na venda (itens avulsos entram com custo zero). O de
                cada cota de rifa é o valor da cota menos a parte dela no custo dos prêmios; ao encerrar a rifa, o custo das
                cotas não vendidas entra no dia do encerramento.
              </p>
            </Card>

            <div className="space-y-6">
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

              {rafflesInPeriod.length > 0 && (
                <Card>
                  <h2 className="mb-3 font-display text-[22px] font-extrabold text-[#0e2240]">Rifas no período</h2>
                  <ul className="divide-y divide-[#eef2f7]">
                    {rafflesInPeriod.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block font-extrabold break-words text-[#0e2240]">{r.name}</span>
                          <span className="text-xs font-semibold text-[#52607a]">
                            {r.tickets} {r.tickets === 1 ? 'cota' : 'cotas'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-extrabold text-[#0e2240]">{formatCurrency(r.money)}</span>
                          <span className={r.profit < 0 ? 'text-xs font-bold text-[#a12424]' : 'text-xs font-bold text-[#0a6b34]'}>
                            lucro {formatCurrency(r.profit)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-center justify-between gap-3 border-t-2 border-[#d5e3f0] pt-3 text-sm">
                    <span className="font-extrabold text-[#0e2240]">Total · {raffleTickets} cotas</span>
                    <span className="shrink-0 text-right">
                      <span className="block font-extrabold text-[#0e2240]">{formatCurrency(raffleMoney)}</span>
                      <span className={raffleProfit < 0 ? 'text-xs font-bold text-[#a12424]' : 'text-xs font-bold text-[#0a6b34]'}>
                        lucro {formatCurrency(raffleProfit)}
                      </span>
                    </span>
                  </div>
                </Card>
              )}
            </div>
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
