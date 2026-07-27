// HAMSA service worker
// Scope: caches the app shell (HTML/CSS/JS/icons) + Google Fonts so the app installs and
// opens offline. It deliberately does NOT touch chatData0.json or the live Google Sheet
// endpoint - the app itself already manages those via IndexedDB + the K1 version check,
// and letting the SW cache them too would just create a second, conflicting cache layer.

const SHELL_CACHE = 'hamsa-shell-v1';
const FONT_CACHE = 'hamsa-fonts-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isDataEndpoint(url) {
  return url.includes('chatData0.json') || url.includes('script.google.com');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = req.url;

  // Let the app's own IndexedDB/K1 logic fully own these - never intercept or cache them here.
  if (isDataEndpoint(url)) {
    return;
  }

  // Google Fonts: stale-while-revalidate, so Telugu text keeps rendering offline
  // even after the font file changes upstream.
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req).then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // App shell (same-origin HTML/CSS/JS/icons): cache-first, refreshing the cache
  // in the background so the next launch picks up any update.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok && url.startsWith(self.location.origin)) {
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
