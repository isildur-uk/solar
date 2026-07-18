/* comms-network.run.js — contact graph + betweenness (broker detection). */
"use strict";
var pass = 0, fail = 0;
function ok(n, c){ if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
var NW = require("../js/core/comms-network.js");
console.log("Comms-network tests\n");

/* two subjects (A, B) who never call each other but SHARE a contact X = broker */
var datasets = [
  { label: "A", identity: "07700900111", events: [
    { aParty: "07700900111", bParty: "07700900999", type: "MOC" },
    { aParty: "07700900111", bParty: "07700900999", type: "MOC" },
    { aParty: "07700900111", bParty: "07700900222", type: "MOC" } ] },
  { label: "B", identity: "07700900333", events: [
    { aParty: "07700900333", bParty: "07700900999", type: "MOC" },
    { aParty: "07700900333", bParty: "07700900444", type: "MOC" } ] }
];
var g = NW.build(datasets);
ok("graph has nodes for subjects + counterparts", g.nodes.length === 5);
ok("edges built with weights", g.edges.some(function(e){ return e.weight === 2; }));
var x = g.nodes.filter(function(n){ return n.id === "07700900999"; })[0];
ok("the shared contact 999 exists", !!x);
ok("shared contact has betweenness > 0 (it bridges A and B)", x.betweenness > 0);
ok("shared contact flagged as a broker/cut-out", x.broker === true);
var a = g.nodes.filter(function(n){ return n.id === "07700900111"; })[0];
ok("subject A weighted-degree reflects volume (3)", a.weightedDegree === 3);
ok("ranked puts the broker at/near the top by betweenness", g.ranked[0].betweenness >= x.betweenness);
ok("matrix order + counts produced", g.matrixOrder.length === 5 && g.matrixCounts["07700900111|07700900999"] === 2);
/* leaf-only network: no broker */
var g2 = NW.build([{ label: "T", identity: "07700900111", events: [{ aParty: "07700900111", bParty: "07700900222", type: "MOC" }] }]);
ok("a simple star has no broker", !g2.nodes.some(function(n){ return n.broker; }));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
