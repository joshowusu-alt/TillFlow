const CACHE_NAME = 'pos-cache-v8';
const OFFLINE_URL = '/offline';
const MAX_CACHE_ITEMS = 100; // LRU eviction when exceeded

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/pos',
  '/offline',
  '/offline/sales',
  '/manifest.json',
  '/icon.svg',
  '/api/icon?size=192',
  '/api/icon?size=512'
];

// API routes that should be cached for offline access
const CACHEABLE_API_ROUTES = [
  '/api/offline/cache-data'
];

/** Trim cache to MAX_CACHE_ITEMS using LRU eviction (oldest first). */
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // Delete oldest entries first
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

// Install event - cache core assets (don't skipWaiting; let client control it)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
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
                trimCache(CACHE_NAME, MAX_CACHE_ITEMS);
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
            trimCache(CACHE_NAME, MAX_CACHE_ITEMS);
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

// ---- Background sync helpers (raw IndexedDB, no idb lib in SW) ----

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pos-offline-db', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    // If DB hasn't been created by client yet, create stores so we don't crash
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('salesQueue')) db.createObjectStore('salesQueue', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('business')) db.createObjectStore('business', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('store')) db.createObjectStore('store', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tills')) db.createObjectStore('tills', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('syncMeta')) db.createObjectStore('syncMeta', { keyPath: 'key' });
    };
  });
}

function getPendingSalesFromDB(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('salesQueue', 'readonly');
    const store = tx.objectStore('salesQueue');
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).filter((s) => !s.synced));
    req.onerror = () => reject(req.error);
  });
}

function markSaleSyncedInDB(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('salesQueue', 'readwrite');
    const store = tx.objectStore('salesQueue');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const sale = getReq.result;
      if (sale) {
        sale.synced = true;
        store.put(sale);
      }
      tx.oncomplete = () => resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function syncSalesDirectly() {
  const db = await openOfflineDB();
  const pending = await getPendingSalesFromDB(db);
  for (const sale of pending) {
    try {
      const res = await fetch('/api/offline/sync-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sale),
      });
      if (res.ok) await markSaleSyncedInDB(db, sale.id);
    } catch (_) {
      // Network still down — the sync event will be retried by the browser
    }
  }
  db.close();
}

// Background sync for offline sales (if browser supports it)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-sales') {
    event.waitUntil(syncSalesDirectly());
  }
});
