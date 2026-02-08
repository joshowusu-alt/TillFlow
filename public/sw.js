const CACHE_NAME = 'pos-cache-v2';
const OFFLINE_URL = '/offline';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/pos',
  '/offline',
  '/manifest.json'
];

// API routes that should be cached for offline access
const CACHEABLE_API_ROUTES = [
  '/api/offline/cache-data'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('pos-cache-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Next.js internal routes (but not all of _next, we want static assets)
  if (url.pathname.startsWith('/_next/webpack') ||
    url.pathname.startsWith('/_next/static/development')) {
    return;
  }

  // Handle API routes specially
  if (url.pathname.startsWith('/api')) {
    // Only cache specific offline API routes
    const isCacheableApi = CACHEABLE_API_ROUTES.some(
      (route) => url.pathname.startsWith(route)
    );

    if (isCacheableApi) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(async () => {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(JSON.stringify({ error: 'Offline' }), {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            });
          })
      );
      return;
    }

    // Non-cacheable API routes - network only
    return;
  }

  // Handle page navigation and static assets
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for pages and static assets
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // Cache static assets from _next/static
            if (url.pathname.startsWith('/_next/static')) {
              cache.put(request, responseClone);
            }
            // Cache HTML pages
            if (request.mode === 'navigate' ||
              request.headers.get('accept')?.includes('text/html')) {
              cache.put(request, responseClone);
            }
          });
        }
        return response;
      })
      .catch(async () => {
        // Network failed, try cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // For navigation requests, show offline page
        if (request.mode === 'navigate') {
          const offlineResponse = await caches.match(OFFLINE_URL);
          if (offlineResponse) {
            return offlineResponse;
          }
        }

        // Return generic offline response
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  // Force update cache data
  if (event.data === 'refreshCache') {
    caches.open(CACHE_NAME).then((cache) => {
      CACHEABLE_API_ROUTES.forEach((route) => {
        fetch(route).then((response) => {
          if (response.ok) {
            cache.put(route, response);
          }
        });
      });
    });
  }
});

// Background sync for offline sales (if browser supports it)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-sales') {
    event.waitUntil(
      // Notify all clients to sync
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_SALES' });
        });
      })
    );
  }
});
