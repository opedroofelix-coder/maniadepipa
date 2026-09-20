import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { CashSession, Customer, PaymentMethod, Product, SimplePaymentMethod } from '../../types/database'
import { Badge, Button, Card, Input, Label, Modal, Select, formatCurrency } from '../../components/ui'
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
  return (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
}

export function PDV() {
  const { profile } = useAuth()
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

  async function loadSession() {
    const { data } = await supabase.from('cash_sessions').select('*').eq('status', 'open').order('opened_at', { ascending: false }).limit(1)
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
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .or(`name.ilike.%${search}%,code.ilike.%${search}%`)
        .limit(8)
      setResults((data as Product[]) ?? [])
    }, 200)
    return () => clearTimeout(timeout)
  }, [search])

  function addToCart(product: Product) {
    setCart((prev) => {
      // só agrupa se o preço da linha ainda for o do cadastro: preço negociado fica em linha separada
      const existing = prev.find((line) => line.productId === product.id && Number(line.unitPrice) === product.sale_price)
      if (existing) {
        return prev.map((line) =>
          line.id === existing.id ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) } : line,
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
    searchInputRef.current?.focus()
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function stepQuantity(id: string, delta: number) {
    setCart((prev) => {
      const line = prev.find((l) => l.id === id)
      if (!line) return prev
      const next = (Number(line.quantity) || 0) + delta
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
    const price = Number(avulso.unitPrice)
    const quantity = Number(avulso.quantity)
    if (!description) {
      setAvulsoError('Informe a descrição do item.')
      return
    }
    if (!avulso.unitPrice.trim() || !Number.isFinite(price) || price < 0) {
      setAvulsoError('Informe um valor válido.')
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
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
  const total = Math.max(subtotal - (Number(discount) || 0), 0)
  const received = Number(amountReceived) || 0
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

  const mistoSum = paymentLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)

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
      (l) => !l.description.trim() || !((Number(l.quantity) || 0) > 0) || !((Number(l.unitPrice) || 0) >= 0),
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
      setError(`A soma dos pagamentos (${formatCurrency(mistoSum)}) precisa ser igual ao total (${formatCurrency(total)}).`)
      return
    }

    setSaving(true)
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        cashier_id: profile?.id ?? null,
        customer_id: customerId || null,
        session_id: session.id,
        subtotal,
        discount: Number(discount) || 0,
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
      quantity: Number(l.quantity),
      unit_price: Number(l.unitPrice),
      cost_price_at_sale: l.costPrice,
      subtotal: lineTotal(l),
    }))
    const { error: itemsError } = await supabase.from('sale_items').insert(itemsPayload)

    const paymentsPayload =
      paymentMethod === 'misto'
        ? paymentLines.filter((l) => Number(l.amount) > 0).map((l) => ({ sale_id: sale.id, method: l.method, amount: Number(l.amount) }))
        : [{ sale_id: sale.id, method: paymentMethod as SimplePaymentMethod, amount: total }]
    const { error: paymentsError } = await supabase.from('sale_payments').insert(paymentsPayload)

    setSaving(false)

    if (itemsError || paymentsError) {
      setError('A venda foi criada, mas houve um problema ao salvar os itens/pagamentos. Confira o histórico.')
      return
    }

    setLastReceipt({ total, change })
    resetSale()
  }

  if (session === undefined) {
    return <p className="text-sm text-neutral-500">Carregando…</p>
  }

  return (
    <div>
      <CashSessionBar session={session} onChanged={loadSession} />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card>
            <div className="flex items-start gap-3">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <Input
                  ref={searchInputRef}
                  placeholder="Buscar produto por nome ou código…"
                  className="pl-10 text-base"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={!session}
                  autoFocus
                />
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                    {results.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-neutral-50"
                      >
                        <span>
                          <span className="font-medium text-neutral-900">{p.name}</span>
                          {p.code && <span className="ml-2 text-xs text-neutral-400">{p.code}</span>}
                        </span>
                        <span className="text-neutral-600">{formatCurrency(p.sale_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="secondary" onClick={openAvulso} disabled={!session} className="shrink-0 py-2.5">
                <Plus size={16} /> Diversos
              </Button>
            </div>

            <div className="mt-5">
              {cart.length === 0 ? (
                <p className="py-10 text-center text-sm text-neutral-400">Carrinho vazio. Busque um produto para começar.</p>
              ) : (
                <table className="w-full text-left text-sm">
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
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.unitPrice}
                            onChange={(e) => updateLine(l.id, { unitPrice: e.target.value })}
                            className="ml-auto w-24 text-right"
                            aria-label={`Preço de ${l.description}`}
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => stepQuantity(l.id, -1)} className="text-neutral-400 hover:text-neutral-700" aria-label="Diminuir">
                              <Minus size={14} />
                            </button>
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              value={l.quantity}
                              onChange={(e) => updateLine(l.id, { quantity: e.target.value })}
                              className="w-20 text-center"
                              aria-label={`Quantidade de ${l.description}`}
                            />
                            <button onClick={() => stepQuantity(l.id, 1)} className="text-neutral-400 hover:text-neutral-700" aria-label="Aumentar">
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-medium text-neutral-900">{formatCurrency(lineTotal(l))}</td>
                        <td className="py-2.5 text-right">
                          <button onClick={() => removeLine(l.id)} className="text-neutral-400 hover:text-[#d03b3b]" aria-label="Remover">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-neutral-900">Fechamento</h3>

            <div className="space-y-3">
              <div>
                <Label>Cliente (opcional)</Label>
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
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
                <Label>Desconto (R$)</Label>
                <Input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
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
                      onClick={() => setPaymentMethod(method)}
                      className={
                        paymentMethod === method
                          ? 'rounded-lg bg-[#d6247a] px-3 py-2 text-sm font-medium text-white'
                          : 'rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200'
                      }
                    >
                      {PAYMENT_LABEL[method]}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'dinheiro' && (
                <div>
                  <Label>Valor recebido</Label>
                  <Input type="number" step="0.01" min="0" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} />
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
                      <Select value={line.method} onChange={(e) => updatePaymentLine(i, { method: e.target.value as SimplePaymentMethod })}>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="pix">Pix</option>
                        <option value="credito">Crédito</option>
                        <option value="debito">Débito</option>
                      </Select>
                      <Input type="number" step="0.01" min="0" value={line.amount} onChange={(e) => updatePaymentLine(i, { amount: e.target.value })} />
                      {paymentLines.length > 1 && (
                        <button onClick={() => removePaymentLine(i)} className="text-neutral-400 hover:text-[#d03b3b]">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addPaymentLine} className="text-xs font-medium text-[#d6247a] hover:underline">
                    + adicionar forma de pagamento
                  </button>
                  <p className="text-xs text-neutral-500">
                    Soma: {formatCurrency(mistoSum)} de {formatCurrency(total)}
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-[#d03b3b]">{error}</p>}

              <Button className="w-full" size="lg" disabled={!session || saving || cart.length === 0} onClick={handleFinalize}>
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
            <Label>Descrição</Label>
            <Input
              value={avulso.description}
              onChange={(e) => setAvulso({ ...avulso, description: e.target.value })}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valor unitário (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={avulso.unitPrice}
                onChange={(e) => setAvulso({ ...avulso, unitPrice: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addAvulso()}
              />
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={avulso.quantity}
                onChange={(e) => setAvulso({ ...avulso, quantity: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addAvulso()}
              />
            </div>
          </div>
          {avulsoError && <p className="text-sm text-[#d03b3b]">{avulsoError}</p>}
          <p className="text-xs text-neutral-400">
            Item avulso não é cadastrado e não movimenta estoque. O custo entra como zero, então ele conta como lucro cheio nos relatórios.
          </p>
          <Button className="w-full" onClick={addAvulso}>
            Adicionar ao carrinho
          </Button>
        </div>
      </Modal>
    </div>
  )
}
