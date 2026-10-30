import type { Role } from '../types/database'

/** Quem pode abrir cada página. O menu lateral e os atalhos do Dashboard leem daqui. */
export const ROUTE_ROLES: Record<string, Role[]> = {
  '/': ['dono', 'caixa', 'estoquista'],
  '/vendas': ['dono', 'caixa'],
  '/estoque': ['dono', 'estoquista'],
  '/cadastro': ['dono', 'estoquista'],
  '/relatorios': ['dono'],
}

export function canOpen(path: string, role: Role): boolean {
  return ROUTE_ROLES[path]?.includes(role) ?? false
}
