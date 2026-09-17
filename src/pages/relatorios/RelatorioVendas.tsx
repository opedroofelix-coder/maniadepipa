import { useEffect, useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import { Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { downloadCsv } from '../../lib/csv'
import type { PaymentMethod, Sale } from '../../types/database'
import { Button, Card, EmptyState, Input, Label, StatTile, formatCurrency } from '../../components/ui'

export function RelatorioVendas() {
  const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('status', 'completed')
      .gte('created_at', `${start}T00:00:00`)
      .lte('created_at', `${end}T23:59:59`)
      .order('created_at', { ascending: false })
    setSales((data as Sale[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = sales.reduce((s, r) => s + Number(r.total), 0)
  const count = sales.length
  const ticket = count > 0 ? total / count : 0

  const byMethod = new Map<string, number>()
  sales.forEach((s) => {
    const key = s.payment_method ?? 'não informado'
    byMethod.set(key, (byMethod.get(key) ?? 0) + Number(s.total))
  })

  function exportCsv() {
    const rows: (string | number)[][] = [['Data', 'Cliente', 'Forma de pagamento', 'Subtotal', 'Desconto', 'Total', 'Status']]
    sales.forEach((s) => {
      rows.push([
        format(new Date(s.created_at), 'dd/MM/yyyy HH:mm'),
        s.customer_id ?? '',
        s.payment_method ?? '',
        s.subtotal,
        s.discount,
        s.total,
        s.status,
      ])
    })
    downloadCsv(`vendas_${start}_a_${end}.csv`, rows)
  }

  return (
    <div>
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
          <Button onClick={load}>Filtrar</Button>
          <Button variant="secondary" onClick={exportCsv} disabled={sales.length === 0}>
            <Download size={16} /> Exportar CSV
          </Button>
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <StatTile label="Vendas no período" value={String(count)} />
            <StatTile label="Faturamento" value={formatCurrency(total)} />
            <StatTile label="Ticket médio" value={formatCurrency(ticket)} />
          </div>

          <Card className="mb-6">
            <h3 className="mb-4 text-sm font-semibold text-neutral-900">Por forma de pagamento</h3>
            {byMethod.size === 0 ? (
              <EmptyState message="Sem vendas no período selecionado." />
            ) : (
              <ul className="space-y-2">
                {Array.from(byMethod.entries()).map(([method, value]) => (
                  <li key={method} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-neutral-600">{method as PaymentMethod}</span>
                    <span className="font-medium text-neutral-900">{formatCurrency(value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
