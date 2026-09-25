// Service worker de la tarjeta.
// - HTML (navegación): primero la red, para que los cambios se vean al momento; la caché solo sirve sin conexión.
// - Recursos estáticos (imágenes, fuentes, manifest): primero la caché.
// Si cambias una imagen, una fuente o el manifest sin cambiarle el nombre, sube CACHE_VERSION
// para que los visitantes descarguen la versión nueva.
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'tarjeta-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const PRECACHE_URLS = [
    './',
    'manifest.webmanifest',
    'fonts/outfit-400.woff2',
    'fonts/outfit-500.woff2',
    'fonts/outfit-600.woff2',
    'fonts/outfit-700.woff2',
    'img/perfil-240.webp',
    'img/perfil-480.webp',
    'img/perfil-fallback.svg',
    'img/favicon-32.png',
    'img/apple-touch-icon.png',
    'img/icon-192.png',
    'img/icon-512.png',
    'img/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// Borra las cachés de versiones anteriores
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Solo GET del propio dominio; formularios, Cal.com, LinkedIn, etc. van directos a la red
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
    } else {
        event.respondWith(cacheFirst(request));
    }
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        // cache: 'no-cache' revalida con el servidor y evita servir una copia antigua de la caché HTTP
        const response = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (error) {
        return (await cache.match(request)) || (await cache.match('./')) || Response.error();
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
}
