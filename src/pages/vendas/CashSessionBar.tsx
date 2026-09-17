import { useState } from 'react'
import { Lock, Unlock, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { CashSession, CashMovementType } from '../../types/database'
import { Button, Card, Input, Label, Modal, Select, formatCurrency } from '../../components/ui'

export function CashSessionBar({
  session,
  onChanged,
}: {
  session: CashSession | null
  onChanged: () => void
}) {
  const { profile } = useAuth()
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [moveModal, setMoveModal] = useState(false)
  const [openingAmount, setOpeningAmount] = useState('0')
  const [closingAmount, setClosingAmount] = useState('0')
  const [moveType, setMoveType] = useState<CashMovementType>('sangria')
  const [moveAmount, setMoveAmount] = useState('0')
  const [moveReason, setMoveReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleOpen() {
    const { error } = await supabase.from('cash_sessions').insert({
      cashier_id: profile?.id ?? null,
      opening_amount: Number(openingAmount) || 0,
      status: 'open',
    })
    if (error) {
      setError('Não foi possível abrir o caixa.')
      return
    }
    setOpenModal(false)
    onChanged()
  }

  async function handleClose() {
    if (!session) return
    const { error } = await supabase
      .from('cash_sessions')
      .update({ closing_amount: Number(closingAmount) || 0, closed_at: new Date().toISOString(), status: 'closed' })
      .eq('id', session.id)
    if (error) {
      setError('Não foi possível fechar o caixa.')
      return
    }
    setCloseModal(false)
    onChanged()
  }

  async function handleMovement() {
    if (!session) return
    const amount = Number(moveAmount)
    if (!amount || amount <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }
    const { error } = await supabase.from('cash_movements').insert({
      session_id: session.id,
      type: moveType,
      amount,
      reason: moveReason.trim() || null,
    })
    if (error) {
      setError('Não foi possível registrar a movimentação.')
      return
    }
    setMoveModal(false)
    setMoveAmount('0')
    setMoveReason('')
    onChanged()
  }

  if (!session) {
    return (
      <Card className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lock size={18} className="text-neutral-400" />
          <div>
            <p className="text-sm font-medium text-neutral-900">Caixa fechado</p>
            <p className="text-xs text-neutral-500">Abra o caixa para começar a vender.</p>
          </div>
        </div>
        <Button onClick={() => setOpenModal(true)}>Abrir caixa</Button>

        <Modal open={openModal} onClose={() => setOpenModal(false)} title="Abrir caixa">
          <div className="space-y-4">
            <div>
              <Label>Valor inicial (troco)</Label>
              <Input type="number" step="0.01" min="0" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} autoFocus />
            </div>
            {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
            <Button className="w-full" onClick={handleOpen}>
              Abrir
            </Button>
          </div>
        </Modal>
      </Card>
    )
  }

  return (
    <Card className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Unlock size={18} className="text-[#0ca30c]" />
        <div>
          <p className="text-sm font-medium text-neutral-900">Caixa aberto</p>
          <p className="text-xs text-neutral-500">Abertura: {formatCurrency(session.opening_amount)}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setMoveModal(true)}>
          <Wallet size={16} /> Sangria / suprimento
        </Button>
        <Button variant="danger" size="sm" onClick={() => setCloseModal(true)}>
          Fechar caixa
        </Button>
      </div>

      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Fechar caixa">
        <div className="space-y-4">
          <div>
            <Label>Valor contado na gaveta</Label>
            <Input type="number" step="0.01" min="0" value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} autoFocus />
          </div>
          {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
          <Button className="w-full" variant="danger" onClick={handleClose}>
            Confirmar fechamento
          </Button>
        </div>
      </Modal>

      <Modal open={moveModal} onClose={() => setMoveModal(false)} title="Sangria / suprimento">
        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={moveType} onChange={(e) => setMoveType(e.target.value as CashMovementType)}>
              <option value="sangria">Sangria (retirada)</option>
              <option value="suprimento">Suprimento (reforço)</option>
            </Select>
          </div>
          <div>
            <Label>Valor</Label>
            <Input type="number" step="0.01" min="0" value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input value={moveReason} onChange={(e) => setMoveReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
          <Button className="w-full" onClick={handleMovement}>
            Registrar
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
