/* highlighter.js — analyst report highlighter + save-as-note (Ben B1/B3).
 *
 * Select text in a report body -> a small floating toolbar appears with a
 * COLOUR WELL (compact swatch that opens a grid of cosmic-tuned highlight
 * colours) and a SAVE NOTE action. Applying wraps the selection in a
 * marker-style Hi-Liter highlight (fx-marker look, in the chosen colour) and
 * records a note. Saved highlights persist per report (localStorage, versioned)
 * and are restored on reload. A notes panel lists them, lets the analyst add a
 * free-text annotation, scroll to a highlight, and remove it.
 *
 * ANCHORING: each highlight is stored as { item, start, end, snippet, colour,
 * note, id, ts } where `item` is the report item's index (data-hl-item) and
 * start/end are character offsets into that item block's flattened textContent.
 * On restore we re-wrap [start,end] across whatever text nodes span it (so it
 * survives the entity-<mark> markup the report already renders). If the item's
 * text no longer matches the saved snippet, the highlight is skipped (kept in
 * store, just not painted) — a robust-enough anchor, not a fragile full-text
 * diff. This is the documented MVP limitation.
 *
 * TRUST/SAFETY: report text + analyst annotations are handled as untrusted.
 * Every value reaches the DOM via textContent or an escaped builder — never
 * innerHTML with data. Toolbar + panel are keyboard-reachable, aria-labelled,
 * ESC-dismissable. Reduced-motion disables the marker sweep. Both themes.
 *
 * Dual nature: attaches to the registry report view via attach(container, urn).
 * Persistence is localStorage; in-memory fallback keeps it load-safe.
 */
"use strict";
(function () {
  var KEY = "reg_highlights_v1";
  var VERSION = 1;
  var mem = null;

  /* ---- cosmic-tuned highlight palette (image4 "Fill" grid, on-brand) ---- */
  var COLOURS = [
    { id: "periwinkle", name: "Periwinkle", hex: "#8ea2ff" },
    { id: "violet", name: "Violet", hex: "#b39dff" },
    { id: "amber", name: "Amber", hex: "#f2c14e" },
    { id: "rose", name: "Rose", hex: "#f2789a" },
    { id: "mint", name: "Mint", hex: "#5ad1a8" },
    { id: "sky", name: "Sky", hex: "#5cc8e6" },
    { id: "coral", name: "Coral", hex: "#f2895a" },
    { id: "slate", name: "Slate", hex: "#9aa5c4" }
  ];
  function colourOf(id) { for (var i = 0; i < COLOURS.length; i++) { if (COLOURS[i].id === id) { return COLOURS[i]; } } return COLOURS[0]; }

  /* ---- store (mirrors access-log.js: localStorage + in-memory fallback) ---- */
  function store() { try { return (typeof window !== "undefined" && window.localStorage) ? window.localStorage : null; } catch (e) { return null; } }
  function loadAll() {
    var s = store();
    if (!s) { return mem || { version: VERSION, byUrn: {} }; }
    try {
      var raw = s.getItem(KEY);
      if (!raw) { return { version: VERSION, byUrn: {} }; }
      var p = JSON.parse(raw);
      if (!p || p.version !== VERSION || typeof p.byUrn !== "object") { return { version: VERSION, byUrn: {} }; }
      return p;
    } catch (e) { return { version: VERSION, byUrn: {} }; }
  }
  function saveAll(state) {
    var s = store();
    if (!s) { mem = state; return; }
    try { s.setItem(KEY, JSON.stringify(state)); } catch (e) { mem = state; }
  }
  function listFor(urn) { var all = loadAll(); return (all.byUrn[urn] || []).slice(); }
  function writeFor(urn, arr) { var all = loadAll(); all.byUrn[urn] = arr; saveAll(all); emit(); }
  function uid() { return "hl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7); }
  function emit() { try { window.dispatchEvent(new CustomEvent("reg-highlights")); } catch (e) { /* noop */ } }

  /* ---- DOM helpers (all text via textContent) ---- */
  function elt(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text != null) { n.textContent = String(text); } return n; }
  function reduced() { try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }
  function sound(cue) { try { if (window.SolarSound) { window.SolarSound.play(cue); } } catch (e) { /* noop */ } }

  /* ---- text-node walking: flatten offsets + wrap a [start,end] range -------
     itemEl is a .item-text block whose textContent may span several text nodes
     (plain text + entity <mark> children). We treat its textContent as one flat
     string; offsets index into that. */
  function flatText(itemEl) { return itemEl.textContent || ""; }

  // Wrap the flattened [start,end] range of itemEl in a <span class="rh-hl">.
  // Walks text nodes, splitting the boundary nodes as needed. Returns the
  // created wrapper span, or null if the range is invalid.
  function wrapRange(itemEl, start, end, hl) {
    if (start == null || end == null || end <= start) { return null; }
    var walker = document.createTreeWalker(itemEl, NodeFilter.SHOW_TEXT, null, false);
    var pos = 0, node, nodes = [];
    while ((node = walker.nextNode())) {
      var len = node.nodeValue.length;
      var nodeStart = pos, nodeEnd = pos + len;
      if (nodeEnd > start && nodeStart < end) {
        nodes.push({ node: node, from: Math.max(start, nodeStart) - nodeStart, to: Math.min(end, nodeEnd) - nodeStart });
      }
      pos = nodeEnd;
      if (pos >= end) { break; }
    }
    if (!nodes.length) { return null; }

    var span = document.createElement("span");
    span.className = "rh-hl" + (reduced() ? "" : " rh-hl-sweep");
    span.setAttribute("data-hl-id", hl.id);
    span.style.setProperty("--rh-ink", colourOf(hl.colour).hex);
    span.setAttribute("tabindex", "0");
    span.setAttribute("role", "mark");
    span.setAttribute("aria-label", "Highlighted note: " + (hl.snippet || ""));

    // Move the covered text fragments into the span. Process in DOM order; split
    // partial boundary nodes so only the exact range is wrapped.
    var first = nodes[0], last = nodes[nodes.length - 1];
    // split the first node at `from`, and the last node at `to`
    var startNode = first.node.splitText ? (first.from > 0 ? first.node.splitText(first.from) : first.node) : first.node;
    // recompute last relative to possibly-split start
    var lastNode = last.node;
    var lastTo = last.to;
    if (last.node === first.node) { lastTo = last.to - first.from; lastNode = startNode; }
    if (lastNode.splitText && lastTo < lastNode.nodeValue.length) { lastNode.splitText(lastTo); }

    // collect the run of text nodes from startNode..lastNode (inclusive)
    var range = document.createRange();
    range.setStartBefore(startNode);
    range.setEndAfter(lastNode);
    try { range.surroundContents(span); }
    catch (e) {
      // surroundContents throws if the range partially selects a non-text node
      // (e.g. crosses an entity <mark> boundary). Fall back to extract+insert.
      try {
        var frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      } catch (e2) { return null; }
    }
    return span;
  }

  /* ---- module state ---- */
  var container = null, currentUrn = null, toolbar = null, palette = null, panel = null;
  var lastRange = null, chosenColour = "periwinkle", escBound = false;

  /* ---- selection toolbar ------------------------------------------------- */
  function hideToolbar() {
    if (toolbar) { toolbar.remove(); toolbar = null; }
    if (palette) { palette.remove(); palette = null; }
  }
  function itemElFromRange(range) {
    var n = range.commonAncestorContainer;
    n = n.nodeType === 1 ? n : n.parentNode;
    return n && n.closest ? n.closest(".item-text[data-hl-item]") : null;
  }
  // flattened offset of a (node, offset) point within itemEl
  function offsetIn(itemEl, node, nodeOffset) {
    var walker = document.createTreeWalker(itemEl, NodeFilter.SHOW_TEXT, null, false);
    var pos = 0, t;
    while ((t = walker.nextNode())) {
      if (t === node) { return pos + nodeOffset; }
      pos += t.nodeValue.length;
    }
    return -1;
  }

  function onSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { return; }
    var range = sel.getRangeAt(0);
    var itemEl = itemElFromRange(range);
    if (!itemEl || !container.contains(itemEl)) { return; }
    // both ends must be inside the same item block
    var startItem = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentNode).closest(".item-text[data-hl-item]");
    var endItem = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentNode).closest(".item-text[data-hl-item]");
    if (startItem !== itemEl || endItem !== itemEl) { return; }
    var start = offsetIn(itemEl, range.startContainer, range.startOffset);
    var end = offsetIn(itemEl, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || end <= start) { return; }
    var snippet = flatText(itemEl).slice(start, end);
    if (!snippet.trim()) { return; }
    lastRange = { item: itemEl.getAttribute("data-hl-item"), start: start, end: end, snippet: snippet };
    showToolbar(range);
  }

  function showToolbar(range) {
    hideToolbar();
    var rect = range.getBoundingClientRect();
    toolbar = elt("div", "rh-toolbar");
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Highlight selection");

    // colour well (compact swatch -> grid popover)
    var well = elt("button", "rh-well");
    well.type = "button";
    well.setAttribute("aria-haspopup", "true");
    well.setAttribute("aria-expanded", "false");
    well.setAttribute("aria-label", "Highlight colour — " + colourOf(chosenColour).name);
    well.setAttribute("data-tip", "Choose highlight colour");
    var swatch = elt("span", "rh-well-swatch");
    swatch.style.background = colourOf(chosenColour).hex;
    well.appendChild(swatch);
    well.appendChild(elt("span", "rh-well-caret", "▾"));
    well.addEventListener("click", function (e) { e.stopPropagation(); togglePalette(well); });
    toolbar.appendChild(well);

    // Save note action
    var save = elt("button", "rh-save", "Save note");
    save.type = "button";
    save.setAttribute("data-tip", "Highlight the selection and save it as a note");
    save.addEventListener("click", function (e) { e.stopPropagation(); commitHighlight(); });
    toolbar.appendChild(save);

    document.body.appendChild(toolbar);
    // position above the selection, clamped to viewport
    var tw = toolbar.offsetWidth, th = toolbar.offsetHeight;
    var top = rect.top - th - 8, left = rect.left + rect.width / 2 - tw / 2;
    if (top < 6) { top = rect.bottom + 8; }
    left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
    toolbar.style.top = Math.round(top) + "px";
    toolbar.style.left = Math.round(left) + "px";
    bindEsc();
    // keyboard: focus the first control so Tab/Enter works from the keyboard
    well.focus();
  }

  function togglePalette(well) {
    if (palette) { palette.remove(); palette = null; well.setAttribute("aria-expanded", "false"); return; }
    palette = elt("div", "rh-palette");
    palette.setAttribute("role", "listbox");
    palette.setAttribute("aria-label", "Highlight colours");
    COLOURS.forEach(function (c) {
      var b = elt("button", "rh-sw" + (c.id === chosenColour ? " is-on" : ""));
      b.type = "button";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", c.id === chosenColour ? "true" : "false");
      b.setAttribute("aria-label", c.name);
      b.setAttribute("data-tip", c.name);
      b.style.background = c.hex;
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        chosenColour = c.id;
        var sw = well.querySelector(".rh-well-swatch"); if (sw) { sw.style.background = c.hex; }
        well.setAttribute("aria-label", "Highlight colour — " + c.name);
        palette.remove(); palette = null; well.setAttribute("aria-expanded", "false");
        sound("select");
        well.focus();
      });
      palette.appendChild(b);
    });
    document.body.appendChild(palette);
    var wr = well.getBoundingClientRect();
    var pw = palette.offsetWidth;
    var left = Math.max(6, Math.min(wr.left, window.innerWidth - pw - 6));
    palette.style.top = Math.round(wr.bottom + 6) + "px";
    palette.style.left = Math.round(left) + "px";
    well.setAttribute("aria-expanded", "true");
    var first = palette.querySelector(".rh-sw"); if (first) { first.focus(); }
  }

  function commitHighlight() {
    if (!lastRange) { hideToolbar(); return; }
    var itemEl = container.querySelector('.item-text[data-hl-item="' + cssAttr(lastRange.item) + '"]');
    if (!itemEl) { hideToolbar(); return; }
    var hl = {
      id: uid(), item: lastRange.item, start: lastRange.start, end: lastRange.end,
      snippet: lastRange.snippet, colour: chosenColour, note: "", ts: new Date().toISOString()
    };
    var applied = wrapRange(itemEl, hl.start, hl.end, hl);
    if (!applied) { hideToolbar(); return; }
    var arr = listFor(currentUrn); arr.push(hl); writeFor(currentUrn, arr);
    sound("success");
    window.getSelection().removeAllRanges();
    hideToolbar();
    renderPanel();
  }

  function cssAttr(v) { return String(v).replace(/"/g, '\\"'); }

  /* ---- restore saved highlights on attach ---- */
  function restore() {
    var arr = listFor(currentUrn), skipped = 0;
    arr.forEach(function (hl) {
      var itemEl = container.querySelector('.item-text[data-hl-item="' + cssAttr(hl.item) + '"]');
      if (!itemEl) { skipped++; return; }
      // robust-enough anchor: the saved snippet must still sit at [start,end];
      // if the item text changed, skip (kept in store, just not painted).
      var flat = flatText(itemEl);
      if (flat.slice(hl.start, hl.end) !== hl.snippet) { hl._stale = true; skipped++; return; }
      hl._stale = false;
      wrapRange(itemEl, hl.start, hl.end, hl);
    });
    if (skipped) { /* limitation surfaced in the panel per-note */ }
  }

  /* ---- notes panel ------------------------------------------------------- */
  function ensurePanel() {
    if (panel && panel.parentNode) { return; }
    panel = elt("aside", "rh-panel");
    panel.setAttribute("aria-label", "Report highlights & notes");
    panel.hidden = true;
    var head = elt("div", "rh-panel-head");
    head.appendChild(elt("span", "rh-panel-title", "Highlights & notes"));
    var closeB = elt("button", "rh-panel-x", "×");
    closeB.type = "button"; closeB.setAttribute("aria-label", "Hide notes panel");
    closeB.addEventListener("click", function () { panel.hidden = true; if (toggleBtn) { toggleBtn.setAttribute("aria-expanded", "false"); } });
    head.appendChild(closeB);
    panel.appendChild(head);
    var body = elt("div", "rh-panel-body");
    panel.appendChild(body);
    document.body.appendChild(panel);
  }

  var toggleBtn = null;
  function ensureToggle() {
    // a small launcher pinned to the report view so the panel is reachable
    if (toggleBtn && toggleBtn.parentNode) { return; }
    toggleBtn = elt("button", "rh-toggle");
    toggleBtn.type = "button";
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.setAttribute("data-tip", "Show highlights & notes for this report");
    var ico = elt("span", "rh-toggle-ico", "✎");
    toggleBtn.appendChild(ico);
    toggleBtn.appendChild(elt("span", "rh-toggle-label", "Notes"));
    var count = elt("span", "rh-toggle-count"); count.hidden = true; toggleBtn.appendChild(count);
    toggleBtn.addEventListener("click", function () {
      ensurePanel();
      panel.hidden = !panel.hidden;
      toggleBtn.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
      if (!panel.hidden) { renderPanel(); }
    });
    document.body.appendChild(toggleBtn);
  }
  function reflectToggle() {
    if (!toggleBtn) { return; }
    var n = listFor(currentUrn).length;
    var count = toggleBtn.querySelector(".rh-toggle-count");
    if (count) { count.textContent = String(n); count.hidden = !n; }
  }

  function renderPanel() {
    reflectToggle();
    if (!panel || panel.hidden) { return; }
    var body = panel.querySelector(".rh-panel-body");
    while (body.firstChild) { body.removeChild(body.firstChild); }
    var arr = listFor(currentUrn);
    if (!arr.length) {
      var empty = elt("div", "rh-empty");
      empty.appendChild(elt("p", "rh-empty-h", "No highlights yet"));
      empty.appendChild(elt("p", "rh-empty-p", "Select text in the report, pick a colour and Save note."));
      body.appendChild(empty);
      return;
    }
    arr.forEach(function (hl) {
      var card = elt("div", "rh-note");
      card.setAttribute("data-hl-id", hl.id);
      var top = elt("div", "rh-note-top");
      var dot = elt("span", "rh-note-dot"); dot.style.background = colourOf(hl.colour).hex; top.appendChild(dot);
      var snip = elt("button", "rh-note-snip", hl.snippet);   // textContent — XSS-safe
      snip.type = "button";
      snip.setAttribute("aria-label", "Scroll to highlight: " + hl.snippet);
      snip.addEventListener("click", function () { scrollToHl(hl.id); });
      top.appendChild(snip);
      if (hl._stale) {
        var stale = elt("span", "rh-note-stale", "text changed");
        stale.setAttribute("data-tip", "The report text moved since this note was saved, so it is no longer painted.");
        top.appendChild(stale);
      }
      var rm = elt("button", "rh-note-rm", "×");
      rm.type = "button"; rm.setAttribute("aria-label", "Remove this highlight");
      rm.setAttribute("data-tip", "Remove this highlight");
      rm.addEventListener("click", function () { removeHl(hl.id); });
      top.appendChild(rm);
      card.appendChild(top);

      // annotation textarea (free text the analyst adds)
      var ta = elt("textarea", "rh-note-ta");
      ta.value = hl.note || "";                                 // value, not innerHTML
      ta.setAttribute("placeholder", "Add an annotation…");
      ta.setAttribute("aria-label", "Annotation for: " + hl.snippet);
      ta.addEventListener("change", function () { setNote(hl.id, ta.value); });
      ta.addEventListener("blur", function () { setNote(hl.id, ta.value); });
      card.appendChild(ta);
      body.appendChild(card);
    });
  }

  function scrollToHl(id) {
    var span = container.querySelector('.rh-hl[data-hl-id="' + cssAttr(id) + '"]');
    if (!span) { return; }
    try { span.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" }); } catch (e) { span.scrollIntoView(); }
    span.classList.remove("rh-flash"); void span.offsetWidth; span.classList.add("rh-flash");
    setTimeout(function () { span.classList.remove("rh-flash"); }, 1400);
  }
  function setNote(id, text) {
    var arr = listFor(currentUrn);
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { arr[i].note = String(text || ""); break; } }
    writeFor(currentUrn, arr);
  }
  function removeHl(id) {
    // unwrap the painted span (restore the raw text nodes)
    var span = container.querySelector('.rh-hl[data-hl-id="' + cssAttr(id) + '"]');
    if (span && span.parentNode) {
      var p = span.parentNode;
      while (span.firstChild) { p.insertBefore(span.firstChild, span); }
      p.removeChild(span);
      p.normalize();
    }
    var arr = listFor(currentUrn).filter(function (h) { return h.id !== id; });
    writeFor(currentUrn, arr);
    sound("toggle");
    renderPanel();
  }

  /* ---- ESC dismiss ---- */
  function bindEsc() {
    if (escBound) { return; }
    escBound = true;
    document.addEventListener("keydown", onEsc, true);
  }
  function onEsc(e) {
    if (e.key !== "Escape") { return; }
    if (palette) { palette.remove(); palette = null; return; }
    if (toolbar) { hideToolbar(); return; }
    if (panel && !panel.hidden) { panel.hidden = true; if (toggleBtn) { toggleBtn.setAttribute("aria-expanded", "false"); } }
  }

  /* dismiss the toolbar/palette on outside pointer or scroll */
  function onDocPointer(e) {
    if (toolbar && !toolbar.contains(e.target) && !(palette && palette.contains(e.target))) {
      // a fresh selection re-opens it via selectionchange; a click elsewhere hides it
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hideToolbar(); }
    }
  }

  /* ---- public attach ----------------------------------------------------- */
  var wired = false;
  function attach(rootEl, urn) {
    container = rootEl;
    currentUrn = urn;
    if (!wired) {
      wired = true;
      // debounce selectionchange so the toolbar appears once the drag settles
      var t = null;
      document.addEventListener("selectionchange", function () {
        if (!container) { return; }
        if (t) { clearTimeout(t); }
        t = setTimeout(function () {
          var sel = window.getSelection();
          if (!sel || sel.isCollapsed) { if (!palette) { hideToolbar(); } return; }
          onSelection();
        }, 180);
      });
      document.addEventListener("mousedown", onDocPointer, true);
      window.addEventListener("scroll", function () { hideToolbar(); }, true);
      window.addEventListener("reg-highlights", function () { reflectToggle(); });
    }
    ensureToggle();
    reflectToggle();
    restore();
    if (panel && !panel.hidden) { renderPanel(); }
  }

  window.RegistryHighlighter = {
    attach: attach,
    list: function (urn) { return listFor(urn); },
    COLOURS: COLOURS
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = window.RegistryHighlighter; }
})();
