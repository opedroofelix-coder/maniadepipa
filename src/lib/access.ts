import type { Role } from '../types/database'

/** Quem pode abrir cada página. O menu lateral e os atalhos do Dashboard leem daqui. */
export const ROUTE_ROLES: Record<string, Role[]> = {
  '/': ['dono', 'caixa', 'estoquista'],
  '/vendas': ['dono', 'caixa'],
  '/estoque': ['dono', 'estoquista'],
  '/cadastro': ['dono', 'estoquista'],
  '/relatorios': ['dono'],
  '/rifas': ['dono'],
}

export function canOpen(path: string, role: Role): boolean {
  return ROUTE_ROLES[path]?.includes(role) ?? false
}

/**
 * Rota que o papel não pode abrir. Só vale para as páginas da tabela acima:
 * endereço desconhecido segue para a página "não encontrada".
 */
export function isForbidden(path: string, role: Role): boolean {
  // "/rifas/" abre a mesma página que "/rifas"
  const page = path.replace(/\/+$/, '') || '/'
  return page in ROUTE_ROLES && !canOpen(page, role)
}
