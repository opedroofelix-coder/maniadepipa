import { useEffect, useId, useState } from 'react'
import { Plus, Pencil, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Customer } from '../../types/database'
import { Button, Card, ConfirmDialog, EmptyState, IconButton, Input, Label, Loader, Modal } from '../../components/ui'

const emptyForm = { id: '', name: '', phone: '', email: '', document: '', notes: '' }

export function ClientesTab() {
  const fieldId = useId()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Customer | null>(null)

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
    setForm({
      id: c.id,
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      document: c.document ?? '',
      notes: c.notes ?? '',
    })
    setError(null)
    setOpen(true)
  }

  async function handleDelete() {
    if (!toDelete) return
    setListError(null)
    const { error: deleteError } = await supabase.from('customers').delete().eq('id', toDelete.id)
    setToDelete(null)
    if (deleteError) {
      setListError('Não foi possível excluir o cliente.')
      return
    }
    load()
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    setSaving(true)
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
    const { error: saveError } = await query
    setSaving(false)
    if (saveError) {
      setError('Não foi possível salvar o cliente.')
      return
    }
    setOpen(false)
    load()
  }

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Buscar cliente"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar cliente"
          />
        </div>
        <Button size="sm" onClick={openCreate} className="w-full sm:w-auto">
          <Plus size={16} /> Novo cliente
        </Button>
      </div>

      {listError && <p className="mb-3 text-sm text-[#d03b3b]">{listError}</p>}

      {loading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <EmptyState message="Nenhum cliente cadastrado ainda." />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {filtered.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{c.name}</p>
                <p className="truncate text-xs text-neutral-500">
                  {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <IconButton onClick={() => openEdit(c)} aria-label={`Editar ${c.name}`}>
                  <Pencil size={16} />
                </IconButton>
                <IconButton tone="danger" onClick={() => setToDelete(c)} aria-label={`Excluir ${c.name}`}>
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Editar cliente' : 'Novo cliente'}>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${fieldId}-name`}>Nome</Label>
            <Input
              id={`${fieldId}-name`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-phone`}>Telefone</Label>
            <Input
              id={`${fieldId}-phone`}
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-email`}>E-mail</Label>
            <Input
              id={`${fieldId}-email`}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-document`}>CPF/CNPJ</Label>
            <Input
              id={`${fieldId}-document`}
              inputMode="numeric"
              value={form.document}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir cliente"
        message={`Excluir o cliente "${toDelete?.name ?? ''}"? As vendas antigas dele continuam no histórico, mas ficam sem cliente vinculado.`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </Card>
  )
}
