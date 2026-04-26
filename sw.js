/**
 * Poemenizador Da Vinci — Service Worker v1.0
 *
 * Estrategia: Cache-First para el shell de la app (HTML, CSS, fuentes).
 * Network-First para las llamadas al GAS (siempre queremos datos frescos).
 *
 * Alcance: la carpeta donde está alojado el index.html.
 *
 * NOTA: Para que el SW funcione, el index.html debe servirse desde
 * un servidor con HTTPS (o localhost). Si se abre directamente desde
 * Drive como archivo, el SW no puede registrarse (limitación del navegador).
 */

const CACHE_NAME    = "pwa-shell-v1";
const GAS_HOSTNAME  = "script.google.com";   // peticiones al GAS → siempre red

// Archivos del shell que se pre-cachean al instalar el SW
const SHELL_FILES = [
  "./",
  "./index.html"
  // manifest.json y sw.js se excluyen (son manejados por el navegador)
];

// ── Instalación ──────────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())  // activar inmediatamente sin esperar
  );
});

// ── Activación (limpieza de caché antigua) ───────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())  // tomar control de todas las pestañas
  );
});

// ── Fetch — estrategia mixta ─────────────────────────────────────────
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // 1. Peticiones al GAS → siempre Network-First (datos en tiempo real)
  if (url.hostname === GAS_HOSTNAME) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: "sin_conexion" }), {
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    return;
  }

  // 2. Fuentes de Google → Cache-First (sin expiración propia)
  if (url.hostname.includes("fonts.")) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
      )
    );
    return;
  }

  // 3. Shell de la app → Cache-First con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(resp => {
        // Solo cachear respuestas exitosas de la misma origin
        if (resp.ok && url.origin === self.location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      })
    )
  );
});

// ── Mensaje desde la app (para forzar actualización del caché) ────────
self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
