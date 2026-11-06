import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Download, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { downloadCsv } from '../../lib/csv'
import { failureMessage } from '../../lib/errors'
import { formatQuantity, isWholeUnit, parseDecimal, roundMoney, roundQuantity, wholeUnitMessage } from '../../lib/number'
import {
  collected,
  estimatedProfit,
  finalResult,
  hasTickets,
  prizeCost,
  raffleValue,
  soldTickets,
} from '../../lib/raffles'
import type { Product, RaffleStatus } from '../../types/database'
import {
  Badge,
  Button,
  Card,
  ChoiceButton,
  DecimalInput,
  EmptyState,
  IconButton,
  Input,
  Label,
  Loader,
  Modal,
  PageHeader,
  Select,
  StatTile,
  Toast,
  formatCurrency,
} from '../../components/ui'
import {
  RAFFLE_SELECT,
  STATUS_LABEL,
  STATUS_TONE,
  closedLabel,
  emptyTicketDraft,
  formatDay,
  parseTicketDraft,
  prizeSummary,
  resultClass,
  stockShortage,
  type RaffleFull,
  type TicketDraft,
} from './shared'
import { TicketFields } from './TicketFields'

interface PrizeLine {
  key: number
  productId: string
  quantity: string
}

type Filter = 'todas' | RaffleStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'aberta', label: 'Abertas' },
  { id: 'encerrada', label: 'Encerradas' },
  { id: 'cancelada', label: 'Canceladas' },
]

/**
 * Os três valores de uma linha da lista. Aberta: valor da rifa, arrecadado e
 * lucro estimado; encerrada: valor, recebido e resultado; cancelada: nada,
 * porque não entra nos totais.
 */
function rowFigures(raffle: RaffleFull) {
  if (raffle.status === 'cancelada') return null
  const value = raffleValue(raffle)
  if (raffle.status === 'encerrada') {
    return [
      { label: 'Valor da rifa', value: value === null ? '—' : formatCurrency(value) },
      { label: 'Recebido', value: formatCurrency(Number(raffle.amount_received ?? 0)) },
      { label: 'Resultado', value: formatCurrency(finalResult(raffle) ?? 0), result: finalResult(raffle) ?? 0 },
    ]
  }
  const profit = estimatedProfit(raffle)
  return [
    { label: 'Valor da rifa', value: value === null ? '—' : formatCurrency(value) },
    { label: 'Arrecadado', value: hasTickets(raffle) ? formatCurrency(collected(raffle)) : '—' },
    { label: 'Lucro estimado', value: profit === null ? '—' : formatCurrency(profit), result: profit ?? undefined },
  ]
}

/** "3 prêmios · sorteio em 15/11/2026 · R$ 5,00 a cota" */
function rowMeta(raffle: RaffleFull): string {
  const parts = [`${raffle.raffle_items.length} ${raffle.raffle_items.length === 1 ? 'prêmio' : 'prêmios'}`]
  const closed = closedLabel(raffle)
  if (closed) parts.push(closed.toLowerCase())
  else if (raffle.draw_date) parts.push(`sorteio em ${formatDay(raffle.draw_date)}`)
  if (raffle.ticket_price !== null) parts.push(`${formatCurrency(Number(raffle.ticket_price))} a cota`)
  return parts.join(' · ')
}

function TicketProgress({ raffle }: { raffle: RaffleFull }) {
  if (raffle.status === 'cancelada') return <span className="text-sm text-[#52607a]">Prêmios devolvidos ao estoque</span>
  if (!hasTickets(raffle)) return <span className="text-sm font-semibold text-[#52607a]">Sem cotas definidas</span>
  const sold = soldTickets(raffle)
  const total = Number(raffle.total_tickets)
  const pct = Math.round((sold / total) * 100)
  return (
    <span className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-[#0e2240]">
        {sold} de {total} · {pct}%
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-[#d5e3f0]">
        <span
          className={raffle.status === 'encerrada' ? 'block h-full bg-[#0a6b34]' : 'block h-full bg-[#d6247a]'}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </span>
    </span>
  )
}

/**
 * Rifas com produtos do estoque. O sorteio fica no outro sistema de rifa; aqui
 * ficam os prêmios (que saem do estoque ao criar a rifa), o valor e o total de
 * cotas, as cotas vendidas por dia e o resultado. Cada rifa abre em
 * /rifas/:id (RifaDetalhe). Ver as migrações 0004 e 0006.
 */
export function Rifas() {
  const { profile } = useAuth()
  const fieldId = useId()
  const [raffles, setRaffles] = useState<RaffleFull[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [drawDate, setDrawDate] = useState('')
  const [tickets, setTickets] = useState<TicketDraft>(emptyTicketDraft())
  const [lines, setLines] = useState<PrizeLine[]>([])
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nextKey = useRef(0)

  const [filter, setFilter] = useState<Filter>('todas')
  const [toast, setToast] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: rf, error: rfError }, { data: prod }] = await Promise.all([
      supabase.from('raffles').select(RAFFLE_SELECT).order('created_at', { ascending: false }),
      supabase.from('products').select('*').eq('active', true).order('name'),
    ])
    if (rfError) {
      console.error('raffles select', rfError)
      setListError(failureMessage(rfError, 'Não foi possível carregar as rifas.'))
    }
    setRaffles((rf as unknown as RaffleFull[]) ?? [])
    setProducts((prod as Product[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function newLine(): PrizeLine {
    nextKey.current += 1
    return { key: nextKey.current, productId: '', quantity: '1' }
  }

  function openCreate() {
    setName('')
    setNotes('')
    setDrawDate('')
    setTickets(emptyTicketDraft())
    setLines([newLine()])
    setCreateError(null)
    setCreateOpen(true)
  }

  function updateLine(key: number, patch: Partial<PrizeLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  // custo dos prêmios escolhidos até agora, para o cálculo ao vivo das cotas
  const draftPrizeCost = roundMoney(
    lines.reduce((sum, l) => {
      const product = products.find((p) => p.id === l.productId)
      const qty = parseDecimal(l.quantity)
      return product && !Number.isNaN(qty) && qty > 0 ? sum + qty * Number(product.cost_price) : sum
    }, 0),
  )

  async function handleCreate() {
    if (!name.trim()) {
      setCreateError('Dê um nome para a rifa.')
      return
    }
    const filled = lines.filter((l) => l.productId)
    if (filled.length === 0) {
      setCreateError('Escolha pelo menos um produto como prêmio.')
      return
    }
    // o mesmo produto em duas linhas vira uma só, para conferir o estoque somado
    const byProduct = new Map<string, number>()
    for (const l of filled) {
      const qty = parseDecimal(l.quantity)
      if (Number.isNaN(qty) || qty <= 0) {
        setCreateError('A quantidade de cada prêmio deve ser maior que zero.')
        return
      }
      const product = products.find((p) => p.id === l.productId)
      if (product && isWholeUnit(product.unit) && !Number.isInteger(qty)) {
        setCreateError(wholeUnitMessage(product.name, product.unit))
        return
      }
      byProduct.set(l.productId, roundQuantity((byProduct.get(l.productId) ?? 0) + qty))
    }
    const parsedTickets = parseTicketDraft(tickets)
    if ('error' in parsedTickets) {
      setCreateError(parsedTickets.error)
      return
    }
    // o check do banco recusaria a rifa inteira com um erro sem explicação
    const shortage = stockShortage(byProduct, products)
    if (shortage) {
      setCreateError(`Estoque insuficiente: ${shortage}.`)
      return
    }

    setSaving(true)
    setCreateError(null)
    const { data: raffle, error: raffleError } = await supabase
      .from('raffles')
      .insert({
        name: name.trim(),
        notes: notes.trim() || null,
        draw_date: drawDate || null,
        ticket_price: parsedTickets.ticket_price,
        total_tickets: parsedTickets.total_tickets,
        created_by: profile?.id ?? null,
      })
      .select()
      .single()

    if (raffleError || !raffle) {
      console.error('raffles insert', raffleError)
      setCreateError(failureMessage(raffleError, 'Não foi possível criar a rifa.'))
      setSaving(false)
      return
    }

    const itemsPayload = Array.from(byProduct, ([productId, qty]) => {
      const product = products.find((p) => p.id === productId)
      return {
        raffle_id: raffle.id,
        product_id: productId,
        description: product?.name ?? '',
        quantity: qty,
        cost_price_at_raffle: roundMoney(Number(product?.cost_price ?? 0)),
        sale_price_at_raffle: roundMoney(Number(product?.sale_price ?? 0)),
      }
    })
    // um insert só: se um prêmio não tiver estoque, nenhum sai do estoque
    const { error: itemsError } = await supabase.from('raffle_items').insert(itemsPayload)

    if (itemsError) {
      console.error('raffle_items insert', itemsError)
      // desfaz a rifa para não sobrar uma rifa sem prêmios
      await supabase.from('raffles').delete().eq('id', raffle.id)
      // o estoque pode ter mudado em outra tela depois que a lista carregou:
      // relê para dizer qual produto faltou em vez de um erro genérico
      const { data: fresh } = await supabase.from('products').select('*').eq('active', true).order('name')
      const freshProducts = (fresh as Product[] | null) ?? []
      if (freshProducts.length > 0) setProducts(freshProducts)
      const freshShortage = stockShortage(byProduct, freshProducts)
      setCreateError(
        freshShortage
          ? `Estoque insuficiente: ${freshShortage}. O estoque mudou enquanto a rifa era criada; nada foi gravado.`
          : failureMessage(itemsError, 'Não foi possível reservar os prêmios. Nada foi gravado; confira o estoque e tente de novo.'),
      )
      setSaving(false)
      return
    }

    setSaving(false)
    setCreateOpen(false)
    setToast(`Rifa "${raffle.name}" criada. Os prêmios saíram do estoque.`)
    load()
  }

  const open = raffles.filter((r) => r.status === 'aberta')
  const closed = raffles.filter((r) => r.status === 'encerrada')
  const reservedCost = roundMoney(open.reduce((sum, r) => sum + prizeCost(r), 0))
  const openCollected = roundMoney(open.reduce((sum, r) => sum + collected(r), 0))
  const openSold = open.reduce((sum, r) => sum + soldTickets(r), 0)
  const openEstimated = roundMoney(open.reduce((sum, r) => sum + (estimatedProfit(r) ?? 0), 0))
  const totalReceived = roundMoney(closed.reduce((sum, r) => sum + Number(r.amount_received ?? 0), 0))
  const closedCost = roundMoney(closed.reduce((sum, r) => sum + prizeCost(r), 0))
  const result = roundMoney(totalReceived - closedCost)

  const visible = filter === 'todas' ? raffles : raffles.filter((r) => r.status === filter)

  function exportCsv() {
    downloadCsv(`rifas-${format(new Date(), 'yyyy-MM-dd')}.csv`, [
      [
        'Criada em',
        'Rifa',
        'Observação',
        'Prêmios',
        'Valor da cota',
        'Total de cotas',
        'Cotas vendidas',
        'Valor da rifa',
        'Arrecadado',
        'Custo',
        'Recebido',
        'Resultado',
        'Status',
        'Sorteio',
        'Encerrada/cancelada em',
      ],
      ...visible.map((r) => {
        const cancelled = r.status === 'cancelada'
        return [
          format(new Date(r.created_at), 'dd/MM/yyyy'),
          r.name,
          r.notes ?? '',
          prizeSummary(r),
          r.ticket_price === null ? '' : Number(r.ticket_price),
          r.total_tickets ?? '',
          hasTickets(r) ? soldTickets(r) : '',
          raffleValue(r) ?? '',
          hasTickets(r) && !cancelled ? collected(r) : '',
          cancelled ? '' : prizeCost(r),
          r.status === 'encerrada' ? Number(r.amount_received ?? 0) : '',
          finalResult(r) ?? '',
          STATUS_LABEL[r.status],
          r.draw_date ? formatDay(r.draw_date) : '',
          r.closed_at ? format(new Date(r.closed_at), 'dd/MM/yyyy') : '',
        ]
      }),
    ])
  }

  return (
    <div>
      <PageHeader
        title="Rifas"
        subtitle="Prêmios, cotas vendidas e lucro de cada rifa. Toque numa rifa para ver os prêmios e as cotas por dia."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Rifas abertas" value={String(open.length)} hint={`${formatCurrency(reservedCost)} em prêmios reservados`} />
        <StatTile label="Arrecadado nas abertas" value={formatCurrency(openCollected)} hint={`${openSold} cotas vendidas`} />
        <StatTile
          label="Lucro estimado das abertas"
          value={formatCurrency(openEstimated)}
          tone={openEstimated < 0 ? 'critical' : 'good'}
          hint="se vender todas as cotas"
        />
        <StatTile
          label="Resultado das encerradas"
          value={formatCurrency(result)}
          tone={result > 0 ? 'good' : result < 0 ? 'critical' : 'neutral'}
          hint={`recebido ${formatCurrency(totalReceived)} − custo ${formatCurrency(closedCost)}`}
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-neutral-900">Rifas</h3>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button size="sm" variant="secondary" onClick={exportCsv} disabled={visible.length === 0}>
              <Download size={16} /> Exportar CSV
            </Button>
            {/* sem os produtos carregados o modal abria com a lista de prêmios vazia */}
            <Button size="sm" onClick={openCreate} disabled={loading}>
              <Plus size={16} /> Nova rifa
            </Button>
          </div>
        </div>

        <div role="group" aria-label="Filtrar por status" className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const count = f.id === 'todas' ? raffles.length : raffles.filter((r) => r.status === f.id).length
            return (
              <ChoiceButton key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)} className="min-h-11 px-4 text-sm">
                {f.label} ({count})
              </ChoiceButton>
            )
          })}
        </div>

        {listError && <p className="mb-3 text-sm font-bold text-[#a12424]">{listError}</p>}

        {loading ? (
          <Loader />
        ) : raffles.length === 0 ? (
          <EmptyState message="Nenhuma rifa cadastrada ainda." />
        ) : visible.length === 0 ? (
          <EmptyState message="Nenhuma rifa com esse status." />
        ) : (
          <ul className="space-y-3">
            {visible.map((r) => {
              const figures = rowFigures(r)
              const cancelled = r.status === 'cancelada'
              return (
                <li key={r.id}>
                  {/* a linha inteira abre a rifa: celular em cartão, computador em colunas */}
                  <Link
                    to={`/rifas/${r.id}`}
                    className="grid gap-3 rounded-2xl border-2 border-[#d5e3f0] p-4 transition-colors hover:border-[#d6247a] hover:bg-[#fdf3f8] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#d6247a] lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_24px] lg:items-center"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex items-start justify-between gap-2 lg:justify-start">
                        <strong className={cancelled ? 'break-words text-[#3b4a66]' : 'break-words text-[#0e2240]'}>{r.name}</strong>
                        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </span>
                      <span className="text-xs font-semibold text-[#52607a]">{rowMeta(r)}</span>
                    </span>
                    <TicketProgress raffle={r} />
                    {figures ? (
                      figures.map((f) => (
                        <span key={f.label} className="flex justify-between gap-2 text-sm lg:block lg:text-right">
                          <span className="text-xs font-semibold text-[#52607a] lg:block">{f.label}</span>
                          <span
                            className={
                              f.result === undefined || f.value === '—' ? 'font-bold text-[#0e2240]' : resultClass(f.result)
                            }
                          >
                            {f.value}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="hidden lg:col-span-3 lg:block" />
                    )}
                    <ChevronRight size={20} aria-hidden="true" className="hidden text-[#52607a] lg:block" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* enquanto grava, Esc e clique fora não fecham: o erro sumiria junto com o modal */}
      <Modal open={createOpen} onClose={saving ? () => {} : () => setCreateOpen(false)} title="Nova rifa" wide>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${fieldId}-name`}>Nome da rifa</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Rifa do Dia das Crianças"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${fieldId}-notes`}>Observação (opcional)</Label>
              <Input
                id={`${fieldId}-notes`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: link ou código no sistema de rifa"
              />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-draw`}>Data do sorteio (opcional)</Label>
              <Input id={`${fieldId}-draw`} type="date" value={drawDate} onChange={(e) => setDrawDate(e.target.value)} />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-extrabold text-[#0e2240]">Prêmios (saem do estoque agora)</p>
            <div className="space-y-2">
              {lines.map((l, index) => (
                <div key={l.key} className="flex items-center gap-2">
                  {/* os campos já vêm com w-full; a largura fica no div em volta */}
                  <div className="min-w-0 flex-1">
                    <Select
                      aria-label={`Produto do prêmio ${index + 1}`}
                      value={l.productId}
                      onChange={(e) => updateLine(l.key, { productId: e.target.value })}
                    >
                      <option value="">Selecione…</option>
                      {products.map((p) => {
                        const empty = Number(p.stock_quantity) <= 0
                        return (
                          <option key={p.id} value={p.id} disabled={empty}>
                            {p.name} ({empty ? 'sem estoque' : `${formatQuantity(Number(p.stock_quantity))} ${p.unit}`})
                          </option>
                        )
                      })}
                    </Select>
                  </div>
                  <div className="w-24 shrink-0">
                    <DecimalInput
                      aria-label={`Quantidade do prêmio ${index + 1}`}
                      value={l.quantity}
                      onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                      // produto contado em un: teclado só com números, sem vírgula
                      inputMode={isWholeUnit(products.find((p) => p.id === l.productId)?.unit ?? '') ? 'numeric' : 'decimal'}
                    />
                  </div>
                  <IconButton
                    tone="danger"
                    aria-label={`Remover prêmio ${index + 1}`}
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    disabled={lines.length === 1}
                  >
                    <Trash2 size={18} />
                  </IconButton>
                </div>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setLines((prev) => [...prev, newLine()])}>
              <Plus size={16} /> Adicionar prêmio
            </Button>
          </div>

          <div className="border-t-2 border-[#eef2f7] pt-4">
            <p className="mb-3 text-xs font-semibold text-[#52607a]">
              Cotas (opcional agora): sem elas a rifa é criada, mas as vendas por dia só podem ser registradas depois de
              definir o valor e o total de cotas em Editar rifa.
            </p>
            <TicketFields idPrefix={`${fieldId}-nova`} draft={tickets} onChange={setTickets} prizeCostValue={draftPrizeCost} />
          </div>

          {createError && <p className="text-sm text-[#d03b3b]">{createError}</p>}
          <Button className="w-full" onClick={handleCreate} disabled={saving}>
            {saving ? 'Criando…' : 'Criar rifa e reservar prêmios'}
          </Button>
        </div>
      </Modal>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
