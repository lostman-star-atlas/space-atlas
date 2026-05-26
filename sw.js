// ─────────────────────────────────────────────────────────────────────────────
//  DWARF mini PRO — Service Worker v1.0
//  Strategy : NETWORK FIRST  →  cache only as fallback when offline
//  skipWaiting: IMMEDIATE    →  new SW activates instantly on every deploy
//  Result   : users always get the latest code when online; app still works
//             offline using the last cached version as a safety net.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. BUMP THIS VERSION STRING ON EVERY DEPLOY ──────────────────────────────
//  (changing it forces the browser to treat this as a brand-new SW file,
//   which triggers the install → activate → skipWaiting cycle immediately)
const CACHE_VERSION = 'dwarf-v1.2.0';

// ── 2. ASSETS TO PRE-CACHE ON INSTALL (app shell) ────────────────────────────
//  These are fetched from the network once and stored so the app shell is
//  available offline even on first visit after install.
const PRECACHE_ASSETS = [
  './',           // index.html served as directory root
  './index.html',
  // Add any local CSS / JS / icon files here if you split them out later
  // './manifest.json',
  // './icons/icon-192.png',
  // './icons/icon-512.png',
];

// ── 3. INSTALL — pre-cache the app shell ─────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Install — version:', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );

  // CRITICAL: skip the "waiting" phase completely.
  // The new SW takes control the moment installation finishes,
  // without waiting for existing tabs to close.
  self.skipWaiting();
});

// ── 4. ACTIVATE — delete every cache that isn't the current version ───────────
self.addEventListener('activate', event => {
  console.log('[SW] Activate — version:', CACHE_VERSION);

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      // Take control of all open tabs immediately (pairs with skipWaiting)
      return self.clients.claim();
    })
  );
});

// ── 5. FETCH — Network First with cache fallback ──────────────────────────────
//
//  Flow for every request:
//    1. Try the network  →  if it responds, store the response in cache
//                           and return it to the page.
//    2. If network fails →  serve from cache (offline safety net).
//    3. If not in cache  →  return a basic offline error response.
//
//  This guarantees:
//    • Online  → users always see the most recent version of the app.
//    • Offline → users see the last version they loaded (better than nothing).
//    • Deploy  → because skipWaiting + clients.claim are used, the new SW
//                is active immediately; the next fetch already goes through
//                the new SW which has purged all old caches.

self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests for same-origin or CDN resources.
  // Skip non-GET (POST, etc.) and browser-extension requests.
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;

  // Skip cross-origin API calls that must never be cached
  // (weather API, Open-Meteo, Wikipedia thumbnails stay network-only)
  const NETWORK_ONLY_PATTERNS = [
    'api.open-meteo.com',
    'upload.wikimedia.org',
  ];
  if (NETWORK_ONLY_PATTERNS.some(p => req.url.includes(p))) {
    // Pass straight through — no caching
    return;
  }

  event.respondWith(networkFirst(req));
});

// ── Helper: Network First ────────────────────────────────────────────────────
async function networkFirst(req) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    // 1. Attempt network
    const networkResponse = await fetch(req);

    // Only cache successful, non-opaque responses
    if (networkResponse && networkResponse.status === 200) {
      cache.put(req, networkResponse.clone()); // async, don't await
    }

    return networkResponse;

  } catch (err) {
    // 2. Network failed → try cache
    console.log('[SW] Network failed, serving from cache:', req.url);
    const cached = await cache.match(req);

    if (cached) return cached;

    // 3. Not in cache either → return offline placeholder
    console.warn('[SW] Resource not in cache:', req.url);
    return offlineFallback(req);
  }
}

// ── Offline fallback response ────────────────────────────────────────────────
function offlineFallback(req) {
  // For navigation requests (page loads), return a minimal offline page
  if (req.destination === 'document') {
    return new Response(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DWARF mini PRO — Offline</title>
  <style>
    body { background:#050508; color:#a0aec0; font-family:monospace;
           display:flex; flex-direction:column; align-items:center;
           justify-content:center; min-height:100vh; margin:0; text-align:center; padding:20px; }
    h1 { color:#b794f4; font-size:1.5rem; margin-bottom:12px; }
    p  { font-size:0.9rem; line-height:1.6; max-width:340px; }
    .icon { font-size:3rem; margin-bottom:16px; }
  </style>
</head>
<body>
  <div class="icon">🔭</div>
  <h1>DWARF mini PRO</h1>
  <p>You appear to be offline.<br>
     Connect to the internet and reload the page to get the latest version.</p>
  <p style="margin-top:16px;opacity:0.5;font-size:0.75rem;">
     If you previously loaded the app, try a hard refresh (Ctrl+Shift+R).
  </p>
</body>
</html>`,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // For other resources (images, scripts, etc.) return a 503
  return new Response('Service Unavailable — offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' },
  });
}
