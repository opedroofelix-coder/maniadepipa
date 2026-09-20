import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Label } from '../components/ui'
import logo from '../assets/logo.png'

export function Login() {
  const { session, signIn, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
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
    <div className="flex min-h-screen items-center justify-center bg-[#f9f9f7] p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="h-2 w-full bg-[linear-gradient(90deg,#ffc83c,#ff7a29,#f0384c,#d6247a,#7b3fe4,#2f6fed)]" />
        <div className="p-6 sm:p-8">
          <img src={logo} alt="Mania de Pipa" className="mx-auto mb-4 h-20 w-20 object-contain" />
          <h1 className="text-center text-xl font-semibold text-neutral-900">Mania de Pipa</h1>
          <p className="mt-1 text-center text-sm text-neutral-500">Entre com sua conta para continuar.</p>
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
          {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
          <p className="mt-6 text-xs text-neutral-400">
            O Senhor é meu pastor e nada me faltará.
          </p>
        </div>
      </div>
    </div>
  )
}
