import { useEffect, useId, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatQuantity, parseDecimal, roundMoney, roundQuantity } from '../../lib/number'
import type { Product, Raffle, RaffleItem, RaffleStatus } from '../../types/database'
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
  PageHeader,
  Select,
  StatTile,
  TableScroll,
  formatCurrency,
} from '../../components/ui'

type RaffleWithItems = Raffle & { raffle_items: RaffleItem[] }

interface PrizeLine {
  key: number
  productId: string
  quantity: string
}

const STATUS_LABEL: Record<RaffleStatus, string> = {
  aberta: 'Aberta',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
}

const STATUS_TONE: Record<RaffleStatus, 'brand' | 'good' | 'neutral'> = {
  aberta: 'brand',
  encerrada: 'good',
  cancelada: 'neutral',
}

/** Custo dos prêmios pelo preço de custo gravado quando a rifa foi criada. */
function prizeCost(raffle: RaffleWithItems): number {
  return roundMoney(raffle.raffle_items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.cost_price_at_raffle), 0))
}

function prizeSummary(raffle: RaffleWithItems): string {
  return raffle.raffle_items.map((i) => `${formatQuantity(Number(i.quantity))}× ${i.description}`).join(', ')
}

/**
 * Rifas com produtos do estoque. A venda dos números e o sorteio ficam no
 * outro sistema de rifa; aqui só entram os prêmios (que saem do estoque ao
 * criar a rifa e voltam se ela for cancelada) e o valor recebido no fim.
 * O dinheiro da rifa não passa pelo caixa. Ver supabase/migrations/0004_rifas.sql.
 */
export function Rifas() {
  const { profile } = useAuth()
  const fieldId = useId()
  const [raffles, setRaffles] = useState<RaffleWithItems[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<PrizeLine[]>([])
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nextKey = useRef(0)

  const [toClose, setToClose] = useState<RaffleWithItems | null>(null)
  const [amount, setAmount] = useState('')
  const [closeError, setCloseError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  const [toCancel, setToCancel] = useState<RaffleWithItems | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: rf, error: rfError }, { data: prod }] = await Promise.all([
      supabase.from('raffles').select('*, raffle_items(*)').order('created_at', { ascending: false }),
      supabase.from('products').select('*').eq('active', true).order('name'),
    ])
    if (rfError) {
      console.error('raffles select', rfError)
      setListError('Não foi possível carregar as rifas.')
    }
    setRaffles((rf as unknown as RaffleWithItems[]) ?? [])
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
    setLines([newLine()])
    setCreateError(null)
    setCreateOpen(true)
  }

  function updateLine(key: number, patch: Partial<PrizeLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

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
      byProduct.set(l.productId, roundQuantity((byProduct.get(l.productId) ?? 0) + qty))
    }
    // o check do banco recusaria a rifa inteira com um erro sem explicação
    for (const [productId, qty] of byProduct) {
      const product = products.find((p) => p.id === productId)
      if (product && Number(product.stock_quantity) < qty) {
        setCreateError(
          `Estoque insuficiente: ${product.name} tem ${formatQuantity(Number(product.stock_quantity))} ${product.unit}.`,
        )
        return
      }
    }

    setSaving(true)
    setCreateError(null)
    const { data: raffle, error: raffleError } = await supabase
      .from('raffles')
      .insert({ name: name.trim(), notes: notes.trim() || null, created_by: profile?.id ?? null })
      .select()
      .single()

    if (raffleError || !raffle) {
      console.error('raffles insert', raffleError)
      setCreateError('Não foi possível criar a rifa.')
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
      setCreateError('Não foi possível reservar os prêmios. Nada foi gravado; confira o estoque e tente de novo.')
      setSaving(false)
      return
    }

    setSaving(false)
    setCreateOpen(false)
    load()
  }

  function openClose(raffle: RaffleWithItems) {
    setToClose(raffle)
    setAmount('')
    setCloseError(null)
  }

  async function handleClose() {
    if (!toClose) return
    const received = parseDecimal(amount)
    if (Number.isNaN(received) || received < 0) {
      setCloseError('Informe o valor recebido com a rifa (pode ser 0).')
      return
    }
    setClosing(true)
    const { error } = await supabase
      .from('raffles')
      .update({ status: 'encerrada', amount_received: roundMoney(received), closed_at: new Date().toISOString() })
      .eq('id', toClose.id)
    setClosing(false)
    if (error) {
      console.error('raffles close', error)
      setCloseError('Não foi possível encerrar a rifa.')
      return
    }
    setToClose(null)
    load()
  }

  async function handleCancel() {
    if (!toCancel) return
    setListError(null)
    const { error } = await supabase.from('raffles').update({ status: 'cancelada' }).eq('id', toCancel.id)
    setToCancel(null)
    if (error) {
      console.error('raffles cancel', error)
      setListError('Não foi possível cancelar a rifa.')
      return
    }
    load()
  }

  const open = raffles.filter((r) => r.status === 'aberta')
  const closed = raffles.filter((r) => r.status === 'encerrada')
  const reservedCost = roundMoney(open.reduce((sum, r) => sum + prizeCost(r), 0))
  const totalReceived = roundMoney(closed.reduce((sum, r) => sum + Number(r.amount_received ?? 0), 0))
  const closedCost = roundMoney(closed.reduce((sum, r) => sum + prizeCost(r), 0))
  const result = roundMoney(totalReceived - closedCost)

  const closePreview = toClose ? parseDecimal(amount) : NaN

  return (
    <div>
      <PageHeader
        title="Rifas"
        subtitle="Prêmios reservados do estoque e valor recebido. Os números e o sorteio ficam no sistema de rifa."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Rifas abertas"
          value={String(open.length)}
          hint={`${formatCurrency(reservedCost)} em prêmios reservados`}
        />
        <StatTile label="Recebido" value={formatCurrency(totalReceived)} hint="Rifas encerradas" />
        <StatTile label="Custo dos prêmios" value={formatCurrency(closedCost)} hint="Rifas encerradas" />
        <StatTile
          label="Resultado"
          value={formatCurrency(result)}
          tone={result > 0 ? 'good' : result < 0 ? 'critical' : 'neutral'}
          hint="Recebido menos o custo"
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-neutral-900">Rifas</h3>
          <Button size="sm" onClick={openCreate} className="w-full sm:w-auto">
            <Plus size={16} /> Nova rifa
          </Button>
        </div>

        {listError && <p className="mb-3 text-sm font-bold text-[#a12424]">{listError}</p>}

        {loading ? (
          <Loader />
        ) : raffles.length === 0 ? (
          <EmptyState message="Nenhuma rifa cadastrada ainda." />
        ) : (
          <TableScroll>
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Criada em</th>
                  <th className="py-2 pr-3">Rifa</th>
                  <th className="py-2 pr-3">Prêmios</th>
                  <th className="py-2 pr-3 text-right">Custo</th>
                  <th className="py-2 pr-3 text-right">Recebido</th>
                  <th className="py-2 pr-3 text-right">Resultado</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {raffles.map((r) => {
                  const cost = prizeCost(r)
                  const received = r.amount_received === null ? null : Number(r.amount_received)
                  const rowResult = received === null ? null : roundMoney(received - cost)
                  return (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-neutral-500">
                        {format(new Date(r.created_at), 'dd/MM/yyyy')}
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-neutral-900">{r.name}</p>
                        {r.notes && <p className="text-xs text-neutral-500">{r.notes}</p>}
                      </td>
                      <td className="py-2.5 pr-3 text-neutral-600">{prizeSummary(r) || '—'}</td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">{formatCurrency(cost)}</td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                        {received === null ? '—' : formatCurrency(received)}
                      </td>
                      <td
                        className={
                          rowResult === null
                            ? 'py-2.5 pr-3 text-right'
                            : rowResult < 0
                              ? 'py-2.5 pr-3 text-right font-bold whitespace-nowrap text-[#a12424]'
                              : 'py-2.5 pr-3 text-right font-bold whitespace-nowrap text-[#0a6b34]'
                        }
                      >
                        {rowResult === null ? '—' : formatCurrency(rowResult)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {r.status === 'aberta' && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="secondary" onClick={() => openClose(r)}>
                              Encerrar
                            </Button>
                            <Button size="sm" variant="danger-ghost" onClick={() => setToCancel(r)}>
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nova rifa" wide>
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
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatQuantity(Number(p.stock_quantity))} {p.unit})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-24 shrink-0">
                    <DecimalInput
                      aria-label={`Quantidade do prêmio ${index + 1}`}
                      value={l.quantity}
                      onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
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
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setLines((prev) => [...prev, newLine()])}
            >
              <Plus size={16} /> Adicionar prêmio
            </Button>
          </div>

          {createError && <p className="text-sm text-[#d03b3b]">{createError}</p>}
          <Button className="w-full" onClick={handleCreate} disabled={saving}>
            {saving ? 'Criando…' : 'Criar rifa e reservar prêmios'}
          </Button>
        </div>
      </Modal>

      <Modal open={toClose !== null} onClose={() => setToClose(null)} title="Encerrar rifa">
        {toClose && (
          <div className="space-y-4">
            <div className="text-sm font-semibold text-[#52607a]">
              <p className="font-extrabold text-[#0e2240]">{toClose.name}</p>
              <p>{prizeSummary(toClose)}</p>
              <p className="mt-1">Custo dos prêmios: {formatCurrency(prizeCost(toClose))}</p>
            </div>
            <div>
              <Label htmlFor={`${fieldId}-amount`}>Valor recebido com a rifa (R$)</Label>
              <DecimalInput
                id={`${fieldId}-amount`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            {!Number.isNaN(closePreview) && closePreview >= 0 && (
              <p className="text-sm font-bold text-[#0e2240]">
                Resultado: {formatCurrency(roundMoney(closePreview - prizeCost(toClose)))}
              </p>
            )}
            <p className="text-xs font-semibold text-[#52607a]">
              Os prêmios continuam fora do estoque (foram para o ganhador). Esse valor não entra no caixa.
            </p>
            {closeError && <p className="text-sm text-[#d03b3b]">{closeError}</p>}
            <Button className="w-full" onClick={handleClose} disabled={closing}>
              {closing ? 'Encerrando…' : 'Encerrar rifa'}
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toCancel !== null}
        title="Cancelar rifa"
        message={
          <>
            Cancelar <strong>{toCancel?.name}</strong>? Os prêmios ({toCancel && prizeSummary(toCancel)}) voltam para o
            estoque.
          </>
        }
        confirmLabel="Cancelar rifa"
        cancelLabel="Voltar"
        onConfirm={handleCancel}
        onClose={() => setToCancel(null)}
      />
    </div>
  )
}
