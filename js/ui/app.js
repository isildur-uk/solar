/* CHART ROOM — app.js
 * App shell: boot, toolbar wiring, search, deconfliction, save/load,
 * exports (JSON / PNG / i2 ANX), demo case, status bar.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var store = null;

  var SAMPLE_TEXT =
    "Geoffrey 'Gee' BAINES (DOB 20/12/1990), formerly known as Geoff SMITH, is a wanted subject " +
    "currently on bail. He is believed to be violent and may have access to firearms. BAINES uses " +
    "mobile 07686 868686 and email geoff.b@gmail.com, and contacts associates via Skype gee.baines88 " +
    "and Twitter @gee_b. His National Insurance number is AB123456C and he holds UK passport 503842156 " +
    "(United Kingdom). His PNC ID is 95/11112R and CRO 12345/86G. He drives a black BMW, registration " +
    "VK21 ABC, VIN WBA1234567VK21ABC.\n\n" +
    "On 04/05/2026 BAINES used this email to book flights to Malaga, paying GBP 1,500 from account " +
    "12345678 at sort code 20-00-00. He is flying from Bristol airport on 11/06/2026 at 14:30 and will " +
    "return on 20/06/2026. He will be staying at the hotel C. Maestranza, 20, Málaga-Este, 29016 Málaga, " +
    "Spain, telephone +34 965 06 43 61. When there, he is expected to purchase a new SIM card with the " +
    "number +34 612 123 123 and plans a day trip to SEVILLE on 15/06/2026.\n\n" +
    "BAINES is employed by Northgate Logistics Limited (company number 09876543, VAT 123456789), a firm " +
    "associated with Apex Freight PLC. His brother, Darren BAINES, is currently in custody. A known " +
    "associate, Maria van der BERG, communicated with BAINES on 02/06/2026 and transferred EUR 4,000 to " +
    "him. Surveillance logged the IP address 81.2.69.142 accessing the booking. Mr Ronald McDonald Jr is " +
    "the registered keeper of a white Ford Transit, registration AB12 CDE.";

  /* ---------------- boot ---------------- */

  function boot() {
    store = new window.CRModel.CaseStore();
    var hadLocal = store.loadLocal();

    window.CRGraph.init(U.el("chart"), store, onChartSelect);
    window.CRMapPane.init("map", store, selectEntity);
    window.CRTimeline.init(store, selectEntity);
    window.CRInspector.init(store);
    window.CRReview.init(store);
    window.CRImporter.init(store);
    if (window.CRDragDrop) window.CRDragDrop.init(store);
    if (window.CRProfiles) window.CRProfiles.init(store);
    if (window.CRIntelExport) window.CRIntelExport.init(store);
    if (window.CRLegend) window.CRLegend.init(store);
    if (window.CRChartMenu) window.CRChartMenu.init(store, U.el("chart"));

    wireToolbar();
    store.onChange(U.debounce(function () {
      store.saveLocal();
      updateStatus();
    }, 600));
    updateStatus();

    // first visit / empty case: the hero cover (js/ui/hero.js) is the
    // landing experience; it feeds extraction directly. Keep the sample
    // handy in the paste panel either way.
    if (!hadLocal) U.el("paste-text").value = SAMPLE_TEXT;
    if (hadLocal && store.entities.length) {
      var hinted = false;
      try { hinted = sessionStorage.getItem("solar_cover_hint") === "1"; } catch (e) { /* noop */ }
      if (!hinted) {
        setTimeout(function () {
          status("Tip — click the SOLAR brand for the full cover experience");
          try { sessionStorage.setItem("solar_cover_hint", "1"); } catch (e) { /* noop */ }
        }, 1600);
      }
    }
  }

  /* ---------------- selection plumbing ---------------- */

  function onChartSelect(sel) {
    _selectedEntityId = sel && sel.kind === "entity" ? sel.id : _selectedEntityId;
    if (!sel) {
      window.CRInspector.clear();
      window.CRMapPane.clearSelection();
      window.CRTimeline.highlightEntity(null);
      return;
    }
    window.CRInspector.show(sel);
    if (sel.kind === "entity") {
      window.CRMapPane.selectEntity(sel.id);
      window.CRTimeline.highlightEntity(sel.id);
    }
  }

  function selectEntity(id) {
    window.CRGraph.focus(id);
    window.CRInspector.show({ kind: "entity", id: id });
    window.CRMapPane.selectEntity(id);
    window.CRTimeline.highlightEntity(id);
  }

  /* ---------------- toolbar ---------------- */

  function wireToolbar() {
    U.el("btn-paste").addEventListener("click", function () {
      U.openModal("paste-veil");
      U.el("paste-text").focus();
    });
    U.el("paste-run").addEventListener("click", function () {
      var t = U.el("paste-text").value;
      if (!t.trim()) return;
      U.closeModal("paste-veil");
      window.CRReview.open(t);
    });
    U.el("paste-cancel").addEventListener("click", function () { U.closeModal("paste-veil"); });

    U.el("btn-url").addEventListener("click", function () { window.CRUrlImport.open(); });
    U.el("url-run").addEventListener("click", function () { window.CRUrlImport.run(); });
    U.el("url-cancel").addEventListener("click", function () { window.CRUrlImport.close(); });
    U.el("url-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); window.CRUrlImport.run(); }
    });

    U.el("review-commit").addEventListener("click", function () { window.CRReview.commit(); });
    U.el("review-cancel").addEventListener("click", function () { U.closeModal("review-veil"); });

    U.el("btn-csv").addEventListener("click", function () { window.CRImporter.open(); });
    U.el("btn-files").addEventListener("click", function () { U.el("files-input").click(); });
    U.el("files-input").addEventListener("change", function (e) {
      var picked = e.target.files;
      if (picked && picked.length && window.CRDragDrop) window.CRDragDrop.ingestFiles(picked);
      e.target.value = "";
    });
    U.el("csv-commit").addEventListener("click", function () { window.CRImporter.commit(); });
    U.el("csv-cancel").addEventListener("click", function () { U.closeModal("csv-veil"); });

    U.el("btn-dedup").addEventListener("click", openDedup);
    U.el("dedup-close").addEventListener("click", function () { U.closeModal("dedup-veil"); });

    U.el("btn-fit").addEventListener("click", function () { window.CRGraph.fit(); });
    (function () {
      var gb = U.el("btn-geo");
      if (gb) gb.addEventListener("click", function () {
        var hide = !window.CRGraph.geoHidden();
        window.CRGraph.setGeoHidden(hide);
        gb.textContent = hide ? "Geo: off" : "Geo: on";
        gb.classList.toggle("active", hide);
      });
    })();
    U.el("btn-physics").addEventListener("click", function () {
      var on = window.CRGraph.togglePhysics();
      U.el("btn-physics").textContent = on ? "Physics: on" : "Physics: off";
    });
    var layoutMenu = U.el("menu-layout");
    if (layoutMenu) layoutMenu.addEventListener("click", function (e) {
      var b = e.target.closest("[data-layout]");
      if (!b) return;
      var kind = b.getAttribute("data-layout");
      window.CRGraph.applyLayout(kind);
      U.el("btn-physics").textContent = kind === "organic" ? "Physics: on" : "Physics: off";
      status("Layout: " + b.textContent.trim() +
        (kind === "organic" ? "" : " — nodes pinned; drag to adjust"));
    });

    // keyboard QoL: Delete removes selection, Ctrl+Z undoes, F fits
    document.addEventListener("keydown", function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || document.querySelector(".modal-veil.open")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && window.CRGraph.getNetwork()) {
        var sel = window.CRGraph.getNetwork().getSelection();
        var nIds = (sel.nodes || []).filter(function (id) { return String(id).indexOf("bend|") !== 0; });
        if (!nIds.length && !(sel.edges || []).length) return;
        e.preventDefault();
        var msg = nIds.length ? ("Delete " + nIds.length + " selected entit" + (nIds.length === 1 ? "y" : "ies") + " and their links?")
                              : "Delete selected link(s)?";
        if (!window.confirm(msg)) return;
        store.snapshot();
        nIds.forEach(function (id) { store.removeEntity(id); });
        (sel.edges || []).forEach(function (eid) {
          var raw = String(eid);
          var lid = raw.indexOf("bseg|") === 0 ? raw.split("|")[1] : raw;
          if (store.links.some(function (l) { return l.id === lid; })) store.removeLink(lid);
        });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (!store.undo()) status("Nothing to undo");
      } else if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) {
        window.CRGraph.fit();
      }
    });
    U.el("btn-mapfit").addEventListener("click", function () { window.CRMapPane.fitToData(); });
    U.el("btn-undo").addEventListener("click", function () {
      if (!store.undo()) status("Nothing to undo");
    });
    // save / load / export
    U.el("btn-save").addEventListener("click", function () {
      U.download(safeName(store.meta.name) + ".chartroom.json",
        JSON.stringify(store.toJSON(), null, 1), "application/json");
    });
    U.el("btn-open").addEventListener("click", function () { U.el("case-file").click(); });
    U.el("case-file").addEventListener("change", function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          store.fromJSON(JSON.parse(rd.result));
          U.el("case-name").value = store.meta.name;
          status("Loaded " + f.name);
          setTimeout(function () { window.CRGraph.fit(); window.CRMapPane.fitToData(); }, 400);
        } catch (err) {
          status("Load failed: not a Chart Room case file");
        }
      };
      rd.readAsText(f);
      e.target.value = "";
    });
    U.el("btn-png").addEventListener("click", function () {
      var data = window.CRGraph.exportPNG();
      if (!data) { status("Nothing to export"); return; }
      var a = document.createElement("a");
      a.href = data;
      a.download = safeName(store.meta.name) + "_chart.png";
      a.click();
    });
    U.el("btn-anx").addEventListener("click", function () {
      U.openModal("export-veil");
    });
    U.el("btn-clear").addEventListener("click", function () {
      if (confirm("Clear the whole chart? (Undo available)")) {
        store.clear();
        window.CRInspector.clear();
      }
    });
    U.el("btn-demo").addEventListener("click", function () {
      U.el("paste-text").value = SAMPLE_TEXT;
      U.openModal("paste-veil");
    });
    // case meta
    U.el("case-name").value = store.meta.name;
    U.el("case-name").addEventListener("change", function () {
      store.meta.name = U.el("case-name").value.slice(0, 80) || "Untitled case";
      store.saveLocal();
    });
    // classification UI retired — exports stay marked OFFICIAL by default
    // date format is fixed to DD/MM (DMY)
    store.meta.dateFormat = "DMY";
    applyClassification();

    // search
    U.el("search").addEventListener("input", U.debounce(function () {
      var q = U.el("search").value.trim().toLowerCase();
      if (!q) { window.CRGraph.highlight(null); return; }
      var qPhone = window.CRMatch.normalisePhone(q).e164;
      var hits = store.entities.filter(function (e) {
        if (e.label.toLowerCase().indexOf(q) !== -1) return true;
        if (qPhone && e.ids && e.ids.e164 === qPhone) return true;
        if (e.ids && e.ids.email && e.ids.email.indexOf(q) !== -1) return true;
        return Object.keys(e.attrs).some(function (k) {
          return String(e.attrs[k]).toLowerCase().indexOf(q) !== -1;
        });
      }).map(function (e) { return e.id; });
      window.CRGraph.highlight(hits);
      status(hits.length + " match" + (hits.length === 1 ? "" : "es"));
    }, 250));
  }

  function applyClassification() {
    document.title = "Solar — " + (store.meta.classification || "OFFICIAL");
  }

  function safeName(s) {
    return String(s || "case").replace(/[^\w-]+/g, "_").slice(0, 60);
  }

  /* ---------------- deconfliction ---------------- */

  function openDedup() {
    var dupes = store.findDuplicates();
    var box = U.el("dedup-body");
    if (!dupes.length) {
      box.innerHTML = '<div class="placeholder" style="color:#5a6878;font:11px Consolas,monospace">No potential duplicates above threshold. Chart is clean.</div>';
    } else {
      box.innerHTML = dupes.slice(0, 30).map(function (d, i) {
        return '<div class="dup-pair" data-i="' + i + '">' +
          '<div class="cols">' +
          colHtml(d.a) + '<div class="vs">' + U.esc(d.tier).toUpperCase() + "<br>vs</div>" + colHtml(d.b) +
          "</div>" +
          '<div class="why">' + U.esc(d.reasons.join(" · ")) + "</div>" +
          '<div class="verdict">' +
          '<button class="btn primary" data-act="merge" data-a="' + U.escAttr(d.a.id) + '" data-b="' + U.escAttr(d.b.id) + '">Same — merge</button>' +
          '<button class="btn" data-act="distinct" data-a="' + U.escAttr(d.a.id) + '" data-b="' + U.escAttr(d.b.id) + '">Different — keep both</button>' +
          '<span class="note" style="color:#5a6878;font:10px Consolas,monospace">merge keeps the left entity, absorbs the right</span>' +
          "</div></div>";
      }).join("");
      box.querySelectorAll("button[data-act]").forEach(function (b) {
        b.addEventListener("click", function () {
          var a = b.getAttribute("data-a"), bb = b.getAttribute("data-b");
          if (b.getAttribute("data-act") === "merge") {
            store.mergeEntities(a, bb);
            status("Merged — audit trail preserved");
          } else {
            store.markDistinct(a, bb);
          }
          openDedup(); // refresh list
        });
      });
    }
    U.openModal("dedup-veil");
  }

  function colHtml(e) {
    var T = window.CRModel.ENTITY_TYPES[e.type] || { label: e.type };
    var bits = [];
    if (e.attrs.dob) bits.push("DOB " + U.fmtDate(e.attrs.dob));
    if (e.ids && e.ids.e164) bits.push(e.ids.e164);
    if (e.attrs.aka) bits.push("aka " + e.attrs.aka);
    bits.push((store.links.filter(function (l) { return l.from === e.id || l.to === e.id; }).length) + " links");
    return '<div class="col"><div class="nm">' + U.esc(e.label) + "</div>" +
      '<span class="ent-type t-' + U.escAttr(e.type) + '">' + U.esc(T.label) + "</span><br>" +
      U.esc(bits.join(" · ")) + "</div>";
  }

  /* ---------------- i2 ANX export ---------------- */

  function xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  var ANX_STRENGTH = { high: "Confirmed", med: "Unconfirmed", low: "Tentative" };

  function buildANX() {
    var TYPES = window.CRModel.ENTITY_TYPES;
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n<Chart IdReferenceLinking="false">\n <ChartItemCollection>\n';
    store.entities.forEach(function (e) {
      var p = e.provenance || {};
      var ty = TYPES[e.type] || {};
      var identity = (e.ids && (e.ids.e164 || e.ids.email)) || e.label;
      x += '  <ChartItem Label="' + xmlEsc(e.label) + '">\n' +
        '   <End>\n    <Entity EntityId="' + xmlEsc(e.id) + '" Identity="' + xmlEsc(identity) + '">\n' +
        '     <Icon><IconStyle Type="' + xmlEsc(ty.i2 || "General") + '"/></Icon>\n' +
        "    </Entity>\n   </End>\n" +
        "   <AttributeCollection>\n" +
        (ty.sem ? '    <Attribute AttributeClass="SemanticType" Value="' + xmlEsc(ty.sem) + '"/>\n' : "") +
        '    <Attribute AttributeClass="Grade1Source" Value="' + xmlEsc(p.source || "") + '"/>\n' +
        '    <Attribute AttributeClass="Grade2Assessment" Value="' + xmlEsc(p.assessment || "") + '"/>\n' +
        '    <Attribute AttributeClass="Grade3Handling" Value="' + xmlEsc(p.handling || "") + '"/>\n' +
        (e.attrs.dob ? '    <Attribute AttributeClass="DateOfBirth" Value="' + xmlEsc(e.attrs.dob) + '"/>\n' : "") +
        (e.ids && e.ids.e164 ? '    <Attribute AttributeClass="E164" Value="' + xmlEsc(e.ids.e164) + '"/>\n' : "") +
        (p.sourceRef ? '    <Attribute AttributeClass="SourceReference" Value="' + xmlEsc(p.sourceRef) + '"/>\n' : "") +
        "   </AttributeCollection>\n  </ChartItem>\n";
    });
    store.links.forEach(function (l) {
      var strength = l.negated ? "Tentative" : (ANX_STRENGTH[l.confidence] || "Unconfirmed");
      x += '  <ChartItem Label="' + xmlEsc(l.type.replace(/_/g, " ") + (l.dateISO ? " " + l.dateISO : "") + (l.negated ? " (denied)" : "")) + '">\n' +
        '   <Link End1Id="' + xmlEsc(l.from) + '" End2Id="' + xmlEsc(l.to) + '">\n' +
        '    <LinkStyle ArrowStyle="ArrowOnHead" Strength="' + strength + '" LineStyle="' +
        (strength === "Confirmed" ? "Solid" : (strength === "Unconfirmed" ? "Dashed" : "Dotted")) + '"/>\n' +
        "   </Link>\n  </ChartItem>\n";
    });
    x += " </ChartItemCollection>\n</Chart>\n";
    return x;
  }

  /* ---------------- status ---------------- */

  var _selectedEntityId = null;

  var statusTimer = null;
  function status(msg) {
    var n = U.el("status-msg");
    n.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { n.textContent = ""; }, 6000);
  }

  function updateStatus() {
    U.el("status-counts").textContent =
      store.entities.length + " entities · " + store.links.length + " links · " + store.events.length + " events";
    U.el("status-fmt").textContent = "dates " + (store.meta.dateFormat === "MDY" ? "MM/DD" : "DD/MM");
    U.el("status-save").textContent = "autosaved " + new Date().toTimeString().slice(0, 5);
  }

  function afterImport() {
    setTimeout(function () {
      window.CRGraph.fit();
      window.CRMapPane.fitToData();
      window.CRMapPane.invalidate();
    }, 450);
    updateStatus();
  }

  window.CRApp = {
    boot: boot, status: status, afterImport: afterImport, selectEntity: selectEntity,
    getStore: function () { return store; },
    getSelectedEntityId: function () { return _selectedEntityId; },
    exportANX: function () {
      U.download(safeName(store.meta.name) + ".anx", buildANX(), "application/xml");
      status("ANX exported — validate against an i2 import before relying on it");
    },
    sampleText: SAMPLE_TEXT
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
