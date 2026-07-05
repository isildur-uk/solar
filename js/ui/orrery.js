/* SOLAR — orrery.js
 * The product as the hero animation: a 2D-canvas orrery of the demo case.
 * Entity "planets" assemble from scattered particles, settle onto elliptical
 * orbits around the subject, and their intelligence links draw themselves in.
 * Scroll progress (0..1) drives assembly → linking → steady orbit + tilt.
 * Original artwork. API: mount(canvas), setProgress(p), setAccent(hex), destroy().
 */
(function () {
  "use strict";

  var REDUCED = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // the BAINES demo system — colours follow the entity-type palette
  var BODIES = [
    { label: "SUBJECT",           type: "person",       ring: 0, size: 16 },
    { label: "PHONE NUMBER",      type: "phone",        ring: 1, size: 7, phase: 0.05 },
    { label: "EMAIL ADDRESS",     type: "email",        ring: 1, size: 7, phase: 0.38 },
    { label: "FINANCIAL ACCOUNT", type: "account",      ring: 1, size: 6, phase: 0.72 },
    { label: "LOCATION",          type: "location",     ring: 2, size: 8, phase: 0.12 },
    { label: "AIRPORT",           type: "airport",      ring: 2, size: 9, phase: 0.45 },
    { label: "ADDRESS",           type: "address",      ring: 2, size: 7, phase: 0.66 },
    { label: "VEHICLE",           type: "vehicle",      ring: 2, size: 7, phase: 0.88 },
    { label: "PERSON",            type: "person",       ring: 3, size: 9, phase: 0.2 },
    { label: "ORGANISATION",      type: "organisation", ring: 3, size: 9, phase: 0.55 },
    { label: "CASH",              type: "money",        ring: 3, size: 6, phase: 0.8 }
  ];
  var LINKS = [
    [0, 1, "USES"], [0, 2, "USES"], [0, 3, "HOLDS"],
    [0, 4, "TRAVELS TO"], [0, 5, "DEPARTS"], [0, 6, "STAYS AT"], [0, 7, "DRIVES"],
    [0, 8, "ASSOCIATE OF"], [8, 9, "EMPLOYED BY"], [9, 10, "TRANSFERRED"]
  ];
  var RING_R = [0, 0.16, 0.30, 0.44];   // semi-major axis as fraction of min(w,h)
  var RING_SPEED = [0, 0.05, 0.032, 0.02]; // radians/sec
  var SQUASH = 0.42;                     // ellipse vertical squash

  var canvas = null, ctx = null, raf = 0;
  var chipImgs = [];                     // preloaded entity-chip icons (the charting language)
  var W = 0, H = 0, DPR = 1;
  var progress = 0;                      // scroll progress 0..1
  var accent = "#e8b34b";
  var t0 = 0;
  var seeds = [];                        // scatter origins per body

  function typeColour(t) {
    var T = window.CRModel && window.CRModel.ENTITY_TYPES[t];
    return (T && T.colour) || "#8593a3";
  }

  function ease(x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); }

  function resize() {
    if (!canvas) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    W = Math.max(2, Math.floor(r.width));
    H = Math.max(2, Math.floor(r.height));
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function bodyPos(b, i, time, tilt) {
    var cx = W / 2, cy = H / 2;
    if (b.ring === 0) return { x: cx, y: cy };
    var base = Math.min(W, H);
    var a = RING_R[b.ring] * base;
    var ang = (b.phase || 0) * Math.PI * 2 + time * RING_SPEED[b.ring];
    var sq = SQUASH + tilt * 0.30;       // scroll tilts the plane toward face-on
    return {
      x: cx + Math.cos(ang) * a,
      y: cy + Math.sin(ang) * a * sq,
      behind: Math.sin(ang) < 0
    };
  }

  function draw(now) {
    if (!ctx) { raf = 0; return; }
    if (!t0) t0 = now;
    var time = REDUCED ? 40 : (now - t0) / 1000;
    var p = progress;
    var assemble = ease(p / 0.35);              // 0→.35 particles converge
    var linkP = ease((p - 0.3) / 0.35);         // .3→.65 links draw
    var tilt = ease((p - 0.55) / 0.45);         // .55→1 plane opens up

    ctx.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2;
    var base = Math.min(W, H);

    // orbit paths
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (var r = 1; r <= 3; r++) {
      var a = RING_R[r] * base;
      ctx.beginPath();
      ctx.ellipse(cx, cy, a, a * (SQUASH + tilt * 0.30), 0, 0, Math.PI * 2);
      ctx.globalAlpha = assemble * (0.5 + 0.5 * (3 - r) / 3);
      ctx.stroke();
    }
    ctx.restore();

    // positions this frame
    var pos = BODIES.map(function (b, i) {
      var target = bodyPos(b, i, time, tilt);
      if (assemble >= 1) return target;
      var s = seeds[i];
      return {
        x: s.x + (target.x - s.x) * assemble,
        y: s.y + (target.y - s.y) * assemble,
        behind: target.behind
      };
    });

    // links draw themselves in
    if (linkP > 0) {
      ctx.save();
      ctx.lineWidth = 1;
      LINKS.forEach(function (lk, li) {
        var lp = ease(linkP * LINKS.length - li);
        if (lp <= 0) return;
        var A = pos[lk[0]], B = pos[lk[1]];
        var mx = A.x + (B.x - A.x) * lp, my = A.y + (B.y - A.y) * lp;
        var grad = ctx.createLinearGradient(A.x, A.y, mx, my);
        grad.addColorStop(0, "rgba(232,179,75,0)");
        grad.addColorStop(1, accentAlpha(0.55));
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(mx, my);
        ctx.stroke();
        if (lp >= 1 && tilt > 0.2) {
          // link verb label at midpoint, mono, faint
          ctx.fillStyle = "rgba(150,165,185," + (0.5 * tilt) + ")";
          ctx.font = "500 8px Consolas, monospace";
          ctx.textAlign = "center";
          ctx.fillText(lk[2], (A.x + B.x) / 2, (A.y + B.y) / 2 - 4);
        }
      });
      ctx.restore();
    }

    // intelligence sparks travel the links once the system is live — a rotating
    // subset so the motion stays quiet (cargohero travelling-marker pattern)
    if (!REDUCED && linkP >= 1 && tilt > 0.5) {
      ctx.save();
      var band = Math.floor(time / 4) % 3;
      for (var si = 0; si < LINKS.length; si++) {
        if (si % 3 !== band) continue;
        var A2 = pos[LINKS[si][0]], B2 = pos[LINKS[si][1]];
        var tt = (time * 0.22 + si * 0.37) % 1;
        var sx = A2.x + (B2.x - A2.x) * tt, sy = A2.y + (B2.y - A2.y) * tt;
        var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 7);
        sg.addColorStop(0, accentAlpha(0.8 * tilt));
        sg.addColorStop(1, accentAlpha(0));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255," + (0.75 * tilt).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(sx, sy, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // bodies: glow disc + ring + label  (draw back-of-orbit first)
    var order = pos.map(function (q, i) { return i; }).sort(function (a, b) {
      return (pos[a].behind === pos[b].behind) ? 0 : (pos[a].behind ? -1 : 1);
    });
    order.forEach(function (i) {
      var b = BODIES[i], q = pos[i];
      var col = i === 0 ? accent : typeColour(b.type);
      var alpha = assemble * (q.behind ? 0.55 : 1);
      var sz = b.size * (q.behind ? 0.85 : 1);

      // glow
      var g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, sz * 3.2);
      g.addColorStop(0, hexAlpha(col, 0.5 * alpha));
      g.addColorStop(1, hexAlpha(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(q.x, q.y, sz * 3.2, 0, Math.PI * 2);
      ctx.fill();
      // core — the chart's own icon chip when available, else the plain disc
      var chip = chipImgs[i];
      if (chip && chip.complete && chip.naturalWidth) {
        var cs = sz * 2.7;
        ctx.globalAlpha = alpha;
        ctx.drawImage(chip, q.x - cs / 2, q.y - cs / 2, cs, cs);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = "#0d1117";
        ctx.strokeStyle = hexAlpha(col, alpha);
        ctx.lineWidth = i === 0 ? 2.4 : 1.6;
        ctx.beginPath();
        ctx.arc(q.x, q.y, sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // subject pulse
      if (i === 0 && !REDUCED) {
        var pr = sz + 6 + 4 * (0.5 + 0.5 * Math.sin(time * 1.8));
        ctx.strokeStyle = hexAlpha(col, 0.25 * alpha);
        ctx.beginPath();
        ctx.arc(q.x, q.y, pr, 0, Math.PI * 2);
        ctx.stroke();
      }
      // label
      if (assemble > 0.85 && !q.behind) {
        ctx.fillStyle = "rgba(201,212,224," + (0.85 * alpha * (i === 0 ? 1 : 0.8)) + ")";
        ctx.font = (i === 0 ? "600 11px" : "500 9px") + " Consolas, monospace";
        ctx.textAlign = "center";
        ctx.fillText(b.label, q.x, q.y + sz * 1.55 + 12);
      }
    });

    if (REDUCED && assemble >= 1) { raf = 0; return; }  // still frame when settled
    raf = requestAnimationFrame(draw);
  }

  function hexAlpha(hex, a) {
    var h = hex.replace("#", "");
    return "rgba(" + parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) +
      "," + parseInt(h.slice(4, 6), 16) + "," + Math.max(0, Math.min(1, a)) + ")";
  }
  function accentAlpha(a) { return hexAlpha(accent, a); }

  function mount(c) {
    canvas = c;
    ctx = canvas.getContext("2d");
    if (!ctx) return false;
    resize();
    // the same icon chips the chart uses — the hero speaks the product's language
    if (window.CRIcons) {
      chipImgs = BODIES.map(function (b) {
        var img = new Image();
        img.src = window.CRIcons.get(b.type, typeColour(b.type)).unselected;
        return img;
      });
    }
    // deterministic scatter seeds (no flicker between mounts)
    seeds = BODIES.map(function (b, i) {
      var sa = i * 2.39996;              // golden angle
      var sr = (0.7 + (i % 3) * 0.18) * Math.min(W, H);
      return { x: W / 2 + Math.cos(sa) * sr, y: H / 2 + Math.sin(sa) * sr };
    });
    window.addEventListener("resize", resize);
    if (!raf) raf = requestAnimationFrame(draw);
    return true;
  }

  function setProgress(p) {
    p = Math.max(0, Math.min(1, p));
    if (Math.abs(p - progress) < 0.001) return;  // unchanged → no repaint churn
    progress = p;
    if (!raf && ctx) raf = requestAnimationFrame(draw);
  }

  function setAccent(hex) {
    if (/^#[0-9a-f]{6}$/i.test(hex)) accent = hex;
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    canvas = null;
    ctx = null;
  }

  window.CROrrery = { mount: mount, setProgress: setProgress, setAccent: setAccent, destroy: destroy };
})();
