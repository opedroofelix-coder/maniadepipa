import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Category } from '../../types/database'
import { Button, Card, EmptyState, Input, Modal, Label } from '../../components/ui'

export function CategoriasTab() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

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
    const { error } = await supabase.from('categories').insert({ name: name.trim() })
    if (error) {
      setError('Não foi possível salvar. Talvez já exista uma categoria com esse nome.')
      return
    }
    setName('')
    setOpen(false)
    setError(null)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta categoria? Produtos vinculados ficarão sem categoria.')) return
    await supabase.from('categories').delete().eq('id', id)
    load()
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Categorias</h3>
        <Button
          size="sm"
          onClick={() => {
            setOpen(true)
            setError(null)
          }}
        >
          <Plus size={16} /> Nova categoria
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : categories.length === 0 ? (
        <EmptyState message="Nenhuma categoria cadastrada ainda." />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {categories.map((cat) => (
            <li key={cat.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-neutral-800">{cat.name}</span>
              <button onClick={() => handleDelete(cat.id)} className="text-neutral-400 hover:text-[#d03b3b]" aria-label="Remover">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nova categoria">
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
          </div>
          {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
          <Button className="w-full" onClick={handleCreate}>
            Salvar
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
