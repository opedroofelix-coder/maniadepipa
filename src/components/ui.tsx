import { forwardRef, useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import clsx from 'clsx'
import logo from '../assets/logo.png'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(14,34,64,0.06)] sm:p-6', className)}>
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
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'danger-ghost'
  size?: 'sm' | 'md' | 'lg'
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-extrabold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#d6247a] disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = {
    sm: 'min-h-11 px-4 text-sm',
    md: 'min-h-12 px-5 text-[15px]',
    lg: 'min-h-14 px-6 text-base',
  }
  const variants = {
    primary: 'bg-[#d6247a] text-white shadow-[0_8px_20px_rgba(214,36,122,0.25)] hover:bg-[#a81760]',
    secondary: 'bg-[#eef2f7] text-[#0e2240] hover:bg-[#dfe6ef]',
    // #b42828: branco sobre ele dá 6,5:1 (o vermelho antigo ficava em 4,4:1)
    danger: 'bg-[#b42828] text-white hover:bg-[#8f1f1f]',
    ghost: 'text-[#3b4a66] hover:bg-[#eef2f7]',
    // ação destrutiva discreta, para linhas de tabela (ex.: cancelar venda)
    'danger-ghost': 'text-[#a12424] hover:bg-[#fde4e4]',
  }
  return <button type="button" className={clsx(base, sizes[size], variants[variant], className)} {...props} />
}

/**
 * Uma opção de um grupo de escolha única (forma de pagamento, sangria ou
 * suprimento): pílula de 48px, rosa quando escolhida. aria-pressed diz ao
 * leitor de tela qual está marcada.
 */
export function ChoiceButton({
  selected,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={clsx(
        'inline-flex min-h-12 items-center justify-center rounded-full px-4 text-[15px] font-extrabold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#d6247a] disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'bg-[#d6247a] text-white' : 'bg-[#eef2f7] text-[#0e2240] hover:bg-[#dfe6ef]',
        className,
      )}
      {...props}
    />
  )
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
    danger: 'hover:bg-[#fde4e4] hover:text-[#a12424]',
    neutral: 'hover:text-[#0e2240]',
  }
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-[#52607a] transition-colors hover:bg-[#eef2f7] disabled:opacity-40',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

/** Campo de texto e select: 48px de altura, borda com contraste de 3,4:1 e anel rosa no foco. */
const FIELD_CLASS =
  'min-h-12 w-full rounded-2xl border-2 border-[#7d8ca6] bg-white px-4 text-base font-semibold text-[#0e2240] outline-none placeholder:font-normal placeholder:text-[#6b7891] focus:border-[#d6247a] focus:ring-4 focus:ring-[#d6247a]/20'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={clsx(
        FIELD_CLASS,
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
        FIELD_CLASS,
        props.className,
      )}
    />
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-extrabold text-[#0e2240]">
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
    neutral: 'bg-[#eef2f7] text-[#3b4a66]',
    good: 'bg-[#ddf7e8] text-[#0a6b34]',
    warning: 'bg-[#fff1c7] text-[#7a5200]',
    critical: 'bg-[#fde4e4] text-[#a12424]',
    brand: 'bg-[#d6247a]/10 text-[#b0175f]',
  }
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold', tones[tone])}>
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0e2240]/45 p-0 sm:items-center sm:p-4"
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
          'max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-[0_24px_60px_rgba(14,34,64,0.3)] outline-none sm:rounded-[28px] sm:p-6',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-[22px] leading-tight font-extrabold text-[#0e2240]">{title}</h2>
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
        <div className="text-sm font-semibold text-[#52607a]">{message}</div>
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
  return <div className="py-10 text-center text-sm font-semibold text-[#52607a]">{message}</div>
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
        fullScreen ? 'h-screen bg-[#eaf6ff]' : 'py-16',
      )}
    >
      <img src={logo} alt="" className={clsx('logo-pulse object-contain', fullScreen ? 'h-20 w-20' : 'h-12 w-12')} />
      <p role="status" className="text-sm font-semibold text-[#52607a]">
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
    neutral: 'text-[#0e2240]',
    good: 'text-[#0a6b34]',
    warning: 'text-[#7a5200]',
    critical: 'text-[#a12424]',
  }
  return (
    <Card>
      <p className="text-sm font-bold text-[#52607a]">{label}</p>
      {/* quebra só no espaço ("R$" / "12.345,67"), nunca no meio do número */}
      <p className={clsx('mt-2 font-display text-2xl leading-tight font-extrabold', toneColor[tone])}>{value}</p>
      {hint && <p className="mt-2 text-xs font-bold text-[#52607a]">{hint}</p>}
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
    <div className="mb-5 flex gap-1 overflow-x-auto border-b-2 border-[#d5e3f0]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={clsx(
            '-mb-0.5 min-h-11 shrink-0 border-b-[3px] px-4 text-sm font-extrabold transition-colors',
            active === tab.id
              ? 'border-[#d6247a] text-[#b0175f]'
              : 'border-transparent text-[#52607a] hover:text-[#0e2240]',
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
      <h1 className="font-display text-3xl leading-tight font-extrabold text-[#0e2240]">{title}</h1>
      {subtitle && <p className="mt-1 text-sm font-semibold text-[#52607a]">{subtitle}</p>}
    </div>
  )
}
