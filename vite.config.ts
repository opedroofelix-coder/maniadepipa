import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// arquivos de public/ que o service worker deixa guardados desde a instalação
const PUBLIC_PRECACHE = [
  './',
  'manifest.webmanifest',
  'favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
]

/**
 * Gera dist/sw.js a partir de pwa/sw.js com a lista dos arquivos do build
 * (que mudam de nome a cada build por causa do hash). A versão do cache é o
 * hash dessa lista, então um build novo descarta o cache antigo.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((file) => !file.endsWith('.html') && !file.endsWith('.map'))
      const precache = [...PUBLIC_PRECACHE, ...built]
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)
      const source = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // publicado no GitHub Pages em https://<usuario>.github.io/maniadepipa/
  base: '/maniadepipa/',
  plugins: [react(), tailwindcss(), serviceWorker()],
})
