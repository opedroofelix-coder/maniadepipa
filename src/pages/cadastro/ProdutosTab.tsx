import { useEffect, useState } from 'react'
import { Plus, Pencil, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Category, Product } from '../../types/database'
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, formatCurrency } from '../../components/ui'

type ProductWithCategory = Product & { categories: { name: string } | null }

const emptyForm = {
  id: '',
  code: '',
  name: '',
  category_id: '',
  unit: 'un',
  cost_price: '0',
  sale_price: '0',
  stock_quantity: '0',
  min_stock: '0',
  active: true,
}

export function ProdutosTab() {
  const [products, setProducts] = useState<ProductWithCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: prod }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*, categories(name)').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setProducts((prod as unknown as ProductWithCategory[]) ?? [])
    setCategories((cats as Category[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setForm(emptyForm)
    setError(null)
    setOpen(true)
  }

  function openEdit(p: Product) {
    setForm({
      id: p.id,
      code: p.code ?? '',
      name: p.name,
      category_id: p.category_id ?? '',
      unit: p.unit,
      cost_price: String(p.cost_price),
      sale_price: String(p.sale_price),
      stock_quantity: String(p.stock_quantity),
      min_stock: String(p.min_stock),
      active: p.active,
    })
    setError(null)
    setOpen(true)
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Excluir o produto "${p.name}"? Esta ação não pode ser desfeita.`)) return
    setListError(null)
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (!error) {
      load()
      return
    }
    // sale_items.product_id referencia products sem on delete: produto já vendido não sai.
    const isInUse = error.code === '23503' || error.message.includes('foreign key')
    if (!isInUse) {
      setListError('Não foi possível excluir o produto.')
      return
    }
    if (!confirm('Este produto já tem vendas registradas e não pode ser excluído. Deseja inativá-lo? Ele deixa de aparecer no PDV.')) return
    const { error: updateError } = await supabase
      .from('products')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (updateError) {
      setListError('Não foi possível inativar o produto.')
      return
    }
    load()
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Informe o nome do produto.')
      return
    }
    const payload = {
      code: form.code.trim() || null,
      name: form.name.trim(),
      category_id: form.category_id || null,
      unit: form.unit,
      cost_price: Number(form.cost_price) || 0,
      sale_price: Number(form.sale_price) || 0,
      stock_quantity: Number(form.stock_quantity) || 0,
      min_stock: Number(form.min_stock) || 0,
      active: form.active,
      updated_at: new Date().toISOString(),
    }

    const query = form.id
      ? supabase.from('products').update(payload).eq('id', form.id)
      : supabase.from('products').insert(payload)

    const { error } = await query
    if (error) {
      setError(error.message.includes('duplicate') ? 'Já existe um produto com esse código.' : 'Não foi possível salvar o produto.')
      return
    }
    setOpen(false)
    load()
  }

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) || (p.code ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input placeholder="Buscar por nome ou código" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} /> Novo produto
        </Button>
      </div>

      {listError && <p className="mb-3 text-sm text-[#d03b3b]">{listError}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState message="Nenhum produto encontrado." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">Categoria</th>
                <th className="py-2 pr-3 text-right">Custo</th>
                <th className="py-2 pr-3 text-right">Venda</th>
                <th className="py-2 pr-3 text-right">Estoque</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 pr-3 text-neutral-500">{p.code ?? '—'}</td>
                  <td className="py-2.5 pr-3 font-medium text-neutral-900">{p.name}</td>
                  <td className="py-2.5 pr-3 text-neutral-600">{p.categories?.name ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-right text-neutral-600">{formatCurrency(p.cost_price)}</td>
                  <td className="py-2.5 pr-3 text-right font-medium text-neutral-900">{formatCurrency(p.sale_price)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <span className={p.stock_quantity <= p.min_stock ? 'font-medium text-[#d03b3b]' : 'text-neutral-700'}>
                      {p.stock_quantity} {p.unit}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={p.active ? 'good' : 'neutral'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openEdit(p)} className="text-neutral-400 hover:text-[#d6247a]" aria-label="Editar">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => handleDelete(p)} className="text-neutral-400 hover:text-[#d03b3b]" aria-label="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Editar produto' : 'Novo produto'} wide>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Código / código de barras</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div>
            <Label>Unidade</Label>
            <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="un">un</option>
              <option value="kg">kg</option>
              <option value="m">m</option>
              <option value="cx">cx</option>
              <option value="l">l</option>
              <option value="pct">pct</option>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="col-span-2">
            <Label>Categoria</Label>
            <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Preço de custo</Label>
            <Input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
          </div>
          <div>
            <Label>Preço de venda</Label>
            <Input type="number" step="0.01" min="0" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
          </div>
          <div>
            <Label>{form.id ? 'Estoque atual' : 'Estoque inicial'}</Label>
            <Input type="number" step="0.001" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
          </div>
          <div>
            <Label>Estoque mínimo</Label>
            <Input type="number" step="0.001" min="0" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <label htmlFor="active" className="text-sm text-neutral-700">
              Produto ativo (aparece nas vendas)
            </label>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-[#d03b3b]">{error}</p>}
        <p className="mt-3 text-xs text-neutral-400">
          {form.id
            ? 'Alterar o estoque aqui faz um ajuste direto. Para registrar entrada/saída com motivo, use a tela de Estoque.'
            : ''}
        </p>
        <Button className="mt-4 w-full" onClick={handleSave}>
          Salvar
        </Button>
      </Modal>
    </Card>
  )
}
