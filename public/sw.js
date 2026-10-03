/*
 * Bountiful Trading Terminal - service worker.
 *
 * Caches the app shell so the terminal opens instantly and survives a flaky
 * connection. Market data and account state are NEVER cached: a stale quote or
 * a stale balance would be far more dangerous than no quote at all, so every
 * /api request goes straight to the network and fails loudly instead.
 */

const VERSION = 'bountiful-v1'
const SHELL_CACHE = `${VERSION}-shell`

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon-16.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll is atomic: one 404 would leave us with no cache at all, so add
      // individually and tolerate a miss.
      .then((cache) =>
        Promise.all(
          SHELL_ASSETS.map((url) =>
            cache.add(url).catch(() => {
              /* optional asset - keep going */
            }),
          ),
        ),
      )
      // The built JS/CSS filenames are content-hashed, so they cannot be
      // listed ahead of time. Discover them from the built index.html and
      // cache them too, otherwise the first offline launch renders a blank
      // page: on the very first visit the worker is not yet controlling the
      // page, so those assets are fetched before any fetch handler exists.
      .then(() =>
        caches.match('/index.html').then((cached) =>
          cached
            ? cached
                .text()
                .then((html) =>
                  caches.open(SHELL_CACHE).then((c) =>
                    Promise.all(
                      [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
                        .map((m) => m[1])
                        .map((url) =>
                          c.add(url).catch(() => {
                            /* hashed asset missing - keep going */
                          }),
                        ),
                    ),
                  ),
                )
            : undefined,
        ),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Never touch API traffic, and never intercept anything but GET.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api')) return

  // Navigations: network first, fall back to the cached shell when offline so
  // the app still opens. A client-side router recovers the real path from the
  // cached index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    )
    return
  }

  // Static assets: cache first, then refresh in the background.
  event.respondWith(
    caches
      .match(request, { ignoreVary: true })
      .then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const copy = response.clone()
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          })
          .catch((err) => {
            // A cache miss while offline must still resolve, otherwise
            // respondWith(undefined) makes the request fail outright.
            if (cached) return cached
            throw err
          })
        return cached || network
      }),
  )
})