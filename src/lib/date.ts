/**
 * Converte um período de dias no calendário local (valores de <input type="date">,
 * ex.: "2026-09-27") no intervalo UTC equivalente, para filtrar created_at
 * (timestamptz) no Supabase com .gte()/.lte().
 *
 * Uma string com horário mas sem offset ("2026-09-27T00:00:00") é interpretada
 * pelo motor JS como horário LOCAL — diferente de uma string só de data, que o
 * spec do ECMAScript manda tratar como UTC. É essa diferença que faz
 * new Date(...) + .toISOString() converter certo para o fuso horário real do
 * navegador, sem fixar o offset de Brasília no código.
 */
export function localDayRangeToUtcIso(startDay: string, endDay: string): { startIso: string; endIso: string } {
  return {
    startIso: new Date(`${startDay}T00:00:00`).toISOString(),
    endIso: new Date(`${endDay}T23:59:59.999`).toISOString(),
  }
}
