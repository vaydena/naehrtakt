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
  const TABS = ["heute", "plan", "mittel", "statistik", "mehr"];
  const defaults = {
    tab: "heute", selection: [], custom: [], log: {},
    prefs: { slotsEnabled: { morgens: true, mittags: true, abends: true, nacht: true }, times: {} },
    theme: "auto"
  };
  let state = load();
  let DB = null;
  let planSeg = "plan";      // "plan" | "wechsel"  (Segment im Plan-Tab)
  let mittelCat = "alle";    // Kategorie-Filter im Mittel-Tab

  function load() { try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch (_) { return Object.assign({}, defaults); } }
  function save() { try { localStorage.setItem(SKEY, JSON.stringify(state)); } catch (_) {} }

  function migrate() {
    state.log    = (state.log && typeof state.log === "object") ? state.log : {};
    state.custom = Array.isArray(state.custom) ? state.custom : [];
    state.selection = Array.isArray(state.selection) ? state.selection : [];
    if (state.tab === "abstaende") { state.tab = "plan"; planSeg = "wechsel"; }   // alter Deep-Link/Tab
    if (TABS.indexOf(state.tab) < 0) state.tab = "heute";
  }
  migrate();

  /* ---------- Toast ---------- */
  function toast(msg) {
    const host = $("#toasts"); if (!host) return;
    const t = h(`<div class="toast">${esc(msg)}</div>`);
    host.appendChild(t);
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

  /* ================= Einnahme-Protokoll / eigene Mittel ================= */
  function applyCustom() {
    if (!DB) return;
    if (!DB._base) DB._base = DB.supplements.slice();
    DB.supplements = DB._base.concat(state.custom || []);
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function todayStr(d) { d = d || new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function dateFromStr(s) { const p = String(s).split("-").map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); }
  function addDays(d, n) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + n); return x; }
  function plannedIds() { return state.selection.map(s => s.id); }

  function setTaken(date, id, on) {
    const rec = state.log[date] || (state.log[date] = { taken: {}, plan: plannedIds() });
    const union = new Set(rec.plan || []); plannedIds().forEach(x => union.add(x));
    rec.plan = Array.from(union);
    if (on) rec.taken[id] = true; else delete rec.taken[id];
    save();
  }

  // Kennzahlen eines Tages – für heute dynamisch an die aktuelle Auswahl gekoppelt
  function dayStats(date) {
    const isToday = date === todayStr();
    const rec = state.log[date];
    let plan;
    if (rec && rec.plan && rec.plan.length) plan = isToday ? Array.from(new Set(rec.plan.concat(plannedIds()))) : rec.plan.slice();
    else plan = isToday ? plannedIds() : [];
    const takenAll = rec ? Object.keys(rec.taken || {}).filter(k => rec.taken[k]) : [];
    const takenIds = takenAll.filter(id => plan.indexOf(id) >= 0);
    const planned = plan.length, taken = takenIds.length;
    return { planned, taken, done: planned > 0 && taken >= planned, plan, takenIds };
  }

  function currentStreak() {
    let streak = 0, d = new Date();
    if (!dayStats(todayStr()).done) d = addDays(d, -1);      // heute noch offen → bricht Serie (noch) nicht
    while (true) {
      const ds = todayStr(d);
      if (state.log[ds] && dayStats(ds).done) { streak++; d = addDays(d, -1); } else break;
    }
    return streak;
  }
  function longestStreak() {
    const dates = Object.keys(state.log).filter(ds => dayStats(ds).done).sort();
    if (!dates.length) return 0;
    let best = 1, cur = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = Math.round((dateFromStr(dates[i]) - dateFromStr(dates[i - 1])) / 86400000);
      if (diff === 1) { cur++; best = Math.max(best, cur); } else cur = 1;
    }
    return best;
  }
  function quote(days) {
    let planned = 0, taken = 0;
    for (let i = 0; i < days; i++) {
      const ds = todayStr(addDays(new Date(), -i));
      if (!state.log[ds]) continue;
      const st = dayStats(ds); planned += st.planned; taken += st.taken;
    }
    return planned > 0 ? Math.round(taken / planned * 100) : 0;
  }
  function perSupp(days) {
    const map = {};
    for (let i = 0; i < days; i++) {
      const ds = todayStr(addDays(new Date(), -i)), rec = state.log[ds];
      if (!rec) continue;
      (rec.plan || []).forEach(id => {
        const m = map[id] || (map[id] = { planned: 0, taken: 0 });
        m.planned++; if (rec.taken && rec.taken[id]) m.taken++;
      });
    }
    return map;
  }
  function allTakenCount() {
    let n = 0;
    Object.keys(state.log).forEach(ds => { const t = state.log[ds].taken || {}; n += Object.keys(t).filter(k => t[k]).length; });
    return n;
  }
  function rank(r) { if (!r) return 0; return { hemmung: 3, konkurrenz: 3, synergie: 2, hinweis: 1 }[r.kind] || 1; }

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
    ({ heute: viewHeute, plan: viewPlan, mittel: viewMittel, statistik: viewStatistik, mehr: viewMehr }[state.tab] || viewHeute)(v);
    v.scrollTop = 0; window.scrollTo(0, 0);
  }

  /* ---------- Bereich: HEUTE ---------- */
  function streakBadge() {
    const s = currentStreak();
    if (s <= 0) return '<span class="streak-badge muted tiny" style="font-weight:700">Noch keine Serie</span>';
    return `<span class="streak-badge streak-on">🔥 ${s} ${s === 1 ? "Tag" : "Tage"}</span>`;
  }
  function ringCard(taken, planned, pct) {
    const CC = 326.726, off = CC * (1 - (planned ? pct : 0) / 100);
    return h(`<div class="card ring-card">
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-bg" cx="60" cy="60" r="52" fill="none" stroke-width="11"/>
          <circle class="ring-fg" cx="60" cy="60" r="52" fill="none" stroke-width="11" stroke-linecap="round"
            stroke-dasharray="${CC.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)"/>
        </svg>
        <div class="ring-center">
          <div class="ring-num">${taken}<span class="ring-den"> / ${planned}</span></div>
          <div class="ring-cap">${planned && pct >= 100 ? "geschafft 🎉" : "erledigt"}</div>
        </div>
      </div>
    </div>`);
  }
  function updateRing(scope) {
    const st = dayStats(todayStr());
    const pct = st.planned ? Math.round(st.taken / st.planned * 100) : 0;
    const CC = 326.726;
    const fg = $(".ring-fg", scope); if (fg) fg.style.strokeDashoffset = (CC * (1 - pct / 100)).toFixed(1);
    const num = $(".ring-num", scope); if (num) num.innerHTML = st.taken + '<span class="ring-den"> / ' + st.planned + "</span>";
    const cap = $(".ring-cap", scope); if (cap) cap.textContent = (st.planned && pct >= 100) ? "geschafft 🎉" : "erledigt";
    const badge = $(".streak-badge", scope); if (badge) badge.outerHTML = streakBadge();
  }
  function iconCheck() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'; }

  function viewHeute(v) {
    const wrapper = h('<div class="view stack"></div>');
    const today = todayStr();
    let dateLabel; try { dateLabel = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }); } catch (_) { dateLabel = today; }

    wrapper.appendChild(h(`<div class="spread">
      <div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700">Heute</div>
        <h2 style="margin:2px 0 0">${esc(dateLabel)}</h2></div>
      ${streakBadge()}
    </div>`));

    if (!state.selection.length) {
      wrapper.appendChild(h(`<div class="card"><div class="empty">
        <div class="ico">✅</div>
        <p><strong>Noch keine Mittel im Plan.</strong></p>
        <p class="muted tiny">Lege zuerst fest, welche Nahrungsergänzungsmittel du nimmst – dann hakst du sie hier täglich ab und behältst deine Einnahme im Blick.</p>
        <button class="btn primary" id="goMittel" style="margin-top:8px">Mittel hinzufügen</button>
      </div></div>`));
      v.appendChild(wrapper);
      $("#goMittel", v).onclick = () => setTab("mittel");
      return;
    }

    const st = dayStats(today);
    const pct = st.planned ? Math.round(st.taken / st.planned * 100) : 0;
    wrapper.appendChild(ringCard(st.taken, st.planned, pct));

    const plan = E.buildPlan(DB, state.selection, state.prefs);
    const realWarn = plan.warnings.filter(w => w.ids);   // Wechselwirkungs-Konflikte (Höchstmengen tragen .id)
    if (realWarn.length) {
      const b = h(`<button class="banner warn" style="width:100%;text-align:left;border:0;cursor:pointer">${iconWarn()}<div><strong>${realWarn.length} ${realWarn.length === 1 ? "Wechselwirkung" : "Wechselwirkungen"} erkannt.</strong> Tippen für Details &amp; empfohlene Abstände.</div></button>`);
      b.onclick = () => { planSeg = "wechsel"; setTab("plan"); };
      wrapper.appendChild(b);
    }

    const listCard = h('<div class="card stack"></div>');
    listCard.appendChild(h('<div class="section-title">Zum Abhaken</div>'));
    plan.slots.forEach(slot => {
      listCard.appendChild(h(`<div class="ci-group">${esc(slot.time)} · ${esc(slot.label)}</div>`));
      slot.items.forEach(it => {
        const on = st.takenIds.indexOf(it.id) >= 0;
        const item = h(`<div class="check-item${on ? " on" : ""}" data-id="${esc(it.id)}">
          <button class="cbx" aria-label="Abhaken">${iconCheck()}</button>
          <div class="grow ci-main">
            <div class="ci-name">${esc(it.name)}${it.dose != null ? ` · ${esc(E.fmtDose(it.dose, it.unit))}` : ""}</div>
            ${it.withFoodLabel ? `<div class="ci-sub">${esc(it.withFoodLabel)}</div>` : ""}
          </div>
          <button class="ci-info" aria-label="Details">${iconChevron()}</button>
        </div>`);
        const toggle = () => {
          const nowOn = !item.classList.contains("on");
          item.classList.toggle("on", nowOn);
          setTaken(today, it.id, nowOn);
          updateRing(wrapper);
        };
        $(".cbx", item).onclick = toggle;
        $(".ci-main", item).onclick = toggle;
        $(".ci-info", item).onclick = e => { e.stopPropagation(); openDetail(it.id); };
        listCard.appendChild(item);
      });
    });
    wrapper.appendChild(listCard);

    wrapper.appendChild(h(`<div class="disclaimer">Dein persönliches Einnahme-Protokoll dient nur deiner eigenen Übersicht. Nährtakt ist <strong>kein Medizinprodukt</strong> und gibt keine medizinische Empfehlung.</div>`));
    v.appendChild(wrapper);
  }

  /* ---------- Bereich: PLAN (Tagesplan + Wechselwirkungen) ---------- */
  function viewPlan(v) {
    const wrapper = h('<div class="view stack"></div>');
    wrapper.appendChild(h(`<div class="spread"><h2 style="margin:0">Mein Plan</h2>
      <button class="btn subtle sm" id="addBtn">+ Mittel</button></div>`));

    const seg = h(`<div class="segmented" role="tablist">
      <button role="tab" data-seg="plan" aria-selected="${planSeg === "plan"}">Tagesplan</button>
      <button role="tab" data-seg="wechsel" aria-selected="${planSeg === "wechsel"}">Wechselwirkungen</button>
    </div>`);
    wrapper.appendChild(seg);

    const body = h('<div class="stack" id="planBody"></div>');
    wrapper.appendChild(body);
    v.appendChild(wrapper);

    $$("button[data-seg]", seg).forEach(b => b.onclick = () => {
      planSeg = b.dataset.seg;
      $$("button[data-seg]", seg).forEach(x => x.setAttribute("aria-selected", String(x.dataset.seg === planSeg)));
      drawBody();
    });
    $("#addBtn", v).onclick = openPicker;

    function drawBody() {
      body.innerHTML = "";
      if (!state.selection.length) {
        body.appendChild(h(`<div class="card"><div class="empty">
          <div class="ico">🗓️</div><p><strong>Noch keine Mittel gewählt.</strong></p>
          <p class="muted tiny">Füge deine Mittel hinzu – Nährtakt erstellt daraus einen Tagesplan mit sinnvollen Zeitpunkten und prüft die Abstände.</p>
          <button class="btn primary" id="addBtn2" style="margin-top:8px">Mittel hinzufügen</button></div></div>`));
        $("#addBtn2", body).onclick = openPicker;
        return;
      }
      if (planSeg === "plan") planTimeline(body); else planWechsel(body);
    }
    drawBody();
  }

  function selChips() {
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
    return chips;
  }

  function planTimeline(body) {
    const chips = selChips();
    chips.appendChild(h('<button class="btn ghost sm" id="doseBtn">Dosierungen eingeben (für Höchstmengen-Check)</button>'));
    body.appendChild(chips);

    const plan = E.buildPlan(DB, state.selection, state.prefs);
    if (plan.warnings.length) {
      const w = h('<div class="stack"></div>');
      plan.warnings.forEach(warn => {
        const cls = warn.level === "danger" ? "danger" : "warn";
        w.appendChild(h(`<div class="banner ${cls}">${iconWarn()}<div>${esc(warn.text)}</div></div>`));
      });
      body.appendChild(w);
    }
    if (plan.synergies.length) plan.synergies.forEach(sy => body.appendChild(h(`<div class="banner ok">${iconSpark()}<div>${esc(sy.text)}</div></div>`)));

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
    body.appendChild(tl);

    body.appendChild(h(`<div class="disclaimer">Allgemeine Timing-Hinweise, kein individueller Einnahmeplan und keine medizinische Empfehlung. Halte dich an die Herstellerangaben deiner Produkte und sprich bei Erkrankungen, Schwangerschaft oder Medikamenteneinnahme mit Ärztin/Arzt oder Apotheke.</div>`));
    $("#doseBtn", body).onclick = openDoses;
  }

  function planWechsel(body) {
    body.appendChild(selChips());
    const ids = state.selection.map(s => s.id).filter(id => E.byId(DB, id));
    if (ids.length < 2) {
      body.appendChild(h(`<div class="card"><div class="empty"><div class="ico">↔️</div>
        <p class="muted tiny">Wähle mindestens zwei Mittel, um Wechselwirkungen und nötige Abstände zu sehen.</p></div></div>`));
      return;
    }

    body.appendChild(buildMatrix(ids));

    const pairs = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const r = E.pairRule(DB, ids[i], ids[j]);
      if (r) pairs.push({ a: E.byId(DB, ids[i]), b: E.byId(DB, ids[j]), r });
    }
    pairs.sort((p, q) => rank(q.r) - rank(p.r));
    if (pairs.length) {
      const listCard = h('<div class="card stack"></div>');
      listCard.appendChild(h('<div class="section-title">Details</div>'));
      pairs.forEach(p => {
        if (!p.a || !p.b) return;
        const k = KIND[p.r.kind] || KIND.hinweis;
        const spacing = p.r.spacingHours ? `<span class="badge warn">≥ ${p.r.spacingHours} h Abstand</span>` : "";
        listCard.appendChild(h(`<div class="card flat" style="border:1px solid var(--line)">
          <div class="spread" style="align-items:flex-start">
            <div style="font-weight:650">${esc(p.a.name)} <span class="muted">↔</span> ${esc(p.b.name)}</div>
            <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${spacing}<span class="badge ${k.c}">${k.t}</span></div>
          </div>
          ${p.r.reason ? `<div class="tiny muted" style="margin-top:6px">${esc(p.r.reason)}${p.r.source ? " (" + esc(E.srcName(DB, p.r.source)) + ")" : ""}</div>` : ""}
        </div>`));
      });
      body.appendChild(listCard);
    } else {
      body.appendChild(h(`<div class="banner ok">${iconSpark()}<div>Keine bekannten problematischen Wechselwirkungen zwischen deinen Mitteln. Herstellerangaben trotzdem beachten.</div></div>`));
    }

    body.appendChild(h(`<div class="disclaimer">Angaben aus öffentlichen Quellen (u. a. BfR, EFSA, DGE, NIH). Keine Diagnose, kein Medizinprodukt.</div>`));
  }

  function abbr(name) {
    const m = String(name).match(/^Vitamin\s+([A-K][0-9]?)/i);
    if (m) return "Vit " + m[1].toUpperCase();
    const n = String(name).replace(/^Coenzym\s+/i, "");
    return n.length > 6 ? n.slice(0, 5) + "." : n;
  }
  function buildMatrix(ids) {
    const items = ids.map(id => E.byId(DB, id)).filter(Boolean);
    const card = h('<div class="card stack"></div>');
    card.appendChild(h('<div class="section-title">Kompatibilität auf einen Blick</div>'));
    const scroll = h('<div class="matrix-scroll"></div>');
    const table = h('<table class="matrix"></table>');

    const thead = h('<thead></thead>');
    let hr = '<tr><th class="mh corner"></th>';
    items.forEach(s => { hr += `<th class="mh"><span>${esc(abbr(s.name))}</span></th>`; });
    thead.appendChild(h(hr + "</tr>"));
    table.appendChild(thead);

    const tbody = h('<tbody></tbody>');
    items.forEach((rowS, ri) => {
      const tr = h("<tr></tr>");
      tr.appendChild(h(`<th class="mr">${esc(abbr(rowS.name))}</th>`));
      items.forEach((colS, ci) => {
        if (ri === ci) { tr.appendChild(h('<td class="cell mx-self">–</td>')); return; }
        const r = E.pairRule(DB, rowS.id, colS.id);
        let cls = "mx-none", sym = "·", lab = "Neutral";
        if (r) {
          if (r.kind === "synergie") { cls = "mx-ok"; sym = "✓"; lab = "Gut / Synergie"; }
          else if (r.kind === "hinweis") { cls = "mx-info"; sym = "i"; lab = "Hinweis"; }
          else { cls = "mx-warn"; sym = "!"; lab = r.spacingHours ? ("Abstand ≥ " + r.spacingHours + " h") : "Warnung"; }
        }
        const td = h(`<td class="cell ${cls}"><span>${esc(sym)}</span></td>`);
        td.onclick = () => toast(rowS.name + " ↔ " + colS.name + ": " + ((r && r.reason) || lab));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    scroll.appendChild(table);
    card.appendChild(scroll);
    card.appendChild(h(`<div class="heat-legend" style="margin-top:2px">
      <span class="lg"><span class="sw mx-ok"></span> Gut</span>
      <span class="lg"><span class="sw mx-none"></span> Neutral</span>
      <span class="lg"><span class="sw mx-warn"></span> Abstand / Warnung</span>
    </div>`));
    return card;
  }

  /* ---------- Bereich: MITTEL (Nachschlagewerk) ---------- */
  function viewMittel(v) {
    const wrapper = h('<div class="view stack"></div>');
    wrapper.appendChild(h(`<div class="search">${iconSearch()}<input class="input" id="q" type="search" inputmode="search" placeholder="Nährstoff suchen …" autocomplete="off"></div>`));

    const filt = h('<div class="row wrap-row chip-scroll" id="catFilt"></div>');
    ["alle"].concat(CAT_ORDER).forEach(cat => {
      const on = mittelCat === cat;
      const chip = h(`<button class="chip${on ? " active" : ""}" data-cat="${esc(cat)}">${esc(cat === "alle" ? "Alle" : (CAT_LABEL[cat] || cat))}</button>`);
      chip.onclick = () => { mittelCat = cat; $$("#catFilt .chip", wrapper).forEach(c => c.classList.toggle("active", c.dataset.cat === cat)); draw($("#q", wrapper).value); };
      filt.appendChild(chip);
    });
    wrapper.appendChild(filt);

    wrapper.appendChild(h('<button class="btn ghost sm" id="addCustom">+ Eigenes Mittel anlegen</button>'));

    const listWrap = h('<div id="listWrap" class="stack"></div>');
    wrapper.appendChild(listWrap);
    v.appendChild(wrapper);

    function draw(q) {
      listWrap.innerHTML = "";
      let results = E.search(DB, q);
      if (mittelCat !== "alle") results = results.filter(s => (s.category || "sonstige") === mittelCat);
      if (!results.length) { listWrap.appendChild(h(`<div class="empty"><div class="ico">🔍</div><p class="muted">Nichts gefunden.</p></div>`)); return; }
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
        <span class="grow"><span class="name">${esc(s.name)}${s.custom ? ' <span class="badge tag-own">eigenes</span>' : ""}</span>
          <span class="sub">${esc(shortTiming(s))}</span></span>
        ${inSel ? '<span class="badge primary">im Plan</span>' : ""}
        <span class="rr">${iconChevron()}</span>
      </button>`);
      row.onclick = () => openDetail(s.id);
      return row;
    }
    $("#q", v).addEventListener("input", e => draw(e.target.value));
    $("#addCustom", v).onclick = () => openCustomForm();
    draw("");
  }

  function shortTiming(s) {
    const t = s.timing || {};
    const slots = (t.slots || []).map(x => E.SLOT_LABEL[x] || x).join(", ");
    return [t.frequency, slots].filter(Boolean).join(" · ") || "Timing siehe Detail";
  }

  /* ---------- Eigenes Mittel anlegen ---------- */
  function openCustomForm() {
    const node = h('<div class="sheet-body stack"></div>');
    node.appendChild(h('<div class="sheet-head"><strong>Eigenes Mittel anlegen</strong><div class="tiny muted" style="margin-top:4px">Für Präparate, die noch nicht in der Liste sind. Für eigene Mittel werden keine offiziellen Höchstmengen oder Wechselwirkungen hinterlegt.</div></div>'));

    const catOpts = CAT_ORDER.map(c => `<option value="${c}">${esc(CAT_LABEL[c])}</option>`).join("");
    const slotOpts = E.SLOT_ORDER.map(s => `<option value="${s}">${esc(E.SLOT_LABEL[s])}</option>`).join("");
    const foodOpts = Object.keys(E.WITHFOOD_LABEL).map(k => `<option value="${k}">${esc(E.WITHFOOD_LABEL[k])}</option>`).join("");

    node.appendChild(h(`<div class="field" style="margin:0"><label>Name *</label>
      <input class="input" id="cName" placeholder="z. B. Vitamin K2" autocomplete="off"></div>`));
    node.appendChild(h(`<div class="grid-2">
      <div class="field" style="margin:0"><label>Kategorie</label><select class="select" id="cCat">${catOpts}</select></div>
      <div class="field" style="margin:0"><label>Einheit</label><input class="input" id="cUnit" placeholder="µg, mg, IE …" autocomplete="off"></div>
    </div>`));
    node.appendChild(h(`<div class="grid-2">
      <div class="field" style="margin:0"><label>Zeitpunkt</label><select class="select" id="cSlot">${slotOpts}</select></div>
      <div class="field" style="margin:0"><label>Mahlzeit</label><select class="select" id="cFood">${foodOpts}</select></div>
    </div>`));
    node.appendChild(h(`<div class="field" style="margin:0"><label>Notiz (optional)</label>
      <textarea class="textarea" id="cNote" placeholder="z. B. eigene Hinweise zur Einnahme"></textarea></div>`));
    node.appendChild(h('<button class="btn primary block" id="cSave">Anlegen</button>'));

    const sh = openSheet(node);
    $("#cSave", node).onclick = () => {
      const name = $("#cName", node).value.trim();
      if (!name) { toast("Bitte einen Namen eingeben."); return; }
      const obj = {
        id: "eig-" + Date.now().toString(36), name, custom: true, aliases: [],
        category: $("#cCat", node).value,
        unit: $("#cUnit", node).value.trim() || "",
        summary: $("#cNote", node).value.trim() || "",
        timing: { frequency: "täglich", slots: [$("#cSlot", node).value], withFood: $("#cFood", node).value, note: "" },
        limits: {}, sourceRefs: []
      };
      state.custom.push(obj);
      applyCustom(); save(); sh.close(); toast(name + " angelegt"); render();
    };
  }

  /* ---------- Bereich: STATISTIK ---------- */
  function viewStatistik(v) {
    const wrapper = h('<div class="view stack"></div>');
    wrapper.appendChild(h('<h2 style="margin:0">Statistik</h2>'));

    if (!Object.keys(state.log).length) {
      wrapper.appendChild(h(`<div class="card"><div class="empty"><div class="ico">📊</div>
        <p><strong>Noch keine Daten.</strong></p>
        <p class="muted tiny">Sobald du im Tab „Heute" deine Einnahmen abhakst, entstehen hier deine Auswertungen: Einnahmequote, Serien und ein Verlauf.</p>
        <button class="btn primary" id="toHeute" style="margin-top:8px">Zu Heute</button></div></div>`));
      v.appendChild(wrapper);
      $("#toHeute", v).onclick = () => setTab("heute");
      return;
    }

    wrapper.appendChild(h(`<div class="stat-grid">
      <div class="stat"><div class="stat-v">${quote(30)}%</div><div class="stat-l">Einnahmequote (30 Tage)</div></div>
      <div class="stat"><div class="stat-v">🔥 ${currentStreak()}</div><div class="stat-l">Aktuelle Serie</div></div>
      <div class="stat"><div class="stat-v">${longestStreak()}</div><div class="stat-l">Längste Serie</div></div>
      <div class="stat"><div class="stat-v">${allTakenCount()}</div><div class="stat-l">Einnahmen gesamt</div></div>
    </div>`));

    const barsCard = h('<div class="card stack"></div>');
    barsCard.appendChild(h('<div class="section-title">Letzte 7 Tage</div>'));
    const bars = h('<div class="bars"></div>');
    const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(new Date(), -i), ds = todayStr(d), stx = dayStats(ds);
      const pct = stx.planned ? Math.round(stx.taken / stx.planned * 100) : 0;
      bars.appendChild(h(`<div class="bar-col">
        <div class="bar-track"><div class="bar-fill${stx.done ? " full" : ""}" style="height:${stx.planned ? Math.max(pct, 4) : 0}%"></div></div>
        <div class="bar-lbl">${WD[d.getDay()]}</div>
      </div>`));
    }
    barsCard.appendChild(bars);
    wrapper.appendChild(barsCard);

    const heatCard = h('<div class="card stack"></div>');
    heatCard.appendChild(h('<div class="section-title">Verlauf (5 Wochen)</div>'));
    heatCard.appendChild(buildHeat());
    heatCard.appendChild(h(`<div class="heat-legend">
      <span class="lg"><span class="sw heat-cell l0"></span> keine</span>
      <span class="lg"><span class="sw heat-cell l2"></span> teilweise</span>
      <span class="lg"><span class="sw heat-cell l4"></span> vollständig</span>
    </div>`));
    wrapper.appendChild(heatCard);

    wrapper.appendChild(h('<button class="btn accent block" id="arzt">Arztbericht erstellen (30 Tage)</button>'));
    wrapper.appendChild(h(`<div class="disclaimer">Alle Auswertungen basieren ausschließlich auf deinen eigenen Angaben und dienen deiner persönlichen Übersicht.</div>`));

    v.appendChild(wrapper);
    $("#arzt", v).onclick = () => openArztbericht();
  }

  function buildHeat() {
    const wrap = h('<div class="heat"></div>');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7;          // 0 = Montag
    const monday = addDays(today, -dow);
    const start = addDays(monday, -7 * 4);         // 5 Wochen inkl. aktueller
    for (let w = 0; w < 5; w++) {
      const col = h('<div class="heat-col"></div>');
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d), ds = todayStr(date);
        if (date > today) { col.appendChild(h('<div class="heat-cell l0 future"></div>')); continue; }
        const st = dayStats(ds);
        let lvl = 0;
        if (st.planned) { const p = st.taken / st.planned; lvl = p >= 1 ? 4 : p >= .66 ? 3 : p >= .33 ? 2 : p > 0 ? 1 : 0; }
        col.appendChild(h(`<div class="heat-cell l${lvl}" title="${esc(ds)}: ${st.taken}/${st.planned}"></div>`));
      }
      wrap.appendChild(col);
    }
    return wrap;
  }

  function buildReportText(days, q, per) {
    const lines = ["Nährtakt – Einnahme-Bericht", "Zeitraum: letzte " + days + " Tage", "Gesamt-Einnahmequote: " + q + " %", "", "Je Präparat:"];
    Object.keys(per).forEach(id => {
      const s = E.byId(DB, id), m = per[id], pct = m.planned ? Math.round(m.taken / m.planned * 100) : 0;
      lines.push("- " + (s ? s.name : id) + ": " + m.taken + "/" + m.planned + " (" + pct + " %)");
    });
    lines.push("", "Hinweis: Selbst protokollierte Angaben. Nährtakt ist kein Medizinprodukt und ersetzt keine ärztliche Beurteilung.");
    return lines.join("\n");
  }
  function openArztbericht() {
    const days = 30, q = quote(days), per = perSupp(days), ids = Object.keys(per);
    const node = h('<div class="sheet-body stack"></div>');
    node.appendChild(h(`<div class="sheet-head"><strong>Arztbericht</strong><div class="tiny muted" style="margin-top:4px">Einnahme-Übersicht der letzten ${days} Tage</div></div>`));
    node.appendChild(h(`<div class="card flat" style="border:1px solid var(--line)">
      <div class="spread"><div style="font-weight:650">Gesamt-Einnahmequote</div><div style="font-weight:800;font-size:1.3rem;color:var(--primary)">${q}%</div></div>
    </div>`));

    if (ids.length) {
      const card = h('<div class="card stack"></div>');
      card.appendChild(h('<div class="section-title">Je Präparat</div>'));
      ids.map(id => {
        const s = E.byId(DB, id), m = per[id];
        return { name: s ? s.name : id, pct: m.planned ? Math.round(m.taken / m.planned * 100) : 0, m };
      }).sort((a, b) => b.pct - a.pct).forEach(r => {
        card.appendChild(h(`<div style="margin:8px 0 0">
          <div class="spread"><div style="font-weight:600">${esc(r.name)}</div><div class="tiny muted">${r.m.taken}/${r.m.planned} · ${r.pct}%</div></div>
          <div class="bar-track h" style="margin-top:5px"><div class="bar-fill" style="width:${r.pct}%;height:100%"></div></div>
        </div>`));
      });
      node.appendChild(card);
    } else {
      node.appendChild(h('<p class="muted tiny">Noch keine protokollierten Einnahmen in diesem Zeitraum.</p>'));
    }

    node.appendChild(h('<div class="row wrap-row" style="margin-top:4px"><button class="btn primary grow" id="rShare">Teilen</button><button class="btn ghost grow" id="rCopy">Text kopieren</button></div>'));
    node.appendChild(h(`<div class="disclaimer">Dieser Bericht fasst ausschließlich deine selbst protokollierten Einnahmen zusammen. Nährtakt ist <strong>kein Medizinprodukt</strong>; der Bericht ersetzt keine ärztliche Beurteilung.</div>`));

    const sh = openSheet(node);
    const text = buildReportText(days, q, per);
    $("#rShare", node).onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ title: "Nährtakt Arztbericht", text });
        else { await navigator.clipboard.writeText(text); toast("Bericht in die Zwischenablage kopiert"); }
      } catch (_) {}
    };
    $("#rCopy", node).onclick = async () => {
      try { await navigator.clipboard.writeText(text); toast("Bericht kopiert"); }
      catch (_) { toast("Kopieren nicht möglich"); }
    };
  }

  /* ---------- Bereich: MEHR ---------- */
  function viewMehr(v) {
    const lic = L.load();
    const wrapper = h('<div class="view stack"></div>');

    const times = Object.assign({}, E.SLOT_DEFAULT_TIME, state.prefs.times || {});
    const en = state.prefs.slotsEnabled || {};
    const timeCard = h('<div class="card stack"></div>');
    timeCard.appendChild(h('<div class="section-title">Meine Einnahme-Zeiten</div>'));
    E.SLOT_ORDER.forEach(sl => {
      timeCard.appendChild(h(`<div class="spread">
        <label class="row" style="gap:8px"><input type="checkbox" data-en="${sl}" ${en[sl] !== false ? "checked" : ""}> ${esc(E.SLOT_LABEL[sl])}</label>
        <input class="input" style="max-width:120px" type="time" data-t="${sl}" value="${esc(times[sl])}">
      </div>`));
    });
    wrapper.appendChild(timeCard);

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

    // Daten / Protokoll
    const dataCard = h('<div class="card stack"></div>');
    dataCard.appendChild(h('<div class="section-title">Meine Daten</div>'));
    const days = Object.keys(state.log).length;
    dataCard.appendChild(h(`<div class="tiny muted">${days ? days + (days === 1 ? " Tag" : " Tage") + " Einnahme-Verlauf gespeichert." : "Noch kein Einnahme-Verlauf."}${state.custom.length ? " · " + state.custom.length + " eigene Mittel." : ""}</div>`));
    if (days) dataCard.appendChild(h('<button class="btn danger sm" id="resetLog">Einnahme-Verlauf löschen</button>'));
    wrapper.appendChild(dataCard);

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

    wrapper.appendChild(h(`<div class="disclaimer"><strong>Wichtiger Hinweis:</strong> Nährtakt ist ein Informations- und Planungswerkzeug und <strong>kein Medizinprodukt</strong>. Es stellt keine Diagnose, gibt keine Heil- oder Therapieversprechen und ersetzt keine ärztliche oder pharmazeutische Beratung. Alle Angaben sind allgemeine Informationen aus öffentlichen Quellen (u. a. BfR, EFSA, DGE, NIH). Für individuelle Fragen wende dich an Ärztin/Arzt oder Apotheke.</div>`));

    v.appendChild(wrapper);

    $$('input[data-en]', v).forEach(cb => cb.onchange = () => { (state.prefs.slotsEnabled = state.prefs.slotsEnabled || {})[cb.dataset.en] = cb.checked; save(); });
    $$('input[data-t]', v).forEach(ti => ti.onchange = () => { (state.prefs.times = state.prefs.times || {})[ti.dataset.t] = ti.value; save(); });
    const de = $("#deact", v); if (de) de.onclick = () => { if (confirm("Schlüssel wirklich von diesem Gerät entfernen?")) { L.deactivate(); location.reload(); } };
    const ib = $("#instBtn", v); if (ib) ib.onclick = () => window.NTInstall ? window.NTInstall.install() : toast("Nutze das Browser-Menü: „Zum Startbildschirm hinzufügen“.");
    const rl = $("#resetLog", v); if (rl) rl.onclick = () => { if (confirm("Deinen gesamten Einnahme-Verlauf unwiderruflich löschen? Deine Mittel und Einstellungen bleiben erhalten.")) { state.log = {}; save(); toast("Einnahme-Verlauf gelöscht"); render(); } };
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
      node.appendChild(h(`<div class="field" style="margin:0"><label>${esc(s.name)} <span class="muted tiny">(${esc(s.unit || "")}/Tag)</span></label>
        <input class="input" type="number" step="any" inputmode="decimal" data-dose="${esc(sel.id)}" value="${sel.dose != null ? esc(sel.dose) : ""}" placeholder="z. B. Wert laut Produkt"></div>`));
    });
    node.appendChild(h('<button class="btn primary block" id="dSave">Speichern</button>'));
    const sh = openSheet(node);
    $("#dSave", node).onclick = () => {
      $$('input[data-dose]', node).forEach(inp => {
        const sel = state.selection.find(x => x.id === inp.dataset.dose);
        if (sel) { const val = parseFloat(inp.value.replace(",", ".")); sel.dose = isNaN(val) ? null : val; }
      });
      save(); sh.close(); render(); toast("Dosierungen gespeichert");
    };
  }

  /* ---------- Detail-Sheet eines Mittels ---------- */
  function openDetail(id) {
    const s = E.byId(DB, id); if (!s) return;
    const inSel = state.selection.some(x => x.id === id);
    const t = s.timing || {}, lim = s.limits || {}, inter = E.interactionsFor(DB, id);

    const node = h('<div class="sheet-body"></div>');
    const head = h(`<div class="sheet-head"><div class="row" style="gap:12px">
      <span class="lead cat-${esc(s.category || "sonstige")}" style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-weight:750">${esc(leadOf(s.name))}</span>
      <div class="grow"><div style="font-weight:750;font-size:1.15rem">${esc(s.name)}${s.custom ? ' <span class="badge tag-own">eigenes</span>' : ""}</div>
        <div class="tiny muted">${esc(CAT_LABEL[s.category] || "")}${s.aliases && s.aliases.length ? " · " + esc(s.aliases.join(", ")) : ""}</div></div>
    </div></div>`);

    if (s.summary) node.appendChild(h(`<p style="margin-top:12px">${esc(s.summary)}</p>`));

    const timing = h('<div class="card flat" style="border:1px solid var(--line);margin-top:8px"></div>');
    timing.appendChild(h('<div class="section-title">Einnahme &amp; Zeitpunkt</div>'));
    addRow(timing, "Häufigkeit", esc(t.frequency || "—"));
    addRow(timing, "Zeitpunkt", esc((t.slots || []).map(x => E.SLOT_LABEL[x] || x).join(", ") || "beliebig"));
    addRow(timing, "Mahlzeit", esc(E.WITHFOOD_LABEL[t.withFood] || "—"));
    if (t.note) addRow(timing, "Hinweis", esc(t.note));
    node.appendChild(timing);

    const limits = h('<div class="card flat" style="border:1px solid var(--line);margin-top:8px"></div>');
    limits.appendChild(h('<div class="section-title">Mengen &amp; Grenzen</div>'));
    if (lim.bfr && lim.bfr.value != null) addRow(limits, "Höchstmenge NEM", `${esc(E.fmtDose(lim.bfr.value, lim.bfr.unit || s.unit))} <span class="tiny muted">(${esc(E.srcName(DB, lim.bfr.source))})</span>`);
    if (lim.ul && lim.ul.value != null) addRow(limits, "Oberer Wert (UL)", `${esc(E.fmtDose(lim.ul.value, lim.ul.unit || s.unit))} <span class="tiny muted">(${esc(E.srcName(DB, lim.ul.source))})</span>`);
    if (!(lim.bfr && lim.bfr.value != null) && !(lim.ul && lim.ul.value != null))
      limits.appendChild(h('<p class="tiny muted" style="margin:6px 0 0">Keine offizielle Höchstmenge/Obergrenze hinterlegt. Herstellerangaben beachten.</p>'));
    node.appendChild(limits);

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

    if (s.sourceRefs && s.sourceRefs.length) {
      const src = s.sourceRefs.map(k => {
        const o = DB.meta && DB.meta.sources && DB.meta.sources[k];
        return o ? (o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(E.srcName(DB, k))}</a>` : esc(E.srcName(DB, k))) : esc(k);
      }).join(" · ");
      node.appendChild(h(`<p class="tiny muted" style="margin-top:10px">Quellen: ${src}</p>`));
    }

    node.appendChild(h(`<button class="btn ${inSel ? "ghost" : "primary"} block" id="detAdd" style="margin-top:14px">${inSel ? "Aus meinem Plan entfernen" : "Zu meinem Plan hinzufügen"}</button>`));
    if (s.custom) node.appendChild(h('<button class="btn danger block sm" id="delCustom" style="margin-top:8px">Eigenes Mittel löschen</button>'));
    node.appendChild(h('<div class="disclaimer" style="margin-top:12px">Allgemeine Information, keine medizinische Empfehlung. Kein Medizinprodukt.</div>'));

    const sh = openSheet(node);
    sh.sheet.insertBefore(head, node);
    $("#detAdd", node).onclick = () => {
      if (inSel) state.selection = state.selection.filter(x => x.id !== id);
      else state.selection.push({ id, dose: null });
      save(); sh.close(); toast(inSel ? "Entfernt" : "Zum Plan hinzugefügt");
      if (state.tab === "plan" || state.tab === "heute") render();
    };
    const dc = $("#delCustom", node);
    if (dc) dc.onclick = () => {
      if (!confirm("Dieses eigene Mittel wirklich löschen?")) return;
      state.custom = state.custom.filter(x => x.id !== id);
      state.selection = state.selection.filter(x => x.id !== id);
      applyCustom(); save(); sh.close(); toast("Gelöscht"); render();
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
        <p class="muted" style="margin:0">Gib deinen Lizenzschlüssel ein, um alle Nährstoffe, den Tagesplaner, das Einnahme-Protokoll und die Statistik zu nutzen.</p>
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
    input.addEventListener("input", () => { input.value = L.displayKey(input.value); });
    $("#lkGo", v).onclick = async () => {
      const btn = $("#lkGo", v); btn.disabled = true; btn.textContent = "Prüfe …";
      try { await L.activate(input.value); location.reload(); }
      catch (e) { toast(e.message || "Schlüssel ungültig"); btn.disabled = false; btn.textContent = "Freischalten"; }
    };
  }

  function startApp(previewNoBackend) {
    // Deep-Link aus Manifest-Shortcuts / geteilten Links: ?tab=heute|plan|mittel|statistik|mehr (abstaende → Plan/Wechsel)
    try {
      const dl = new URLSearchParams(location.search).get("tab");
      if (dl === "abstaende") { state.tab = "plan"; planSeg = "wechsel"; save(); }
      else if (dl && TABS.indexOf(dl) >= 0) { state.tab = dl; save(); }
    } catch (_) {}
    $("#loading").hidden = true;
    $("#app").hidden = false;
    applyTheme();
    $("#btnTheme").onclick = cycleTheme;
    $$("#tabbar button").forEach(b => b.onclick = () => setTab(b.dataset.tab));
    $$("#tabbar button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    render();
    if (previewNoBackend) toast("Vorschau-Modus (Backend nicht verbunden)");
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
    applyCustom();   // eigene Mittel in die Laufzeit-DB einmischen
    if (L.isActivated()) startApp(false);
    else if (!backendConfigured()) startApp(true);   // lokale Vorschau, solange kein Backend konfiguriert ist
    else showLocked();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
