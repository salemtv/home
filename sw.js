/* ============================================ */
/* STV - SERVICE WORKER                         */
/* ============================================ */

const CACHE_NAME = "stv-cache-v4";
const ASSETS_TO_CACHE = [
    "/",
    "/home.html",
    "/tv.html",
    "/cinema.html",
    "/player.html",
    "/styles.css",
    "/app.js",
    "/manifest.json"
];

self.addEventListener("install", function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(ASSETS_TO_CACHE);
        }).catch(function(){})
    );
    self.skipWaiting();
});

self.addEventListener("activate", function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(name) {
                    if (name !== CACHE_NAME) return caches.delete(name);
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", function(event) {
    event.respondWith(
        caches.match(event.request).then(function(response) {
            if (response) return response;
            return fetch(event.request).catch(function(){});
        })
    );
});