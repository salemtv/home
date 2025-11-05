const CACHE_NAME = 'stv-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/data/images.json',
  '/favicon.ico'
];

// On install, cache core assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: cleanup old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); })
    )).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app shell, network-first for /data/ JSON
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // handle JSON files (network-first)
  if (url.pathname.startsWith('/data/') || url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(e.request).then(res => {
        // put a copy in cache
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        return res;
      }).catch(()=> caches.match(e.request))
    );
    return;
  }

  // app shell & assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cacheRes => {
      return cacheRes || fetch(e.request).then(fetchRes => {
        // optional: put in cache
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, fetchRes.clone());
          return fetchRes;
        });
      }).catch(()=> {
        // fallback (optional)
        return caches.match('/index.html');
      });
    })
  );
});
