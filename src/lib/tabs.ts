import { useSearchParams } from 'react-router-dom'

/**
 * Aba ativa guardada na URL (?aba=clientes), para os atalhos do Dashboard
 * abrirem a página já na aba certa. Valor desconhecido cai na aba padrão.
 */
export function useTabParam(ids: string[], fallback: string): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams()
  const current = params.get('aba')
  const tab = current && ids.includes(current) ? current : fallback
  // replace: trocar de aba não deve encher o histórico do botão voltar
  const setTab = (id: string) => setParams(id === fallback ? {} : { aba: id }, { replace: true })
  return [tab, setTab]
}
