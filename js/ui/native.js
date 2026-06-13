/* SOLAR — native.js
 * Capacitor bridge. Loads FIRST so later modules see the patched helpers.
 *
 * Design: the web app is untouched. On a native device we intercept the few
 * browser primitives that don't work inside a WebView and reroute them through
 * Capacitor plugins. On the web (or desktop .exe) every patch is a no-op and the
 * original behaviour runs. One export chokepoint: every Save/PNG/CSV/docx/i2/ANX
 * path in the app ends in `anchor.download = name; anchor.click()`, so a single
 * patch on HTMLAnchorElement.prototype.click captures them all.
 *
 * All analyst-supplied strings that reach the DOM still go through CRUtil.esc()
 * in their originating modules; this file adds no unescaped interpolation.
 */
(function () {
  "use strict";

  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
  var P = (Cap && Cap.Plugins) || {};

  // Expose platform flags for CSS / other modules.
  var root = document.documentElement;
  root.classList.add(isNative ? "is-native" : "is-web");
  if (Cap && Cap.getPlatform) root.classList.add("plat-" + Cap.getPlatform()); // plat-ios / plat-android / plat-web

  /* ---------- helpers ---------- */

  function extToMime(name) {
    var m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    var e = m ? m[1] : "";
    return ({
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      csv: "text/csv", txt: "text/plain", json: "application/json",
      xml: "application/xml", anx: "application/xml", html: "text/html",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    })[e] || "application/octet-stream";
  }

  // Resolve any href (blob: or data:) to a bare base64 string.
  function hrefToBase64(href) {
    if (/^data:/.test(href)) {
      var comma = href.indexOf(",");
      var meta = href.slice(5, comma);
      var body = href.slice(comma + 1);
      return Promise.resolve(/;base64/i.test(meta) ? body : btoa(unescape(encodeURIComponent(decodeURIComponent(body)))));
    }
    // blob: — fetch and re-encode
    return fetch(href).then(function (r) { return r.blob(); }).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var rd = new FileReader();
        rd.onload = function () {
          var s = String(rd.result);
          resolve(s.slice(s.indexOf(",") + 1));
        };
        rd.onerror = reject;
        rd.readAsDataURL(blob);
      });
    });
  }

  function status(msg) {
    if (window.CRApp && window.CRApp.status) window.CRApp.status(msg);
  }

  // Save base64 to a cache file then open the OS share sheet.
  function saveAndShare(filename, base64) {
    var FS = P.Filesystem, Share = P.Share;
    if (!FS || !Share) { status("Export unavailable on this device"); return; }
    return FS.writeFile({ path: filename, data: base64, directory: "CACHE" })
      .then(function (res) {
        return Share.share({
          title: filename,
          text: filename,
          url: res.uri,
          files: [res.uri],
          dialogTitle: "Save or send " + filename
        });
      })
      .then(function () { status("Exported " + filename); })
      .catch(function (err) {
        // User-cancelled share is not an error worth shouting about.
        if (err && /cancel/i.test(String(err.message || err))) return;
        status("Export failed: " + (err && err.message ? err.message : "share error"));
      });
  }

  /* ---------- 1. export chokepoint: patch anchor.click ---------- */

  if (isNative) {
    // util.download()/profiles revoke the blob URL ~200ms after click(); our
    // export read is async (fetch the blob -> base64), so defer revocation to
    // guarantee the URL is still valid when we read it (H-1 fix). Memory is
    // still freed, just a few seconds later.
    var _realRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = function (u) { setTimeout(function () { _realRevoke(u); }, 4000); };

    var nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      var dl = this.getAttribute && this.getAttribute("download");
      var href = this.href;
      if (dl && href && (/^blob:/.test(href) || /^data:/.test(href))) {
        var name = dl || "export";
        hrefToBase64(href).then(function (b64) { saveAndShare(name, b64); })
          .catch(function () { status("Could not prepare export"); });
        return; // swallow the WebView's no-op download
      }
      return nativeClick.apply(this, arguments);
    };
  }

  /* ---------- 2. external links → in-app browser ---------- */

  if (isNative && P.Browser) {
    var nativeOpen = window.open;
    window.open = function (url, target, features) {
      if (url && /^https?:/i.test(String(url))) {
        P.Browser.open({ url: String(url) }).catch(function () {});
        return null;
      }
      return nativeOpen ? nativeOpen.call(window, url, target, features) : null;
    };
  }

  /* ---------- 3. clipboard fallback ---------- */

  if (isNative && P.Clipboard) {
    if (!navigator.clipboard) navigator.clipboard = {};
    navigator.clipboard.writeText = function (text) {
      return P.Clipboard.write({ string: String(text) });
    };
  }

  /* ---------- 4. camera / gallery image acquisition ---------- */

  // Returns a Promise<dataUrl> or null if cancelled. source: 'camera'|'photos'|'prompt'
  function getImage(source) {
    if (isNative && P.Camera) {
      var src = source === "camera" ? "CAMERA" : source === "photos" ? "PHOTOS" : "PROMPT";
      return P.Camera.getPhoto({
        resultType: "dataUrl",
        source: src,
        quality: 88,
        correctOrientation: true,
        promptLabelHeader: "Add image",
        promptLabelPhoto: "Photo Library",
        promptLabelPicture: "Take Photo"
      }).then(function (p) { return p && p.dataUrl ? p.dataUrl : null; })
        .catch(function () { return null; }); // includes user cancel
    }
    // Web fallback: hidden file input (also exposes camera on mobile browsers).
    return new Promise(function (resolve) {
      var inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      if (source === "camera") inp.capture = "environment";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        if (!f) { resolve(null); return; }
        var rd = new FileReader();
        rd.onload = function () { resolve(String(rd.result)); };
        rd.onerror = function () { resolve(null); };
        rd.readAsDataURL(f);
      });
      inp.click();
    });
  }

  // (Entity-photo camera capture is wired at its natural seam in inspector.js,
  //  which calls CRNative.getImage() when running native.)

  /* ---------- 5. status bar + back button ---------- */

  if (isNative) {
    if (P.StatusBar) {
      P.StatusBar.setStyle({ style: "DARK" }).catch(function () {});
      if (Cap.getPlatform() === "android" && P.StatusBar.setBackgroundColor) {
        P.StatusBar.setBackgroundColor({ color: "#05060a" }).catch(function () {});
      }
    }
    // Android hardware back: close any open modal before exiting.
    if (P.App && P.App.addListener) {
      P.App.addListener("backButton", function () {
        var veil = document.querySelector(".veil.open, .modal-veil.open");
        if (veil) {
          var id = veil.id;
          if (id && window.CRUtil && window.CRUtil.closeModal) window.CRUtil.closeModal(id);
        } else if (P.App.exitApp) {
          P.App.exitApp();
        }
      });
    }
  }

  /* ---------- public API ---------- */

  window.CRNative = {
    isNative: isNative,
    platform: (Cap && Cap.getPlatform) ? Cap.getPlatform() : "web",
    getImage: getImage,        // (source) -> Promise<dataUrl|null>
    saveAndShare: saveAndShare // (filename, base64) -> Promise
  };
})();
