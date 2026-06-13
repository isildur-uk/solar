/* CHART ROOM — chartmenu.js
 * Right-click context menu on the chart: pin/unpin, hide, set photo,
 * link-from-here, corners on links, delete. Background: add entity, fit.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var store = null;
  var menuEl = null;
  var linkFrom = null;          // pending "link from here" source id

  function close() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function show(x, y, items) {
    close();
    menuEl = document.createElement("div");
    menuEl.className = "ctx-menu";
    items.forEach(function (it) {
      if (it === "-") {
        var hr = document.createElement("div");
        hr.className = "ctx-sep";
        menuEl.appendChild(hr);
        return;
      }
      var d = document.createElement("div");
      d.className = "ctx-item" + (it.danger ? " danger" : "");
      d.textContent = it.label;
      d.setAttribute("role", "menuitem");
      d.tabIndex = 0;
      function go() { close(); it.fn(); }
      d.addEventListener("click", go);
      d.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
      menuEl.appendChild(d);
    });
    document.body.appendChild(menuEl);
    var mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
    menuEl.style.left = Math.min(x, window.innerWidth - mw - 8) + "px";
    menuEl.style.top = Math.min(y, window.innerHeight - mh - 8) + "px";
  }

  function pickPhoto(entityId) {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { store.addMedia(entityId, { name: f.name, dataUrl: rd.result, face: true }); };
      rd.readAsDataURL(f);
    });
    inp.click();
  }

  function nodeMenu(id, x, y) {
    var G = window.CRGraph;
    var e = store.getEntity(id);
    if (!e) return;
    var pinned = G.isPinned(id);
    show(x, y, [
      { label: pinned ? "Unpin (let it float)" : "Pin in place", fn: function () { G.setPinned(id, !pinned); } },
      { label: "Set photo…", fn: function () { pickPhoto(id); } },
      { label: "Link from here →", fn: function () { linkFrom = id; if (window.CRApp) window.CRApp.status("Click the target entity to create the link (Esc cancels)"); } },
      { label: "Hide from chart", fn: function () { G.hideEntity(id); } },
      "-",
      { label: "Delete entity", danger: true, fn: function () {
          if (window.confirm("Delete “" + e.label + "” and its links?")) {
            store.snapshot();
            store.removeEntity(id);
          }
        } }
    ]);
  }

  function edgeMenu(linkId, x, y, domX, domY) {
    var G = window.CRGraph;
    var l = store.links.find(function (z) { return z.id === linkId; });
    if (!l) return;
    var items = [
      { label: "Add corner here", fn: function () { G.addBendAt(linkId, G.canvasPos(domX, domY)); } }
    ];
    if (l.bends && l.bends.length) {
      items.push({ label: "Straighten (remove corners)", fn: function () { G.straighten(linkId); } });
    }
    items.push("-");
    items.push({ label: "Delete link", danger: true, fn: function () {
      store.snapshot();
      store.removeLink(linkId);
    } });
    show(x, y, items);
  }

  function bendMenu(bendId, x, y) {
    show(x, y, [
      { label: "Remove corner", fn: function () { window.CRGraph.removeBend(bendId); } }
    ]);
  }

  function bgMenu(x, y, domX, domY) {
    var G = window.CRGraph;
    show(x, y, [
      { label: "Add entity here…", fn: function () {
          var label = window.prompt("Entity label:");
          if (!label) return;
          store.snapshot();
          var ent = store.addEntity({ type: "person", label: label, origin: "manual" });
          var c = G.canvasPos(domX, domY);
          ent.chart = { x: Math.round(c.x), y: Math.round(c.y), fixed: true };
          store._emit("layout");
        } },
      { label: "Fit chart", fn: function () { G.fit(); } },
      { label: "Clear highlight / time filter", fn: function () {
          G.highlight(null);
          if (window.CRTimeline && window.CRTimeline.clearRange) window.CRTimeline.clearRange();
        } }
    ]);
  }

  function init(caseStore, chartContainer) {
    store = caseStore;
    var G = window.CRGraph;

    chartContainer.addEventListener("contextmenu", function (ev) {
      ev.preventDefault();
      var rect = chartContainer.getBoundingClientRect();
      var dx = ev.clientX - rect.left, dy = ev.clientY - rect.top;
      var bend = G.bendAtDOM(dx, dy);
      if (bend) { bendMenu(bend, ev.clientX, ev.clientY); return; }
      var nid = G.nodeAtDOM(dx, dy);
      if (nid) { nodeMenu(nid, ev.clientX, ev.clientY); return; }
      var lid = G.edgeAtDOM(dx, dy);
      if (lid) { edgeMenu(lid, ev.clientX, ev.clientY, dx, dy); return; }
      bgMenu(ev.clientX, ev.clientY, dx, dy);
    });

    // complete a pending "link from here"
    chartContainer.addEventListener("click", function (ev) {
      if (!linkFrom) return;
      var rect = chartContainer.getBoundingClientRect();
      var nid = G.nodeAtDOM(ev.clientX - rect.left, ev.clientY - rect.top);
      if (nid && nid !== linkFrom) {
        store.snapshot();
        store.addLink({ from: linkFrom, to: nid, type: "LINKED_TO", confidence: "med", origin: "manual" });
      }
      linkFrom = null;
    });

    document.addEventListener("click", function (ev) {
      if (menuEl && !menuEl.contains(ev.target)) close();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { close(); linkFrom = null; }
    });
  }

  window.CRChartMenu = { init: init };
})();
