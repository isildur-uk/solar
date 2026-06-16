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

  function injectCamera() {
    var pop = document.querySelector("#menu-add .menu-pop");
    if (!pop || document.getElementById("btn-camera")) return;
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.setAttribute("capture", "environment");   // opens the rear camera on mobile
    inp.className = "visually-hidden";
    inp.setAttribute("aria-hidden", "true");
    inp.tabIndex = -1;
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      inp.value = "";
      if (f) handleImages([f]);
    });
    var btn = document.createElement("button");
    btn.className = "btn";
    btn.id = "btn-camera";
    btn.type = "button";
    btn.textContent = "Take Photo";
    btn.title = "Capture a photo with the camera; reads EXIF GPS, or offers your current location";
    btn.addEventListener("click", function () { inp.click(); });
    pop.appendChild(btn);
    pop.appendChild(inp);
  }

  function init(caseStore) {
    store = caseStore;
    injectCamera();
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

  function isImageFile(f) {
    return /^image\//.test(f.type || "") || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(f.name || "");
  }

  function readAsDataUrl(file) {
    return new Promise(function (res, rej) {
      var rd = new FileReader();
      rd.onload = function () { res(String(rd.result)); };
      rd.onerror = function () { rej(new Error("read error")); };
      rd.readAsDataURL(file);
    });
  }

  // Standalone photo import: read EXIF GPS (offer a map pin, with consent) and OCR
  // the image into the review pipeline. No selected subject required.
  function handleImages(images) {
    dismissHero();
    status("Reading " + images.length + " photo" + (images.length === 1 ? "" : "s") + " — EXIF + OCR…");
    var pins = [], texts = [], seq = Promise.resolve();
    images.forEach(function (img) {
      seq = seq.then(function () {
        return readAsDataUrl(img).then(function (dataUrl) {
          if (window.CRExif) {
            var ex = window.CRExif.parseDataUrl(dataUrl);
            if (ex && ex.lat != null && ex.lon != null) {
              pins.push({ name: img.name, lat: ex.lat, lon: ex.lon,
                iso: window.CRExif.exifDateToISO(ex.dateTimeOriginal) });
            }
          }
          if (window.CROCR && window.CROCR.recognizeDataUrl) {
            return window.CROCR.recognizeDataUrl(dataUrl).then(function (t) {
              if (t && t.trim()) texts.push("===== " + img.name + " =====\n" + t.trim());
            }).catch(function () { /* OCR failed for this image; keep EXIF + other images */ });
          }
        });
      });
    });
    seq.then(function () {
      if (pins.length) {
        var summary = pins.map(function (p) {
          return p.name + " → " + p.lat.toFixed(5) + ", " + p.lon.toFixed(5);
        }).join("\n");
        if (window.confirm(pins.length + " photo" + (pins.length === 1 ? "" : "s") +
            " carry GPS coordinates:\n\n" + summary +
            "\n\nAdd as map location pin" + (pins.length === 1 ? "" : "s") + "?")) {
          pins.forEach(function (p) {
            var coord = p.lat.toFixed(5) + ", " + p.lon.toFixed(5);
            store.addEntity({ type: "location", label: "Photo location (" + coord + ")",
              geo: { lat: p.lat, lon: p.lon }, origin: "photo EXIF GPS — " + p.name });
          });
          if (window.CRApp && window.CRApp.afterImport) window.CRApp.afterImport();
        }
      } else if (navigator.geolocation && window.confirm(
          images.length + " photo" + (images.length === 1 ? "" : "s") +
          " had no embedded GPS — phones strip a photo's location when it is shared to the web.\n\n" +
          "Use your device's CURRENT location to place " + (images.length === 1 ? "it" : "them") +
          " on the map instead?")) {
        status("Getting your current location…");
        navigator.geolocation.getCurrentPosition(function (pos) {
          var lat = pos.coords.latitude, lon = pos.coords.longitude;
          var coord = lat.toFixed(5) + ", " + lon.toFixed(5);
          store.addEntity({ type: "location", label: "Photo location (" + coord + ")",
            geo: { lat: lat, lon: lon }, origin: "device current location" });
          if (window.CRApp && window.CRApp.afterImport) window.CRApp.afterImport();
          status("Pinned current location " + coord + " — see Map");
        }, function (err) {
          status("Current location unavailable: " + (err && err.message || "permission denied"));
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
      }
      if (texts.length) {
        window.CRReview.open(texts.join("\n\n"),
          images.map(function (i) { return i.name; }).join(", "));
      }
      var bits = [];
      bits.push(pins.length ? (pins.length + " geotagged") : "no GPS found");
      bits.push(texts.length ? (texts.length + " with readable text") : "no readable text");
      status("Photos processed — " + bits.join(", ") + (texts.length ? " — review before adding" : ""));
    }).catch(function (e) { status("Photo import failed: " + (e && e.message || "error")); });
  }

  function handleFiles(files) {
    var imgs = files.filter(isImageFile);
    var rest = files.filter(function (f) { return !isImageFile(f); });
    if (imgs.length) handleImages(imgs);
    if (!rest.length) return;
    status("Reading " + rest.length + " file" + (rest.length === 1 ? "" : "s") + "...");
    Promise.all(rest.map(function (f) { return window.CRFileRead.readFile(f); }))
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
