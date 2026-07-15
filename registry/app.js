/* app.js — Registry capture & store UI (Phase 1).
 * Consumes the Registry core (window.Registry*) and SOLAR's cm-standards.
 * No framework. All rendered values are HTML-escaped.
 * Inline mini network chart on the report detail uses SOLAR's vendored vis-network. */
"use strict";
(function () {
  var M = window.RegistryModel, V = window.RegistryValidate, G = window.RegistryGrading,
      N = window.RegistryNormalise, T = window.RegistryThreatAreas, RR = window.RegistryRepository,
      SI = window.RegistrySI, MX = window.RegistryMatching,
      W = window.RegistryWorkflow, D = window.RegistryDeletion, H = window.RegistryHandoff, O = window.RegistryOperations,
      Q = window.RegistryQuery;

  if (!M || !V || !G || !N || !T || !RR || !SI || !MX || !W || !D || !H || !O || !Q) {
    document.getElementById("main").textContent =
      "Registry failed to load. Ensure SOLAR's cm-vocab.js and cm-standards.js are reachable at ../js/core/.";
    return;
  }

  // Desktop (Tauri) build injects a SQLite-backed repo via window.RegistryDesktopRepo;
  // the web build falls back to IndexedDB / in-memory. Same async interface either way.
  var repo = (typeof window !== "undefined" && window.RegistryDesktopRepo) || RR.createRepository();
  // Query/cache layer: hold the dataset in memory and invalidate on any write, so
  // faceted search/sort/paginate run against RAM (fast) instead of re-reading the DB.
  var dataCache = null;
  var filterState = { text: "", filters: {}, dateFrom: "", dateTo: "", page: 1, pageSize: 50 };
  (function () { var _s = repo.save.bind(repo), _r = repo.remove.bind(repo);
    repo.save = function (ir) { return _s(ir).then(function (x) { dataCache = null; return x; }); };
    repo.remove = function (u) { return _r(u).then(function (x) { dataCache = null; return x; }); }; })();
  function allRows() { return dataCache ? Promise.resolve(dataCache) : repo.list().then(function (r) { dataCache = r; return r; }); }
  function buildCriteria(extra) {
    var c = { text: filterState.text, filters: filterState.filters, dateFrom: filterState.dateFrom, dateTo: filterState.dateTo,
              sort: sortState, page: filterState.page, pageSize: filterState.pageSize };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }
  var els = {
    main: document.getElementById("main"),
    list: document.getElementById("report-list"),
    listEmpty: document.getElementById("list-empty"),
    search: document.getElementById("search"),
    status: document.getElementById("statusline"),
    banner: document.getElementById("marking-banner")
  };
  var formItems = [];          // working item array while editing
  var editingUrn = null;       // urn when editing an existing record
  var activeOp = "";           // selected operation tab ("" = All)
  var sortState = { key: "dateOfCollection", dir: -1 };  // overview sort (default newest first)
  var view = "home";          // "home" | "results" | "detail"
  var cameFromResults = false; // detail back-target: true => return to results, else home
  var lastDetailUrn = null;    // currently-open report (for sidebar "you are here")
  var compareUrns = [];        // reports shown in side-by-side compare (max 3)

  // --- Mini-chart (inline structured-intelligence network) ----------------
  // Colour each entity by POLE type, matching SOLAR's CRModel palette. SOLAR's
  // ENTITY_TYPES aren't reachable here (CRModel isn't loaded in Registry), so we
  // mirror its exact hex values, mapped via the Registry->SOLAR type map.
  var SI_TYPE_COLOUR = {
    person:            "#6ea8d8",   // SOLAR person
    organisation:      "#d8a16e",   // SOLAR organisation
    vehicle:           "#c9c36a",   // SOLAR vehicle
    account:           "#d87f9b",   // SOLAR account
    communication:     "#79c98f",   // SOLAR phone
    drug:              "#a88f7a",   // SOLAR drug
    cash:              "#a8c97f",   // SOLAR cash
    cyber:             "#7fb0c9",   // SOLAR ip
    firearm:           "#d86e6e",   // SOLAR weapon
    official_document: "#b1a08d",   // SOLAR document
    location:          "#5fc4c0"    // SOLAR location
  };
  function siColour(type) { return SI_TYPE_COLOUR[type] || "#9aa5b1"; }
  // Registry SI type -> SOLAR CRIcons glyph key (same typed glyphs as the workbench chart).
  var SI_TYPE_GLYPH = {
    person:"person", organisation:"organisation", vehicle:"vehicle", account:"account",
    communication:"phone", cyber:"ip", firearm:"flag", official_document:"document", location:"location", drug:"drug", cash:"money"
  };
  function siGlyph(type) { return SI_TYPE_GLYPH[type] || "flag"; }

  /* ---- highlight extracted entities inside report item text (usability) ---- */
  var siHighlightOn = (function () { try { return localStorage.getItem("reg_hl_entities") !== "0"; } catch (e) { return true; } })();
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function highlightText(raw, ents, on) {
    var escd = esc(raw == null ? "" : raw);
    if (!on || !ents || !ents.length) return escd;
    var labs = ents.filter(function (e) { return e.label && String(e.label).trim().length >= 2; })
      .map(function (e) { return { e: e, lab: esc(String(e.label)) }; })
      .filter(function (x) { return x.lab; })
      .sort(function (a, b) { return b.lab.length - a.lab.length; });   // longest first wins
    if (!labs.length) return escd;
    var byLab = {}; labs.forEach(function (x) { var k = x.lab.toLowerCase(); if (!(k in byLab)) byLab[k] = x.e; });
    var re = new RegExp("(" + labs.map(function (x) { return escRe(x.lab); }).join("|") + ")", "gi");
    return escd.replace(re, function (m) {                              // single pass: no nested re-match
      var e = byLab[m.toLowerCase()]; if (!e) return m;
      var tl = (SI.ENTITY_TYPES[e.type] && SI.ENTITY_TYPES[e.type].label) || e.type;
      var info = tl + (e.role ? " \u00b7 " + (SI.ROLES[e.role] || e.role) : "") + " \u00b7 PND:" + (e.pndShare || "");
      return '<mark class="si-hl" data-eid="' + esc(e.id) + '" tabindex="0" style="color:' + siColour(e.type) + '" title="' + esc(info) + '">' + m + '</mark>';
    });
  }
  function highlightExtract(raw, on) {
    var txt = raw == null ? "" : String(raw);
    if (!on) return esc(txt);
    if (!(window.CRExtract && window.CRExtract.extract)) return highlightText(txt, [], on); // engine absent -> plain
    var res;
    try { res = window.CRExtract.extract(txt, { dateFormat: "DMY" }); } catch (e) { return esc(txt); }
    var marks = [];
    (res.entities || []).forEach(function (ent) {
      (ent.spans || []).forEach(function (sp) { marks.push({ s: sp[0], e: sp[1], type: ent.type || "ent" }); });
    });
    (res.relationships || []).forEach(function (r) { if (r.cueSpan) marks.push({ s: r.cueSpan[0], e: r.cueSpan[1], type: "cue" }); });
    (res.cues || []).forEach(function (cu) { if (cu.span) marks.push({ s: cu.span[0], e: cu.span[1], type: "cue" }); });
    marks.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var out = "", pos = 0;
    marks.forEach(function (mk) {
      if (mk.s < pos || mk.s < 0 || mk.e > txt.length) return; // skip overlap / out-of-range
      out += esc(txt.slice(pos, mk.s));
      out += '<mark class="hl hl-' + esc(mk.type) + '" title="' + esc(mk.type) + '">' + esc(txt.slice(mk.s, mk.e)) + '</mark>';
      pos = mk.e;
    });
    out += esc(txt.slice(pos));
    return out;
  }
  function siFlash(el) { if (!el) return; try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { el.scrollIntoView(); } el.classList.add("si-flash"); setTimeout(function () { el.classList.remove("si-flash"); }, 1300); }
  function siFindByEid(sel, id) { var n = document.querySelectorAll(sel); for (var i = 0; i < n.length; i++) if (n[i].getAttribute("data-eid") === id) return n[i]; return null; }
  document.addEventListener("keydown", function (e) {   // "/" focuses the search box (quick find)
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    var a = document.activeElement, tag = (a && a.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (a && a.isContentEditable)) return;
    var box = document.getElementById("search");
    if (box) { e.preventDefault(); box.focus(); box.select && box.select(); }
  });
  // rgba glow from a #rrggbb hex (mirrors graph.js glowOf).
  function siGlow(hex, a) {
    var h = String(hex || "#9aa5b1").replace("#", "");
    return "rgba(" + parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) +
      "," + parseInt(h.slice(4, 6), 16) + "," + a + ")";
  }
  var miniNetwork = null; // current vis.Network instance (so we can dispose on re-render)
  function prefersReducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch (e) { return false; }
  }

  // Move focus to the new view's heading and reset scroll, so keyboard/SR users
  // land in the new context on every view swap (open/close a report, etc.).
  function focusView() {
    var h = els.main.querySelector("h1");
    if (h) { if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
    els.main.scrollTop = 0;
  }
  // Reflect the open report in the sidebar list ("you are here").
  function markActiveReport() {
    if (!els.list) return;
    Array.prototype.forEach.call(els.list.querySelectorAll(".report-item"), function (li) {
      if (li.getAttribute("data-urn") === lastDetailUrn) li.setAttribute("aria-current", "true");
      else li.removeAttribute("aria-current");
    });
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* Designed empty state — the sanctioned constellation motif (DESIGN.md):
     quiet twinkling glyph (opacity ≤ .5, reduced-motion gated in CSS) + a
     one-line explanation + an optional primary action button. XSS-safe:
     title/hint are esc()'d; the action id/label are caller-provided literals.
     opts = { title, hint, action:{ id, label } }                          */
  var EMPTY_CONSTELLATION =
    '<svg class="reg-empty-glyph" viewBox="0 0 220 120" aria-hidden="true" focusable="false">' +
      '<g fill="none" stroke="currentColor" stroke-width="1">' +
        '<path d="M30 92 82 34 138 66 196 22" opacity=".5"/>' +
        '<path d="M82 34 110 96 138 66" opacity=".35"/></g>' +
      '<g fill="currentColor">' +
        '<circle cx="30" cy="92" r="4"/><circle cx="82" cy="34" r="5.5"/>' +
        '<circle cx="138" cy="66" r="4.5"/><circle cx="196" cy="22" r="4"/>' +
        '<circle cx="110" cy="96" r="3.5"/></g></svg>';
  /* Level indicator for report confidence (TRUST-CRITICAL, DESIGN.md):
     an ordinal 3-segment pip scale — Low 1 · Medium 2 · High 3 — NOT a
     percentage. Defensible: it renders exactly the model's confidence band
     and nothing more; the text label always accompanies it. Static (no
     motion on the persisted value). aria-label makes it screen-reader clear. */
  var CONF_RANK = { high: 3, medium: 2, med: 2, low: 1 };
  function confidenceLevel(value) {
    var v = String(value == null ? "" : value).trim();
    var n = CONF_RANK[v.toLowerCase()] || 0;
    if (!n) { return '<span class="conf-level conf-none">' + esc(v || "—") + '</span>'; }
    var pips = "";
    for (var i = 1; i <= 3; i++) { pips += '<span class="conf-pip' + (i <= n ? " is-on" : "") + '" aria-hidden="true"></span>'; }
    return '<span class="conf-level conf-l' + n + '" role="img" aria-label="Confidence ' + esc(v) + ' (' + n + ' of 3)">' +
      '<span class="conf-pips">' + pips + '</span>' +
      '<span class="conf-text">' + esc(v) + '</span></span>';
  }

  function emptyState(opts) {
    opts = opts || {};
    var action = opts.action
      ? '<div class="reg-empty-actions"><button type="button" class="btn primary" id="' + opts.action.id + '">' + esc(opts.action.label) + '</button></div>'
      : '';
    return '<div class="reg-empty' + (opts.compact ? ' reg-empty-c' : '') + '">' + EMPTY_CONSTELLATION +
      '<p class="reg-empty-title">' + esc(opts.title || '') + '</p>' +
      (opts.hint ? '<p class="reg-empty-hint">' + esc(opts.hint) + '</p>' : '') +
      action + '</div>';
  }
  // Date filters display DD/MM (UK) but filterState stores ISO (yyyy-mm-dd) so the
  // query layer (query.js isoKey/passDate) is untouched. Convert only at the input boundary.
  function dmyToISO(s) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim());
    if (!m) return "";
    var d = +m[1], mo = +m[2];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return "";   // genuinely invalid → clears
    return m[3] + "-" + m[2] + "-" + m[1];
  }
  function isoToDMY(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
  }
  function setStatus(msg, kind) {
    if (!msg) { els.status.hidden = true; els.status.textContent = ""; els.status.className = "statusline"; return; }
    els.status.hidden = false;
    els.status.textContent = msg;
    els.status.className = "statusline" + (kind ? " " + kind : "");
    // UI-sound: a status is a real outcome — success on "ok", error on "err".
    // Central so every save / submit / authorise / reject / access outcome maps
    // to exactly one cue (one-cue-per-interaction; supplementary to the text).
    if (window.SolarSound) {
      if (kind === "ok") { window.SolarSound.play("success"); }
      else if (kind === "err") { window.SolarSound.play("error"); }
    }
  }
  function setBanner(mk) {
    var m = (M.PROTECTIVE_MARKING.indexOf(mk) !== -1) ? mk : "OFFICIAL";
    els.banner.textContent = m;
    els.banner.setAttribute("data-mk", m);
  }
  function opt(value, label, sel) {
    return '<option value="' + esc(value) + '"' + (sel === value ? " selected" : "") + ">" + esc(label) + "</option>";
  }
  // Alphabetise a list of keys by their display label, but always pin "Other" last.
  function alphaPinOther(keys, labelFn) {
    return keys.slice().sort(function (a, b) {
      var la = String(labelFn(a)), lb = String(labelFn(b));
      var ao = /^other$/i.test(la) ? 1 : 0, bo = /^other$/i.test(lb) ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return la.localeCompare(lb);
    });
  }
  function download(filename, text) {
    try {
      var blob = new Blob([text], { type: "application/json" });
      var url = (window.URL || window.webkitURL).createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { (window.URL || window.webkitURL).revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) { setStatus("Download is not available in this environment.", "err"); return false; }
  }

  /* ---------- sidebar list (removed in the page-based model; kept null-safe
   * so any legacy caller is a harmless no-op when the rail is absent) ---------- */
  function renderSidebar(all) {
    if (!els.list || !els.listEmpty) return;
    if (view === "home") {
      els.list.innerHTML = ""; els.listEmpty.hidden = false;
      els.listEmpty.textContent = "Pick an operation, or search/filter, to list reports.";
      return;
    }
    var res = Q.run(all, buildCriteria({ page: 1, pageSize: 100000 }));
    els.list.innerHTML = "";
    els.listEmpty.hidden = res.total !== 0;
    els.listEmpty.textContent = "No matching reports.";
    res.rows.slice(0, 300).forEach(function (ir) {
      var li = document.createElement("li");
      var nItems = (ir.items || []).filter(function (i) { return !i.isProvenance; }).length;
      li.className = "report-item"; li.tabIndex = 0; li.setAttribute("role", "button"); li.setAttribute("data-urn", ir.urn);
      // hover-card: an action gloss (what opening the row does) — never repeats
      // the URN/title/counts already shown. Plain text (textContent) so safe.
      li.setAttribute("data-tip", "Open this report — full detail, items and grading");
      if (ir.urn === lastDetailUrn) li.setAttribute("aria-current", "true");
      li.innerHTML =
        '<div class="ri-top"><span class="ri-urn">' + esc(ir.urn) + '</span>' +
        (ir.operation ? '<span class="pill" style="color:var(--accent)">' + esc(ir.operation) + '</span>' : '') + '</div>' +
        '<div class="ri-title">' + esc(ir.title || "(untitled)") + '</div>' +
        '<div class="ri-meta"><span>' + nItems + ' item' + (nItems === 1 ? "" : "s") + '</span>' +
        '<span>' + esc((ir.updatedAt || "").slice(0, 10)) + '</span></div>';
      function open() { showDetail(ir.urn); }
      li.addEventListener("click", open);
      li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      els.list.appendChild(li);
    });
  }
  function refreshList() { return allRows().then(function (all) { renderSidebar(all); }).then(function () { return renderOpTabs(); }); }

  /* ---------- capture form ---------- */
  function blankItem() { return { sourceType: "PND", text: "", sourceEval: "", intelEval: "" }; }

  function gradeText(it, hcode) {
    if (G.isSourceEval(it.sourceEval) && G.isAssessment(it.intelEval)) {
      return G.code(it.sourceEval, it.intelEval, hcode === "C" ? "C" : "P");
    }
    return "[ - ]";
  }

  // Source-reliability colour key for a grade code like "[3CC]". Returns the
  // attribute ` data-rel="N"` for N in {1,2,3} (1 Reliable -> ok, 2 Untested
  // -> warn, 3 Not reliable -> bad); empty for ungraded "[ - ]". Decorative
  // on top of text: the grade still reads its full code for AA / colour-blind.
  function relAttr(code) {
    var m = String(code).match(/\[\s*([1-3])/);
    return m ? ' data-rel="' + m[1] + '"' : '';
  }
  // Live-update sibling of relAttr for grade spans whose text we rewrite
  // in place (form preview); keeps the reliability colour matching the code.
  function setRel(el, code) {
    var m = String(code).match(/\[\s*([1-3])/);
    if (m) el.setAttribute("data-rel", m[1]); else el.removeAttribute("data-rel");
  }

  function updateProvGrade() {
    var se = (document.getElementById("f-prov-se") || {}).value;
    var ie = (document.getElementById("f-prov-ie") || {}).value;
    var hc = (document.querySelector('input[name="f-hcode"]:checked') || {}).value || "P";
    var g = document.getElementById("prov-grade");
    if (g) { var gc = gradeText({ sourceEval: se, intelEval: ie }, hc); g.textContent = gc; setRel(g, gc); }
  }

  function itemHTML(it, idx, hcode) {
    var st = alphaPinOther(M.SOURCE_TYPES, function (s) { return s; }).map(function (s) { return opt(s, s, it.sourceType); }).join("");
    var se = ['<option value="">—</option>']
      .concat(G.sourceEvalCodes().map(function (c) { return opt(c, c + " " + G.SOURCE_EVAL[c], it.sourceEval); })).join("");
    var ie = ['<option value="">—</option>']
      .concat(G.assessmentCodes().map(function (c) { return opt(c, c + " " + G.ASSESSMENT[c], it.intelEval); })).join("");
    return '' +
      '<div class="item-card" data-idx="' + idx + '">' +
        '<div class="item-head"><span class="item-no">Item ' + (idx + 1) + '</span>' +
          '<span>Grade <span class="grade" data-grade="' + idx + '"' + relAttr(gradeText(it, hcode)) + '>' + esc(gradeText(it, hcode)) + '</span> ' +
          '<button type="button" class="btn danger" data-rm="' + idx + '" aria-label="Remove item ' + (idx + 1) + '">Remove</button></span>' +
        '</div>' +
        '<div class="field"><label for="it-src-' + idx + '">Source / system</label>' +
          '<select id="it-src-' + idx + '" data-f="sourceType" data-i="' + idx + '">' + st + '</select></div>' +
        '<div class="field"><label for="it-text-' + idx + '">Item text</label>' +
          '<textarea id="it-text-' + idx + '" data-f="text" data-i="' + idx + '">' + esc(it.text) + '</textarea></div>' +
        '<div class="row">' +
          '<div class="field"><label for="it-se-' + idx + '">Source evaluation (1–3)</label>' +
            '<select id="it-se-' + idx + '" data-f="sourceEval" data-i="' + idx + '">' + se + '</select></div>' +
          '<div class="field"><label for="it-ie-' + idx + '">Intelligence evaluation (A–E)</label>' +
            '<select id="it-ie-' + idx + '" data-f="intelEval" data-i="' + idx + '">' + ie + '</select></div>' +
        '</div>' +
      '</div>';
  }

  function renderItems() {
    var hcode = (document.querySelector('input[name="f-hcode"]:checked') || {}).value || "P";
    var wrap = document.getElementById("items");
    wrap.innerHTML = formItems.map(function (it, i) { return itemHTML(it, i, hcode); }).join("");
  }

  function showForm(existing) {
    if (existing && (existing.status === "AUTHORISED" || existing.status === "SUPPRESSED")) {
      setStatus("Authorised or suppressed reports cannot be edited.", "err"); showDetail(existing.urn); return;
    }
    editingUrn = existing ? existing.urn : null;
    formItems = existing && existing.items
      ? existing.items.filter(function (i) { return !i.isProvenance; }).map(function (i) {
          return { sourceType: i.sourceType, text: i.text, sourceEval: i.sourceEval, intelEval: i.intelEval };
        })
      : [blankItem()];
    if (!formItems.length) formItems = [blankItem()];

    var e = existing || {};
    var h = e.handling || {};
    var ss = e.sensitiveSource || {};
    var mk = e.protectiveMarking || "OFFICIAL";
    setBanner(mk);

    var threatOpts = ['<option value="">— select —</option>']
      .concat(alphaPinOther(T.list(), function (t) { return t; }).map(function (t) { return opt(t, t, e.threatArea); })).join("");
    var markingOpts = M.PROTECTIVE_MARKING.map(function (m) { return opt(m, m, mk); }).join("");
    var confOpts = ['<option value="">— select —</option>']
      .concat(M.CONFIDENCE.map(function (c) { return opt(c, c, e.confidence); })).join("");
    var opOpts = ['<option value="">— unassigned —</option>']
      .concat(O.list().slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
        .map(function (o) { return opt(o.name, o.name + " — " + o.threatArea.split(" - ")[0], e.operation); })).join("");
    var actionOpts = ['<option value="">— select —</option>']
      .concat(Object.keys(M.ACTION_CODES).map(function (k) { return opt(k, k + " " + M.ACTION_CODES[k], h.actionCode); })).join("");
    var sanOpts = ['<option value="">— select —</option>']
      .concat(Object.keys(M.SANITISATION_CODES).map(function (k) { return opt(k, k + " " + M.SANITISATION_CODES[k], h.sanitisationCode); })).join("");
    var pv = M.coerceProvenance(e.provenance);
    var provSe = ['<option value="">—</option>']
      .concat(G.sourceEvalCodes().map(function (c) { return opt(c, c + " " + G.SOURCE_EVAL[c], pv.sourceEval); })).join("");
    var provIe = ['<option value="">—</option>']
      .concat(G.assessmentCodes().map(function (c) { return opt(c, c + " " + G.ASSESSMENT[c], pv.intelEval); })).join("");
    var isC = h.code === "C";
    var provGrade = gradeText(pv, isC ? "C" : "P");

    var bandOpts = ["1","2","3","4"].map(function(b){ return opt(b, "Band "+b, String(e.threatBand||"")); }).join("");
    els.main.innerHTML =
      '<form class="form" id="ir-form" novalidate>' +
      '<h1 tabindex="-1">' + (existing ? "Edit report " + esc(existing.urn) : "New intelligence report") + '</h1>' +
      '<div id="error-summary"></div>' +

      '<fieldset><legend>Report</legend>' +
        '<div class="field"><label for="f-title">Title</label>' +
          '<input id="f-title" type="text" value="' + esc(e.title) + '"></div>' +
        '<div class="field"><label for="f-operation">Operation</label>' +
          '<select id="f-operation">' + opOpts + '</select></div>' +
        '<div class="row">' +
          '<div class="field"><label for="f-date">Date of collection</label>' +
            '<p class="hint" id="f-date-hint">Format DD/MM/YYYY</p>' +
            '<input id="f-date" type="text" inputmode="numeric" placeholder="DD/MM/YYYY" aria-describedby="f-date-hint" value="' + esc(e.dateOfCollection) + '"></div>' +
          '<div class="field"><span class="label" id="f-self-lbl" style="font-weight:600;display:block;margin-bottom:.25rem">Are you the submitter?</span>' +
            '<div class="radio-row" role="radiogroup" aria-labelledby="f-self-lbl">' +
              '<label><input type="radio" name="f-self" value="yes"' + (e.submittedBySelf === false ? "" : " checked") + '> Yes</label>' +
              '<label><input type="radio" name="f-self" value="no"' + (e.submittedBySelf === false ? " checked" : "") + '> No</label>' +
            '</div></div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label for="f-poc">Point of Contact</label>' +
            '<input id="f-poc" type="text" value="' + esc(e.pointOfContact||"") + '"></div>' +
          '<div class="field"><label for="f-date-intel">Date of Intelligence</label>' +
            '<input id="f-date-intel" type="text" inputmode="numeric" placeholder="DD/MM/YYYY" value="' + esc(e.dateOfIntelligence||"") + '"></div>' +
          '<div class="field"><label for="f-date-created">Date Created</label>' +
            '<input id="f-date-created" type="text" inputmode="numeric" placeholder="DD/MM/YYYY" value="' + esc(e.dateCreated||"") + '"></div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label for="f-threat">Threat area</label><select id="f-threat">' + threatOpts + '</select></div>' +
          '<div class="field"><label for="f-confidence">Confidence level</label><select id="f-confidence">' + confOpts + '</select></div>' +
          '<div class="field"><label for="f-marking">Protective marking</label><select id="f-marking">' + markingOpts + '</select></div>' +
          '<div class="field"><label for="f-band">Threat band</label><select id="f-band">' + bandOpts + '</select></div>' +
        '</div>' +
      '</fieldset>' +

      '<fieldset><legend>Handling</legend>' +
        '<div class="field"><span class="label" id="f-hcode-lbl" style="font-weight:600;display:block;margin-bottom:.25rem">Handling code</span>' +
          '<div class="radio-row" role="radiogroup" aria-labelledby="f-hcode-lbl">' +
            '<label><input type="radio" name="f-hcode" value="P"' + (isC ? "" : " checked") + '> P — Lawful sharing permitted</label>' +
            '<label><input type="radio" name="f-hcode" value="C"' + (isC ? " checked" : "") + '> C — Permitted with conditions</label>' +
          '</div></div>' +
        '<div id="cond-block"' + (isC ? "" : " hidden") + '>' +
          '<div class="field"><label for="f-hinstructions">Detailed handling instructions</label>' +
            '<textarea id="f-hinstructions">' + esc(h.instructions) + '</textarea></div>' +
          '<div class="row">' +
            '<div class="field"><label for="f-action">Action code (C only)</label><select id="f-action">' + actionOpts + '</select></div>' +
            '<div class="field"><label for="f-sanitisation">Sanitisation code (C only)</label><select id="f-sanitisation">' + sanOpts + '</select></div>' +
          '</div>' +
        '</div>' +
      '</fieldset>' +

      '<fieldset><legend>Sensitive source</legend>' +
        '<div class="row">' +
          '<div class="field"><label for="f-ss-source">Source</label><input id="f-ss-source" type="text" value="' + esc(ss.source) + '"></div>' +
          '<div class="field"><label for="f-ss-subtype">Subtype</label><input id="f-ss-subtype" type="text" value="' + esc(ss.subtype) + '"></div>' +
          '<div class="field"><label for="f-ss-reference">Reference</label><input id="f-ss-reference" type="text" value="' + esc(ss.reference) + '"></div>' +
        '</div>' +
      '</fieldset>' +

      '<fieldset><legend>Intelligence items</legend>' +
        '<div id="items"></div>' +
        '<button type="button" id="btn-add-item" class="btn secondary">+ Add item</button>' +
      '</fieldset>' +

      '<fieldset><legend>Provenance</legend>' +
        '<div class="field"><label for="f-provenance">Provenance statement</label>' +
          '<textarea id="f-provenance">' + esc(pv.text) + '</textarea></div>' +
        '<div class="row">' +
          '<div class="field"><label for="f-prov-se">Source evaluation (1–3)</label><select id="f-prov-se">' + provSe + '</select></div>' +
          '<div class="field"><label for="f-prov-ie">Intelligence evaluation (A–E)</label><select id="f-prov-ie">' + provIe + '</select></div>' +
          '<div class="field"><span style="font-weight:600;display:block;margin-bottom:.25rem">Grade</span><span class="grade" id="prov-grade"' + relAttr(provGrade) + '>' + esc(provGrade) + '</span></div>' +
        '</div>' +
        '<div class="provenance-note">Not charted.</div>' +
      '</fieldset>' +

      '<div class="toolbar">' +
        '<button type="submit" class="btn primary">Save report</button>' +
        '<button type="button" id="btn-cancel" class="btn secondary">Cancel</button>' +
      '</div>' +
      '</form>';

    renderItems();
    wireForm();
    focusView();
  }

  function wireForm() {
    document.getElementById("f-marking").addEventListener("change", function (e) { setBanner(e.target.value); });
    Array.prototype.forEach.call(document.getElementsByName("f-hcode"), function (r) {
      r.addEventListener("change", function () {
        document.getElementById("cond-block").hidden = (document.querySelector('input[name="f-hcode"]:checked').value !== "C");
        renderItems();
        updateProvGrade();
      });
    });
    document.getElementById("btn-add-item").addEventListener("click", function () {
      syncItemsFromDom(); formItems.push(blankItem()); renderItems();
    });
    var itemsWrap = document.getElementById("items");
    itemsWrap.addEventListener("click", function (e) {
      var rm = e.target.getAttribute && e.target.getAttribute("data-rm");
      if (rm != null) { syncItemsFromDom(); formItems.splice(+rm, 1); if (!formItems.length) formItems = [blankItem()]; renderItems(); }
    });
    itemsWrap.addEventListener("input", function (e) {
      var f = e.target.getAttribute && e.target.getAttribute("data-f");
      if (!f) return;
      var i = +e.target.getAttribute("data-i");
      formItems[i][f] = e.target.value;
      if (f === "sourceEval" || f === "intelEval") {
        var hcode = document.querySelector('input[name="f-hcode"]:checked').value;
        var g = document.querySelector('[data-grade="' + i + '"]');
        if (g) { var gc = gradeText(formItems[i], hcode); g.textContent = gc; setRel(g, gc); }
      }
    });
    document.getElementById("f-prov-se").addEventListener("change", updateProvGrade);
    document.getElementById("f-prov-ie").addEventListener("change", updateProvGrade);
    document.getElementById("btn-cancel").addEventListener("click", function () { showWelcome(); });
    document.getElementById("ir-form").addEventListener("submit", function (e) { e.preventDefault(); save(); });
  }

  function syncItemsFromDom() {
    Array.prototype.forEach.call(document.querySelectorAll("#items [data-f]"), function (el) {
      var i = +el.getAttribute("data-i"), f = el.getAttribute("data-f");
      if (formItems[i]) formItems[i][f] = el.value;
    });
  }

  function collectForm() {
    syncItemsFromDom();
    var hcode = document.querySelector('input[name="f-hcode"]:checked').value;
    var ir = M.createIR({
      urn: editingUrn || undefined,
      operation: document.getElementById("f-operation").value,
      title: document.getElementById("f-title").value,
      dateOfCollection: document.getElementById("f-date").value,
      dateOfIntelligence: (document.getElementById("f-date-intel")||{}).value || "",
      dateCreated: (document.getElementById("f-date-created")||{}).value || "",
      pointOfContact: (document.getElementById("f-poc")||{}).value || "",
      threatBand: (document.getElementById("f-band")||{}).value || "",
      submittedBySelf: document.querySelector('input[name="f-self"]:checked').value === "yes",
      threatArea: document.getElementById("f-threat").value,
      confidence: document.getElementById("f-confidence").value,
      protectiveMarking: document.getElementById("f-marking").value,
      handling: {
        code: hcode,
        instructions: hcode === "C" ? document.getElementById("f-hinstructions").value : "",
        actionCode: hcode === "C" ? (document.getElementById("f-action").value || null) : null,
        sanitisationCode: hcode === "C" ? (document.getElementById("f-sanitisation").value || null) : null
      },
      sensitiveSource: {
        source: document.getElementById("f-ss-source").value,
        subtype: document.getElementById("f-ss-subtype").value,
        reference: document.getElementById("f-ss-reference").value
      },
      provenance: {
        text: document.getElementById("f-provenance").value,
        sourceEval: document.getElementById("f-prov-se").value,
        intelEval: document.getElementById("f-prov-ie").value
      }
    });
    formItems.forEach(function (it) { M.addItem(ir, it); });
    return ir;
  }

  var FIELD_IDS = {
    "operation": "f-operation", "title": "f-title", "dateOfCollection": "f-date", "submittedBySelf": "f-self",
    "threatArea": "f-threat", "confidence": "f-confidence", "protectiveMarking": "f-marking",
    "handling.code": "f-hcode", "handling.instructions": "f-hinstructions",
    "handling.actionCode": "f-action", "handling.sanitisationCode": "f-sanitisation",
    "provenance": "f-provenance", "provenance.text": "f-provenance",
    "provenance.sourceEval": "f-prov-se", "provenance.intelEval": "f-prov-ie", "items": "items"
  };
  function fieldId(errField) {
    if (FIELD_IDS[errField]) return FIELD_IDS[errField];
    var m = errField.match(/^items\[(\d+)\]\.(\w+)$/);
    if (m) {
      var i = m[1], f = m[2];
      if (f === "text") return "it-text-" + i;
      if (f === "sourceEval") return "it-se-" + i;
      if (f === "intelEval") return "it-ie-" + i;
    }
    return null;
  }

  function showErrors(errors) {
    var sum = document.getElementById("error-summary");
    if (!errors.length) { sum.innerHTML = ""; return; }
    var items = errors.map(function (er) {
      var id = fieldId(er.field);
      return "<li>" + (id ? '<a href="#' + esc(id) + '">' + esc(er.message) + "</a>" : esc(er.message)) + "</li>";
    }).join("");
    sum.innerHTML = '<div class="error-summary" role="alert"><h2>There ' +
      (errors.length === 1 ? "is 1 problem" : "are " + errors.length + " problems") +
      " with the report</h2><ul>" + items + "</ul></div>";
    sum.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        var t = document.getElementById(a.getAttribute("href").slice(1));
        if (t) { t.focus(); if (t.scrollIntoView) t.scrollIntoView({ block: "center" }); }
      });
    });
    if (sum.scrollIntoView) sum.scrollIntoView({ block: "start" });
  }

  function save() {
    var raw = collectForm();
    var ir = N.normaliseIR(raw);
    var res = V.validateIR(ir);
    if (!res.valid) {
      showErrors(res.errors);
      setStatus(res.errors.length + " problem(s) — report not saved.", "err");
      return;
    }
    showErrors([]);
    var prior = editingUrn ? repo.get(editingUrn) : Promise.resolve(null);
    prior.then(function (prev) {
      if (prev) {                         // editing: preserve immutable history + lifecycle
        ir.createdAt = prev.createdAt || ir.createdAt;
        ir.status = prev.status || ir.status;
        ir.audit = (prev.audit || []).slice();
        ir.structuredIntelligence = prev.structuredIntelligence || ir.structuredIntelligence;
      }
      M.addAudit(ir, "user", editingUrn ? "updated" : "submitted", editingUrn ? "Edited via Registry UI" : "Created via Registry UI");
      return repo.save(ir);
    }).then(function () {
      setStatus("Saved " + ir.urn + ".", "ok");
      return refreshList();
    }).then(function () {
      showDetail(ir.urn);
    }).catch(function (err) {
      setStatus("Save failed: " + (err && err.message), "err");
    });
  }

  /* ---------- detail view ---------- */
  var activeDetailIR = null;
  function closeIrDrawer(){ var d=document.getElementById('ir-drawer'); if(d) d.hidden=true; }
  function openIrDrawer(html){ var d=document.getElementById('ir-drawer'), b=document.getElementById('ir-drawer-body'); if(!d||!b) return; b.innerHTML=html; d.hidden=false; }
  /* 023 — concise grade legend for the chip tooltip; wording reused from explainGrade's
     dr-lede + dr-foot (the real, defensible definition). Full breakdown stays on click. */
  var GRADE_TIP = 'Graded on the 3×5×2 system: source-evaluation number, intelligence-evaluation letter, handling code. Source 1 Reliable · 2 Untested · 3 Not reliable. Intelligence A–E, known-true to suspected-false. Handling P permitted · C permitted subject to conditions.';

  /* whether the analyst has dismissed the "select text to highlight" hint */
  var USER_HL_HINT_KEY = "reg_hl_hint_dismissed_v1";
  function userHlHintDismissed(){ try { return localStorage.getItem(USER_HL_HINT_KEY) === "1"; } catch(e){ return false; } }
  function dismissUserHlHint(){ try { localStorage.setItem(USER_HL_HINT_KEY, "1"); } catch(e){ /* ignore */ } }

  function explainGrade(grade, handling){
    var sc=String(grade||''), s=sc.charAt(0), i=sc.charAt(1).toUpperCase(), hc=String(handling||'P').toUpperCase();
    var se=G.SOURCE_EVAL[s], as=G.ASSESSMENT[i], ha=G.HANDLING[hc];
    return '<h3 class="dr-h">Grade '+esc(sc)+esc(hc)+'</h3>'
      + '<p class="dr-lede">Intelligence is graded on the <b>3\u00d75\u00d72</b> system \u2014 a source-evaluation number, an intelligence-evaluation letter and a handling code. A report inherits its overall grade from its <b>least-reliable item</b>.</p>'
      + '<dl class="dr-dl">'
      +   '<dt><span class="dr-code">'+esc(s)+'</span> Source evaluation</dt><dd>'+esc(se||'\u2014')+'</dd>'
      +   '<dt><span class="dr-code">'+esc(i)+'</span> Intelligence evaluation</dt><dd>'+esc(as||'\u2014')+'</dd>'
      +   (hc?('<dt><span class="dr-code">'+esc(hc)+'</span> Handling</dt><dd>'+esc(ha||'\u2014')+'</dd>'):'')
      + '</dl>'
      + '<p class="dr-foot">Source 1 Reliable \u00b7 2 Untested \u00b7 3 Not reliable. Intelligence A\u2013E, known-true through to suspected-false. Handling P permitted \u00b7 C permitted subject to conditions.</p>';
  }
  function openSourceDrawer(src){
    var SM=(typeof window!=='undefined')?window.RegistrySourceMeta:null; var meta=SM?SM.describe(src):{text:''}; var col=SM?SM.colour(src):'#8d99ae';
    var op=activeDetailIR?activeDetailIR.operation:'';
    var head='<h3 class="dr-h"><span class="dr-swatch" style="background:'+esc(col)+'"></span>'+esc(src)+'</h3>'+'<p class="dr-lede">'+esc(meta.text)+(meta.indicative?' <span class="dr-indic">(indicative)</span>':'')+'</p>';
    openIrDrawer(head+'<p class="dr-loading">Finding other '+esc(src)+' checks in '+esc(op||'this operation')+'\u2026</p>');
    allRows().then(function(rows){
      var hits=[];
      rows.forEach(function(r){ if(op && r.operation!==op) return; (r.items||[]).forEach(function(it,idx){ if(it.sourceType===src) hits.push({urn:r.urn,n:idx+1,text:String(it.text||'')}); }); });
      var listHtml = hits.length ? '<ul class="dr-hits">'+hits.map(function(hh){ var snip=hh.text.slice(0,90); return '<li><button type="button" class="dr-hit" data-urn="'+esc(hh.urn)+'"><span class="dr-hit-ref">'+esc(hh.urn)+' \u00b7 item '+hh.n+'</span><span class="dr-hit-snip">'+esc(snip)+(hh.text.length>90?'\u2026':'')+'</span></button></li>'; }).join('')+'</ul>' : '<p class="dr-none">No other '+esc(src)+' checks in this operation.</p>';
      openIrDrawer(head+'<div class="dr-sec-h">'+hits.length+' '+esc(src)+' check'+(hits.length===1?'':'s')+' in '+esc(op||'this operation')+'</div>'+listHtml);
      var b=document.getElementById('ir-drawer-body'); if(b){ [].forEach.call(b.querySelectorAll('.dr-hit'), function(btn){ btn.addEventListener('click', function(){ closeIrDrawer(); showDetail(btn.getAttribute('data-urn')); }); }); }
    });
  }
  /* ---------- nominal dossier (View Person) ---------- */
  function showPerson(seedId){
    view='person';
    allRows().then(function(all){
      var d = window.RegistryDossier ? window.RegistryDossier.buildDossier(all, seedId) : null;
      if(!d){ setStatus('No person record found.','err'); return showHome(); }
      var seedEnt={type:'person',label:d.primaryName,attrs:{dob:d.dob,pnc:d.identifiers.pnc[0]||'',cro:d.identifiers.cro[0]||'',nino:d.identifiers.nino[0]||''}};
      var onWatch=!!(window.RegistryWatchlist && window.RegistryWatchlist.has(seedEnt));
      function cell(k,v){ return '<div class="meta-cell"><span class="meta-k">'+esc(k)+'</span><span class="meta-v">'+esc(v)+'</span></div>'; }
      var idRows=[['PNC',d.identifiers.pnc],['CRO',d.identifiers.cro],['NINO',d.identifiers.nino],['Passport',d.identifiers.passport]]
        .filter(function(x){return x[1].length;}).map(function(x){ return cell(x[0], x[1].join(', ')); }).join('');
      function listCard(title,arr){ if(!arr.length) return ''; return '<div class="dos-card"><h3>'+esc(title)+'<span class="dos-n">'+arr.length+'</span></h3><ul class="dos-list">'+arr.map(function(a){ return '<li>'+esc(a.label)+(a.dob?' <span class="dos-dim">DOB '+esc(a.dob)+'</span>':'')+(a.link?' <span class="dos-link">'+esc((SI.LINK_TYPES[a.link]||a.link))+'</span>':'')+'</li>'; }).join('')+'</ul></div>'; }
      var appRows=d.appearances.map(function(a){ return '<tr class="dos-appear" data-urn="'+esc(a.urn)+'"><td>'+esc(a.date||'\u2014')+'</td><td>'+esc(a.operation||'')+'</td><td class="dos-urn">'+esc(a.urn)+'</td><td>'+esc(a.title||'')+'</td><td class="dos-grade">'+esc(a.grade||'')+'</td><td>'+esc((SI.ROLES[a.role]||a.role||''))+'</td></tr>'; }).join('');
      els.main.innerHTML='<div class="detail page person">'
        +'<div class="crumbs"><button type="button" class="linklike" id="dp-back">\u2190 Back</button> <button type="button" class="btn secondary" id="dp-watch">'+(onWatch?'On watchlist':'Add to watchlist')+'</button></div>'
        +'<div class="dos-head"><span class="dos-eyebrow">NOMINAL RECORD</span><h1 tabindex="-1">'+esc(d.primaryName)+'</h1>'
        +'<div class="dos-sub">'+(d.dob?'DOB '+esc(d.dob)+' \u00b7 ':'')+esc(d.roles.map(function(r){return SI.ROLES[r]||r;}).join(', '))+' \u00b7 appears in '+d.reportCount+' report'+(d.reportCount===1?'':'s')+(d.matchedBy&&d.matchedBy.length?' \u00b7 <span class="dos-matched">resolved by '+esc(d.matchedBy.join(', '))+'</span>':'')+'</div></div>'
        +(idRows?'<div class="meta-grid">'+idRows+'</div>':'')
        +(d.aliases.length?'<div class="dos-aliases"><b>Aliases:</b> '+esc(d.aliases.join(', '))+'</div>':'')
        +'<div class="dos-grid">'+listCard('Associates',d.associates)+listCard('Locations',d.locations)+listCard('Communications',d.comms)+listCard('Vehicles',d.vehicles)+listCard('Accounts',d.accounts)+listCard('Cyber',d.cyber)+'</div>'
        +'<h2>Appearances</h2><table class="op-table dos-appears"><thead><tr><th>Date</th><th>Operation</th><th>URN</th><th>Title</th><th>Grade</th><th>Role</th></tr></thead><tbody>'+appRows+'</tbody></table>'
        +'</div>';
      var bk=document.getElementById('dp-back'); if(bk) bk.addEventListener('click', function(){ if(lastDetailUrn) showDetail(lastDetailUrn); else showHome(); });
      var wb=document.getElementById('dp-watch'); if(wb) wb.addEventListener('click', function(){ var W=window.RegistryWatchlist; if(!W) return; if(W.has(seedEnt)){ setStatus('Already on the watchlist.'); return; } W.add(seedEnt,{addedBy:currentUser()}); wb.textContent='On watchlist'; setStatus('Added '+d.primaryName+' to the watchlist \u2014 silent hits will be raised.','ok'); });
      [].forEach.call(els.main.querySelectorAll('.dos-appear'), function(tr){ tr.addEventListener('click', function(){ showDetail(tr.getAttribute('data-urn')); }); });
      focusView();
    });
  }

  function currentUser(){ try{ return (window.localStorage && localStorage.getItem('reg_user')) || 'G5 Analyst'; }catch(e){ return 'G5 Analyst'; } }
  /* ---------- lawful-access gate (Reason / Justification / on-behalf-of) ---------- */
  function requireAccess(opts, proceed){
    opts=opts||{};
    var A=window.RegistryAccessLog; var reasons=(A&&A.REASONS)||['Intelligence development','Other'];
    var w=document.createElement('div'); w.className='reg-modal';
    w.innerHTML='<div class="reg-modal-scrim"></div><div class="reg-modal-box" role="dialog" aria-modal="true" aria-label="Lawful access check">'
      +'<h2>Lawful access check</h2><p class="reg-modal-sub">'+esc(opts.action||'Access')+(opts.target?': <b>'+esc(opts.target)+'</b>':'')+'</p>'
      +'<label class="rm-lab">Reason <span class="req">*</span><select id="acc-reason">'+reasons.map(function(r){return '<option>'+esc(r)+'</option>';}).join('')+'</select></label>'
      +'<label class="rm-lab">Justification <span class="req">*</span><input id="acc-just" type="text" placeholder="Why is this access necessary and proportionate?"></label>'
      +'<fieldset class="rm-obo"><legend>Searching on behalf of</legend><label><input type="radio" name="acc-obo" value="Self" checked> Self</label> <label><input type="radio" name="acc-obo" value="Other"> Other</label><input id="acc-obo-name" type="text" placeholder="name of officer" disabled></fieldset>'
      +'<div class="rm-actions"><button type="button" class="btn secondary" id="acc-cancel">Cancel</button> <button type="button" class="btn" id="acc-go">Confirm access</button></div></div>';
    document.body.appendChild(w);
    function close(){ if(w.parentNode) w.parentNode.removeChild(w); }
    var oboName=w.querySelector('#acc-obo-name');
    [].forEach.call(w.querySelectorAll('input[name=acc-obo]'), function(r){ r.addEventListener('change', function(){ oboName.disabled = w.querySelector('input[name=acc-obo]:checked').value!=='Other'; if(!oboName.disabled) oboName.focus(); }); });
    w.querySelector('#acc-cancel').addEventListener('click', close);
    w.querySelector('.reg-modal-scrim').addEventListener('click', close);
    w.querySelector('#acc-go').addEventListener('click', function(){
      var reason=w.querySelector('#acc-reason').value, just=w.querySelector('#acc-just').value.trim();
      var oboV=w.querySelector('input[name=acc-obo]:checked').value, oboN=oboName.value.trim();
      if(!just){ w.querySelector('#acc-just').focus(); setStatus('Justification is required.','err'); return; }
      if(oboV==='Other' && !oboN){ oboName.focus(); return; }
      if(A) A.record({ actor:currentUser(), action:opts.action||'', target:opts.target||'', reason:reason, justification:just, onBehalfOf: oboV==='Other'?('Other: '+oboN):'Self' });
      close(); proceed();
    });
    w.querySelector('#acc-reason').focus();
  }
  function showAccessLog(){
    var A=window.RegistryAccessLog; var rows=A?A.list():[];
    var w=document.createElement('div'); w.className='reg-modal';
    var body = rows.length ? '<ul class="acc-log-list">'+rows.slice(0,100).map(function(r){ return '<li><div class="al-top"><span>'+esc(String(r.ts).replace('T',' ').slice(0,16))+' \u00b7 '+esc(r.actor)+'</span><span>'+esc(r.onBehalfOf)+'</span></div><div><span class="al-reason">'+esc(r.reason)+'</span> \u2014 '+esc(r.action)+(r.target?' \u00b7 '+esc(r.target):'')+'</div><div class="al-just">'+esc(r.justification)+'</div></li>'; }).join('')+'</ul>' : '<p class="empty">No access recorded yet.</p>';
    w.innerHTML='<div class="reg-modal-scrim"></div><div class="reg-modal-box" role="dialog" aria-modal="true" aria-label="Access log"><h2>Access log</h2><p class="reg-modal-sub">Every nominal / entity lookup, with its lawful reason.</p>'+body+'<div class="rm-actions" style="margin-top:12px"><button type="button" class="btn secondary" id="al-close">Close</button></div></div>';
    document.body.appendChild(w);
    function close(){ if(w.parentNode) w.parentNode.removeChild(w); }
    w.querySelector('#al-close').addEventListener('click', close); w.querySelector('.reg-modal-scrim').addEventListener('click', close);
  }

  /* ---------- Silent Hit List ---------- */
  function showSilentHits(){
    view='silenthits';
    allRows().then(function(all){
      var W=window.RegistryWatchlist; var results=W?W.scan(all):[];
      function rulesOf(a){ return a.map(function(s){return String(s).split('::')[0];}).filter(function(v,i,arr){return arr.indexOf(v)===i;}).join(', '); }
      var body = results.length ? results.map(function(res){ var w=res.watch;
        var hits = res.hits.length ? '<ul class="sh-hits">'+res.hits.map(function(h){ return '<li class="sh-hit" data-urn="'+esc(h.urn)+'"><span class="sh-urn">'+esc(h.urn)+'</span><span class="sh-op">'+esc(h.operation)+'</span><span class="sh-t" data-tip="'+esc(h.title)+'" tabindex="0">'+esc(h.title)+'</span><span class="sh-date">'+esc(h.date)+'</span><span class="sh-by">'+esc(rulesOf(h.matchedBy))+'</span></li>'; }).join('')+'</ul>' : '<p class="sh-nohits">No hits yet — this nominal has not matched any report.</p>';
        return '<div class="sh-card"><div class="sh-head"><div><span class="sh-name">'+esc(w.label)+'</span>'+(w.dob?' <span class="dos-dim">DOB '+esc(w.dob)+'</span>':'')+(w.note?' <span class="sh-note">'+esc(w.note)+'</span>':'')+'</div><div><span class="sh-count">'+res.hitCount+' hit'+(res.hitCount===1?'':'s')+'</span> <button type="button" class="btn danger sh-rm" data-id="'+esc(w.id)+'">Remove</button></div></div>'+hits+'</div>'; }).join('')
        : emptyState({
            title: 'Your watchlist is empty',
            hint: 'Open a nominal record (Dossier) and use “Add to watchlist”. Any report that matches will surface here as a silent hit.',
            action: { id: 'sh-empty-browse', label: 'Browse operations' }
          });
      els.main.innerHTML='<div class="detail page"><div class="crumbs"><button type="button" class="linklike" id="sh-back">\u2190 Back</button></div><h1 tabindex="-1">Silent Hit List</h1><p class="hint">Nominals of interest, matched against every report by the same engine as Master/Lower.</p>'+body+'</div>';
      // notify cue when silent hits are actually present (a new-match signal),
      // supplementary to the visible list. One cue per surfacing.
      var _totalHits = results.reduce(function(s,r){ return s + (r.hitCount||0); }, 0);
      if (_totalHits > 0 && window.SolarSound) { window.SolarSound.play("notify"); }
      document.getElementById('sh-back').addEventListener('click', showHome);
      var shBrowse = document.getElementById('sh-empty-browse'); if (shBrowse) shBrowse.addEventListener('click', showHome);
      [].forEach.call(els.main.querySelectorAll('.sh-hit'), function(li){ li.addEventListener('click', function(){ showDetail(li.getAttribute('data-urn')); }); });
      [].forEach.call(els.main.querySelectorAll('.sh-rm'), function(b){ b.addEventListener('click', function(){ if(window.RegistryWatchlist) window.RegistryWatchlist.remove(b.getAttribute('data-id')); showSilentHits(); }); });
      focusView();
    });
  }

  /* ---------- Entity Management (Master/Lower + comparison review) ---------- */
  var _entIdx=null, _entMode='master';
  function showEntities(){
    view='entities';
    crumb([{ label: 'Entity search' }]);
    allRows().then(function(all){
      _entIdx = window.RegistryEntityIndex ? window.RegistryEntityIndex.buildEntityIndex(all) : {masters:[],lower:[]};
      els.main.innerHTML='<div class="detail page"><div class="crumbs"><button type="button" class="linklike" id="em-back">← Back</button></div>'
        +'<h1 tabindex="-1">Entity Management</h1><p class="hint">'+_entIdx.masterCount+' master entities resolved from '+_entIdx.entityCount+' report-level (lower) entities.</p>'
        +'<div class="em-bar"><div class="em-toggle"><button type="button" class="em-tab" data-mode="master">Master</button><button type="button" class="em-tab" data-mode="lower">Lower</button></div>'
        +'<input id="em-q" class="search" type="text" placeholder="Search entities by name or identifier…" autocomplete="off"></div><div id="em-results"></div></div>';
      document.getElementById('em-back').addEventListener('click', showHome);
      var q=document.getElementById('em-q'); q.addEventListener('input', function(){ renderEntityResults(q.value); });
      [].forEach.call(els.main.querySelectorAll('.em-tab'), function(t){ t.addEventListener('click', function(){ _entMode=t.getAttribute('data-mode'); renderEntityResults(document.getElementById('em-q').value); }); });
      renderEntityResults(''); focusView();
    });
  }
  function renderEntityResults(q){
    var box=document.getElementById('em-results'); if(!box||!_entIdx) return;
    [].forEach.call(els.main.querySelectorAll('.em-tab'), function(t){ t.setAttribute('aria-selected', t.getAttribute('data-mode')===_entMode?'true':'false'); });
    var ql=String(q||'').toLowerCase().trim();
    function matchQ(label, attrs){ if(!ql) return true; if(String(label).toLowerCase().indexOf(ql)!==-1) return true; return Object.keys(attrs||{}).some(function(k){ return k.charAt(0)!=='_' && String(attrs[k]).toLowerCase().indexOf(ql)!==-1; }); }
    function typeChip(t){ var lab=(SI.ENTITY_TYPES[t]&&SI.ENTITY_TYPES[t].label)||t; return '<span class="em-type" style="--src:'+esc(siColour(t))+'">'+esc(lab)+'</span>'; }
    var html='';
    if(_entMode==='master'){
      var ms=_entIdx.masters.filter(function(m){ return matchQ(m.label,(m.memberEntities[0]||{}).attrs) || m.memberEntities.some(function(me){return matchQ(me.label,me.attrs);}); });
      ms.sort(function(a,b){ return b.memberCount-a.memberCount; });
      html = ms.length ? ms.slice(0,200).map(function(m){
        var head='<div class="em-row">'+typeChip(m.type)+'<span class="em-label">'+esc(m.label)+'</span><span class="em-meta">'+m.memberCount+' appearance'+(m.memberCount===1?'':'s')+(m.matchedBy.length?' · '+esc(m.matchedBy.join(', ')):'')+'</span><span class="em-actions">'
          +(m.type==='person'?'<button type="button" class="btn secondary em-dossier" data-eid="'+esc(m.memberEntities[0].entityId)+'" data-label="'+esc(m.label)+'">Dossier →</button>':'')
          +(m.memberCount>1?'<button type="button" class="btn secondary em-review" data-mid="'+esc(m.masterId)+'">'+(m.confirmed?'Reviewed':'Review '+m.memberCount)+'</button>':'')+'</span></div>';
        var review = m.memberCount>1 ? '<div class="em-review-box" id="rev-'+esc(m.masterId)+'" hidden><div class="em-review-h">These '+m.memberCount+' lower entities were resolved into one master by: '+esc(m.matchedBy.join(', '))+'</div><ul class="em-members">'+m.memberEntities.map(function(me){ return '<li data-urn="'+esc(me.urn)+'"><span class="em-m-urn">'+esc(me.urn)+'</span> '+esc(me.label)+' <span class="dos-dim">'+esc(me.operation)+'</span>'+(me.confirmed?' <span class="em-ok">confirmed</span>':'')+'</li>'; }).join('')+'</ul><div class="rm-actions"><button type="button" class="btn em-confirm" data-mid="'+esc(m.masterId)+'">Confirm matches</button></div></div>' : '';
        return '<div class="em-card">'+head+review+'</div>';
      }).join('') : emptyState({ compact: true, title: ql ? 'No master entities match “' + ql + '”' : 'No master entities', hint: 'Adjust the search above, or switch to the Lower view.' });
    } else {
      var ls=_entIdx.lower.filter(function(x){ return matchQ(x.e.label,x.e.attrs); });
      html = ls.length ? ls.slice(0,300).map(function(x){ return '<div class="em-card"><div class="em-row em-lower" data-urn="'+esc(x.urn)+'">'+typeChip(x.e.type)+'<span class="em-label">'+esc(x.e.label)+'</span><span class="em-meta">'+esc(x.urn)+' · '+esc(x.operation)+'</span></div></div>'; }).join('') : emptyState({ compact: true, title: ql ? 'No lower entities match “' + ql + '”' : 'No lower entities', hint: 'Adjust the search above, or switch to the Master view.' });
    }
    box.innerHTML=html;
    [].forEach.call(box.querySelectorAll('.em-dossier'), function(b){ b.addEventListener('click', function(){ requireAccess({action:'View nominal record', target:b.getAttribute('data-label')}, function(){ showPerson(b.getAttribute('data-eid')); }); }); });
    [].forEach.call(box.querySelectorAll('.em-review'), function(b){ b.addEventListener('click', function(){ var el=document.getElementById('rev-'+b.getAttribute('data-mid')); if(el) el.hidden=!el.hidden; }); });
    [].forEach.call(box.querySelectorAll('.em-lower'), function(r){ r.addEventListener('click', function(){ showDetail(r.getAttribute('data-urn')); }); });
    [].forEach.call(box.querySelectorAll('.em-members li'), function(li){ li.addEventListener('click', function(){ showDetail(li.getAttribute('data-urn')); }); });
    [].forEach.call(box.querySelectorAll('.em-confirm'), function(b){ b.addEventListener('click', function(){ confirmEntityMaster(b.getAttribute('data-mid')); }); });
  }
  function confirmEntityMaster(masterId){
    var m=(_entIdx.masters||[]).filter(function(x){return x.masterId===masterId;})[0]; if(!m) return;
    var byUrn={}; m.memberEntities.forEach(function(me){ (byUrn[me.urn]=byUrn[me.urn]||[]).push(me.entityId); });
    var chain=Promise.resolve();
    Object.keys(byUrn).forEach(function(urn){ chain=chain.then(function(){ return repo.get(urn).then(function(ir){ if(!ir) return; var S=ir.structuredIntelligence||{entities:[]}; S.entities.forEach(function(e){ if(byUrn[urn].indexOf(e.id)!==-1) e.authoriserConfirmed=true; }); M.addAudit(ir,currentUser(),'entity-confirm','confirmed master match '+masterId); return repo.save(ir); }); }); });
    chain.then(function(){ setStatus('Confirmed '+m.memberCount+' matched entities.','ok'); dataCache=null; showEntities(); }).catch(function(e){ setStatus('Confirm failed: '+(e&&e.message),'err'); });
  }

  function showWhatsNew(){
    var items=[
      'Reports now render in the NCA Intelligence Report house structure (masthead, header, 3\u00d75\u00d72 grade, numbered graded items, provenance).',
      'The database now generates structured intelligence with the SAME extraction engine as the chart \u2014 automatically on new reports, or via \u201cExtract entities from report text\u201d.',
      'View Person \u2014 a consolidated nominal dossier aggregating every appearance across an operation (identifiers, aliases, associates, locations, comms, vehicles, accounts, timeline).',
      'Entity Management \u2014 Master/Lower entity search + comparison-match review (confirm merges).',
      'Silent Hit List \u2014 flag nominals of interest and get silent hits when they reappear.',
      'Lawful-access gate \u2014 Reason / Justification / on-behalf-of on sensitive lookups, with an Access log.',
      'Source column colour-coded + clickable (what the system is, and its other checks in the operation); grades explained on click.',
      'Drugs & Cash entity types for full chart parity; mobile layout overhauled.'
    ];
    var w=document.createElement('div'); w.className='reg-modal';
    w.innerHTML='<div class="reg-modal-scrim"></div><div class="reg-modal-box" role="dialog" aria-modal="true" aria-label="What\u2019s New"><h2>What\u2019s New</h2><p class="reg-modal-sub">Recent improvements to the Registry.</p><ul class="wn-list">'+items.map(function(i){return '<li>'+esc(i)+'</li>';}).join('')+'</ul><div class="rm-actions" style="margin-top:12px"><button type="button" class="btn secondary" id="wn-close">Close</button></div></div>';
    document.body.appendChild(w); function close(){ if(w.parentNode) w.parentNode.removeChild(w); }
    w.querySelector('#wn-close').addEventListener('click', close); w.querySelector('.reg-modal-scrim').addEventListener('click', close);
  }
  function lockWorkspace(){
    var w=document.createElement('div'); w.className='reg-lock';
    w.innerHTML='<div class="reg-lock-box"><div class="reg-lock-mk">OFFICIAL-SENSITIVE</div><h2>Workspace locked</h2><p>'+esc(currentUser())+'</p><button type="button" class="btn" id="lk-unlock">Unlock</button></div>';
    document.body.appendChild(w);
    w.querySelector('#lk-unlock').addEventListener('click', function(){ if(w.parentNode) w.parentNode.removeChild(w); });
  }

  function showDetail(urn) {
    view = "detail";
    if (window.SolarSound) { window.SolarSound.play("select"); }   // open report (soft)
    repo.get(urn).then(function (ir) {
      if (!ir) { showWelcome(); return; }
      activeDetailIR = ir;
      setBanner(ir.protectiveMarking);
      crumb((ir.operation ? [{ label: ir.operation, run: (function (op) { return function () { selectOp(op); }; })(ir.operation) }] : [])
        .concat([{ label: ir.urn }]));
      var h = ir.handling || {}, ss = ir.sensitiveSource || {};
      var pvd = M.coerceProvenance(ir.provenance);
      var items = (ir.items || []).filter(function (i) { return !i.isProvenance; });
      // Sensitive source as a distinct, protected block (not a plain dl row).
      // The source's own reporting item belongs INSIDE this section, not in the report body.
      var srcItem = (ss.source && items.length && /chis/i.test(items[0].sourceType || '')) ? items[0] : null;
      if (srcItem) items = items.slice(1);
      var ssParts = [];
      if (ss.source) ssParts.push(['Source', ss.source]);
      if (ss.subtype) ssParts.push(['Subtype', ss.subtype]);
      if (ss.reference) ssParts.push(['Reference', ss.reference]);
      var ssReporting = srcItem
        ? '<div class="ss-reporting"><span class="ss-k">Source reporting</span>'
          + '<pre class="item-text">' + highlightExtract(srcItem.text, siHighlightOn) + '</pre>'
          + '<span class="ss-grades">' + esc(srcItem.sourceEval) + esc(srcItem.intelEval) + '</span></div>'
        : '';
      var ssSection = (ssParts.length || ssReporting)
        ? '<section class="sensitive-source" role="note" aria-label="Sensitive source — protected, handle with care">'
          + '<div class="ss-label"><span class="ss-mark" aria-hidden="true">▲</span>SENSITIVE SOURCE</div>'
          + '<div class="ss-grid">' + ssParts.map(function (p) { return '<div class="ss-cell"><span class="ss-k">' + esc(p[0]) + '</span><span class="ss-v">' + esc(p[1]) + '</span></div>'; }).join("") + '</div>'
          + ssReporting
          + '</section>'
        : '';
      var auditHTML = (ir.audit || []).slice().reverse().map(function (a) {
        return "<li>" + esc(a.ts) + " · " + esc(a.actor) + " · " + esc(a.action) + (a.detail ? " — " + esc(a.detail) : "") + "</li>";
      }).join("");
      var cond = h.code === "C"
        ? esc(h.actionCode || "—") + " / " + esc(h.sanitisationCode || "—")
        : "n/a (code P)";

      function fmtISOtoDMY(iso){ if(!iso) return ''; var d=new Date(iso); if(isNaN(d.getTime())) return ''; function p(n){return (n<10?'0':'')+n;} return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear(); }
      var irDateIntel = esc(ir.dateOfIntelligence || ir.dateOfCollection || '—');
      var irDateMade  = esc(ir.dateCreated || fmtISOtoDMY(ir.createdAt) || '—');
      var irThreatLine = esc(ir.threatArea || '—') + (ir.threatBand ? ' <span class="ir-band">Band ' + esc(ir.threatBand) + '</span>' : '');
      var irHandLine = (h.code === 'C')
        ? esc(h.code) + ' — ' + esc(h.instructions || 'Lawful sharing permitted with conditions') + ' <span class="ir-sub">(' + cond + ')</span>'
        : esc(h.code || '—') + ' — Lawful sharing permitted';
      function irHdr(k,v){ return '<div class="ir-hcell"><span class="ir-hk">'+esc(k)+'</span><span class="ir-hv">'+v+'</span></div>'; }
      function irSiRow(k,v){ return '<div class="ir-si-row"><span class="ir-si-k">'+esc(k)+'</span><span class="ir-si-v">'+v+'</span></div>'; }
      var _rg = V.reportGrade(ir);
      var irGrade = _rg
        ? '<div class="ir-grade"><span class="ir-grade-k">Report grade</span>'
          + '<button type="button" class="grade-chip" data-grade="'+esc(_rg.sourceEval)+esc(_rg.intelEval)+'" data-handling="'+esc(_rg.handling)+'" data-tip="'+esc(GRADE_TIP)+'" aria-label="Explain the report grade">'+esc(_rg.sourceEval)+esc(_rg.intelEval)+esc(_rg.handling)+'<span class="grade-q">?</span></button>'
          + '</div>'
        : '';
      var _SM = (typeof window!=='undefined' && window.RegistrySourceMeta) ? window.RegistrySourceMeta : null;
      var irItems = items.length
        ? '<table class="ir-items"><thead><tr><th class="c-no">Item</th><th>Report</th><th class="c-src">Source</th><th class="c-si">S</th><th class="c-si">I</th></tr></thead><tbody>'
          + items.map(function(it,i){ var col=_SM?_SM.colour(it.sourceType):'#8d99ae'; var gr=esc(it.sourceEval)+esc(it.intelEval), hd=esc(h.code||'P');
              return '<tr><td class="c-no">'+(i+1)+'</td>'
                + '<td class="c-report"><pre class="item-text" data-hl-item="'+i+'">'+highlightExtract(it.text, siHighlightOn)+'</pre></td>'
                + '<td class="c-src"><button type="button" class="src-chip" data-src="'+esc(it.sourceType)+'" style="--src:'+esc(col)+'" title="What is '+esc(it.sourceType)+'? Show its other checks in this operation">'+esc(it.sourceType)+'</button></td>'
                + '<td class="c-si"><button type="button" class="si-cell" data-grade="'+gr+'" data-handling="'+hd+'" data-rel="'+esc(it.sourceEval)+'" data-tip="Source evaluation '+esc(it.sourceEval)+' — grade '+esc(gr)+', handling '+esc(hd)+'. Click to explain.">'+esc(it.sourceEval)+'</button></td>'
                + '<td class="c-si"><button type="button" class="si-cell" data-grade="'+gr+'" data-handling="'+hd+'" data-assess="'+esc(it.intelEval)+'" data-tip="Intelligence evaluation '+esc(it.intelEval)+' — grade '+esc(gr)+', handling '+esc(hd)+'. Click to explain.">'+esc(it.intelEval)+'</button></td></tr>'; }).join('')
          + '</tbody></table>'
        : '<p class="empty">No items.</p>';
      var irProvTable = '<table class="ir-items ir-prov"><tbody><tr><td class="c-no">P</td><td class="c-report"><pre class="item-text" data-hl-item="P">'+highlightExtract(pvd.text || '—', true)+'</pre></td><td class="c-src">Assessment</td><td class="c-si" data-rel="'+esc(pvd.sourceEval||'')+'">'+esc(pvd.sourceEval||'-')+'</td><td class="c-si" data-assess="'+esc(pvd.intelEval||'')+'">'+esc(pvd.intelEval||'-')+'</td></tr></tbody></table>';
      var backLabel = cameFromResults ? (activeOp ? esc(activeOp) : "All reports") : "Overview";
      els.main.innerHTML =
        '<div class="detail page">' +
        '<div class="detail-head">' +
        '<div class="crumbs">' +
          '<button type="button" class="linklike" id="dt-back">\u2190 Back to ' + backLabel + '</button>' +
          '<span class="sep">/</span>' +
          '<button type="button" class="linklike" id="dt-home">Overview</button>' +
        '</div>' +
        '</div>' +
        '<div class="ir-doc">' +
          '<div class="ir-masthead"><span class="ir-org">NATIONAL CRIME AGENCY</span><span class="ir-doctype">INTELLIGENCE REPORT</span></div>' +
          '<h1 class="ir-title" tabindex="-1">' + esc(ir.title || "(untitled)") + '</h1>' +
          '<div class="ir-hdr">' +
            irHdr('URN', esc(ir.urn)) +
            irHdr('Operation', esc(ir.operation || '—')) +
            irHdr('Date of Intelligence', irDateIntel) +
            irHdr('Date Created', irDateMade) +
            irHdr('Point of Contact', esc(ir.pointOfContact || '—')) +
            irHdr('Status', '<b class="wf-tag" data-status="' + esc(ir.status) + '">' + esc(ir.status) + '</b>') +
          '</div>' +
          '<div class="ir-si"><div class="ir-si-h">Supporting information</div>' +
            irSiRow('Threats', irThreatLine) +
            irSiRow('Handling code', irHandLine) +
            irSiRow('Confidence', confidenceLevel(ir.confidence)) +
          '</div>' +
          (ssSection ? '<div class="ir-sssrc">' + ssSection + '</div>' : '') +
          irGrade +
          '<details class="ir-sec" open><summary>Items (' + items.length + ')</summary>' +
          '<div class="items-head">' +
          '<label class="hl-toggle" title="Bold + colour the entities extracted from this report, by type"><input type="checkbox" id="hl-entities"' + (siHighlightOn ? ' checked' : '') + '> Highlight extracted entities</label>' +
          // Discoverable entry point for the USER highlighter (select text -> mark +
          // save a note). Distinct from the entity-extraction checkbox above. The
          // hint is dismissible and stays dismissed (localStorage).
          (userHlHintDismissed()
            ? ''
            : '<span class="hl-hint" role="note">' +
                '<span class="hl-hint-badge" aria-hidden="true">✎ Highlight &amp; note</span>' +
                '<span class="hl-hint-text">Select any text below to highlight it and save a note.</span>' +
                '<button type="button" class="hl-hint-x" id="hl-hint-dismiss" aria-label="Dismiss this hint">✕</button>' +
              '</span>') +
          '</div>' +
          irItems + '</details>' +
          '<details class="ir-sec" open><summary>Provenance</summary>' +
          irProvTable + '</details>' +
        '<details class="ir-sec ir-sec-chart"><summary>Network chart</summary>' +
        '<div id="si-chart" class="si-chart" role="img" aria-label="Network chart of this report’s entities and links"></div>' +
        '</details>' +
        '<details class="ir-sec"><summary>Structured intelligence</summary><div id="si-panel"></div></details>' +
        '<details class="ir-sec"><summary>Workflow</summary>' +
        '<div class="wf-status">Status: <span class="pill status" data-status="' + esc(ir.status) + '">' + esc(ir.status) + '</span>' +
          (ir.rejectionReason ? ' · <em>rejected:</em> ' + esc(ir.rejectionReason) : '') +
          (ir.suppressionReason ? ' · <em>suppressed:</em> ' + esc(ir.suppressionReason) : '') +
          (ir.pndShareAuthorisedAt ? ' · PND authorised ' + esc(String(ir.pndShareAuthorisedAt).slice(0,16).replace("T"," ")) : '') + '</div>' +
        '<div class="toolbar" id="wf-bar"></div>' +
        '<div id="pnd-review"></div>' +
        '</details>' +
        '<details class="ir-sec"><summary>Handoff to SOLAR</summary>' +
        '<div class="toolbar">' +
          '<button type="button" class="btn secondary" id="hx-contract">Export contract</button>' +
          '<button type="button" class="btn secondary" id="hx-solar">Export SOLAR case</button>' +
          '<button type="button" class="btn" id="hx-open">Open full chart in SOLAR</button>' +
        '</div>' +
        '</details>' +
        '</div>' +
        '<aside id="overlap-panel" class="overlap-rail" aria-label="Reports sharing entities with this one"></aside>' +
        '<div id="ir-drawer" class="ir-drawer" hidden><div class="ir-drawer-scrim" id="ir-drawer-scrim"></div><div class="ir-drawer-panel" role="dialog" aria-label="Explanation"><button type="button" class="ir-drawer-x" id="ir-drawer-x" aria-label="Close">✕</button><div id="ir-drawer-body"></div></div></div>' +
        '</div>';

      var _bk = document.getElementById("dt-back");
      if (_bk) _bk.addEventListener("click", function () { if (cameFromResults) showResults(); else showHome(); });
      var _hm = document.getElementById("dt-home");
      if (_hm) _hm.addEventListener("click", function () { showHome(); });
      lastDetailUrn = ir.urn;
      markActiveReport();
      // Analyst highlighter: select text in a report body -> marker highlight +
      // saved note. Attaches to this report's item-text blocks and restores any
      // saved highlights for this URN. Self-contained (window.RegistryHighlighter);
      // no-op if the module isn't present.
      if (window.RegistryHighlighter && window.RegistryHighlighter.attach) {
        try { window.RegistryHighlighter.attach(els.main, ir.urn); } catch (e) { /* never break the report view */ }
      }
      var _hlHintX = document.getElementById("hl-hint-dismiss");
      if (_hlHintX) _hlHintX.addEventListener("click", function () {
        dismissUserHlHint();
        var host = _hlHintX.closest(".hl-hint");
        if (host && host.parentNode) host.parentNode.removeChild(host);
      });
      [].forEach.call(els.main.querySelectorAll('.src-chip'), function(c){ c.addEventListener('click', function(){ openSourceDrawer(c.getAttribute('data-src')); }); });
      [].forEach.call(els.main.querySelectorAll('[data-grade]'), function(g){ g.addEventListener('click', function(){ openIrDrawer(explainGrade(g.getAttribute('data-grade'), g.getAttribute('data-handling'))); }); });
      var _dx=document.getElementById('ir-drawer-x'); if(_dx) _dx.addEventListener('click', closeIrDrawer);
      var _ds=document.getElementById('ir-drawer-scrim'); if(_ds) _ds.addEventListener('click', closeIrDrawer);
      focusView();
      var _hlcb = document.getElementById("hl-entities");
      els.main.classList.toggle("hl-off", !siHighlightOn);
      if (_hlcb) _hlcb.addEventListener("change", function () {
        siHighlightOn = _hlcb.checked;
        try { localStorage.setItem("reg_hl_entities", siHighlightOn ? "1" : "0"); } catch (e) {}
        els.main.classList.toggle("hl-off", !siHighlightOn);
      });
      if (!els.main._siWired) {
        els.main._siWired = true;
        els.main.addEventListener("click", function (ev) {
          var t = ev.target;
          var hl = t.closest && t.closest(".si-hl");
          if (hl) { siFlash(siFindByEid(".si-ent-row", hl.getAttribute("data-eid"))); return; }
          var row = t.closest && t.closest(".si-ent-row");
          if (row && !(t.closest && t.closest("button"))) siFlash(siFindByEid(".si-hl", row.getAttribute("data-eid")));
        });
      }
      renderWfBar(ir);
      renderSI(ir);
      _selIr = ir; wireSelIntel(els.main);
      renderMiniChart(ir);
      var _cs = els.main.querySelector('.ir-sec-chart');
      if (_cs) _cs.addEventListener('toggle', function(){ if (_cs.open) setTimeout(function(){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} }, 30); });
      renderOverlaps(ir);
      document.getElementById("hx-contract").addEventListener("click", function () {
        download(ir.urn + ".system.ir.v1.json", JSON.stringify(H.toHandoff(ir), null, 2));
        setStatus("Exported contract for " + ir.urn + ".", "ok");
      });
      document.getElementById("hx-solar").addEventListener("click", function () {
        download(ir.urn + ".chartroom.json", JSON.stringify(H.toSolarCase(ir), null, 2));
        setStatus("Exported SOLAR case for " + ir.urn + ". Open it in SOLAR Charting (Enter \u2192 Charting) to chart it.", "ok");
      });
      document.getElementById("hx-open").addEventListener("click", function () {
        try {
          window.localStorage.setItem("solar_pending_case", JSON.stringify(H.toSolarCase(ir)));
        } catch (e) {
          setStatus("Could not stash the case for SOLAR \u2014 use Export SOLAR case instead.", "err");
          return;
        }
        window.location.href = "../index.html";
      });
    });
  }

  // NOTE: returns RAW text — callers MUST wrap in esc() before inserting into HTML.
  function entLabel(e){ return e.label + " [" + (SI.ENTITY_TYPES[e.type] ? SI.ENTITY_TYPES[e.type].label : e.type) + "]"; }

  function persistSI(ir) {
    var res = SI.validateSI(ir);
    M.addAudit(ir, "user", "si-updated", "structured intelligence edited");
    repo.save(ir).then(function () {
      setStatus(res.valid ? "Structured intelligence saved." : ("Saved with issue: " + res.errors[0].message), res.valid ? "ok" : "err");
      return refreshList();
    }).then(function () { renderSI(ir); });
  }

  function computeMaster(ir) {
    repo.list().then(function (rows) {
      var all = [];
      rows.forEach(function (r) {
        var ents = (r.structuredIntelligence && r.structuredIntelligence.entities) || [];
        ents.forEach(function (e) { all.push(e); });
      });
      var masters = MX.buildMasterIndex(all);
      var byMember = {};
      masters.forEach(function (m) { m.members.forEach(function (id) { byMember[id] = m; }); });
      var out = document.getElementById("si-master-out");
      var mine = (ir.structuredIntelligence && ir.structuredIntelligence.entities) || [];
      if (!mine.length) { out.innerHTML = '<p class="empty">Add entities to see Master/Lower aggregation.</p>'; return; }
      out.innerHTML = '<h3>Master/Lower preview</h3><ul class="si-list">' + mine.map(function (e) {
        var m = byMember[e.id]; var n = m ? m.memberCount : 1;
        var by = (m && m.matchedBy.length) ? (' · matched by ' + esc(m.matchedBy.join(", "))) : '';
        return '<li><span>' + esc(e.label) + ' → Master of ' + n + ' Lower' + (n === 1 ? '' : 's') + ' across reports' + by + '</span></li>';
      }).join('') + '</ul>';
    });
  }

  /* ---- cross-report overlap: "also appears in" (deconfliction) ---- */
  function computeOverlaps(ir) {
    var mine = (ir.structuredIntelligence && ir.structuredIntelligence.entities) || [];
    if (!mine.length) return Promise.resolve([]);
    return allRows().then(function (rows) {
      var idx = {};                       // "type|sig" -> [{urn,title,op}]
      rows.forEach(function (r) {
        if (r.urn === ir.urn) return;
        ((r.structuredIntelligence && r.structuredIntelligence.entities) || []).forEach(function (e) {
          MX.signatures(e).forEach(function (sg) { var k = e.type + "|" + sg.sig; (idx[k] = idx[k] || []).push({ urn: r.urn, title: r.title, op: r.operation }); });
        });
      });
      var byReport = {};                  // urn -> {urn,title,op, shared:{label:{rules:{}}}}
      mine.forEach(function (me) {
        MX.signatures(me).forEach(function (sg) {
          (idx[me.type + "|" + sg.sig] || []).forEach(function (hit) {
            var b = byReport[hit.urn] || (byReport[hit.urn] = { urn: hit.urn, title: hit.title, op: hit.op, shared: {} });
            var sh = b.shared[me.label] || (b.shared[me.label] = { rules: {} });
            sh.rules[sg.rule] = true;
          });
        });
      });
      return Object.keys(byReport).map(function (u) {
        var b = byReport[u];
        var shared = Object.keys(b.shared).map(function (l) { return { label: l, rules: Object.keys(b.shared[l].rules) }; });
        return { urn: b.urn, title: b.title, op: b.op, shared: shared };
      }).sort(function (a, b) { return b.shared.length - a.shared.length; });
    });
  }
  // ---- Compare: read-only report body reused across side-by-side panes ----
  function buildReportReadHTML(ir) {
    var h = ir.handling || {}, ss = ir.sensitiveSource || {};
    var pvd = M.coerceProvenance(ir.provenance);
    var pvGrade = (G.isSourceEval(pvd.sourceEval) && G.isAssessment(pvd.intelEval)) ? V.itemGrade(ir, pvd) : "[ - ]";
    var items = (ir.items || []).filter(function (i) { return !i.isProvenance; });
    function metaCell(label, value) { return '<div class="meta-cell"><span class="meta-k">' + esc(label) + '</span><span class="meta-v">' + value + '</span></div>'; }
    var itemsHTML = items.map(function (it, i) {
      var grade = V.itemGrade(ir, it);
      return '<div class="item-block"><div class="ib-head"><strong>Item ' + (i + 1) + '</strong>' +
        '<span class="ib-src">' + esc(it.sourceType) + '</span>' +
        '<span class="grade"' + relAttr(grade) + '>' + esc(grade) + '</span></div>' +
        '<pre class="item-text">' + highlightExtract(it.text, true) + '</pre></div>';
    }).join("");
    var ssParts = [];
    if (ss.source) ssParts.push(['Source', ss.source]);
    if (ss.subtype) ssParts.push(['Subtype', ss.subtype]);
    if (ss.reference) ssParts.push(['Reference', ss.reference]);
    var ssBody = ssParts.length
      ? '<div class="ss-grid">' + ssParts.map(function (p) { return '<div class="ss-cell"><span class="ss-k">' + esc(p[0]) + '</span><span class="ss-v">' + esc(p[1]) + '</span></div>'; }).join("") + '</div>'
      : '<p class="ss-none">None recorded.</p>';
    return '<div class="detail-facts">' +
        '<span class="fact"><span class="grade">' + esc(ir.urn) + '</span></span>' +
        (ir.operation ? '<span class="fact"><b>' + esc(ir.operation) + '</b></span>' : '') +
        '<span class="fact"><span class="pill mk-' + esc(ir.protectiveMarking) + '">' + esc(ir.protectiveMarking) + '</span></span>' +
        '<span class="fact">Status <b class="wf-tag" data-status="' + esc(ir.status) + '">' + esc(ir.status) + '</b></span>' +
      '</div>' +
      '<div class="meta-grid">' +
        metaCell('Date of collection', esc(ir.dateOfCollection)) +
        metaCell('Threat area', esc(ir.threatArea)) +
        metaCell('Confidence', confidenceLevel(ir.confidence)) +
        metaCell('Handling code', esc(h.code)) +
      '</div>' +
      '<section class="sensitive-source" role="note" aria-label="Sensitive source"><div class="ss-label"><span class="ss-mark" aria-hidden="true">\u25b2</span>SENSITIVE SOURCE</div>' + ssBody + '</section>' +
      '<div class="items-head"><h2>Items (' + items.length + ')</h2></div>' +
      (itemsHTML ? '<div class="items-grid">' + itemsHTML + '</div>' : '<p class="empty">No items.</p>') +
      '<h2>Provenance</h2>' +
      '<div class="item-block"><div class="ib-head"><strong>Provenance</strong><span class="grade"' + relAttr(pvGrade) + '>' + esc(pvGrade) + '</span></div><pre class="item-text">' + highlightExtract(pvd.text || "\u2014", true) + '</pre></div>';
  }

  function showCompare(urns) {
    urns = (urns || []).filter(Boolean).filter(function (u, i, a) { return a.indexOf(u) === i; }).slice(0, 3);
    compareUrns = urns;
    if (!urns.length) { showHome(); return; }
    view = "compare";
    Promise.all(urns.map(function (u) { return repo.get(u); })).then(function (irs) {
      irs = irs.filter(Boolean);
      compareUrns = irs.map(function (r) { return r.urn; });
      var n = irs.length;
      setBanner(highestMarking(irs.map(function (r) { return r.protectiveMarking; })));
      var panes = irs.map(function (ir) {
        return '<section class="compare-pane" data-urn="' + esc(ir.urn) + '" style="--ta:' + esc(T.colour(ir.threatArea)) + '">' +
          '<header class="cp-head"><div class="cp-title">' +
            '<span class="cp-op">' + esc(ir.operation || "") + '</span> <span class="cp-urn">' + esc(ir.urn) + '</span>' +
            '<button type="button" class="cp-open linklike" data-urn="' + esc(ir.urn) + '" title="Open full report">open \u2197</button>' +
            (n > 1 ? '<button type="button" class="cp-close" data-urn="' + esc(ir.urn) + '" title="Remove from comparison" aria-label="Remove report">\u00d7</button>' : '') +
          '</div><h2 class="cp-h">' + esc(ir.title || "(untitled)") + '</h2></header>' +
          '<div class="cp-body">' + buildReportReadHTML(ir) + '</div>' +
        '</section>';
      }).join("");
      var addCtl = n < 3 ? '<div class="compare-add"><label>Add a report to compare <select id="cmp-add"><option value="">\u2014 choose \u2014</option></select></label></div>' : '';
      els.main.innerHTML = '<div class="detail page compare">' +
        '<div class="detail-head"><div class="crumbs">' +
          '<button type="button" class="linklike" id="cmp-back">\u2190 Back</button>' +
          '<span class="sep">/</span><span>Compare</span>' +
        '</div><h1 tabindex="-1">Comparing ' + n + ' report' + (n === 1 ? '' : 's') + '</h1></div>' +
        '<div class="compare-wrap cols-' + n + '">' + panes + '</div>' + addCtl +
        '</div>';
      focusView();
      if (n < 3) {
        allRows().then(function (all) {
          var sel = document.getElementById("cmp-add"); if (!sel) return;
          all.filter(function (r) { return compareUrns.indexOf(r.urn) === -1; })
             .sort(function (a, b) { return (a.operation || "").localeCompare(b.operation || "") || String(a.urn).localeCompare(String(b.urn)); })
             .forEach(function (r) { var o = document.createElement("option"); o.value = r.urn; o.textContent = (r.operation ? r.operation + " \u00b7 " : "") + r.urn + " \u2014 " + (r.title || ""); sel.appendChild(o); });
          sel.addEventListener("change", function () { if (sel.value) showCompare(compareUrns.concat([sel.value])); });
        });
      }
      Array.prototype.forEach.call(els.main.querySelectorAll(".cp-close"), function (b) {
        b.addEventListener("click", function () {
          var rest = compareUrns.filter(function (u) { return u !== b.getAttribute("data-urn"); });
          if (rest.length <= 1) showDetail(rest[0] || b.getAttribute("data-urn")); else showCompare(rest);
        });
      });
      Array.prototype.forEach.call(els.main.querySelectorAll(".cp-open"), function (b) {
        b.addEventListener("click", function () { showDetail(b.getAttribute("data-urn")); });
      });
      var bk = document.getElementById("cmp-back");
      if (bk) bk.addEventListener("click", function () { if (compareUrns[0]) showDetail(compareUrns[0]); else showHome(); });
    });
  }

  function renderOverlaps(ir) {
    var panel = document.getElementById("overlap-panel"); if (!panel) return;
    panel.innerHTML = '<h3>Also appears in</h3><p class="ov-none">Checking the database\u2026</p>';
    computeOverlaps(ir).then(function (list) {
      if (!list.length) { panel.innerHTML = '<h3>Also appears in</h3><p class="ov-none">No other report shares these entities.</p>'; return; }
      var html = '<h3>Also appears in (' + list.length + ')</h3>';
      list.forEach(function (o) {
        var labels = o.shared.map(function (x) { return x.label; }).join(", ");
        var rules = {}; o.shared.forEach(function (x) { x.rules.forEach(function (r) { rules[r] = true; }); });
        html += '<div class="ov-report" title="Matched on: ' + esc(Object.keys(rules).join(", ")) + '">' +
          '<button type="button" class="ov-open" data-urn="' + esc(o.urn) + '">' +
          '<span class="ov-op">' + esc(o.op || "\u2014") + '</span> <span class="ov-urn">' + esc(o.urn) + '</span>' +
          '<span class="ov-shared">shares: ' + esc(labels) + '</span></button>' +
          '<button type="button" class="ov-compare" data-urn="' + esc(o.urn) + '" title="Compare side by side">⇔ Compare</button></div>';
      });
      panel.innerHTML = html;
      Array.prototype.forEach.call(panel.querySelectorAll(".ov-open"), function (b) {
        b.addEventListener("click", function () { showDetail(b.getAttribute("data-urn")); });
      });
      Array.prototype.forEach.call(panel.querySelectorAll(".ov-compare"), function (b) {
        b.addEventListener("click", function () { showCompare([ir.urn, b.getAttribute("data-urn")]); });
      });
    }, function () { panel.innerHTML = ''; });
  }

  function reportBodyText(ir){ return (ir.items||[]).filter(function(i){return !i.isProvenance;}).map(function(it){return it.text||'';}).join('\n'); }
  function generateSIFromText(ir){
    if(!(window.CRExtract && window.CRExtract.extract && window.RegistrySIExtract)) return null;
    var body=reportBodyText(ir); if(!body.trim()) return null;
    var res; try{ res=window.CRExtract.extract(body,{dateFormat:'DMY'}); }catch(e){ return null; }
    try{ return window.RegistrySIExtract.fromExtraction(res,{actor:'engine'}); }catch(e){ return null; }
  }
  function mergeGeneratedSI(ir, gen){
    var S=ir.structuredIntelligence||(ir.structuredIntelligence={entities:[],links:[]});
    var seen={}; S.entities.forEach(function(e){ seen[e.type+'|'+String(e.label).toLowerCase()]=e.id; });
    var idmap={};
    gen.entities.forEach(function(e){ var k=e.type+'|'+String(e.label).toLowerCase(); if(seen[k]){ idmap[e.id]=seen[k]; } else { S.entities.push(e); seen[k]=e.id; idmap[e.id]=e.id; } });
    var lseen={}; S.links.forEach(function(l){ lseen[l.from+'|'+l.to+'|'+l.type]=1; });
    gen.links.forEach(function(l){ var from=idmap[l.from]||l.from, to=idmap[l.to]||l.to; if(from===to) return; var k=from+'|'+to+'|'+l.type; if(lseen[k]) return; l.from=from; l.to=to; S.links.push(l); lseen[k]=1; });
    return S;
  }
  /* ---- select report text → add as structured intelligence + link ---- */
  var _selIr = null;
  function hideSelIntel(){ var p=document.getElementById('sel-intel'); if(p) p.hidden=true; }
  function showSelIntel(text, rect) {
    var ir = _selIr; if (!ir) return;
    if (ir.status === 'AUTHORISED' || ir.status === 'SUPPRESSED') return;   // read-only
    var pop = document.getElementById('sel-intel');
    if (!pop) { pop = document.createElement('div'); pop.id = 'sel-intel'; pop.className = 'sel-intel'; document.body.appendChild(pop); }
    var S = ir.structuredIntelligence || { entities: [], links: [] };
    var typeOpts = alphaPinOther(Object.keys(SI.ENTITY_TYPES), function (k) { return SI.ENTITY_TYPES[k].label; })
      .map(function (k) { return '<option value="' + k + '">' + esc(SI.ENTITY_TYPES[k].label) + '</option>'; }).join('');
    var entOpts = S.entities.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.label) + '</option>'; }).join('');
    var linkOpts = alphaPinOther(Object.keys(SI.LINK_TYPES), function (k) { return SI.LINK_TYPES[k]; })
      .map(function (k) { return '<option value="' + k + '">' + esc(SI.LINK_TYPES[k]) + '</option>'; }).join('');
    pop.innerHTML =
      '<div class="si-pop-h">▲ Add to structured intelligence</div>' +
      '<input class="si-pop-label" type="text" aria-label="label">' +
      '<select class="si-pop-type" aria-label="entity type">' + typeOpts + '</select>' +
      (S.entities.length ? '<div class="si-pop-link"><select class="si-pop-lt" aria-label="link type">' + linkOpts + '</select>'
        + '<select class="si-pop-to" aria-label="link to entity"><option value="">— no link —</option>' + entOpts + '</select></div>' : '') +
      '<div class="si-pop-actions"><button type="button" class="btn secondary si-pop-add">Add intel</button>'
        + '<button type="button" class="btn si-pop-x">Cancel</button></div>';
    pop.hidden = false;
    pop.querySelector('.si-pop-label').value = text;
    var px = Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 290);
    pop.style.left = Math.max(8, px) + 'px';
    pop.style.top = (rect.bottom + window.scrollY + 7) + 'px';
    // default the type to the entity kind if the selection was already an extracted mark
    pop.querySelector('.si-pop-add').addEventListener('click', function () {
      var label = pop.querySelector('.si-pop-label').value.trim();
      if (!label) { setStatus('Give the intel a label.', 'err'); return; }
      var type = pop.querySelector('.si-pop-type').value;
      var ent = SI.addEntity(ir, { type: type, label: label });
      var toSel = pop.querySelector('.si-pop-to');
      if (toSel && toSel.value) SI.addLink(ir, { from: ent.id, to: toSel.value, type: pop.querySelector('.si-pop-lt').value });
      M.addAudit(ir, currentUser(), 'si-select', 'added "' + label + '" (' + type + ') from selected report text' + (toSel && toSel.value ? ' + link' : ''));
      persistSI(ir); renderMiniChart(ir);
      setStatus('Added "' + label + '" to structured intelligence' + (toSel && toSel.value ? ' and linked it.' : '.'), 'ok');
      hideSelIntel();
      var s = window.getSelection(); if (s) s.removeAllRanges();
    });
    pop.querySelector('.si-pop-x').addEventListener('click', function () { hideSelIntel(); var s = window.getSelection(); if (s) s.removeAllRanges(); });
  }
  function wireSelIntel(root) {
    if (root._selWired) return;
    root._selWired = true;
    root.addEventListener('mouseup', function (ev) {
      if (ev.target.closest && ev.target.closest('.sel-intel')) return;
      setTimeout(function () {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        var txt = sel.toString().trim();
        if (txt.length < 2 || txt.length > 120) return;
        var a = sel.anchorNode, el = a && (a.nodeType === 3 ? a.parentElement : a);
        if (!el || !(el.closest && el.closest('.item-text'))) return;
        showSelIntel(txt, sel.getRangeAt(0).getBoundingClientRect());
      }, 0);
    });
    document.addEventListener('mousedown', function (ev) {
      if (!(ev.target.closest && ev.target.closest('.sel-intel'))) hideSelIntel();
    });
  }

  var _siAutoTried = {};
  function renderSI(ir) {
    var panel = document.getElementById("si-panel"); if (!panel) return;
    if (!ir.structuredIntelligence) ir.structuredIntelligence = { entities: [], links: [] };
    var ro = (ir.status === "AUTHORISED" || ir.status === "SUPPRESSED");
    var S = ir.structuredIntelligence;
    if(!_siAutoTried[ir.urn] && ir.status==='DRAFT' && S.entities.length===0){
      _siAutoTried[ir.urn]=1;
      var _gen=generateSIFromText(ir);
      if(_gen && _gen.entities.length){ mergeGeneratedSI(ir,_gen); M.addAudit(ir,'engine','si-auto','auto-extracted '+_gen.entities.length+' entities from report text'); repo.save(ir); }
    }
    var byId = {}; S.entities.forEach(function (e) { byId[e.id] = e; });
    var entTypeOpts = alphaPinOther(Object.keys(SI.ENTITY_TYPES), function (k) { return SI.ENTITY_TYPES[k].label; }).map(function (k) { return opt(k, SI.ENTITY_TYPES[k].label, "person"); }).join("");
    var roleOpts = ['<option value="">— role —</option>'].concat(alphaPinOther(Object.keys(SI.ROLES), function (k) { return SI.ROLES[k]; }).map(function (k) { return opt(k, SI.ROLES[k]); })).join("");
    var pndOpts = SI.PND_SHARE.map(function (x) { return opt(x, x, "Unknown"); }).join("");
    var linkTypeOpts = alphaPinOther(Object.keys(SI.LINK_TYPES), function (k) { return SI.LINK_TYPES[k]; }).map(function (k) { return opt(k, SI.LINK_TYPES[k]); }).join("");
    var entOpts = ['<option value="">— entity —</option>'].concat(S.entities.map(function (e) { return opt(e.id, entLabel(e)); })).join("");

    var entList = S.entities.length ? '<ul class="si-list">' + S.entities.map(function (e) {
        return '<li data-eid="' + esc(e.id) + '" class="si-ent-row" title="Click to locate in the report text"><span>' + esc(entLabel(e)) + (e.role ? ' · ' + esc(SI.ROLES[e.role] || e.role) : '') + ' · PND:' + esc(e.pndShare) + (e.isAlias ? ' · <em>alias</em>' : '') + '</span>' +
          (e.type==="person" ? '<button type="button" class="btn secondary dos-open" data-person="' + esc(e.id) + '">Dossier \u2192</button>' : '') +
          (ro ? '' : '<button type="button" class="btn danger" data-del-ent="' + esc(e.id) + '" aria-label="Delete entity">×</button>') + '</li>';
      }).join('') + '</ul>' : '<p class="empty">No entities yet.</p>';
    var linkList = S.links.length ? '<ul class="si-list">' + S.links.map(function (l) {
        var f = byId[l.from], t = byId[l.to];
        return '<li><span>' + esc(f ? f.label : l.from) + ' —' + esc(SI.LINK_TYPES[l.type] || l.type) + '→ ' + esc(t ? t.label : l.to) + ' · PND:' + esc(l.pndShare) + '</span>' +
          (ro ? '' : '<button type="button" class="btn danger" data-del-lnk="' + esc(l.id) + '" aria-label="Delete link">×</button>') + '</li>';
      }).join('') + '</ul>' : '<p class="empty">No links yet.</p>';

    panel.innerHTML =
      (ro ? '<p class="provenance-note">This report is ' + esc(ir.status) + ' — structured intelligence is read-only.</p>' : '') +
      '<div class="si-cols">' +
        '<div><h3>Entities</h3>' + entList + (ro ? '' :
          '<div class="si-add">' +
            '<label class="visually-hidden" for="si-ent-type">Entity type</label><select id="si-ent-type">' + entTypeOpts + '</select>' +
            '<label class="visually-hidden" for="si-ent-label">Entity label</label><input id="si-ent-label" type="text" placeholder="label e.g. John SMITH">' +
            '<label class="visually-hidden" for="si-ent-dob">Date of birth</label><input id="si-ent-dob" type="text" placeholder="DoB DD/MM/YYYY">' +
            '<label class="visually-hidden" for="si-ent-role">Role</label><select id="si-ent-role">' + roleOpts + '</select>' +
            '<label class="visually-hidden" for="si-ent-pnd">PND share</label><select id="si-ent-pnd">' + pndOpts + '</select>' +
            '<label class="si-inline"><input type="checkbox" id="si-ent-alias"> alias</label>' +
            '<button type="button" class="btn secondary" id="si-add-ent">Add entity</button>' +
          '</div>') +
        '</div>' +
        '<div><h3>Links</h3>' + linkList + (ro ? '' :
          '<div class="si-add">' +
            '<label class="visually-hidden" for="si-lnk-from">Link from</label><select id="si-lnk-from">' + entOpts + '</select>' +
            '<label class="visually-hidden" for="si-lnk-type">Link type</label><select id="si-lnk-type">' + linkTypeOpts + '</select>' +
            '<label class="visually-hidden" for="si-lnk-to">Link to</label><select id="si-lnk-to">' + entOpts + '</select>' +
            '<label class="visually-hidden" for="si-lnk-pnd">PND share</label><select id="si-lnk-pnd">' + pndOpts + '</select>' +
            '<button type="button" class="btn secondary" id="si-add-lnk">Add link</button>' +
          '</div>') +
        '</div>' +
      '</div>' +
      '<div class="si-add">' + (ro ? '' : '<button type="button" class="btn" id="si-extract" title="Run the same extraction engine as the chart on this report\u2019s text">Extract entities from report text</button> ') + '<button type="button" class="btn" id="si-master">Compute Master/Lower preview (all reports)</button></div>' +
      '<div id="si-master-out"></div>';

    if (!ro) {
    document.getElementById("si-add-ent").addEventListener("click", function () {
      var e = { type: document.getElementById("si-ent-type").value,
        label: document.getElementById("si-ent-label").value.trim(),
        role: document.getElementById("si-ent-role").value || null,
        pndShare: document.getElementById("si-ent-pnd").value,
        isAlias: document.getElementById("si-ent-alias").checked, attrs: {} };
      var dob = document.getElementById("si-ent-dob").value.trim(); if (dob) e.attrs.dob = dob;
      if (!e.label) { setStatus("Entity label required.", "err"); return; }
      SI.addEntity(ir, e); persistSI(ir);
    });
    document.getElementById("si-add-lnk").addEventListener("click", function () {
      var from = document.getElementById("si-lnk-from").value, to = document.getElementById("si-lnk-to").value;
      if (!from || !to || from === to) { setStatus("Pick two different entities to link.", "err"); return; }
      SI.addLink(ir, { from: from, to: to, type: document.getElementById("si-lnk-type").value, pndShare: document.getElementById("si-lnk-pnd").value });
      persistSI(ir);
    });
    panel.querySelectorAll("[data-del-ent]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-del-ent");
        repo.list().then(function (rows) {
          var imp = D.deletionImpact(ir, rows, "entity", id);
          var msg = imp.action === "detach"
            ? "This entity also appears on other report(s): " + imp.elsewhere.join(", ") + ".\nIt will be DETACHED from this report (kept on the others)."
            : "This entity exists only on this report and will be DELETED.";
          if (imp.cascadeLinks.length) msg += "\n" + imp.cascadeLinks.length + " link(s) on this report will also be removed.";
          if (!window.confirm(msg + "\n\nContinue?")) return;
          D.applyDeletion(ir, "entity", id); persistSI(ir);
        });
      });
    });
    panel.querySelectorAll("[data-del-lnk]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-del-lnk");
        if (!window.confirm("Delete this link from the report?")) return;
        D.applyDeletion(ir, "link", id); persistSI(ir);
      });
    });
    }
    document.getElementById("si-master").addEventListener("click", function () { computeMaster(ir); });
    [].forEach.call(panel.querySelectorAll('.dos-open'), function(b){ b.addEventListener('click', function(ev){ ev.stopPropagation(); var pid=b.getAttribute('data-person'); var pe=(ir.structuredIntelligence.entities||[]).filter(function(x){return x.id===pid;})[0]; requireAccess({action:'View nominal record', target: pe?pe.label:''}, function(){ showPerson(pid); }); }); });
    var _siEx=document.getElementById('si-extract');
    if(_siEx) _siEx.addEventListener('click', function(){
      var gen=generateSIFromText(ir);
      if(!gen){ setStatus('Extraction engine unavailable or report has no text.','err'); return; }
      var before=(ir.structuredIntelligence.entities||[]).length;
      mergeGeneratedSI(ir,gen);
      var added=(ir.structuredIntelligence.entities.length)-before;
      M.addAudit(ir,'user','si-extract','engine extracted '+gen.entities.length+' entities ('+added+' new)');
      persistSI(ir); renderMiniChart(ir);
      setStatus('Extracted '+gen.entities.length+' entities ('+added+' new) from the report text.','ok');
    });
  }

  // Inline read-only network of THIS report's entities + links, rendered with
  // SOLAR's vendored vis-network. Feature-detects window.vis so Node/jsdom (where
  // the lib is absent) never throws — it just leaves the container empty/with a note.
  function renderMiniChart(ir) {
    var box = document.getElementById("si-chart");
    if (!box) return;
    // dispose any previous instance (re-render on workflow/SI changes)
    if (miniNetwork) { try { miniNetwork.destroy(); } catch (e) { /* noop */ } miniNetwork = null; }
    box.innerHTML = "";
    var S = (ir && ir.structuredIntelligence) || { entities: [], links: [] };
    var ents = S.entities || [], links = S.links || [];
    if (!ents.length) {
      box.classList.add("is-empty");
      box.removeAttribute("role");
      box.innerHTML = '<p class="empty si-chart-none">No structured intelligence to chart.</p>';
      return;
    }
    box.classList.remove("is-empty");
    box.setAttribute("role", "img");
    // Graph library only exists in the browser — skip cleanly if missing.
    if (typeof window === "undefined" || !window.vis || !window.vis.Network) {
      box.innerHTML = '<p class="empty si-chart-none">Chart unavailable (graph library not loaded).</p>';
      return;
    }
    var reduce = prefersReducedMotion();
    var byId = {}; ents.forEach(function (e) { byId[e.id] = e; });
    var visNodes = ents.map(function (e) {
      var c = siColour(e.type);
      var lbl = (e.label || "") + (e.isAlias ? " (alias)" : "");
      var typeLabel = (SI.ENTITY_TYPES[e.type] && SI.ENTITY_TYPES[e.type].label) || e.type;
      var roleLabel = e.role ? (SI.ROLES[e.role] || e.role) : "";
      var node = {
        id: e.id,
        label: lbl,
        title: typeLabel + (roleLabel ? " · " + roleLabel : ""),
        font: { color: "#c9d4e0", size: 12, face: "Inter, Segoe UI, sans-serif", strokeWidth: 0 }
      };
      // Same typed SVG glyph icons as the workbench chart (CRIcons); fall back to
      // a coloured dot only if icons.js is unavailable.
      var ico = window.CRIcons && window.CRIcons.get(siGlyph(e.type), c);
      if (ico) {
        node.shape = "image";
        node.image = { unselected: ico.unselected, selected: ico.selected };
        node.size = e.type === "person" ? 20 : 16;
      } else {
        node.shape = "dot";
        node.size = e.type === "person" ? 16 : 13;
        node.color = { background: "#131c28", border: c, highlight: { background: "#1d2a3a", border: c } };
        node.shadow = { enabled: !reduce, color: siGlow(c, 0.42), size: 14, x: 0, y: 0 };
      }
      return node;
    });
    // only links whose endpoints are present on this report
    var visEdges = links.filter(function (l) { return byId[l.from] && byId[l.to]; }).map(function (l) {
      return {
        id: l.id,
        from: l.from,
        to: l.to,
        label: SI.LINK_TYPES[l.type] || l.type,
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        color: { color: "#3d4d61", highlight: "#6f7fe0", hover: "#9bb1c9" },
        font: { color: "#7d8a99", size: 9, face: "Geist Mono, Consolas, monospace", strokeWidth: 4, strokeColor: "#0b1017", align: "middle" },
        smooth: { enabled: !reduce, type: "dynamic" }
      };
    });
    try {
      var data = { nodes: new window.vis.DataSet(visNodes), edges: new window.vis.DataSet(visEdges) };
      var opts = {
        autoResize: true,
        interaction: { hover: true, dragNodes: true, dragView: true, zoomView: true,
          selectable: true, tooltipDelay: 220, navigationButtons: false, keyboard: false },
        // read-only: vis-network has no built-in editing unless manipulation is on
        manipulation: { enabled: false },
        physics: {
          enabled: !reduce,
          solver: "barnesHut",
          barnesHut: { gravitationalConstant: -5200, springLength: 130, springConstant: 0.03, damping: 0.4, avoidOverlap: 0.5 },
          stabilization: { enabled: true, iterations: reduce ? 0 : 140, fit: true }
        },
        nodes: { borderWidth: 2 },
        edges: { selectionWidth: 1 }
      };
      miniNetwork = new window.vis.Network(box, data, opts);
      miniNetwork.on("selectNode", function (params) {   // click a node -> locate it in the list + text
        if (params && params.nodes && params.nodes.length) {
          var id = params.nodes[0];
          siFlash(siFindByEid(".si-ent-row", id));
          siFlash(siFindByEid(".si-hl", id));
        }
      });
      // once settled, freeze physics so the chart sits still (no perpetual motion)
      miniNetwork.once("stabilized", function () {
        try { miniNetwork.setOptions({ physics: { enabled: false } }); miniNetwork.fit({ animation: false }); } catch (e) { /* noop */ }
      });
      // reduced-motion or tiny graphs may not emit "stabilized" — fit shortly after
      setTimeout(function () { if (miniNetwork) { try { miniNetwork.fit({ animation: false }); if (reduce) miniNetwork.setOptions({ physics: { enabled: false } }); } catch (e) { /* noop */ } } }, reduce ? 0 : 600);
    } catch (e) {
      box.innerHTML = '<p class="empty si-chart-none">Chart could not be rendered.</p>';
    }
  }

  function wfPersist(ir, msg) {
    repo.save(ir).then(function () { if (msg) setStatus(msg, "ok"); return refreshList(); }).then(function () { showDetail(ir.urn); });
  }
  function deleteReport(ir) {
    if (!window.confirm("Delete report " + ir.urn + "? This cannot be undone.")) return;
    repo.remove(ir.urn).then(function () { setStatus("Deleted " + ir.urn + ".", "ok"); return refreshList(); }).then(showWelcome);
  }
  function renderWfBar(ir) {
    var bar = document.getElementById("wf-bar"); if (!bar) return;
    var s = ir.status, out = [];
    function b(id, label, cls) { return '<button type="button" class="btn ' + (cls || "") + '" id="' + id + '">' + esc(label) + '</button>'; }
    if (s === "DRAFT") out.push(b("wf-edit","Edit","secondary"), b("wf-submit","Submit for authorisation"), b("wf-suppress","Suppress","danger"), b("wf-delete","Delete report","danger"));
    else if (s === "PENDING_AUTH") out.push(b("wf-review","Review PND & authorise"), b("wf-reject","Reject","danger"), b("wf-suppress","Suppress","danger"));
    else if (s === "REJECTED") out.push(b("wf-return","Return to draft"), b("wf-edit","Edit","secondary"), b("wf-suppress","Suppress","danger"), b("wf-delete","Delete report","danger"));
    else if (s === "AUTHORISED") out.push(b("wf-suppress","Suppress","danger"));
    bar.innerHTML = out.join("");
    function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }
    on("wf-edit", function () { showForm(ir); });
    on("wf-delete", function () { deleteReport(ir); });
    on("wf-submit", function () { var r = W.transition(ir, "SUBMIT", { actor:"user" }); if (!r.ok) { setStatus(r.error, "err"); return; } wfPersist(ir, "Submitted for authorisation."); });
    on("wf-return", function () { var r = W.transition(ir, "RETURN_TO_DRAFT", { actor:"user" }); if (!r.ok) { setStatus(r.error, "err"); return; } wfPersist(ir, "Returned to draft."); });
    on("wf-reject", function () { var reason = window.prompt("Reason for rejection:"); if (reason === null) return; var r = W.transition(ir, "REJECT", { actor:"user", reason:reason }); if (!r.ok) { setStatus(r.error, "err"); return; } wfPersist(ir, "Rejected."); });
    on("wf-suppress", function () { var reason = window.prompt("Reason for suppression:"); if (reason === null) return; var r = W.transition(ir, "SUPPRESS", { actor:"user", reason:reason }); if (!r.ok) { setStatus(r.error, "err"); return; } wfPersist(ir, "Suppressed."); });
    on("wf-review", function () { renderPndReview(ir); });
  }
  function pndRow(kind, id, label, share, confirmed, note) {
    var opts = SI.PND_SHARE.map(function (p) { return '<option value="' + esc(p) + '"' + (share === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join("");
    return '<li class="pnd-row"><span>' + esc(label) + '</span>' +
      '<label class="si-inline">PND <select aria-label="PND share for ' + esc(label) + '" data-pnd-kind="' + kind + '" data-pnd-id="' + esc(id) + '">' + opts + '</select></label>' +
      '<label class="si-inline"><input type="checkbox" aria-label="Confirm ' + esc(label) + '" data-conf-kind="' + kind + '" data-conf-id="' + esc(id) + '"' + (confirmed ? ' checked' : '') + '> confirmed</label>' +
      (note ? '<span class="pnd-note">' + esc(note) + '</span>' : '') + '</li>';
  }
  function renderPndReview(ir) {
    var host = document.getElementById("pnd-review"); if (!host) return;
    if (!ir.structuredIntelligence) ir.structuredIntelligence = { entities: [], links: [] };
    var S = ir.structuredIntelligence, byId = {}; S.entities.forEach(function (e) { byId[e.id] = e; });
    var eff = W.computeEffectivePndShare(ir), effL = {}; eff.links.forEach(function (x) { effL[x.id] = x; });
    var entRows = S.entities.map(function (e) { return pndRow("entity", e.id, entLabel(e), e.pndShare, e.authoriserConfirmed, ""); }).join("");
    var lnkRows = S.links.map(function (l) { var f = byId[l.from], t = byId[l.to]; var note = effL[l.id] && effL[l.id].blockedReason; return pndRow("link", l.id, (f ? f.label : l.from) + " —" + (SI.LINK_TYPES[l.type] || l.type) + "→ " + (t ? t.label : l.to), l.pndShare, l.authoriserConfirmed, note); }).join("");
    host.innerHTML = '<div class="pnd-panel"><h3>PND share review</h3>' +
      '<p class="hint">Set each entity/link PND share, then confirm. A link is only sent to PND if both its entities are shared.</p>' +
      '<h4>Entities</h4><ul class="pnd-list">' + (entRows || '<li class="empty">None</li>') + '</ul>' +
      '<h4>Links</h4><ul class="pnd-list">' + (lnkRows || '<li class="empty">None</li>') + '</ul>' +
      '<div class="toolbar"><button type="button" class="btn" id="pnd-authorise">Authorise charting &amp; PND share</button></div>' +
      '<div id="pnd-msg"></div></div>';
    host.querySelectorAll("[data-pnd-id]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var kind = sel.getAttribute("data-pnd-kind"), id = sel.getAttribute("data-pnd-id");
        var coll = kind === "entity" ? S.entities : S.links; var el = coll.filter(function (x) { return x.id === id; })[0];
        if (el) el.pndShare = sel.value;
        repo.save(ir).then(function () { renderPndReview(ir); });
      });
    });
    host.querySelectorAll("[data-conf-id]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var kind = cb.getAttribute("data-conf-kind"), id = cb.getAttribute("data-conf-id");
        var coll = kind === "entity" ? S.entities : S.links; var el = coll.filter(function (x) { return x.id === id; })[0];
        if (el) el.authoriserConfirmed = cb.checked;
        repo.save(ir);
      });
    });
    document.getElementById("pnd-authorise").addEventListener("click", function () {
      var r = W.transition(ir, "AUTHORISE", { actor:"user" });
      if (!r.ok) {
        document.getElementById("pnd-msg").innerHTML = '<div class="error-summary" role="alert"><h2>Cannot authorise</h2><ul>' +
          (r.reasons || [r.error]).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul></div>';
        return;
      }
      wfPersist(ir, "Authorised. PND share recorded.");
    });
  }

  function renderOpTabs() {
    var host = document.getElementById("op-tabs"); if (!host) return Promise.resolve();
    var q = ((document.getElementById("op-search") || {}).value || "").toLowerCase();
    return allRows().then(function (rows) {
      var counts = {}; rows.forEach(function (ir) { if (ir.operation) counts[ir.operation] = (counts[ir.operation] || 0) + 1; });
      var names = O.names().slice().sort();
      if (q) names = names.filter(function (nm) { return nm.toLowerCase().indexOf(q) !== -1; });
      var selAll = (view === "results" && activeOp === "");
      var html = '<button type="button" class="op-tab" role="tab" data-op="" aria-selected="' + (selAll ? "true" : "false") + '">All<span class="c">' + rows.length + '</span></button>';
      html += names.map(function (nm) {
        var sel = (view === "results" && activeOp === nm);
        return '<button type="button" class="op-tab" role="tab" data-op="' + esc(nm) + '" aria-selected="' + (sel ? "true" : "false") + '">' + esc(nm) + '<span class="c">' + (counts[nm] || 0) + '</span></button>';
      }).join("");
      host.innerHTML = html;
      host.querySelectorAll("[data-op]").forEach(function (b) {
        b.addEventListener("click", function () { selectOp(b.getAttribute("data-op")); });
      });
    });
  }
  function selectOp(name) {
    activeOp = name || "";
    if (activeOp) filterState.filters.operation = [activeOp]; else delete filterState.filters.operation;
    filterState.page = 1;
    showResults();
  }
  function highestMarking(markings) {
    var o = { "OFFICIAL": 0, "OFFICIAL-SENSITIVE": 1 }, hi = "OFFICIAL";
    (markings || []).forEach(function (mk) { if ((o[mk] || 0) > o[hi]) hi = mk; });
    return hi;
  }
  function activeFilterChips() {
    var chips = [];
    Object.keys(filterState.filters).forEach(function (key) {
      (filterState.filters[key] || []).forEach(function (v) {
        chips.push('<button type="button" class="chip" data-rmfilter="' + esc(key) + '" data-rmval="' + esc(v) + '">' + esc(v) + ' &times;</button>');
      });
    });
    if (filterState.dateFrom) chips.push('<button type="button" class="chip" data-rmdate="from">from ' + esc(isoToDMY(filterState.dateFrom)) + ' &times;</button>');
    if (filterState.dateTo) chips.push('<button type="button" class="chip" data-rmdate="to">to ' + esc(isoToDMY(filterState.dateTo)) + ' &times;</button>');
    if (filterState.text) chips.push('<button type="button" class="chip" data-rmtext="1">\u201c' + esc(filterState.text) + '\u201d &times;</button>');
    return chips;
  }
  // Push the current view's breadcrumb trail to the shell (root is prepended
  // by the shell). Safe no-op if the shell isn't present.
  function crumb(trail) { if (window.SolarShell && window.SolarShell.setBreadcrumb) { try { window.SolarShell.setBreadcrumb(trail || []); } catch (e) { /* noop */ } } }

  function showHome() {
    view = "home"; activeOp = "";
    filterState.filters = {}; filterState.text = ""; filterState.dateFrom = ""; filterState.dateTo = ""; filterState.page = 1;
    if (els.search) els.search.value = "";
    cameFromResults = false; lastDetailUrn = null;
    crumb([]);   // root only
    return allRows().then(function (all) {
      setBanner(highestMarking(all.map(function (r) { return r.protectiveMarking; })));
      renderHome(all); renderSidebar(all); return renderOpTabs();
    }).then(function () { focusView(); });
  }
  function renderHome(all) {
    // The Row-3 shell search (#search) is the live query on the home dashboard;
    // #op-search is retired. Fall back to op-search only if #search is absent.
    var q = ((els.search || document.getElementById("op-search") || {}).value || "").toLowerCase();
    var counts = {}; all.forEach(function (ir) { if (ir.operation) counts[ir.operation] = (counts[ir.operation] || 0) + 1; });
    var names = O.names().slice().sort();
    var shown = q ? names.filter(function (nm) { return nm.toLowerCase().indexOf(q) !== -1 || String(O.threatOf(nm)).toLowerCase().indexOf(q) !== -1; }) : names;
    function opCard(nm) {
      var c = counts[nm] || 0;
      // hover-card adds an ACTION gloss (what a click does) rather than repeating
      // the visible name / threat / count. data-tip is rendered as plain text.
      var tip = 'Open ' + nm + ' — list its reports and entities';
      return '<button type="button" class="op-card" data-op="' + esc(nm) + '" data-tip="' + esc(tip) + '">' +
        '<span class="oc-name">' + esc(nm) + '</span>' +
        '<span class="oc-threat">' + esc(O.threatOf(nm)) + '</span>' +
        '<span class="oc-count">' + c + ' report' + (c === 1 ? "" : "s") + '</span></button>';
    }
    var _groups = T.list().map(function (ta) {
      var opsIn = O.list().filter(function (o) { return o.threatArea === ta; }).map(function (o) { return o.name; }).sort();
      if (q) opsIn = opsIn.filter(function (nm) { return nm.toLowerCase().indexOf(q) !== -1 || String(ta).toLowerCase().indexOf(q) !== -1; });
      return { ta: ta, ops: opsIn };
    }).filter(function (g) { return g.ops.length; });
    var groupsHTML = _groups.map(function (g) {
      var repTotal = g.ops.reduce(function (s, nm) { return s + (counts[nm] || 0); }, 0);
      var ic = T.icon(g.ta);
      // swatch is now accessible: role=img + aria-label names the threat area
      // (was aria-hidden decoration) so screen readers announce the icon's meaning.
      var swLabel = esc(g.ta) + ' threat area';
      // visible hover-card: full threat name + "N ops · M reports" (data-tip is
      // rendered as plain text by the portal tooltip, so it is XSS-safe).
      var swTip = esc(g.ta) + ' — ' + g.ops.length + ' op' + (g.ops.length === 1 ? '' : 's') + ' · ' + repTotal + ' report' + (repTotal === 1 ? '' : 's');
      var sw = ic
        ? '<span class="ta-swatch has-icon" style="--ta-icon:url(assets/threat/' + ic + '.png)" role="img" aria-label="' + swLabel + '" data-tip="' + swTip + '"></span>'
        : '<span class="ta-swatch" role="img" aria-label="' + swLabel + '" data-tip="' + swTip + '"></span>';
      return '<details class="ta-group"' + (q ? ' open' : '') + ' data-ta="' + esc(g.ta) + '" style="--ta:' + esc(T.colour(g.ta)) + '">' +
        '<summary class="ta-head">' + sw +
          '<span class="ta-name">' + esc(g.ta) + '</span>' +
          '<span class="ta-meta">' + g.ops.length + ' op' + (g.ops.length === 1 ? '' : 's') + ' · ' + repTotal + ' report' + (repTotal === 1 ? '' : 's') + '</span></summary>' +
        '<div class="op-grid">' + g.ops.map(opCard).join('') + '</div></details>';
    }).join('');
    els.main.innerHTML = '<div class="detail home">' +
      '<h1 tabindex="-1">Operations' + (q ? ' \u00b7 matching \u201c' + esc(q) + '\u201d' : '') + '</h1>' +
      // The home action row is retired from view: every action lives in the
      // mega-menu now (Ben: redundant pills). The buttons are KEPT but hidden
      // (class="toolbar is-proxy-only") because the mega-menu proxies several of
      // them by id via .click() \u2014 deleting them would break those menu items.
      '<div class="toolbar is-proxy-only" aria-hidden="true">' +
        '<button type="button" class="btn" id="home-new" tabindex="-1">+ New report</button> ' +
        '<button type="button" class="btn secondary" id="home-all" tabindex="-1">View all reports &rarr;</button> ' +
        '<button type="button" class="btn secondary" id="home-export" tabindex="-1">Export authorised &rarr; SOLAR case</button> ' +
        '<button type="button" class="btn secondary" id="home-reload" tabindex="-1">Reload demo</button> ' +
        '<button type="button" class="btn secondary" id="home-entities" tabindex="-1">Entity search</button> ' +
        '<button type="button" class="btn secondary" id="home-hits" tabindex="-1">Silent hits</button> ' +
        '<button type="button" class="btn secondary" id="home-access" tabindex="-1">Access log</button> ' +
        '<button type="button" class="btn danger" id="home-clear" tabindex="-1">Clear all reports</button></div>' +
      '<div class="ta-groups">' + (groupsHTML || emptyState({
        title: q ? 'No operations match “' + q + '”' : 'No operations yet',
        hint: q ? 'Try a different search term, or clear the filter to see every threat area.' : 'Load the worked demo to populate operations and reports.',
        action: q ? { id: 'home-empty-clear', label: 'Clear search' } : { id: 'home-empty-demo', label: 'Reload demo' }
      })) + '</div>' +
      '</div>';
    // Hi-Liter: cosmic marker sweep on the signature "Operations" heading (one-shot).
    try { var _opH = els.main.querySelector(".detail.home > h1"); if (_opH && window.SolarShell && window.SolarShell.markHeading) { window.SolarShell.markHeading(_opH); } } catch (e) { /* noop */ }
    els.main.querySelectorAll(".op-card").forEach(function (c) { c.addEventListener("click", function () { selectOp(c.getAttribute("data-op")); }); });
    var hn = document.getElementById("home-new"); if (hn) hn.addEventListener("click", function () { showForm(null); });
    var ha = document.getElementById("home-all"); if (ha) ha.addEventListener("click", function () { selectOp(""); });
    var he = document.getElementById("home-export"); if (he) he.addEventListener("click", exportAllAuthorised);
    var hr = document.getElementById("home-reload"); if (hr) hr.addEventListener("click", loadDemo);
    var hc = document.getElementById("home-clear"); if (hc) hc.addEventListener("click", clearAllReports);
    var hacc = document.getElementById("home-access"); if (hacc) hacc.addEventListener("click", showAccessLog);
    var hhit = document.getElementById("home-hits"); if (hhit) hhit.addEventListener("click", showSilentHits);
    var hEmptyClear = document.getElementById("home-empty-clear");
    if (hEmptyClear) hEmptyClear.addEventListener("click", function () { if (els.search) { els.search.value = ""; } var ob = document.getElementById("op-search"); if (ob) { ob.value = ""; } renderOpTabs(); allRows().then(renderHome); });
    var hEmptyDemo = document.getElementById("home-empty-demo"); if (hEmptyDemo) hEmptyDemo.addEventListener("click", loadDemo);
    var hent = document.getElementById("home-entities"); if (hent) hent.addEventListener("click", function(){ requireAccess({action:'Entity search'}, showEntities); });
    try{ if(window.RegistryWatchlist){ var _sc=window.RegistryWatchlist.scan(all); var _n=_sc.reduce(function(a,x){return a+x.hitCount;},0); if(_n && hhit) hhit.textContent="Silent hits ("+_n+")"; } }catch(e){}
  }
  function showResults() {
    view = "results"; cameFromResults = true; lastDetailUrn = null;
    crumb(activeOp ? [{ label: activeOp, run: function () { selectOp(activeOp); } }] : [{ label: "All reports" }]);
    return allRows().then(function (all) { renderMain(all); renderSidebar(all); return renderOpTabs(); })
      .then(function () { focusView(); });
  }
  function renderMain(all) {
    var res = Q.run(all, buildCriteria());
    setBanner(highestMarking(res.markings));
    var withOp = !activeOp;
    var header = '<div class="crumbs"><button type="button" class="linklike" id="ov-home">\u2190 Overview</button></div>' + (activeOp
      ? '<h1 tabindex="-1">' + esc(activeOp) + '</h1><p class="hint">' + esc(O.threatOf(activeOp)) + '</p>'
      : '<h1 tabindex="-1">All reports</h1>');
    // In-page operation switch (replaces the removed sidebar op-tabs rail).
    var opSwitch = '<label class="op-switch"><span class="op-switch-k">Operation</span>' +
      '<select id="ov-op"><option value="">All reports</option>' +
      O.names().slice().sort().map(function (nm) { return opt(nm, nm, activeOp); }).join("") +
      '</select></label>';
    var toolbar = '<div class="toolbar">' + opSwitch +
      '<button type="button" class="btn" id="ov-new">+ New report</button> ' +
      '<button type="button" class="btn secondary" id="ov-load">Reload demo</button> ' +
      '<button type="button" class="btn secondary" id="ov-export">Export authorised &rarr; SOLAR case</button> ' +
      '<button type="button" class="btn danger" id="ov-clear">Clear all reports</button></div>';
    var facetHtml = res.facets.filter(function (f) { return f.key !== "operation" && f.values.length > 1; }).map(function (f) {
      if (!f.values.length) return "";
      var sel = (filterState.filters[f.key] || []);
      var opts = f.values.map(function (v) {
        return '<label class="facet-opt"><input type="checkbox" data-facet="' + esc(f.key) + '" data-val="' + esc(v.value) + '"' + (v.selected ? " checked" : "") + '> ' +
          '<span class="fv">' + esc(v.value) + '</span><span class="c">' + v.count + '</span></label>';
      }).join("");
      return '<details class="facet"' + (sel.length ? " open" : "") + '><summary>' + esc(f.label) + (sel.length ? ' <span class="c">' + sel.length + '</span>' : '') + '</summary><div class="facet-opts">' + opts + '</div></details>';
    }).join("");
    var dateHtml = '<details class="facet"' + ((filterState.dateFrom || filterState.dateTo) ? " open" : "") + '><summary>Date of collection</summary><div class="facet-opts daterange">' +
      '<p class="hint" id="f-date-facet-hint">Format DD/MM/YYYY</p>' +
      '<label>From <input type="text" inputmode="numeric" id="f-date-from" placeholder="DD/MM/YYYY" aria-describedby="f-date-facet-hint" value="' + esc(isoToDMY(filterState.dateFrom)) + '"></label>' +
      '<label>To <input type="text" inputmode="numeric" id="f-date-to" placeholder="DD/MM/YYYY" aria-describedby="f-date-facet-hint" value="' + esc(isoToDMY(filterState.dateTo)) + '"></label>' +
      '<p class="field-error" id="f-date-err" hidden>Enter a valid date as DD/MM/YYYY</p></div></details>';
    var chips = activeFilterChips();
    var chipBar = (chips.length ? '<div class="chips">' + chips.join("") + '<button type="button" class="chip clear" id="clear-filters">Clear all</button></div>' : "");
    var countLine = '<div class="result-count">' + (res.total
      ? ('Showing <strong>' + res.start + '\u2013' + res.end + '</strong> of <strong>' + res.total + '</strong>' + (res.total !== all.length ? ' (filtered from ' + all.length + ')' : ''))
      : 'No matching reports') + '</div>';
    function th(key, label) {
      var act = sortState.key === key, arrow = act ? (sortState.dir > 0 ? " \u25B2" : " \u25BC") : "";
      return '<th data-sort="' + key + '" tabindex="0" role="button" aria-sort="' + (act ? (sortState.dir > 0 ? "ascending" : "descending") : "none") + '">' + esc(label) + arrow + '</th>';
    }
    var head = '<tr>' + th("urn", "URN") + th("title", "Title") + (withOp ? th("operation", "Operation") : "") +
      th("dateOfCollection", "Date") + th("protectiveMarking", "Marking") + th("items", "Items") + '</tr>';
    var body = res.rows.map(function (ir) {
      return '<tr data-urn="' + esc(ir.urn) + '" tabindex="0" role="button">' +
        '<td class="grade">' + esc(ir.urn) + '</td>' +
        '<td>' + esc(ir.title || "(untitled)") + '</td>' +
        (withOp ? ('<td>' + esc(ir.operation || "\u2014") + '</td>') : "") +
        '<td>' + esc(ir.dateOfCollection) + '</td>' +
        '<td><span class="pill mk-' + esc(ir.protectiveMarking) + '">' + esc(ir.protectiveMarking) + '</span></td>' +
        '<td>' + ((ir.items || []).length) + '</td></tr>';
    }).join("");
    var table = res.total ? ('<table class="op-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>') : '';
    var sizeOpts = [25, 50, 100, 200].map(function (nn) { return '<option value="' + nn + '"' + (filterState.pageSize === nn ? " selected" : "") + '>' + nn + '</option>'; }).join("");
    var pager = res.total ? ('<div class="pager">' +
      '<button type="button" class="btn secondary" id="pg-prev"' + (res.page <= 1 ? " disabled" : "") + '>&larr; Prev</button>' +
      '<span class="pg-info">Page ' + res.page + ' of ' + res.pages + '</span>' +
      '<button type="button" class="btn secondary" id="pg-next"' + (res.page >= res.pages ? " disabled" : "") + '>Next &rarr;</button>' +
      '<label class="pg-size">Per page <select id="pg-size">' + sizeOpts + '</select></label></div>') : "";
    els.main.innerHTML = '<div class="detail results">' + header + toolbar +
      '<div class="filters"><p class="filters-label">Filters</p><div class="facet-bar">' + facetHtml + dateHtml + '</div>' + chipBar + countLine + '</div>' +
      table + pager + '</div>';
    els.main.querySelectorAll("th[data-sort]").forEach(function (h) {
      function go() { var k = h.getAttribute("data-sort"); if (sortState.key === k) sortState.dir = -sortState.dir; else { sortState.key = k; sortState.dir = (k === "dateOfCollection") ? -1 : 1; } showResults(); }
      h.addEventListener("click", go);
      h.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    els.main.querySelectorAll("tr[data-urn]").forEach(function (tr) {
      function open() { showDetail(tr.getAttribute("data-urn")); }
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    els.main.querySelectorAll("input[data-facet]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var key = cb.getAttribute("data-facet"), val = cb.getAttribute("data-val");
        var arr = filterState.filters[key] || (filterState.filters[key] = []);
        var i = arr.indexOf(val);
        if (cb.checked && i === -1) arr.push(val); else if (!cb.checked && i !== -1) arr.splice(i, 1);
        if (!arr.length) delete filterState.filters[key];
        filterState.page = 1; showResults();
      });
    });
    // DD/MM text entry → ISO for filterState (empty clears; invalid non-empty flags inline, keeps prior filter).
    function applyDateInput(inputEl, key) {
      if (!inputEl) return;
      inputEl.addEventListener("change", function () {
        var raw = inputEl.value.trim();
        var err = document.getElementById("f-date-err");
        var field = inputEl.closest("label");
        if (raw === "") {
          filterState[key] = "";
          inputEl.classList.remove("invalid"); if (field) field.classList.remove("invalid"); if (err) err.hidden = true;
        } else {
          var iso = dmyToISO(raw);
          if (!iso) {
            inputEl.classList.add("invalid"); if (field) field.classList.add("invalid"); if (err) err.hidden = false;
            return;   // keep the prior filter rather than silently ignoring a bad value
          }
          filterState[key] = iso;
          inputEl.classList.remove("invalid"); if (field) field.classList.remove("invalid"); if (err) err.hidden = true;
        }
        filterState.page = 1; showResults();
      });
    }
    applyDateInput(document.getElementById("f-date-from"), "dateFrom");
    applyDateInput(document.getElementById("f-date-to"), "dateTo");
    els.main.querySelectorAll("[data-rmfilter]").forEach(function (c) { c.addEventListener("click", function () {
      var key = c.getAttribute("data-rmfilter"), val = c.getAttribute("data-rmval");
      var arr = filterState.filters[key] || []; var i = arr.indexOf(val); if (i !== -1) arr.splice(i, 1);
      if (!arr.length) delete filterState.filters[key];
      if (key === "operation") activeOp = "";
      filterState.page = 1; showResults();
    }); });
    els.main.querySelectorAll("[data-rmdate]").forEach(function (c) { c.addEventListener("click", function () {
      if (c.getAttribute("data-rmdate") === "from") filterState.dateFrom = ""; else filterState.dateTo = "";
      filterState.page = 1; showResults();
    }); });
    var rmText = els.main.querySelector("[data-rmtext]"); if (rmText) rmText.addEventListener("click", function () { filterState.text = ""; if (els.search) els.search.value = ""; filterState.page = 1; showResults(); });
    var clr = document.getElementById("clear-filters"); if (clr) clr.addEventListener("click", function () { filterState.filters = {}; filterState.dateFrom = ""; filterState.dateTo = ""; filterState.text = ""; if (els.search) els.search.value = ""; activeOp = ""; filterState.page = 1; showResults(); });
    var pp = document.getElementById("pg-prev"); if (pp) pp.addEventListener("click", function () { if (filterState.page > 1) { filterState.page--; showResults(); } });
    var pn = document.getElementById("pg-next"); if (pn) pn.addEventListener("click", function () { filterState.page++; showResults(); });
    var ps = document.getElementById("pg-size"); if (ps) ps.addEventListener("change", function () { filterState.pageSize = parseInt(ps.value, 10) || 50; filterState.page = 1; showResults(); });
    var nb = document.getElementById("ov-new"); if (nb) nb.addEventListener("click", function () { showForm(null); });
    var lb = document.getElementById("ov-load"); if (lb) lb.addEventListener("click", loadDemo);
    var eb = document.getElementById("ov-export"); if (eb) eb.addEventListener("click", exportAllAuthorised);
    var cb = document.getElementById("ov-clear"); if (cb) cb.addEventListener("click", clearAllReports);
    var hb = document.getElementById("ov-home"); if (hb) hb.addEventListener("click", showHome);
    var ob = document.getElementById("ov-op"); if (ob) ob.addEventListener("change", function () { selectOp(ob.value); });
  }
  function autoSeed() {
    if (!window.RegistryDemo) { showWelcome(); return refreshList(); }
    var ds; try { ds = window.RegistryDemo.buildDemoDataset(); } catch (e) { showWelcome(); return refreshList(); }
    setStatus("Loading demo dataset…");
    els.main.innerHTML = '<div class="loading-state"><span class="ld-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>Loading the demo dataset (' + (window.RegistryDemo.OPERATION_COUNT * window.RegistryDemo.REPORTS_PER_OP) + ' reports)…</div>';
    return repo.clear()
      .then(function () { return ds.reduce(function (p, ir) { return p.then(function () { return repo.save(N.normaliseIR(ir)); }); }, Promise.resolve()); })
      .then(function () { dataCache = null; markSeed(); return showHome(); })
      .then(function () { setStatus(repo.fellBack ? "Using an in-memory store (IndexedDB unavailable)." : ""); })
      .catch(function (e) { setStatus("Auto-load failed: " + (e && e.message), "err"); showWelcome(); });
  }
  function clearAllReports() {
    if (!window.confirm("Remove ALL reports from the store? This cannot be undone.")) return;
    repo.clear().then(function () {
      dataCache = null; filterState.filters = {}; filterState.dateFrom = ""; filterState.dateTo = ""; filterState.text = "";
      if (els.search) els.search.value = ""; activeOp = ""; filterState.page = 1; view = "home";
      showWelcome(); return refreshList();
    }).then(function () { setStatus("All reports cleared.", "ok"); });
  }
  function loadDemo() {
    if (!window.RegistryDemo) { setStatus("Demo module not loaded.", "err"); return; }
    if (!window.confirm("Load the demo dataset (" + window.RegistryDemo.OPERATION_COUNT + " operations × " + window.RegistryDemo.REPORTS_PER_OP + " reports = " + (window.RegistryDemo.OPERATION_COUNT * window.RegistryDemo.REPORTS_PER_OP) + ")? This REPLACES everything currently in the store.")) return;
    var ds;
    try { ds = window.RegistryDemo.buildDemoDataset(); }
    catch (e) { setStatus("Demo build failed: " + (e && e.message), "err"); return; }
    setStatus("Loading " + ds.length + " demo reports…");
    repo.clear().then(function () { return ds.reduce(function (p, ir) { return p.then(function () { return repo.save(N.normaliseIR(ir)); }); }, Promise.resolve()); })  // wipe then re-seed through the SAME ingest seam
      .then(function () { dataCache = null; markSeed(); return repo.list(); })
      .then(function (rows) { return showHome().then(function () { return rows.length; }); })
      .then(function (count) { setStatus(count + " reports loaded." + (repo.fellBack ? " In-memory store (IndexedDB unavailable)." : ""), "ok"); })
      .catch(function (e) { setStatus("Demo load failed: " + (e && e.message) + ". If opened via file://, run it from a local web server instead.", "err"); });
  }
  function exportAllAuthorised() {
    repo.list().then(function (rows) {
      var auth = rows.filter(function (r) { return r.status === "AUTHORISED"; });
      if (!auth.length) { setStatus("No authorised reports to export.", "err"); return; }
      download("registry-authorised.chartroom.json", JSON.stringify(H.toSolarCase(auth, { onlyAuthorised: true, caseName: "Registry — all authorised" }), null, 2));
      setStatus("Exported " + auth.length + " authorised report(s). Open the .chartroom.json in SOLAR Charting to chart them.", "ok");
    });
  }

  function showWelcome() {
    setBanner("OFFICIAL");
    els.main.innerHTML =
      '<div class="detail page"><h1 tabindex="-1" class="visually-hidden">No reports</h1>' +
      emptyState({
        title: 'No reports in the registry yet',
        hint: 'Create the first intelligence report, or load the worked demo dataset to explore a populated registry.',
        action: { id: 'w-empty-new', label: '+ New report' }
      }) +
      '<div class="toolbar toolbar-centred">' +
      '<button type="button" class="btn secondary" id="w-load-demo">Load demo dataset</button> ' +
      '<button type="button" class="btn secondary" id="w-export-all">Export all authorised &rarr; SOLAR case</button> ' +
      '<button type="button" class="btn danger" id="w-clear">Clear all reports</button></div></div>';
    document.getElementById("w-empty-new").addEventListener("click", function () { showForm(null); });
    var _ld = document.getElementById("w-load-demo"); if (_ld) _ld.addEventListener("click", loadDemo);
    var _ex = document.getElementById("w-export-all"); if (_ex) _ex.addEventListener("click", exportAllAuthorised);
    var _cl = document.getElementById("w-clear"); if (_cl) _cl.addEventListener("click", clearAllReports);
    focusView();
  }

  /* ---------- boot ---------- */
  document.getElementById("btn-new").addEventListener("click", function () { showForm(null); });
  (function(){
    var u=document.getElementById("reg-user"); if(u){ u.textContent=currentUser(); u.addEventListener("click", function(){ var v=window.prompt("Your identity (grade + name):", currentUser()); if(v!=null){ try{ localStorage.setItem("reg_user", (v.trim()||"G5 Analyst")); }catch(e){} u.textContent=currentUser(); setStatus("Identity set to "+currentUser()+".","ok"); } }); }
    var wn=document.getElementById("reg-whatsnew"); if(wn) wn.addEventListener("click", showWhatsNew);
    var lk=document.getElementById("reg-lock"); if(lk) lk.addEventListener("click", lockWorkspace);
  })();
  /* Report hover-preview lightbox (Ben B2): dwell-hover a report row (~1.2s) ->
     a modal <dialog> lightbox with a short preview. Self-contained module
     (window.RegistryPreview); we supply a data provider + the open-full action.
     Clicking a row still navigates normally (we never touch the click). */
  (function () {
    if (!window.RegistryPreview || !window.RegistryPreview.attach) { return; }
    function firstLine(s) { s = String(s == null ? "" : s).trim(); return s; }
    function provider(urn) {
      return repo.get(urn).then(function (ir) {
        if (!ir) { return null; }
        var items = (ir.items || []).filter(function (i) { return !i.isProvenance; });
        var summary = items.slice(0, 2).map(function (it) { return firstLine(it.text); }).filter(Boolean);
        var g = null; try { g = V.reportGrade(ir); } catch (e) { g = null; }
        var fmtISOtoDMY = function (iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d.getTime())) return ''; function p(n){return (n<10?'0':'')+n;} return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear(); };
        return {
          title: ir.title || "(untitled)",
          urn: ir.urn,
          operation: ir.operation || "",
          date: ir.dateOfCollection || ir.dateOfIntelligence || fmtISOtoDMY(ir.createdAt) || "",
          marking: ir.protectiveMarking || "",
          grade: g ? (String(g.sourceEval || "") + String(g.intelEval || "") + String(g.handling || "")) : "",
          summary: summary
        };
      });
    }
    window.RegistryPreview.attach(provider, function (urn) { showDetail(urn); });
  })();

  var _searchT;
  els.search.addEventListener("input", function () {
    clearTimeout(_searchT);
    // context-aware: on the home (operations) dashboard the search filters the
    // operation groups; everywhere else it filters reports.
    if (view === "home") {
      _searchT = setTimeout(function () { allRows().then(renderHome); }, 120);
    } else {
      filterState.text = els.search.value; filterState.page = 1;
      _searchT = setTimeout(showResults, 150);
    }
  });
  (function () { var sb = document.getElementById("op-search"); if (sb) sb.addEventListener("input", function () { renderOpTabs(); if (view === "home") { allRows().then(renderHome); } }); })();
  (function () { var br = document.querySelector(".masthead .brand"); if (br) { br.style.cursor = "pointer"; br.setAttribute("role", "button"); br.setAttribute("tabindex", "0"); br.addEventListener("click", showHome); br.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showHome(); } }); } })();
  var SEED_VERSION = (window.RegistryDemo && window.RegistryDemo.SEED_VERSION) || "";
  function storedSeed(){ try { return localStorage.getItem("registry.seedVersion"); } catch(e){ return null; } }
  function markSeed(){ try { localStorage.setItem("registry.seedVersion", SEED_VERSION); } catch(e){} }
  allRows().then(function (rows) {
    if (rows.length && storedSeed() === SEED_VERSION) { return showHome().then(function () { setStatus(""); }); }
    return autoSeed();  // empty store OR the demo generator changed -> rebuild from current demo-seed.js
  });

  /* ---- command-palette provider (registry domain) ------------------
     Feeds the shell's ⌘K palette with operations, reports and the entity
     view, wired to the SAME navigation handlers the UI uses (one source of
     truth). Reads sync from O.list() (operations, always available) and the
     dataCache (reports, populated after first load). */
  (function () {
    // shell.js loads AFTER app.js, so SolarShell may not exist yet — defer the
    // registration until it does (bounded poll, then give up).
    function provider() {
      var cmds = [];
      try {
        O.list().forEach(function (o) {
          cmds.push({ label: o.name, hint: "Operation · " + String(o.threatArea || ""), group: "Operations", run: (function (nm) { return function () { selectOp(nm); }; })(o.name) });
        });
      } catch (e) { /* ops not ready */ }
      try {
        (dataCache || []).slice(0, 300).forEach(function (r) {
          cmds.push({ label: r.urn + " — " + String(r.title || ""), hint: "Report · " + String(r.operation || ""), group: "Reports", run: (function (u) { return function () { showDetail(u); }; })(r.urn) });
        });
      } catch (e) { /* reports not loaded */ }
      cmds.push({ label: "Entity search", hint: "Master / lower nominals", group: "Registry", run: function () { requireAccess({ action: 'Entity search' }, showEntities); } });
      return cmds;
    }
    var tries = 0;
    (function wait() {
      if (window.SolarShell && window.SolarShell.registerCommands) {
        window.SolarShell.registerCommands(provider);
        if (window.SolarShell.setBreadcrumbRoot) { window.SolarShell.setBreadcrumbRoot(showHome); }  // root crumb → home
        return;
      }
      if (++tries > 40) { return; }  // ~2s ceiling, then give up
      setTimeout(wait, 50);
    })();
  })();

  /* ---- Shared SOLAR case: the intel-logs live on the SAME localStorage case
     as the charting workbench, so Database and Chart work one case, not two
     copies. Re-load before opening so we pick up anything the Chart changed. */
  (function () {
    if (!(window.CRModel && window.CRLogPanel && window.CRRecords)) return;
    var logStore = new window.CRModel.CaseStore();
    try { logStore.loadLocal(); } catch (e) { /* fresh case */ }
    window.CRRecords.attach(logStore);
    if (window.CRCollab) window.CRCollab.init(logStore);
    if (window.CRCaseSync) window.CRCaseSync.setWho(function () { return (logStore.meta && logStore.meta.officer) || ""; });
    window.CRLogPanel.init(logStore);
    var lb = document.getElementById("reg-logs");
    if (lb) lb.addEventListener("click", function () { try { logStore.loadLocal(); } catch (e) {} window.CRLogPanel.open(); });
  })();

})();
/*REGEOF*/
