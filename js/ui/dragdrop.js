/* SOLAR — dragdrop.js
 * Drag-and-drop ingest. Drop intelligence files anywhere on the window:
 *   - a single Chart Room .json case  -> load / replace (confirm if chart populated)
 *   - a single .csv                   -> open the import wizard pre-loaded
 *   - anything else (txt/md/docx/pdf, one or many) -> combined into ONE extraction
 *     review screen, so shared entities dedupe into a connected chart.
 * Unreadable files (e.g. scanned PDFs) are reported, never silently dropped.
 * Listeners are CAPTURE-phase on window AND document so no inner element
 * (hero cover, vis-network canvas, leaflet map) can swallow the drop.
 * Depends on: CRFileRead, CRReview, CRImporter, CRApp, (optional) CRHero.
 * Browser: window.CRDragDrop.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var store = null;
  var dragDepth = 0;
  var overlay = null;

  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt) return false;
    if (dt.types) {
      for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === "Files") return true;
    }
    return !!(dt.files && dt.files.length);
  }

  function filesFrom(dt) {
    if (!dt) return [];
    if (dt.files && dt.files.length) return Array.prototype.slice.call(dt.files);
    var out = [];
    if (dt.items) {
      for (var i = 0; i < dt.items.length; i++) {
        var it = dt.items[i];
        if (it.kind === "file") { var f = it.getAsFile && it.getAsFile(); if (f) out.push(f); }
      }
    }
    return out;
  }

  function showOverlay(on) { if (overlay) overlay.classList.toggle("show", !!on); }

  function onEnter(e) { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; showOverlay(true); }
  function onOver(e)  { if (!hasFiles(e)) return; e.preventDefault(); try { e.dataTransfer.dropEffect = "copy"; } catch (_) {} showOverlay(true); }
  function onLeave(e) { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) showOverlay(false); }
  function onDrop(e)  {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0; showOverlay(false);
    var files = filesFrom(e.dataTransfer);
    if (!files.length) return;
    // Photo drop: an image released over a chart node becomes that node's face.
    var images = files.filter(function (f) { return /^image\//.test(f.type || "") || /\.(png|jpe?g|gif|webp)$/i.test(f.name || ""); });
    if (images.length === files.length && window.CRGraph && window.CRGraph.nodeAtDOM) {
      var chart = U.el("chart");
      if (chart) {
        var rect = chart.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          var nid = window.CRGraph.nodeAtDOM(e.clientX - rect.left, e.clientY - rect.top);
          if (nid) {
            var img = images[0];
            var rd = new FileReader();
            rd.onload = function () {
              store.addMedia(nid, { name: img.name, dataUrl: rd.result, face: true });
              var ent = store.getEntity(nid);
              status("Photo set on " + (ent ? ent.label : "entity"));
            };
            rd.readAsDataURL(img);
            return;
          }
          status("Drop the photo onto an entity to set its picture");
          return;
        }
      }
    }
    handleFiles(files);
  }

  function init(caseStore) {
    store = caseStore;
    overlay = U.el("drop-overlay");
    if (!overlay) return;
    // capture phase + both targets: we see the event before anything else can stop it,
    // and preventDefault stops the browser from navigating to the dropped file.
    var T = [window, document];
    for (var i = 0; i < T.length; i++) {
      T[i].addEventListener("dragenter", onEnter, true);
      T[i].addEventListener("dragover",  onOver,  true);
      T[i].addEventListener("dragleave", onLeave, true);
      T[i].addEventListener("drop",      onDrop,  true);
    }
  }

  function status(msg) { if (window.CRApp) window.CRApp.status(msg); }
  function dismissHero() { if (window.CRHero && window.CRHero.close) { try { window.CRHero.close(); } catch (_) {} } }

  function handleFiles(files) {
    status("Reading " + files.length + " file" + (files.length === 1 ? "" : "s") + "...");
    Promise.all(files.map(function (f) { return window.CRFileRead.readFile(f); }))
      .then(route)
      .catch(function (err) { status("Drop failed: " + (err && err.message || "read error")); });
  }

  function route(results) {
    var cases = results.filter(function (r) { return r.kind === "case"; });
    var csvs  = results.filter(function (r) { return r.kind === "csv"; });
    var texts = results.filter(function (r) { return r.kind === "text"; });
    var bad   = results.filter(function (r) { return r.kind === "unsupported"; });

    // 1) Case file -> load / replace (single-case semantics).
    if (cases.length) {
      var c = cases[0];
      var populated = store && store.entities && store.entities.length > 0;
      if (populated && !window.confirm(
        "Load case \"" + c.name + "\"? This replaces the current chart (" +
        store.entities.length + " entities). Your current case stays in local autosave history.")) {
        status("Case load cancelled");
        return;
      }
      try {
        store.fromJSON(c.json);
        dismissHero();
        if (U.el("case-name")) U.el("case-name").value = store.meta.name;
        if (window.CRApp) window.CRApp.afterImport();
        var extra = results.length - 1;
        status("Loaded case " + c.name + (extra > 0 ? " (" + extra + " other file(s) ignored - drop a case on its own)" : ""));
      } catch (e) {
        status("Case load failed: not a valid Chart Room file");
      }
      return;
    }

    // 2) A single CSV -> the import wizard (its own mapping/merge flow).
    if (csvs.length && !texts.length) {
      dismissHero();
      window.CRImporter.importFile(csvs[0].file);
      if (csvs.length > 1)
        status("Opened " + csvs[0].name + " - drop CSVs one at a time for the mapping step");
      return;
    }

    // 3) Everything readable -> ONE combined review.
    var parts = [];
    texts.forEach(function (t) { parts.push("===== " + t.name + " =====\n" + t.text); });
    var notes = [];
    if (csvs.length) notes.push(csvs.length + " CSV(s) skipped (drop CSVs separately for the wizard)");
    bad.forEach(function (b) { notes.push(b.name + ": " + (b.reason || "unsupported")); });

    if (!parts.length) {
      status(notes.length ? ("Nothing ingestible - " + notes.join("; ")) : "No readable text in dropped files");
      return;
    }

    dismissHero();
    window.CRReview.open(parts.join("\n\n"),
      texts.map(function (t) { return t.name; }).join(", "));
    var msg = "Extracted from " + texts.length + " file" + (texts.length === 1 ? "" : "s") + " - review before adding";
    if (notes.length) msg += "  -  " + notes.join("; ");
    status(msg);
  }

  // Programmatic entry for the toolbar 'Add Files' picker — same routing as a drop.
  function ingestFiles(list) {
    var arr = Array.prototype.slice.call(list || []);
    if (arr.length) handleFiles(arr);
  }

  window.CRDragDrop = { init: init, ingestFiles: ingestFiles };
})();
