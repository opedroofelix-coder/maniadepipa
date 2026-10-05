import { useEffect, useId, useRef, useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { localDayRangeToUtcIso } from '../../lib/date'
import { formatQuantity } from '../../lib/number'
import type { Sale, SaleItem, SalePayment } from '../../types/database'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Loader,
  Modal,
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
  const [detail, setDetail] = useState<SaleWithRelations | null>(null)
  const [detailItems, setDetailItems] = useState<SaleItem[] | null>(null)
  const [detailPayments, setDetailPayments] = useState<SalePayment[]>([])
  const [detailError, setDetailError] = useState<string | null>(null)
  // abrir uma venda e logo outra: descarta a resposta da primeira, que pode
  // chegar depois e encher o modal com os itens errados
  const detailSeq = useRef(0)

  async function fetchPage(offset: number) {
    const { startIso, endIso } = localDayRangeToUtcIso(start, end)
    return supabase
      .from('sales')
      .select('*, profiles(full_name), customers(name)')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
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

  async function openDetail(sale: SaleWithRelations) {
    const seq = ++detailSeq.current
    setDetail(sale)
    setDetailItems(null)
    setDetailPayments([])
    setDetailError(null)
    const [{ data: items, error: itemsError }, { data: payments }] = await Promise.all([
      supabase.from('sale_items').select('*').eq('sale_id', sale.id).order('description'),
      supabase.from('sale_payments').select('*').eq('sale_id', sale.id),
    ])
    if (seq !== detailSeq.current) return // chegou atrasada, descarta
    if (itemsError) {
      console.error('sale_items select', itemsError)
      setDetailError('Não foi possível carregar os itens desta venda.')
      return
    }
    setDetailItems((items as SaleItem[]) ?? [])
    setDetailPayments((payments as SalePayment[]) ?? [])
  }

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
        <Loader />
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
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openDetail(s)}
                        className="px-2 py-2 text-xs font-medium text-[#a81760] hover:underline"
                      >
                        Ver itens
                      </button>
                      {s.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => setToCancel(s)}
                          className="px-2 py-2 text-xs font-medium text-[#d03b3b] hover:underline"
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

      <Modal
        open={detail !== null}
        onClose={() => {
          detailSeq.current++
          setDetail(null)
        }}
        title="Itens da venda"
        wide
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-neutral-500">Data</p>
                <p className="text-neutral-900">{format(new Date(detail.created_at), 'dd/MM/yyyy HH:mm')}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Cliente</p>
                <p className="text-neutral-900">{detail.customers?.name ?? 'Não identificado'}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Vendedor</p>
                <p className="text-neutral-900">{detail.profiles?.full_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Status</p>
                <Badge tone={detail.status === 'completed' ? 'good' : 'critical'}>
                  {detail.status === 'completed' ? 'Concluída' : 'Cancelada'}
                </Badge>
              </div>
            </div>

            {detailError ? (
              <p className="text-sm text-[#d03b3b]">{detailError}</p>
            ) : detailItems === null ? (
              <Loader label="Carregando itens…" />
            ) : detailItems.length === 0 ? (
              <EmptyState message="Esta venda não tem itens registrados." />
            ) : (
              <TableScroll>
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="py-2 pr-3">Produto</th>
                      <th className="py-2 pr-3 text-center">Qtd.</th>
                      <th className="py-2 pr-3 text-right">Preço</th>
                      <th className="py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {detailItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium text-neutral-900">{item.description}</span>
                          {item.product_id === null && (
                            <span className="ml-2">
                              <Badge tone="brand">avulso</Badge>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-center text-neutral-700">
                          {formatQuantity(Number(item.quantity))}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-neutral-700">
                          {formatCurrency(Number(item.unit_price))}
                        </td>
                        <td className="py-2.5 text-right font-medium text-neutral-900">
                          {formatCurrency(Number(item.subtotal))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}

            <div className="space-y-1 border-t border-neutral-200 pt-3 text-sm">
              <div className="flex items-center justify-between text-neutral-600">
                <span>Subtotal</span>
                <span>{formatCurrency(Number(detail.subtotal))}</span>
              </div>
              {Number(detail.discount) > 0 && (
                <div className="flex items-center justify-between text-neutral-600">
                  <span>Desconto</span>
                  <span>− {formatCurrency(Number(detail.discount))}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 text-base font-semibold text-neutral-900">
                <span>Total</span>
                <span>{formatCurrency(Number(detail.total))}</span>
              </div>
              {detailPayments.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-neutral-500">Pagamento</p>
                  {detailPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-neutral-700">
                      <span className="capitalize">{p.method}</span>
                      <span>{formatCurrency(Number(p.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
              {detail.amount_received !== null && (
                <div className="flex items-center justify-between pt-1 text-neutral-600">
                  <span>Recebido em dinheiro</span>
                  <span>{formatCurrency(Number(detail.amount_received))}</span>
                </div>
              )}
              {detail.change_amount !== null && Number(detail.change_amount) > 0 && (
                <div className="flex items-center justify-between text-neutral-600">
                  <span>Troco</span>
                  <span>{formatCurrency(Number(detail.change_amount))}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

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
