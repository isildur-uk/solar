/* ============================================================
   SOLAR — space-bg.js
   An animated nebula + starfield behind the link chart, carrying the
   hero's cosmic atmosphere into the workspace. Prominent like the hero,
   but with a soft centre vignette so the graph + empty-state text stay
   readable. Confined to #chart-wrap, pointer-events none, below the
   vis-network canvas. Honours reduced-motion.
   ============================================================ */
(function () {
  "use strict";
  var wrap = document.getElementById("chart-wrap");
  if (!wrap) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var cv = document.createElement("canvas");
  cv.id = "space-bg";
  cv.setAttribute("aria-hidden", "true");
  wrap.insertBefore(cv, wrap.firstChild);
  var ctx = cv.getContext("2d");

  var W = 0, H = 0, stars = [], blobs = [], t0 = performance.now();

  function seed() {
    stars = [];
    var n = Math.max(70, Math.min(220, Math.floor((W * H) / 9000)));
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random(), y: Math.random(),
        r: 0.3 + Math.random() * 1.2,
        p: Math.random() * 6.2832,
        s: 0.3 + Math.random() * 0.6
      });
    }
    /* drifting gas masses — warm graphite console palette (no purple/blue), dialled low
       so the near-black ground reads as the analyst console (DESIGN.md: workbench, no purple) */
    blobs = [
      { c: [66, 66, 60],   x: 0.30, y: 0.34, r: 0.58, a: 0.16, dx: 0.000020, dy: 0.000015, ph: 0 },
      { c: [58, 60, 54],   x: 0.66, y: 0.58, r: 0.64, a: 0.14, dx: -0.000016, dy: 0.000022, ph: 2 },
      { c: [120, 132, 74], x: 0.50, y: 0.74, r: 0.50, a: 0.07, dx: 0.000012, dy: -0.000020, ph: 4 },
      { c: [70, 70, 62],   x: 0.80, y: 0.26, r: 0.44, a: 0.12, dx: -0.000020, dy: 0.000012, ph: 1 },
      { c: [60, 62, 55],   x: 0.16, y: 0.66, r: 0.46, a: 0.11, dx: 0.000017, dy: 0.000014, ph: 3 }
    ];
  }

  function size() {
    var r = wrap.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function frame(now) {
    var t = now - t0;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a0a09";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var bx = (b.x + Math.sin(t * b.dx + b.ph) * 0.05) * W;
      var by = (b.y + Math.cos(t * b.dy + b.ph) * 0.05) * H;
      var br = b.r * Math.max(W, H);
      var g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, "rgba(" + b.c[0] + "," + b.c[1] + "," + b.c[2] + "," + b.a.toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + b.c[0] + "," + b.c[1] + "," + b.c[2] + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fill();
    }

    for (var j = 0; j < stars.length; j++) {
      var s = stars[j];
      var tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.s + s.p));
      ctx.globalAlpha = tw * 0.75;
      ctx.fillStyle = "#dedcc9";
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    /* gentle legibility vignette — soft centre keeps text/nodes readable */
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.10, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(10,10,9,0.22)");
    vg.addColorStop(1, "rgba(10,10,9,0.58)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (!reduce) requestAnimationFrame(frame);
  }

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { size(); });
    ro.observe(wrap);
  }
  window.addEventListener("resize", size);

  size();
  if (reduce) frame(performance.now());
  else requestAnimationFrame(frame);
})();
