const CACHE = 'shebashathi-shell-v1';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./', './index.html', './styles.css', './mobile.css', './frontend-api.js', './i18n.js', './assets/illustrations/service-home.svg']))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => { if (new URL(event.request.url).pathname.startsWith('/api/')) return; event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
