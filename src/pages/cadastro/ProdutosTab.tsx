import { useEffect, useId, useState } from 'react'
import { Plus, Pencil, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatQuantity, toDecimal } from '../../lib/number'
import type { Category, Product } from '../../types/database'
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
  Modal,
  Select,
  TableScroll,
  formatCurrency,
} from '../../components/ui'

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
  const fieldId = useId()
  const [products, setProducts] = useState<ProductWithCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Product | null>(null)
  const [toDeactivate, setToDeactivate] = useState<Product | null>(null)

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

  async function handleDelete() {
    if (!toDelete) return
    const product = toDelete
    setListError(null)
    const { error: deleteError } = await supabase.from('products').delete().eq('id', product.id)
    setToDelete(null)
    if (!deleteError) {
      load()
      return
    }
    // sale_items referencia products sem on delete: produto já vendido não sai
    const isInUse = deleteError.code === '23503' || deleteError.message.includes('foreign key')
    if (!isInUse) {
      setListError('Não foi possível excluir o produto.')
      return
    }
    setToDeactivate(product)
  }

  async function handleDeactivate() {
    if (!toDeactivate) return
    const { error: updateError } = await supabase
      .from('products')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', toDeactivate.id)
    setToDeactivate(null)
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
    setSaving(true)
    const payload = {
      code: form.code.trim() || null,
      name: form.name.trim(),
      category_id: form.category_id || null,
      unit: form.unit,
      cost_price: toDecimal(form.cost_price),
      sale_price: toDecimal(form.sale_price),
      stock_quantity: toDecimal(form.stock_quantity),
      min_stock: toDecimal(form.min_stock),
      active: form.active,
      updated_at: new Date().toISOString(),
    }

    const query = form.id
      ? supabase.from('products').update(payload).eq('id', form.id)
      : supabase.from('products').insert(payload)

    const { error: saveError } = await query
    setSaving(false)
    if (saveError) {
      setError(
        saveError.message.includes('duplicate')
          ? 'Já existe um produto com esse código.'
          : 'Não foi possível salvar o produto.',
      )
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Buscar por nome ou código"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar produto"
          />
        </div>
        <Button size="sm" onClick={openCreate} className="w-full sm:w-auto">
          <Plus size={16} /> Novo produto
        </Button>
      </div>

      {listError && <p className="mb-3 text-sm text-[#d03b3b]">{listError}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState message="Nenhum produto encontrado." />
      ) : (
        <TableScroll>
          <table className="w-full min-w-[820px] text-left text-sm">
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
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    <span
                      className={p.stock_quantity <= p.min_stock ? 'font-medium text-[#d03b3b]' : 'text-neutral-700'}
                    >
                      {formatQuantity(Number(p.stock_quantity))} {p.unit}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={p.active ? 'good' : 'neutral'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end">
                      <IconButton onClick={() => openEdit(p)} aria-label={`Editar ${p.name}`}>
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton tone="danger" onClick={() => setToDelete(p)} aria-label={`Excluir ${p.name}`}>
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Editar produto' : 'Novo produto'} wide>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${fieldId}-code`}>Código / código de barras</Label>
            <Input
              id={`${fieldId}-code`}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-unit`}>Unidade</Label>
            <Select
              id={`${fieldId}-unit`}
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            >
              <option value="un">un</option>
              <option value="kg">kg</option>
              <option value="m">m</option>
              <option value="cx">cx</option>
              <option value="l">l</option>
              <option value="pct">pct</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${fieldId}-name`}>Nome</Label>
            <Input
              id={`${fieldId}-name`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${fieldId}-category`}>Categoria</Label>
            <Select
              id={`${fieldId}-category`}
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${fieldId}-cost`}>Preço de custo</Label>
            <DecimalInput
              id={`${fieldId}-cost`}
              value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-price`}>Preço de venda</Label>
            <DecimalInput
              id={`${fieldId}-price`}
              value={form.sale_price}
              onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-stock`}>{form.id ? 'Estoque atual' : 'Estoque inicial'}</Label>
            <DecimalInput
              id={`${fieldId}-stock`}
              value={form.stock_quantity}
              onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-min`}>Estoque mínimo</Label>
            <DecimalInput
              id={`${fieldId}-min`}
              value={form.min_stock}
              onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id={`${fieldId}-active`}
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <label htmlFor={`${fieldId}-active`} className="text-sm text-neutral-700">
              Produto ativo (aparece nas vendas)
            </label>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-[#d03b3b]">{error}</p>}
        {form.id && (
          <p className="mt-3 text-xs text-neutral-400">
            Alterar o estoque aqui faz um ajuste direto. Para registrar entrada/saída com motivo, use a tela de Estoque.
          </p>
        )}
        <Button className="mt-4 w-full" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir produto"
        message={`Excluir o produto "${toDelete?.name ?? ''}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />

      <ConfirmDialog
        open={toDeactivate !== null}
        title="Produto com vendas registradas"
        message={`"${toDeactivate?.name ?? ''}" já tem vendas registradas e não pode ser excluído, senão o histórico ficaria quebrado. Deseja inativá-lo? Ele deixa de aparecer no PDV.`}
        confirmLabel="Inativar"
        tone="primary"
        onConfirm={handleDeactivate}
        onClose={() => setToDeactivate(null)}
      />
    </Card>
  )
}
