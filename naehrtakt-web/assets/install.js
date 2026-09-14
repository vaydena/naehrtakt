/* Nährtakt – PWA-Install-Affordanz.
   Lehren (siehe Vaydena-Memory):
   1) NIE allein auf beforeinstallprompt verlassen → IMMER manueller Fallback.
   2) "installiert" = isStandalone(); ein × schließt nur (snooze/Session), nie dauerhaft.
   Self-contained: funktioniert auf app.html UND auf der Landing (ohne app.js). */
(function () {
  "use strict";

  var deferred = null;          // gecachtes beforeinstallprompt-Event
  var listeners = [];           // onChange-Callbacks
  var SNOOZE_KEY = "nt_install_snooze";

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.navigator.standalone === true;
  }

  function platform() {
    var ua = navigator.userAgent || "";
    var iOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (iOS) return "ios";
    if (/Android/.test(ua)) return "android";
    return "desktop";
  }

  function available() { return !!deferred; }

  function emit() {
    var st = { standalone: isStandalone(), canPrompt: available(), platform: platform() };
    listeners.forEach(function (fn) { try { fn(st); } catch (e) {} });
  }

  function onChange(fn) { if (typeof fn === "function") { listeners.push(fn); fn({
    standalone: isStandalone(), canPrompt: available(), platform: platform() }); } }

  // ---- native Prompt -------------------------------------------------------
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    emit();
  });

  window.addEventListener("appinstalled", function () {
    deferred = null;
    try { sessionStorage.removeItem(SNOOZE_KEY); } catch (e) {}
    emit();
  });

  window.matchMedia("(display-mode: standalone)").addEventListener &&
    window.matchMedia("(display-mode: standalone)")
      .addEventListener("change", emit);

  /* install(): nutzt den nativen Dialog, sonst manuelle Anleitung.
     Gibt ein Promise<"accepted"|"dismissed"|"manual"> zurück. */
  function install() {
    if (deferred) {
      var d = deferred;
      deferred = null;
      return d.prompt().then(function () {
        return d.userChoice;
      }).then(function (choice) {
        emit();
        return (choice && choice.outcome) || "dismissed";
      }).catch(function () { offerManual(); return "manual"; });
    }
    offerManual();
    return Promise.resolve("manual");
  }

  // ---- manuelle Anleitung (self-contained Dialog) --------------------------
  function ensureStyles() {
    if (document.getElementById("nt-install-style")) return;
    var css = ""
      + ".nti-back{position:fixed;inset:0;z-index:1000;background:rgba(10,20,18,.5);"
      + "display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .18s}"
      + ".nti-back.show{opacity:1}"
      + "@media(min-width:560px){.nti-back{align-items:center}}"
      + ".nti-card{background:var(--surface,#fff);color:var(--text,#12211d);width:100%;max-width:460px;"
      + "border-radius:18px 18px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));"
      + "box-shadow:0 -10px 40px rgba(0,0,0,.22);transform:translateY(12px);transition:transform .18s}"
      + "@media(min-width:560px){.nti-card{border-radius:18px;transform:scale(.98)}}"
      + ".nti-back.show .nti-card{transform:none}"
      + ".nti-h{display:flex;align-items:center;gap:10px;margin:0 0 4px}"
      + ".nti-h svg{width:26px;height:26px;flex:0 0 auto}"
      + ".nti-h b{font-size:1.08rem}"
      + ".nti-sub{color:var(--muted,#5c6b66);font-size:.9rem;margin:0 0 14px}"
      + ".nti-step{display:flex;gap:12px;align-items:flex-start;margin:12px 0}"
      + ".nti-n{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:var(--primary,#0f7268);"
      + "color:#fff;font-weight:700;font-size:.85rem;display:grid;place-items:center}"
      + ".nti-step span{padding-top:2px;line-height:1.45}"
      + ".nti-ico{display:inline-flex;vertical-align:-4px;margin:0 2px}"
      + ".nti-close{margin-top:16px;width:100%;padding:13px;border:0;border-radius:12px;cursor:pointer;"
      + "background:var(--primary,#0f7268);color:#fff;font-weight:600;font-size:1rem}"
      + ".nti-x{position:absolute;top:10px;right:12px;border:0;background:transparent;font-size:1.5rem;"
      + "line-height:1;color:var(--muted,#5c6b66);cursor:pointer;padding:6px}";
    var s = document.createElement("style");
    s.id = "nt-install-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  var SHARE_ICON = '<svg class="nti-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f7268" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/></svg>';
  var PLUS_ICON = '<svg class="nti-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f7268" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  var MENU_ICON = '<svg class="nti-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f7268" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>';

  function stepsFor(p) {
    if (p === "ios") return [
      'Tippe unten in Safari auf <b>Teilen</b> ' + SHARE_ICON + '.',
      'Wähle <b>Zum Home-Bildschirm</b> ' + PLUS_ICON + '.',
      'Bestätige mit <b>Hinzufügen</b> – fertig, Nährtakt liegt als App auf dem Startbildschirm.'
    ];
    if (p === "android") return [
      'Öffne oben rechts das <b>Menü</b> ' + MENU_ICON + ' in Chrome.',
      'Tippe auf <b>App installieren</b> bzw. <b>Zum Startbildschirm hinzufügen</b>.',
      'Bestätige – Nährtakt erscheint als eigene App.'
    ];
    return [
      'Klicke in der Adressleiste auf das <b>Installations-Symbol</b> ' + PLUS_ICON + ' (rechts).',
      'Alternativ: Browser-Menü → <b>„Nährtakt installieren“</b>.',
      'Bestätige – Nährtakt öffnet sich künftig als eigenes Fenster.'
    ];
  }

  function offerManual() {
    if (isStandalone()) { alert("Nährtakt ist bereits als App installiert."); return; }
    ensureStyles();
    var p = platform();
    var steps = stepsFor(p);
    var titleMap = { ios: "Nährtakt aufs iPhone/iPad", android: "Nährtakt aufs Handy", desktop: "Nährtakt installieren" };

    var back = document.createElement("div");
    back.className = "nti-back";
    var html = ''
      + '<div class="nti-card" role="dialog" aria-modal="true" aria-label="App installieren">'
      + '<button class="nti-x" aria-label="Schließen">&times;</button>'
      + '<div class="nti-h">'
      + '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#0f7268"/>'
      + '<path d="M8 22V10m0 0l8 12m0-12v12m0-12l8 12V10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '<b>' + titleMap[p] + '</b></div>'
      + '<p class="nti-sub">In wenigen Sekunden als App – ohne App-Store, offline nutzbar.</p>';
    steps.forEach(function (t, i) {
      html += '<div class="nti-step"><div class="nti-n">' + (i + 1) + '</div><span>' + t + '</span></div>';
    });
    html += '<button class="nti-close">Alles klar</button></div>';
    back.innerHTML = html;
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add("show"); });

    function close() {
      back.classList.remove("show");
      setTimeout(function () { back.remove(); }, 200);
    }
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    back.querySelector(".nti-x").addEventListener("click", close);
    back.querySelector(".nti-close").addEventListener("click", close);
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });
  }

  // ---- Snooze-Helfer für optionale Banner (nur Session, nie dauerhaft) -----
  function snoozed() {
    try { return sessionStorage.getItem(SNOOZE_KEY) === "1"; } catch (e) { return false; }
  }
  function snooze() {
    try { sessionStorage.setItem(SNOOZE_KEY, "1"); } catch (e) {}
  }

  window.NTInstall = {
    isStandalone: isStandalone,
    available: available,
    platform: platform,
    install: install,
    offerManual: offerManual,
    onChange: onChange,
    snoozed: snoozed,
    snooze: snooze
  };
})();
