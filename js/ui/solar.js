/* SOLAR — solar.js
 * Design layer: bloom colour picker (liquid-glass petals around a sun core),
 * live accent system (CSS var + shader uniform, persisted), feature-card
 * reveal + 3D tilt, orbital ornament injection.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var LS_ACCENT = "solar_accent_v1";
  var REDUCED = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // the solar palette — credible, no purple
  var PALETTE = [
    { name: "Solar amber", hex: "#e8b34b" },
    { name: "Ember", hex: "#fe7b02" },
    { name: "Flare red", hex: "#ff5c4d" },
    { name: "Gold", hex: "#ffd166" },
    { name: "Ice", hex: "#82bcff" },
    { name: "Steel blue", hex: "#2483ff" },
    { name: "Teal", hex: "#5fc4c0" },
    { name: "Starlight", hex: "#c9d4e0" }
  ];

  /* ---------------- accent plumbing ---------------- */

  function hexToRgb01(hex) {
    var h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  }

  function applyAccent(hex, persist) {
    document.documentElement.style.setProperty("--accent", hex);
    if (window.CRHero && window.CRHero.setAccent) {
      window.CRHero.setAccent(hexToRgb01(hex));
    }
    if (persist) {
      try { localStorage.setItem(LS_ACCENT, hex); } catch (e) { /* private mode */ }
    }
    document.querySelectorAll(".petal").forEach(function (p) {
      p.classList.toggle("current", p.getAttribute("data-hex") === hex);
    });
  }

  function savedAccent() {
    try {
      var v = localStorage.getItem(LS_ACCENT);
      if (v && /^#[0-9a-f]{6}$/i.test(v)) return v;
    } catch (e) { /* noop */ }
    return null;
  }

  /* ---------------- bloom picker ---------------- */

  function buildBloom(mount) {
    var root = document.createElement("div");
    root.id = "bloom-root";
    var petals = PALETTE.map(function (p, i) {
      var ang = i * (360 / PALETTE.length);
      return '<span class="petal-arm" style="--ang:' + ang + 'deg">' +
        '<button class="petal" type="button" role="menuitemradio" aria-checked="false"' +
        ' style="--pc:' + p.hex + ';--i:' + i + '" data-hex="' + p.hex + '"' +
        ' aria-label="' + U.escAttr(p.name) + '" title="' + U.escAttr(p.name) + '"></button>' +
        "</span>";
    }).join("");
    root.innerHTML =
      '<button id="bloom-core" type="button" aria-haspopup="menu" aria-expanded="false"' +
      ' aria-label="accent colour" title="Accent colour"></button>' +
      '<div id="bloom-petals" role="menu" aria-label="accent colours">' +
      '<span id="bloom-halo" aria-hidden="true"></span>' + petals + "</div>";
    mount.appendChild(root);

    var core = root.querySelector("#bloom-core");

    function setOpen(open) {
      root.classList.toggle("open", open);
      core.setAttribute("aria-expanded", open ? "true" : "false");
    }
    core.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!root.classList.contains("open"));
    });
    root.querySelectorAll(".petal").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        applyAccent(btn.getAttribute("data-hex"), true);
        root.querySelectorAll(".petal").forEach(function (b) {
          b.setAttribute("aria-checked", b === btn ? "true" : "false");
        });
        setTimeout(function () { setOpen(false); }, 180);
      });
    });
    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) setOpen(false);
    });
    // a modal opening should fold the flower away
    document.querySelectorAll(".modal-veil").forEach(function (v) {
      new MutationObserver(function () {
        if (v.classList.contains("open")) setOpen(false);
      }).observe(v, { attributes: true, attributeFilter: ["class"] });
    });
    // arrow keys cycle the petals (ARIA menu pattern)
    root.addEventListener("keydown", function (e) {
      if (!root.classList.contains("open")) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowDown" &&
          e.key !== "ArrowLeft" && e.key !== "ArrowUp") return;
      e.preventDefault();
      var list = Array.prototype.slice.call(root.querySelectorAll(".petal"));
      var idx = list.indexOf(document.activeElement);
      var dir = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : -1;
      var next = list[(idx + dir + list.length) % list.length];
      if (next) next.focus();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("open")) {
        e.stopPropagation();
        setOpen(false);
        core.focus();
      }
    }, true);
    return root;
  }

  /* ---------------- feature cards: reveal + tilt ---------------- */

  function wireCards() {
    var cards = document.querySelectorAll(".solar-card");
    if (!cards.length) return;

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("revealed");
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.25 });
      cards.forEach(function (c) { io.observe(c); });
    } else {
      cards.forEach(function (c) { c.classList.add("revealed"); });
    }

    if (REDUCED) return;
    cards.forEach(function (card) {
      var face = card.querySelector(".face");
      if (!face) return;
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        face.style.transform = "rotateY(" + (px * 7) + "deg) rotateX(" + (-py * 7) + "deg)";
      });
      card.addEventListener("mouseleave", function () {
        face.style.transform = "rotateY(0deg) rotateX(0deg)";
      });
    });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    // Bloom colour picker retired: the accent is fixed (lime) via CSS tokens.
    // We no longer apply any saved/amber accent inline, so it can't override
    // the redesign palette. (buildBloom / applyAccent kept but unused.)
    wireCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }

  window.CRSolar = { applyAccent: applyAccent, PALETTE: PALETTE, wireCards: wireCards };
})();
