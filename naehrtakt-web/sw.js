/* Nährtakt Service Worker — SELBSTZERSTÖRUNG (Übergangsphase „wird überarbeitet").
 *
 * Diese Version ersetzt den alten App-Cache-SW (nt-app-v1/-v2/-v3). Sie:
 *   1. löscht ALLE Caches (die offline gebündelte alte App),
 *   2. meldet sich selbst ab (unregister),
 *   3. lädt offene Fenster neu → frische Platzhalterseite,
 * und fängt danach keinen Request mehr ab. So verschwindet die alte, offline
 * gecachte App bei Rückkehrern und installierten PWA-Clients sauber; die
 * Platzhalter- (und später die neue Design-)Seite wird immer frisch vom Netz
 * geladen.
 *
 * Wichtig: hCDN cacht sw.js sonst tagelang über mehrere Edge-Knoten — die
 * begleitende .htaccess setzt daher no-cache auf sw.js, damit jeder Client
 * diese neuen Bytes tatsächlich bekommt und der alte SW ersetzt wird.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // 1) alle Caches löschen (u. a. nt-app-v1 / nt-app-v2 / nt-app-v3)
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    // 2) diesen Service Worker abmelden
    try { await self.registration.unregister(); } catch (_) {}
    // 3) offene Fenster übernehmen und neu laden (frische Platzhalterseite)
    try {
      await self.clients.claim();
      const wins = await self.clients.matchAll({ type: "window" });
      await Promise.all(wins.map((c) => c.navigate(c.url).catch(() => {})));
    } catch (_) {}
  })());
});

/* Kein fetch-Handler: alle Requests laufen unverändert ans Netz. */
