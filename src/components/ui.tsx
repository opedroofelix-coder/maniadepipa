import { forwardRef, useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import clsx from 'clsx'
import logo from '../assets/logo.png'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5', className)}>
      {children}
    </div>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-3 text-base',
  }
  const variants = {
    primary: 'bg-[#d6247a] text-white hover:bg-[#a81760]',
    secondary: 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200',
    danger: 'bg-[#d03b3b] text-white hover:bg-[#a82e2e]',
    ghost: 'text-neutral-700 hover:bg-neutral-100',
  }
  return <button type="button" className={clsx(base, sizes[size], variants[variant], className)} {...props} />
}

/**
 * Botão só de ícone. O padding garante o alvo de toque de 44px pedido em
 * celular sem empurrar o layout (a margem negativa compensa).
 */
export function IconButton({
  tone = 'brand',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'brand' | 'danger' | 'neutral' }) {
  const tones = {
    brand: 'hover:text-[#d6247a]',
    danger: 'hover:text-[#d03b3b]',
    neutral: 'hover:text-neutral-700',
  }
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors disabled:opacity-40',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={clsx(
        'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#d6247a] focus:ring-2 focus:ring-[#d6247a]/20',
        props.className,
      )}
    />
  )
})

/**
 * Campo numérico em formato brasileiro. Usa text + inputMode decimal em vez de
 * type="number" para que a vírgula não seja descartada pelo navegador.
 * Ver src/lib/number.ts.
 */
export const DecimalInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function DecimalInput(props, ref) {
    return <Input ref={ref} type="text" inputMode="decimal" autoComplete="off" {...props} />
  },
)

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#d6247a] focus:ring-2 focus:ring-[#d6247a]/20',
        props.className,
      )}
    />
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-neutral-600">
      {children}
    </label>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'brand'
}) {
  const tones = {
    neutral: 'bg-neutral-100 text-neutral-700',
    good: 'bg-[#0ca30c]/10 text-[#0ca30c]',
    warning: 'bg-[#fab219]/15 text-[#8a5b00]',
    critical: 'bg-[#d03b3b]/10 text-[#d03b3b]',
    brand: 'bg-[#d6247a]/10 text-[#a81760]',
  }
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  // onClose costuma ser uma arrow inline, ou seja, muda de identidade a cada
  // render. Guardado num ref, o efeito depende só de `open` — senão ele
  // rodaria a cada tecla digitada e o foco voltaria para o primeiro campo.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    // foca o primeiro campo (não o ✕, que vem antes no DOM)
    const firstField = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    )
    ;(firstField ?? panelRef.current)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      // prende o Tab dentro do modal
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = overflow
      previouslyFocused.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl outline-none sm:rounded-xl sm:p-6',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <IconButton tone="neutral" onClick={onClose} aria-label="Fechar" className="-mr-2">
            ✕
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Confirmação no visual do sistema, no lugar do confirm() nativo (que trava a
 * aba e não pode ser estilizado). Mantém o botão travado enquanto a ação roda.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [running, setRunning] = useState(false)

  async function handleConfirm() {
    setRunning(true)
    try {
      await onConfirm()
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal open={open} onClose={running ? () => {} : onClose} title={title}>
      <div className="space-y-4">
        <div className="text-sm text-neutral-600">{message}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={running}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={handleConfirm} disabled={running}>
            {running ? 'Aguarde…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-neutral-500">{message}</div>
}

/**
 * Carregando, com a logo da loja pulsando.
 * `fullScreen` cobre a tela inteira (abertura do app); sem ele, ocupa só a
 * área de conteúdo da página ou da aba.
 */
export function Loader({ fullScreen = false, label = 'Carregando…' }: { fullScreen?: boolean; label?: string }) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-4',
        fullScreen ? 'h-screen bg-[#f9f9f7]' : 'py-16',
      )}
    >
      <img src={logo} alt="" className={clsx('logo-pulse object-contain', fullScreen ? 'h-20 w-20' : 'h-12 w-12')} />
      <p role="status" className="text-sm text-neutral-500">
        {label}
      </p>
    </div>
  )
}

export function StatTile({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warning' | 'critical'
  hint?: string
}) {
  const toneColor = {
    neutral: 'text-neutral-900',
    good: 'text-[#0ca30c]',
    warning: 'text-[#8a5b00]',
    critical: 'text-[#d03b3b]',
  }
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={clsx('mt-2 text-xl font-semibold break-words sm:text-2xl', toneColor[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </Card>
  )
}

/** Envolve tabelas largas para rolarem na horizontal em vez de estourar a tela. */
export function TableScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>{children}</div>
}

export function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-neutral-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={clsx(
            '-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            active === tab.id
              ? 'border-[#d6247a] text-[#a81760]'
              : 'border-transparent text-neutral-500 hover:text-neutral-800',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
    </div>
  )
}
