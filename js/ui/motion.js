/* SOLAR — motion.js
 * Motion-site choreography for the landing cover (original work):
 *  - eclipse preloader (letter stagger + counter + circular wipe, once/session)
 *  - custom cursor (dot + lerped ring, labels over interactives, fine pointers)
 *  - scroll engine: headline parallax, shader scroll uniform, orrery progress,
 *    marquee velocity skew, stat counters, magnetic elements
 *  - film-grain overlay
 * Cover-scoped: everything stands down when the cover is hidden.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var REDUCED = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var FINE = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
  var SS_SEEN = "solar_preloaded_v1";

  function coverVisible() {
    var c = U.el("hero-cover");
    return c && !c.classList.contains("hidden");
  }

  /* ---------------- film grain ---------------- */

  var GRAIN_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">' +
    '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>' +
    '<feColorMatrix type="saturate" values="0"/></filter>' +
    '<rect width="180" height="180" filter="url(#n)" opacity="0.6"/></svg>');

  function injectGrain() {
    var g = document.createElement("div");
    g.id = "solar-grain";
    g.setAttribute("aria-hidden", "true");
    g.style.backgroundImage = "url('" + GRAIN_SVG + "')";
    document.body.appendChild(g);
  }

  /* ---------------- eclipse preloader ---------------- */

  function preloader(done) {
    var seen = false;
    try { seen = sessionStorage.getItem(SS_SEEN) === "1"; } catch (e) { /* noop */ }
    if (seen || REDUCED || !coverVisible()) { done(); return; }

    var pl = document.createElement("div");
    pl.id = "solar-preloader";
    pl.setAttribute("aria-hidden", "true");
    pl.innerHTML =
      '<div class="pl-word">' +
        "SOLAR".split("").map(function (ch, i) {
          return '<span class="pl-l" style="--i:' + i + '">' + ch + "</span>";
        }).join("") +
      "</div>" +
      '<div class="pl-sub">LINK ANALYSIS &middot; SMART MATCHING</div>' +
      '<div class="pl-count" aria-hidden="true">00</div>';
    document.body.appendChild(pl);

    var count = pl.querySelector(".pl-count");
    var t0 = performance.now(), DUR = 1700, finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      try { sessionStorage.setItem(SS_SEEN, "1"); } catch (e) { /* noop */ }
      pl.classList.add("eclipse");                  // circular wipe out
      setTimeout(function () { pl.remove(); done(); }, 750);
    }
    function tick(now) {
      if (finished) return;
      var p = Math.min(1, (now - t0) / DUR);
      var eased = 1 - Math.pow(1 - p, 3);
      count.textContent = String(Math.floor(eased * 100)).padStart(2, "0");
      if (p >= 1) { count.textContent = "100"; setTimeout(finish, 220); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    pl.addEventListener("click", finish);
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape" || e.key === "Enter") {
        finish();
        document.removeEventListener("keydown", esc);
      }
    });
  }

  /* ---------------- custom cursor ---------------- */

  function cursor() {
    if (!FINE || REDUCED) return;
    var dot = document.createElement("div");
    dot.id = "solar-cursor-dot";
    var ring = document.createElement("div");
    ring.id = "solar-cursor-ring";
    ring.innerHTML = '<span class="lbl"></span>';
    dot.setAttribute("aria-hidden", "true");
    ring.setAttribute("aria-hidden", "true");
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    var lbl = ring.querySelector(".lbl");

    var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    var active = false, raf = 0;

    function frame() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = "translate(" + mx + "px," + my + "px)";
      ring.style.transform = "translate(" + rx + "px," + ry + "px)";
      raf = requestAnimationFrame(frame);
    }
    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      var on = coverVisible();
      if (on !== active) {
        active = on;
        document.body.classList.toggle("solar-cursor-on", on);
        dot.style.opacity = ring.style.opacity = on ? "1" : "0";
        if (on && !raf) raf = requestAnimationFrame(frame);
      }
      if (!on) return;
      var t = e.target.closest("[data-cursor], button, a, textarea, .petal");
      if (t) {
        ring.classList.add("hot");
        lbl.textContent = t.getAttribute("data-cursor") || "";
      } else {
        ring.classList.remove("hot");
        lbl.textContent = "";
      }
    });
  }

  /* ---------------- magnetic elements ---------------- */

  function magnetise() {
    if (!FINE || REDUCED) return;
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      var R = 90;
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        el.style.transition = "none";                  // crisp follow
        el.style.transform = "translate(" + (dx * 0.18) + "px," + (dy * 0.18) + "px)";
        void R;
      });
      el.addEventListener("mouseleave", function () {
        el.style.transition = "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)"; // springs home
        el.style.transform = "translate(0,0)";
      });
    });
  }

  /* ---------------- scroll engine ---------------- */

  function scrollEngine() {
    var cover = U.el("hero-cover");
    if (!cover) return;
    var lastTop = 0, vel = 0;

    function frame() {
      if (!coverVisible()) {
        setTimeout(function () { requestAnimationFrame(frame); }, 400); // idle poll
        return;
      }
      var top = cover.scrollTop;
      vel += ((top - lastTop) - vel) * 0.12;
      lastTop = top;
      var vh = cover.clientHeight || 1;

      // scene 1: headline parallax + shader scroll
      var p1 = Math.min(1, top / vh);
      var content = U.el("hero-content");
      if (content && !REDUCED) {
        content.style.transform = "translateY(" + (top * 0.18) + "px)";
        content.style.opacity = String(1 - p1 * 0.85);
      }
      if (!REDUCED && window.CRHero && window.CRHero.setScroll) window.CRHero.setScroll(p1);

      // scene 2: orrery progress over its sticky run
      var s2 = U.el("solar-scene-orrery");
      if (s2 && window.CROrrery) {
        var r = s2.getBoundingClientRect();
        var run = s2.offsetHeight - vh;
        var p2 = run > 0 ? Math.max(0, Math.min(1, -r.top / run)) : 1;
        window.CROrrery.setProgress(p2);
        // captions
        var caps = s2.querySelectorAll(".orr-cap");
        caps.forEach(function (cap, i) {
          var lo = i / caps.length, hi = (i + 1) / caps.length;
          cap.classList.toggle("on", p2 >= lo && p2 < hi + (i === caps.length - 1 ? 1 : 0));
        });
      }

      // marquee velocity skew
      var track = document.querySelector("#hero-marquee .track");
      if (track && !REDUCED) {
        var sk = Math.max(-10, Math.min(10, vel * 0.18));
        track.style.transform = "skewX(" + sk + "deg)";
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- reveals: headline words, stats ---------------- */

  function reveals() {
    var cover = U.el("hero-cover");
    if (!cover) return;
    // headline in
    setTimeout(function () {
      var h1 = U.el("hero-h1");
      if (h1) h1.classList.add("in");
      var sub = U.el("hero-sub");
      if (sub) sub.classList.add("in");
    }, 120);

    if (!("IntersectionObserver" in window)) {
      cover.querySelectorAll(".stat-num").forEach(function (n) {
        n.textContent = n.getAttribute("data-to");
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var to = parseInt(en.target.getAttribute("data-to"), 10) || 0;
        if (REDUCED) { en.target.textContent = String(to); return; }
        var t0 = performance.now(), DUR = 1100;
        (function step(now) {
          var p = Math.min(1, (now - t0) / DUR);
          en.target.textContent = String(Math.floor(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      });
    }, { threshold: 0.6, root: cover });
    cover.querySelectorAll(".stat-num").forEach(function (n) { io.observe(n); });

    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("on"); io2.unobserve(en.target); }
      });
    }, { threshold: 0.3, root: cover });
    cover.querySelectorAll(".solar-reveal").forEach(function (n) { io2.observe(n); });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    injectGrain();
    preloader(function () {
      var cover = U.el("hero-cover");
      if (cover) cover.classList.add("loaded");   // releases headline animations
      reveals();
    });
    cursor();
    magnetise();
    scrollEngine();
    // orrery mount
    var oc = U.el("orrery-canvas");
    if (oc && window.CROrrery) window.CROrrery.mount(oc);
    // accent → orrery
    if (window.CRSolar && window.CROrrery) {
      var orig = window.CRSolar.applyAccent;
      window.CRSolar.applyAccent = function (hex, persist) {
        orig(hex, persist);
        window.CROrrery.setAccent(hex);
      };
      try {
        var cur = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
        if (cur) window.CROrrery.setAccent(cur);
      } catch (e) { /* noop */ }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }

  window.CRMotion = { boot: boot };
})();
