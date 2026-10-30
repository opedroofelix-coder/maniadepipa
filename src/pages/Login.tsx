import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Label, Loader } from '../components/ui'
import { InstallAppButton } from '../components/InstallApp'
import logo from '../assets/logo.png'

export function Login() {
  const { session, signIn, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return <Loader fullScreen />
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signIn(email, password)
    if (error) setError('E-mail ou senha inválidos.')
    setSubmitting(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eaf6ff] p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(14,34,64,0.06)]">
        <div className="h-2 w-full bg-[linear-gradient(90deg,#ffc83c,#ff7a29,#f0384c,#d6247a,#7b3fe4,#2f6fed)]" />
        <div className="p-6 sm:p-8">
          <img src={logo} alt="Mania de Pipa" className="mx-auto mb-4 h-20 w-20 object-contain" />
          <h1 className="text-center font-display text-3xl font-extrabold text-[#0e2240]">Mania de Pipa</h1>
          <p className="mt-1 text-center text-sm font-semibold text-[#52607a]">Entre com sua conta para continuar.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="login-email">E-mail</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="login-password">Senha</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm font-bold text-[#a12424]">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
          <InstallAppButton className="mt-3 justify-center" />
          <p className="mt-6 text-center text-xs font-semibold text-[#52607a]">
            O Senhor é meu pastor e nada me faltará.
          </p>
        </div>
      </div>
    </div>
  )
}
