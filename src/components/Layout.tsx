import { useEffect, useState } from 'react'
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, ClipboardList, BarChart3, LogOut, Menu, X } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../types/database'
import { Button } from './ui'
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
  const { profile, profileError, retryProfile, signOut, loading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // fecha a gaveta ao trocar de página no celular
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-neutral-500">Carregando…</div>
  }

  // sessão válida mas o perfil não carregou: mostrar o erro em vez de devolver
  // ao login em loop (o usuário já está autenticado, o login não resolveria)
  if (profileError) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-neutral-900">Não foi possível carregar seu perfil.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Você está conectado, mas o sistema não conseguiu ler seus dados de acesso. Verifique a conexão e tente de novo.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={retryProfile}>Tentar de novo</Button>
            <Button variant="secondary" onClick={() => signOut()}>
              Sair
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/login" replace />
  }

  const items = NAV_ITEMS.filter((item) => item.roles.includes(profile.role))

  return (
    <div className="flex h-screen bg-[#f9f9f7]">
      {/* fundo escuro da gaveta, só no celular */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-neutral-200 bg-white transition-transform duration-200',
          'lg:static lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="h-1.5 w-full bg-[linear-gradient(90deg,#ffc83c,#ff7a29,#f0384c,#d6247a,#7b3fe4,#2f6fed)]" />
        <div className="flex items-center gap-3 px-5 py-5">
          <img src={logo} alt="" className="h-10 w-10 rounded-lg object-contain" />
          <div className="flex-1">
            <p className="text-base font-semibold leading-tight text-neutral-900">Mania de Pipa</p>
            <p className="text-xs text-neutral-500">PDV</p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 lg:hidden"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
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
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* barra superior só abaixo de lg, para abrir a gaveta */}
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <img src={logo} alt="" className="h-8 w-8 rounded object-contain" />
          <p className="text-sm font-semibold text-neutral-900">Mania de Pipa</p>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
