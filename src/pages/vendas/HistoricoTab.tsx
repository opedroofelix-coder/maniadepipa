import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import type { Sale } from '../../types/database'
import { Badge, Card, EmptyState, formatCurrency } from '../../components/ui'

type SaleWithRelations = Sale & { profiles: { full_name: string } | null; customers: { name: string } | null }

export function HistoricoTab() {
  const [sales, setSales] = useState<SaleWithRelations[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('sales')
      .select('*, profiles(full_name), customers(name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setSales((data as unknown as SaleWithRelations[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCancel(id: string) {
    if (!confirm('Cancelar esta venda? O estoque dos itens será devolvido.')) return
    await supabase.from('sales').update({ status: 'cancelled' }).eq('id', id)
    load()
  }

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-neutral-900">Últimas vendas</h3>
      {loading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : sales.length === 0 ? (
        <EmptyState message="Nenhuma venda registrada ainda." />
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3">Cliente</th>
              <th className="py-2 pr-3">Vendedor</th>
              <th className="py-2 pr-3">Pagamento</th>
              <th className="py-2 pr-3 text-right">Total</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sales.map((s) => (
              <tr key={s.id}>
                <td className="py-2.5 pr-3 text-neutral-500">{format(new Date(s.created_at), 'dd/MM/yyyy HH:mm')}</td>
                <td className="py-2.5 pr-3 text-neutral-700">{s.customers?.name ?? '—'}</td>
                <td className="py-2.5 pr-3 text-neutral-700">{s.profiles?.full_name ?? '—'}</td>
                <td className="py-2.5 pr-3 capitalize text-neutral-700">{s.payment_method ?? '—'}</td>
                <td className="py-2.5 pr-3 text-right font-medium text-neutral-900">{formatCurrency(s.total)}</td>
                <td className="py-2.5 pr-3">
                  <Badge tone={s.status === 'completed' ? 'good' : 'critical'}>
                    {s.status === 'completed' ? 'Concluída' : 'Cancelada'}
                  </Badge>
                </td>
                <td className="py-2.5 text-right">
                  {s.status === 'completed' && (
                    <button onClick={() => handleCancel(s.id)} className="text-xs font-medium text-[#d03b3b] hover:underline">
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
