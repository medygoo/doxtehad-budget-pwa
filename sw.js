/* ============================================================
   SERVICE WORKER â€” Carnet de Budget DOXTEHAD
   StratÃ©gie :
   - App shell (HTML/CSS/JS/icÃ´nes) : cache-first
   - DonnÃ©es rÃ©seau externes : network-first avec fallback cache
   - Mise Ã  jour automatique avec notification
   ============================================================ */

const CACHE_VERSION = 'doxtehad-v1.1.0';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;

// App shell â€” ressources critiques pour le mode hors-ligne
const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './offline',
  './manifest.json',
  './css/app.css',
  './js/crypto.js',
  './js/storage.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.ico',
];

// ============================================================
// INSTALL â€” PrÃ©-cache de l'app shell
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Install â€” version', CACHE_VERSION);
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => {
        // addAll Ã©choue si UNE ressource Ã©choue â†’ on ajoute individuellement
        return Promise.allSettled(
          APP_SHELL.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW] Ã‰chec prÃ©-cache:', url, err.message);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE â€” Nettoyage des anciens caches
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate â€” nettoyage anciens caches');
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => {
              console.log('[SW] Suppression cache obsolÃ¨te:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notifier tous les clients de la mise Ã  jour
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
          });
        });
      })
  );
});

// ============================================================
// FETCH â€” StratÃ©gie de routage
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requÃªtes non-GET
  if (request.method !== 'GET') return;

  // Ignorer les extensions navigateur et requÃªtes internes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigation (chargement de page) â†’ network-first avec fallback cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Mettre en cache la rÃ©ponse fraÃ®che
          const clone = response.clone();
          caches.open(CACHE_RUNTIME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Hors-ligne : servir la page depuis le cache
          return caches
            .match(request)
            .then((cached) => cached || caches.match('./offline.html') || caches.match('./offline'))
            .then((fallback) => fallback || new Response('Hors-ligne', { status: 503 }));
        })
    );
    return;
  }

  // Ressources same-origin (CSS/JS/icÃ´nes) â†’ cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches
        .match(request)
        .then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_STATIC).then((cache) => cache.put(request, clone));
            }
            return response;
          });
        })
        .catch(() => {
          // Fallback pour les images manquantes
          if (request.destination === 'image') {
            return caches.match('./icons/icon-192.png');
          }
          return new Response('', { status: 404 });
        })
    );
    return;
  }

  // Ressources externes (CDN, API) â†’ network-first avec fallback cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_RUNTIME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ============================================================
// MESSAGE â€” Communication avec la page
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
  }
});
