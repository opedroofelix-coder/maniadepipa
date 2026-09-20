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
