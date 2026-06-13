/* CHART ROOM — graph.js
 * Link chart on vis-network. Confidence rendered as line style:
 * high = solid, med = long dash, low = short dash. Direction as arrows.
 *
 * v2 (QoL build):
 *  - manual layout: dragged nodes pin in place; positions persist in the
 *    case file (entity.chart = {x,y,fixed}) and survive save/load
 *  - layout presets: organic / circle / grouped-by-type / hierarchy
 *  - link elbows: links carry bends [{x,y}] rendered as draggable corner
 *    handles (i2-style routing); double-click a link to add one
 *  - legend filters: hide by entity type / link type / confidence / source
 *    document; colour links by type or by source
 *  - rubber-band multi-select (shift+drag)
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var network = null;
  var geoHidden = false; // hide geographic containment (->country, address->locality)
  function isContainment(l){ return l.type === "LOCATED_IN" && /^(?:country|address parent)$/.test(l.sentence || ""); }
  var nodes = null;
  var edges = null;
  var store = null;
  var physicsOn = true;
  var container = null;

  var TYPE_SIZE = { person: 22, organisation: 20, location: 18, address: 16 };
  var ICON_SIZE = { person: 24, organisation: 22, location: 20, address: 18 };

  /* ---------------- filters & colour modes ---------------- */

  var filters = {
    entityTypes: {},   // type -> true = HIDDEN
    linkTypes: {},
    confidence: {},
    sources: {},
    hiddenIds: {}      // individually hidden entities (context menu)
  };
  var colorMode = "confidence";   // "confidence" | "type" | "source"
  var hlSet = null;               // null = no highlight; {} = dim everything;
                                  // {id:1,...} = keep these bright, dim the rest

  var LINK_PALETTE = ["#6ea8d8", "#7fc97f", "#d87f9b", "#c9c36a", "#9b7fd8", "#d8a06a", "#5fc4c0", "#d86a6a", "#8d99ae", "#e8b34b"];
  function paletteFor(key) {
    var h = 0;
    var s = String(key || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return LINK_PALETTE[h % LINK_PALETTE.length];
  }

  function originOf(x) {
    return (x.audit && x.audit[0] && x.audit[0].detail) || "manual";
  }

  function entityHidden(e) {
    if (filters.hiddenIds[e.id]) return true;
    if (filters.entityTypes[e.type]) return true;
    if (filters.sources[originOf(e)]) return true;
    return false;
  }

  function linkHidden(l) {
    if (filters.linkTypes[l.type]) return true;
    if (filters.confidence[l.confidence]) return true;
    if (filters.sources[originOf(l)]) return true;
    var a = store.getEntity(l.from), b = store.getEntity(l.to);
    if ((a && entityHidden(a)) || (b && entityHidden(b))) return true;
    return false;
  }

  /** Facet counts for the legend panel. */
  function getFacets() {
    var f = { entityTypes: {}, linkTypes: {}, confidence: {}, sources: {} };
    store.entities.forEach(function (e) {
      f.entityTypes[e.type] = (f.entityTypes[e.type] || 0) + 1;
      var o = originOf(e);
      f.sources[o] = (f.sources[o] || 0) + 1;
    });
    store.links.forEach(function (l) {
      f.linkTypes[l.type] = (f.linkTypes[l.type] || 0) + 1;
      f.confidence[l.confidence] = (f.confidence[l.confidence] || 0) + 1;
    });
    return f;
  }

  function setFilter(group, key, hidden) {
    filters[group][key] = hidden ? true : undefined;
    if (!hidden) delete filters[group][key];
    rebuild();
  }
  function clearFilters() {
    filters = { entityTypes: {}, linkTypes: {}, confidence: {}, sources: {}, hiddenIds: {} };
    rebuild();
  }
  function hideEntity(id) { filters.hiddenIds[id] = true; rebuild(); }
  function unhideEntity(id) { delete filters.hiddenIds[id]; rebuild(); }
  function hiddenEntities() {
    return Object.keys(filters.hiddenIds).map(function (id) {
      var e = store.getEntity(id);
      return { id: id, label: e ? e.label : id };
    });
  }

  function setColorMode(mode) { colorMode = mode; rebuild(); }

  /* ---------------- nodes ---------------- */

  function glowOf(hex, a) {
    var h = String(hex || "#8593a3").replace("#", "");
    return "rgba(" + parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) +
      "," + parseInt(h.slice(4, 6), 16) + "," + a + ")";
  }

  function nodeFromEntity(e) {
    var T = window.CRModel.ENTITY_TYPES[e.type] || { colour: "#8593a3" };
    var country = e.type === "location" && e.attrs && e.attrs.kind === "country" && e.attrs.cc;
    var n = {
      id: e.id,
      label: U.truncate(e.label, 26),
      shape: e.type === "note" ? "box" : "dot",
      size: TYPE_SIZE[e.type] || 13,
      hidden: entityHidden(e) || (geoHidden && !!country),
      color: {
        background: "#131c28",
        border: T.colour,
        highlight: { background: "#1d2a3a", border: "#e8b34b" }
      },
      borderWidth: 2,
      borderWidthSelected: 3,
      shadow: { enabled: true, color: glowOf(T.colour, 0.42), size: 22, x: 0, y: 0 },
      font: { color: "#c9d4e0", size: 12, face: "Segoe UI", strokeWidth: 0, vadjust: 2 },
      title: titleFor(e)
    };
    // persisted manual position
    if (e.chart && typeof e.chart.x === "number") {
      n.x = e.chart.x; n.y = e.chart.y;
      n.fixed = { x: !!e.chart.fixed, y: !!e.chart.fixed };
    } else {
      n.fixed = false;
    }
    // time-window / search highlight: everything outside the set dims
    if (hlSet && !hlSet[e.id]) {
      n.opacity = 0.15;
      n.color.background = "#0e141d";
      n.color.border = "#22303f";
      n.font.color = "#3d4d61";
      n.shadow = false;
    } else {
      n.opacity = 1;
    }
    if (e.type === "note") {
      n.color.background = "#2a2716";
      n.color.border = "#d9c87a";
      n.font.color = "#d9c87a";
      n.label = U.truncate(e.label, 60);
    } else if (country) {
      // country node: its flag as the circular background
      n.shape = "circularImage";
      n.image = "assets/flags/" + e.attrs.cc.toLowerCase() + ".svg";
      n.size = (ICON_SIZE[e.type] || 17) + 3;
      n.borderWidth = 2;
      n.color.border = T.colour;
      n.shapeProperties = { useBorderWithImage: true };
      n.font.vadjust = 6;
    } else {
      var face = (e.media || []).find(function (mm) { return mm.face; });
      if (face) {
        n.shape = "circularImage";
        n.image = face.dataUrl;
        n.size = (ICON_SIZE[e.type] || 17) + 4;
        n.borderWidth = 3;
        n.color.border = T.colour;
        n.shapeProperties = { useBorderWithImage: true };
        n.font.vadjust = 6;
      } else if (window.CRIcons) {
        var ic = window.CRIcons.get(e.type, T.colour);
        n.shape = "image";
        n.image = { unselected: ic.unselected, selected: ic.selected };
        n.size = ICON_SIZE[e.type] || 17;
        n.shapeProperties = { useBorderWithImage: false };
        n.font.vadjust = 6;
      }
    }
    return n;
  }

  function titleFor(e) {
    var div = document.createElement("div");
    var html = "<b>" + U.esc(e.label) + "</b><br>" +
      U.esc((window.CRModel.ENTITY_TYPES[e.type] || {}).label || e.type);
    if (e.attrs && e.attrs.dob) html += "<br>DOB " + U.esc(U.fmtDate(e.attrs.dob));
    if (e.attrs && e.attrs.markers) html += "<br>⚑ " + U.esc(U.truncate(e.attrs.markers, 60));
    if (e.ids && e.ids.e164) html += "<br>" + U.esc(e.ids.e164);
    if (e.provenance) {
      html += "<br>3×5×2: " + U.esc(e.provenance.source + e.provenance.intel + e.provenance.handling);
    }
    div.innerHTML = html;
    return div;
  }

  /* ---------------- edges & elbows ---------------- */

  var DASH = { high: false, med: [8, 4], low: [2, 5] };

  function edgeColour(l) {
    if (l.negated) return "#d86a6a";
    if (colorMode === "type") return paletteFor(l.type);
    if (colorMode === "source") return paletteFor(originOf(l));
    return "#3d4d61";
  }

  function baseEdge(l) {
    if (isContainment(l)) {
      // geographic containment recedes so it never dominates a hub like a country
      return {
        dashes: [1, 4], width: 0.5, hidden: linkHidden(l) || geoHidden,
        shadow: false, smooth: { type: "continuous" },
        color: { color: "rgba(95,196,192,0.18)", highlight: "#e8b34b", hover: "#9bb1c9" },
        font: { color: "rgba(0,0,0,0)", size: 0 }
      };
    }
    var dimmed = hlSet && !(hlSet[l.from] && hlSet[l.to]);
    if (dimmed) {
      return {
        dashes: DASH[l.confidence] || false,
        width: 1,
        hidden: linkHidden(l),
        shadow: false,
        color: { color: "rgba(61,77,97,0.16)", highlight: "#e8b34b", hover: "#9bb1c9" },
        font: { color: "rgba(125,138,153,0.15)", size: 9, face: "Consolas", strokeWidth: 0, align: "middle" },
        smooth: { type: "continuous" }
      };
    }
    return {
      dashes: DASH[l.confidence] || false,
      width: l.confidence === "high" ? 2 : 1,
      hoverWidth: 1.6,
      selectionWidth: 1.6,
      hidden: linkHidden(l),
      shadow: { enabled: l.confidence === "high" && colorMode === "confidence", color: "rgba(232,179,75,0.18)", size: 8, x: 0, y: 0 },
      color: { color: edgeColour(l), highlight: "#e8b34b", hover: "#9bb1c9" },
      font: { color: "#7d8a99", size: 9, face: "Consolas", strokeWidth: 4, strokeColor: "#0b1017", align: "middle" },
      smooth: { type: "continuous" }
    };
  }

  function edgeLabel(l) {
    if (isContainment(l)) return "";
    var label = l.type.replace(/_/g, " ");
    if (l.amount) label += " " + l.amount;
    if (l.dateISO) label += "\n" + U.fmtDate(l.dateISO);
    if (l.negated) label += "\n(denied)";
    else if (l.modality === "planned") label += "\n(planned)";
    return label;
  }

  function edgeFromLink(l) {
    var arrows = "";
    if (l.direction === "->") arrows = "to";
    else if (l.direction === "<-") arrows = "from";
    else if (l.direction === "both") arrows = "to, from";
    var e = baseEdge(l);
    e.id = l.id; e.from = l.from; e.to = l.to;
    e.label = edgeLabel(l);
    e.arrows = arrows;
    return e;
  }

  var BEND = "bend|", BSEG = "bseg|";

  function bendNodeId(linkId, i) { return BEND + linkId + "|" + i; }

  function bendNode(l, i, hidden) {
    return {
      id: bendNodeId(l.id, i),
      shape: "dot",
      size: 5,
      label: undefined,
      x: l.bends[i].x, y: l.bends[i].y,
      fixed: false,                            // physics excluded via mass below
      physics: false,                          // corners stay where put
      hidden: hidden,
      color: { background: "#3d4d61", border: "#5a6878", highlight: { background: "#e8b34b", border: "#e8b34b" } },
      borderWidth: 1,
      shadow: false,
      font: { size: 1, color: "rgba(0,0,0,0)" },
      title: "corner — drag to route, right-click to remove"
    };
  }

  /** Expand a bent link into corner nodes + segment edges. */
  function bentParts(l) {
    var hidden = linkHidden(l);
    var parts = { nodes: [], edges: [] };
    var pts = [l.from].concat(l.bends.map(function (_, i) { return bendNodeId(l.id, i); })).concat([l.to]);
    for (var i = 0; i < l.bends.length; i++) parts.nodes.push(bendNode(l, i, hidden));
    for (var s = 0; s < pts.length - 1; s++) {
      var e = baseEdge(l);
      e.id = BSEG + l.id + "|" + s;
      e.from = pts[s]; e.to = pts[s + 1];
      e.smooth = false;                        // straight segments = clean elbows
      var last = s === pts.length - 2;
      e.arrows = last ? (l.direction === "<-" ? "from" : (l.direction === "both" ? "to, from" : "to")) : "";
      e.label = s === Math.floor((pts.length - 2) / 2) ? edgeLabel(l) : " "; // " " not undefined: DataSet.update merges, undefined would keep a stale label
      parts.edges.push(e);
    }
    return parts;
  }

  /** vis id (node or edge) → underlying link id, if it belongs to a bent link. */
  function linkIdOf(visId) {
    var s = String(visId);
    if (s.indexOf(BSEG) === 0 || s.indexOf(BEND) === 0) return s.split("|")[1];
    return null;
  }
  function isBendNode(visId) { return String(visId).indexOf(BEND) === 0; }

  function addBendAt(linkId, canvasPos) {
    var l = store.links.find(function (x) { return x.id === linkId; });
    if (!l) return;
    if (!l.bends) l.bends = [];
    // insert at the segment nearest the click: order bends by projection on from→to
    var a = network.getPositions([l.from])[l.from];
    var insertAt = l.bends.length;
    if (a) {
      var dx = canvasPos.x - a.x, dy = canvasPos.y - a.y;
      var dClick = Math.sqrt(dx * dx + dy * dy);
      for (var i = 0; i < l.bends.length; i++) {
        var bx = l.bends[i].x - a.x, by = l.bends[i].y - a.y;
        if (Math.sqrt(bx * bx + by * by) > dClick) { insertAt = i; break; }
      }
    }
    l.bends.splice(insertAt, 0, { x: canvasPos.x, y: canvasPos.y });
    store._emit("link:update");
  }

  function removeBend(visBendId) {
    var s = String(visBendId).split("|");
    var l = store.links.find(function (x) { return x.id === s[1]; });
    if (!l || !l.bends) return;
    l.bends.splice(parseInt(s[2], 10), 1);
    if (!l.bends.length) delete l.bends;
    store._emit("link:update");
  }

  function straighten(linkId) {
    var l = store.links.find(function (x) { return x.id === linkId; });
    if (!l) return;
    delete l.bends;
    store._emit("link:update");
  }

  /* ---------------- rebuild ---------------- */

  function rebuild() {
    if (!network) return;
    var wantN = {}, wantE = {};
    store.entities.forEach(function (e) { wantN[e.id] = 1; });
    store.links.forEach(function (l) {
      if (l.bends && l.bends.length) {
        for (var i = 0; i < l.bends.length; i++) wantN[bendNodeId(l.id, i)] = 1;
        var segs = l.bends.length + 1;
        for (var s = 0; s < segs; s++) wantE[BSEG + l.id + "|" + s] = 1;
      } else {
        wantE[l.id] = 1;
      }
    });

    nodes.getIds().forEach(function (id) { if (!wantN[id]) nodes.remove(id); });
    edges.getIds().forEach(function (id) { if (!wantE[id]) edges.remove(id); });
    store.entities.forEach(function (e) { nodes.update(nodeFromEntity(e)); });
    store.links.forEach(function (l) {
      if (l.bends && l.bends.length) {
        var parts = bentParts(l);
        parts.nodes.forEach(function (n) { nodes.update(n); });
        parts.edges.forEach(function (e) { edges.update(e); });
      } else {
        edges.update(edgeFromLink(l));
      }
    });

    var empty = U.el("chart-empty");
    if (empty) empty.style.display = store.entities.length ? "none" : "flex";
    if (window.CRLegend) window.CRLegend.refresh();
  }

  /* ---------------- layout presets ---------------- */

  function pinAll(positions) {
    Object.keys(positions).forEach(function (id) {
      var e = store.getEntity(id);
      if (!e) return;
      e.chart = { x: Math.round(positions[id].x), y: Math.round(positions[id].y), fixed: false };
    });
    if (physicsOn) togglePhysics();
    store._emit("layout");
    fit();
  }

  function visibleEntities() {
    return store.entities.filter(function (e) { return !entityHidden(e); });
  }

  function applyLayout(kind) {
    var ents = visibleEntities();
    if (!ents.length) return;
    var pos = {};

    if (kind === "organic") {
      ents.forEach(function (e) { delete e.chart; });
      if (!physicsOn) togglePhysics();
      store._emit("layout");
      network.stabilize(180);
      fit();
      return;
    }

    if (kind === "circle") {
      var R = Math.max(160, 36 * Math.sqrt(ents.length) * 2);
      var sorted = ents.slice().sort(function (a, b) {
        return (a.type + a.label).localeCompare(b.type + b.label);
      });
      sorted.forEach(function (e, i) {
        var th = (i / sorted.length) * Math.PI * 2 - Math.PI / 2;
        pos[e.id] = { x: Math.cos(th) * R, y: Math.sin(th) * R };
      });
      pinAll(pos);
      return;
    }

    if (kind === "grouped") {
      // i2 "Grouped": one cluster per entity type around a ring
      var byType = {};
      ents.forEach(function (e) { (byType[e.type] = byType[e.type] || []).push(e); });
      var types = Object.keys(byType);
      var ringR = Math.max(260, 90 * types.length);
      types.forEach(function (t, ti) {
        var th = (ti / types.length) * Math.PI * 2 - Math.PI / 2;
        var cx = Math.cos(th) * ringR, cy = Math.sin(th) * ringR;
        var members = byType[t];
        var r2 = Math.max(46, 26 * Math.sqrt(members.length) * 1.6);
        members.forEach(function (e, mi) {
          if (members.length === 1) { pos[e.id] = { x: cx, y: cy }; return; }
          var th2 = (mi / members.length) * Math.PI * 2;
          pos[e.id] = { x: cx + Math.cos(th2) * r2, y: cy + Math.sin(th2) * r2 };
        });
      });
      pinAll(pos);
      return;
    }

    if (kind === "hierarchy") {
      // BFS levels from the most-connected node (the hub)
      var degree = {};
      store.links.forEach(function (l) {
        degree[l.from] = (degree[l.from] || 0) + 1;
        degree[l.to] = (degree[l.to] || 0) + 1;
      });
      var hub = ents.slice().sort(function (a, b) { return (degree[b.id] || 0) - (degree[a.id] || 0); })[0];
      var level = {}; level[hub.id] = 0;
      var queue = [hub.id];
      while (queue.length) {
        var cur = queue.shift();
        store.links.forEach(function (l) {
          var nb = l.from === cur ? l.to : (l.to === cur ? l.from : null);
          if (nb && level[nb] === undefined) { level[nb] = level[cur] + 1; queue.push(nb); }
        });
      }
      var rows = {};
      ents.forEach(function (e) {
        var lv = level[e.id] === undefined ? 99 : level[e.id];
        (rows[lv] = rows[lv] || []).push(e);
      });
      Object.keys(rows).sort(function (a, b) { return a - b; }).forEach(function (lv, ri) {
        var row = rows[lv];
        row.forEach(function (e, ci) {
          pos[e.id] = { x: (ci - (row.length - 1) / 2) * 170, y: ri * 150 };
        });
      });
      pinAll(pos);
      return;
    }
  }

  /* ---------------- init ---------------- */

  function init(domContainer, caseStore, onSelect) {
    store = caseStore;
    container = domContainer;
    nodes = new vis.DataSet([]);
    edges = new vis.DataSet([]);
    network = new vis.Network(container, { nodes: nodes, edges: edges }, {
      interaction: { hover: true, multiselect: true, tooltipDelay: 220 },
      physics: {
        solver: "barnesHut",
        barnesHut: { gravitationalConstant: -5200, springLength: 150, springConstant: 0.025, damping: 0.32, avoidOverlap: 0.4 },
        stabilization: { iterations: 120, fit: true }
      },
      edges: { selectionWidth: 1 },
      nodes: { chosen: true }
    });

    network.on("click", function (p) {
      if (p.nodes.length) {
        if (isBendNode(p.nodes[0])) { onSelect({ kind: "link", id: linkIdOf(p.nodes[0]) }); return; }
        try { pulseEdges(network.getConnectedEdges(p.nodes[0])); } catch (e) { /* noop */ }
        onSelect({ kind: "entity", id: p.nodes[0] });
      } else if (p.edges.length) {
        pulseEdges([p.edges[0]]);
        onSelect({ kind: "link", id: linkIdOf(p.edges[0]) || p.edges[0] });
      } else { stopPulse(); onSelect(null); }
    });

    network.on("doubleClick", function (p) {
      // double-click a link → add a corner there (i2 elbow routing)
      if (!p.nodes.length && p.edges.length) {
        var lid = linkIdOf(p.edges[0]) || p.edges[0];
        addBendAt(lid, p.pointer.canvas);
        return;
      }
      if (p.nodes.length && !isBendNode(p.nodes[0])) {
        network.focus(p.nodes[0], { scale: 1.2, animation: true });
      }
    });

    // dragging pins entities where they're dropped; corners update their link
    network.on("dragEnd", function (p) {
      if (!p.nodes || !p.nodes.length) return;
      var positions = network.getPositions(p.nodes);
      var touched = false;
      p.nodes.forEach(function (id) {
        if (isBendNode(id)) {
          var bits = String(id).split("|");
          var l = store.links.find(function (x) { return x.id === bits[1]; });
          var bi = parseInt(bits[2], 10);
          if (l && l.bends && l.bends[bi]) {
            l.bends[bi] = { x: Math.round(positions[id].x), y: Math.round(positions[id].y) };
            touched = true;
          }
        } else {
          var e = store.getEntity(id);
          if (e) {
            e.chart = { x: Math.round(positions[id].x), y: Math.round(positions[id].y), fixed: physicsOn };
            touched = true;
          }
        }
      });
      if (touched) store._emit("layout");
    });

    // shift+drag rubber-band multi-select
    var band = null, bandStart = null;
    container.addEventListener("mousedown", function (ev) {
      if (!ev.shiftKey || ev.button !== 0) return;
      ev.preventDefault(); ev.stopPropagation();
      bandStart = { x: ev.offsetX, y: ev.offsetY };
      band = document.createElement("div");
      band.className = "select-band";
      container.appendChild(band);
    }, true);
    container.addEventListener("mousemove", function (ev) {
      if (!band) return;
      var x = Math.min(ev.offsetX, bandStart.x), y = Math.min(ev.offsetY, bandStart.y);
      band.style.left = x + "px"; band.style.top = y + "px";
      band.style.width = Math.abs(ev.offsetX - bandStart.x) + "px";
      band.style.height = Math.abs(ev.offsetY - bandStart.y) + "px";
    }, true);
    window.addEventListener("mouseup", function (ev) {
      if (!band) return;
      var rect = { x1: parseFloat(band.style.left), y1: parseFloat(band.style.top) };
      rect.x2 = rect.x1 + parseFloat(band.style.width || "0");
      rect.y2 = rect.y1 + parseFloat(band.style.height || "0");
      band.remove(); band = null;
      var c1 = network.DOMtoCanvas({ x: rect.x1, y: rect.y1 });
      var c2 = network.DOMtoCanvas({ x: rect.x2, y: rect.y2 });
      var ids = [];
      // only visible entities: rubber-band must never grab filtered-out nodes
      var vids = visibleEntities().map(function (e) { return e.id; });
      var all = network.getPositions(vids);
      Object.keys(all).forEach(function (id) {
        var pp = all[id];
        if (pp.x >= c1.x && pp.x <= c2.x && pp.y >= c1.y && pp.y <= c2.y) ids.push(id);
      });
      if (ids.length) network.selectNodes(ids);
    }, true);

    store.onChange(rebuild);
    rebuild();
  }

  /* ---------------- edge pulse (selection feedback) ---------------- */
  var pulseTimer = null, pulseEdgeIds = [], pulseT = 0;
  function stopPulse() {
    if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
    if (pulseEdgeIds.length) { pulseEdgeIds = []; rebuild(); } // clean restore of base styling
  }
  function pulseEdges(ids) {
    if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
    if (pulseEdgeIds.length) rebuild();                       // restore any prior pulse first
    pulseEdgeIds = (ids || []).filter(function (x) { return x != null; });
    if (!pulseEdgeIds.length || !network) return;
    pulseT = 0;
    pulseTimer = setInterval(function () {
      if (!network) { stopPulse(); return; }
      var live = pulseEdgeIds.filter(function (id) { return edges.get(id); });
      if (!live.length) { stopPulse(); return; }
      pulseT += 0.22;
      var k = 0.5 + 0.5 * Math.sin(pulseT);
      var w = 1.6 + 3.4 * k, glow = 4 + 13 * k;
      try {
        edges.update(live.map(function (id) {
          return { id: id, width: w,
            color: { color: "#e8b34b", highlight: "#e8b34b", hover: "#e8b34b" },
            shadow: { enabled: true, color: "rgba(232,179,75,0.6)", size: glow, x: 0, y: 0 } };
        }));
      } catch (e) { /* edge gone */ }
    }, 55);
  }

  /* ---------------- existing API ---------------- */

  function select(id) {
    if (!network) return;
    try { network.selectNodes([id]); } catch (e) { /* id may not exist */ }
  }

  function focus(id) {
    if (!network) return;
    try {
      network.focus(id, { scale: 1.1, animation: { duration: 420, easingFunction: "easeInOutQuad" } });
      network.selectNodes([id]);
    } catch (e) { /* noop */ }
  }

  function fit() { if (network) network.fit({ animation: { duration: 380, easingFunction: "easeInOutQuad" } }); }

  function togglePhysics() {
    physicsOn = !physicsOn;
    network.setOptions({ physics: { enabled: physicsOn } });
    return physicsOn;
  }

  /** Dim everything except the given ids (search/time highlight).
   *  null clears; an EMPTY array dims the whole chart (an empty time window
   *  must not silently read as "no filter"). Edges dim with their nodes. */
  function highlight(ids) {
    if (ids == null) {
      hlSet = null;
    } else {
      hlSet = {};
      ids.forEach(function (i) { hlSet[i] = 1; });
    }
    rebuild();
  }

  function exportPNG() {
    var canvas = document.querySelector("#chart canvas");
    if (!canvas) return null;
    var out = document.createElement("canvas");
    out.width = canvas.width; out.height = canvas.height + 46;
    var ctx = out.getContext("2d");
    ctx.fillStyle = "#0b1017";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 28);
    ctx.fillStyle = "#e8b34b";
    ctx.font = "600 13px Consolas, monospace";
    ctx.textAlign = "center";
    var banner = (store.meta.classification || "OFFICIAL");
    ctx.fillText(banner, out.width / 2, 18);
    ctx.fillText(banner, out.width / 2, out.height - 8);
    ctx.textAlign = "left";
    ctx.fillStyle = "#5a6878";
    ctx.font = "10px Consolas, monospace";
    ctx.fillText(store.meta.name + " — exported " + new Date().toISOString().slice(0, 16).replace("T", " "), 8, out.height - 8);
    return out.toDataURL("image/png");
  }

  /* ---------------- helpers for menu / drops ---------------- */

  function nodeAtDOM(x, y) {
    if (!network) return null;
    var id = network.getNodeAt({ x: x, y: y });
    if (!id || isBendNode(id)) return null;
    return id;
  }
  function edgeAtDOM(x, y) {
    if (!network) return null;
    var id = network.getEdgeAt({ x: x, y: y });
    if (!id) return null;
    return linkIdOf(id) || id;
  }
  function bendAtDOM(x, y) {
    if (!network) return null;
    var id = network.getNodeAt({ x: x, y: y });
    return id && isBendNode(id) ? id : null;
  }
  function canvasPos(x, y) { return network.DOMtoCanvas({ x: x, y: y }); }

  function setPinned(id, pinned) {
    var e = store.getEntity(id);
    if (!e) return;
    if (pinned) {
      var p = network.getPositions([id])[id];
      e.chart = { x: Math.round(p.x), y: Math.round(p.y), fixed: true };
    } else {
      delete e.chart;
    }
    store._emit("layout");
  }
  function isPinned(id) {
    var e = store.getEntity(id);
    return !!(e && e.chart && e.chart.fixed);
  }

  function getNetwork() { return network; }
  function getStore() { return store; }

  window.CRGraph = {
    init: init, rebuild: rebuild, select: select, focus: focus, fit: fit,
    togglePhysics: togglePhysics, highlight: highlight, exportPNG: exportPNG,
    getNetwork: getNetwork, getStore: getStore,
    // v2
    getFacets: getFacets, setFilter: setFilter, clearFilters: clearFilters,
    hideEntity: hideEntity, unhideEntity: unhideEntity, hiddenEntities: hiddenEntities,
    setColorMode: setColorMode,
    setGeoHidden: function (b) { geoHidden = !!b; rebuild(); },
    geoHidden: function () { return geoHidden; },
    applyLayout: applyLayout, addBendAt: addBendAt, removeBend: removeBend,
    straighten: straighten, setPinned: setPinned, isPinned: isPinned,
    nodeAtDOM: nodeAtDOM, edgeAtDOM: edgeAtDOM, bendAtDOM: bendAtDOM, canvasPos: canvasPos
  };
})();
