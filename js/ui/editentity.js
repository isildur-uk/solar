/* CHART ROOM — editentity.js
 * Structured Add / Edit entity modal.
 *
 * One form used for BOTH manual "Add entity here…" and editing any existing
 * entity. Lets the analyst set every aspect: type, name, a curated set of
 * common per-type fields, a dedicated DOB field (stored as attrs.dob; always
 * rendered "DOB"), and a generic add-any-attribute editor so nothing is ever
 * locked out. Routes to store.addEntity / store.updateEntity, each wrapped in
 * store.snapshot() for undo. All analyst-supplied text is escaped on render.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var St = window.CRStandards;
  var M = window.CRMatch;

  /* canonical attr key -> display label (mirrors inspector; dob => DOB) */
  var ATTR_LABEL = {
    dob: "DOB", aka: "AKA", pnc: "PNC", cro: "CRO", nino: "NINO", vat: "VAT", vin: "VIN",
    iccid: "ICCID", imei: "IMEI", ip: "IP", companyNumber: "Company No.", sortCode: "Sort code",
    accountNumber: "Account no.", regFormat: "Reg. format", cc: "Country", iata: "IATA",
    colour: "Colour", make: "Make", model: "Model", occupation: "Occupation",
    nationality: "Nationality", notes: "Notes", address: "Address"
  };
  function attrLabel(k) { return ATTR_LABEL[k] || (k.charAt(0).toUpperCase() + k.slice(1)); }
  /* reverse: a typed label/key -> canonical key (so "DOB" in the generic editor lands as dob) */
  var KEY_BY_LABEL = {};
  Object.keys(ATTR_LABEL).forEach(function (k) {
    KEY_BY_LABEL[k.toLowerCase()] = k;
    KEY_BY_LABEL[ATTR_LABEL[k].toLowerCase().replace(/[^a-z0-9]/g, "")] = k;
  });
  function normKey(raw) {
    var t = String(raw || "").trim();
    if (!t) return "";
    var probe = t.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (KEY_BY_LABEL[probe]) return KEY_BY_LABEL[probe];
    /* keep a tidy camel-ish key from free text */
    return t.replace(/\s+(.)/g, function (_, c) { return c.toUpperCase(); }).replace(/[^A-Za-z0-9]/g, "");
  }

  /* The entity LABEL carries the primary identifier; hint tells the analyst what goes there. */
  var LABEL_HINT = {
    person: "Full name — SURNAME in caps is the CM convention", phone: "Telephone number",
    email: "Email address", address: "Full address", location: "Place name",
    organisation: "Organisation name", vehicle: "Registration (VRM)", weapon: "Description",
    drug: "Description / substance", account: "Account number or IBAN", date: "Date",
    money: "Amount", ip: "IP address", document: "Title", event: "Event name", note: "Text"
  };

  /* per-type curated fields. kind: text | date | num | textarea. geo:true => stored in e.geo */
  var COMMON_NOTES = { key: "notes", label: "Notes", kind: "textarea" };
  var FIELDS = {
    person: [
      { key: "dob", label: "DOB", kind: "date", placeholder: "dd/mm/yyyy" },
      { key: "aka", label: "AKA", kind: "text", placeholder: "also known as" },
      { key: "nino", label: "NINO", kind: "text" },
      { key: "nationality", label: "Nationality", kind: "text" },
      { key: "occupation", label: "Occupation", kind: "text" },
      COMMON_NOTES
    ],
    phone: [{ key: "imei", label: "IMEI", kind: "text" }, { key: "iccid", label: "ICCID", kind: "text" }, COMMON_NOTES],
    email: [COMMON_NOTES],
    address: [{ key: "lat", label: "Latitude", kind: "num", geo: true }, { key: "lon", label: "Longitude", kind: "num", geo: true }, COMMON_NOTES],
    location: [{ key: "lat", label: "Latitude", kind: "num", geo: true }, { key: "lon", label: "Longitude", kind: "num", geo: true }, COMMON_NOTES],
    organisation: [{ key: "companyNumber", label: "Company No.", kind: "text" }, { key: "vat", label: "VAT", kind: "text" }, COMMON_NOTES],
    vehicle: [{ key: "make", label: "Make", kind: "text" }, { key: "model", label: "Model", kind: "text" }, { key: "colour", label: "Colour", kind: "text" }, { key: "vin", label: "VIN", kind: "text" }, COMMON_NOTES],
    weapon: [COMMON_NOTES],
    drug: [COMMON_NOTES],
    account: [{ key: "sortCode", label: "Sort code", kind: "text" }, { key: "accountNumber", label: "Account no.", kind: "text" }, COMMON_NOTES],
    date: [COMMON_NOTES],
    money: [COMMON_NOTES],
    ip: [COMMON_NOTES],
    document: [COMMON_NOTES],
    event: [COMMON_NOTES],
    note: [COMMON_NOTES]
  };
  function fieldsFor(t) { return FIELDS[t] || [COMMON_NOTES]; }
  function isGeoField(f) { return !!f.geo; }

  /* attrs the form must never expose in the generic editor (engine-owned / handled elsewhere). */
  var RESERVED = { cmStatus: 1, cmWarnings: 1, cm: 1, cmValid: 1, cmDate: 1, lat: 1, lon: 1 };
  function isReserved(k) { return !k || k[0] === "_" || RESERVED[k]; }

  /* ---------- DOB helpers ---------- */
  function pad2(n) { n = String(n); return n.length < 2 ? "0" + n : n; }
  /* Any parseable date -> ISO yyyy-mm-dd. Returns "" if not a full valid date. */
  function toISO(raw) {
    if (!raw || !St || !St.parseDateParts) return "";
    var s = String(raw).trim();
    if (!St.ddmmyyyy(s)) return "";          // validity gate (returns "" when invalid)
    var p = St.parseDateParts(s);
    if (!p) return "";
    return p.y + "-" + pad2(p.m) + "-" + pad2(p.d);
  }
  /* Show a stored dob (ISO or raw) as dd/mm/yyyy where possible, else the raw value. */
  function dobDisplay(v) { if (!v) return ""; return (St && St.ddmmyyyy(v)) || String(v); }
  /* Store a typed dob: ISO when fully parseable, else the trimmed raw text (e.g. "XX/02/1993"). */
  function dobStore(v) { v = String(v || "").trim(); if (!v) return ""; return toISO(v) || v; }

  /* Detect a DOB embedded in a label, e.g. "Tom Ransome Dob XX/02/1993",
   * "BAINES (DOB 20/12/1990)", "Smith, born 1/2/90". Returns {dob, cleaned} or null. */
  function detectDobInLabel(label) {
    var s = String(label || "");
    var re = /[\(\[]?\s*\b(?:dob|d\.?\s*o\.?\s*b\.?|date of birth|born)\b[\s:]*\(?\s*([0-9xX?]{1,2}[\/.\-][0-9xX?]{1,2}[\/.\-]\d{2,4})\s*\)?[\]\)]?/i;
    var m = s.match(re);
    if (!m) return null;
    var cleaned = (s.slice(0, m.index) + s.slice(m.index + m[0].length))
      .replace(/\s*[\(\[]\s*[\]\)]\s*/g, " ")   // empty leftover brackets
      .replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ").trim();
    return { dob: m[1].toUpperCase().replace(/[?]/g, "X"), cleaned: cleaned };
  }

  /* ---------- modal build ---------- */
  var IN = "width:100%;box-sizing:border-box;background:var(--panel-2);border:1px solid var(--line);" +
    "color:var(--text);font:12px var(--mono);padding:6px 8px";
  var LB = "display:block;color:#9aa5b1;font:11px var(--mono);margin:8px 0 3px";

  function open(opts) {
    opts = opts || {};
    var store = opts.store;
    if (!store) return;
    var editing = opts.id ? store.getEntity(opts.id) : null;
    var mode = editing ? "edit" : "new";

    var type = editing ? editing.type : (opts.defaultType || "person");
    var label = editing ? editing.label : "";
    var attrs = {};
    if (editing) Object.keys(editing.attrs || {}).forEach(function (k) { attrs[k] = editing.attrs[k]; });
    var geo = editing && editing.geo ? { lat: editing.geo.lat, lon: editing.geo.lon } : null;

    /* legacy migration: pull a DOB out of an existing person's name (analyst confirms by saving) */
    var migrationNote = "";
    if (editing && type === "person" && !attrs.dob) {
      var hit = detectDobInLabel(label);
      if (hit) { attrs.dob = dobStore(hit.dob); label = hit.cleaned; migrationNote =
        "Found “" + hit.dob + "” in the name — moved it to the DOB field and tidied the name. Save to confirm, or edit either field first."; }
    }

    /* generic rows = existing attrs that aren't curated for this type and aren't reserved */
    function genericSeed() {
      var seed = [];
      var curated = {}; fieldsFor(type).forEach(function (f) { curated[f.key] = 1; });
      Object.keys(attrs).forEach(function (k) {
        if (isReserved(k) || curated[k]) return;
        seed.push({ key: k, val: attrs[k] });
      });
      return seed;
    }
    var genericRows = genericSeed();

    var veil = document.createElement("div");
    veil.className = "modal-veil open";
    veil.setAttribute("role", "dialog");
    veil.setAttribute("aria-modal", "true");
    veil.setAttribute("aria-label", mode === "edit" ? "edit entity" : "add entity");
    var modal = document.createElement("div");
    modal.className = "modal";
    modal.style.cssText = "width:min(560px,94vw);max-height:88vh;display:flex;flex-direction:column";
    var prev = document.activeElement;

    function close() { veil.remove(); if (prev && prev.focus) prev.focus(); }

    function render() {
      var T = window.CRModel.ENTITY_TYPES;
      var typeOpts = Object.keys(T).map(function (k) {
        return '<option value="' + U.escAttr(k) + '"' + (k === type ? " selected" : "") + ">" + U.esc(T[k].label) + "</option>";
      }).join("");

      var curatedHtml = fieldsFor(type).map(function (f) {
        var id = "ee-f-" + f.key;
        var raw = isGeoField(f) ? (geo ? geo[f.key] : "") : (attrs[f.key] != null ? attrs[f.key] : "");
        var val = f.key === "dob" ? dobDisplay(raw) : raw;
        var lbl = '<label style="' + LB + '" for="' + id + '">' + U.esc(f.label) + "</label>";
        if (f.kind === "textarea") {
          return lbl + '<textarea id="' + id + '" data-fk="' + U.escAttr(f.key) + '" rows="2" style="' + IN +
            ';resize:vertical;font-size:12px">' + U.esc(val) + "</textarea>";
        }
        var ph = f.placeholder ? ' placeholder="' + U.escAttr(f.placeholder) + '"' : "";
        var typeAttr = f.kind === "num" ? ' inputmode="decimal"' : "";
        return lbl + '<input id="' + id + '" data-fk="' + U.escAttr(f.key) + '"' + (isGeoField(f) ? ' data-geo="1"' : "") +
          ' type="text"' + typeAttr + ph + ' value="' + U.escAttr(val) + '" style="' + IN + '">';
      }).join("");

      var genHtml = genericRows.map(function (r, i) {
        return '<div class="ee-gen" data-i="' + i + '" style="display:flex;gap:6px;margin-top:5px">' +
          '<input class="ee-gk" placeholder="attribute" value="' + U.escAttr(attrLabel(r.key)) + '" aria-label="attribute name" style="' + IN + ';flex:0 0 38%">' +
          '<input class="ee-gv" placeholder="value" value="' + U.escAttr(r.val) + '" aria-label="attribute value" style="' + IN + ';flex:1">' +
          '<button type="button" class="btn ee-grm" aria-label="remove attribute" style="flex:0 0 auto;padding:3px 9px">✕</button></div>';
      }).join("");

      modal.innerHTML =
        '<div class="modal-head"><h2>' + (mode === "edit" ? "Edit entity" : "Add entity") + "</h2>" +
        '<button class="btn ghost" id="ee-x" aria-label="close">✕</button></div>' +
        '<div class="modal-body" style="overflow:auto">' +
        (migrationNote ? '<div style="background:var(--accent-soft);border:1px solid var(--accent-dim);color:var(--text);font:11px var(--mono);padding:7px 9px;border-radius:4px;margin-bottom:8px">' + U.esc(migrationNote) + "</div>" : "") +
        '<label style="' + LB + '" for="ee-type">Type</label>' +
        '<select id="ee-type" style="' + IN + '">' + typeOpts + "</select>" +
        '<label style="' + LB + '" for="ee-label">Name / label</label>' +
        '<input id="ee-label" type="text" value="' + U.escAttr(label) + '" style="' + IN + '">' +
        '<div style="color:#76879b;font:10px var(--mono);margin-top:3px">' + U.esc(LABEL_HINT[type] || "") + "</div>" +
        '<div class="sec" style="margin-top:12px">Details</div>' + curatedHtml +
        '<div class="sec" style="margin-top:12px">Other attributes</div>' +
        '<div id="ee-gen-wrap">' + genHtml + "</div>" +
        '<button type="button" class="btn" id="ee-add-attr" style="margin-top:6px">+ Add attribute</button>' +
        (mode === "edit" ? "" : "") +
        "</div>" +
        '<div class="modal-foot"><div class="right">' +
        '<button class="btn" id="ee-cancel">Cancel</button>' +
        '<button class="btn primary" id="ee-save">' + (mode === "edit" ? "Save changes" : "Add to chart") + "</button>" +
        "</div></div>";

      wire();
    }

    /* read the live DOM back into state (so a type switch keeps what was typed) */
    function harvest() {
      var lblEl = modal.querySelector("#ee-label");
      if (lblEl) label = lblEl.value;
      fieldsFor(type).forEach(function (f) {
        var elx = modal.querySelector('[data-fk="' + f.key + '"]');
        if (!elx) return;
        if (isGeoField(f)) {
          var n = parseFloat(elx.value);
          if (!geo) geo = { lat: null, lon: null };
          geo[f.key] = elx.value.trim() === "" ? null : (isNaN(n) ? geo[f.key] : n);
        } else {
          if (f.key === "dob") attrs.dob = elx.value.trim() ? dobStore(elx.value) : "";
          else attrs[f.key] = elx.value;
        }
      });
      genericRows = [];
      modal.querySelectorAll(".ee-gen").forEach(function (row) {
        genericRows.push({ key: normKey(row.querySelector(".ee-gk").value), val: row.querySelector(".ee-gv").value });
      });
    }

    function wire() {
      modal.querySelector("#ee-type").addEventListener("change", function (e) {
        harvest(); type = e.target.value; render();
      });
      modal.querySelector("#ee-x").addEventListener("click", close);
      modal.querySelector("#ee-cancel").addEventListener("click", close);
      modal.querySelector("#ee-add-attr").addEventListener("click", function () {
        harvest(); genericRows.push({ key: "", val: "" }); render();
        var rows = modal.querySelectorAll(".ee-gen");
        var last = rows[rows.length - 1]; if (last) last.querySelector(".ee-gk").focus();
      });
      modal.querySelectorAll(".ee-grm").forEach(function (b) {
        b.addEventListener("click", function () {
          var i = +b.parentNode.getAttribute("data-i");
          harvest(); genericRows.splice(i, 1); render();
        });
      });
      modal.querySelector("#ee-save").addEventListener("click", save);
    }

    function buildAttrs() {
      var out = {};
      /* preserve engine-owned attrs untouched */
      if (editing) Object.keys(editing.attrs || {}).forEach(function (k) { if (isReserved(k)) out[k] = editing.attrs[k]; });
      /* generic rows first */
      genericRows.forEach(function (r) {
        var k = normKey(r.key); var v = String(r.val == null ? "" : r.val).trim();
        if (k && v && !isReserved(k)) out[k] = v;
      });
      /* curated fields override (geo handled separately) */
      fieldsFor(type).forEach(function (f) {
        if (isGeoField(f)) return;
        var v = attrs[f.key];
        if (f.key === "dob") { if (v) out.dob = v; return; }
        v = String(v == null ? "" : v).trim();
        if (v) out[f.key] = v;
      });
      return out;
    }

    function save() {
      harvest();
      label = String(label || "").trim().slice(0, 200);
      if (!label) { var le = modal.querySelector("#ee-label"); if (le) le.focus(); return; }
      var finalAttrs = buildAttrs();
      var finalGeo = (geo && typeof geo.lat === "number" && typeof geo.lon === "number") ? { lat: geo.lat, lon: geo.lon } : null;

      store.snapshot();
      if (mode === "edit") {
        var patch = { type: type, label: label, attrs: finalAttrs, geo: finalGeo };
        /* refresh canonical ids when the identifier-bearing label/type changed */
        if (type === "phone" && M) patch.ids = Object.assign({}, editing.ids, { e164: M.normalisePhone(label).e164 });
        else if (type === "email" && M) patch.ids = Object.assign({}, editing.ids, { email: M.normaliseEmail(label) });
        else if (type === "vehicle" && St && St.identifiers) patch.ids = Object.assign({}, editing.ids, { vrm: St.identifiers.vrm.canonical(label) });
        store.updateEntity(opts.id, patch, "edited");
        if (window.CRInspector) window.CRInspector.show({ kind: "entity", id: opts.id });
      } else {
        var ent = store.addEntity({ type: type, label: label, attrs: finalAttrs, geo: finalGeo, origin: "manual" });
        if (typeof opts.onCreate === "function") opts.onCreate(ent);
      }
      close();
    }

    render();
    veil.appendChild(modal);
    document.body.appendChild(veil);
    veil.addEventListener("click", function (e) { if (e.target === veil) close(); });
    veil.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); save(); }
    });
    var lblEl = modal.querySelector("#ee-label");
    if (lblEl) { lblEl.focus(); lblEl.select(); }
  }

  window.CREditEntity = { open: open, _detectDobInLabel: detectDobInLabel, _toISO: toISO, _dobStore: dobStore };
})();
