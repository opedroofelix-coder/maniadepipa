import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, ClipboardList, BarChart3, LogOut } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../types/database'
import logo from '../assets/logo.png'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: Role[]
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['dono', 'caixa', 'estoquista'] },
  { to: '/vendas', label: 'Vendas', icon: ShoppingCart, roles: ['dono', 'caixa'] },
  { to: '/estoque', label: 'Estoque', icon: Package, roles: ['dono', 'estoquista'] },
  { to: '/cadastro', label: 'Cadastro', icon: ClipboardList, roles: ['dono', 'estoquista'] },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['dono'] },
]

export function Layout() {
  const { profile, signOut, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-neutral-500">Carregando…</div>
  }

  if (!profile) {
    return <Navigate to="/login" replace />
  }

  const items = NAV_ITEMS.filter((item) => item.roles.includes(profile.role))

  return (
    <div className="flex h-screen bg-[#f9f9f7]">
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white">
        <div className="h-1.5 w-full bg-[linear-gradient(90deg,#ffc83c,#ff7a29,#f0384c,#d6247a,#7b3fe4,#2f6fed)]" />
        <div className="flex items-center gap-3 px-5 py-5">
          <img src={logo} alt="Mania de Pipa" className="h-10 w-10 rounded-lg object-contain" />
          <div>
            <p className="text-base font-semibold leading-tight text-neutral-900">Mania de Pipa</p>
            <p className="text-xs text-neutral-500">PDV</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-[#d6247a]/10 text-[#a81760]' : 'text-neutral-600 hover:bg-neutral-100',
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-neutral-200 p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-neutral-900">{profile.full_name}</p>
            <p className="text-xs capitalize text-neutral-500">{profile.role}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
