/* ShebaShathi service worker.
   Code and documents are network-first with a cache fallback, so a deploy is
   never masked by a stale cache while still working offline; artwork is
   cache-first because it rarely changes and is the heaviest to refetch.
   Bump CACHE to invalidate. */
const CACHE = 'shebashathi-shell-v6';
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
  './src/theme.js',
  './src/fx.js',
  './src/shell.js',
  './src/map.js',
  './src/views/auth.js',
  './src/views/public.js',
  './src/views/customer.js',
  './src/views/booking.js',
  './src/views/account.js',
  './src/views/location.js',
  './src/views/settings.js',
  './src/views/provider.js',
  './src/views/admin.js'
];

/* Last-resort page when the app itself has never been cached. It is written by
   hand here, uses no network and no external asset, and says plainly what
   happened in both languages. */
const OFFLINE_HTML = `<!doctype html>
<html lang="bn">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>সেবাসাথী — অফলাইন / ShebaShathi — offline</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#F6F6F7;color:#121214;font:16px/1.5 system-ui,"Noto Sans Bengali","Nirmala UI",sans-serif;padding:24px}
.card{max-width:420px;text-align:center;background:#FFFFFF;border:1px solid #E6E6EA;border-radius:20px;padding:28px 22px;box-shadow:0 10px 30px rgba(18,18,20,.08)}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 6px;color:#62626B}a{display:inline-block;margin-top:16px;background:#111114;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700}
@media (prefers-color-scheme: dark){body{background:#0B0B0D;color:#F4F4F6}.card{background:#141417;border-color:#2A2A30}p{color:#A9A9B2}a{background:#FFFFFF;color:#111114}}</style>
</head>
<body><div class="card">
<h1>আপনি এখন অফলাইনে আছেন</h1>
<p>সেবাসাথী এখনো এই ডিভাইসে সংরক্ষিত হয়নি। ইন্টারনেট সংযোগ ফিরে এলে আবার চেষ্টা করুন।</p>
<p>You are offline, and ShebaShathi is not saved on this device yet. Reconnect and try again.</p>
<a href="./">আবার চেষ্টা করুন · Try again</a>
</div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Each file is added on its own: one missing image must not cost the
      // whole offline shell, the way a single cache.addAll() failure would.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
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
    // Live document first; offline serves the saved shell, and if the shell was
    // never saved the visitor still gets a real page that explains the state.
    event.respondWith(
      fetch(request).catch(async () => (
        (await caches.match('./index.html'))
        || (await caches.match('./'))
        || new Response(OFFLINE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      ))
    );
    return;
  }

  const cacheFirst = /\.(?:png|jpe?g|webp|svg|woff2?|ico)$/i.test(url.pathname);
  event.respondWith(
    cacheFirst
      ? caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match('./assets/illustrations/offline.svg')))
      /* Network-first for modules and stylesheets: an updated file always wins
         while the app is online, and the cached copy keeps it working offline. */
      : fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
