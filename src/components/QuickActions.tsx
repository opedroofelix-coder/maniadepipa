import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, Lock, Plus, ShoppingCart, UserPlus } from 'lucide-react'
import clsx from 'clsx'
import type { Role } from '../types/database'
import { canOpen } from '../lib/access'

const TILE =
  'flex min-h-[92px] flex-col items-start justify-between gap-2.5 rounded-3xl p-4 text-left text-[15px] font-extrabold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#d6247a]'
const TILE_LIGHT = 'bg-white text-[#0e2240] hover:bg-[#f4f8fc]'

/** Ícone dentro de um losango de pipa. */
function Diamond({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className={clsx('flex h-[30px] w-[30px] rotate-45 items-center justify-center rounded-lg', color)}>
      <span className="-rotate-45">{children}</span>
    </span>
  )
}

/**
 * Atalhos do Dashboard. Cada um só aparece para quem pode abrir a página de
 * destino (mesma regra do menu lateral).
 */
export function QuickActions({ role, onQuickProduct }: { role: Role; onQuickProduct: () => void }) {
  const canSell = canOpen('/vendas', role)
  const canRegister = canOpen('/cadastro', role)
  const canStock = canOpen('/estoque', role)

  return (
    <section aria-labelledby="atalhos-titulo" className="mb-6">
      <h2 id="atalhos-titulo" className="mb-2.5 font-display text-[22px] font-extrabold text-[#0e2240]">
        Atalhos
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {canSell && (
          <Link
            to="/vendas"
            className={clsx(TILE, 'bg-[#d6247a] text-white shadow-[0_8px_20px_rgba(214,36,122,0.25)] hover:bg-[#a81760]')}
          >
            <ShoppingCart size={24} aria-hidden="true" />
            Nova venda
          </Link>
        )}
        {canRegister && (
          <button type="button" onClick={onQuickProduct} className={clsx(TILE, TILE_LIGHT)}>
            <Diamond color="bg-[#ffc83c]">
              <Plus size={16} strokeWidth={3} aria-hidden="true" />
            </Diamond>
            Cadastro rápido
          </button>
        )}
        {canStock && (
          <Link to="/estoque?aba=movimentacoes" className={clsx(TILE, TILE_LIGHT)}>
            <Diamond color="bg-[#7fc8ff]">
              <ArrowDownToLine size={16} strokeWidth={2.6} aria-hidden="true" />
            </Diamond>
            Entrada de estoque
          </Link>
        )}
        {canRegister && (
          <Link to="/cadastro?aba=clientes" className={clsx(TILE, TILE_LIGHT)}>
            <Diamond color="bg-[#ff6b1a]">
              <UserPlus size={16} strokeWidth={2.6} aria-hidden="true" />
            </Diamond>
            Novo cliente
          </Link>
        )}
        {canSell && (
          <Link to="/vendas" className={clsx(TILE, TILE_LIGHT)}>
            <Diamond color="bg-[#0e2240] text-white">
              <Lock size={16} strokeWidth={2.6} aria-hidden="true" />
            </Diamond>
            Abrir ou fechar caixa
          </Link>
        )}
      </div>
    </section>
  )
}
