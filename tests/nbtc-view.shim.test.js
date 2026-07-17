/* nbtc-view.shim.test.js — exercises the NBTC view via a tiny DOM shim (no jsdom,
 * runs fast off the mount). Complements the jsdom test used in CI. */
"use strict";
var pass = 0, fail = 0;
function ok(n, c){ if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

/* ---- minimal DOM shim ---- */
function El(tag){ this.tagName = String(tag).toUpperCase(); this.children = []; this.className = ""; this.id = "";
  this._text = ""; this.style = {}; this._handlers = {}; this.value = ""; }
Object.defineProperty(El.prototype, "textContent", {
  get: function(){ if (this.children.length) return this.children.map(function(c){ return c.textContent; }).join(""); return this._text; },
  set: function(v){ this._text = v == null ? "" : String(v); this.children = []; }
});
Object.defineProperty(El.prototype, "innerHTML", {
  get: function(){ return this._html || ""; },
  set: function(v){ if (v === "" || v == null){ this.children = []; this._text = ""; this._html = ""; } else { this._html = String(v); this._text = String(v).replace(/<[^>]*>/g, ""); } }
});
El.prototype.appendChild = function(c){ this.children.push(c); c.parent = this; return c; };
El.prototype.setAttribute = function(k, v){ if (k === "id") this.id = v; this["_attr_" + k] = v; };
El.prototype.getAttribute = function(k){ return this["_attr_" + k] != null ? this["_attr_" + k] : null; };
El.prototype.toggleAttribute = function(k, on){ this["_" + k] = !!on; };
El.prototype.addEventListener = function(ev, fn){ (this._handlers[ev] = this._handlers[ev] || []).push(fn); };
Object.defineProperty(El.prototype, "onclick", { get: function(){ return this._onclick; }, set: function(fn){ this._onclick = fn; } });
El.prototype.click = function(){ if (this._onclick) this._onclick({ target: this }); (this._handlers.click || []).forEach(function(f){ f({ target: this }); }, this); };
El.prototype.classList = null;
function ensureClassList(e){ e.classList = { toggle: function(c, on){ /* noop for counts */ } }; }
function walk(node, out){ (node.children || []).forEach(function(c){ out.push(c); walk(c, out); }); return out; }
function matchTok(node, t){ if (!t) return true; var cn = node.className || ""; if (t.charAt(0) === "."){ return (" " + cn + " ").indexOf(" " + t.slice(1) + " ") !== -1 || cn.split(/\s+/).indexOf(t.slice(1)) !== -1; }
  var dot = t.indexOf("."); if (dot > 0){ return node.tagName === t.slice(0, dot).toUpperCase() && (node.className || "").split(/\s+/).indexOf(t.slice(dot + 1)) !== -1; }
  return node.tagName === t.toUpperCase(); }
function hasChain(node, toks){ var i = toks.length - 2, p = node.parent; while (i >= 0){ var found = false; while (p){ if (matchTok(p, toks[i])){ found = true; p = p.parent; break; } p = p.parent; } if (!found) return false; i--; } return true; }
El.prototype.querySelectorAll = function(sel){ var toks = sel.trim().split(/\s+/), all = walk(this, []), last = toks[toks.length - 1];
  return all.filter(function(n){ return matchTok(n, last) && (toks.length === 1 || hasChain(n, toks)); }); };
El.prototype.querySelector = function(sel){ return this.querySelectorAll(sel)[0] || null; };
El.prototype.closest = function(sel){ var n = this, t = sel.replace(/[\[\]]/g,""); while (n){ if (n["_attr_data-tool"] != null && /data-tool/.test(sel)) return n; if (matchTok(n, sel)) return n; n = n.parent; } return null; };

var registry = [];
var document = {
  createElement: function(t){ var e = new El(t); ensureClassList(e); var d = document;
    Object.defineProperty(e, "className", { get: function(){ return this._cls || ""; }, set: function(v){ this._cls = v || ""; } });
    return e; },
  getElementById: function(id){ for (var i = 0; i < registry.length; i++){ var f = registry[i].querySelectorAll("*").filter(function(n){ return n.id === id; }); if (f.length) return f[0]; } return null; },
  createTextNode: function(t){ return { textContent: String(t == null ? "" : t), children: [] }; },
  head: new El("head")
};
document.getElementById = function(id){ var pools = registry.concat([document.head]); for (var p = 0; p < pools.length; p++){ if (pools[p].id === id) return pools[p]; var all = walk(pools[p], []); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; } return null; };

global.window = global; global.document = document;
window.SolarCase = require("../js/core/solar-case.js");
window.CRAviation = require("../js/core/aviation-ref.js");
window.CRNbtc = require("../js/core/nbtc.js");
var V = require("../analyse/nbtc-view.js");

console.log("NBTC-view shim tests\n");
var host = new El("div"); host.id = "host"; ensureClassList(host); registry.push(host);
Object.defineProperty(host, "className", { get: function(){ return this._cls || ""; }, set: function(v){ this._cls = v || ""; } });

var thrown = null;
try { V.mount(host); V._resolveText(V._loadSample()); } catch (e) { thrown = e; }
ok("mount + analyse did not throw", thrown === null);
if (thrown) console.log("   " + thrown.message);
ok("panel built", host.querySelectorAll(".nb-panel").length === 1);
ok("four inner tabs (Map/Timeline/Flights/Identities)", host.querySelectorAll(".nb-tab").length === 4);
ok("flights + trips tables rendered", host.querySelectorAll(".nb-table").length >= 2);
ok("all flights listed (17 rows)", host.querySelectorAll(".nb-table tbody tr").length >= 17);
ok("a boarded badge is shown", host.querySelectorAll(".nb-badge-b").length >= 1);
ok("a check-in-only / no-show badge is shown", host.querySelectorAll(".nb-badge-n").length >= 1);
ok("timeline summary stats rendered", host.querySelectorAll(".nb-sum .nb-stat").length >= 3);
ok("timeline flags an aborted no-show trip", /No-show/.test(document.getElementById("nb-pane-timeline").textContent));
ok("timeline shows a passport/document switch legend", host.querySelectorAll(".nb-doclegend").length >= 1);
ok("summary chips rendered", host.querySelectorAll(".nb-chip").length >= 3);
ok("identities tab has resolved person card(s)", host.querySelectorAll(".nb-person").length >= 1);
ok("meta summarises boarded flights", /boarded/.test(document.getElementById("nb-meta").textContent));
ok("map pane falls back gracefully without Leaflet", /Leaflet/.test(document.getElementById("nb-pane-map").textContent));

/* flight lookup uses the aviation reference */
document.getElementById("nb-flight").value = "BA286";
(function(){ var b = host.querySelectorAll(".nb-bar .nb-btn"); b[b.length-1].click(); })();
ok("flight BA286 decodes to British Airways", /British Airways/.test(document.getElementById("nb-flightout").textContent));

/* add to case pushes person + documents + airports to the spine */
window.SolarCase._reset();
var ab = document.getElementById("nb-addcase"); if (ab) ab.click();
ok("Add to case writes entities to the spine", window.SolarCase.stats().entities > 0);
ok("Add to case writes links to the spine", window.SolarCase.stats().links >= 1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
