import { useEffect, useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatQuantity, parseDecimal } from '../../lib/number'
import type { Product, StockMovement, StockMovementType } from '../../types/database'
import {
  Badge,
  Button,
  Card,
  DecimalInput,
  EmptyState,
  Input,
  Label,
  Loader,
  Modal,
  Select,
  TableScroll,
} from '../../components/ui'

type MovementWithProduct = StockMovement & { products: { name: string; unit: string } | null }

const TYPE_LABEL: Record<StockMovementType, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
}

export function MovimentacoesTab() {
  const { profile } = useAuth()
  const fieldId = useId()
  const [movements, setMovements] = useState<MovementWithProduct[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState('')
  const [type, setType] = useState<StockMovementType>('entrada')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: mv }, { data: prod }] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('*, products(name, unit)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('products').select('*').eq('active', true).order('name'),
    ])
    setMovements((mv as unknown as MovementWithProduct[]) ?? [])
    setProducts((prod as Product[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setProductId('')
    setType('entrada')
    setQuantity('1')
    setReason('')
    setError(null)
    setOpen(true)
  }

  async function handleSave() {
    const qty = parseDecimal(quantity)
    if (!productId || Number.isNaN(qty) || qty === 0) {
      setError('Selecione o produto e informe a quantidade.')
      return
    }
    // para "ajuste", permitimos negativo; entrada/saída sempre positivo (sinal aplicado pelo trigger)
    if (type !== 'ajuste' && qty <= 0) {
      setError('Quantidade deve ser maior que zero.')
      return
    }
    // saída/ajuste negativo não pode derrubar o estoque abaixo de zero: o check
    // do banco recusaria a gravação com um erro sem explicação
    const selected = products.find((p) => p.id === productId)
    const delta = type === 'entrada' ? qty : type === 'saida' ? -qty : qty
    if (selected && Number(selected.stock_quantity) + delta < 0) {
      setError(
        `Estoque insuficiente: ${selected.name} tem ${formatQuantity(Number(selected.stock_quantity))} ${selected.unit}.`,
      )
      return
    }

    setSaving(true)
    const { error: saveError } = await supabase.from('stock_movements').insert({
      product_id: productId,
      type,
      quantity: qty,
      reason: reason.trim() || null,
      created_by: profile?.id ?? null,
    })
    setSaving(false)
    if (saveError) {
      setError('Não foi possível registrar a movimentação.')
      return
    }
    setOpen(false)
    load()
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Movimentações recentes</h3>
        <Button size="sm" onClick={openCreate} className="w-full sm:w-auto">
          <Plus size={16} /> Nova movimentação
        </Button>
      </div>

      {loading ? (
        <Loader />
      ) : movements.length === 0 ? (
        <EmptyState message="Nenhuma movimentação registrada ainda." />
      ) : (
        <TableScroll>
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Produto</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3 text-right">Quantidade</th>
                <th className="py-2">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-neutral-500">
                    {format(new Date(m.created_at), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-neutral-900">{m.products?.name ?? '—'}</td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={m.type === 'saida' ? 'critical' : m.type === 'entrada' ? 'good' : 'brand'}>
                      {TYPE_LABEL[m.type]}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    {formatQuantity(Number(m.quantity))} {m.products?.unit}
                  </td>
                  <td className="py-2.5 text-neutral-600">{m.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nova movimentação de estoque">
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${fieldId}-product`}>Produto</Label>
            <Select id={`${fieldId}-product`} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Selecione…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatQuantity(Number(p.stock_quantity))} {p.unit})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${fieldId}-type`}>Tipo</Label>
            <Select
              id={`${fieldId}-type`}
              value={type}
              onChange={(e) => setType(e.target.value as StockMovementType)}
            >
              <option value="entrada">Entrada (compra, reposição)</option>
              <option value="saida">Saída (perda, quebra, uso interno)</option>
              <option value="ajuste">Ajuste (correção de inventário)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${fieldId}-qty`}>
              {type === 'ajuste' ? 'Quantidade (use negativo para reduzir)' : 'Quantidade'}
            </Label>
            <DecimalInput id={`${fieldId}-qty`} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-reason`}>Motivo (opcional)</Label>
            <Input id={`${fieldId}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Registrando…' : 'Registrar'}
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
