/* preview.js — report hover-preview LIGHTBOX (Ben B2).
 *
 * "Add a 'preview' when in database AND you hover over a report for a second or
 * two, and it uses Lightbox effect."
 *
 * Dwell-hover a report row (~1.2s) -> a modal <dialog> lightbox opens centre-
 * stage over a dark ::backdrop scrim, with a reversible fade/scale. It shows a
 * PREVIEW of the report (title · URN · operation · date · grade/marking · a
 * short summary of the first item or two) — not the whole thing — plus a close
 * (x), and an "Open full report ->" action. Esc + backdrop-click dismiss.
 * Clicking a row still navigates to the full report (we never hijack the click).
 *
 * Native <dialog>.showModal() gives us the focus trap, Esc-to-close and focus
 * restore for free; we add the dwell timer, the scrim/scale transition, and the
 * backdrop-click + "open full" wiring.
 *
 * DECOUPLED: the registry (app.js) owns the report store, so it passes a data
 * provider. attach(container, provider, openFull):
 *   provider(urn)  -> Promise<{ title, urn, operation, date, marking, grade,
 *                               summary:[strings] }>  (all plain strings)
 *   openFull(urn)  -> navigate to the full report (the row's normal action)
 * Rows are any element with [data-urn] inside `container`.
 *
 * SAFETY: every field is written via textContent (never innerHTML with data);
 * the report bodies are demo data but treated as untrusted. Reduced-motion:
 * no scale (opacity-only) AND a longer dwell so it never auto-pops mid-read.
 * Both themes. Suite-safe (no top-level DOM at load).
 */
"use strict";
(function () {
  var DWELL_MS = 1200;
  var DWELL_MS_RM = 2000;   // longer dwell under reduced-motion (less surprising)

  var dlg = null, providerFn = null, openFullFn = null;
  var dwellTimer = null, armedRow = null, currentUrn = null, wired = false;

  function reduced() { try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }
  function elt(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text != null) { n.textContent = String(text); } return n; }
  function sound(cue) { try { if (window.SolarSound) { window.SolarSound.play(cue); } } catch (e) { /* noop */ } }

  /* ---- the dialog (built once, reused) ---- */
  function ensureDialog() {
    if (dlg) { return dlg; }
    dlg = document.createElement("dialog");
    dlg.className = "rp-lightbox";
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-label", "Report preview");

    var card = elt("div", "rp-card");

    var head = elt("div", "rp-head");
    head.appendChild(elt("span", "rp-kicker", "PREVIEW"));
    var closeB = elt("button", "rp-x", "×");
    closeB.type = "button"; closeB.setAttribute("aria-label", "Close preview");
    closeB.addEventListener("click", function () { close(); });
    head.appendChild(closeB);
    card.appendChild(head);

    card.appendChild(elt("h2", "rp-title"));           // title (textContent set on open)
    var meta = elt("div", "rp-meta");
    meta.appendChild(elt("span", "rp-urn"));
    meta.appendChild(elt("span", "rp-op"));
    meta.appendChild(elt("span", "rp-date"));
    card.appendChild(meta);

    var badges = elt("div", "rp-badges");
    badges.appendChild(elt("span", "rp-grade"));
    badges.appendChild(elt("span", "rp-mark"));
    card.appendChild(badges);

    card.appendChild(elt("div", "rp-summary"));         // short body summary (filled on open)

    var foot = elt("div", "rp-foot");
    var openB = elt("button", "rp-open", "Open full report →");
    openB.type = "button";
    openB.addEventListener("click", function () {
      var urn = currentUrn;
      close();
      if (openFullFn && urn) { openFullFn(urn); }
    });
    foot.appendChild(openB);
    card.appendChild(foot);

    dlg.appendChild(card);
    document.body.appendChild(dlg);

    // backdrop-click dismiss: a click that lands on the <dialog> itself (the
    // ::backdrop area, outside the card) closes it.
    dlg.addEventListener("click", function (e) { if (e.target === dlg) { close(); } });
    // native cancel (Esc) — add our fade-out instead of an instant close
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); close(); });
    return dlg;
  }

  /* ---- open / close with reversible transition ---- */
  function fillCard(data) {
    dlg.querySelector(".rp-title").textContent = data.title || "(untitled)";
    dlg.querySelector(".rp-urn").textContent = data.urn || "";
    var opEl = dlg.querySelector(".rp-op");
    opEl.textContent = data.operation || "";
    opEl.style.display = data.operation ? "" : "none";
    dlg.querySelector(".rp-date").textContent = data.date || "";
    var gr = dlg.querySelector(".rp-grade");
    gr.textContent = data.grade || "";
    gr.style.display = data.grade ? "" : "none";
    var mk = dlg.querySelector(".rp-mark");
    mk.textContent = data.marking || "";
    mk.style.display = data.marking ? "" : "none";
    // summary — a couple of short paragraphs (textContent per line, XSS-safe)
    var sum = dlg.querySelector(".rp-summary");
    while (sum.firstChild) { sum.removeChild(sum.firstChild); }
    (data.summary || []).slice(0, 2).forEach(function (line) {
      sum.appendChild(elt("p", "rp-sum-line", line));
    });
    if (!(data.summary || []).length) { sum.appendChild(elt("p", "rp-sum-empty", "No summary available.")); }
  }

  function openFor(urn) {
    if (!providerFn) { return; }
    ensureDialog();
    currentUrn = urn;
    Promise.resolve(providerFn(urn)).then(function (data) {
      if (!data || currentUrn !== urn) { return; }   // row changed while loading
      fillCard(data);
      if (dlg.open) { return; }
      dlg.classList.toggle("rp-reduced", reduced());
      try { dlg.showModal(); } catch (e) { return; }
      // trigger the enter transition on the next frame
      requestAnimationFrame(function () { dlg.classList.add("is-open"); });
      sound("open");
      // focus the close button so keyboard users land in the dialog
      var x = dlg.querySelector(".rp-x"); if (x) { try { x.focus(); } catch (e) {} }
    }).catch(function () { /* provider failure never breaks the list */ });
  }

  function close() {
    if (!dlg || !dlg.open) { return; }
    currentUrn = null;
    dlg.classList.remove("is-open");
    var done = function () { try { dlg.close(); } catch (e) {} };
    if (reduced()) { done(); }
    else {
      var t = setTimeout(done, 200);
      dlg.addEventListener("transitionend", function te() { clearTimeout(t); dlg.removeEventListener("transitionend", te); done(); }, { once: true });
    }
  }

  /* ---- dwell handling ---- */
  // report-list rows only: the sidebar cards and the operation results table.
  // Scoping to these avoids arming on other [data-urn] elements (compare panes,
  // entity cards, dossier appearance rows).
  var ROW_SEL = ".report-item[data-urn], .op-table tr[data-urn]";
  function rowFrom(target) {
    if (!target || !target.closest) { return null; }
    return target.closest(ROW_SEL);
  }
  function cancelDwell() { if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null; } armedRow = null; }
  function onOver(e) {
    var row = rowFrom(e.target);
    if (!row || row === armedRow) { return; }
    // don't re-arm while the lightbox is already open for this row
    cancelDwell();
    armedRow = row;
    var urn = row.getAttribute("data-urn");
    var wait = reduced() ? DWELL_MS_RM : DWELL_MS;
    dwellTimer = setTimeout(function () {
      dwellTimer = null;
      // still hovering the same row?
      if (armedRow === row && row.matches(":hover")) { openFor(urn); }
    }, wait);
  }
  function onOut(e) {
    var row = rowFrom(e.target);
    if (!row) { return; }
    // moving to a child of the same row is not a leave
    if (e.relatedTarget && row.contains(e.relatedTarget)) { return; }
    if (row === armedRow) { cancelDwell(); }
  }

  /* ---- public attach (idempotent; wires the delegated dwell once) ---- */
  function attach(provider, openFull) {
    providerFn = provider;
    openFullFn = openFull;
    if (wired) { return; }
    wired = true;
    // delegated over the whole document; rowFrom() scopes to report-list rows.
    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    // dismiss on scroll (any scroll — the row moved out from under the pointer)
    window.addEventListener("scroll", function () { cancelDwell(); if (dlg && dlg.open) { close(); } }, true);
  }

  window.RegistryPreview = { attach: attach, open: openFor, close: close, DWELL_MS: DWELL_MS };
  if (typeof module !== "undefined" && module.exports) { module.exports = window.RegistryPreview; }
})();
