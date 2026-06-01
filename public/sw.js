// Service Worker para PWA - Offline Support
const CACHE_NAME = 'financeiro-v3-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles-enhancements.css',
  '/js/app.js',
  '/js/search-filter.js',
  '/js/badges.js',
  '/js/animations.js',
  '/js/export.js',
  '/js/websocket-sync.js',
  '/manifest.json',
  'https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Cache aberto, armazenando assets...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((err) => console.error('❌ Erro ao cachear assets:', err))
  );
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker ativado');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia de fetch: Network First com fallback para Cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip para requisições de API (WebSocket)
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Network First: tenta rede primeiro, depois cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Se sucesso, atualiza o cache
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Se offline, retorna do cache
        return caches.match(request)
          .then((response) => {
            return response || new Response('Offline - Recurso não disponível', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Sincronização em background
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      fetch('/api/sync', { method: 'POST' })
        .then(() => console.log('✅ Sincronização em background concluída'))
        .catch((err) => console.error('❌ Erro na sincronização:', err))
    );
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nova notificação',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%2301696f" width="192" height="192"/><path fill="white" d="M60 120L84 92L108 108L132 72" stroke="white" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="132" cy="72" r="12" fill="white"/></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle fill="%2301696f" cx="48" cy="48" r="48"/></svg>',
    tag: 'financeiro-notification',
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification('Financeiro+ V3', options)
  );
});

// Clique em notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (let client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
