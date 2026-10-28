/* Service worker do PWA. Este arquivo é um modelo: o plugin `serviceWorker`
 * do vite.config.ts preenche a versão e a lista de arquivos no build e publica
 * o resultado como dist/sw.js.
 *
 * Estratégia:
 * - navegação (abrir o app, recarregar, trocar de rota): rede primeiro, para
 *   sempre pegar a versão nova; sem internet cai no index.html em cache.
 * - arquivos do próprio site (JS/CSS com hash, ícones): cache primeiro.
 * - outras origens (Supabase): não passa pelo cache, os dados vêm sempre da rede.
 */
const VERSION = '__VERSION__'
const CACHE = `maniadepipa-${VERSION}`
const PRECACHE = __PRECACHE__
const INDEX = new URL('./', self.location).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, self.location).href)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('maniadepipa-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // o Pages responde 404 (com o app) para rotas como /vendas; só o
          // index de verdade vai para o cache
          if (response.ok && url.href === INDEX) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(INDEX, copy))
          }
          return response
        })
        .catch(() => caches.match(INDEX)),
    )
    return
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
