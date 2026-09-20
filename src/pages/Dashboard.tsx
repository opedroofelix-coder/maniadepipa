import { useEffect, useState } from 'react'
import { eachDayOfInterval, format, parseISO } from 'date-fns'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { Button, Card, Input, Label, PageHeader, StatTile, formatCurrency } from '../components/ui'

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

interface ItemRow {
  sale_id: string
  description: string
  quantity: number
  cost_price_at_sale: number
  subtotal: number
}

const today = format(new Date(), 'yyyy-MM-dd')

export function Dashboard() {
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [salesCount, setSalesCount] = useState(0)
  const [faturamento, setFaturamento] = useState(0)
  const [lucro, setLucro] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [series, setSeries] = useState<DayPoint[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)

    const [{ data: sales }, { data: products }] = await Promise.all([
      supabase
        .from('sales')
        .select('id, total, discount, created_at')
        .eq('status', 'completed')
        .gte('created_at', `${start}T00:00:00`)
        .lte('created_at', `${end}T23:59:59`),
      supabase.from('products').select('stock_quantity, min_stock').eq('active', true),
    ])

    const saleRows = (sales as SaleRow[]) ?? []
    const saleIds = saleRows.map((s) => s.id)
    const { data: items } =
      saleIds.length > 0
        ? await supabase.from('sale_items').select('sale_id, description, quantity, cost_price_at_sale, subtotal').in('sale_id', saleIds)
        : { data: [] as ItemRow[] }
    const itemRows = (items as ItemRow[]) ?? []

    const totalFaturamento = saleRows.reduce((s, r) => s + Number(r.total), 0)
    const totalDescontos = saleRows.reduce((s, r) => s + Number(r.discount), 0)
    // lucro bruto dos itens menos o desconto, que é dado sobre o total da venda
    const lucroBruto = itemRows.reduce((s, i) => s + (Number(i.subtotal) - Number(i.cost_price_at_sale) * Number(i.quantity)), 0)

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
      const key = dayOfSale.get(s.id)!
      const acc = byDay.get(key)
      if (!acc) return
      acc.faturamento += Number(s.total)
      acc.lucro -= Number(s.discount)
    })
    itemRows.forEach((i) => {
      const key = dayOfSale.get(i.sale_id)
      const acc = key ? byDay.get(key) : undefined
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

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ticketMedio = salesCount > 0 ? faturamento / salesCount : 0
  const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral da loja no período selecionado." />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label>De</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button onClick={load} disabled={loading || !start || !end || start > end}>
            Filtrar
          </Button>
          {start > end && <p className="text-sm text-[#d03b3b]">A data inicial não pode ser maior que a final.</p>}
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-5 gap-4">
            <StatTile label="Vendas no período" value={String(salesCount)} />
            <StatTile label="Faturamento" value={formatCurrency(faturamento)} />
            <StatTile label="Ticket médio" value={formatCurrency(ticketMedio)} />
            <StatTile
              label="Lucro"
              value={formatCurrency(lucro)}
              tone={lucro < 0 ? 'critical' : 'good'}
              hint={faturamento > 0 ? `margem de ${margem.toFixed(1)}%` : undefined}
            />
            <StatTile
              label="Estoque baixo"
              value={String(lowStockCount)}
              tone={lowStockCount > 0 ? 'critical' : 'good'}
              hint={lowStockCount > 0 ? 'produtos precisam de reposição' : 'tudo certo'}
            />
          </div>

          <div className="mb-6 grid grid-cols-3 gap-6">
            <Card className="col-span-2">
              <h3 className="mb-1 text-sm font-semibold text-neutral-900">Faturamento e lucro por dia</h3>
              <p className="mb-4 text-xs text-neutral-500">
                {format(parseISO(start), 'dd/MM/yyyy')} a {format(parseISO(end), 'dd/MM/yyyy')}
              </p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e1e0d9" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: '#898781' }}
                      axisLine={{ stroke: '#c3c2b7' }}
                      tickLine={false}
                      interval={series.length > 60 ? 'preserveStartEnd' : 0}
                    />
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
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="faturamento" name="Faturamento" fill="#d6247a" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="lucro" name="Lucro" fill="#0ca30c" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-xs text-neutral-400">
                O lucro considera o preço de custo registrado na venda; itens avulsos (Diversos) entram com custo zero.
              </p>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-neutral-900">Mais vendidos no período</h3>
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
        </>
      )}
    </div>
  )
}
