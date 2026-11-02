/* ============================================================
   SERVICE WORKER — Carnet de Budget DOXTEHAD
   Stratégie :
   - App shell (HTML/CSS/JS/icônes) : cache-first
   - Données réseau externes : network-first avec fallback cache
   - Mise à jour automatique avec notification
   ============================================================ */

const CACHE_VERSION = 'doxtehad-v1.0.0';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;

// App shell — ressources critiques pour le mode hors-ligne
const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './css/app.css',
  './js/crypto.js',
  './js/storage.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.ico'
];

// ============================================================
// INSTALL — Pré-cache de l'app shell
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Install — version', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        // addAll échoue si UNE ressource échoue → on ajoute individuellement
        return Promise.allSettled(
          APP_SHELL.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW] Échec pré-cache:', url, err.message);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE — Nettoyage des anciens caches
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate — nettoyage anciens caches');
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => {
              console.log('[SW] Suppression cache obsolète:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notifier tous les clients de la mise à jour
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
          });
        });
      })
  );
});

// ============================================================
// FETCH — Stratégie de routage
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') return;

  // Ignorer les extensions navigateur et requêtes internes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigation (chargement de page) → network-first avec fallback cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Mettre en cache la réponse fraîche
          const clone = response.clone();
          caches.open(CACHE_RUNTIME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Hors-ligne : servir la page depuis le cache
          return caches.match(request)
            .then((cached) => cached || caches.match('./offline.html'))
            .then((fallback) => fallback || new Response('Hors-ligne', { status: 503 }));
        })
    );
    return;
  }

  // Ressources same-origin (CSS/JS/icônes) → cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
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

  // Ressources externes (CDN, API) → network-first avec fallback cache
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
// MESSAGE — Communication avec la page
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.map((key) => caches.delete(key)))
      )
    );
  }
});
