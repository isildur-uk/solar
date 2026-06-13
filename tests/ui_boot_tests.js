const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const html = `<!DOCTYPE html><html><head><title>Solar</title></head><body>
<div id="class-banner">OFFICIAL</div>
<header id="topbar">
  <div id="brand" tabindex="0"><span class="brand-line">SOL<span class="accent">AR</span></span></div>
  <input id="search" type="search">
</header>
<div class="modal-veil" id="help-veil"><div class="modal"></div></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/" });
const { window } = dom;
const errors = [];
window.addEventListener("error", e => errors.push("window.onerror: " + e.message));

// minimal env stubs
if (!window.matchMedia) {
  window.matchMedia = q => ({ matches: false, addEventListener(){}, removeEventListener(){} });
}
window.HTMLCanvasElement.prototype.getContext = function () { return null; }; // → no-gl / no-orrery paths

const scripts = ["js/ui/util.js","js/ui/icons.js","js/ui/solar.js","js/ui/hero.js"];
for (const s of scripts) {
  try { window.eval(fs.readFileSync(path.join(root, s), "utf8")); }
  catch (e) { errors.push("load " + s + ": " + e.message); }
}

let pass = 0, fail = 0;
function T(name, cond) { if (cond) { pass++; console.log("PASS:", name); } else { fail++; console.log("FAIL:", name); } }

setTimeout(() => {
  try {
    const d = window.document;
    T("no load/boot errors", errors.length === 0);
    if (errors.length) errors.forEach(e => console.log("   ", e));
    T("cover built", !!d.getElementById("hero-cover"));
    T("star canvas present", !!d.getElementById("hero-stars"));
    T("solar mark present", !!d.getElementById("solar-mark"));
    T("wordmark layers present", d.querySelectorAll("#solar-mark .layer").length === 3);
    T("enter cue present", !!d.querySelector("#solar-mark .cue"));
    T("iris present", !!d.getElementById("hero-iris"));
    T("bloom root in topbar", !!d.getElementById("bloom-root") && d.getElementById("topbar").contains(d.getElementById("bloom-root")));
    T("8 petals", d.querySelectorAll(".petal").length === 8);

    // interactions
    const core = d.getElementById("bloom-core");
    core.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    T("bloom opens", d.getElementById("bloom-root").classList.contains("open"));
    const petal = d.querySelectorAll(".petal")[4]; // Ice
    petal.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const acc = d.documentElement.style.getPropertyValue("--accent").trim();
    T("petal sets accent var (" + acc + ")", acc === "#82bcff");

    // Enter opens the cover into the workbench.
    d.getElementById("solar-mark").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    setTimeout(() => {
      T("cover opens on mark click", d.getElementById("hero-cover").classList.contains("opening") ||
                                    d.getElementById("hero-cover").classList.contains("hidden"));

      // Reopen, then Escape should enter again when no modal is open.
      d.getElementById("brand").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      d.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      setTimeout(() => {
        T("Escape enters cover", d.getElementById("hero-cover").classList.contains("opening") ||
                                 d.getElementById("hero-cover").classList.contains("hidden"));
        // brand click reopens
        setTimeout(() => {
          d.getElementById("brand").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
          T("brand reopens cover", !d.getElementById("hero-cover").classList.contains("hidden"));
          T("no late errors", errors.length === 0);
          if (errors.length) errors.forEach(e => console.log("   ", e));
          console.log("\n" + pass + " passed, " + fail + " failed");
          process.exit(fail ? 1 : 0);
        }, 700);
      }, 50);
    }, 850);
  } catch (e) {
    console.log("HARNESS ERROR:", e.stack);
    process.exit(1);
  }
}, 400);
