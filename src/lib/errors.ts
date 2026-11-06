/**
 * Mensagem para uma leitura ou gravação que falhou. Quando a causa é a rede
 * (aparelho offline ou o fetch nem chegou ao servidor), diz isso em vez do
 * genérico "Não foi possível…", que fazia parecer erro do sistema.
 */
export function failureMessage(error: { message?: string } | null | undefined, fallback: string): string {
  const network = !navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(error?.message ?? '')
  return network ? 'Sem internet. Confira a conexão e tente de novo.' : fallback
}
