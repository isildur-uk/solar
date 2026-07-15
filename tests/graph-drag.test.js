/* CHART ROOM — graph-drag.test.js
 * Regression tests for Ben's charting drag behaviour. TWO invariants must BOTH
 * hold — a fix that satisfies one while breaking the other is not a fix:
 *
 *   (A) Dragging a PERIPHERAL entity must NOT move the core entity.
 *       (Ben's original bug: "moving a non-core entity makes the central one move.")
 *   (B) The user can freely drag ANY entity (core or peripheral), ALWAYS —
 *       including after a drag and after a reload.
 *       (The regression that shipped when (A) was "fixed" by pinning every node
 *       with `fixed`, which in vis-network also makes nodes UNdraggable: Ben
 *       reported "i cant move entities at all which i never asked for".)
 *
 * How the current build guarantees both: the chart runs in MANUAL layout with
 * physics OFF at rest (init turns physics off on "stabilized"). With physics off
 * moving one node re-solves nothing, so the core can't drift (A); and because no
 * node is ever set `fixed` at rest, every node stays draggable (B). An explicit
 * per-node pin uses a separate `chart.pinned` flag; the legacy `chart.fixed`
 * written by the buggy build is IGNORED on load (migration), so affected cases
 * load draggable.
 *
 * These tests load the REAL graph.js against a lightweight vis mock and drive the
 * captured handlers. Needs jsdom; SKIPS cleanly (exit 0) if not installed.
 */
"use strict";
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var test = require("node:test");

var JSDOM;
try { JSDOM = require("jsdom").JSDOM; }
catch (e) {
  try { JSDOM = require(require.resolve("jsdom", { paths: ["/tmp/crbuild/node_modules"] })).JSDOM; }
  catch (e2) { console.log("SKIP — jsdom not installed (run: npm i jsdom)."); process.exit(0); }
}

var SOLAR = path.join(__dirname, "..");

/* ---- a minimal vis mock: enough for graph.js init + drag + rebuild ---- */
function makeVis() {
  var handlers = {};
  // DataSet records the LAST node object pushed per id, so a test can inspect
  // what nodeFromEntity produced on (re)build — in particular its `fixed`.
  var datasets = [];
  function DataSet() { this._d = {}; datasets.push(this); }
  DataSet.prototype.add = function (n) { if (n) this._d[n.id] = n; };
  DataSet.prototype.update = function (n) { if (n) this._d[n.id] = n; };
  DataSet.prototype.remove = function (id) { delete this._d[id]; };
  DataSet.prototype.get = function (id) { return this._d[id] || null; };
  DataSet.prototype.getIds = function () { return Object.keys(this._d); };

  function Network() {
    this.body = { nodes: {}, nodeIndices: [], emitter: { emit: function () {} } };
    this._handlers = handlers;
    this._physicsEnabled = true;
  }
  Network.prototype.on = function (evt, fn) { handlers[evt] = fn; };
  Network.prototype.setOptions = function (o) {
    if (o && o.physics && typeof o.physics.enabled === "boolean") { this._physicsEnabled = o.physics.enabled; }
  };
  Network.prototype.getPositions = function (ids) {
    var out = {}, self = this;
    (ids || []).forEach(function (id) { var n = self.body.nodes[id]; out[id] = n ? { x: n.x, y: n.y } : { x: 0, y: 0 }; });
    return out;
  };
  Network.prototype.moveNode = function (id, x, y) { var n = this.body.nodes[id]; if (n) { n.x = x; n.y = y; } };
  Network.prototype.selectNodes = function () {};
  Network.prototype.getConnectedEdges = function () { return []; };
  Network.prototype.getNodeAt = function () { return undefined; };
  Network.prototype.getEdgeAt = function () { return undefined; };
  Network.prototype.DOMtoCanvas = function (p) { return p; };
  Network.prototype.fit = function () {};
  Network.prototype.focus = function () {};
  Network.prototype.stabilize = function () {};
  Network.prototype.stopSimulation = function () {};
  Network.prototype.redraw = function () {};

  // datasets[0] is the nodes DataSet (created first in graph.js init)
  return { DataSet: DataSet, Network: Network, _handlers: handlers, _datasets: datasets };
}

/* ---- a store stub backed by a real entity list so rebuild() has something ---- */
function makeStore(entities, links) {
  var byId = {};
  (entities || []).forEach(function (e) { byId[e.id] = e; });
  return {
    entities: entities || [], links: links || [],
    getEntity: function (id) { return byId[id] || null; },
    onChange: function () {},
    _emit: function () {}
  };
}

function loadGraph(win, vis) {
  win.vis = vis;
  win.CRUtil = win.CRUtil || {
    el: function (id) { return win.document.getElementById(id); },
    truncate: function (s) { return s == null ? "" : String(s); },
    esc: function (s) { return s == null ? "" : String(s); },
    escape: function (s) { return s == null ? "" : String(s); },
    fmtDate: function (s) { return s == null ? "" : String(s); }
  };
  // graph.js reads a few window globals when building nodes/edges; stub the
  // minimum so rebuild()/nodeFromEntity run headless.
  win.CRModel = win.CRModel || {
    ENTITY_TYPES: new Proxy({}, { get: function () { return { colour: "#8593a3" }; } }),
    LINK_TYPES: new Proxy({}, { get: function () { return { colour: "#8593a3", label: "" }; } })
  };
  win.CRIcons = win.CRIcons || { has: function () { return false; }, get: function () { return ""; } };
  win.eval(fs.readFileSync(path.join(SOLAR, "js/ui/graph.js"), "utf8"));
  return win.CRGraph;
}

function newDom() {
  var dom = new JSDOM('<!DOCTYPE html><body><div id="chart"></div><div id="chart-empty"></div></body>',
    { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  global.window = dom.window; global.document = dom.window.document;
  return dom.window;
}

/* is a mock body node fixed? (fixed === true, or {x|y:true}) */
function fixedOf(n) { var f = n && n.options && n.options.fixed; return f === true || !!(f && (f.x || f.y)); }
/* is a built (DataSet) node fixed? */
function nodeFixed(n) { var f = n && n.fixed; return f === true || !!(f && (f.x || f.y)); }

/* =========================== INVARIANT (A) =========================== */
test("(A) core position is UNCHANGED when a peripheral entity is dragged", function () {
  var win = newDom();
  var vis = makeVis();
  var CRGraph = loadGraph(win, vis);
  var ents = [
    { id: "hub", type: "person", label: "Hub", chart: { x: 17, y: 22, pinned: false } },
    { id: "leaf", type: "person", label: "Leaf", chart: { x: 400, y: -360, pinned: false } }
  ];
  CRGraph.init(win.document.getElementById("chart"), makeStore(ents), function () {});
  var net = CRGraph.getNetwork();

  // seed the physics body to mirror the entities, all free (draggable). Physics
  // starts ON (the resting-off event does not fire in the vendored build).
  ["hub", "leaf"].forEach(function (id) {
    var e = ents.find(function (x) { return x.id === id; });
    net.body.nodes[id] = { x: e.chart.x, y: e.chart.y, options: { fixed: { x: false, y: false } } };
  });
  net.body.nodeIndices = ["hub", "leaf"];
  assert.ok(typeof vis._handlers.dragStart === "function", "graph.js wires a dragStart handler");

  var coreBefore = { x: net.body.nodes.hub.x, y: net.body.nodes.hub.y };

  // grab the leaf: dragStart must turn physics OFF immediately, so the ongoing
  // drag cannot re-solve and drift the core — the guarantee for the FIRST drag.
  vis._handlers.dragStart({ nodes: ["leaf"], edges: [], pointer: { DOM: { x: 0, y: 0 }, canvas: { x: 0, y: 0 } }, event: {} });
  assert.strictEqual(net._physicsEnabled, false, "physics is OFF the instant a drag begins (no re-solve can drift the core)");

  // move only the grabbed node, release
  net.moveNode("leaf", 900, 700);
  vis._handlers.dragEnd({ nodes: ["leaf"], edges: [], pointer: { DOM: { x: 0, y: 0 }, canvas: { x: 900, y: 700 } }, event: {} });

  var coreAfter = { x: net.body.nodes.hub.x, y: net.body.nodes.hub.y };
  assert.deepStrictEqual(coreAfter, coreBefore, "core coordinates unchanged by the peripheral drag");
  assert.strictEqual(net._physicsEnabled, false, "chart rests in manual (physics-off) mode after the drag");
});

/* =========================== INVARIANT (B) =========================== */
test("(B) after a peripheral drag + reload, EVERY node is still draggable (not fixed)", function () {
  var win = newDom();
  var vis = makeVis();
  var CRGraph = loadGraph(win, vis);
  var ents = [
    { id: "hub", type: "person", label: "Hub", chart: { x: 0, y: 0, pinned: false } },
    { id: "leaf", type: "person", label: "Leaf", chart: { x: 200, y: 100, pinned: false } }
  ];
  CRGraph.init(win.document.getElementById("chart"), makeStore(ents), function () {});
  var net = CRGraph.getNetwork();
  if (vis._handlers.stabilized) { vis._handlers.stabilized(); }

  net.body.nodes.hub = { x: 0, y: 0, options: { fixed: { x: false, y: false } } };
  net.body.nodes.leaf = { x: 200, y: 100, options: { fixed: { x: false, y: false } } };
  net.body.nodeIndices = ["hub", "leaf"];

  // drag the leaf and release — this persists its position into the store
  net.moveNode("leaf", 640, 480);
  vis._handlers.dragEnd({ nodes: ["leaf"], edges: [], pointer: { DOM: { x: 0, y: 0 }, canvas: { x: 640, y: 480 } }, event: {} });

  // no store entity should have been left with a fixed/pin flag by the drag
  assert.ok(!(ents[0].chart && ents[0].chart.pinned), "hub not silently pinned by the drag");
  assert.ok(!(ents[1].chart && ents[1].chart.pinned), "dragged leaf not silently pinned");

  // simulate a RELOAD: rebuild the nodes from the (now persisted) store and
  // inspect what nodeFromEntity produced. NONE may come back fixed.
  CRGraph.rebuild();
  var dataset = vis._datasets[0];               // nodes DataSet (created first in init)
  assert.ok(dataset, "test harness captured the nodes DataSet");
  ["hub", "leaf"].forEach(function (id) {
    var n = dataset.get(id);
    assert.ok(n, "node " + id + " rebuilt");
    assert.strictEqual(nodeFixed(n), false, id + " is DRAGGABLE after reload (not fixed)");
  });
});

/* ===================== MIGRATION of buggy saved cases ===================== */
test("(B/migration) a case saved with chart.fixed:true on every node loads DRAGGABLE", function () {
  var win = newDom();
  var vis = makeVis();
  var CRGraph = loadGraph(win, vis);
  // legacy buggy build persisted { x, y, fixed:true } on EVERY node
  var ents = [
    { id: "a", type: "person", label: "A", chart: { x: 10, y: 20, fixed: true } },
    { id: "b", type: "person", label: "B", chart: { x: 30, y: 40, fixed: true } },
    { id: "c", type: "organisation", label: "C", chart: { x: 50, y: 60, fixed: true } }
  ];
  CRGraph.init(win.document.getElementById("chart"), makeStore(ents), function () {});
  CRGraph.rebuild();
  var dataset = vis._datasets[0];
  assert.ok(dataset, "nodes DataSet captured");
  ["a", "b", "c"].forEach(function (id, i) {
    var n = dataset.get(id);
    assert.ok(n, "node " + id + " rebuilt");
    assert.strictEqual(nodeFixed(n), false, id + " loads DRAGGABLE despite legacy chart.fixed:true");
    // positions are preserved through the migration
    assert.strictEqual(n.x, ents[i].chart.x, id + " keeps its saved x");
    assert.strictEqual(n.y, ents[i].chart.y, id + " keeps its saved y");
  });
});

/* ============= explicit pin is still honoured (and survives reload) ============= */
test("(pin) an explicitly pinned node (chart.pinned) loads fixed; others stay draggable", function () {
  var win = newDom();
  var vis = makeVis();
  var CRGraph = loadGraph(win, vis);
  var ents = [
    { id: "free", type: "person", label: "Free", chart: { x: 0, y: 0, pinned: false } },
    { id: "held", type: "person", label: "Held", chart: { x: 100, y: 100, pinned: true } }
  ];
  CRGraph.init(win.document.getElementById("chart"), makeStore(ents), function () {});
  CRGraph.rebuild();
  var dataset = vis._datasets[0];
  assert.strictEqual(nodeFixed(dataset.get("free")), false, "unpinned node is draggable");
  assert.strictEqual(nodeFixed(dataset.get("held")), true, "explicitly pinned node is fixed");
});
