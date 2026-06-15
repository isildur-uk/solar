/* ============================================================
   SOLAR — space-bg.js
   A dim, animated nebula + starfield rendered behind the link
   chart, carrying the hero's cosmic atmosphere into the workspace.
   Deliberately low-contrast with a legibility vignette so the
   graph stays readable. Confined to #chart-wrap, pointer-events
   none, sits below the vis-network canvas. Honours reduced-motion.
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
    var n = Math.max(50, Math.min(160, Math.floor((W * H) / 14000)));
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random(), y: Math.random(),
        r: 0.3 + Math.random() * 1.0,
        p: Math.random() * 6.2832,
        s: 0.3 + Math.random() * 0.6
      });
    }
    /* a few drifting gas masses in the hero's violet/blue palette */
    blobs = [
      { c: [150, 96, 210], x: 0.32, y: 0.36, r: 0.52, a: 0.10,  dx: 0.000020, dy: 0.000015, ph: 0 },
      { c: [82, 112, 235], x: 0.66, y: 0.58, r: 0.60, a: 0.085, dx: -0.000016, dy: 0.000022, ph: 2 },
      { c: [210, 150, 235], x: 0.50, y: 0.72, r: 0.46, a: 0.07,  dx: 0.000012, dy: -0.000020, ph: 4 },
      { c: [120, 150, 245], x: 0.78, y: 0.28, r: 0.40, a: 0.06,  dx: -0.000020, dy: 0.000012, ph: 1 }
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

    /* nebula gas — additive, very dim */
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var bx = (b.x + Math.sin(t * b.dx + b.ph) * 0.04) * W;
      var by = (b.y + Math.cos(t * b.dy + b.ph) * 0.04) * H;
      var br = b.r * Math.max(W, H);
      var g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, "rgba(" + b.c[0] + "," + b.c[1] + "," + b.c[2] + "," + b.a.toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + b.c[0] + "," + b.c[1] + "," + b.c[2] + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fill();
    }

    /* stars */
    for (var j = 0; j < stars.length; j++) {
      var s = stars[j];
      var tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.s + s.p));
      ctx.globalAlpha = tw * 0.5;
      ctx.fillStyle = "#cfcdbf";
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    /* legibility vignette — keeps the graph readable over the gas */
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(10,10,9,0.34)");
    vg.addColorStop(1, "rgba(10,10,9,0.80)");
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
