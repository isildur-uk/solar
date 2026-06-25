/* CHART ROOM — inspector.js
 * Right-hand entity/link inspector: properties, NCA 3×5×2 provenance grading,
 * source snippet, audit trail.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var store = null;
  var current = null; // {kind:'entity'|'link', id}

  function init(caseStore) {
    store = caseStore;
    store.onChange(function (what) {
      if (current) show(current); // keep in sync
    });
    // Source extracts are clipped by default; tap/click to expand and read full.
    var insp = U.el("inspector");
    if (insp) insp.addEventListener("click", function (e) {
      var s = e.target.closest && e.target.closest(".srctext");
      if (s) s.classList.toggle("expanded");
    });
    clear();
  }

  function clear() {
    current = null;
    U.el("inspector").innerHTML =
      '<div class="placeholder">Select an entity or link on the chart.<br><br>' +
      "Paste Text or Import CSV to populate the chart; everything you add " +
      "passes through analyst review first.</div>";
  }

  function show(sel) {
    current = sel;
    if (sel.kind === "entity") showEntity(sel.id);
    else showLink(sel.id);
  }

  var ATTR_LABEL = { dob: "DOB", aka: "AKA", pnc: "PNC", cro: "CRO", nino: "NINO", vat: "VAT", vin: "VIN",
    iccid: "ICCID", imei: "IMEI", ip: "IP", companyNumber: "Company No.", sortCode: "Sort code",
    regFormat: "Reg. format", cc: "Country", iata: "IATA", colour: "Colour", make: "Make", model: "Model" };
  function attrLabel(k) { return ATTR_LABEL[k] || (k.charAt(0).toUpperCase() + k.slice(1)); }
  function attrValue(k, v) { return (k === "dob" && window.CRStandards) ? (window.CRStandards.ddmmyyyy(v) || v) : v; }
  var CHIP = "display:inline-block;padding:2px 7px;margin:2px 3px 0 0;border:1px solid #3a4a5e;border-radius:10px;background:#1b2735;color:#e8b34b;font-size:11px;cursor:pointer";
  function cmTermBlock(title, kind, codes, vocab) {
    var chips = codes.map(function (c) {
      var lbl = (vocab.filter(function (v) { return v.code === c; })[0] || {}).label || c;
      return '<span class="cm-chip" data-kind="' + kind + '" data-code="' + U.escAttr(c) + '" title="click to remove" style="' + CHIP + '">' + U.esc(lbl) + ' \u2715</span>';
    }).join("");
    var opts = '<option value="">+ add ' + U.esc(title.toLowerCase()) + '</option>' +
      vocab.filter(function (v) { return codes.indexOf(v.code) === -1; }).map(function (v) {
        return '<option value="' + U.escAttr(v.code) + '">' + U.esc(v.label) + '</option>';
      }).join("");
    return '<div class="cm-term" style="margin:4px 0">' +
      '<div style="color:#76879b;font-size:11px;margin:4px 0 2px">' + U.esc(title) + '</div>' +
      '<div class="cm-chips">' + (chips || '<span style="color:#5a6878">none</span>') + '</div>' +
      '<select class="cm-add" data-kind="' + kind + '" aria-label="add ' + U.escAttr(title) + '" style="margin-top:3px">' + opts + '</select></div>';
  }
  function provSelect(id, opts, val, label) {
    return '<select id="' + id + '" aria-label="' + U.escAttr(label) + '">' +
      opts.map(function (o) {
        return '<option value="' + U.escAttr(o) + '"' + (String(o) === String(val) ? " selected" : "") + ">" + U.esc(o) + "</option>";
      }).join("") + "</select>";
  }

  function showEntity(id) {
    var e = store.getEntity(id);
    if (!e) { clear(); return; }
    var T = window.CRModel.ENTITY_TYPES[e.type] || { label: e.type };
    var html = '<span class="type-chip t-' + U.escAttr(e.type) + '">' + U.esc(T.label) + "</span>" +
      "<h3>" + U.esc(e.label) + "</h3>";

    // attributes
    var rows = "";
    Object.keys(e.attrs).forEach(function (k) {
      if (k[0] === "_" || k === "cmStatus" || k === "cmWarnings" || k === "cm" || k === "cmValid" || k === "cmDate") return;
      rows += "<tr><td>" + U.esc(attrLabel(k)) + "</td><td>" + U.esc(attrValue(k, e.attrs[k])) + "</td></tr>";
    });
    if (e.ids && e.ids.e164) rows += "<tr><td>E.164</td><td>" + U.esc(e.ids.e164) + "</td></tr>";
    if (e.ids && e.ids.email) rows += "<tr><td>canonical</td><td>" + U.esc(e.ids.email) + "</td></tr>";
    if (e.geo) rows += "<tr><td>coords</td><td>" + U.esc(e.geo.lat.toFixed(4) + ", " + e.geo.lon.toFixed(4)) + "</td></tr>";
    if (rows) html += '<div class="sec">Attributes</div><table>' + rows + "</table>";

    // CM — recognised terms + canonical string
    var St2 = window.CRStandards;
    if (St2) {
      var cmHtml = "";
      if (e.attrs.cm) cmHtml += '<table><tr><td>CM</td><td>' + U.esc(e.attrs.cm) + '</td></tr></table>';
      if (e.type === "person") {
        cmHtml += cmTermBlock("Status of subject", "status", e.attrs.cmStatus || [], St2.STATUS_OF_SUBJECT);
        cmHtml += cmTermBlock("Warning signals", "warn", e.attrs.cmWarnings || [], St2.WARNING_SIGNALS);
      }
      if (cmHtml) html += '<div class="sec">CM — recognised terms</div>' + cmHtml;
    }

    // provenance 3×5×2: source evaluation 1–3, assessment A–E, handling P/C
    var F = window.CRFormat;
    var p = F.migrateProvenance(e.provenance);
    html += '<div class="sec">Grading — 3×5×2 <span style="color:#e8b34b">' + U.esc(F.gradeCode(p)) + "</span></div>" +
      '<table><tr><td>Source eval</td><td>' + provSelect("prov-source", ["1", "2", "3"], p.source, "source evaluation") +
      ' <span style="color:#76879b">' + U.esc(F.SOURCE_EVAL[p.source] || "") + "</span></td></tr>" +
      "<tr><td>Assessment</td><td>" + provSelect("prov-assessment", ["A", "B", "C", "D", "E"], p.assessment, "intelligence assessment") +
      ' <span style="color:#76879b">' + U.esc(F.ASSESSMENT[p.assessment] || "") + "</span></td></tr>" +
      "<tr><td>Handling</td><td>" + provSelect("prov-handling", ["P", "C"], p.handling, "handling code") +
      ' <span style="color:#76879b">' + U.esc(F.HANDLING[p.handling] || "") + "</span></td></tr>" +
      (p.handling === "C"
        ? '<tr><td>Conditions</td><td><input type="text" id="prov-conditions" value="' + U.escAttr(p.conditions || "") + '" placeholder="A1/A2/A3, S1/S2 + detail" aria-label="handling conditions"></td></tr>'
        : "") +
      '<tr><td>Source ref/URN</td><td><input type="text" id="prov-ref" value="' + U.escAttr(p.sourceRef || "") + '" aria-label="source reference"></td></tr></table>';

    // media gallery
    html += '<div class="sec">Photographs &amp; media</div><div id="insp-media" style="display:flex;flex-wrap:wrap;gap:6px">';
    (e.media || []).forEach(function (mm) {
      html += '<figure style="margin:0;text-align:center">' +
        '<img src="' + mm.dataUrl + '" alt="' + U.escAttr(mm.name) + '" style="width:64px;height:64px;object-fit:cover;border:2px solid ' +
        (mm.face ? "#e8b34b" : "#1f2a38") + ';border-radius:6px;cursor:pointer" data-med="' + U.escAttr(mm.id) + '" class="insp-med" title="' +
        U.escAttr(mm.name + (mm.face ? " (node face)" : " — click to set as node face")) + '">' +
        '<figcaption style="font:8px Consolas,monospace;color:#76879b;max-width:64px;overflow:hidden;text-overflow:ellipsis">' +
        U.esc(mm.name) + '</figcaption>' +
        '<button class="btn danger insp-med-del" data-med="' + U.escAttr(mm.id) + '" style="font-size:8px;padding:1px 4px" aria-label="remove image">✕</button>' +
        "</figure>";
    });
    html += '</div><button class="btn" id="insp-addphoto" style="margin-top:6px">+ Add photo</button>';

    // link-outs (analyst-initiated only — nothing automatic leaves the browser)
    if (e.type === "organisation") {
      html += '<div class="sec">External checks</div><div class="row-btns">' +
        '<button class="btn" id="insp-ch">Companies House ↗' +
        (e.attrs.companyNumber ? " (Co. " + U.esc(e.attrs.companyNumber) + ")" : " search") + "</button></div>";
    }
    if (e.type === "vehicle") {
      html += '<div class="sec">External checks</div><div class="row-btns">' +
        '<button class="btn" id="insp-dvla">DVLA vehicle enquiry ↗</button>' +
        '<button class="btn" id="insp-mot">MOT history ↗</button></div>';
    }

    // source text
    if (e.sourceText) {
      html += '<div class="sec">Source extract</div><div class="srctext">' + U.esc(e.sourceText) + "</div>";
    }

    // connections
    var conns = store.links.filter(function (l) { return l.from === id || l.to === id; });
    if (conns.length) {
      html += '<div class="sec">Links (' + conns.length + ")</div><table>";
      conns.slice(0, 14).forEach(function (l) {
        var otherId = l.from === id ? l.to : l.from;
        var other = store.getEntity(otherId);
        html += "<tr><td>" + U.esc(l.type.replace(/_/g, " ")) + "</td><td>" +
          (other ? U.esc(other.label) : "?") +
          (l.dateISO ? ' <span style="color:#5a6878">' + U.esc(U.fmtDate(l.dateISO)) + "</span>" : "") +
          "</td></tr>";
      });
      html += "</table>";
    }

    // audit
    html += '<div class="sec">Audit trail</div>';
    (e.audit || []).slice(-8).reverse().forEach(function (a) {
      html += '<div class="audit">' + U.esc(U.fmtTs(a.ts)) + " — " + U.esc(a.action) + (a.detail ? ": " + U.esc(a.detail) : "") + "</div>";
    });

    html += '<div class="row-btns">' +
      '<button class="btn" id="insp-edit">Edit…</button>' +
      (e.geo || (e.attrs && typeof e.attrs.lat === "number")
        ? '<button class="btn" id="insp-map">Show on map</button>' : "") +
      '<button class="btn danger" id="insp-del">Delete</button>' +
      "</div>";

    U.el("inspector").innerHTML = html;

    // wire provenance
    ["prov-source", "prov-assessment", "prov-handling"].forEach(function (pid) {
      var el2 = U.el(pid);
      if (el2) el2.addEventListener("change", saveProv);
    });
    var condEl2 = U.el("prov-conditions");
    if (condEl2) condEl2.addEventListener("change", saveProv);
    U.el("prov-ref").addEventListener("change", saveProv);

    function cmAttrKey(kind) { return kind === "status" ? "cmStatus" : "cmWarnings"; }
    function cmSave(kind, codes) {
      var a2 = {}; Object.keys(e.attrs).forEach(function (k) { a2[k] = e.attrs[k]; });
      if (codes.length) a2[cmAttrKey(kind)] = codes; else delete a2[cmAttrKey(kind)];
      store.snapshot();
      store.updateEntity(id, { attrs: a2 }, "CM " + kind + " updated");
    }
    document.querySelectorAll(".cm-add").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var kind = sel.getAttribute("data-kind"), code = sel.value;
        if (!code) return;
        var cur = (e.attrs[cmAttrKey(kind)] || []).slice();
        if (cur.indexOf(code) === -1) cur.push(code);
        cmSave(kind, cur);
      });
    });
    document.querySelectorAll(".cm-chip").forEach(function (ch) {
      ch.addEventListener("click", function () {
        var kind = ch.getAttribute("data-kind"), code = ch.getAttribute("data-code");
        cmSave(kind, (e.attrs[cmAttrKey(kind)] || []).filter(function (x) { return x !== code; }));
      });
    });

    // media wiring
    var addBtn = U.el("insp-addphoto");
    // Shared: take an image dataUrl, downscale to <=512px, store as entity media.
    function ingestImage(dataUrl, name) {
      var img = new Image();
      img.onload = function () {
        var cnv = document.createElement("canvas");
        var sc = Math.min(1, 512 / Math.max(img.width, img.height));
        cnv.width = Math.max(1, Math.round(img.width * sc));
        cnv.height = Math.max(1, Math.round(img.height * sc));
        cnv.getContext("2d").drawImage(img, 0, 0, cnv.width, cnv.height);
        store.addMedia(id, { name: name || "image.jpg", dataUrl: cnv.toDataURL("image/jpeg", 0.82) });
        maybeGeotag(dataUrl); // read EXIF GPS from the ORIGINAL (pre-downscale) image
      };
      img.src = dataUrl;
    }
    // If the original photo carries EXIF GPS, offer to pin it on the map and link
    // it to this entity. Coordinates only; nothing is added without consent.
    function maybeGeotag(originalDataUrl) {
      if (!window.CRExif) return;
      var ex = window.CRExif.parseDataUrl(originalDataUrl);
      if (!ex || ex.lat == null || ex.lon == null) return;
      var coord = ex.lat.toFixed(5) + ", " + ex.lon.toFixed(5);
      var ent = store.getEntity(id);
      var who = ent ? ent.label : "this entity";
      if (!window.confirm("This photo has GPS coordinates (" + coord + ").\nAdd it as a map location linked to " + who + "?")) return;
      var loc = store.addEntity({
        type: "location",
        label: "Photo location (" + coord + ")",
        geo: { lat: ex.lat, lon: ex.lon },
        origin: "photo EXIF GPS"
      });
      var spec = { from: id, to: loc.id, type: "LOCATED_IN", confidence: "high", origin: "photo EXIF GPS" };
      var iso = window.CRExif.exifDateToISO(ex.dateTimeOriginal);
      if (iso) spec.dateISO = iso;
      store.addLink(spec);
      if (window.CRApp && window.CRApp.status) window.CRApp.status("Pinned photo location " + coord + " — see Map");
    }
    if (addBtn) addBtn.addEventListener("click", function () {
      // Native device: use the OS camera/library picker via the Capacitor bridge.
      if (window.CRNative && window.CRNative.isNative) {
        window.CRNative.getImage("prompt").then(function (dataUrl) {
          if (dataUrl) ingestImage(dataUrl, "camera.jpg");
        });
        return;
      }
      // Web / desktop: hidden file input (mobile browsers also offer the camera).
      var inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.addEventListener("change", function () {
        var f = inp.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { ingestImage(String(rd.result), f.name); };
        rd.readAsDataURL(f);
      });
      inp.click();
    });
    document.querySelectorAll(".insp-med").forEach(function (n2) {
      n2.addEventListener("click", function () { store.setFace(id, n2.getAttribute("data-med")); });
    });
    document.querySelectorAll(".insp-med-del").forEach(function (n2) {
      n2.addEventListener("click", function () {
        if (confirm("Remove this image?")) store.removeMedia(id, n2.getAttribute("data-med"));
      });
    });

    // link-outs (open in a new tab; analyst-initiated)
    var chBtn = U.el("insp-ch");
    if (chBtn) chBtn.addEventListener("click", function () {
      var base = "https://find-and-update.company-information.service.gov.uk";
      var url = e.attrs.companyNumber
        ? base + "/company/" + encodeURIComponent(e.attrs.companyNumber)
        : base + "/search/companies?q=" + encodeURIComponent(e.label);
      window.open(url, "_blank", "noopener");
    });
    var dvlaBtn = U.el("insp-dvla");
    if (dvlaBtn) dvlaBtn.addEventListener("click", function () {
      var reg = window.CRFormat.vrm(e.label);
      if (navigator.clipboard) navigator.clipboard.writeText(reg).catch(function () {});
      window.CRApp.status("VRM " + reg + " copied — paste into the DVLA form");
      window.open("https://vehicleenquiry.service.gov.uk/", "_blank", "noopener");
    });
    var motBtn = U.el("insp-mot");
    if (motBtn) motBtn.addEventListener("click", function () {
      var reg = window.CRFormat.vrm(e.label);
      if (navigator.clipboard) navigator.clipboard.writeText(reg).catch(function () {});
      window.open("https://www.check-mot.service.gov.uk/", "_blank", "noopener");
      window.CRApp.status("VRM " + reg + " copied — paste into the MOT history form");
    });
    function saveProv() {
      var condEl = U.el("prov-conditions");
      var np = {
        source: U.el("prov-source").value,
        assessment: U.el("prov-assessment").value,
        handling: U.el("prov-handling").value,
        conditions: condEl ? condEl.value : (p.conditions || ""),
        sourceRef: U.el("prov-ref").value,
        gradedBy: "analyst"
      };
      store.updateEntity(id, { provenance: np }, "3x5x2 regraded to " + np.source + np.assessment + np.handling);
    }

    U.el("insp-edit").addEventListener("click", function () {
      window.CREditEntity.open({ store: store, id: id });
    });
    var mapBtn = U.el("insp-map");
    if (mapBtn) mapBtn.addEventListener("click", function () { window.CRMapPane.selectEntity(id); });
    U.el("insp-del").addEventListener("click", function () {
      if (confirm("Delete \"" + e.label + "\" and its links?")) {
        store.snapshot();
        store.removeEntity(id);
        clear();
      }
    });
  }

  function showLink(id) {
    var l = store.links.find(function (x) { return x.id === id; });
    if (!l) { clear(); return; }
    var a = store.getEntity(l.from), b = store.getEntity(l.to);
    var html = '<span class="type-chip t-event">LINK</span>' +
      "<h3>" + (a ? U.esc(a.label) : "?") + " → " + (b ? U.esc(b.label) : "?") + "</h3>" +
      '<div class="sec">Properties</div><table>' +
      "<tr><td>Type</td><td>" +
      '<select id="lnk-type" aria-label="link type">' +
      window.CRModel.LINK_TYPES.map(function (t) {
        return '<option value="' + U.escAttr(t) + '"' + (t === l.type ? " selected" : "") + ">" + U.esc(t.replace(/_/g, " ")) + "</option>";
      }).join("") + "</select></td></tr>" +
      "<tr><td>Confidence</td><td>" +
      '<select id="lnk-conf" aria-label="link confidence">' +
      ["high", "med", "low"].map(function (c) {
        return '<option value="' + c + '"' + (c === l.confidence ? " selected" : "") + ">" + c + "</option>";
      }).join("") + "</select></td></tr>" +
      (l.dateISO ? "<tr><td>Date</td><td>" + U.esc(U.fmtDate(l.dateISO)) + "</td></tr>" : "") +
      (l.modality ? "<tr><td>Modality</td><td>" + U.esc(l.modality) + (l.negated ? " — DENIED" : "") + "</td></tr>" : "") +
      (l.amount ? "<tr><td>Amount</td><td>" + U.esc(l.amount) + "</td></tr>" : "") +
      "</table>";
    if (l.sentence) html += '<div class="sec">Source sentence</div><div class="srctext">' + U.esc(l.sentence) + "</div>";
    html += '<div class="sec">Audit trail</div>';
    (l.audit || []).slice(-6).reverse().forEach(function (x) {
      html += '<div class="audit">' + U.esc(U.fmtTs(x.ts)) + " — " + U.esc(x.action) + (x.detail ? ": " + U.esc(x.detail) : "") + "</div>";
    });
    html += '<div class="row-btns"><button class="btn" id="lnk-flip">Reverse direction</button>' +
      '<button class="btn danger" id="lnk-del">Delete link</button></div>';
    U.el("inspector").innerHTML = html;

    U.el("lnk-type").addEventListener("change", function () {
      store.snapshot();
      store.updateLink(id, { type: U.el("lnk-type").value }, "type changed");
    });
    U.el("lnk-conf").addEventListener("change", function () {
      store.snapshot();
      store.updateLink(id, { confidence: U.el("lnk-conf").value }, "confidence regraded");
    });
    U.el("lnk-flip").addEventListener("click", function () {
      store.snapshot();
      store.updateLink(id, { from: l.to, to: l.from }, "direction reversed");
    });
    U.el("lnk-del").addEventListener("click", function () {
      store.snapshot();
      store.removeLink(id);
      clear();
    });
  }

  window.CRInspector = { init: init, show: show, clear: clear };
})();
