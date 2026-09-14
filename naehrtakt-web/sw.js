/* Nährtakt Service Worker – konservativ: nur GET + same-origin.
   Cross-Origin (Supabase-Lizenz/Backend) und alle Nicht-GET-Requests
   laufen unangetastet am SW vorbei. */
const CACHE = "nt-app-v1";

/* App-Shell + statische Assets + öffentliche Seiten, die offline verfügbar sein müssen. */
const SHELL = [
  "index.html",
  "app.html",
  "freischalten.html",
  "zahlung.html",
  "impressum.html",
  "datenschutz.html",
  "manifest.webmanifest",
  "assets/app.css",
  "assets/site.css",
  "assets/config.js",
  "assets/engine.js",
  "assets/license.js",
  "assets/app.js",
  "assets/install.js",
  "assets/qrcode-generator.js",
  "assets/img/favicon.svg",
  "assets/img/favicon-32.png",
  "assets/img/icon-180.png",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png",
  "assets/img/icon-maskable-512.png",
  "assets/data/supplements.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // einzeln adden, damit ein fehlendes File (z. B. noch keine supplements.json)
      // die Installation nicht komplett scheitern lässt
      Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Nachricht aus der App: sofort aktivieren (nach Update). */
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

function isHTML(req) {
  return req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                       // POST/PUT … durchlassen
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // Cross-Origin durchlassen

  // Frische Daten bevorzugen: supplements.json = network-first
  if (url.pathname.endsWith("/assets/data/supplements.json")) {
    e.respondWith(networkFirst(req));
    return;
  }

  // HTML/Navigation: network-first (immer neueste Seite, offline aus Cache)
  if (isHTML(req)) {
    e.respondWith(networkFirst(req));
    return;
  }

  // Statische Assets: cache-first mit Hintergrund-Aktualisierung
  e.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Navigations-Fallback auf die App-Shell
    if (isHTML(req)) {
      const shell = await cache.match("app.html");
      if (shell) return shell;
    }
    throw _;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || network || fetch(req);
}
