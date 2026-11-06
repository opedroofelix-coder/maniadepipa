import { format } from 'date-fns'
import { formatQuantity, roundMoney, parseDecimal, toMoneyInput } from '../../lib/number'
import type { Product, Raffle, RaffleItem, RaffleStatus, RaffleTicketSale } from '../../types/database'

export type RaffleFull = Raffle & { raffle_items: RaffleItem[]; raffle_ticket_sales: RaffleTicketSale[] }

/** Colunas que a lista e o detalhe buscam: a rifa com prêmios e cotas por dia. */
export const RAFFLE_SELECT = '*, raffle_items(*), raffle_ticket_sales(*)'

export const STATUS_LABEL: Record<RaffleStatus, string> = {
  aberta: 'Aberta',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
}

export const STATUS_TONE: Record<RaffleStatus, 'brand' | 'good' | 'neutral'> = {
  aberta: 'brand',
  encerrada: 'good',
  cancelada: 'neutral',
}

export const STALE_MESSAGE = 'Esta rifa já tinha sido encerrada ou cancelada em outra tela. A tela foi atualizada.'

// amount_received e ticket_price são numeric(12,2): acima disso o banco recusa sem explicação
export const MAX_AMOUNT = 9_999_999_999.99

export function resultClass(result: number) {
  return result < 0 ? 'font-bold text-[#a12424]' : 'font-bold text-[#0a6b34]'
}

export function prizeSummary(raffle: RaffleFull): string {
  return raffle.raffle_items.map((i) => `${formatQuantity(Number(i.quantity))}× ${i.description}`).join(', ')
}

/** "Encerrada em 06/11/2026" / "Cancelada em 06/11/2026", para rifa que saiu de aberta. */
export function closedLabel(raffle: Raffle): string | null {
  if (raffle.status === 'aberta' || !raffle.closed_at) return null
  return `${STATUS_LABEL[raffle.status]} em ${format(new Date(raffle.closed_at), 'dd/MM/yyyy')}`
}

/** "15/11/2026" a partir do yyyy-MM-dd do banco, sem passar por fuso horário. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

/**
 * "Pipa Arraia tem 2 un; Carretilha tem 0 un", ou "" quando há estoque para
 * tudo. `byProduct` = quanto cada produto precisa tirar do estoque agora.
 */
export function stockShortage(byProduct: Map<string, number>, products: Product[]): string {
  return Array.from(byProduct)
    .map(([productId, qty]) => {
      const product = products.find((p) => p.id === productId)
      return product && Number(product.stock_quantity) < qty
        ? `${product.name} tem ${formatQuantity(Number(product.stock_quantity))} ${product.unit}`
        : null
    })
    .filter(Boolean)
    .join('; ')
}

// ---------------------------------------------------------------------------
// Valor e total de cotas (Nova rifa e Editar rifa)
// ---------------------------------------------------------------------------

/** O que a pessoa digita: o valor da cota ou o valor total da rifa, e o total de cotas. */
export interface TicketDraft {
  mode: 'cota' | 'total'
  price: string
  total: string
  tickets: string
}

export function emptyTicketDraft(): TicketDraft {
  return { mode: 'cota', price: '', total: '', tickets: '' }
}

export function ticketDraftFrom(raffle: Raffle): TicketDraft {
  if (raffle.ticket_price === null || raffle.total_tickets === null) return emptyTicketDraft()
  const price = Number(raffle.ticket_price)
  return {
    mode: 'cota',
    price: toMoneyInput(price),
    total: toMoneyInput(price * Number(raffle.total_tickets)),
    tickets: String(raffle.total_tickets),
  }
}

export type ParsedTickets = { ticket_price: number | null; total_tickets: number | null } | { error: string }

/**
 * Lê os campos de cota. Tudo em branco é permitido (a rifa fica sem preço e
 * as cotas só podem ser registradas depois). `minTickets` = cotas já vendidas.
 */
export function parseTicketDraft(draft: TicketDraft, minTickets = 0): ParsedTickets {
  const moneyText = draft.mode === 'cota' ? draft.price : draft.total
  if (!moneyText.trim() && !draft.tickets.trim()) return { ticket_price: null, total_tickets: null }
  if (!moneyText.trim() || !draft.tickets.trim()) {
    return { error: 'Preencha o valor e o total de cotas, ou deixe os dois em branco.' }
  }
  const tickets = parseDecimal(draft.tickets)
  if (Number.isNaN(tickets) || tickets <= 0 || !Number.isInteger(tickets)) {
    return { error: 'O total de cotas precisa ser um número inteiro maior que zero.' }
  }
  if (tickets < minTickets) {
    return { error: `Já foram vendidas ${minTickets} cotas: o total não pode ser menor que isso.` }
  }
  const money = parseDecimal(moneyText)
  if (Number.isNaN(money) || money <= 0) {
    return { error: draft.mode === 'cota' ? 'Informe o valor da cota (ex.: 5,00).' : 'Informe o valor total da rifa (ex.: 250,00).' }
  }
  const price = draft.mode === 'cota' ? roundMoney(money) : roundMoney(money / tickets)
  if (price <= 0) return { error: 'Com esse total, a cota sairia por menos de R$ 0,01.' }
  if (price > MAX_AMOUNT || price * tickets > MAX_AMOUNT) return { error: 'Valor alto demais.' }
  return { ticket_price: price, total_tickets: tickets }
}
