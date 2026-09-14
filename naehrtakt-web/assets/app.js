/* ==========================================================================
   Nährtakt – App-Logik
   ========================================================================== */
(function () {
  "use strict";
  const E = window.NaehrtaktEngine;
  const L = window.NTLicense;
  const C = window.NT_CONFIG || {};

  const CAT_LABEL = {
    "vitamin-fett": "Fettlösliches Vitamin", "vitamin-wasser": "Wasserlösliches Vitamin",
    "mineralstoff": "Mineralstoff", "spurenelement": "Spurenelement", "omega": "Omega-Fettsäure",
    "aminosaeure": "Aminosäure", "probiotikum": "Probiotikum", "sonstige": "Sonstige"
  };
  const CAT_ORDER = ["vitamin-fett", "vitamin-wasser", "mineralstoff", "spurenelement", "omega", "aminosaeure", "probiotikum", "sonstige"];
  const KIND = {
    hemmung:   { t: "Hemmt Aufnahme", c: "warn" },
    konkurrenz:{ t: "Konkurrenz",     c: "warn" },
    synergie:  { t: "Synergie",       c: "ok" },
    hinweis:   { t: "Hinweis",        c: "info" }
  };

  /* ---------- DOM-Helfer ---------- */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function leadOf(name) { return (name || "?").replace(/^(Vitamin|Coenzym)\s+/i, "").trim().charAt(0).toUpperCase(); }

  /* ---------- State ---------- */
  const SKEY = "nt_state_v1";
  const defaults = { tab: "plan", selection: [], prefs: { slotsEnabled: { morgens: true, mittags: true, abends: true, nacht: true }, times: {} }, theme: "auto" };
  let state = load();
  let DB = null;

  function load() { try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch (_) { return Object.assign({}, defaults); } }
  function save() { try { localStorage.setItem(SKEY, JSON.stringify(state)); } catch (_) {} }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const host = $("#toasts"); if (!host) return;
    const t = h(`<div class="toast">${esc(msg)}</div>`);
    host.appendChild(t);
    clearTimeout(toastTimer);
    setTimeout(() => t.remove(), 2600);
  }

  /* ---------- Bottom-Sheet / Modal ---------- */
  function openSheet(node) {
    const bd = h('<div class="sheet-backdrop"></div>');
    const sheet = h('<div class="sheet" role="dialog" aria-modal="true"></div>');
    sheet.appendChild(h('<div class="sheet-handle"></div>'));
    sheet.appendChild(node);
    bd.appendChild(sheet);
    bd.addEventListener("click", e => { if (e.target === bd) close(); });
    function close() { bd.style.animation = "fade .12s ease reverse"; setTimeout(() => bd.remove(), 100); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(bd);
    return { close, sheet };
  }

  /* ---------- Theme ---------- */
  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", state.theme);
  }
  function cycleTheme() {
    state.theme = state.theme === "auto" ? "light" : state.theme === "light" ? "dark" : "auto";
    save(); applyTheme();
    toast("Design: " + ({ auto: "System", light: "Hell", dark: "Dunkel" }[state.theme]));
  }

  /* ================= VIEWS ================= */
  const view = () => $("#view");

  function setTab(tab) {
    state.tab = tab; save();
    $$("#tabbar button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    render();
  }

  function render() {
    const v = view(); if (!v) return;
    v.innerHTML = "";
    ({ plan: viewPlan, mittel: viewMittel, abstaende: viewAbstaende, mehr: viewMehr }[state.tab] || viewPlan)(v);
    v.scrollTop = 0; window.scrollTo(0, 0);
  }

  /* ---------- Bereich: PLAN ---------- */
  function viewPlan(v) {
    const wrapper = h('<div class="view stack"></div>');
    wrapper.appendChild(h(`<div class="spread"><h2 style="margin:0">Mein Tagesplan</h2>
      <button class="btn subtle sm" id="addBtn">+ Mittel</button></div>`));

    if (!state.selection.length) {
      wrapper.appendChild(h(`<div class="card"><div class="empty">
        <div class="ico">🗓️</div>
        <p><strong>Noch keine Mittel gewählt.</strong></p>
        <p class="muted tiny">Füge deine Nahrungsergänzungsmittel hinzu – Nährtakt erstellt daraus einen Tagesplan mit sinnvollen Zeitpunkten und den nötigen Abständen.</p>
        <button class="btn primary" id="addBtn2" style="margin-top:8px">Mittel hinzufügen</button>
      </div></div>`));
      v.appendChild(wrapper);
      $("#addBtn", v).onclick = $("#addBtn2", v).onclick = openPicker;
      return;
    }

    // gewählte Mittel als Chips mit optionaler Dosis
    const chips = h('<div class="card stack"></div>');
    chips.appendChild(h('<div class="section-title">Meine Mittel</div>'));
    const chipRow = h('<div class="row wrap-row"></div>');
    state.selection.forEach(sel => {
      const s = E.byId(DB, sel.id); if (!s) return;
      const chip = h(`<button class="chip active" title="Entfernen">${esc(s.name)} <span class="x">✕</span></button>`);
      chip.onclick = () => { state.selection = state.selection.filter(x => x.id !== sel.id); save(); render(); };
      chipRow.appendChild(chip);
    });
    chips.appendChild(chipRow);
    chips.appendChild(h(`<button class="btn ghost sm" id="doseBtn">Dosierungen eingeben (für Höchstmengen-Check)</button>`));
    wrapper.appendChild(chips);

    // Plan berechnen
    const plan = E.buildPlan(DB, state.selection, state.prefs);

    // Warnungen
    if (plan.warnings.length) {
      const w = h('<div class="stack"></div>');
      plan.warnings.forEach(warn => {
        const cls = warn.level === "danger" ? "danger" : "warn";
        w.appendChild(h(`<div class="banner ${cls}">${iconWarn()}<div>${esc(warn.text)}</div></div>`));
      });
      wrapper.appendChild(w);
    }
    if (plan.synergies.length) {
      plan.synergies.forEach(sy => wrapper.appendChild(h(`<div class="banner ok">${iconSpark()}<div>${esc(sy.text)}</div></div>`)));
    }

    // Timeline
    const tl = h('<div class="card"></div>');
    tl.appendChild(h('<div class="section-title">Tagesablauf</div>'));
    const timeline = h('<div class="timeline"></div>');
    plan.slots.forEach(slot => {
      const slotEl = h(`<div class="tl-slot slot-${slot.key}"></div>`);
      slotEl.appendChild(h(`<div class="tl-time">${esc(slot.time)} <span class="lbl">${esc(slot.label)}</span></div>`));
      const items = h('<div class="tl-items"></div>');
      slot.items.forEach(it => {
        const item = h(`<div class="tl-item">
          <span class="pill-cat" style="background:${catColor(it.category)}"></span>
          <div class="grow">
            <div style="font-weight:650">${esc(it.name)}${it.dose != null ? ` · ${esc(E.fmtDose(it.dose, it.unit))}` : ""}</div>
            ${it.withFoodLabel ? `<div class="tiny muted">${esc(it.withFoodLabel)}</div>` : ""}
          </div></div>`);
        item.onclick = () => openDetail(it.id);
        items.appendChild(item);
      });
      slotEl.appendChild(items);
      timeline.appendChild(slotEl);
    });
    tl.appendChild(timeline);
    wrapper.appendChild(tl);

    wrapper.appendChild(h(`<div class="disclaimer">Allgemeine Timing-Hinweise, kein individueller Einnahmeplan und keine medizinische Empfehlung. Halte dich an die Herstellerangaben deiner Produkte und sprich bei Erkrankungen, Schwangerschaft oder Medikamenteneinnahme mit Ärztin/Arzt oder Apotheke.</div>`));

    v.appendChild(wrapper);
    $("#addBtn", v).onclick = openPicker;
    $("#doseBtn", v).onclick = openDoses;
  }

  /* ---------- Bereich: MITTEL (Nachschlagewerk) ---------- */
  function viewMittel(v) {
    const wrapper = h('<div class="view stack"></div>');
    wrapper.appendChild(h(`<div class="search">${iconSearch()}<input class="input" id="q" type="search" inputmode="search" placeholder="Nährstoff suchen …" autocomplete="off"></div>`));
    const listWrap = h('<div id="listWrap" class="stack"></div>');
    wrapper.appendChild(listWrap);
    v.appendChild(wrapper);

    function draw(q) {
      listWrap.innerHTML = "";
      const results = E.search(DB, q);
      if (!results.length) { listWrap.appendChild(h(`<div class="empty"><div class="ico">🔍</div><p class="muted">Nichts gefunden.</p></div>`)); return; }
      // nach Kategorie gruppieren
      const groups = {};
      results.forEach(s => { (groups[s.category || "sonstige"] = groups[s.category || "sonstige"] || []).push(s); });
      CAT_ORDER.forEach(cat => {
        if (!groups[cat]) return;
        listWrap.appendChild(h(`<div class="section-title" style="margin-top:6px">${esc(CAT_LABEL[cat] || cat)}</div>`));
        const list = h('<div class="list"></div>');
        groups[cat].forEach(s => list.appendChild(rowFor(s)));
        listWrap.appendChild(list);
      });
    }
    function rowFor(s) {
      const inSel = state.selection.some(x => x.id === s.id);
      const row = h(`<button class="list-row">
        <span class="lead cat-${esc(s.category || "sonstige")}">${esc(leadOf(s.name))}</span>
        <span class="grow"><span class="name">${esc(s.name)}</span>
          <span class="sub">${esc(shortTiming(s))}</span></span>
        ${inSel ? '<span class="badge primary">im Plan</span>' : ''}
        <span class="rr">${iconChevron()}</span>
      </button>`);
      row.onclick = () => openDetail(s.id);
      return row;
    }
    $("#q", v).addEventListener("input", e => draw(e.target.value));
    draw("");
  }

  function shortTiming(s) {
    const t = s.timing || {};
    const slots = (t.slots || []).map(x => E.SLOT_LABEL[x] || x).join(", ");
    return [t.frequency, slots].filter(Boolean).join(" · ") || "Timing siehe Detail";
  }

  /* ---------- Bereich: ABSTÄNDE (Checker) ---------- */
  function viewAbstaende(v) {
    const wrapper = h('<div class="view stack"></div>');
    wrapper.appendChild(h(`<div><h2 style="margin:0 0 4px">Abstände prüfen</h2>
      <p class="muted tiny" style="margin:0">Wähle zwei oder mehr Mittel – Nährtakt zeigt, welche du zeitlich trennen solltest und welche sich ergänzen.</p></div>`));

    const picked = h('<div class="card stack"></div>');
    picked.appendChild(h('<div class="section-title">Ausgewählt</div>'));
    const chipRow = h('<div class="row wrap-row" id="chkChips"></div>');
    picked.appendChild(chipRow);
    picked.appendChild(h(`<button class="btn subtle sm" id="chkAdd">+ Mittel wählen</button>`));
    wrapper.appendChild(picked);
    const out = h('<div id="chkOut" class="stack"></div>');
    wrapper.appendChild(out);
    v.appendChild(wrapper);

    // eigene Auswahl für den Checker (startet mit Planauswahl)
    if (!window.__chk) window.__chk = state.selection.map(s => s.id);

    function drawChips() {
      chipRow.innerHTML = "";
      if (!window.__chk.length) { chipRow.appendChild(h('<span class="muted tiny">Noch nichts gewählt.</span>')); }
      window.__chk.forEach(id => {
        const s = E.byId(DB, id); if (!s) return;
        const chip = h(`<button class="chip active">${esc(s.name)} <span class="x">✕</span></button>`);
        chip.onclick = () => { window.__chk = window.__chk.filter(x => x !== id); drawChips(); drawOut(); };
        chipRow.appendChild(chip);
      });
    }
    function drawOut() {
      out.innerHTML = "";
      const ids = window.__chk;
      if (ids.length < 2) { out.appendChild(h(`<div class="empty"><div class="ico">↔️</div><p class="muted tiny">Mindestens zwei Mittel wählen.</p></div>`)); return; }
      const pairs = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const r = E.pairRule(DB, ids[i], ids[j]);
        pairs.push({ a: E.byId(DB, ids[i]), b: E.byId(DB, ids[j]), r });
      }
      // relevante zuerst
      pairs.sort((p, q) => rank(q.r) - rank(p.r));
      const card = h('<div class="list"></div>');
      pairs.forEach(p => {
        if (!p.a || !p.b) return;
        const k = p.r ? (KIND[p.r.kind] || KIND.hinweis) : null;
        const spacing = p.r && p.r.spacingHours ? `<span class="badge warn">≥ ${p.r.spacingHours} h Abstand</span>` : "";
        const kindB = k ? `<span class="badge ${k.c}">${k.t}</span>` : `<span class="badge">unkritisch</span>`;
        card.appendChild(h(`<div class="card flat" style="border:1px solid var(--line)">
          <div class="spread" style="align-items:flex-start">
            <div style="font-weight:650">${esc(p.a.name)} <span class="muted">&harr;</span> ${esc(p.b.name)}</div>
            <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${spacing}${kindB}</div>
          </div>
          ${p.r && p.r.reason ? `<div class="tiny muted" style="margin-top:6px">${esc(p.r.reason)}${p.r.source ? " (" + esc(E.srcName(DB, p.r.source)) + ")" : ""}</div>`
                              : `<div class="tiny muted" style="margin-top:6px">Kein bekannter Abstand nötig. Herstellerangaben beachten.</div>`}
        </div>`));
      });
      out.appendChild(card);
    }
    function rank(r) { if (!r) return 0; return { hemmung: 3, konkurrenz: 3, synergie: 2, hinweis: 1 }[r.kind] || 1; }

    $("#chkAdd", v).onclick = () => openPicker({
      preselected: window.__chk,
      onDone: ids => { window.__chk = ids; drawChips(); drawOut(); }
    });
    drawChips(); drawOut();
  }

  /* ---------- Bereich: MEHR ---------- */
  function viewMehr(v) {
    const lic = L.load();
    const wrapper = h('<div class="view stack"></div>');

    // Zeit-Einstellungen
    const times = Object.assign({}, E.SLOT_DEFAULT_TIME, state.prefs.times || {});
    const en = state.prefs.slotsEnabled || {};
    const timeCard = h('<div class="card stack"></div>');
    timeCard.appendChild(h('<div class="section-title">Meine Einnahme-Zeiten</div>'));
    E.SLOT_ORDER.forEach(sl => {
      const rowEl = h(`<div class="spread">
        <label class="row" style="gap:8px"><input type="checkbox" data-en="${sl}" ${en[sl] !== false ? "checked" : ""}> ${esc(E.SLOT_LABEL[sl])}</label>
        <input class="input" style="max-width:120px" type="time" data-t="${sl}" value="${esc(times[sl])}">
      </div>`);
      timeCard.appendChild(rowEl);
    });
    wrapper.appendChild(timeCard);

    // Lizenz
    const licCard = h('<div class="card stack"></div>');
    licCard.appendChild(h('<div class="section-title">Lizenz</div>'));
    if (lic && lic.ok) {
      licCard.appendChild(h(`<div class="spread"><div><div style="font-weight:650">Freigeschaltet ✓</div>
        <div class="tiny muted">${esc(lic.key)}${lic.name ? " · " + esc(lic.name) : ""}</div></div>
        <span class="badge ok">aktiv</span></div>`));
      licCard.appendChild(h(`<button class="btn ghost sm" id="deact">Abmelden / Schlüssel entfernen</button>`));
    } else {
      licCard.appendChild(h(`<div class="banner warn">${iconWarn()}<div>Vorschau-Modus. Für den vollen Funktionsumfang bitte freischalten.</div></div>`));
      licCard.appendChild(h(`<a class="btn primary sm" href="freischalten.html">Jetzt freischalten</a>`));
    }
    wrapper.appendChild(licCard);

    // App / Info
    const infoCard = h('<div class="card stack"></div>');
    infoCard.appendChild(h('<div class="section-title">App & Info</div>'));
    if (!(window.NTInstall && window.NTInstall.isStandalone()))
      infoCard.appendChild(h(`<button class="btn ghost sm" id="instBtn">Als App installieren</button>`));
    infoCard.appendChild(h(`<div class="row wrap-row" style="gap:8px">
      <a class="btn ghost sm" href="index.html">Startseite</a>
      <a class="btn ghost sm" href="impressum.html">Impressum</a>
      <a class="btn ghost sm" href="datenschutz.html">Datenschutz</a>
    </div>`));
    infoCard.appendChild(h(`<div class="tiny muted">Version ${esc(C.version || "")} · Datenstand ${esc((DB.meta && DB.meta.updated) || "—")}</div>`));
    wrapper.appendChild(infoCard);

    // Disclaimer
    wrapper.appendChild(h(`<div class="disclaimer"><strong>Wichtiger Hinweis:</strong> Nährtakt ist ein Informations- und Planungswerkzeug und <strong>kein Medizinprodukt</strong>. Es stellt keine Diagnose, gibt keine Heil- oder Therapieversprechen und ersetzt keine ärztliche oder pharmazeutische Beratung. Alle Angaben sind allgemeine Informationen aus öffentlichen Quellen (u. a. BfR, EFSA, DGE, NIH). Für individuelle Fragen wende dich an Ärztin/Arzt oder Apotheke.</div>`));

    v.appendChild(wrapper);

    // Handler
    $$('input[data-en]', v).forEach(cb => cb.onchange = () => { (state.prefs.slotsEnabled = state.prefs.slotsEnabled || {})[cb.dataset.en] = cb.checked; save(); });
    $$('input[data-t]', v).forEach(ti => ti.onchange = () => { (state.prefs.times = state.prefs.times || {})[ti.dataset.t] = ti.value; save(); });
    const de = $("#deact", v); if (de) de.onclick = () => { if (confirm("Schlüssel wirklich von diesem Gerät entfernen?")) { L.deactivate(); location.reload(); } };
    const ib = $("#instBtn", v); if (ib) ib.onclick = () => window.NTInstall ? window.NTInstall.install() : toast("Nutze das Browser-Menü: „Zum Startbildschirm hinzufügen“.");
  }

  /* ---------- Picker (Mittel auswählen) ---------- */
  function openPicker(opts) {
    opts = (opts && typeof opts === "object" && !opts.target) ? opts : {};
    let chosen = new Set(opts.preselected || state.selection.map(s => s.id));
    const node = h('<div class="sheet-body"></div>');
    const head = h('<div class="sheet-head"><div class="spread"><strong>Mittel wählen</strong><button class="btn sm primary" id="pDone">Fertig</button></div>' +
      '<div class="search" style="margin-top:10px">' + iconSearch() + '<input class="input" id="pq" type="search" placeholder="Suchen …" autocomplete="off"></div></div>');
    const body = h('<div id="pBody" class="stack" style="margin-top:12px"></div>');
    node.appendChild(body);
    const sheet = openSheet(node);
    sheet.sheet.insertBefore(head, node);

    function draw(q) {
      body.innerHTML = "";
      const res = E.search(DB, q);
      const groups = {};
      res.forEach(s => (groups[s.category || "sonstige"] = groups[s.category || "sonstige"] || []).push(s));
      CAT_ORDER.forEach(cat => {
        if (!groups[cat]) return;
        body.appendChild(h(`<div class="section-title" style="margin-top:4px">${esc(CAT_LABEL[cat] || cat)}</div>`));
        const list = h('<div class="row wrap-row"></div>');
        groups[cat].forEach(s => {
          const on = chosen.has(s.id);
          const chip = h(`<button class="chip ${on ? "active" : ""}">${esc(s.name)}${on ? ' <span class="x">✓</span>' : ""}</button>`);
          chip.onclick = () => { if (chosen.has(s.id)) chosen.delete(s.id); else chosen.add(s.id); draw(q); };
          list.appendChild(chip);
        });
        body.appendChild(list);
      });
    }
    $("#pq", head).addEventListener("input", e => draw(e.target.value));
    $("#pDone", head).onclick = () => {
      const ids = Array.from(chosen);
      if (opts.onDone) opts.onDone(ids);
      else {
        // in state.selection übernehmen, bestehende Dosen behalten
        const prev = state.selection;
        state.selection = ids.map(id => prev.find(x => x.id === id) || { id, dose: null });
        save(); render();
      }
      sheet.close();
    };
    draw("");
  }

  /* ---------- Dosierungen eingeben ---------- */
  function openDoses() {
    const node = h('<div class="sheet-body stack"></div>');
    node.appendChild(h('<div class="sheet-head"><strong>Dosierungen (optional)</strong><div class="tiny muted" style="margin-top:4px">Für den Höchstmengen-Abgleich. Leer lassen, wenn unbekannt.</div></div>'));
    state.selection.forEach(sel => {
      const s = E.byId(DB, sel.id); if (!s) return;
      const f = h(`<div class="field" style="margin:0"><label>${esc(s.name)} <span class="muted tiny">(${esc(s.unit || "")}/Tag)</span></label>
        <input class="input" type="number" step="any" inputmode="decimal" data-dose="${esc(sel.id)}" value="${sel.dose != null ? esc(sel.dose) : ""}" placeholder="z. B. Wert laut Produkt"></div>`);
      node.appendChild(f);
    });
    node.appendChild(h('<button class="btn primary block" id="dSave">Speichern</button>'));
    const sh = openSheet(node);
    $("#dSave", node).onclick = () => {
      $$('input[data-dose]', node).forEach(inp => {
        const sel = state.selection.find(x => x.id === inp.dataset.dose);
        if (sel) { const v = parseFloat(inp.value.replace(",", ".")); sel.dose = isNaN(v) ? null : v; }
      });
      save(); sh.close(); render(); toast("Dosierungen gespeichert");
    };
  }

  /* ---------- Detail-Sheet eines Mittels ---------- */
  function openDetail(id) {
    const s = E.byId(DB, id); if (!s) return;
    const inSel = state.selection.some(x => x.id === id);
    const t = s.timing || {};
    const lim = s.limits || {};
    const inter = E.interactionsFor(DB, id);

    const node = h('<div class="sheet-body"></div>');
    const head = h(`<div class="sheet-head"><div class="row" style="gap:12px">
      <span class="lead cat-${esc(s.category || "sonstige")}" style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-weight:750">${esc(leadOf(s.name))}</span>
      <div class="grow"><div style="font-weight:750;font-size:1.15rem">${esc(s.name)}</div>
        <div class="tiny muted">${esc(CAT_LABEL[s.category] || "")}${s.aliases && s.aliases.length ? " · " + esc(s.aliases.join(", ")) : ""}</div></div>
    </div></div>`);

    if (s.summary) node.appendChild(h(`<p style="margin-top:12px">${esc(s.summary)}</p>`));

    // Timing
    const timing = h('<div class="card flat" style="border:1px solid var(--line);margin-top:8px"></div>');
    timing.appendChild(h('<div class="section-title">Einnahme &amp; Zeitpunkt</div>'));
    addRow(timing, "Häufigkeit", t.frequency || "—");
    addRow(timing, "Zeitpunkt", (t.slots || []).map(x => E.SLOT_LABEL[x] || x).join(", ") || "beliebig");
    addRow(timing, "Mahlzeit", E.WITHFOOD_LABEL[t.withFood] || "—");
    if (t.note) addRow(timing, "Hinweis", t.note);
    node.appendChild(timing);

    // Höchstmengen
    const limits = h('<div class="card flat" style="border:1px solid var(--line);margin-top:8px"></div>');
    limits.appendChild(h('<div class="section-title">Mengen &amp; Grenzen</div>'));
    if (lim.bfr && lim.bfr.value != null) addRow(limits, "Höchstmenge NEM", `${E.fmtDose(lim.bfr.value, lim.bfr.unit || s.unit)} <span class="tiny muted">(${esc(E.srcName(DB, lim.bfr.source))})</span>`);
    if (lim.ul && lim.ul.value != null) addRow(limits, "Oberer Wert (UL)", `${E.fmtDose(lim.ul.value, lim.ul.unit || s.unit)} <span class="tiny muted">(${esc(E.srcName(DB, lim.ul.source))})</span>`);
    if (!(lim.bfr && lim.bfr.value != null) && !(lim.ul && lim.ul.value != null)) {
      limits.appendChild(h('<p class="tiny muted" style="margin:6px 0 0">Keine offizielle Höchstmenge/Obergrenze hinterlegt. Herstellerangaben beachten.</p>'));
    }
    node.appendChild(limits);

    // Wechselwirkungen / Abstände
    if (inter.length) {
      const ix = h('<div class="card flat" style="border:1px solid var(--line);margin-top:8px"></div>');
      ix.appendChild(h('<div class="section-title">Abstände &amp; Wechselwirkungen</div>'));
      inter.sort((a, b) => (b.spacingHours || 0) - (a.spacingHours || 0));
      inter.forEach(it => {
        const k = KIND[it.kind] || KIND.hinweis;
        ix.appendChild(h(`<div class="datarow"><div class="k">${esc(it.otherName)}</div>
          <div class="v"><div class="row" style="gap:6px;flex-wrap:wrap">
            ${it.spacingHours ? `<span class="badge warn">≥ ${it.spacingHours} h</span>` : ""}
            <span class="badge ${k.c}">${k.t}</span></div>
            ${it.reason ? `<div class="tiny muted" style="margin-top:4px">${esc(it.reason)}${it.source ? " (" + esc(E.srcName(DB, it.source)) + ")" : ""}</div>` : ""}
          </div></div>`));
      });
      node.appendChild(ix);
    }

    // Quellen
    if (s.sourceRefs && s.sourceRefs.length) {
      const src = (s.sourceRefs || []).map(k => {
        const o = DB.meta && DB.meta.sources && DB.meta.sources[k];
        return o ? (o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(E.srcName(DB, k))}</a>` : esc(E.srcName(DB, k))) : esc(k);
      }).join(" · ");
      node.appendChild(h(`<p class="tiny muted" style="margin-top:10px">Quellen: ${src}</p>`));
    }

    node.appendChild(h(`<button class="btn ${inSel ? "ghost" : "primary"} block" id="detAdd" style="margin-top:14px">${inSel ? "Aus meinem Plan entfernen" : "Zu meinem Plan hinzufügen"}</button>`));
    node.appendChild(h('<div class="disclaimer" style="margin-top:12px">Allgemeine Information, keine medizinische Empfehlung. Kein Medizinprodukt.</div>'));

    const sh = openSheet(node);
    sh.sheet.insertBefore(head, node);
    $("#detAdd", node).onclick = () => {
      if (inSel) state.selection = state.selection.filter(x => x.id !== id);
      else state.selection.push({ id, dose: null });
      save(); sh.close(); toast(inSel ? "Entfernt" : "Zum Plan hinzugefügt"); if (state.tab === "plan") render();
    };
  }
  function addRow(parent, k, vHtml) { parent.appendChild(h(`<div class="datarow"><div class="k">${esc(k)}</div><div class="v">${vHtml}</div></div>`)); }

  /* ---------- kleine Icons ---------- */
  function iconSearch() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>'; }
  function iconChevron() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'; }
  function iconWarn() { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a1.9 1.9 0 001.7 2.9h15.8a1.9 1.9 0 001.7-2.9L13.7 3.9a1.9 1.9 0 00-3.4 0z"/></svg>'; }
  function iconSpark() { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/></svg>'; }
  function catColor(cat) {
    return ({ "vitamin-fett": "#e0a02e", "vitamin-wasser": "#0f7268", "mineralstoff": "#2f6fb0", "spurenelement": "#7141a8", "omega": "#2f9e5f", "aminosaeure": "#c0492f", "probiotikum": "#1d7a94", "sonstige": "#849690" }[cat] || "#849690");
  }

  /* ================= INIT ================= */
  function backendConfigured() { return C.fnBase && C.fnBase.indexOf("__") !== 0; }

  function showLocked() {
    $("#loading").hidden = true;
    const app = $("#app"); app.hidden = false;
    $("#tabbar").style.display = "none";
    const v = view();
    v.innerHTML = "";
    const card = h(`<div class="view stack" style="padding-top:20px">
      <div class="card pad-lg stack center">
        <div style="font-size:2.4rem">🔒</div>
        <h2 style="margin:0">Nährtakt freischalten</h2>
        <p class="muted" style="margin:0">Gib deinen Lizenzschlüssel ein, um alle Nährstoffe, den Tagesplaner und den Abstände-Check zu nutzen.</p>
        <div class="field" style="margin:6px 0 0;text-align:left">
          <label>Lizenzschlüssel</label>
          <input class="input mono" id="lk" placeholder="NT-XXXXX-XXXXX-XXXXX" autocomplete="off">
          <div class="input-hint">Format: NT-… (aus deiner Bestätigungs-E-Mail)</div>
        </div>
        <button class="btn primary block lg" id="lkGo">Freischalten</button>
        <a class="btn ghost block" href="freischalten.html">Ich habe noch keinen Schlüssel – kaufen</a>
        <a class="tiny muted" href="index.html" style="margin-top:4px">Zur Startseite</a>
      </div>
    </div>`);
    v.appendChild(card);
    const input = $("#lk", v);
    input.addEventListener("input", () => { const p = input.selectionStart; input.value = L.displayKey(input.value); });
    $("#lkGo", v).onclick = async () => {
      const btn = $("#lkGo", v); btn.disabled = true; btn.textContent = "Prüfe …";
      try { await L.activate(input.value); location.reload(); }
      catch (e) { toast(e.message || "Schlüssel ungültig"); btn.disabled = false; btn.textContent = "Freischalten"; }
    };
  }

  function startApp(previewNoBackend) {
    // Deep-Link aus Manifest-Shortcuts / geteilten Links: ?tab=plan|mittel|abstaende|mehr
    try {
      const dl = new URLSearchParams(location.search).get("tab");
      if (dl && ["plan", "mittel", "abstaende", "mehr"].includes(dl)) { state.tab = dl; save(); }
    } catch (_) {}
    $("#loading").hidden = true;
    $("#app").hidden = false;
    applyTheme();
    $("#btnTheme").onclick = cycleTheme;
    $$("#tabbar button").forEach(b => b.onclick = () => setTab(b.dataset.tab));
    $$("#tabbar button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    render();
    if (previewNoBackend) toast("Vorschau-Modus (Backend nicht verbunden)");
    // stille Re-Validierung
    if (L.isActivated() && backendConfigured()) {
      L.revalidate().then(r => { if (!r.ok && r.revoked) { toast("Lizenz nicht mehr gültig."); setTimeout(() => location.reload(), 1500); } });
    }
  }

  async function init() {
    applyTheme();
    try {
      const res = await fetch("assets/data/supplements.json", { cache: "no-cache" });
      DB = await res.json();
    } catch (e) {
      $("#loading").innerHTML = '<div class="wrap center"><p><strong>Daten konnten nicht geladen werden.</strong></p><p class="muted tiny">Bitte Verbindung prüfen und neu laden.</p></div>';
      return;
    }
    if (L.isActivated()) startApp(false);
    else if (!backendConfigured()) startApp(true);   // lokale Vorschau, solange kein Backend konfiguriert ist
    else showLocked();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
