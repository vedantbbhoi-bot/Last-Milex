const CACHE_PREFIX = 'last-milex-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg'];

function isExcludedPath(pathname) {
  return /(^|\/)(api|auth|rest|rpc|realtime|storage|functions)(\/|$)/i.test(pathname)
    || /\/graphql(?:\/|$)/i.test(pathname);
}

function isCacheableStaticAsset(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false;
  if (url.search || isExcludedPath(url.pathname)) return false;
  if (request.headers.has('authorization') || request.cache === 'no-store') return false;

  // Vite emits bundled scripts, styles, and images under /assets/. Fonts and
  // arbitrary same-origin/API responses are deliberately never cached here.
  return url.pathname.startsWith('/assets/')
    && ['script', 'style', 'image'].includes(request.destination);
}

async function cacheSuccessfulStaticResponse(cache, request, response) {
  if (!response.ok || response.type !== 'basic') return response;
  const cacheControl = response.headers.get('cache-control') || '';
  if (/\b(private|no-store)\b/i.test(cacheControl)) return response;
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || isExcludedPath(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timeout = self.setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(request, { signal: controller.signal });
        if (response.ok) return response;
        return (await caches.match('/')) || response;
      } catch {
        return (await caches.match('/')) || Response.error();
      } finally {
        self.clearTimeout(timeout);
      }
    })());
    return;
  }

  if (!isCacheableStaticAsset(request, url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      return await cacheSuccessfulStaticResponse(cache, request, response);
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});
