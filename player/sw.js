// Minimal service worker so Chrome can offer "Install app"
const CACHE = 'screening-player-v1';
self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function () {
  // Network-first; no caching required for player
});
