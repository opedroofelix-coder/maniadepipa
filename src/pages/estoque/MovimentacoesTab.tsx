import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Product, StockMovement, StockMovementType } from '../../types/database'
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select } from '../../components/ui'
import { format } from 'date-fns'

type MovementWithProduct = StockMovement & { products: { name: string; unit: string } | null }

const TYPE_LABEL: Record<StockMovementType, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
}

export function MovimentacoesTab() {
  const { profile } = useAuth()
  const [movements, setMovements] = useState<MovementWithProduct[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
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
    const qty = Number(quantity)
    if (!productId || !qty) {
      setError('Selecione o produto e informe a quantidade.')
      return
    }
    // para "ajuste", permitimos negativo; entrada/saída sempre positivo (sinal aplicado pelo trigger)
    if (type !== 'ajuste' && qty <= 0) {
      setError('Quantidade deve ser maior que zero.')
      return
    }
    const { error } = await supabase.from('stock_movements').insert({
      product_id: productId,
      type,
      quantity: qty,
      reason: reason.trim() || null,
      created_by: profile?.id ?? null,
    })
    if (error) {
      setError('Não foi possível registrar a movimentação.')
      return
    }
    setOpen(false)
    load()
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Movimentações recentes</h3>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} /> Nova movimentação
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : movements.length === 0 ? (
        <EmptyState message="Nenhuma movimentação registrada ainda." />
      ) : (
        <table className="w-full text-left text-sm">
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
                <td className="py-2.5 pr-3 text-neutral-500">{format(new Date(m.created_at), 'dd/MM/yyyy HH:mm')}</td>
                <td className="py-2.5 pr-3 font-medium text-neutral-900">{m.products?.name ?? '—'}</td>
                <td className="py-2.5 pr-3">
                  <Badge tone={m.type === 'saida' ? 'critical' : m.type === 'entrada' ? 'good' : 'brand'}>{TYPE_LABEL[m.type]}</Badge>
                </td>
                <td className="py-2.5 pr-3 text-right">
                  {m.quantity} {m.products?.unit}
                </td>
                <td className="py-2.5 text-neutral-600">{m.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nova movimentação de estoque">
        <div className="space-y-4">
          <div>
            <Label>Produto</Label>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)} autoFocus>
              <option value="">Selecione…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as StockMovementType)}>
              <option value="entrada">Entrada (compra, reposição)</option>
              <option value="saida">Saída (perda, quebra, uso interno)</option>
              <option value="ajuste">Ajuste (correção de inventário)</option>
            </Select>
          </div>
          <div>
            <Label>{type === 'ajuste' ? 'Quantidade (use negativo para reduzir)' : 'Quantidade'}</Label>
            <Input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>Motivo (opcional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
          <Button className="w-full" onClick={handleSave}>
            Registrar
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
