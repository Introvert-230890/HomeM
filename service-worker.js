/* Service Worker — офлайн-кэш для PWA */
const CACHE_NAME = 'home-finance-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
];

// Установка: кэшируем основные файлы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Активация: удаляем старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Перехват запросов: сначала кэш, потом сеть (для файлов приложения);
// сеть всегда для запросов к MOEX API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Запросы к MOEX — всегда в сеть, без кэша
  if (url.hostname === 'iss.moex.com') return;

  // Только GET-запросы кэшируем
  if (event.request.method !== 'GET') return;

  // Не кэшируем chrome-extension и другие схемы
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Кэшируем только успешные ответы
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        // Офлайн — если есть index.html в кэше, отдаём его
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});