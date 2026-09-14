/* ==========================================================================
   Nährtakt – Lizenz-Client (Einmal-Lizenz, offline-fähig nach Aktivierung)
   Speichert die Aktivierung lokal; re-validiert bei Online-Start still im Hintergrund.
   Kein Geheimnis im Client – die Function prüft den Schlüssel serverseitig.
   ========================================================================== */
(function (global) {
  "use strict";
  const KEY = "nt_license_v1";
  const DEVKEY = "nt_device_v1";
  const cfg = () => (global.NT_CONFIG || {});

  // Stabile, anonyme Geräte-Kennung (nur lokal). Erlaubt serverseitig die
  // Geräte-Bindung (max_devices) und verhindert doppeltes Hochzählen bei
  // erneuter Aktivierung auf demselben Gerät. Kein personenbezogenes Merkmal.
  function deviceId() {
    try {
      let d = localStorage.getItem(DEVKEY);
      if (!d) {
        const b = new Uint8Array(16);
        (global.crypto || {}).getRandomValues
          ? global.crypto.getRandomValues(b)
          : b.forEach((_, i) => (b[i] = Math.floor(Math.random() * 256)));
        d = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(DEVKEY, d);
      }
      return d;
    } catch (_) { return ""; }
  }

  function normalizeKey(k) {
    return String(k || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
      .replace(/^NT/, "").slice(0, 15); // roher Kern ohne Präfix/Bindestriche
  }
  function displayKey(raw) {
    // NT-XXXXX-XXXXX-XXXXX
    const core = normalizeKey(raw);
    const groups = core.match(/.{1,5}/g) || [];
    return ["NT", ...groups].join("-");
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { return null; }
  }
  function save(obj) { try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (_) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (_) {} }

  function isActivated() {
    const l = load();
    return !!(l && l.key && l.ok);
  }

  async function callFn(action, body) {
    const c = cfg();
    if (!c.fnBase || c.fnBase.indexOf("__") === 0) {
      throw new Error("Backend noch nicht konfiguriert.");
    }
    const res = await fetch(c.fnBase.replace(/\/$/, "") + "/naehrtakt-public", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": c.anonKey || "",
        "Authorization": "Bearer " + (c.anonKey || "")
      },
      body: JSON.stringify(Object.assign({ action }, body || {}))
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
    return data;
  }

  // Schlüssel aktivieren (online). Erfolg -> lokal speichern.
  async function activate(rawKey) {
    const key = displayKey(rawKey);
    const data = await callFn("activate", { key, device: deviceId() });
    if (data && data.valid) {
      const rec = { key, ok: true, name: data.name || null, activatedAt: Date.now(), lastCheck: Date.now() };
      save(rec);
      return rec;
    }
    throw new Error(data && data.reason ? data.reason : "Schlüssel ungültig.");
  }

  // Stille Re-Validierung; bei „blockiert/unbekannt" wird lokal gesperrt.
  async function revalidate() {
    const l = load();
    if (!l || !l.key) return { ok: false };
    if (!navigator.onLine) return { ok: true, offline: true };
    try {
      const data = await callFn("check", { key: l.key, device: deviceId() });
      if (data && data.valid) {
        l.ok = true; l.lastCheck = Date.now(); save(l);
        return { ok: true };
      } else {
        // Schlüssel wurde gesperrt/entfernt
        clear();
        return { ok: false, revoked: true, reason: data && data.reason };
      }
    } catch (_) {
      // Netzfehler -> lokalen Status behalten (offline-tolerant)
      return { ok: true, softFail: true };
    }
  }

  function deactivate() { clear(); }

  global.NTLicense = { normalizeKey, displayKey, deviceId, load, isActivated, activate, revalidate, deactivate };
})(typeof window !== "undefined" ? window : globalThis);
