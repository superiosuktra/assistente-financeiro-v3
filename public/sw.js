// Service Worker para PWA - Offline Support (hardening)
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

// Instalação do Service Worker — cache individual com fallback para evitar falhas em addAll
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker instalando...');
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.allSettled(ASSETS_TO_CACHE.map(async (url) => {
      try {
        // Use Request para manter integridade; alguns recursos externos podem ser opaque
        const req = new Request(url, { mode: 'no-cors' });
        const res = await fetch(req);
        // Respostas opacas (cross-origin) may be type 'opaque' and cannot be inspected, but can be cached
        if (res && (res.ok || res.type === 'opaque')) {
          try { await cache.put(req, res.clone()); } catch (e) { /* ignore individual put errors */ }
          return { url, ok: true };
        }
        return { url, ok: false, status: res && res.status };
      } catch (err) {
        return { url, ok: false, error: err && err.message };
      }
    }));

    // Log summary but don't fail installation if some assets couldn't be cached
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
    if (failed.length) console.warn('Alguns assets não puderam ser cacheados:', failed);
    self.skipWaiting();
  })());
});

// Ativação do Service Worker — limpando caches antigos
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker ativado');
  event.waitUntil((async () => {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => {
        if (cacheName !== CACHE_NAME) {
          console.log('🗑️ Removendo cache antigo:', cacheName);
          return caches.delete(cacheName);
        }
        return Promise.resolve();
      }));
      await self.clients.claim();
    } catch (err) {
      console.error('Erro durante ativação do SW:', err);
    }
  })());
});

// Estratégia de fetch: Network First com fallback para Cache (resiliente)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só interceptar GETs navegacionais / de recursos; ignore API calls e outros métodos
  try {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
      return; // deixa passar
    }
  } catch (e) {
    // se ocorrer erro ao construir URL, ignore e deixe passar
    return;
  }

  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(request);
      // Atualiza cache apenas se resposta OK
      if (networkResponse && networkResponse.status === 200) {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          try { cache.put(request, responseClone); } catch (e) { /* ignore cache put error */ }
        });
      }
      return networkResponse;
    } catch (err) {
      // Rede falhou — tentar cache
      try {
        const cached = await caches.match(request);
        if (cached) return cached;
      } catch (e) {
        // ignore
      }

      // Fallback inteligente: se o cliente aceita HTML, retorna uma página offline simples com Content-Type
      try {
        const accept = request.headers.get('accept') || '';
        if (accept.includes('text/html')) {
          return new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><h1>Offline</h1><p>Você está offline.</p>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
      } catch (e) { /* ignore */ }

      return new Response('Offline - Recurso não disponível', { status: 503, statusText: 'Service Unavailable' });
    }
  })());
});

// Sincronização em background — tratamento seguro
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil((async () => {
      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        if (!res.ok) throw new Error('Sync failed ' + res.status);
        console.log('✅ Sincronização em background concluída');
      } catch (err) {
        console.error('❌ Erro na sincronização:', err);
        // Não rethrow — o browser pode re-agendar o sync
      }
    })());
  }
});

// Push notifications — leitura segura de dados
self.addEventListener('push', (event) => {
  let body = 'Nova notificação';
  try {
    if (event.data) {
      // pode ser JSON ou texto
      const text = event.data.text();
      try { body = JSON.parse(text).body || text; } catch (e) { body = text; }
    }
  } catch (e) {
    console.warn('Erro ao ler push event data:', e);
  }

  const options = {
    body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="#01696f" width="192" height="192"/><path fill="white" d="M60 120L84 92L108 108L132 72" stroke="white" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="132" cy="72" r="12" fill="white"/></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle fill="#01696f" cx="48" cy="48" r="48"/></svg>',
    tag: 'financeiro-notification',
    requireInteraction: true
  };

  event.waitUntil((async () => {
    try {
      await self.registration.showNotification('Financeiro+ V3', options);
    } catch (err) {
      console.error('Erro ao mostrar notificação:', err);
    }
  })());
});

// Clique em notificação — foco/abrir janela com segurança
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    try {
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        try {
          const url = new URL(client.url);
          if ((url.pathname === '/' || url.pathname === '') && 'focus' in client) {
            return client.focus();
          }
        } catch (e) {
          // ignore malformed client.url
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    } catch (err) {
      console.error('Erro ao tratar notificationclick:', err);
    }
  })());
});
