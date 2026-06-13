/* CHART ROOM — importer.js
 * CSV import wizard: PapaParse → per-column type auto-detection (analyst
 * confirms the mapping) → entities + row-wise links, with exact-match
 * dedupe against the existing chart. Strong fuzzy matches are left for the
 * Deconfliction panel — bulk import never fuzzy-merges silently.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var store = null;
  var parsed = null;   // {fields:[], rows:[{}]}
  var colTypes = {};   // field -> type string ('skip' allowed)

  var COL_TYPES = ["skip", "person", "phone", "email", "address", "location",
    "organisation", "vehicle", "account", "ip", "money", "date", "text-attr"];

  function init(caseStore) {
    store = caseStore;
    U.el("csv-file").addEventListener("change", function (e) {
      var f = e.target.files[0];
      if (f) parseFile(f);
      e.target.value = "";
    });
  }

  function open() {
    U.el("csv-stage-pick").style.display = "";
    U.el("csv-stage-map").style.display = "none";
    U.el("csv-commit").disabled = true;
    U.openModal("csv-veil");
  }

  function parseFile(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: function (res) {
        if (!res.data || !res.data.length) {
          U.el("csv-info").textContent = "No rows found in " + file.name;
          return;
        }
        parsed = { fields: res.meta.fields || [], rows: res.data, name: file.name };
        autoDetect();
        renderMapping();
      },
      error: function (err) {
        U.el("csv-info").textContent = "Parse error: " + err.message;
      }
    });
  }

  function autoDetect() {
    colTypes = {};
    parsed.fields.forEach(function (f) {
      var vals = parsed.rows.slice(0, 50).map(function (r) { return r[f]; });
      var det = window.CRExtract.detectColumnType(vals);
      // header-name nudges
      var h = f.toLowerCase();
      if (det.confidence === "low") {
        if (/phone|mobile|msisdn|tel/.test(h)) det = { type: "phone", confidence: "med" };
        else if (/mail/.test(h)) det = { type: "email", confidence: "med" };
        else if (/name|subject|person/.test(h)) det = { type: "person", confidence: "med" };
        else if (/address|addr/.test(h)) det = { type: "address", confidence: "med" };
        else if (/city|town|location|place|country/.test(h)) det = { type: "location", confidence: "med" };
        else if (/reg|vrm|plate/.test(h)) det = { type: "vehicle", confidence: "med" };
        else if (/date|dob/.test(h)) det = { type: "date", confidence: "med" };
        else if (/company|org/.test(h)) det = { type: "organisation", confidence: "med" };
      }
      colTypes[f] = { type: det.type === "text" ? "text-attr" : det.type, det: det };
    });
  }

  function renderMapping() {
    U.el("csv-stage-pick").style.display = "none";
    U.el("csv-stage-map").style.display = "";
    U.el("csv-info").textContent = parsed.name + " — " + parsed.rows.length + " rows, " + parsed.fields.length + " columns. Confirm column types:";

    var head = "<tr>" + parsed.fields.map(function (f) {
      var ct = colTypes[f];
      var sel = '<select data-field="' + U.escAttr(f) + '" class="csv-type" aria-label="type for column ' + U.escAttr(f) + '">' +
        COL_TYPES.map(function (t) {
          return '<option value="' + U.escAttr(t) + '"' + (t === ct.type ? " selected" : "") + ">" + U.esc(t) + "</option>";
        }).join("") + "</select>";
      var det = ct.det && ct.det.type !== "text"
        ? '<span class="det">auto: ' + U.esc(ct.det.type) + " (" + U.esc(ct.det.confidence) + ")</span>"
        : '<span class="det" style="color:#5a6878">unrecognised</span>';
      return "<th>" + U.esc(f) + "<br>" + det + sel + "</th>";
    }).join("") + "</tr>";

    var body = parsed.rows.slice(0, 8).map(function (r) {
      return "<tr>" + parsed.fields.map(function (f) {
        return "<td>" + U.esc(U.truncate(r[f], 38)) + "</td>";
      }).join("") + "</tr>";
    }).join("");

    U.el("csv-table").innerHTML = head + body;

    // hub column choice (rows become star-linked to this column's entity)
    var hubSel = U.el("csv-hub");
    hubSel.innerHTML = '<option value="">— no row links —</option>' +
      parsed.fields.map(function (f) {
        return '<option value="' + U.escAttr(f) + '">' + U.esc(f) + "</option>";
      }).join("");
    // default: first person column
    var firstPerson = parsed.fields.find(function (f) { return colTypes[f].type === "person"; });
    if (firstPerson) hubSel.value = firstPerson;

    document.querySelectorAll(".csv-type").forEach(function (n) {
      n.addEventListener("change", function () {
        colTypes[n.getAttribute("data-field")].type = n.value;
      });
    });

    U.el("csv-commit").disabled = false;
  }

  function commit() {
    if (!parsed) return;
    store.snapshot();
    var batch = "CSV " + parsed.name + " " + new Date().toISOString().slice(0, 10);
    var hub = U.el("csv-hub").value;
    var linkType = U.el("csv-linktype").value || "LINKED_TO";
    var added = 0, matched = 0, links = 0, skipped = 0;

    // cache for within-file dedupe
    var seen = {}; // type|canon -> id

    function upsert(type, label, rowIdx, extraAttrs) {
      label = String(label || "").trim();
      if (!label) return null;
      var ids = {};
      if (type === "phone") {
        var p = window.CRMatch.normalisePhone(label);
        if (p.e164) { ids.e164 = p.e164; label = p.e164; }
      }
      if (type === "email") {
        var em = window.CRMatch.normaliseEmail(label);
        if (em) ids.email = em;
      }
      var canonKey = type + "|" + (ids.e164 || ids.email || window.CRMatch.canonicalName(label));
      if (seen[canonKey]) return seen[canonKey];

      // exact-tier match against chart → reuse silently (it IS the same identifier);
      // strong fuzzy → still add, Deconfliction panel will surface it.
      var sugg = window.CRMatch.matchEntity({ type: type, label: label, ids: ids }, store.entities);
      if (sugg.length && sugg[0].tier === "exact") {
        matched++;
        seen[canonKey] = sugg[0].entity.id;
        sugg[0].entity.audit.push({ ts: new Date().toISOString(), action: "seen in import", detail: batch + " row " + (rowIdx + 1) });
        return sugg[0].entity.id;
      }
      var geo = null;
      if (type === "location" && window.CRGeo) {
        var g = window.CRGeo.lookup(label);
        if (g) geo = { lat: g.lat, lon: g.lon };
      }
      var e = store.addEntity({
        type: type, label: label, ids: ids, geo: geo,
        attrs: extraAttrs || {},
        provenance: { source: "B", intel: 2, handling: "P", sourceRef: batch, gradedBy: "" },
        origin: batch + " row " + (rowIdx + 1)
      });
      added++;
      seen[canonKey] = e.id;
      return e.id;
    }

    parsed.rows.forEach(function (row, idx) {
      var hubId = null;
      var rowEnts = [];
      var textAttrs = {};
      parsed.fields.forEach(function (f) {
        var t = colTypes[f].type;
        if (t === "skip") return;
        if (t === "text-attr" || t === "date") {
          if (row[f]) textAttrs[f] = String(row[f]).slice(0, 300);
          return;
        }
        var id = upsert(t, row[f], idx);
        if (!id) { skipped++; return; }
        rowEnts.push(id);
        if (f === hub) hubId = id;
      });
      // attach text attrs to the hub entity (or first entity)
      var owner = hubId || rowEnts[0];
      if (owner && Object.keys(textAttrs).length) {
        var oe = store.getEntity(owner);
        Object.keys(textAttrs).forEach(function (k) {
          if (oe.attrs[k] === undefined) oe.attrs[k] = textAttrs[k];
        });
      }
      // star links
      if (hubId) {
        rowEnts.forEach(function (id) {
          if (id === hubId) return;
          var l = store.addLink({ from: hubId, to: id, type: linkType, confidence: "med", origin: batch });
          if (l) links++;
        });
      }
    });

    store._emit("import");
    U.closeModal("csv-veil");
    parsed = null;
    if (window.CRApp) {
      window.CRApp.afterImport();
      window.CRApp.status(added + " added, " + matched + " matched existing, " + links + " links — run Deconflict to review fuzzy duplicates");
    }
  }

  // Open the wizard pre-loaded with a dropped File (drag-and-drop entry point).
  function importFile(file) {
    open();
    if (file) parseFile(file);
  }

  window.CRImporter = { init: init, open: open, commit: commit, importFile: importFile };
})();
