import { useEffect, useState } from 'react'
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, ClipboardList, BarChart3, Ticket, LogOut, Menu, X } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'
import { canOpen } from '../lib/access'
import { Button, Loader } from './ui'
import { InstallAppButton } from './InstallApp'
import logo from '../assets/logo.png'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/vendas', label: 'Vendas', icon: ShoppingCart },
  { to: '/estoque', label: 'Estoque', icon: Package },
  { to: '/cadastro', label: 'Cadastro', icon: ClipboardList },
  { to: '/rifas', label: 'Rifas', icon: Ticket },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
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
    return <Loader fullScreen />
  }

  // sessão válida mas o perfil não carregou: mostrar o erro em vez de devolver
  // ao login em loop (o usuário já está autenticado, o login não resolveria)
  if (profileError) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-extrabold text-[#0e2240]">Não foi possível carregar seu perfil.</p>
          <p className="mt-1 text-sm font-semibold text-[#52607a]">
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

  const items = NAV_ITEMS.filter((item) => canOpen(item.to, profile.role))

  return (
    <div className="flex h-screen bg-[#eaf6ff]">
      {/* fundo escuro da gaveta, só no celular */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 bg-[#0e2240]/45 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col rounded-r-[32px] bg-white transition-transform duration-200',
          'lg:static lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <img src={logo} alt="" className="h-14 w-14 object-contain" />
          <div className="flex-1">
            <p className="font-display text-xl leading-tight font-extrabold text-[#0e2240]">Mania de Pipa</p>
            <p className="text-[13px] font-semibold text-[#52607a]">PDV da loja</p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-[14px] text-[#52607a] hover:bg-[#eef2f7] hover:text-[#0e2240] lg:hidden"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Principal" className="flex-1 space-y-1.5 overflow-y-auto px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[15px] transition-colors',
                  isActive ? 'bg-[#0e2240] font-extrabold text-white' : 'font-bold text-[#3b4a66] hover:bg-[#eef2f7]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} />
                  <span className="flex-1">{item.label}</span>
                  {/* losango de pipa marcando a página atual */}
                  {isActive && <span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-[#ffc83c]" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <div className="mb-2 flex items-center gap-3 rounded-[20px] bg-[#eaf6ff] p-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ffc83c] font-display text-lg font-extrabold text-[#0e2240]"
            >
              {profile.full_name.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-[#0e2240]">{profile.full_name}</p>
              <p className="text-xs font-semibold capitalize text-[#52607a]">{profile.role}</p>
            </div>
          </div>
          <InstallAppButton />
          <button
            type="button"
            onClick={() => signOut()}
            className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-4 text-sm font-bold text-[#3b4a66] hover:bg-[#eef2f7]"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* barra superior só abaixo de lg, para abrir a gaveta */}
        <header className="flex items-center gap-3 rounded-b-3xl bg-white px-4 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-[14px] text-[#3b4a66] hover:bg-[#eef2f7]"
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <img src={logo} alt="" className="h-9 w-9 object-contain" />
          <p className="font-display text-lg font-extrabold text-[#0e2240]">Mania de Pipa</p>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
