// Entrada de números no padrão brasileiro.
// Os campos de dinheiro/quantidade são <input type="text" inputMode="decimal">
// em vez de type="number" porque, dependendo do locale do navegador, o number
// descarta a vírgula silenciosamente e o campo fica vazio sem o operador perceber.

/**
 * Converte o texto digitado em número, aceitando vírgula ou ponto como
 * separador decimal. Retorna NaN quando o texto não representa um número.
 *
 * "12,5" -> 12.5 | "12.5" -> 12.5 | "1.234,56" -> 1234.56 | "abc" -> NaN
 */
export function parseDecimal(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return NaN
  // com vírgula, o ponto é separador de milhar; sem vírgula, o ponto é decimal
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed
  if (!/^-?\d*\.?\d*$/.test(normalized) || normalized === '.' || normalized === '-') return NaN
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

/** Como parseDecimal, mas devolve `fallback` no lugar de NaN. */
export function toDecimal(value: string, fallback = 0): number {
  const parsed = parseDecimal(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

/** true quando o texto é um número válido e maior que zero. */
export function isPositiveDecimal(value: string): boolean {
  const parsed = parseDecimal(value)
  return !Number.isNaN(parsed) && parsed > 0
}

/** Quantidade para exibição: 12.5 -> "12,5" (sem casas decimais inúteis). */
export function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/**
 * Arredonda para centavos, matando o ruído de ponto flutuante do JavaScript.
 * Sem isso, 3 x R$ 1,10 vira 3.3000000000000003 e a conferência do valor
 * recebido recusa o 3,30 que o operador digitou. As colunas de dinheiro são
 * numeric(12,2), então o que a tela mostra, o que é comparado e o que é
 * gravado passam a ser o mesmo número.
 *
 * 3.3000000000000003 -> 3.3 | 0.7000000000000001 -> 0.7
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Como roundMoney, mas com 3 casas: as quantidades são numeric(12,3). */
export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}
