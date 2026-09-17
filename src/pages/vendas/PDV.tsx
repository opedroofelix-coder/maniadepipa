import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { CashSession, Customer, PaymentMethod, Product, SimplePaymentMethod } from '../../types/database'
import { Button, Card, Input, Label, Select, formatCurrency } from '../../components/ui'
import { CashSessionBar } from './CashSessionBar'

interface CartLine {
  product: Product
  quantity: number
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
      const existing = prev.find((line) => line.product.id === product.id)
      if (existing) {
        return prev.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
      }
      return [...prev, { product, quantity: 1 }]
    })
    setSearch('')
    setResults([])
    searchInputRef.current?.focus()
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== productId))
      return
    }
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)))
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId))
  }

  const subtotal = useMemo(() => cart.reduce((sum, l) => sum + l.product.sale_price * l.quantity, 0), [cart])
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
      product_id: l.product.id,
      description: l.product.name,
      quantity: l.quantity,
      unit_price: l.product.sale_price,
      cost_price_at_sale: l.product.cost_price,
      subtotal: l.product.sale_price * l.quantity,
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
            <div className="relative">
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
                      <tr key={l.product.id}>
                        <td className="py-2.5 pr-3 font-medium text-neutral-900">{l.product.name}</td>
                        <td className="py-2.5 pr-3 text-right text-neutral-600">{formatCurrency(l.product.sale_price)}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => updateQuantity(l.product.id, l.quantity - 1)} className="text-neutral-400 hover:text-neutral-700">
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center">{l.quantity}</span>
                            <button onClick={() => updateQuantity(l.product.id, l.quantity + 1)} className="text-neutral-400 hover:text-neutral-700">
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-medium text-neutral-900">{formatCurrency(l.product.sale_price * l.quantity)}</td>
                        <td className="py-2.5 text-right">
                          <button onClick={() => removeLine(l.product.id)} className="text-neutral-400 hover:text-[#d03b3b]">
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
    </div>
  )
}
