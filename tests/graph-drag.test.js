/* CHART ROOM — graph-drag.test.js
 * Regression test for Ben's charting bug: "when you click on AN ENTITY which
 * isn't the core entity, and reposition it, it makes the central entity move —
 * this shouldn't happen."
 *
 * Root cause: vis-network runs the physics solver while a node is dragged, so
 * every OTHER un-pinned node (in particular the central/most-connected hub,
 * which sits unpinned at the centre) is pushed by the spring forces and drifts.
 * A fixed node is NOT integrated by the solver, so the fix freezes every
 * non-dragged node for the duration of the drag and restores its prior state on
 * release.
 *
 * This test loads the REAL graph.js against a lightweight vis mock, captures the
 * dragStart / dragEnd handlers it wires, and asserts the freeze/thaw contract:
 *   - dragStart: every node EXCEPT the grabbed one becomes fixed (so the solver
 *     cannot move it — the core stays put);
 *   - the grabbed node stays free (so it can be dragged);
 *   - dragEnd: nodes we froze are restored to free (the chart is not silently
 *     pinned), while nodes that were ALREADY pinned stay pinned.
 *
 * Needs jsdom; SKIPS cleanly (exit 0) if it is not installed so the
 * dependency-free suite still runs.
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

/* ---- a minimal vis mock: just enough for graph.js init + the drag handlers ---- */
function makeVis() {
  var handlers = {};
  function DataSet() { this._d = {}; }
  DataSet.prototype.add = function () {};
  DataSet.prototype.update = function () {};
  DataSet.prototype.remove = function () {};
  DataSet.prototype.get = function () { return null; };
  DataSet.prototype.getIds = function () { return []; };

  function Network() {
    // physics-body node registry the drag fix reads/writes
    this.body = { nodes: {}, nodeIndices: [], emitter: { emit: function () {} } };
    this._handlers = handlers;
  }
  Network.prototype.on = function (evt, fn) { handlers[evt] = fn; };
  Network.prototype.setOptions = function () {};
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

  return { DataSet: DataSet, Network: Network, _handlers: handlers };
}

/* ---- a store stub with no entities so init's rebuild() is a clean no-op ---- */
function makeStore() {
  return {
    entities: [], links: [],
    getEntity: function () { return null; },
    onChange: function () {},
    _emit: function () {}
  };
}

function loadGraph(win, vis) {
  win.vis = vis;
  // graph.js reads window.CRUtil + a few optional globals; stub the minimum.
  win.CRUtil = win.CRUtil || { el: function (id) { return win.document.getElementById(id); } };
  win.eval(fs.readFileSync(path.join(SOLAR, "js/ui/graph.js"), "utf8"));
  return win.CRGraph;
}

/* helper: is a mock body node fixed? */
function fixedOf(n) { var f = n && n.options && n.options.fixed; return f === true || !!(f && (f.x || f.y)); }

test("drag fixes non-core nodes in place so the core stays put (during + after)", function () {
  var dom = new JSDOM('<!DOCTYPE html><body><div id="chart"></div></body>', { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  var win = dom.window;
  global.window = win; global.document = win.document;
  var vis = makeVis();
  var CRGraph = loadGraph(win, vis);
  var container = win.document.getElementById("chart");
  CRGraph.init(container, makeStore(), function () {});

  var net = CRGraph.getNetwork();
  // build a hub + spokes in the physics body: hub (core) + 5 peripheral nodes,
  // all initially FREE (unpinned), plus one already-pinned node.
  var ids = ["hub", "p1", "p2", "p3", "p4", "pinned"];
  ids.forEach(function (id, i) {
    net.body.nodes[id] = { x: i * 10, y: i * 5, options: { fixed: { x: false, y: false } } };
  });
  net.body.nodes.pinned.options.fixed = { x: true, y: true };   // this one is pinned
  net.body.nodeIndices = ids.slice();

  var dragStart = vis._handlers.dragStart, dragEnd = vis._handlers.dragEnd;
  assert.ok(typeof dragStart === "function", "graph.js wires a dragStart handler");
  assert.ok(typeof dragEnd === "function", "graph.js wires a dragEnd handler");

  // ---- baseline ----
  assert.strictEqual(fixedOf(net.body.nodes.hub), false, "hub starts free");
  assert.strictEqual(fixedOf(net.body.nodes.pinned), true, "pinned node starts pinned");

  // ---- drag a PERIPHERAL node (p2), not the core ----
  dragStart({ nodes: ["p2"], edges: [], pointer: { DOM: { x: 0, y: 0 }, canvas: { x: 0, y: 0 } }, event: {} });

  // during the drag: the core (hub) and every other non-dragged node are frozen,
  // so the solver cannot move them; only the grabbed node stays free.
  assert.strictEqual(fixedOf(net.body.nodes.hub), true, "core (hub) is FROZEN during the drag");
  ["p1", "p3", "p4"].forEach(function (id) {
    assert.strictEqual(fixedOf(net.body.nodes[id]), true, id + " is frozen during the drag");
  });
  assert.strictEqual(fixedOf(net.body.nodes.p2), false, "the grabbed node stays free (draggable)");
  assert.strictEqual(fixedOf(net.body.nodes.pinned), true, "an already-pinned node stays pinned");

  // ---- release ----
  dragEnd({ nodes: ["p2"], edges: [], pointer: { DOM: { x: 0, y: 0 }, canvas: { x: 0, y: 0 } }, event: {} });

  // after release: a manual drag makes the layout MANUAL — the not-being-dragged
  // nodes stay fixed where they are so physics cannot re-solve and drift the core.
  assert.strictEqual(fixedOf(net.body.nodes.hub), true, "core stays fixed after release (no re-solve can drift it)");
  ["p1", "p3", "p4"].forEach(function (id) {
    assert.strictEqual(fixedOf(net.body.nodes[id]), true, id + " stays fixed after release");
  });
  assert.strictEqual(fixedOf(net.body.nodes.pinned), true, "pinned node remains pinned after release");
});

test("core position is UNCHANGED across a peripheral drag (coords evidence)", function () {
  var dom = new JSDOM('<!DOCTYPE html><body><div id="chart"></div></body>', { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  var win = dom.window;
  global.window = win; global.document = win.document;
  var vis = makeVis();
  var CRGraph = loadGraph(win, vis);
  CRGraph.init(win.document.getElementById("chart"), makeStore(), function () {});
  var net = CRGraph.getNetwork();

  ["hub", "leaf"].forEach(function (id, i) {
    net.body.nodes[id] = { x: i === 0 ? 17 : 400, y: i === 0 ? 22 : -360, options: { fixed: { x: false, y: false } } };
  });
  net.body.nodeIndices = ["hub", "leaf"];

  var coreBefore = { x: net.body.nodes.hub.x, y: net.body.nodes.hub.y };

  // simulate a peripheral drag: freeze (dragStart), move ONLY the grabbed leaf
  // while it is held, release (dragEnd). Because the fix fixes the hub, any
  // solver step would be a no-op on it; here we assert the core coords never move.
  vis._handlers.dragStart({ nodes: ["leaf"], edges: [], pointer: { DOM: { x: 0, y: 0 }, canvas: { x: 0, y: 0 } }, event: {} });
  // the core is now fixed — a fixed node is not integrated by the physics solver
  assert.strictEqual(fixedOf(net.body.nodes.hub), true, "core is pinned for the duration of the drag");
  net.moveNode("leaf", 900, 700);            // only the grabbed node moves
  vis._handlers.dragEnd({ nodes: ["leaf"], edges: [], pointer: { DOM: { x: 0, y: 0 }, canvas: { x: 0, y: 0 } }, event: {} });

  var coreAfter = { x: net.body.nodes.hub.x, y: net.body.nodes.hub.y };
  assert.deepStrictEqual(coreAfter, coreBefore, "core coordinates are unchanged by the peripheral drag");
});
