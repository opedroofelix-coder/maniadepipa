import { useEffect, useId, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { failureMessage } from '../../lib/errors'
import {
  formatQuantity,
  isWholeUnit,
  parseDecimal,
  roundMoney,
  roundQuantity,
  toMoneyInput,
  toQuantityInput,
  wholeUnitMessage,
} from '../../lib/number'
import {
  breakEvenTickets,
  collected,
  costPerTicket,
  estimatedProfit,
  finalResult,
  formatPercent,
  gainPercent,
  hasTickets,
  marginPercent,
  prizeCost,
  profitPerTicket,
  raffleValue,
  soldProfit,
  soldTickets,
} from '../../lib/raffles'
import type { Product, RaffleItem, RaffleTicketSale } from '../../types/database'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DecimalInput,
  EmptyState,
  IconButton,
  Input,
  Label,
  Loader,
  Modal,
  Select,
  StatTile,
  Toast,
  formatCurrency,
} from '../../components/ui'
import {
  MAX_AMOUNT,
  RAFFLE_SELECT,
  STALE_MESSAGE,
  STATUS_LABEL,
  STATUS_TONE,
  closedLabel,
  formatDay,
  parseTicketDraft,
  prizeSummary,
  stockShortage,
  ticketDraftFrom,
  type RaffleFull,
  type TicketDraft,
} from './shared'
import { TicketFields } from './TicketFields'

/**
 * Mensagem para um erro de gravação. Os gatilhos da 0006 recusam com o motivo
 * em português ("A rifa tem 50 cotas e já vendeu 48."): esse texto vai direto
 * para a tela. Os outros erros do banco viram a mensagem de cada ação.
 */
function saveError(error: { code?: string; message?: string } | null, fallback: string): string {
  if (error?.code === '23514' && error.message && !/violates|constraint/i.test(error.message)) return error.message
  return failureMessage(error, fallback)
}

type PrizeEdit = { item: RaffleItem; quantity: string }
type TicketEdit = { sale: RaffleTicketSale | null; date: string; quantity: string }

export function RifaDetalhe() {
  const { id } = useParams()
  const { profile } = useAuth()
  const fieldId = useId()
  const [raffle, setRaffle] = useState<RaffleFull | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // editar rifa
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editDraw, setEditDraw] = useState('')
  const [editTickets, setEditTickets] = useState<TicketDraft>(() => ({ mode: 'cota', price: '', total: '', tickets: '' }))
  const [editError, setEditError] = useState<string | null>(null)

  // prêmios
  const [addOpen, setAddOpen] = useState(false)
  const [addProduct, setAddProduct] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addError, setAddError] = useState<string | null>(null)
  const [prizeEdit, setPrizeEdit] = useState<PrizeEdit | null>(null)
  const [prizeError, setPrizeError] = useState<string | null>(null)
  const [prizeToDelete, setPrizeToDelete] = useState<RaffleItem | null>(null)

  // cotas por dia
  const [ticketEdit, setTicketEdit] = useState<TicketEdit | null>(null)
  const [ticketError, setTicketError] = useState<string | null>(null)
  const [saleToDelete, setSaleToDelete] = useState<RaffleTicketSale | null>(null)

  // encerrar e cancelar
  const [closeOpen, setCloseOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [closeError, setCloseError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  async function load() {
    const [{ data, error }, { data: prod }] = await Promise.all([
      supabase.from('raffles').select(RAFFLE_SELECT).eq('id', id).maybeSingle(),
      supabase.from('products').select('*').eq('active', true).order('name'),
    ])
    if (error) {
      console.error('raffle select', error)
      setPageError(failureMessage(error, 'Não foi possível carregar a rifa.'))
    }
    setRaffle((data as unknown as RaffleFull) ?? null)
    setProducts((prod as Product[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <Loader />
  if (!raffle) {
    return (
      <Card>
        <EmptyState message={pageError ?? 'Rifa não encontrada.'} />
        <div className="text-center">
          <Link to="/rifas" className="text-sm font-extrabold text-[#b0175f]">
            ← Voltar para as rifas
          </Link>
        </div>
      </Card>
    )
  }

  const current = raffle
  const isOpen = current.status === 'aberta'
  const withTickets = hasTickets(current)
  const sold = soldTickets(current)
  const cost = prizeCost(current)
  const sales = [...current.raffle_ticket_sales].sort((a, b) => b.sale_date.localeCompare(a.sale_date))
  const items = [...current.raffle_items].sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'))

  // ---------------------------------------------------------------- ações
  function after(message: string) {
    setToast(message)
    load()
  }

  function openEdit() {
    setEditName(current.name)
    setEditNotes(current.notes ?? '')
    setEditDraw(current.draw_date ?? '')
    setEditTickets(ticketDraftFrom(current))
    setEditError(null)
    setEditOpen(true)
  }

  async function handleEdit() {
    if (!editName.trim()) {
      setEditError('Dê um nome para a rifa.')
      return
    }
    const parsed = parseTicketDraft(editTickets, sold)
    if ('error' in parsed) {
      setEditError(parsed.error)
      return
    }
    if (sold > 0 && parsed.ticket_price === null) {
      setEditError('Esta rifa já tem cotas vendidas: o valor e o total de cotas não podem ficar em branco.')
      return
    }
    setBusy(true)
    const { data, error } = await supabase
      .from('raffles')
      .update({
        name: editName.trim(),
        notes: editNotes.trim() || null,
        draw_date: editDraw || null,
        ticket_price: parsed.ticket_price,
        total_tickets: parsed.total_tickets,
      })
      .eq('id', current.id)
      .eq('status', 'aberta')
      .select('id')
    setBusy(false)
    if (error) {
      console.error('raffles update', error)
      setEditError(saveError(error, 'Não foi possível salvar a rifa.'))
      return
    }
    setEditOpen(false)
    if (!data || data.length === 0) {
      setPageError(STALE_MESSAGE)
      load()
      return
    }
    after('Rifa salva.')
  }

  function openAddPrize() {
    setAddProduct('')
    setAddQty('1')
    setAddError(null)
    setAddOpen(true)
  }

  async function handleAddPrize() {
    const product = products.find((p) => p.id === addProduct)
    const qty = parseDecimal(addQty)
    if (!product) {
      setAddError('Escolha o produto.')
      return
    }
    if (Number.isNaN(qty) || qty <= 0) {
      setAddError('A quantidade deve ser maior que zero.')
      return
    }
    if (isWholeUnit(product.unit) && !Number.isInteger(qty)) {
      setAddError(wholeUnitMessage(product.name, product.unit))
      return
    }
    const shortage = stockShortage(new Map([[product.id, roundQuantity(qty)]]), products)
    if (shortage) {
      setAddError(`Estoque insuficiente: ${shortage}.`)
      return
    }
    setBusy(true)
    const { error } = await supabase.from('raffle_items').insert({
      raffle_id: current.id,
      product_id: product.id,
      description: product.name,
      quantity: roundQuantity(qty),
      cost_price_at_raffle: roundMoney(Number(product.cost_price)),
      sale_price_at_raffle: roundMoney(Number(product.sale_price)),
    })
    setBusy(false)
    if (error) {
      console.error('raffle_items insert', error)
      setAddError(saveError(error, 'Não foi possível adicionar o prêmio. Confira o estoque e tente de novo.'))
      load()
      return
    }
    setAddOpen(false)
    after(`${formatQuantity(qty)}× ${product.name} adicionado. Saiu do estoque.`)
  }

  function openPrizeEdit(item: RaffleItem) {
    setPrizeEdit({ item, quantity: toQuantityInput(Number(item.quantity)) })
    setPrizeError(null)
  }

  async function handlePrizeEdit() {
    if (!prizeEdit) return
    const { item } = prizeEdit
    const qty = parseDecimal(prizeEdit.quantity)
    const product = products.find((p) => p.id === item.product_id)
    if (Number.isNaN(qty) || qty <= 0) {
      setPrizeError('A quantidade deve ser maior que zero. Para tirar o prêmio, use a lixeira.')
      return
    }
    if (product && isWholeUnit(product.unit) && !Number.isInteger(qty)) {
      setPrizeError(wholeUnitMessage(product.name, product.unit))
      return
    }
    const diff = roundQuantity(qty - Number(item.quantity))
    if (diff === 0) {
      setPrizeEdit(null)
      return
    }
    if (diff > 0 && product) {
      const shortage = stockShortage(new Map([[product.id, diff]]), products)
      if (shortage) {
        setPrizeError(`Estoque insuficiente para aumentar: ${shortage}.`)
        return
      }
    }
    setBusy(true)
    const { error } = await supabase.from('raffle_items').update({ quantity: roundQuantity(qty) }).eq('id', item.id)
    setBusy(false)
    if (error) {
      console.error('raffle_items update', error)
      setPrizeError(saveError(error, 'Não foi possível salvar o prêmio. Confira o estoque e tente de novo.'))
      load()
      return
    }
    setPrizeEdit(null)
    after(
      diff > 0
        ? `${item.description}: mais ${formatQuantity(diff)} saiu do estoque.`
        : `${item.description}: ${formatQuantity(-diff)} voltou ao estoque.`,
    )
  }

  async function handlePrizeDelete() {
    if (!prizeToDelete) return
    const item = prizeToDelete
    const { error } = await supabase.from('raffle_items').delete().eq('id', item.id)
    setPrizeToDelete(null)
    if (error) {
      console.error('raffle_items delete', error)
      setPageError(saveError(error, 'Não foi possível excluir o prêmio.'))
      load()
      return
    }
    after(`${item.description} saiu da rifa e voltou ao estoque.`)
  }

  function openTicketNew() {
    setTicketEdit({ sale: null, date: format(new Date(), 'yyyy-MM-dd'), quantity: '' })
    setTicketError(null)
  }

  function openTicketEdit(sale: RaffleTicketSale) {
    setTicketEdit({ sale, date: sale.sale_date, quantity: String(sale.quantity) })
    setTicketError(null)
  }

  async function handleTicketSave() {
    if (!ticketEdit) return
    const qty = parseDecimal(ticketEdit.quantity)
    if (!ticketEdit.date) {
      setTicketError('Informe o dia.')
      return
    }
    if (Number.isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      setTicketError('Informe quantas cotas foram vendidas (número inteiro maior que zero).')
      return
    }
    const others = sold - (ticketEdit.sale ? Number(ticketEdit.sale.quantity) : 0)
    const total = Number(current.total_tickets)
    if (others + qty > total) {
      setTicketError(`A rifa tem ${total} cotas e ${others} já estão registradas: cabem mais ${total - others}.`)
      return
    }
    const sameDay = current.raffle_ticket_sales.find((s) => s.sale_date === ticketEdit.date && s.id !== ticketEdit.sale?.id)
    if (sameDay) {
      setTicketError(`${formatDay(ticketEdit.date)} já tem ${sameDay.quantity} cotas. Para corrigir esse dia, use o lápis na lista.`)
      return
    }
    setBusy(true)
    const { error } = ticketEdit.sale
      ? await supabase.from('raffle_ticket_sales').update({ quantity: qty }).eq('id', ticketEdit.sale.id)
      : await supabase
          .from('raffle_ticket_sales')
          .insert({ raffle_id: current.id, sale_date: ticketEdit.date, quantity: qty, created_by: profile?.id ?? null })
    setBusy(false)
    if (error) {
      console.error('raffle_ticket_sales save', error)
      setTicketError(
        error.code === '23505'
          ? `${formatDay(ticketEdit.date)} já tem cotas registradas. Para corrigir esse dia, use o lápis na lista.`
          : saveError(error, 'Não foi possível registrar as cotas.'),
      )
      load()
      return
    }
    setTicketEdit(null)
    after(
      ticketEdit.sale
        ? `Cotas de ${formatDay(ticketEdit.date)} corrigidas para ${qty}.`
        : `${qty} ${qty === 1 ? 'cota registrada' : 'cotas registradas'} em ${formatDay(ticketEdit.date)}.`,
    )
  }

  async function handleTicketDelete() {
    if (!saleToDelete) return
    const sale = saleToDelete
    const { error } = await supabase.from('raffle_ticket_sales').delete().eq('id', sale.id)
    setSaleToDelete(null)
    if (error) {
      console.error('raffle_ticket_sales delete', error)
      setPageError(saveError(error, 'Não foi possível excluir as cotas do dia.'))
      load()
      return
    }
    after(`Cotas de ${formatDay(sale.sale_date)} excluídas.`)
  }

  function openClose() {
    // o recebido costuma ser o que as cotas renderam; dá para corrigir
    setAmount(withTickets ? toMoneyInput(collected(current)) : '')
    setCloseError(null)
    setCloseOpen(true)
  }

  async function handleClose() {
    const received = parseDecimal(amount)
    if (Number.isNaN(received) || received < 0) {
      setCloseError('Informe o valor recebido com a rifa (pode ser 0).')
      return
    }
    if (received > MAX_AMOUNT) {
      setCloseError(`Valor alto demais. O máximo é ${formatCurrency(MAX_AMOUNT)}.`)
      return
    }
    setBusy(true)
    // só muda rifa que ainda está aberta: outra tela pode ter encerrado ou cancelado
    const { data, error } = await supabase
      .from('raffles')
      .update({ status: 'encerrada', amount_received: roundMoney(received), closed_at: new Date().toISOString() })
      .eq('id', current.id)
      .eq('status', 'aberta')
      .select('id')
    setBusy(false)
    if (error) {
      console.error('raffles close', error)
      setCloseError(saveError(error, 'Não foi possível encerrar a rifa.'))
      return
    }
    setCloseOpen(false)
    if (!data || data.length === 0) {
      setPageError(STALE_MESSAGE)
      load()
      return
    }
    after(`Rifa "${current.name}" encerrada com ${formatCurrency(roundMoney(received))}.`)
  }

  async function handleCancel() {
    const { data, error } = await supabase
      .from('raffles')
      .update({ status: 'cancelada', closed_at: new Date().toISOString() })
      .eq('id', current.id)
      .eq('status', 'aberta')
      .select('id')
    setCancelOpen(false)
    if (error) {
      console.error('raffles cancel', error)
      setPageError(saveError(error, 'Não foi possível cancelar a rifa.'))
      return
    }
    if (!data || data.length === 0) {
      setPageError(STALE_MESSAGE)
      load()
      return
    }
    after(`Rifa "${current.name}" cancelada. Os prêmios voltaram ao estoque.`)
  }

  // ---------------------------------------------------------------- números
  const value = raffleValue(current)
  const estimated = estimatedProfit(current)
  const gain = gainPercent(current)
  const margin = marginPercent(current)
  const cotasProfit = soldProfit(current)
  const perTicketProfit = profitPerTicket(current)
  const breakEven = breakEvenTickets(current)
  const total = Number(current.total_tickets ?? 0)
  const pct = withTickets && total > 0 ? Math.round((sold / total) * 100) : 0
  const remaining = total - sold
  const result = finalResult(current)
  const chartData = [...sales]
    .reverse()
    .map((s) => ({ label: formatDay(s.sale_date).slice(0, 5), cotas: Number(s.quantity) }))
  const avgPerDay = sales.length > 0 ? sold / sales.length : 0
  const closePreview = parseDecimal(amount)
  const meta = [
    `Criada em ${format(new Date(current.created_at), 'dd/MM/yyyy')}`,
    closedLabel(current)?.toLowerCase() ?? (current.draw_date ? `sorteio em ${formatDay(current.draw_date)}` : null),
    current.notes,
  ].filter(Boolean)

  // prêmio em edição: o efeito no estoque e no lucro, antes de salvar
  const editQty = prizeEdit ? parseDecimal(prizeEdit.quantity) : NaN
  const editDiff = prizeEdit && !Number.isNaN(editQty) ? roundQuantity(editQty - Number(prizeEdit.item.quantity)) : 0
  const editProduct = prizeEdit ? products.find((p) => p.id === prizeEdit.item.product_id) : undefined
  const editNewCost = prizeEdit && !Number.isNaN(editQty) ? roundMoney(cost + editDiff * Number(prizeEdit.item.cost_price_at_raffle)) : cost

  return (
    <div className="space-y-5">
      <Link to="/rifas" className="inline-flex min-h-11 items-center text-sm font-extrabold text-[#52607a] hover:text-[#b0175f]">
        ← Voltar para as rifas
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-3xl leading-tight font-extrabold break-words text-[#0e2240]">{current.name}</h1>
            <Badge tone={STATUS_TONE[current.status]}>{STATUS_LABEL[current.status]}</Badge>
          </div>
          <p className="text-sm font-semibold text-[#52607a]">{meta.join(' · ')}</p>
        </div>
        {isOpen && (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="secondary" onClick={openEdit}>
              <Pencil size={16} /> Editar rifa
            </Button>
            <Button onClick={openClose}>Encerrar</Button>
            <Button variant="danger-ghost" className="col-span-2 sm:col-span-1" onClick={() => setCancelOpen(true)}>
              Cancelar rifa
            </Button>
          </div>
        )}
      </header>

      {pageError && <p className="text-sm font-bold text-[#a12424]">{pageError}</p>}

      {/* números da rifa */}
      {current.status === 'encerrada' ? (
        <section aria-label="Resultado" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Recebido" value={formatCurrency(Number(current.amount_received ?? 0))} />
          <StatTile label="Custo dos prêmios" value={formatCurrency(cost)} />
          <StatTile
            label="Resultado"
            value={formatCurrency(result ?? 0)}
            tone={(result ?? 0) < 0 ? 'critical' : 'good'}
            hint="recebido menos o custo"
          />
          <StatTile
            label="Cotas vendidas"
            value={withTickets ? `${sold} de ${total}` : '—'}
            hint={withTickets ? `${pct}% · arrecadado ${formatCurrency(collected(current))}` : undefined}
          />
        </section>
      ) : current.status === 'cancelada' ? (
        <Card>
          <p className="text-sm font-semibold text-[#52607a]">Rifa cancelada: os prêmios voltaram ao estoque e ela não entra nos totais nem no Dashboard.</p>
        </Card>
      ) : withTickets ? (
        <section aria-label="Números da rifa" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile label="Valor da rifa" value={formatCurrency(value ?? 0)} hint={`${total} cotas × ${formatCurrency(Number(current.ticket_price))}`} />
          <StatTile label="Arrecadado até agora" value={formatCurrency(collected(current))} hint={`${sold} ${sold === 1 ? 'cota vendida' : 'cotas vendidas'}`} />
          <StatTile label="Custo dos prêmios" value={formatCurrency(cost)} hint={`${items.length} ${items.length === 1 ? 'prêmio' : 'prêmios'}, preço de custo`} />
          <StatTile
            label="Lucro estimado"
            value={formatCurrency(estimated ?? 0)}
            tone={(estimated ?? 0) < 0 ? 'critical' : 'good'}
            hint={`vendendo as ${total} cotas${margin === null ? '' : ` · margem ${formatPercent(margin)}`}`}
          />
          <StatTile
            label="% de ganho"
            value={gain === null ? '—' : formatPercent(gain)}
            tone={gain === null ? 'neutral' : gain < 0 ? 'critical' : 'good'}
            hint="lucro estimado sobre o custo"
          />
          <StatTile
            label="Lucro das cotas vendidas"
            value={formatCurrency(cotasProfit ?? 0)}
            tone={(cotasProfit ?? 0) < 0 ? 'critical' : 'good'}
            hint={`${sold} × ${formatCurrency(perTicketProfit ?? 0)} · é o que entra no Dashboard`}
          />
        </section>
      ) : (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-extrabold text-[#0e2240]">Custo dos prêmios: {formatCurrency(cost)}</p>
              <p className="text-sm font-semibold text-[#52607a]">
                Defina o valor e o total de cotas para ver o lucro e registrar as cotas vendidas por dia.
              </p>
            </div>
            <Button onClick={openEdit}>Definir cotas</Button>
          </div>
        </Card>
      )}

      {withTickets && current.status !== 'cancelada' && (
        <Card>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-extrabold text-[#0e2240]">
              {sold} de {total} cotas vendidas · {pct}%
            </p>
            <p className="text-sm font-bold text-[#52607a]">
              {remaining > 0 ? `faltam ${remaining} ${remaining === 1 ? 'cota' : 'cotas'} (${formatCurrency(remaining * Number(current.ticket_price))})` : 'todas vendidas'}
              {isOpen && ` · se encerrar hoje, o resultado é ${formatCurrency(roundMoney(collected(current) - cost))}`}
            </p>
          </div>
          <div className="relative h-3.5 overflow-hidden rounded-full bg-[#d5e3f0]">
            <div
              className={current.status === 'encerrada' ? 'h-full rounded-full bg-[#0a6b34]' : 'h-full rounded-full bg-[#d6247a]'}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          {breakEven !== null && breakEven > 0 && breakEven <= total && (
            <div className="relative mt-1 h-5 text-[11px] font-extrabold text-[#52607a]">
              <span
                className="absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${Math.min(Math.max((breakEven / total) * 100, 12), 88)}%` }}
              >
                ▲ prêmios pagos com {breakEven} {breakEven === 1 ? 'cota' : 'cotas'}
              </span>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        {/* prêmios */}
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-[22px] font-extrabold text-[#0e2240]">Prêmios</h2>
            {isOpen && (
              <Button size="sm" variant="secondary" onClick={openAddPrize}>
                <Plus size={16} /> Adicionar prêmio
              </Button>
            )}
          </div>
          <ul className="divide-y divide-[#eef2f7]">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold break-words text-[#0e2240]">{item.description}</p>
                  <p className="text-xs font-semibold text-[#52607a]">
                    {formatQuantity(Number(item.quantity))} × {formatCurrency(Number(item.cost_price_at_raffle))} ={' '}
                    {formatCurrency(roundMoney(Number(item.quantity) * Number(item.cost_price_at_raffle)))}
                  </p>
                </div>
                {isOpen && (
                  <>
                    <IconButton aria-label={`Editar ${item.description}`} onClick={() => openPrizeEdit(item)}>
                      <Pencil size={17} />
                    </IconButton>
                    <IconButton tone="danger" aria-label={`Excluir ${item.description}`} onClick={() => setPrizeToDelete(item)}>
                      <Trash2 size={17} />
                    </IconButton>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t-2 border-[#d5e3f0] pt-3 font-extrabold text-[#0e2240]">
            <span>Total</span>
            <span>{formatCurrency(cost)}</span>
          </p>
          {isOpen && (
            <p className="mt-2 text-xs font-semibold text-[#52607a]">
              Mudar a quantidade ajusta o estoque: aumentar tira, diminuir ou excluir devolve.
            </p>
          )}
        </Card>

        {/* cotas por dia */}
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[22px] font-extrabold text-[#0e2240]">Cotas vendidas por dia</h2>
            {isOpen && withTickets && remaining > 0 && (
              <Button size="sm" onClick={openTicketNew} className="w-full whitespace-nowrap sm:w-auto">
                <Plus size={16} /> Registrar cotas
              </Button>
            )}
          </div>
          {!withTickets ? (
            <p className="text-sm font-semibold text-[#52607a]">Defina o valor e o total de cotas em Editar rifa para registrar as vendas.</p>
          ) : sales.length === 0 ? (
            <p className="text-sm font-semibold text-[#52607a]">Nenhuma cota registrada ainda.</p>
          ) : (
            <>
              <div style={{ width: '100%', height: 170 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#d5e3f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#52607a', fontWeight: 700 }} axisLine={{ stroke: '#8796ae' }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#52607a', fontWeight: 700 }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip
                      formatter={(v) => [`${v} cotas`, 'Vendidas']}
                      labelFormatter={(label) => `Dia ${label}`}
                      contentStyle={{ borderRadius: 16, border: '2px solid #d5e3f0', fontSize: 13, fontWeight: 700 }}
                    />
                    <Bar dataKey="cotas" fill="#d6247a" radius={[8, 8, 3, 3]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 divide-y divide-[#eef2f7]">
                {sales.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-2">
                    <p className="min-w-0 flex-1 text-sm text-[#0e2240]">
                      <strong>{formatDay(s.sale_date)}</strong> · {s.quantity} {Number(s.quantity) === 1 ? 'cota' : 'cotas'} ·{' '}
                      {formatCurrency(roundMoney(Number(s.quantity) * Number(current.ticket_price)))}
                    </p>
                    {isOpen && (
                      <>
                        <IconButton aria-label={`Editar cotas de ${formatDay(s.sale_date)}`} onClick={() => openTicketEdit(s)}>
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton tone="danger" aria-label={`Excluir cotas de ${formatDay(s.sale_date)}`} onClick={() => setSaleToDelete(s)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t-2 border-[#d5e3f0] pt-3 font-extrabold text-[#0e2240]">
                <span>Total · {sold} cotas</span>
                <span>{formatCurrency(collected(current))}</span>
              </p>
              {isOpen && remaining > 0 && avgPerDay > 0 && (
                <p className="mt-2 text-xs font-semibold text-[#52607a]">
                  Média de {avgPerDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cotas por dia
                  {` · nesse ritmo, as ${remaining} que faltam saem em cerca de ${Math.ceil(remaining / avgPerDay)} ${Math.ceil(remaining / avgPerDay) === 1 ? 'dia' : 'dias'}`}.
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------------ modais */}
      <Modal open={editOpen} onClose={busy ? () => {} : () => setEditOpen(false)} title="Editar rifa" wide>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${fieldId}-name`}>Nome da rifa</Label>
            <Input id={`${fieldId}-name`} value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${fieldId}-notes`}>Observação (opcional)</Label>
              <Input id={`${fieldId}-notes`} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-draw`}>Data do sorteio (opcional)</Label>
              <Input id={`${fieldId}-draw`} type="date" value={editDraw} onChange={(e) => setEditDraw(e.target.value)} />
            </div>
          </div>
          <TicketFields idPrefix={`${fieldId}-edit`} draft={editTickets} onChange={setEditTickets} prizeCostValue={cost} minTickets={sold} />
          {editError && <p className="text-sm font-bold text-[#a12424]">{editError}</p>}
          <Button className="w-full" onClick={handleEdit} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={busy ? () => {} : () => setAddOpen(false)} title="Adicionar prêmio">
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${fieldId}-add-product`}>Produto</Label>
            <Select id={`${fieldId}-add-product`} value={addProduct} onChange={(e) => setAddProduct(e.target.value)}>
              <option value="">Selecione…</option>
              {products.map((p) => {
                const inRaffle = current.raffle_items.some((i) => i.product_id === p.id)
                const empty = Number(p.stock_quantity) <= 0
                return (
                  <option key={p.id} value={p.id} disabled={inRaffle || empty}>
                    {p.name} ({inRaffle ? 'já é prêmio: use o lápis' : empty ? 'sem estoque' : `${formatQuantity(Number(p.stock_quantity))} ${p.unit}`})
                  </option>
                )
              })}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${fieldId}-add-qty`}>Quantidade</Label>
            <DecimalInput
              id={`${fieldId}-add-qty`}
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              inputMode={isWholeUnit(products.find((p) => p.id === addProduct)?.unit ?? '') ? 'numeric' : 'decimal'}
            />
          </div>
          {addError && <p className="text-sm font-bold text-[#a12424]">{addError}</p>}
          <Button className="w-full" onClick={handleAddPrize} disabled={busy}>
            {busy ? 'Adicionando…' : 'Adicionar e tirar do estoque'}
          </Button>
        </div>
      </Modal>

      <Modal open={prizeEdit !== null} onClose={busy ? () => {} : () => setPrizeEdit(null)} title="Editar prêmio">
        {prizeEdit && (
          <div className="space-y-4">
            <p className="font-extrabold text-[#0e2240]">{prizeEdit.item.description}</p>
            <div>
              <Label htmlFor={`${fieldId}-prize-qty`}>Quantidade</Label>
              <div className="flex items-center gap-2">
                <IconButton
                  tone="neutral"
                  aria-label="Diminuir"
                  className="bg-[#eef2f7]"
                  onClick={() => {
                    const next = Math.max(toNumber(prizeEdit.quantity) - 1, 0)
                    setPrizeEdit({ ...prizeEdit, quantity: toQuantityInput(next) })
                  }}
                >
                  <Minus size={18} />
                </IconButton>
                <div className="w-24">
                  <DecimalInput
                    id={`${fieldId}-prize-qty`}
                    className="text-center"
                    value={prizeEdit.quantity}
                    onChange={(e) => setPrizeEdit({ ...prizeEdit, quantity: e.target.value })}
                    inputMode={isWholeUnit(editProduct?.unit ?? '') ? 'numeric' : 'decimal'}
                  />
                </div>
                <IconButton
                  tone="neutral"
                  aria-label="Aumentar"
                  className="bg-[#eef2f7]"
                  onClick={() => setPrizeEdit({ ...prizeEdit, quantity: toQuantityInput(toNumber(prizeEdit.quantity) + 1) })}
                >
                  <Plus size={18} />
                </IconButton>
              </div>
              <p className="mt-1.5 text-xs font-semibold text-[#52607a]">
                Antes: {formatQuantity(Number(prizeEdit.item.quantity))} nesta rifa
                {editProduct && ` · no estoque agora: ${formatQuantity(Number(editProduct.stock_quantity))} ${editProduct.unit}`}
              </p>
            </div>
            {editDiff !== 0 && !Number.isNaN(editQty) && editQty > 0 && (
              <div className="rounded-2xl bg-[#fff1c7] px-4 py-3 text-sm font-bold text-[#7a5200]">
                <p>
                  {editDiff > 0
                    ? `Tira mais ${formatQuantity(editDiff)} do estoque.`
                    : `Devolve ${formatQuantity(-editDiff)} ao estoque.`}
                </p>
                <p>
                  Custo dos prêmios: {formatCurrency(cost)} → {formatCurrency(editNewCost)}
                </p>
                {value !== null && (
                  <p>
                    Lucro estimado: {formatCurrency(estimated ?? 0)} → {formatCurrency(roundMoney(value - editNewCost))}
                  </p>
                )}
              </div>
            )}
            {prizeError && <p className="text-sm font-bold text-[#a12424]">{prizeError}</p>}
            <Button className="w-full" onClick={handlePrizeEdit} disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar prêmio'}
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={prizeToDelete !== null}
        title="Excluir prêmio"
        message={
          prizeToDelete && items.length <= 1 ? (
            'A rifa precisa ficar com pelo menos 1 prêmio. Para tirar todos, cancele a rifa.'
          ) : prizeToDelete ? (
            <>
              <p>
                Tirar <strong>{formatQuantity(Number(prizeToDelete.quantity))}× {prizeToDelete.description}</strong> da rifa? Volta ao
                estoque.
              </p>
              <p className="mt-2">
                Custo dos prêmios: {formatCurrency(cost)} →{' '}
                {formatCurrency(roundMoney(cost - Number(prizeToDelete.quantity) * Number(prizeToDelete.cost_price_at_raffle)))}
              </p>
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Excluir prêmio"
        cancelLabel="Voltar"
        onConfirm={items.length <= 1 ? () => setPrizeToDelete(null) : handlePrizeDelete}
        onClose={() => setPrizeToDelete(null)}
      />

      <Modal
        open={ticketEdit !== null}
        onClose={busy ? () => {} : () => setTicketEdit(null)}
        title={ticketEdit?.sale ? 'Corrigir cotas do dia' : 'Registrar cotas vendidas'}
      >
        {ticketEdit && (
          <div className="space-y-4">
            <div>
              <Label htmlFor={`${fieldId}-ticket-day`}>Dia</Label>
              <Input
                id={`${fieldId}-ticket-day`}
                type="date"
                value={ticketEdit.date}
                max={format(new Date(), 'yyyy-MM-dd')}
                disabled={ticketEdit.sale !== null}
                onChange={(e) => setTicketEdit({ ...ticketEdit, date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-ticket-qty`}>Cotas vendidas no dia</Label>
              <DecimalInput
                id={`${fieldId}-ticket-qty`}
                inputMode="numeric"
                value={ticketEdit.quantity}
                onChange={(e) => setTicketEdit({ ...ticketEdit, quantity: e.target.value })}
                placeholder="0"
              />
            </div>
            {(() => {
              const qty = parseDecimal(ticketEdit.quantity)
              if (Number.isNaN(qty) || qty <= 0) return null
              const after = sold - (ticketEdit.sale ? Number(ticketEdit.sale.quantity) : 0) + qty
              return (
                <div className="rounded-2xl bg-[#eaf6ff] px-4 py-3 text-sm">
                  <p className="font-extrabold text-[#0e2240]">
                    {qty} × {formatCurrency(Number(current.ticket_price))} = {formatCurrency(roundMoney(qty * Number(current.ticket_price)))}
                  </p>
                  <p className="font-semibold text-[#52607a]">
                    A rifa passa para {after} de {total} cotas ({Math.round((after / total) * 100)}%).
                  </p>
                </div>
              )
            })()}
            <p className="text-xs font-semibold text-[#52607a]">
              Um registro por dia. O valor entra no Dashboard como dinheiro e lucro desse dia.
            </p>
            {ticketError && <p className="text-sm font-bold text-[#a12424]">{ticketError}</p>}
            <Button className="w-full" onClick={handleTicketSave} disabled={busy}>
              {busy ? 'Salvando…' : ticketEdit.sale ? 'Salvar' : 'Registrar'}
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={saleToDelete !== null}
        title="Excluir cotas do dia"
        message={
          saleToDelete
            ? `Excluir as ${saleToDelete.quantity} cotas de ${formatDay(saleToDelete.sale_date)}? O valor sai do Dashboard desse dia.`
            : ''
        }
        confirmLabel="Excluir"
        cancelLabel="Voltar"
        onConfirm={handleTicketDelete}
        onClose={() => setSaleToDelete(null)}
      />

      <Modal open={closeOpen} onClose={busy ? () => {} : () => setCloseOpen(false)} title="Encerrar rifa">
        <div className="space-y-4">
          <div className="text-sm font-semibold text-[#52607a]">
            <p className="font-extrabold text-[#0e2240]">{current.name}</p>
            <p>{prizeSummary(current)}</p>
            <p className="mt-1">Custo dos prêmios: {formatCurrency(cost)}</p>
            {withTickets && (
              <p>
                Cotas vendidas: {sold} de {total} · arrecadado {formatCurrency(collected(current))}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor={`${fieldId}-amount`}>Valor recebido com a rifa (R$)</Label>
            <DecimalInput id={`${fieldId}-amount`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          {!Number.isNaN(closePreview) && closePreview >= 0 && (
            <p className="text-sm font-bold text-[#0e2240]">Resultado: {formatCurrency(roundMoney(closePreview - cost))}</p>
          )}
          {withTickets && remaining > 0 && (
            <p className="text-xs font-semibold text-[#52607a]">
              O custo das {remaining} cotas não vendidas ({formatCurrency(roundMoney(remaining * (costPerTicket(current) ?? 0)))}) entra no lucro de
              hoje no Dashboard.
            </p>
          )}
          <p className="text-xs font-semibold text-[#52607a]">Os prêmios continuam fora do estoque (foram para o ganhador). Esse valor não entra no caixa.</p>
          {closeError && <p className="text-sm font-bold text-[#a12424]">{closeError}</p>}
          <Button className="w-full" onClick={handleClose} disabled={busy}>
            {busy ? 'Encerrando…' : 'Encerrar rifa'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancelar rifa"
        message={
          <>
            Cancelar <strong>{current.name}</strong>? Os prêmios ({prizeSummary(current)}) voltam para o estoque
            {sold > 0 && ` e as ${sold} cotas registradas saem do Dashboard`}.
          </>
        }
        confirmLabel="Cancelar rifa"
        cancelLabel="Voltar"
        onConfirm={handleCancel}
        onClose={() => setCancelOpen(false)}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function toNumber(text: string): number {
  const value = parseDecimal(text)
  return Number.isNaN(value) ? 0 : value
}
