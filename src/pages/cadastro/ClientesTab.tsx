import { useEffect, useState } from 'react'
import { Plus, Pencil, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Customer } from '../../types/database'
import { Button, Card, EmptyState, Input, Label, Modal } from '../../components/ui'

const emptyForm = { id: '', name: '', phone: '', email: '', document: '', notes: '' }

export function ClientesTab() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('name')
    setCustomers((data as Customer[]) ?? [])
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

  function openEdit(c: Customer) {
    setForm({ id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '', document: c.document ?? '', notes: c.notes ?? '' })
    setError(null)
    setOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      document: form.document.trim() || null,
      notes: form.notes.trim() || null,
    }
    const query = form.id
      ? supabase.from('customers').update(payload).eq('id', form.id)
      : supabase.from('customers').insert(payload)
    const { error } = await query
    if (error) {
      setError('Não foi possível salvar o cliente.')
      return
    }
    setOpen(false)
    load()
  }

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input placeholder="Buscar cliente" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} /> Novo cliente
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState message="Nenhum cliente cadastrado ainda." />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {filtered.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-neutral-900">{c.name}</p>
                <p className="text-xs text-neutral-500">{[c.phone, c.email].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <button onClick={() => openEdit(c)} className="text-neutral-400 hover:text-[#d6247a]" aria-label="Editar">
                <Pencil size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Editar cliente' : 'Novo cliente'}>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>CPF/CNPJ</Label>
            <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          </div>
          {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
          <Button className="w-full" onClick={handleSave}>
            Salvar
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
