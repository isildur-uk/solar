/* CHART ROOM — access.js
 * Accessible text equivalent of the (canvas) link chart and (canvas) map,
 * driven from the SAME graph store so it can never drift from the visuals.
 * Renders: entity list + relationships table + location list, plus an
 * aria-live selection summary kept in sync with chart/map/timeline selection.
 * Keyboard: Tab into the tables, Enter/Space on a row selects that entity
 * everywhere; Alt+T toggles the panel. All analyst/imported data is escaped
 * through CRUtil.esc (XSS gate). Browser: window.CRAccess. Additive module —
 * app.js calls init() and notifySelection().
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var M = window.CRModel;
  var store = null;
  var selectFn = null;
  var selectedId = null;
  var els = {};
  var LS_OPEN = "cr_access_open_v1";

  function esc(s) { return U.esc(s == null ? "" : s); }
  function escA(s) { return U.escAttr(s == null ? "" : s); }

  function injectCSS() {
    if (document.getElementById("cr-access-css")) return;
    var css =
      "#access-equiv{flex:0 0 auto;border-top:1px solid var(--line);background:var(--panel);font-size:12px}" +
      "#access-toggle{display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid transparent;color:var(--dim);font:600 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;padding:8px 12px;cursor:pointer}" +
      "#access-toggle:hover{color:var(--text)}" +
      "#access-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}" +
      "#access-equiv.open #access-toggle{color:var(--accent);border-bottom-color:var(--line)}" +
      "#access-body{max-height:40vh;overflow:auto;padding:10px 12px 16px}" +
      "#access-body .access-hint{color:var(--faint);font:12px var(--sans);margin:0 0 8px}" +
      "#access-selection{background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:8px 10px;color:var(--text);margin-bottom:12px;font-size:12.5px}" +
      "#access-body h2.access-h{font:600 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--accent-dim);margin:14px 0 6px}" +
      "#access-body table{width:100%;border-collapse:collapse;margin-bottom:4px}" +
      "#access-body th,#access-body td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--text)}" +
      "#access-body thead th{position:sticky;top:0;background:var(--panel);color:var(--faint);font:600 10px/1.2 var(--mono);letter-spacing:.06em;text-transform:uppercase}" +
      "#access-body td.mono,#access-body td.num{font-family:var(--mono)}" +
      "#access-body td.num{text-align:right}" +
      "#access-body tr[data-id]{cursor:pointer}" +
      "#access-body tr[data-id]:hover{background:var(--panel-2)}" +
      "#access-body tr[data-id]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}" +
      "#access-body tr.sel{background:var(--accent-soft)}";
    var s = document.createElement("style");
    s.id = "cr-access-css";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function typeLabel(t) {
    var T = M && M.ENTITY_TYPES && M.ENTITY_TYPES[t];
    return (T && T.label) || t || "—";
  }

  /* NCA 3x5x2 provenance, rendered plainly (never a fake percentage) */
  function gradeStr(e) {
    var p = e && e.provenance;
    if (!p) return "—";
    var s = (p.source || "?") + (p.assessment || "?") + (p.handling ? " " + p.handling : "");
    return s.trim() || "—";
  }

  function identifiers(e) {
    var out = [];
    var a = e.attrs || {}, ids = e.ids || {};
    if (ids.e164) out.push(ids.e164);
    if (ids.email) out.push(ids.email);
    if (ids.vrm) out.push(ids.vrm);
    if (a.pnc) out.push("PNC " + a.pnc);
    if (a.nino) out.push("NINO " + a.nino);
    if (a.dob) out.push("DOB " + a.dob);
    return out.length ? out.join(", ") : "—";
  }

  function coordsFor(e) {
    if (e.geo && typeof e.geo.lat === "number" && typeof e.geo.lon === "number") return e.geo;
    var a = e.attrs || {};
    if (typeof a.lat === "number" && typeof a.lon === "number") return { lat: a.lat, lon: a.lon };
    return null;
  }

  function linksFor(id) {
    return (store.links || []).filter(function (l) { return l.from === id || l.to === id; });
  }

  function labelOf(id) {
    var e = store.getEntity(id);
    return e ? e.label : id;
  }

  /* ---------------- rendering ---------------- */

  function rowFor(e) {
    var n = linksFor(e.id).length;
    var tr = document.createElement("tr");
    tr.setAttribute("tabindex", "0");
    tr.setAttribute("role", "button");
    tr.setAttribute("data-id", escA(e.id));
    tr.setAttribute("aria-label",
      escA(e.label + ", " + typeLabel(e.type) + ", " + n + " relationship" + (n === 1 ? "" : "s") + ". Activate to select."));
    tr.innerHTML =
      '<td>' + esc(e.label) + '</td>' +
      '<td>' + esc(typeLabel(e.type)) + '</td>' +
      '<td class="mono">' + esc(identifiers(e)) + '</td>' +
      '<td class="mono">' + esc(gradeStr(e)) + '</td>' +
      '<td class="num">' + n + '</td>';
    return tr;
  }

  function render() {
    if (!els.entBody) return;
    var ents = (store.entities || []).slice().sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label));
    });
    var links = store.links || [];

    // entities
    els.entBody.innerHTML = "";
    ents.forEach(function (e) { els.entBody.appendChild(rowFor(e)); });
    els.entCount.textContent = ents.length ? "(" + ents.length + ")" : "(none)";

    // relationships
    els.linkBody.innerHTML = "";
    links.forEach(function (l) {
      var dir = l.direction === "both" ? "both ways" : l.direction === "<-" ? "to → from" : "from → to";
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + esc(labelOf(l.from)) + '</td>' +
        '<td class="mono">' + esc((l.type || "LINKED_TO").replace(/_/g, " ")) + '</td>' +
        '<td>' + esc(labelOf(l.to)) + '</td>' +
        '<td>' + esc(dir) + '</td>' +
        '<td>' + esc((l.confidence || "—").toUpperCase()) + '</td>' +
        '<td class="mono">' + esc(l.dateISO ? String(l.dateISO).slice(0, 10) : "—") + '</td>';
      els.linkBody.appendChild(tr);
    });
    els.linkCount.textContent = links.length ? "(" + links.length + ")" : "(none)";

    // locations
    els.locBody.innerHTML = "";
    var locs = ents.filter(function (e) { return coordsFor(e); });
    locs.forEach(function (e) {
      var c = coordsFor(e);
      var tr = document.createElement("tr");
      tr.setAttribute("tabindex", "0");
      tr.setAttribute("role", "button");
      tr.setAttribute("data-id", escA(e.id));
      tr.setAttribute("aria-label", escA(e.label + ", " + typeLabel(e.type) + ", at " + c.lat.toFixed(4) + ", " + c.lon.toFixed(4) + ". Activate to select."));
      tr.innerHTML =
        '<td>' + esc(e.label) + '</td>' +
        '<td>' + esc(typeLabel(e.type)) + '</td>' +
        '<td class="mono">' + esc(c.lat.toFixed(5) + ", " + c.lon.toFixed(5)) + '</td>';
      els.locBody.appendChild(tr);
    });
    els.locCount.textContent = locs.length ? "(" + locs.length + ")" : "(none)";

    highlightSelected();
  }

  /* ---------------- selection ---------------- */

  /* Returns a plain-text summary. NB: the returned string is NOT HTML-escaped —
     it MUST only ever be assigned via textContent, never innerHTML (XSS gate). */
  function summarise(sel) {
    if (!sel || !sel.id) return "No entity selected.";
    if (sel.kind === "link") {
      var l = (store.links || []).filter(function (x) { return x.id === sel.id; })[0];
      if (!l) return "No entity selected.";
      return "Selected relationship: " + labelOf(l.from) + " " + (l.type || "linked to").replace(/_/g, " ") + " " + labelOf(l.to) + ".";
    }
    var e = store.getEntity(sel.id);
    if (!e) return "No entity selected.";
    var ls = linksFor(e.id);
    var parts = ls.slice(0, 8).map(function (l) {
      var other = l.from === e.id ? l.to : l.from;
      return (l.type || "linked to").replace(/_/g, " ").toLowerCase() + " " + labelOf(other);
    });
    var tail = ls.length > 8 ? ", and " + (ls.length - 8) + " more" : "";
    return "Selected: " + e.label + " (" + typeLabel(e.type) + "). " +
      (ls.length ? ls.length + " relationship" + (ls.length === 1 ? "" : "s") + ": " + parts.join("; ") + tail + "." : "No relationships.");
  }

  function highlightSelected() {
    if (!els.body) return;
    var rows = els.body.querySelectorAll("tr[data-id]");
    for (var i = 0; i < rows.length; i++) {
      var on = rows[i].getAttribute("data-id") === selectedId;
      rows[i].setAttribute("aria-current", on ? "true" : "false");
      rows[i].classList.toggle("sel", on);
    }
  }

  function notifySelection(sel) {
    selectedId = sel && sel.kind === "entity" ? sel.id : (sel && sel.id ? selectedId : null);
    if (els.live) els.live.textContent = summarise(sel);   // textContent only — summarise() is not HTML-escaped
    highlightSelected();
  }

  function activateRow(tr) {
    var id = tr.getAttribute("data-id");
    if (!id) return;
    selectedId = id;
    if (selectFn) selectFn(id);            // syncs chart + map + timeline + inspector
    if (els.live) els.live.textContent = summarise({ kind: "entity", id: id });   // textContent only
    highlightSelected();
  }

  /* ---------------- panel open/close ---------------- */

  function setOpen(open) {
    if (!els.section) return;
    els.body.hidden = !open;
    els.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    els.section.classList.toggle("open", open);
    try { localStorage.setItem(LS_OPEN, open ? "1" : "0"); } catch (e) { /* noop */ }
    if (open) render();
  }

  /* ---------------- init ---------------- */

  function init(caseStore, onSelect) {
    store = caseStore;
    selectFn = onSelect;
    els.section = document.getElementById("access-equiv");
    if (!els.section) return;               // panel markup absent — fail safe
    injectCSS();
    els.toggle = document.getElementById("access-toggle");
    els.body = document.getElementById("access-body");
    els.live = document.getElementById("access-selection");
    els.entBody = els.section.querySelector("#access-entities tbody");
    els.linkBody = els.section.querySelector("#access-links tbody");
    els.locBody = els.section.querySelector("#access-locations tbody");
    els.entCount = document.getElementById("access-ent-count");
    els.linkCount = document.getElementById("access-link-count");
    els.locCount = document.getElementById("access-loc-count");

    els.toggle.addEventListener("click", function () {
      setOpen(els.body.hidden);
    });

    // row activation (Enter / Space) via delegation on the panel body
    els.body.addEventListener("keydown", function (e) {
      var tr = e.target.closest && e.target.closest("tr[data-id]");
      if (!tr) return;
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        activateRow(tr);
      }
    });
    els.body.addEventListener("click", function (e) {
      var tr = e.target.closest && e.target.closest("tr[data-id]");
      if (tr) activateRow(tr);
    });

    // Alt+T toggles the panel (guarded against form fields)
    document.addEventListener("keydown", function (e) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.key || "").toLowerCase() !== "t") return;
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      e.preventDefault();
      setOpen(els.body.hidden);
      if (!els.body.hidden) els.toggle.focus();
    });

    store.onChange(U.debounce(function () { if (!els.body.hidden) render(); }, 300));  // closed panel refreshes on next open

    var open = false;
    try { open = localStorage.getItem(LS_OPEN) === "1"; } catch (e) { /* noop */ }
    setOpen(open);
    render();
  }

  window.CRAccess = { init: init, notifySelection: notifySelection };
})();
