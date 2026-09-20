import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatQuantity, isPositiveDecimal, parseDecimal, toDecimal } from '../../lib/number'
import type { CashSession, Customer, PaymentMethod, Product, SimplePaymentMethod } from '../../types/database'
import {
  Badge,
  Button,
  Card,
  DecimalInput,
  IconButton,
  Input,
  Label,
  Loader,
  Modal,
  Select,
  TableScroll,
  formatCurrency,
} from '../../components/ui'
import { CashSessionBar } from './CashSessionBar'

interface CartLine {
  id: string
  productId: string | null // null = item avulso (Diversos), não movimenta estoque
  description: string
  unit: string
  quantity: string // string enquanto o caixa digita, como discount e paymentLines
  unitPrice: string
  costPrice: number // snapshot do custo no momento da venda
}

interface PaymentLine {
  method: SimplePaymentMethod
  amount: string
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Crédito',
  debito: 'Débito',
  misto: 'Misto',
}

const emptyAvulso = { description: 'Diversos', unitPrice: '', quantity: '1' }

function lineTotal(line: CartLine) {
  return toDecimal(line.quantity) * toDecimal(line.unitPrice)
}

export function PDV() {
  const { profile } = useAuth()
  const fieldId = useId()
  const [session, setSession] = useState<CashSession | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('0')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('dinheiro')
  const [amountReceived, setAmountReceived] = useState('')
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{ method: 'dinheiro', amount: '' }])
  const [avulsoOpen, setAvulsoOpen] = useState(false)
  const [avulso, setAvulso] = useState(emptyAvulso)
  const [avulsoError, setAvulsoError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<{ total: number; change: number } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // ignora respostas de buscas que já foram substituídas por outra mais nova
  const searchSeq = useRef(0)

  async function loadSession() {
    const { data } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
    setSession((data?.[0] as CashSession) ?? null)
  }

  useEffect(() => {
    loadSession()
    supabase
      .from('customers')
      .select('*')
      .order('name')
      .then(({ data }) => setCustomers((data as Customer[]) ?? []))
  }, [])

  useEffect(() => {
    if (!search.trim()) {
      setResults([])
      return
    }
    const seq = ++searchSeq.current
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .or(`name.ilike.%${search}%,code.ilike.%${search}%`)
        .limit(8)
      if (seq !== searchSeq.current) return // chegou atrasada, descarta
      setResults((data as Product[]) ?? [])
    }, 200)
    return () => clearTimeout(timeout)
  }, [search])

  function addToCart(product: Product) {
    setCart((prev) => {
      // Sempre uma linha por produto. Duas linhas do mesmo produto fazem o
      // trigger de cancelamento devolver só uma delas ao estoque.
      const existing = prev.find((line) => line.productId === product.id)
      if (existing) {
        return prev.map((line) =>
          line.id === existing.id ? { ...line, quantity: String(toDecimal(line.quantity) + 1) } : line,
        )
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          description: product.name,
          unit: product.unit,
          quantity: '1',
          unitPrice: String(product.sale_price),
          costPrice: product.cost_price,
        },
      ]
    })
    setSearch('')
    setResults([])
    searchSeq.current++
    searchInputRef.current?.focus()
  }

  // Enter adiciona o primeiro resultado: é assim que o leitor de código de
  // barras funciona (ele digita o código e manda Enter).
  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (results.length > 0) addToCart(results[0])
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function stepQuantity(id: string, delta: number) {
    setCart((prev) => {
      const line = prev.find((l) => l.id === id)
      if (!line) return prev
      const next = toDecimal(line.quantity) + delta
      if (next <= 0) return prev.filter((l) => l.id !== id)
      return prev.map((l) => (l.id === id ? { ...l, quantity: String(next) } : l))
    })
  }

  function removeLine(id: string) {
    setCart((prev) => prev.filter((l) => l.id !== id))
  }

  function openAvulso() {
    setAvulso(emptyAvulso)
    setAvulsoError(null)
    setAvulsoOpen(true)
  }

  function addAvulso() {
    const description = avulso.description.trim()
    const price = parseDecimal(avulso.unitPrice)
    const quantity = parseDecimal(avulso.quantity)
    if (!description) {
      setAvulsoError('Informe a descrição do item.')
      return
    }
    if (Number.isNaN(price) || price < 0) {
      setAvulsoError('Informe um valor válido.')
      return
    }
    if (Number.isNaN(quantity) || quantity <= 0) {
      setAvulsoError('A quantidade precisa ser maior que zero.')
      return
    }
    setCart((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: null,
        description,
        unit: 'un',
        quantity: String(quantity),
        unitPrice: String(price),
        costPrice: 0,
      },
    ])
    setAvulsoOpen(false)
    searchInputRef.current?.focus()
  }

  const subtotal = useMemo(() => cart.reduce((sum, l) => sum + lineTotal(l), 0), [cart])
  // desconto nunca passa do subtotal, senão sales.subtotal - discount não bate
  // com sales.total e o lucro do Dashboard fica negativo à toa
  const appliedDiscount = Math.min(Math.max(toDecimal(discount), 0), subtotal)
  const total = subtotal - appliedDiscount
  const received = toDecimal(amountReceived)
  const change = paymentMethod === 'dinheiro' ? Math.max(received - total, 0) : 0

  function resetSale() {
    setCart([])
    setDiscount('0')
    setCustomerId('')
    setPaymentMethod('dinheiro')
    setAmountReceived('')
    setPaymentLines([{ method: 'dinheiro', amount: '' }])
    setError(null)
  }

  function updatePaymentLine(index: number, patch: Partial<PaymentLine>) {
    setPaymentLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function addPaymentLine() {
    setPaymentLines((prev) => [...prev, { method: 'dinheiro', amount: '' }])
  }

  function removePaymentLine(index: number) {
    setPaymentLines((prev) => prev.filter((_, i) => i !== index))
  }

  const mistoSum = paymentLines.reduce((sum, l) => sum + toDecimal(l.amount), 0)

  async function handleFinalize() {
    setError(null)
    if (!session) {
      setError('Abra o caixa antes de vender.')
      return
    }
    if (cart.length === 0) {
      setError('Adicione ao menos um produto.')
      return
    }
    const invalidLine = cart.find(
      (l) => !l.description.trim() || !isPositiveDecimal(l.quantity) || Number.isNaN(parseDecimal(l.unitPrice)) || parseDecimal(l.unitPrice) < 0,
    )
    if (invalidLine) {
      setError(`Confira a quantidade e o preço de "${invalidLine.description.trim() || 'item sem descrição'}".`)
      return
    }
    if (paymentMethod === 'dinheiro' && received < total) {
      setError('Valor recebido é menor que o total.')
      return
    }
    if (paymentMethod === 'misto' && Math.abs(mistoSum - total) > 0.01) {
      setError(
        `A soma dos pagamentos (${formatCurrency(mistoSum)}) precisa ser igual ao total (${formatCurrency(total)}).`,
      )
      return
    }

    setSaving(true)

    // Conferir o estoque ANTES de gravar. Sem isso, o insert dos itens bate no
    // check (stock_quantity >= 0) e a venda fica gravada sem item nenhum.
    const productLines = cart.filter((l) => l.productId !== null)
    if (productLines.length > 0) {
      const { data: current, error: stockError } = await supabase
        .from('products')
        .select('id, name, stock_quantity, unit')
        .in('id', productLines.map((l) => l.productId as string))
      if (stockError) {
        setError('Não foi possível conferir o estoque. Tente de novo.')
        setSaving(false)
        return
      }
      const stockById = new Map((current ?? []).map((p) => [p.id as string, p]))
      const semSaldo = productLines
        .map((line) => {
          const product = stockById.get(line.productId as string)
          if (!product) return null
          const available = Number(product.stock_quantity)
          const wanted = toDecimal(line.quantity)
          return wanted > available
            ? `${product.name} (tem ${formatQuantity(available)} ${product.unit}, pedido ${formatQuantity(wanted)})`
            : null
        })
        .filter(Boolean)
      if (semSaldo.length > 0) {
        setError(`Estoque insuficiente: ${semSaldo.join('; ')}.`)
        setSaving(false)
        return
      }
    }

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        cashier_id: profile?.id ?? null,
        customer_id: customerId || null,
        session_id: session.id,
        subtotal,
        discount: appliedDiscount,
        total,
        payment_method: paymentMethod,
        amount_received: paymentMethod === 'dinheiro' ? received : null,
        change_amount: paymentMethod === 'dinheiro' ? change : null,
        status: 'completed',
      })
      .select()
      .single()

    if (saleError || !sale) {
      setError('Não foi possível registrar a venda.')
      setSaving(false)
      return
    }

    const itemsPayload = cart.map((l) => ({
      sale_id: sale.id,
      product_id: l.productId,
      description: l.description.trim(),
      quantity: toDecimal(l.quantity),
      unit_price: toDecimal(l.unitPrice),
      cost_price_at_sale: l.costPrice,
      subtotal: lineTotal(l),
    }))
    const { error: itemsError } = await supabase.from('sale_items').insert(itemsPayload)

    if (itemsError) {
      // desfaz a venda para não sobrar registro órfão contando no faturamento
      // (sale_items e sale_payments saem junto por on delete cascade)
      await supabase.from('sales').delete().eq('id', sale.id)
      setError('Não foi possível registrar os itens. A venda foi cancelada, nada foi gravado. Tente de novo.')
      setSaving(false)
      return
    }

    const paymentsPayload =
      paymentMethod === 'misto'
        ? paymentLines
            .filter((l) => toDecimal(l.amount) > 0)
            .map((l) => ({ sale_id: sale.id, method: l.method, amount: toDecimal(l.amount) }))
        : [{ sale_id: sale.id, method: paymentMethod as SimplePaymentMethod, amount: total }]
    const { error: paymentsError } = await supabase.from('sale_payments').insert(paymentsPayload)

    setSaving(false)

    if (paymentsError) {
      setError('A venda foi registrada, mas o detalhe do pagamento não foi salvo. Confira o histórico.')
      return
    }

    setLastReceipt({ total, change })
    resetSale()
  }

  if (session === undefined) {
    return <Loader />
  }

  const cartIsEmpty = cart.length === 0

  return (
    <div>
      <CashSessionBar session={session} onChanged={loadSession} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <Input
                  ref={searchInputRef}
                  placeholder="Buscar produto por nome ou código…"
                  className="pl-10 text-base"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  disabled={!session}
                  aria-label="Buscar produto"
                  autoFocus
                />
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                    {results.map((p) => {
                      const low = Number(p.stock_quantity) <= Number(p.min_stock)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addToCart(p)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-neutral-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-neutral-900">{p.name}</span>
                            <span className={low ? 'text-xs font-medium text-[#d03b3b]' : 'text-xs text-neutral-400'}>
                              {formatQuantity(Number(p.stock_quantity))} {p.unit} em estoque
                              {p.code && ` · ${p.code}`}
                            </span>
                          </span>
                          <span className="shrink-0 text-neutral-600">{formatCurrency(p.sale_price)}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <Button variant="secondary" onClick={openAvulso} disabled={!session} className="shrink-0 py-2.5">
                <Plus size={16} /> Diversos
              </Button>
            </div>

            <div className="mt-5">
              {cartIsEmpty ? (
                <p className="py-10 text-center text-sm text-neutral-400">
                  Carrinho vazio. Busque um produto para começar.
                </p>
              ) : (
                <>
                  {/* celular: cards empilhados (a tabela não cabe em 375px) */}
                  <ul className="space-y-3 lg:hidden">
                    {cart.map((l) => (
                      <li key={l.id} className="rounded-lg border border-neutral-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-sm font-medium text-neutral-900">
                            {l.description}
                            {l.productId === null ? (
                              <span className="ml-2">
                                <Badge tone="brand">avulso</Badge>
                              </span>
                            ) : (
                              <span className="ml-2 text-xs font-normal text-neutral-400">{l.unit}</span>
                            )}
                          </p>
                          <IconButton tone="danger" onClick={() => removeLine(l.id)} aria-label={`Remover ${l.description}`} className="-mr-2 -mt-2">
                            <Trash2 size={16} />
                          </IconButton>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor={`${fieldId}-m-price-${l.id}`}>Preço unitário</Label>
                            <DecimalInput
                              id={`${fieldId}-m-price-${l.id}`}
                              value={l.unitPrice}
                              onChange={(e) => updateLine(l.id, { unitPrice: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`${fieldId}-m-qty-${l.id}`}>Quantidade</Label>
                            <div className="flex items-center gap-1">
                              <IconButton tone="neutral" onClick={() => stepQuantity(l.id, -1)} aria-label="Diminuir">
                                <Minus size={14} />
                              </IconButton>
                              <DecimalInput
                                id={`${fieldId}-m-qty-${l.id}`}
                                value={l.quantity}
                                onChange={(e) => updateLine(l.id, { quantity: e.target.value })}
                                className="text-center"
                              />
                              <IconButton tone="neutral" onClick={() => stepQuantity(l.id, 1)} aria-label="Aumentar">
                                <Plus size={14} />
                              </IconButton>
                            </div>
                          </div>
                        </div>
                        <p className="mt-2 text-right text-sm font-medium text-neutral-900">
                          Subtotal: {formatCurrency(lineTotal(l))}
                        </p>
                      </li>
                    ))}
                  </ul>

                  <TableScroll className="hidden lg:block">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                          <th className="py-2 pr-3">Produto</th>
                          <th className="py-2 pr-3 text-right">Preço</th>
                          <th className="py-2 pr-3 text-center">Qtd.</th>
                          <th className="py-2 pr-3 text-right">Subtotal</th>
                          <th className="py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {cart.map((l) => (
                          <tr key={l.id}>
                            <td className="py-2.5 pr-3">
                              <span className="font-medium text-neutral-900">{l.description}</span>
                              {l.productId === null ? (
                                <span className="ml-2">
                                  <Badge tone="brand">avulso</Badge>
                                </span>
                              ) : (
                                <span className="ml-2 text-xs text-neutral-400">{l.unit}</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-3">
                              <DecimalInput
                                value={l.unitPrice}
                                onChange={(e) => updateLine(l.id, { unitPrice: e.target.value })}
                                className="ml-auto w-24 text-right"
                                aria-label={`Preço de ${l.description}`}
                              />
                            </td>
                            <td className="py-2.5 pr-3">
                              <div className="flex items-center justify-center gap-1">
                                <IconButton tone="neutral" onClick={() => stepQuantity(l.id, -1)} aria-label="Diminuir">
                                  <Minus size={14} />
                                </IconButton>
                                <DecimalInput
                                  value={l.quantity}
                                  onChange={(e) => updateLine(l.id, { quantity: e.target.value })}
                                  className="w-20 text-center"
                                  aria-label={`Quantidade de ${l.description}`}
                                />
                                <IconButton tone="neutral" onClick={() => stepQuantity(l.id, 1)} aria-label="Aumentar">
                                  <Plus size={14} />
                                </IconButton>
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 text-right font-medium text-neutral-900">
                              {formatCurrency(lineTotal(l))}
                            </td>
                            <td className="py-2.5 text-right">
                              <IconButton tone="danger" onClick={() => removeLine(l.id)} aria-label={`Remover ${l.description}`}>
                                <Trash2 size={16} />
                              </IconButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </>
              )}
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-neutral-900">Fechamento</h3>

            <div className="space-y-3">
              <div>
                <Label htmlFor={`${fieldId}-customer`}>Cliente (opcional)</Label>
                <Select id={`${fieldId}-customer`} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Cliente não identificado</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-center justify-between text-sm text-neutral-600">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div>
                <Label htmlFor={`${fieldId}-discount`}>Desconto (R$)</Label>
                <DecimalInput
                  id={`${fieldId}-discount`}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
                {toDecimal(discount) > subtotal && (
                  <p className="mt-1 text-xs text-[#8a5b00]">
                    O desconto foi limitado ao subtotal ({formatCurrency(subtotal)}).
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-neutral-200 pt-3 text-base font-semibold text-neutral-900">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>

              <div>
                <Label>Forma de pagamento</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={
                        paymentMethod === method
                          ? 'rounded-lg bg-[#d6247a] px-3 py-2.5 text-sm font-medium text-white'
                          : 'rounded-lg bg-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200'
                      }
                    >
                      {PAYMENT_LABEL[method]}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'dinheiro' && (
                <div>
                  <Label htmlFor={`${fieldId}-received`}>Valor recebido</Label>
                  <DecimalInput
                    id={`${fieldId}-received`}
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                  />
                  {received > 0 && (
                    <p className="mt-1 text-sm text-neutral-600">
                      Troco: <span className="font-medium text-neutral-900">{formatCurrency(change)}</span>
                    </p>
                  )}
                </div>
              )}

              {paymentMethod === 'misto' && (
                <div className="space-y-2">
                  <Label>Divisão do pagamento</Label>
                  {paymentLines.map((line, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select
                        value={line.method}
                        onChange={(e) => updatePaymentLine(i, { method: e.target.value as SimplePaymentMethod })}
                        aria-label={`Forma de pagamento ${i + 1}`}
                      >
                        <option value="dinheiro">Dinheiro</option>
                        <option value="pix">Pix</option>
                        <option value="credito">Crédito</option>
                        <option value="debito">Débito</option>
                      </Select>
                      <DecimalInput
                        value={line.amount}
                        onChange={(e) => updatePaymentLine(i, { amount: e.target.value })}
                        aria-label={`Valor do pagamento ${i + 1}`}
                      />
                      {paymentLines.length > 1 && (
                        <IconButton tone="danger" onClick={() => removePaymentLine(i)} aria-label="Remover pagamento">
                          <X size={16} />
                        </IconButton>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addPaymentLine}
                    className="text-xs font-medium text-[#d6247a] hover:underline"
                  >
                    + adicionar forma de pagamento
                  </button>
                  <p className="text-xs text-neutral-500">
                    Soma: {formatCurrency(mistoSum)} de {formatCurrency(total)}
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-[#d03b3b]">{error}</p>}

              <Button className="w-full" size="lg" disabled={!session || saving || cartIsEmpty} onClick={handleFinalize}>
                {saving ? 'Finalizando…' : 'Finalizar venda'}
              </Button>

              {lastReceipt && (
                <p className="rounded-lg bg-[#0ca30c]/10 px-3 py-2 text-center text-sm text-[#0ca30c]">
                  Venda registrada: {formatCurrency(lastReceipt.total)}
                  {lastReceipt.change > 0 && ` · troco ${formatCurrency(lastReceipt.change)}`}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={avulsoOpen} onClose={() => setAvulsoOpen(false)} title="Item avulso (Diversos)">
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${fieldId}-avulso-desc`}>Descrição</Label>
            <Input
              id={`${fieldId}-avulso-desc`}
              value={avulso.description}
              onChange={(e) => setAvulso({ ...avulso, description: e.target.value })}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${fieldId}-avulso-price`}>Valor unitário (R$)</Label>
              <DecimalInput
                id={`${fieldId}-avulso-price`}
                value={avulso.unitPrice}
                onChange={(e) => setAvulso({ ...avulso, unitPrice: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addAvulso()}
              />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-avulso-qty`}>Quantidade</Label>
              <DecimalInput
                id={`${fieldId}-avulso-qty`}
                value={avulso.quantity}
                onChange={(e) => setAvulso({ ...avulso, quantity: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addAvulso()}
              />
            </div>
          </div>
          {avulsoError && <p className="text-sm text-[#d03b3b]">{avulsoError}</p>}
          <p className="text-xs text-neutral-400">
            Item avulso não é cadastrado e não movimenta estoque. O custo entra como zero, então ele conta como lucro
            cheio nos relatórios.
          </p>
          <Button className="w-full" onClick={addAvulso}>
            Adicionar ao carrinho
          </Button>
        </div>
      </Modal>
    </div>
  )
}
