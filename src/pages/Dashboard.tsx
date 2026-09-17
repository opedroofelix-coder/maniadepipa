import { useEffect, useState } from 'react'
import { eachDayOfInterval, format, startOfDay, startOfMonth, subDays } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { Card, PageHeader, StatTile, formatCurrency } from '../components/ui'

interface DayPoint {
  date: string
  label: string
  total: number
}

interface TopProduct {
  name: string
  quantity: number
}

export function Dashboard() {
  const [todayTotal, setTodayTotal] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [monthTotal, setMonthTotal] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [series, setSeries] = useState<DayPoint[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const todayStart = startOfDay(new Date()).toISOString()
      const monthStart = startOfMonth(new Date()).toISOString()
      const rangeStart = startOfDay(subDays(new Date(), 13)).toISOString()

      const [{ data: todaySales }, { data: monthSales }, { data: rangeSales }, { data: products }] = await Promise.all([
        supabase.from('sales').select('total').eq('status', 'completed').gte('created_at', todayStart),
        supabase.from('sales').select('total').eq('status', 'completed').gte('created_at', monthStart),
        supabase.from('sales').select('id, total, created_at').eq('status', 'completed').gte('created_at', rangeStart),
        supabase.from('products').select('stock_quantity, min_stock').eq('active', true),
      ])

      const rangeSaleIds = (rangeSales ?? []).map((s) => s.id)
      const { data: rangeItems } =
        rangeSaleIds.length > 0
          ? await supabase.from('sale_items').select('quantity, description').in('sale_id', rangeSaleIds)
          : { data: [] as { quantity: number; description: string }[] }

      const tToday = (todaySales ?? []).reduce((s, r) => s + Number(r.total), 0)
      setTodayTotal(tToday)
      setTodayCount((todaySales ?? []).length)
      setMonthTotal((monthSales ?? []).reduce((s, r) => s + Number(r.total), 0))
      setLowStockCount((products ?? []).filter((p) => Number(p.stock_quantity) <= Number(p.min_stock)).length)

      const days = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() })
      const byDay = new Map<string, number>()
      days.forEach((d) => byDay.set(format(d, 'yyyy-MM-dd'), 0))
      ;(rangeSales ?? []).forEach((s) => {
        const key = format(new Date(s.created_at), 'yyyy-MM-dd')
        byDay.set(key, (byDay.get(key) ?? 0) + Number(s.total))
      })
      setSeries(
        days.map((d) => ({
          date: format(d, 'yyyy-MM-dd'),
          label: format(d, 'dd/MM'),
          total: byDay.get(format(d, 'yyyy-MM-dd')) ?? 0,
        })),
      )

      const byProduct = new Map<string, number>()
      ;(rangeItems ?? []).forEach((item: { quantity: number; description: string }) => {
        byProduct.set(item.description, (byProduct.get(item.description) ?? 0) + Number(item.quantity))
      })
      setTopProducts(
        Array.from(byProduct.entries())
          .map(([name, quantity]) => ({ name, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
      )

      setLoading(false)
    }
    load()
  }, [])

  const ticketMedio = todayCount > 0 ? todayTotal / todayCount : 0

  if (loading) {
    return <p className="text-sm text-neutral-500">Carregando…</p>
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral da loja hoje." />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatTile label="Vendas hoje" value={String(todayCount)} />
        <StatTile label="Faturamento hoje" value={formatCurrency(todayTotal)} />
        <StatTile label="Ticket médio hoje" value={formatCurrency(ticketMedio)} />
        <StatTile
          label="Estoque baixo"
          value={String(lowStockCount)}
          tone={lowStockCount > 0 ? 'critical' : 'good'}
          hint={lowStockCount > 0 ? 'produtos precisam de reposição' : 'tudo certo'}
        />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <h3 className="mb-1 text-sm font-semibold text-neutral-900">Faturamento — últimos 14 dias</h3>
          <p className="mb-4 text-xs text-neutral-500">Total de {formatCurrency(monthTotal)} no mês.</p>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e1e0d9" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#898781' }} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#898781' }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  labelFormatter={(label) => `Dia ${label}`}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e1e0d9', fontSize: 13 }}
                />
                <Bar dataKey="total" fill="#d6247a" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-neutral-900">Mais vendidos (14 dias)</h3>
          {topProducts.length === 0 ? (
            <p className="text-sm text-neutral-400">Sem vendas no período.</p>
          ) : (
            <ul className="space-y-3">
              {topProducts.map((p, i) => (
                <li key={p.name} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700">
                    <span className="mr-2 text-neutral-400">{i + 1}.</span>
                    {p.name}
                  </span>
                  <span className="font-medium text-neutral-900">{p.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
