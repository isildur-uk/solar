/* ============================================================
   SOLAR — cosmos.js  (shared ambient cosmic ground)
   The same violet/blue nebula + twinkle starfield as the workbench
   (js/ui/space-bg.js) and the database (registry/reg-cosmos.js),
   rendered as a fixed full-viewport layer BEHIND the chrome so any
   non-workbench surface (e.g. Analyse) gets registry-parity ground
   instead of a flat admin panel. Quiet (nebula ≤0.08) so the solid
   panels/tables read on top. Hidden in light theme. pointer-events
   none; honours prefers-reduced-motion. Self-mounts on load.
   ============================================================ */
(function () {
  "use strict";
  if (typeof document === "undefined") return;
  if (document.getElementById("solar-cosmos")) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var cv = document.createElement("canvas");
  cv.id = "solar-cosmos";
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none";
  document.body.insertBefore(cv, document.body.firstChild);
  var ctx = cv.getContext("2d");

  var W = 0, H = 0, stars = [], blobs = [], t0 = performance.now();

  function seed() {
    stars = [];
    var n = Math.max(60, Math.min(200, Math.floor((W * H) / 11000)));
    for (var i = 0; i < n; i++) {
      stars.push({ x: Math.random(), y: Math.random(), r: 0.3 + Math.random() * 1.1, p: Math.random() * 6.2832, s: 0.3 + Math.random() * 0.6 });
    }
    /* same violet/blue gas masses as the workbench, alpha ≤0.08 per registry-parity */
    blobs = [
      { c: [150, 96, 210], x: 0.28, y: 0.30, r: 0.60, a: 0.075, dx: 0.000020, dy: 0.000015, ph: 0 },
      { c: [82, 112, 235], x: 0.70, y: 0.55, r: 0.66, a: 0.065, dx: -0.000016, dy: 0.000022, ph: 2 },
      { c: [205, 140, 235], x: 0.50, y: 0.80, r: 0.52, a: 0.055, dx: 0.000012, dy: -0.000020, ph: 4 },
      { c: [120, 150, 245], x: 0.84, y: 0.22, r: 0.46, a: 0.050, dx: -0.000020, dy: 0.000012, ph: 1 },
      { c: [170, 110, 225], x: 0.14, y: 0.70, r: 0.48, a: 0.045, dx: 0.000017, dy: 0.000014, ph: 3 }
    ];
  }

  function size() {
    W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function frame(now) {
    var t = now - t0;
    var light = document.documentElement.getAttribute("data-theme") === "light";
    ctx.clearRect(0, 0, W, H);
    if (light) { cv.style.opacity = "0"; if (!reduce) requestAnimationFrame(frame); return; }
    cv.style.opacity = "1";
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
      ctx.globalAlpha = tw * 0.55;
      ctx.fillStyle = "#dedcc9";
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (!reduce) requestAnimationFrame(frame);
  }

  window.addEventListener("resize", size);
  window.addEventListener("cr-theme", function () { frame(performance.now()); });

  size();
  if (reduce) frame(performance.now());
  else requestAnimationFrame(frame);
})();
