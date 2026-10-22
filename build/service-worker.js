// Plantilla del service worker.
//
// El plugin de Vite (vite.config.js) hi injecta la llista de recursos
// per precarregar i la versió (un hash dels noms de fitxer), de manera
// que la memòria cau es buida sola quan es publica una versió nova.
//
// Estratègies:
//   · Navegació i forecast.json → xarxa primer, memòria cau de reserva.
//   · Ràsters .tif            → memòria cau primer (el nom porta la
//     marca de temps, així que són immutables).
//   · Recursos de l'aplicació  → memòria cau primer.
//   · Terceres parts           → sense memòria cau (estil base de l'ICGC,
//     relleu i API): no es redistribueixen les dades d'altres.
export function serviceWorkerSource({ precache, version }) {
  return `/* Service worker de l'observatori d'estrès tèrmic (UTCI Catalunya).
   Generat automàticament: no el modifiquis a mà. */

const VERSION = ${JSON.stringify(version)};
const SHELL_CACHE = \`utci-shell-\${VERSION}\`;
const DATA_CACHE = \`utci-data-\${VERSION}\`;

// Nombre màxim de ràsters conservats (cada TIFF ocupa ~2,5 MB).
const MAX_RASTERS = 12;

const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("utci-") && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Retalla la memòria cau: es queda amb les entrades més recents.
function trimCache(cacheName, max) {
  return caches.open(cacheName).then((cache) =>
    cache.keys().then((keys) => {
      if (keys.length <= max) return undefined;

      const oldest = keys.slice(0, keys.length - max);

      return Promise.all(oldest.map((request) => cache.delete(request)));
    }),
  );
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);

  if (response && response.ok && response.type === "basic") {
    await cache.put(request, response.clone());

    if (max) trimCache(cacheName, max);
  }

  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response && response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);

    if (cached) return cached;

    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // El service worker el gestiona el navegador: no el posem a la memòria cau.
  if (url.pathname.endsWith("/sw.js")) return;

  // Navegació: xarxa primer per als despliegaments nous.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Manifest de la previsió: xarxa primer, amb còpia local de reserva.
  if (url.pathname.endsWith("/data/forecast.json")) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // Ràsters: immutables, es poden servir des de la memòria cau.
  if (url.pathname.includes("/data/utci_") && url.pathname.endsWith(".tif")) {
    event.respondWith(cacheFirst(request, DATA_CACHE, MAX_RASTERS));
    return;
  }

  // Recursos de l'aplicació (JS, CSS, icones): memòria cau primer.
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Terceres parts: es deixen passar sense tocar.
});
`;
}
