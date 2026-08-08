/* ============================================ */
/* STV - SERVICE WORKER (SPA Optimizado)        */
/* ============================================ */

const CACHE_NAME = "stv-cache-v10";
const DATA_CACHE_NAME = "stv-data-v5";

const STATIC_ASSETS = [
    "/",
    "/index.html",
    "/player.html",
    "/styles.css",
    "/app.js",
    "/manifest.json",
    "/MaterialSymbolsRounded.woff2",
    "/stv.png"
];

const DATA_ASSETS = [
    "/data/channels.json",
    "/data/movies.json"
];

self.addEventListener("install", function(event) {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then(function(cache) {
                return cache.addAll(STATIC_ASSETS);
            }),
            caches.open(DATA_CACHE_NAME).then(function(cache) {
                return cache.addAll(DATA_ASSETS).catch(function(err) {
                    console.log("STV SW: No se pudieron precachear datos:", err);
                });
            })
        ])
    );
    self.skipWaiting();
});

self.addEventListener("activate", function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(name) {
                    if (name !== CACHE_NAME && name !== DATA_CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", function(event) {
    const { request } = event;
    const url = new URL(request.url);

    // 1. JSON de datos: Network First
    if (url.pathname.endsWith('.json') && url.pathname.includes('/data/')) {
        event.respondWith(networkFirst(request, DATA_CACHE_NAME));
        return;
    }

    // 2. Assets estáticos: Cache First
    if (isStaticAsset(url.pathname)) {
        event.respondWith(cacheFirst(request, CACHE_NAME));
        return;
    }

    // 3. Todo lo demás: Stale While Revalidate
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
});

function isStaticAsset(pathname) {
    return STATIC_ASSETS.includes(pathname) || 
           pathname.endsWith('.css') || 
           pathname.endsWith('.js') ||
           pathname.endsWith('.html') ||
           pathname.endsWith('.woff2');
}

function cacheFirst(request, cacheName) {
    return caches.open(cacheName).then(function(cache) {
        return cache.match(request).then(function(response) {
            if (response) return response;
            return fetch(request).then(function(networkResponse) {
                if (networkResponse && networkResponse.status === 200) {
                    cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            }).catch(function() {
                return new Response(
                    '<html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h1>STV</h1><p>Sin conexión.</p></div></body></html>',
                    { headers: { 'Content-Type': 'text/html' } }
                );
            });
        });
    });
}

function networkFirst(request, cacheName) {
    return caches.open(cacheName).then(function(cache) {
        return fetch(request).then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        }).catch(function() {
            return cache.match(request).then(function(cachedResponse) {
                if (cachedResponse) return cachedResponse;
                return new Response(
                    JSON.stringify({ error: "offline", channels: [], movies: [] }),
                    { headers: { 'Content-Type': 'application/json' } }
                );
            });
        });
    });
}

function staleWhileRevalidate(request, cacheName) {
    return caches.open(cacheName).then(function(cache) {
        return cache.match(request).then(function(cachedResponse) {
            const fetchPromise = fetch(request).then(function(networkResponse) {
                if (networkResponse && networkResponse.status === 200) {
                    cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            }).catch(function() {
                return cachedResponse;
            });
            return cachedResponse || fetchPromise;
        });
    });
}
