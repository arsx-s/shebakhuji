/* ShebaShathi service worker.
   Cache-first for the static shell and artwork, network-first for API calls,
   with an offline fallback for navigations. Bump CACHE to invalidate. */
const CACHE = 'shebashathi-shell-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles/app.css',
  './assets/coolicons-sprite.svg',
  './assets/brand/icon.svg',
  './assets/illustrations/hero-services.svg',
  './assets/illustrations/offline.svg',
  './src/app.js',
  './src/config.js',
  './src/api.js',
  './src/store.js',
  './src/router.js',
  './src/ui.js',
  './src/i18n.js',
  './src/shell.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API traffic or the event stream.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match('./assets/illustrations/offline.svg'));
    })
  );
});
