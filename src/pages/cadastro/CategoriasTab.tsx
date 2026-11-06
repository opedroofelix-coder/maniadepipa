import { useEffect, useId, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { failureMessage } from '../../lib/errors'
import { sameName } from '../../lib/names'
import type { Category } from '../../types/database'
import { Button, Card, ConfirmDialog, EmptyState, IconButton, Input, Label, Loader, Modal } from '../../components/ui'

export function CategoriasTab() {
  const fieldId = useId()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Category | null>(null)
  // quantos produtos usam a categoria a remover; null enquanto confere
  const [inUse, setInUse] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').order('name')
    setCategories((data as Category[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate() {
    // o Enter do campo também chama aqui: sem esta trava, Enter duas vezes salvava duas
    if (saving) return
    if (!name.trim()) {
      setError('Informe o nome da categoria.')
      return
    }
    // o banco só barra o nome idêntico; "pipas" e "Acessorios" passavam ao lado de "Pipas" e "Acessórios"
    const existing = categories.find((c) => sameName(c.name, name))
    if (existing) {
      setError(`Já existe a categoria "${existing.name}".`)
      return
    }
    setSaving(true)
    const { error: saveError } = await supabase.from('categories').insert({ name: name.trim() })
    setSaving(false)
    if (saveError) {
      setError(failureMessage(saveError, 'Não foi possível salvar. Talvez já exista uma categoria com esse nome.'))
      return
    }
    setName('')
    setOpen(false)
    setError(null)
    load()
  }

  async function askDelete(category: Category) {
    setToDelete(category)
    setInUse(null)
    const { data } = await supabase.from('products').select('id').eq('category_id', category.id)
    setInUse(data?.length ?? 0)
  }

  async function handleDelete() {
    if (!toDelete) return
    setListError(null)
    const { error: deleteError } = await supabase.from('categories').delete().eq('id', toDelete.id)
    setToDelete(null)
    if (deleteError) {
      setListError(failureMessage(deleteError, 'Não foi possível remover a categoria.'))
      return
    }
    load()
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Categorias</h3>
        <Button
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => {
            setName('')
            setOpen(true)
            setError(null)
          }}
        >
          <Plus size={16} /> Nova categoria
        </Button>
      </div>

      {listError && <p className="mb-3 text-sm text-[#d03b3b]">{listError}</p>}

      {loading ? (
        <Loader />
      ) : categories.length === 0 ? (
        <EmptyState message="Nenhuma categoria cadastrada ainda." />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {categories.map((cat) => (
            <li key={cat.id} className="flex items-center justify-between gap-2 py-1">
              <span className="min-w-0 truncate text-sm text-neutral-800">{cat.name}</span>
              <IconButton tone="danger" onClick={() => askDelete(cat)} aria-label={`Remover ${cat.name}`}>
                <Trash2 size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nova categoria">
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${fieldId}-name`}>Nome</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
          <Button className="w-full" onClick={handleCreate} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Remover categoria"
        message={
          inUse === null
            ? `Conferindo quantos produtos usam "${toDelete?.name ?? ''}"…`
            : inUse === 0
              ? `Remover a categoria "${toDelete?.name ?? ''}"? Nenhum produto usa esta categoria.`
              : `Remover a categoria "${toDelete?.name ?? ''}"? ${inUse === 1 ? '1 produto usa' : `${inUse} produtos usam`} esta categoria e ${inUse === 1 ? 'ficará' : 'ficarão'} sem categoria.`
        }
        confirmLabel="Remover"
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </Card>
  )
}
