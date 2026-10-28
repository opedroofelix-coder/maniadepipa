import { useSyncExternalStore } from 'react'

// evento do Chrome/Edge/Android que permite abrir o diálogo de instalação
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Já está rodando como app instalado (tela cheia, sem barra do navegador)? */
function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone/iPad no Safari: não tem o evento de instalação, só o menu Compartilhar. */
function isIos() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/**
 * Registra o service worker e começa a escutar o evento de instalação. Chamado
 * uma vez no main.tsx, antes do React montar, porque o navegador pode disparar
 * o evento logo no carregamento.
 */
export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })

  // em dev o Vite não gera o sw.js
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch((error) => {
        console.error('Falha ao registrar o service worker', error)
      })
    })
  }
}

export type InstallMode = 'prompt' | 'ios' | null

export function useInstallApp() {
  const canPrompt = useSyncExternalStore(
    subscribe,
    () => deferredPrompt !== null,
    () => false,
  )

  let mode: InstallMode = null
  if (!isStandalone()) {
    if (canPrompt) mode = 'prompt'
    else if (isIos()) mode = 'ios'
  }

  async function install() {
    if (!deferredPrompt) return
    const event = deferredPrompt
    await event.prompt()
    await event.userChoice
    // o evento só pode ser usado uma vez
    deferredPrompt = null
    notify()
  }

  return { mode, install }
}
