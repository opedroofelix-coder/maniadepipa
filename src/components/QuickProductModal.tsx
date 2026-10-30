import { useId, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { parseDecimal, roundMoney } from '../lib/number'
import { Button, DecimalInput, Input, Label, Modal, formatCurrency } from './ui'

const emptyForm = { name: '', cost: '', sale: '' }

/**
 * Cadastro de produto só com nome, custo e venda. O resto (categoria,
 * unidade, estoque, código) fica no padrão do banco e é completado depois
 * em Cadastro > Produtos. Montado só enquanto aberto, então cada abertura
 * começa com o formulário limpo.
 */
export function QuickProductModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: (name: string) => void
}) {
  const fieldId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const cost = parseDecimal(form.cost)
  const sale = parseDecimal(form.sale)
  const hasPrices = !Number.isNaN(cost) && !Number.isNaN(sale) && sale > 0
  const profit = hasPrices ? roundMoney(sale - cost) : 0
  const margin = hasPrices ? Math.round((profit / sale) * 100) : 0

  async function save(another: boolean) {
    const name = form.name.trim()
    if (!name) return setError('Informe o nome do produto.')
    if (Number.isNaN(cost) || cost < 0) return setError('Preço de custo inválido. Use, por exemplo, 3,20.')
    if (Number.isNaN(sale) || sale <= 0) return setError('Informe um preço de venda maior que zero.')

    setSaving(true)
    setError(null)
    const { error: saveError } = await supabase
      .from('products')
      .insert({ name, cost_price: roundMoney(cost), sale_price: roundMoney(sale) })
    setSaving(false)
    if (saveError) {
      setError('Não foi possível salvar o produto. Confira a internet e tente de novo.')
      return
    }

    onSaved(name)
    if (!another) {
      onClose()
      return
    }
    setForm(emptyForm)
    setSaved(`${name} cadastrado. Pode mandar o próximo.`)
    nameRef.current?.focus()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    save(false)
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title="Cadastro rápido">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <p className="-mt-2 text-sm font-semibold text-[#52607a]">Só o essencial. O resto você completa depois.</p>

        <div>
          <Label htmlFor={`${fieldId}-name`}>Nome do produto</Label>
          <Input
            id={`${fieldId}-name`}
            ref={nameRef}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex.: Pipa Raia 60 cm"
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`${fieldId}-cost`}>Preço de custo (R$)</Label>
            <DecimalInput
              id={`${fieldId}-cost`}
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-sale`}>Preço de venda (R$)</Label>
            <DecimalInput
              id={`${fieldId}-sale`}
              value={form.sale}
              onChange={(e) => setForm({ ...form, sale: e.target.value })}
              placeholder="0,00"
            />
          </div>
        </div>

        {hasPrices &&
          (profit >= 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#ddf7e8] px-4 py-3 text-[#0a6b34]">
              <span className="text-sm font-bold">Lucro por unidade</span>
              <span className="font-display text-xl font-extrabold">
                {formatCurrency(profit)} · margem {margin}%
              </span>
            </div>
          ) : (
            <p className="rounded-2xl bg-[#fde4e4] px-4 py-3 text-sm font-extrabold text-[#a12424]">
              Preço de venda abaixo do custo: prejuízo de {formatCurrency(Math.abs(profit))} por unidade.
            </p>
          ))}

        {error && <p className="text-sm font-bold text-[#a12424]">{error}</p>}
        {saved && (
          <p role="status" className="text-sm font-bold text-[#0a6b34]">
            {saved}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => save(true)} disabled={saving}>
            Salvar e cadastrar outro
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
