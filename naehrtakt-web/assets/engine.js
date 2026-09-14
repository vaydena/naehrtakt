/* ==========================================================================
   Nährtakt – Planer-/Timing-Engine  (rein funktional, offline, framework-frei)
   Erwartet die geladene DB (supplements.json). Keine DOM-Abhängigkeit.
   ========================================================================== */
(function (global) {
  "use strict";

  const SLOT_ORDER = ["morgens", "mittags", "abends", "nacht"];
  const SLOT_LABEL = { morgens: "Morgens", mittags: "Mittags", abends: "Abends", nacht: "Vor dem Schlafen" };
  const SLOT_DEFAULT_TIME = { morgens: "08:00", mittags: "13:00", abends: "19:00", nacht: "22:30" };

  const WITHFOOD_LABEL = {
    "mit-essen": "zu einer Mahlzeit",
    "mit-fett": "zu einer fetthaltigen Mahlzeit",
    "nuechtern": "nüchtern (mit Abstand zum Essen)",
    "egal": "unabhängig von den Mahlzeiten"
  };

  /* ---------- kleine Helfer ---------- */
  function byId(db, id) { return (db.supplements || []).find(s => s.id === id) || null; }
  function toMin(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function slotTimes(prefs) {
    const t = Object.assign({}, SLOT_DEFAULT_TIME, (prefs && prefs.times) || {});
    return t;
  }
  function hoursBetween(slotA, slotB, times) {
    const a = toMin(times[slotA]), b = toMin(times[slotB]);
    if (a == null || b == null) return 24;
    return Math.abs(a - b) / 60;
  }

  /* ---------- Paar-Regeln ---------- */
  // Liefert die Regel für ein ungeordnetes Paar {x,y} oder null.
  function pairRule(db, x, y) {
    const list = db.interactionPairs || [];
    for (const p of list) {
      if ((p.a === x && p.b === y) || (p.a === y && p.b === x)) return p;
    }
    return null;
  }
  // Alle Regeln, an denen ein Präparat beteiligt ist (fürs Nachschlagewerk).
  function interactionsFor(db, id) {
    return (db.interactionPairs || [])
      .filter(p => p.a === id || p.b === id)
      .map(p => {
        const otherId = p.a === id ? p.b : p.a;
        const other = byId(db, otherId);
        return {
          otherId,
          otherName: other ? other.name : otherId,
          spacingHours: p.spacingHours ?? null,
          kind: p.kind || "hinweis",
          reason: p.reason || "",
          source: p.source || null
        };
      });
  }

  /* ---------- Suche ---------- */
  function search(db, q) {
    q = (q || "").trim().toLowerCase();
    const all = (db.supplements || []).slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
    if (!q) return all;
    return all.filter(s => {
      const hay = [s.name, s.id, ...(s.aliases || []), s.category || ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  /* ---------- Höchstmengen-Prüfung ---------- */
  // selection: [{id, dose?(Zahl in s.unit)}]
  function checkLimits(db, selection) {
    const out = [];
    for (const sel of selection) {
      const s = byId(db, sel.id);
      if (!s || sel.dose == null || isNaN(sel.dose)) continue;
      const lim = s.limits || {};
      // strengster belegter Wert zuerst (BfR-Empfehlung für NEM), dann UL als Sicherheitsgrenze
      const ul = lim.ul && lim.ul.value != null ? lim.ul : null;
      const bfr = lim.bfr && lim.bfr.value != null ? lim.bfr : null;
      if (ul && sel.dose > ul.value) {
        out.push({ level: "danger", id: s.id,
          text: `${s.name}: ${fmtDose(sel.dose, s.unit)} liegt über dem tolerierbaren oberen Aufnahmewert (${fmtDose(ul.value, ul.unit || s.unit)}, ${srcName(db, ul.source)}).` });
      } else if (bfr && sel.dose > bfr.value) {
        out.push({ level: "warn", id: s.id,
          text: `${s.name}: ${fmtDose(sel.dose, s.unit)} liegt über der empfohlenen Höchstmenge für Nahrungsergänzungsmittel (${fmtDose(bfr.value, bfr.unit || s.unit)}, ${srcName(db, bfr.source)}).` });
      }
    }
    return out;
  }
  function fmtDose(v, unit) {
    const n = (Math.round(v * 100) / 100).toLocaleString("de-DE");
    return unit ? `${n} ${unit}` : n;
  }
  function srcName(db, key) {
    const src = db.meta && db.meta.sources && db.meta.sources[key];
    return src ? src.name.replace(/\s*\(.*$/, "") : (key || "Quelle");
  }

  /* ---------- Tagesplan erstellen ---------- */
  /*
    selection : [{id, dose?}]
    prefs     : { slotsEnabled?: {morgens,mittags,abends,nacht:bool}, times?: {...} }
    Rückgabe  : { slots:[{key,label,time,items:[...]}], warnings:[], synergies:[], notes:[] }
  */
  function buildPlan(db, selection, prefs) {
    prefs = prefs || {};
    const enabled = Object.assign({ morgens: true, mittags: true, abends: true, nacht: true }, prefs.slotsEnabled || {});
    const enabledSlots = SLOT_ORDER.filter(s => enabled[s]);
    const times = slotTimes(prefs);
    const ids = selection.map(s => s.id).filter(id => byId(db, id));

    // 1) Kandidaten-Slots je Präparat bestimmen
    const cand = {};
    for (const id of ids) {
      const s = byId(db, id);
      let slots = (s.timing && s.timing.slots) || ["beliebig"];
      if (slots.includes("beliebig") || slots.length === 0) slots = enabledSlots.slice();
      slots = slots.filter(x => enabledSlots.includes(x));
      if (slots.length === 0) slots = enabledSlots.slice();   // Fallback
      cand[id] = slots;
    }

    // 2) Konflikt-/Synergie-Paare unter der Auswahl sammeln
    const conflicts = [];   // {x,y,hours}
    const synergies = [];   // {x,y,reason,source}
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const r = pairRule(db, ids[i], ids[j]);
        if (!r) continue;
        if (r.kind === "synergie") {
          synergies.push({ x: ids[i], y: ids[j], reason: r.reason, source: r.source });
        } else if ((r.spacingHours && r.spacingHours > 0) || r.kind === "hemmung" || r.kind === "konkurrenz") {
          conflicts.push({ x: ids[i], y: ids[j], hours: r.spacingHours || 2, reason: r.reason, source: r.source });
        }
      }
    }

    // 3) Greedy-Zuweisung, Konflikte möglichst über verschiedene (weit genug entfernte) Slots lösen
    const assign = {};
    // Startzuweisung: erster Kandidat; Synergie-Partner in denselben Slot ziehen
    for (const id of ids) assign[id] = cand[id][0];
    for (const syn of synergies) {
      const common = cand[syn.x].find(sl => cand[syn.y].includes(sl));
      if (common) { assign[syn.x] = common; assign[syn.y] = common; }
    }

    const unresolved = [];
    for (const c of conflicts) {
      let ok = distinctEnough(c, assign, times);
      if (ok) continue;
      // Versuche y zu verschieben, dann x
      for (const candSlot of cand[c.y]) {
        const trial = Object.assign({}, assign, { [c.y]: candSlot });
        if (distinctEnough(c, trial, times)) { assign[c.y] = candSlot; ok = true; break; }
      }
      if (!ok) for (const candSlot of cand[c.x]) {
        const trial = Object.assign({}, assign, { [c.x]: candSlot });
        if (distinctEnough(c, trial, times)) { assign[c.x] = candSlot; ok = true; break; }
      }
      if (!ok) unresolved.push(c);
    }

    // 4) Slots aufbauen
    const slots = enabledSlots.map(key => ({
      key, label: SLOT_LABEL[key], time: times[key],
      items: ids.filter(id => assign[id] === key).map(id => {
        const s = byId(db, id);
        const wf = (s.timing && s.timing.withFood) || "egal";
        return {
          id, name: s.name, unit: s.unit, category: s.category || "sonstige",
          withFood: wf, withFoodLabel: WITHFOOD_LABEL[wf] || "",
          note: (s.timing && s.timing.note) || "",
          dose: (selection.find(x => x.id === id) || {}).dose ?? null
        };
      })
    })).filter(sl => sl.items.length > 0);

    // 5) Warnungen zusammenstellen
    const warnings = [];
    for (const c of unresolved) {
      const sx = byId(db, c.x), sy = byId(db, c.y);
      warnings.push({
        level: "warn", ids: [c.x, c.y],
        text: `${sx.name} und ${sy.name} möglichst um mind. ${c.hours} Stunden getrennt einnehmen${c.reason ? " – " + c.reason : ""}${c.source ? " (" + srcName(db, c.source) + ")" : ""}.`
      });
    }
    // Konflikte, die durch verschiedene Slots gelöst wurden → informativer Hinweis am jeweiligen Item bereits über Trennung sichtbar
    warnings.push(...checkLimits(db, selection));

    // 6) Synergie-Notizen
    const synNotes = synergies.map(sy => {
      const sx = byId(db, sy.x), syy = byId(db, sy.y);
      return { ids: [sy.x, sy.y], text: `${sx.name} + ${syy.name}: gemeinsam sinnvoll – ${sy.reason}${sy.source ? " (" + srcName(db, sy.source) + ")" : ""}.` };
    });

    return { slots, warnings, synergies: synNotes, unresolved, notes: [] };
  }

  function distinctEnough(c, assign, times) {
    if (assign[c.x] !== assign[c.y]) {
      return hoursBetween(assign[c.x], assign[c.y], times) >= c.hours;
    }
    return false; // gleicher Slot -> zu nah
  }

  /* ---------- Export ---------- */
  const API = {
    SLOT_ORDER, SLOT_LABEL, SLOT_DEFAULT_TIME, WITHFOOD_LABEL,
    byId, search, interactionsFor, pairRule, checkLimits, buildPlan, srcName, fmtDose
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.NaehrtaktEngine = API;
})(typeof window !== "undefined" ? window : globalThis);
