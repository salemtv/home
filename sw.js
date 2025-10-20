const CACHE_NAME = 'stv-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/socials.js',
  '/channels.js',
  '/manifest.json',
  '/favicon.ico'
];
// On install, cache core assets
self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});