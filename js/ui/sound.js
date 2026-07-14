/* SOLAR — sound.js
 * A small, shared UI-sound manager. Mirrors the theme.js preference pattern:
 * an IIFE that persists a mute preference in localStorage under a shared key,
 * dispatches a "solar-sound" window event so every control instance (Row 3 +
 * Settings, on both surfaces) stays in sync, and degrades safely if audio or
 * the files are unavailable.
 *
 * Discipline (per the uisfx NOTICE and the brief):
 *  - Sound is SUPPLEMENTARY. It reinforces visible feedback, never replaces it.
 *  - Semantic cues only (~6). Nothing on hover / keystroke / scroll / every click.
 *  - Low volume (0.25).
 *  - Nothing plays until the FIRST user gesture (browser autoplay policy).
 *  - Mute preference persists and is shared across both surfaces.
 *  - DEFAULT: on at low volume — BUT prefers-reduced-motion => default muted.
 *    (The stored preference, once set by the user, always wins over the default.)
 */
(function () {
  "use strict";

  var STORAGE_KEY = "solar_muted";     // "1" = muted, "0" = on
  var VOLUME = 0.25;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Resolve assets/sound/ relative to THIS script, so it works from both the
  // workbench (/) and the registry (/registry/) without hard-coded depth.
  var BASE = (function () {
    try {
      var s = document.currentScript && document.currentScript.src;
      if (s) return s.replace(/js\/ui\/sound\.js.*$/, "") + "assets/sound/";
    } catch (e) { /* noop */ }
    // Fallback: guess from pathname depth.
    return (/\/registry\//.test(location.pathname) ? "../" : "") + "assets/sound/";
  })();

  // Semantic cue -> file basename. Only these are shipped.
  var CUES = {
    open: "open",              // menu / palette open
    "toggle-on": "toggle-on",
    "toggle-off": "toggle-off",
    success: "success",        // real commit (save case, export/report authorised)
    error: "error",            // reject / access-denied
    notify: "notification",    // silent-hit / new match
    select: "select"           // opening a report/entity (optional, very soft)
  };

  // Prefer ogg where the browser supports it, else mp3. Decide once.
  var EXT = (function () {
    try {
      var a = document.createElement("audio");
      if (a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"')) return "ogg";
    } catch (e) { /* noop */ }
    return "mp3";
  })();

  var pool = {};        // name -> HTMLAudioElement (preloaded)
  var unlocked = false; // becomes true after first user gesture
  var muted;

  function readPref() {
    var v = null;
    try { v = localStorage.getItem(STORAGE_KEY); } catch (e) { /* noop */ }
    if (v === "1") return true;
    if (v === "0") return false;
    // No stored preference yet -> apply the default.
    return reduce ? true : false;   // reduced-motion defaults to muted
  }

  function preload() {
    Object.keys(CUES).forEach(function (name) {
      try {
        var a = new Audio();
        a.preload = "auto";
        a.volume = VOLUME;
        a.src = BASE + CUES[name] + "." + EXT;
        pool[name] = a;
      } catch (e) { /* audio unsupported -> silent no-op */ }
    });
  }

  var lastCueAt = 0;    // timestamp of the last SEMANTIC cue (for click dedupe)

  // Play a cue by semantic name. No-op if muted, not yet unlocked, or unknown.
  // `vol` optionally overrides the volume (used by the soft generic click).
  function play(name, vol) {
    if (muted || !unlocked) return;
    var src = pool[name];
    if (!src) return;
    try {
      // Clone so rapid repeats don't cut each other off, and volume stays fixed.
      var node = src.cloneNode(true);
      node.volume = (typeof vol === "number") ? vol : VOLUME;
      var p = node.play();
      if (p && p.catch) p.catch(function () { /* play refused -> silent */ });
    } catch (e) { /* noop */ }
  }

  // A semantic cue was requested — stamp it so the generic click cue for the
  // SAME interaction is suppressed (one cue per interaction, no double-fire).
  function playCue(name) { lastCueAt = Date.now(); play(name); }

  // Soft generic click. Fires on genuine user clicks EXCEPT when a semantic cue
  // just fired for the same interaction (within CLICK_DEDUPE ms). Quieter than
  // the semantic cues so it stays a subtle tick, never competing.
  var CLICK_DEDUPE = 120;      // a semantic cue within this window wins
  var CLICK_VOL = 0.12;        // softer than the 0.25 semantic cues
  function playClick() {
    if (muted || !unlocked) return;
    if (Date.now() - lastCueAt < CLICK_DEDUPE) return;   // a semantic cue owns this interaction
    play("select", CLICK_VOL);
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(STORAGE_KEY, muted ? "1" : "0"); } catch (e) { /* noop */ }
    try { window.dispatchEvent(new Event("solar-sound")); } catch (e) { /* noop */ }
    return muted;
  }
  function toggleMuted() { return setMuted(!muted); }
  function isMuted() { return !!muted; }

  // First-gesture unlock (browser autoplay policy). One-time.
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    // Warm the pool so the first real cue isn't delayed.
    Object.keys(pool).forEach(function (n) { try { pool[n].load(); } catch (e) { /* noop */ } });
  }
  function armUnlock() {
    ["pointerdown", "keydown", "touchstart"].forEach(function (evt) {
      document.addEventListener(evt, unlock, { once: false, passive: true, capture: true });
    });
  }

  function init() {
    muted = readPref();
    preload();
    armUnlock();
    // Soft generic click on real user clicks (capture phase, after the app's own
    // handlers may have queued a semantic cue in the same tick). Deduped so it
    // never doubles with a semantic cue. Left-clicks on interactive targets only
    // — not on plain text/whitespace, never on hover/keydown/scroll.
    document.addEventListener("click", function (e) {
      if (e.button !== 0) return;
      var t = e.target;
      if (t && t.closest && t.closest("button, a, summary, [role='button'], .btn, input[type='checkbox'], input[type='radio'], .op-card, .report-item, .sh-item, .sh-tab, [data-urn], [data-op]")) {
        // let any semantic cue from the same click land first, then decide
        setTimeout(playClick, 0);
      }
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Public API — mirrors the SolarShell/CRGraph provider style. `play` routes
  // through playCue so every semantic cue stamps the dedupe lock (suppressing
  // the generic click for the same interaction).
  window.SolarSound = {
    play: playCue,
    setMuted: setMuted,
    toggleMuted: toggleMuted,
    isMuted: isMuted,
    volume: VOLUME
  };
})();
