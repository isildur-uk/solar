/* comms-network.js — build a contact GRAPH + adjacency matrix from comms datasets.
 * Nodes = subjects + their counterparties; edges = contact volume. Runs the
 * existing degree + Brandes betweenness (netanalysis.js) so the view can size
 * nodes by volume and halo them by betweenness — making HUBS and, more valuably,
 * BROKERS / cut-outs (low degree, high betweenness) visible. Pure module.
 * Browser: window.CRCommsNetwork. Node: module.exports.
 */
(function (root) {
  "use strict";
  var NET = (typeof window !== "undefined" && window.CRNet) || (typeof require === "function" ? safe(function(){ return require("./netanalysis.js"); }) : null);
  function safe(f){ try { return f(); } catch (e) { return null; } }
  function norm(x){ return String(x == null ? "" : x).replace(/\s+/g, ""); }

  function build(datasets){
    datasets = datasets || [];
    var nodeSet = {}, edgeMap = {};
    function addNode(id, label, isTarget){ if (!id) return; if (!nodeSet[id]) nodeSet[id] = { id: id, label: label || id, isTarget: false, weightedDegree: 0 }; if (isTarget) nodeSet[id].isTarget = true; if (label && nodeSet[id].label === id) nodeSet[id].label = label; }
    datasets.forEach(function(d){
      var tid = norm(d.identity || d.label); addNode(tid, d.label || d.identity, true);
      var cps = d.counterparts;
      if (!cps){ cps = {}; (d.events || []).forEach(function(e){ [e.aParty, e.bParty, e.fwdParty].forEach(function(p){ var pn = norm(p); if (pn && pn !== tid) cps[pn] = (cps[pn] || 0) + 1; }); }); }
      else { var c2 = {}; Object.keys(cps).forEach(function(k){ var kn = norm(k); if (kn && kn !== tid) c2[kn] = (c2[kn] || 0) + cps[k]; }); cps = c2; }
      Object.keys(cps).forEach(function(cp){ addNode(cp, cp, false);
        var key = tid < cp ? tid + "|" + cp : cp + "|" + tid; edgeMap[key] = (edgeMap[key] || 0) + cps[cp]; });
    });
    var entities = Object.keys(nodeSet).map(function(id){ return { id: id, type: "phone", label: nodeSet[id].label }; });
    var links = Object.keys(edgeMap).map(function(k){ var p = k.split("|"); return { from: p[0], to: p[1], type: "COMMUNICATED_WITH", weight: edgeMap[k] }; });
    var store = { entities: entities, links: links };

    var deg = {}, bet = {};
    if (NET){
      (NET.degreeCentrality(store) || []).forEach(function(o){ deg[o.id] = o.score; });
      var b = NET.betweenness(store);
      (Array.isArray(b) ? b : Object.keys(b || {}).map(function(id){ return { id: id, score: b[id] }; })).forEach(function(o){ bet[o.id] = o.score; });
    }
    links.forEach(function(l){ nodeSet[l.from].weightedDegree += l.weight; nodeSet[l.to].weightedDegree += l.weight; });

    var nodes = Object.keys(nodeSet).map(function(id){ var n = nodeSet[id];
      return { id: id, label: n.label, isTarget: n.isTarget, degree: deg[id] || 0, betweenness: Math.round((bet[id] || 0) * 100) / 100, weightedDegree: n.weightedDegree,
        broker: (deg[id] || 0) <= 2 && (bet[id] || 0) > 0 }; });
    var edges = links.map(function(l){ return { from: l.from, to: l.to, weight: l.weight }; });
    var ranked = nodes.slice().sort(function(a, b){ return b.betweenness - a.betweenness || b.weightedDegree - a.weightedDegree; });
    var order = nodes.slice().sort(function(a, b){ return b.weightedDegree - a.weightedDegree; }).map(function(n){ return n.id; });
    var counts = {}; links.forEach(function(l){ counts[l.from + "|" + l.to] = l.weight; counts[l.to + "|" + l.from] = l.weight; });
    return { nodes: nodes, edges: edges, ranked: ranked, matrixOrder: order, matrixCounts: counts, store: store };
  }

  root.CRCommsNetwork = { build: build };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CRCommsNetwork;
})(typeof window !== "undefined" ? window : this);
