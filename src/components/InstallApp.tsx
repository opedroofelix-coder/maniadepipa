import { useState } from 'react'
import { Download, Share, SquarePlus } from 'lucide-react'
import clsx from 'clsx'
import { useInstallApp } from '../lib/pwa'
import { Modal } from './ui'

/**
 * Botão "Instalar app". No Android/Chrome/Edge abre o diálogo de instalação do
 * navegador; no iPhone mostra o passo a passo do Safari. Some quando o app já
 * está instalado ou o navegador não permite instalar.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const { mode, install } = useInstallApp()
  const [iosHelpOpen, setIosHelpOpen] = useState(false)

  if (!mode) return null

  return (
    <>
      <button
        type="button"
        onClick={() => (mode === 'prompt' ? install() : setIosHelpOpen(true))}
        className={clsx(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[#a81760] hover:bg-[#d6247a]/10',
          className,
        )}
      >
        <Download size={16} />
        Instalar app
      </button>

      <Modal open={iosHelpOpen} onClose={() => setIosHelpOpen(false)} title="Instalar no iPhone">
        <ol className="space-y-3 text-sm text-neutral-700">
          <li className="flex items-start gap-2">
            <span className="font-semibold">1.</span>
            <span>
              No Safari, toque em <Share size={16} className="inline align-text-bottom" aria-label="Compartilhar" />{' '}
              <strong>Compartilhar</strong> (na barra de baixo).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-semibold">2.</span>
            <span>
              Escolha <SquarePlus size={16} className="inline align-text-bottom" aria-hidden="true" />{' '}
              <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-semibold">3.</span>
            <span>Abra a Mania de Pipa pelo ícone na tela de início.</span>
          </li>
        </ol>
      </Modal>
    </>
  )
}
