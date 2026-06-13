/* SOLAR — hero.js
 * Cosmic-void landing cover (original work; xAI-style "single luminous word"):
 *   a quiet starfield + a faint sample link-chart drifting beneath a
 *   whisper-thin SOLAR wordmark. Clicking splits the word into a chromatic
 *   prism, blooms, and opens a circular aperture (iris) into the workbench.
 * API: window.CRHero { close, reopen, setAccent(rgb01[3]), setScroll(0..1) }
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var REDUCED = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var sceneRaf = 0;
  var opening = false;

  /* ---------------- markup ---------------- */

  function build() {
    var cover = document.createElement("div");
    cover.id = "hero-cover";
    cover.setAttribute("role", "region");
    cover.setAttribute("aria-label", "Solar — enter");
    cover.setAttribute("tabindex", "-1");
    cover.innerHTML =
      '<canvas id="hero-stars" aria-hidden="true"></canvas>' +
      '<div id="hero-stage">' +
        '<button id="solar-mark" type="button" aria-label="Enter Solar">' +
          '<span class="bloom" aria-hidden="true"></span>' +
          '<span class="word">' +
            '<span class="layer base">SOLAR</span>' +
            '<span class="layer chroma cr" aria-hidden="true">SOLAR</span>' +
            '<span class="layer chroma cb" aria-hidden="true">SOLAR</span>' +
          "</span>" +
          '<span class="cue" aria-hidden="true">[ ENTER ]</span>' +
        "</button>" +
      "</div>" +
      '<div id="hero-iris" aria-hidden="true"></div>';
    document.body.appendChild(cover);
    return cover;
  }

  /* ---------------- scene: starfield + sample link-chart ---------------- */

  // sample link-chart — a subject with orbiting entities (faint, decorative)
  var NET = [
    { a: 0,    r: 0    },                                  // 0 subject (centre)
    { a: 0.20, r: 1 }, { a: 1.05, r: 1 }, { a: 1.95, r: 1 },
    { a: 2.75, r: 1 }, { a: 3.65, r: 1 }, { a: 4.55, r: 1 }, { a: 5.45, r: 1 }, // ring 1 (7)
    { a: 0.7,  r: 1.7 }, { a: 2.4, r: 1.7 }, { a: 4.2, r: 1.7 }                 // ring 2 (3)
  ];
  var NET_EDGES = [
    [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],
    [1,8],[4,9],[6,10],[2,3],[5,6]
  ];

  function initScene(canvas, cover) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return false;

    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var layers = [];

    function seed() {
      var area = (W * H) / (DPR * DPR);
      var base = Math.max(40, Math.round(area / 9000));
      layers = [
        { speed: 0.0050, size: [0.5, 1.0], alpha: 0.40, n: Math.round(base * 0.6), pts: [] },
        { speed: 0.010,  size: [0.7, 1.4], alpha: 0.62, n: Math.round(base * 0.3), pts: [] },
        { speed: 0.018,  size: [1.0, 1.9], alpha: 0.9,  n: Math.round(base * 0.1), pts: [] }
      ];
      layers.forEach(function (L) {
        for (var i = 0; i < L.n; i++) {
          L.pts.push({
            x: Math.random(), y: Math.random(),
            r: L.size[0] + Math.random() * (L.size[1] - L.size[0]),
            tw: Math.random() * Math.PI * 2, tws: 0.6 + Math.random() * 1.6
          });
        }
      });
    }

    function resize() {
      var w = cover.clientWidth, h = cover.clientHeight;
      W = Math.max(2, Math.floor(w * DPR));
      H = Math.max(2, Math.floor(h * DPR));
      canvas.width = W; canvas.height = H;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      seed();
    }

    function drawNet(t) {
      // centred a little low so it reads as "beneath" the wordmark
      var cx = W * 0.5, cy = H * 0.62;
      var R = Math.min(W, H) * 0.135;
      var rot = REDUCED ? 0 : t * 0.025;
      var sq = 0.62;                                  // gentle orbital squash
      var pos = NET.map(function (nd) {
        if (nd.r === 0) return { x: cx, y: cy };
        var rr = R * nd.r;
        return { x: cx + Math.cos(nd.a + rot) * rr,
                 y: cy + Math.sin(nd.a + rot) * rr * sq };
      });
      // edges — hairline
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(201,212,224,0.10)";
      ctx.beginPath();
      for (var e = 0; e < NET_EDGES.length; e++) {
        var A = pos[NET_EDGES[e][0]], B = pos[NET_EDGES[e][1]];
        ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
      }
      ctx.stroke();
      // nodes
      for (var i = 0; i < pos.length; i++) {
        var p = pos[i], subj = (i === 0);
        var rad = (subj ? 3.2 : 2.0) * DPR;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 4);
        g.addColorStop(0, subj ? "rgba(232,179,75,0.34)" : "rgba(232,179,75,0.16)");
        g.addColorStop(1, "rgba(232,179,75,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = subj ? "rgba(247,238,210,0.85)" : "rgba(201,212,224,0.6)";
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
      }
    }

    var t0 = performance.now();
    function frame(now) {
      if (cover.classList.contains("hidden")) { sceneRaf = 0; return; }
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      // starfield
      for (var li = 0; li < layers.length; li++) {
        var L = layers[li];
        for (var i = 0; i < L.pts.length; i++) {
          var p = L.pts[i];
          var y = p.y - (t * L.speed) % 1; if (y < 0) y += 1;
          var tw = REDUCED ? 1 : (0.55 + 0.45 * Math.sin(t * p.tws + p.tw));
          ctx.globalAlpha = L.alpha * tw;
          ctx.beginPath(); ctx.arc(p.x * W, y * H, p.r * DPR, 0, Math.PI * 2);
          ctx.fillStyle = li === 2 ? "#dfe9f6" : "#aeb9cc"; ctx.fill();
        }
      }
      ctx.globalAlpha = 0.5;
      drawNet(t);
      ctx.globalAlpha = 1;
      if (REDUCED) { sceneRaf = 0; return; }
      sceneRaf = requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resize);
    resize();
    sceneRaf = requestAnimationFrame(frame);
    canvas._restart = function () { if (!sceneRaf) sceneRaf = requestAnimationFrame(frame); };
    return true;
  }

  /* ---------------- iris-open transition ---------------- */

  function open(cover, after) {
    if (opening) return;
    opening = true;
    document.body.classList.remove("solar-cursor-on");
    if (REDUCED) {
      cover.classList.add("closing");
      setTimeout(function () { retire(cover); if (after) after(); }, 360);
      return;
    }
    cover.classList.add("opening");                  // chroma split + bloom + iris
    setTimeout(function () { retire(cover); if (after) after(); }, 1200);
  }

  function retire(cover) {
    cover.classList.add("hidden");
    cover.classList.remove("opening", "closing");
    if (sceneRaf) { cancelAnimationFrame(sceneRaf); sceneRaf = 0; }
    if (window.CRMapPane) window.CRMapPane.invalidate();
  }

  function close(cover) {
    if (cover.classList.contains("hidden")) return;
    cover.classList.add("closing");
    document.body.classList.remove("solar-cursor-on");
    setTimeout(function () { retire(cover); }, 480);
  }

  function reopen() {
    var cover = U.el("hero-cover");
    if (!cover) return;
    opening = false;
    cover.classList.remove("hidden", "opening", "closing");
    void cover.offsetWidth;
    cover.scrollTop = 0;
    var canvas = U.el("hero-stars");
    if (canvas && canvas._restart) { window.dispatchEvent(new Event("resize")); canvas._restart(); }
    cover.focus({ preventScroll: true });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    var store = window.CRApp && window.CRApp.getStore ? window.CRApp.getStore() : null;
    var hasData = store && store.entities && store.entities.length > 0;

    var cover = build();
    var canvas = U.el("hero-stars");
    try { initScene(canvas, cover); } catch (e) { /* canvas optional */ }

    var mark = U.el("solar-mark");
    function enter() { open(cover, null); }
    mark.addEventListener("click", enter);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" &&
          !cover.classList.contains("hidden") &&
          !cover.classList.contains("opening") &&
          !document.querySelector(".modal-veil.open")) {
        enter();
      }
    });

    // hero.html is the landing experience now — the legacy in-app cover
    // stays hidden; an empty case boots straight into the workbench.
    cover.classList.add("hidden");
    if (sceneRaf) { cancelAnimationFrame(sceneRaf); sceneRaf = 0; }
    void hasData;

    var brand = U.el("brand");
    if (brand) {
      brand.addEventListener("click", function () { window.location.href = "hero.html"; });
      brand.setAttribute("title", "SOLAR — landing page");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }

  window.CRHero = {
    close: function () { var c = U.el("hero-cover"); if (c) close(c); },
    reopen: reopen,
    setAccent: function (rgb) {
      if (rgb && rgb.length === 3) {
        var to255 = function (v) { return Math.round(Math.max(0, Math.min(1, v)) * 255); };
        document.documentElement.style.setProperty(
          "--solar-glow", to255(rgb[0]) + "," + to255(rgb[1]) + "," + to255(rgb[2]));
      }
    },
    setScroll: function () {}
  };
})();
