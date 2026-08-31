const CACHE = 'doudou-v11';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const c = await caches.open(CACHE);
    // 逐个缓存，单个资源 404 不导致整体安装失败
    await Promise.allSettled(ASSETS.map(function (u) {
      return c.add(u).catch(function () {});
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
      return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // 不拦截跨域请求

  // 导航请求：离线时回退到缓存的 index.html
  if (e.request.mode === 'navigate') {
    e.respondWith((async function () {
      try {
        return await fetch(e.request);
      } catch (err) {
        const cached = await caches.match('./index.html');
        if (cached) return cached;
        const root = await caches.match('./');
        return root || Response.error();
      }
    })());
    return;
  }

  // 静态资源：缓存优先 + 后台更新
  e.respondWith((async function () {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      const copy = res.clone();
      const c = await caches.open(CACHE);
      c.put(e.request, copy).catch(function () {});
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
