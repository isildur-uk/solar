/* SOLAR — netanalysis.js
 * Network & geospatial analysis on the case model. Dependency-free, runs in the
 * browser and in Node (tests). No DOM, no libraries.
 *   - shortestPath(store, a, b)      BFS over the undirected link graph
 *   - degreeCentrality(store)        connection count per entity
 *   - betweenness(store)             Brandes' algorithm (unweighted, undirected)
 *   - haversineKm / bearingDeg       great-circle distance & initial bearing
 *   - entitiesWithin(store, lat, lon, km)
 * Links are treated as undirected for reachability/centrality (an association is
 * an association regardless of arrow direction).
 */
(function () {
  "use strict";

  function adjacency(store) {
    var adj = {};
    (store.entities || []).forEach(function (e) { adj[e.id] = []; });
    (store.links || []).forEach(function (l) {
      if (adj[l.from] === undefined || adj[l.to] === undefined) return;
      if (l.from === l.to) return;
      if (adj[l.from].indexOf(l.to) === -1) adj[l.from].push(l.to);
      if (adj[l.to].indexOf(l.from) === -1) adj[l.to].push(l.from);
    });
    return adj;
  }

  // BFS shortest path; returns inclusive [a, ..., b] or null if unreachable.
  function shortestPath(store, a, b) {
    if (a === b) return [a];
    var adj = adjacency(store);
    if (adj[a] === undefined || adj[b] === undefined) return null;
    var prev = {}, seen = {}, queue = [a];
    seen[a] = true;
    while (queue.length) {
      var cur = queue.shift();
      var nbrs = adj[cur];
      for (var i = 0; i < nbrs.length; i++) {
        var n = nbrs[i];
        if (seen[n]) continue;
        seen[n] = true; prev[n] = cur;
        if (n === b) {
          var path = [b], p = b;
          while (p !== a) { p = prev[p]; path.push(p); }
          return path.reverse();
        }
        queue.push(n);
      }
    }
    return null;
  }

  function degreeCentrality(store) {
    var adj = adjacency(store);
    return Object.keys(adj).map(function (id) {
      return { id: id, score: adj[id].length };
    }).sort(function (x, y) { return y.score - x.score; });
  }

  // Brandes' betweenness centrality for unweighted undirected graphs.
  function betweenness(store) {
    var adj = adjacency(store);
    var ids = Object.keys(adj);
    var CB = {};
    ids.forEach(function (v) { CB[v] = 0; });

    ids.forEach(function (s) {
      var S = [], P = {}, sigma = {}, dist = {};
      ids.forEach(function (w) { P[w] = []; sigma[w] = 0; dist[w] = -1; });
      sigma[s] = 1; dist[s] = 0;
      var Q = [s];
      while (Q.length) {
        var v = Q.shift();
        S.push(v);
        adj[v].forEach(function (w) {
          if (dist[w] < 0) { dist[w] = dist[v] + 1; Q.push(w); }
          if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; P[w].push(v); }
        });
      }
      var delta = {};
      ids.forEach(function (w) { delta[w] = 0; });
      while (S.length) {
        var w2 = S.pop();
        P[w2].forEach(function (v2) {
          delta[v2] += (sigma[v2] / sigma[w2]) * (1 + delta[w2]);
        });
        if (w2 !== s) CB[w2] += delta[w2];
      }
    });

    // undirected: each pair counted twice -> halve
    return ids.map(function (id) {
      return { id: id, score: CB[id] / 2 };
    }).sort(function (x, y) { return y.score - x.score; });
  }

  /* ---------------- geospatial ---------------- */

  function toRad(d) { return d * Math.PI / 180; }
  function toDeg(r) { return r * 180 / Math.PI; }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371.0088;
    var dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function bearingDeg(lat1, lon1, lat2, lon2) {
    var y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    var x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function compass(brg) {
    var dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    return dirs[Math.round(brg / 22.5) % 16];
  }

  function coordsOf(e) {
    if (e.geo && typeof e.geo.lat === "number") return [e.geo.lat, e.geo.lon];
    if (e.attrs && typeof e.attrs.lat === "number") return [e.attrs.lat, e.attrs.lon];
    return null;
  }

  function entitiesWithin(store, lat, lon, km) {
    var out = [];
    (store.entities || []).forEach(function (e) {
      var c = coordsOf(e);
      if (!c) return;
      var d = haversineKm(lat, lon, c[0], c[1]);
      if (d <= km) out.push({ id: e.id, km: d });
    });
    return out.sort(function (a, b) { return a.km - b.km; });
  }

  var CRNet = {
    adjacency: adjacency,
    shortestPath: shortestPath,
    degreeCentrality: degreeCentrality,
    betweenness: betweenness,
    haversineKm: haversineKm,
    bearingDeg: bearingDeg,
    compass: compass,
    coordsOf: coordsOf,
    entitiesWithin: entitiesWithin
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CRNet;
  if (typeof window !== "undefined") window.CRNet = CRNet;
})();
