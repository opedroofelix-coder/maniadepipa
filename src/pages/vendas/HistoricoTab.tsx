import { useEffect, useId, useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import { supabase } from '../../lib/supabase'
import type { Sale } from '../../types/database'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  TableScroll,
  formatCurrency,
} from '../../components/ui'

type SaleWithRelations = Sale & { profiles: { full_name: string } | null; customers: { name: string } | null }

const PAGE_SIZE = 50

export function HistoricoTab() {
  const fieldId = useId()
  const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [sales, setSales] = useState<SaleWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toCancel, setToCancel] = useState<SaleWithRelations | null>(null)

  async function fetchPage(offset: number) {
    return supabase
      .from('sales')
      .select('*, profiles(full_name), customers(name)')
      .gte('created_at', `${start}T00:00:00`)
      .lte('created_at', `${end}T23:59:59`)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
  }

  async function load() {
    setLoading(true)
    setError(null)
    const { data } = await fetchPage(0)
    const rows = (data as unknown as SaleWithRelations[]) ?? []
    setSales(rows)
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false)
  }

  async function loadMore() {
    setLoadingMore(true)
    const { data } = await fetchPage(sales.length)
    const rows = (data as unknown as SaleWithRelations[]) ?? []
    setSales((prev) => [...prev, ...rows])
    setHasMore(rows.length === PAGE_SIZE)
    setLoadingMore(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCancel() {
    if (!toCancel) return
    const { error: cancelError } = await supabase.from('sales').update({ status: 'cancelled' }).eq('id', toCancel.id)
    setToCancel(null)
    if (cancelError) {
      setError('Não foi possível cancelar a venda.')
      return
    }
    load()
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
        <div>
          <Label htmlFor={`${fieldId}-start`}>De</Label>
          <Input id={`${fieldId}-start`} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${fieldId}-end`}>Até</Label>
          <Input id={`${fieldId}-end`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button onClick={load} disabled={loading || !start || !end || start > end}>
          Filtrar
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-[#d03b3b]">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : sales.length === 0 ? (
        <EmptyState message="Nenhuma venda no período selecionado." />
      ) : (
        <>
          <TableScroll>
            <table className="w-full min-w-[720px] text-left text-sm">
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
                    <td className="py-2.5 pr-3 whitespace-nowrap text-neutral-500">
                      {format(new Date(s.created_at), 'dd/MM/yyyy HH:mm')}
                    </td>
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
                        <button
                          type="button"
                          onClick={() => setToCancel(s)}
                          className="whitespace-nowrap px-2 py-2 text-xs font-medium text-[#d03b3b] hover:underline"
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          {hasMore && (
            <div className="mt-4 text-center">
              <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={toCancel !== null}
        title="Cancelar venda"
        message={
          toCancel
            ? `Cancelar a venda de ${formatCurrency(toCancel.total)} de ${format(new Date(toCancel.created_at), 'dd/MM/yyyy HH:mm')}? O estoque dos itens será devolvido.`
            : ''
        }
        confirmLabel="Cancelar venda"
        cancelLabel="Voltar"
        onConfirm={handleCancel}
        onClose={() => setToCancel(null)}
      />
    </Card>
  )
}
