import { format } from 'date-fns'
import { roundMoney } from './number'
import type { RaffleStatus } from '../types/database'

/**
 * Contas da rifa. A tela de Rifas e o Dashboard usam estas funções, para que o
 * lucro de uma rifa seja o mesmo número nos dois lugares.
 *
 * Regra do lucro por dia (escolhida pela loja): cada cota carrega a sua parte do
 * custo dos prêmios (custo ÷ total de cotas). Uma cota vendida soma ao lucro do
 * dia o valor da cota menos essa parte. Ao encerrar, o custo das cotas que não
 * foram vendidas entra no dia do encerramento, e o total fecha em
 * "recebido − custo dos prêmios".
 */

/** O mínimo de uma rifa que as contas precisam (as colunas que a tela já busca). */
export interface RaffleForMath {
  status: RaffleStatus
  ticket_price: number | null
  total_tickets: number | null
  amount_received: number | null
  closed_at: string | null
  raffle_items: { quantity: number; cost_price_at_raffle: number }[]
  raffle_ticket_sales: { sale_date: string; quantity: number }[]
}

/** Custo dos prêmios pelo preço de custo gravado quando cada prêmio entrou na rifa. */
export function prizeCost(raffle: RaffleForMath): number {
  return roundMoney(raffle.raffle_items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.cost_price_at_raffle), 0))
}

export function soldTickets(raffle: RaffleForMath): number {
  return raffle.raffle_ticket_sales.reduce((sum, s) => sum + Number(s.quantity), 0)
}

/** Rifa com valor e total de cotas definidos: só então dá para registrar cotas. */
export function hasTickets(raffle: RaffleForMath): boolean {
  return raffle.ticket_price !== null && raffle.total_tickets !== null
}

/** Quanto a rifa rende vendendo todas as cotas. */
export function raffleValue(raffle: RaffleForMath): number | null {
  if (!hasTickets(raffle)) return null
  return roundMoney(Number(raffle.total_tickets) * Number(raffle.ticket_price))
}

/** Dinheiro das cotas já vendidas. */
export function collected(raffle: RaffleForMath): number {
  return roundMoney(soldTickets(raffle) * Number(raffle.ticket_price ?? 0))
}

/** Parte do custo dos prêmios que cada cota carrega. */
export function costPerTicket(raffle: RaffleForMath): number | null {
  if (!hasTickets(raffle)) return null
  return prizeCost(raffle) / Number(raffle.total_tickets)
}

export function profitPerTicket(raffle: RaffleForMath): number | null {
  const cost = costPerTicket(raffle)
  return cost === null ? null : Number(raffle.ticket_price) - cost
}

/** Lucro se vender todas as cotas. */
export function estimatedProfit(raffle: RaffleForMath): number | null {
  const value = raffleValue(raffle)
  return value === null ? null : roundMoney(value - prizeCost(raffle))
}

/** % de ganho: lucro estimado sobre o custo dos prêmios. */
export function gainPercent(raffle: RaffleForMath): number | null {
  const profit = estimatedProfit(raffle)
  const cost = prizeCost(raffle)
  return profit === null || cost === 0 ? null : (profit / cost) * 100
}

/** Margem: lucro estimado sobre o valor da rifa. */
export function marginPercent(raffle: RaffleForMath): number | null {
  const profit = estimatedProfit(raffle)
  const value = raffleValue(raffle)
  return profit === null || !value ? null : (profit / value) * 100
}

/** Lucro das cotas já vendidas, pela regra do custo dividido por cota. */
export function soldProfit(raffle: RaffleForMath): number | null {
  const perTicket = profitPerTicket(raffle)
  return perTicket === null ? null : roundMoney(soldTickets(raffle) * perTicket)
}

/** Quantas cotas pagam os prêmios. */
export function breakEvenTickets(raffle: RaffleForMath): number | null {
  if (!hasTickets(raffle)) return null
  return Math.ceil(prizeCost(raffle) / Number(raffle.ticket_price))
}

/** Resultado de uma rifa encerrada: o que foi recebido menos o custo dos prêmios. */
export function finalResult(raffle: RaffleForMath): number | null {
  if (raffle.status !== 'encerrada' || raffle.amount_received === null) return null
  return roundMoney(Number(raffle.amount_received) - prizeCost(raffle))
}

export interface RaffleDayEntry {
  date: string // yyyy-MM-dd
  money: number
  profit: number
}

/**
 * O que a rifa leva ao Dashboard, dia a dia: o dinheiro e o lucro das cotas de
 * cada dia e, no dia do encerramento, o acerto final (o custo das cotas não
 * vendidas e a diferença entre o recebido e o valor das cotas). Rifa cancelada
 * não entra. Rifa antiga, sem cotas, entra inteira no dia do encerramento.
 */
export function raffleDailyEntries(raffle: RaffleForMath): RaffleDayEntry[] {
  if (raffle.status === 'cancelada') return []
  const price = Number(raffle.ticket_price ?? 0)
  const perTicket = profitPerTicket(raffle) ?? 0
  const entries: RaffleDayEntry[] = raffle.raffle_ticket_sales.map((s) => ({
    date: s.sale_date,
    money: roundMoney(Number(s.quantity) * price),
    profit: roundMoney(Number(s.quantity) * perTicket),
  }))

  if (raffle.status === 'encerrada' && raffle.closed_at && raffle.amount_received !== null) {
    const sold = soldTickets(raffle)
    const moneyAdjust = Number(raffle.amount_received) - sold * price
    // o que ainda falta do custo: tudo numa rifa sem cotas, ou a parte das cotas não vendidas
    const costLeft = prizeCost(raffle) - sold * (costPerTicket(raffle) ?? 0)
    const entry = {
      date: format(new Date(raffle.closed_at), 'yyyy-MM-dd'),
      money: roundMoney(moneyAdjust),
      profit: roundMoney(moneyAdjust - costLeft),
    }
    if (entry.money !== 0 || entry.profit !== 0) entries.push(entry)
  }
  return entries
}

/** "62%" / "160%" / "33,3%": sem casas quando passa de 100, uma quando é pequeno. */
export function formatPercent(value: number): string {
  const digits = Math.abs(value) >= 100 || Number.isInteger(value) ? 0 : Math.abs(value) < 10 ? 1 : 0
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`
}
