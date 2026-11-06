import { parseDecimal, roundMoney } from '../../lib/number'
import {
  breakEvenTickets,
  estimatedProfit,
  formatPercent,
  gainPercent,
  marginPercent,
  raffleValue,
  type RaffleForMath,
} from '../../lib/raffles'
import { ChoiceButton, DecimalInput, Label, formatCurrency } from '../../components/ui'
import { parseTicketDraft, type TicketDraft } from './shared'

/**
 * Campos de valor/total de cotas com o cálculo ao vivo. `prizeCostValue` é o
 * custo dos prêmios que a rifa terá; `minTickets`, as cotas já vendidas.
 */
export function TicketFields({
  idPrefix,
  draft,
  onChange,
  prizeCostValue,
  minTickets = 0,
}: {
  idPrefix: string
  draft: TicketDraft
  onChange: (draft: TicketDraft) => void
  prizeCostValue: number
  minTickets?: number
}) {
  const parsed = parseTicketDraft(draft, minTickets)
  const preview: RaffleForMath | null =
    'error' in parsed || parsed.ticket_price === null
      ? null
      : {
          status: 'aberta',
          ticket_price: parsed.ticket_price,
          total_tickets: parsed.total_tickets,
          amount_received: null,
          closed_at: null,
          // o custo já somado vira um prêmio só, que é o que as contas precisam
          raffle_items: [{ quantity: 1, cost_price_at_raffle: prizeCostValue }],
          raffle_ticket_sales: [],
        }
  const notExact =
    preview !== null && draft.mode === 'total' && roundMoney(Number(preview.ticket_price) * Number(preview.total_tickets)) !== roundMoney(parseDecimal(draft.total))

  return (
    <div className="space-y-3">
      <div>
        <p id={`${idPrefix}-modo`} className="mb-1.5 text-[13px] font-extrabold text-[#0e2240]">
          Como você quer informar o valor?
        </p>
        <div role="group" aria-labelledby={`${idPrefix}-modo`} className="grid grid-cols-2 gap-2">
          <ChoiceButton selected={draft.mode === 'cota'} onClick={() => onChange({ ...draft, mode: 'cota' })}>
            Valor da cota
          </ChoiceButton>
          <ChoiceButton selected={draft.mode === 'total'} onClick={() => onChange({ ...draft, mode: 'total' })}>
            Valor total da rifa
          </ChoiceButton>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          {draft.mode === 'cota' ? (
            <>
              <Label htmlFor={`${idPrefix}-price`}>Valor da cota (R$)</Label>
              <DecimalInput
                id={`${idPrefix}-price`}
                value={draft.price}
                onChange={(e) => onChange({ ...draft, price: e.target.value })}
                placeholder="5,00"
              />
            </>
          ) : (
            <>
              <Label htmlFor={`${idPrefix}-total`}>Valor total da rifa (R$)</Label>
              <DecimalInput
                id={`${idPrefix}-total`}
                value={draft.total}
                onChange={(e) => onChange({ ...draft, total: e.target.value })}
                placeholder="250,00"
              />
            </>
          )}
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-tickets`}>Total de cotas</Label>
          <DecimalInput
            id={`${idPrefix}-tickets`}
            inputMode="numeric"
            value={draft.tickets}
            onChange={(e) => onChange({ ...draft, tickets: e.target.value })}
            placeholder="50"
          />
        </div>
      </div>
      {minTickets > 0 && (
        <p className="text-xs font-semibold text-[#52607a]">Já foram vendidas {minTickets} cotas: o total não pode ser menor.</p>
      )}

      {preview && (
        <div className="rounded-2xl bg-[#eaf6ff] p-4">
          <p className="mb-2 text-xs font-extrabold tracking-wide text-[#52607a] uppercase">Com esses números</p>
          {draft.mode === 'total' && (
            <p className="mb-2 text-sm font-bold text-[#0e2240]">
              Cada cota sai a {formatCurrency(Number(preview.ticket_price))}
              {notExact && ` (o total fica ${formatCurrency(raffleValue(preview) ?? 0)})`}.
            </p>
          )}
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <Figure label="Valor da rifa" value={formatCurrency(raffleValue(preview) ?? 0)} />
            <Figure label="Custo dos prêmios" value={formatCurrency(prizeCostValue)} />
            <Figure label="Lucro estimado" value={formatCurrency(estimatedProfit(preview) ?? 0)} good />
            <Figure label="% de ganho" value={gainPercent(preview) === null ? '—' : formatPercent(gainPercent(preview) as number)} good />
            <Figure label="Margem" value={marginPercent(preview) === null ? '—' : formatPercent(marginPercent(preview) as number)} />
            <Figure label="Empate" value={`${breakEvenTickets(preview)} cotas`} />
          </dl>
        </div>
      )}
    </div>
  )
}

function Figure({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[#52607a]">{label}</dt>
      <dd className={good ? 'font-display text-lg font-extrabold text-[#0a6b34]' : 'font-display text-lg font-extrabold text-[#0e2240]'}>
        {value}
      </dd>
    </div>
  )
}
