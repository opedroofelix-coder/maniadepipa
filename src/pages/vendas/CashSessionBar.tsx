import { useEffect, useId, useState } from 'react'
import { Lock, Unlock, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { toDecimal } from '../../lib/number'
import type { CashSession, CashMovementType } from '../../types/database'
import { Button, Card, DecimalInput, Label, Modal, Select, formatCurrency } from '../../components/ui'

export function CashSessionBar({ session, onChanged }: { session: CashSession | null; onChanged: () => void }) {
  const { profile } = useAuth()
  const fieldId = useId()
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [moveModal, setMoveModal] = useState(false)
  const [openingAmount, setOpeningAmount] = useState('0')
  const [closingAmount, setClosingAmount] = useState('0')
  const [moveType, setMoveType] = useState<CashMovementType>('sangria')
  const [moveAmount, setMoveAmount] = useState('0')
  const [moveReason, setMoveReason] = useState('')
  // um erro por modal: antes um erro de "abrir caixa" reaparecia no de sangria
  const [openError, setOpenError] = useState<string | null>(null)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [expected, setExpected] = useState<number | null>(null)

  // valor esperado na gaveta ao fechar: abertura + vendas em dinheiro da sessão
  // + suprimentos - sangrias. Preenche o expected_amount, que nunca era gravado.
  useEffect(() => {
    if (!closeModal || !session) return
    let cancelled = false
    async function loadExpected(current: CashSession) {
      const [{ data: sales }, { data: movements }] = await Promise.all([
        supabase.from('sales').select('id').eq('session_id', current.id).eq('status', 'completed'),
        supabase.from('cash_movements').select('type, amount').eq('session_id', current.id),
      ])
      const saleIds = (sales ?? []).map((s) => s.id as string)
      const { data: payments } =
        saleIds.length > 0
          ? await supabase.from('sale_payments').select('amount').eq('method', 'dinheiro').in('sale_id', saleIds)
          : { data: [] as { amount: number }[] }

      const cash = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
      const movementsTotal = (movements ?? []).reduce(
        (sum, m) => sum + (m.type === 'suprimento' ? Number(m.amount) : -Number(m.amount)),
        0,
      )
      if (!cancelled) setExpected(Number(current.opening_amount) + cash + movementsTotal)
    }
    setExpected(null)
    loadExpected(session)
    return () => {
      cancelled = true
    }
  }, [closeModal, session])

  function startOpen() {
    setOpeningAmount('0')
    setOpenError(null)
    setOpenModal(true)
  }

  function startClose() {
    setClosingAmount('0')
    setCloseError(null)
    setCloseModal(true)
  }

  function startMove() {
    setMoveType('sangria')
    setMoveAmount('0')
    setMoveReason('')
    setMoveError(null)
    setMoveModal(true)
  }

  async function handleOpen() {
    setSaving(true)
    setOpenError(null)
    // reconferir logo antes de gravar: evita duas sessões por duplo clique ou
    // por duas abas abertas ao mesmo tempo
    const { data: alreadyOpen } = await supabase.from('cash_sessions').select('id').eq('status', 'open').limit(1)
    if (alreadyOpen && alreadyOpen.length > 0) {
      setOpenError('Já existe um caixa aberto. Atualizando…')
      setSaving(false)
      onChanged()
      return
    }
    const { error } = await supabase.from('cash_sessions').insert({
      cashier_id: profile?.id ?? null,
      opening_amount: toDecimal(openingAmount),
      status: 'open',
    })
    setSaving(false)
    if (error) {
      setOpenError('Não foi possível abrir o caixa.')
      return
    }
    setOpenModal(false)
    onChanged()
  }

  async function handleClose() {
    if (!session) return
    setSaving(true)
    setCloseError(null)
    const { error } = await supabase
      .from('cash_sessions')
      .update({
        closing_amount: toDecimal(closingAmount),
        expected_amount: expected ?? null,
        closed_at: new Date().toISOString(),
        status: 'closed',
      })
      .eq('id', session.id)
    setSaving(false)
    if (error) {
      setCloseError('Não foi possível fechar o caixa.')
      return
    }
    setCloseModal(false)
    onChanged()
  }

  async function handleMovement() {
    if (!session) return
    const amount = toDecimal(moveAmount)
    if (!amount || amount <= 0) {
      setMoveError('Informe um valor maior que zero.')
      return
    }
    setSaving(true)
    setMoveError(null)
    const { error } = await supabase.from('cash_movements').insert({
      session_id: session.id,
      type: moveType,
      amount,
      reason: moveReason.trim() || null,
    })
    setSaving(false)
    if (error) {
      setMoveError('Não foi possível registrar a movimentação.')
      return
    }
    setMoveModal(false)
    setMoveAmount('0')
    setMoveReason('')
    onChanged()
  }

  if (!session) {
    return (
      <Card className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Lock size={18} className="shrink-0 text-neutral-400" />
          <div>
            <p className="text-sm font-medium text-neutral-900">Caixa fechado</p>
            <p className="text-xs text-neutral-500">Abra o caixa para começar a vender.</p>
          </div>
        </div>
        <Button onClick={startOpen} className="w-full sm:w-auto">
          Abrir caixa
        </Button>

        <Modal open={openModal} onClose={() => setOpenModal(false)} title="Abrir caixa">
          <div className="space-y-4">
            <div>
              <Label htmlFor={`${fieldId}-opening`}>Valor inicial (troco)</Label>
              <DecimalInput
                id={`${fieldId}-opening`}
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </div>
            {openError && <p className="text-sm text-[#d03b3b]">{openError}</p>}
            <Button className="w-full" onClick={handleOpen} disabled={saving}>
              {saving ? 'Abrindo…' : 'Abrir'}
            </Button>
          </div>
        </Modal>
      </Card>
    )
  }

  const counted = toDecimal(closingAmount)
  const difference = expected === null ? null : counted - expected

  return (
    <Card className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Unlock size={18} className="shrink-0 text-[#0ca30c]" />
        <div>
          <p className="text-sm font-medium text-neutral-900">Caixa aberto</p>
          <p className="text-xs text-neutral-500">Abertura: {formatCurrency(session.opening_amount)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" size="sm" onClick={startMove}>
          <Wallet size={16} /> Sangria / suprimento
        </Button>
        <Button variant="danger" size="sm" onClick={startClose}>
          Fechar caixa
        </Button>
      </div>

      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Fechar caixa">
        <div className="space-y-4">
          <div className="rounded-lg bg-neutral-50 p-3 text-sm">
            <div className="flex items-center justify-between text-neutral-600">
              <span>Esperado na gaveta</span>
              <span className="font-medium text-neutral-900">
                {expected === null ? 'calculando…' : formatCurrency(expected)}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Abertura + vendas em dinheiro + suprimentos − sangrias.
            </p>
          </div>
          <div>
            <Label htmlFor={`${fieldId}-closing`}>Valor contado na gaveta</Label>
            <DecimalInput
              id={`${fieldId}-closing`}
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
            />
          </div>
          {difference !== null && (
            <div
              className={
                Math.abs(difference) < 0.01
                  ? 'rounded-lg bg-[#0ca30c]/10 px-3 py-2 text-sm text-[#0ca30c]'
                  : 'rounded-lg bg-[#d03b3b]/10 px-3 py-2 text-sm text-[#d03b3b]'
              }
            >
              {Math.abs(difference) < 0.01
                ? 'Caixa confere.'
                : `${difference > 0 ? 'Sobra' : 'Quebra'} de ${formatCurrency(Math.abs(difference))}.`}
            </div>
          )}
          {closeError && <p className="text-sm text-[#d03b3b]">{closeError}</p>}
          <Button className="w-full" variant="danger" onClick={handleClose} disabled={saving}>
            {saving ? 'Fechando…' : 'Confirmar fechamento'}
          </Button>
        </div>
      </Modal>

      <Modal open={moveModal} onClose={() => setMoveModal(false)} title="Sangria / suprimento">
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${fieldId}-move-type`}>Tipo</Label>
            <Select
              id={`${fieldId}-move-type`}
              value={moveType}
              onChange={(e) => setMoveType(e.target.value as CashMovementType)}
            >
              <option value="sangria">Sangria (retirada)</option>
              <option value="suprimento">Suprimento (reforço)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${fieldId}-move-amount`}>Valor</Label>
            <DecimalInput
              id={`${fieldId}-move-amount`}
              value={moveAmount}
              onChange={(e) => setMoveAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-move-reason`}>Motivo</Label>
            <input
              id={`${fieldId}-move-reason`}
              value={moveReason}
              onChange={(e) => setMoveReason(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#d6247a] focus:ring-2 focus:ring-[#d6247a]/20"
            />
          </div>
          {moveError && <p className="text-sm text-[#d03b3b]">{moveError}</p>}
          <Button className="w-full" onClick={handleMovement} disabled={saving}>
            {saving ? 'Registrando…' : 'Registrar'}
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
