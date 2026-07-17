/* SOLAR — translate.js  (window.CRTranslate)
 * Optional, LOCAL, offline machine-translation client for LibreTranslate.
 * Dependency-free, Node-testable. Mirrors the optional-augmentation pattern used
 * by CRSmartNER: if the local server isn't there, everything no-ops and SOLAR
 * runs exactly as before.
 *
 * BOUNDARIES (deliberate):
 *  - ARM'S-LENGTH / LICENCE: talks to a separately-run LibreTranslate server over
 *    HTTP only (default http://127.0.0.1:5000). SOLAR never bundles, imports or
 *    modifies LibreTranslate (which is AGPL-3.0); calling its REST API from a
 *    separate process keeps SOLAR clear of that copyleft.
 *  - PRIVACY: only ever calls the configured localhost endpoint. The server binds
 *    127.0.0.1, so foreign-language material never leaves the machine.
 *  - GISTING ONLY: MT output is an analytic aid, never certified translation.
 *    Callers MUST flag anything derived from it — use provenanceTag() so every
 *    MT batch is labelled identically.
 *  - DESKTOP ONLY in practice: an https page (e.g. the hosted deployment) calling
 *    http://127.0.0.1 is mixed-content and will be blocked by the browser; the
 *    probe simply fails and the feature stays hidden. Works from the .exe, the
 *    LAN server and file://.
 *
 * LibreTranslate API used: GET /languages, POST /detect {q}, POST /translate
 * {q, source, target, format}. No api_key (the local default has none).
 */
(function () {
  "use strict";

  var ENDPOINT = "http://127.0.0.1:5000";
  var AVAIL_TTL = 30000;        // re-probe availability at most this often (ms)

  var _availCache = null;       // null = unknown; true/false once probed
  var _availAt = 0;             // timestamp of last probe
  var _languages = null;        // cached /languages payload

  function endpoint() { return ENDPOINT; }
  function setEndpoint(url) {
    ENDPOINT = String(url || "").replace(/\/+$/, "") || ENDPOINT;
    _availCache = null; _languages = null; _availAt = 0;
  }

  // fetch with a hard timeout. Uses global fetch (browser, or Node >= 18).
  function _fetch(path, opts, timeoutMs) {
    if (typeof fetch !== "function") return Promise.reject(new Error("fetch unavailable"));
    opts = opts || {};
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = null;
    if (ctrl) { opts.signal = ctrl.signal; timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000); }
    return fetch(ENDPOINT + path, opts).then(
      function (r) { if (timer) clearTimeout(timer); return r; },
      function (e) { if (timer) clearTimeout(timer); throw e; }
    );
  }

  // Probe whether a LibreTranslate server is reachable. Cached with a TTL so the
  // UI can call it freely. ALWAYS resolves (true/false) — never rejects.
  function available(force) {
    var now = Date.now();
    if (!force && _availCache !== null && (now - _availAt) < AVAIL_TTL) {
      return Promise.resolve(_availCache);
    }
    return _fetch("/languages", { method: "GET" }, 4000)
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (list) {
        _languages = Array.isArray(list) ? list : null;
        _availCache = !!_languages; _availAt = Date.now();
        return _availCache;
      })
      .catch(function () { _availCache = false; _availAt = Date.now(); _languages = null; return false; });
  }

  // Cached /languages list (codes the server can handle). [] if unknown.
  function languages() { return _languages ? _languages.slice() : []; }

  // Detect source language. Resolves { language, confidence } or null (never rejects).
  function detect(text) {
    if (!text || !text.trim()) return Promise.resolve(null);
    return _fetch("/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text.slice(0, 2000) })
    }, 8000)
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (arr) {
        if (!Array.isArray(arr) || !arr.length) return null;
        return { language: arr[0].language, confidence: arr[0].confidence };
      })
      .catch(function () { return null; });
  }

  // Translate text -> target (default "en"). source "auto" lets the server detect.
  // Resolves { text, from, to }; REJECTS with an Error on failure (caller shows UI).
  function translate(text, source, target) {
    target = target || "en";
    source = source || "auto";
    if (!text || !text.trim()) return Promise.resolve({ text: text, from: source, to: target });
    return _fetch("/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: source, target: target, format: "text" })
    }, 30000).then(function (r) {
      if (!r || !r.ok) {
        return (r ? r.text() : Promise.resolve("")).then(function (b) {
          throw new Error("LibreTranslate HTTP " + (r ? r.status : "?") + (b ? ": " + String(b).slice(0, 200) : ""));
        });
      }
      return r.json();
    }).then(function (j) {
      if (!j || typeof j.translatedText !== "string") throw new Error("Unexpected LibreTranslate response");
      var from = (j.detectedLanguage && j.detectedLanguage.language) || source;
      return { text: j.translatedText, from: from, to: target };
    });
  }

  // Consistent provenance label so every MT-derived batch is flagged identically.
  // Lands in entity/link provenance.sourceRef + origin + audit (via review.commit).
  function provenanceTag(from, to) {
    return "MT " + (from || "?") + "→" + (to || "en") + " · LibreTranslate (gisting — verify)";
  }

  var CRTranslate = {
    endpoint: endpoint, setEndpoint: setEndpoint,
    available: available, languages: languages,
    detect: detect, translate: translate,
    provenanceTag: provenanceTag
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CRTranslate;
  if (typeof window !== "undefined") window.CRTranslate = CRTranslate;
})();
