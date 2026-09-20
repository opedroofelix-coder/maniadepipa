import { useEffect, useId, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
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
    if (!name.trim()) return
    setSaving(true)
    const { error: saveError } = await supabase.from('categories').insert({ name: name.trim() })
    setSaving(false)
    if (saveError) {
      setError('Não foi possível salvar. Talvez já exista uma categoria com esse nome.')
      return
    }
    setName('')
    setOpen(false)
    setError(null)
    load()
  }

  async function handleDelete() {
    if (!toDelete) return
    setListError(null)
    const { error: deleteError } = await supabase.from('categories').delete().eq('id', toDelete.id)
    setToDelete(null)
    if (deleteError) {
      setListError('Não foi possível remover a categoria.')
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
              <IconButton tone="danger" onClick={() => setToDelete(cat)} aria-label={`Remover ${cat.name}`}>
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
        message={`Remover a categoria "${toDelete?.name ?? ''}"? Os produtos vinculados ficarão sem categoria.`}
        confirmLabel="Remover"
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </Card>
  )
}
