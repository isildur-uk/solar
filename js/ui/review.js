/* CHART ROOM — review.js
 * The trust-critical extraction review screen (split pane: highlighted source
 * text ↔ entity/relationship cards). Nothing reaches the chart without
 * explicit analyst approval; matches are suggested, never auto-merged.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var M = window.CRMatch;
  var store = null;
  var result = null;     // CRExtract output
  var sourceText = "";
  var sourceName = "";   // originating document name(s) — feeds the legend Sources facet
  var cardState = {};    // ref -> {include, decision:'new'|matchEntityId, label, type}
  var relState = {};     // ref -> {include, type, direction}

  function init(caseStore) { store = caseStore; }

  /* ---------------- open / render ---------------- */

  function open(text, name) {
    sourceText = text;
    sourceName = name || "";
    result = window.CRExtract.extract(text, { dateFormat: store.meta.dateFormat });
    cardState = {};
    relState = {};

    function initEntityCard(ent) {
      var suggestions = M.matchEntity(
        { type: ent.type, label: ent.label, ids: idsFor(ent), attrs: ent.attrs || {} },
        store.entities);
      ent._suggestions = suggestions.slice(0, 3);
      var best = suggestions[0];
      cardState[ent.ref] = {
        // bare dates live on the timeline; as chart nodes they just dangle
        include: ent.type === "date" ? false : ent.confidence !== "low",
        decision: best && (best.tier === "exact" || best.tier === "strong") ? best.entity.id : "new",
        label: ent.label,
        type: ent.type
      };
    }
    result.entities.forEach(initEntityCard);
    result.relationships.forEach(function (r) {
      relState[r.ref] = {
        include: r.confidence !== "low" && !r.negated,  // denied acts need opt-in
        type: r.type,
        direction: r.direction || "->"
      };
    });

    renderSource();
    renderCards();
    U.openModal("review-veil");

    // Optional smart-mode augmentation: union-merge a transformer NER's hits
    // (additive, advisory). No-op unless a model runtime is vendored AND enabled;
    // rule results are already shown, smart hits pop in when inference resolves.
    if (window.CRSmartNER && window.CRSmartNER.available() && window.CRSmartNER.enabled) {
      window.CRSmartNER.extract(text, { dateFormat: store.meta.dateFormat }).then(function (spans) {
        var merged = window.CRSmartNER.mergeInto(result, spans);
        if (!merged.added.length) return;
        merged.added.forEach(initEntityCard);
        result = { entities: merged.entities, relationships: result.relationships, events: result.events, ambiguities: result.ambiguities, cues: result.cues, primary: result.primary, grading: result.grading };
        renderSource();
        renderCards();
      });
    }
  }

  function idsFor(ent) {
    if (ent.type === "phone") return { e164: ent.value };
    if (ent.type === "email") return { email: ent.attrs.canonical || ent.value };
    if (ent.type === "location" && ent.attrs.gaz) return { gaz: ent.attrs.gaz };
    return {};
  }

  function renderSource() {
    var box = U.el("review-src");
    // build list of (start,end,ref,type), non-overlapping, sorted
    var marks = [];
    result.entities.forEach(function (ent) {
      ent.spans.forEach(function (sp) {
        marks.push({ s: sp[0], e: sp[1], ref: ent.ref, type: ent.type });
      });
    });
    // relationship trigger phrases ("used", "book flights to", "staying at"…)
    result.relationships.forEach(function (r) {
      if (r.cueSpan) marks.push({ s: r.cueSpan[0], e: r.cueSpan[1], ref: r.ref, type: "cue" });
    });
    (result.cues || []).forEach(function (cu) {
      marks.push({ s: cu.span[0], e: cu.span[1], ref: "", type: "cue" });
    });
    marks.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var html = "", pos = 0;
    marks.forEach(function (mk) {
      if (mk.s < pos) return; // skip overlap
      html += U.esc(sourceText.slice(pos, mk.s));
      html += '<mark class="hl hl-' + U.escAttr(mk.type) + '" data-ref="' + U.escAttr(mk.ref) + '" ' +
        'tabindex="0" role="button" aria-label="extracted ' + U.escAttr(mk.type) + '">' +
        U.esc(sourceText.slice(mk.s, mk.e)) + "</mark>";
      pos = mk.e;
    });
    html += U.esc(sourceText.slice(pos));
    box.innerHTML = html;
    box.querySelectorAll("mark.hl").forEach(function (n) {
      function go() {
        var rf = n.getAttribute("data-ref");
        if (rf) focusCard(rf);
      }
      n.addEventListener("click", go);
      n.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    });
  }

  function badge(conf) {
    return '<span class="badge ' + U.escAttr(conf) + '">' + U.escAttr(conf).toUpperCase() + "</span>";
  }

  function renderCards() {
    var box = U.el("review-cards");
    var html = "";

    // ambiguity strip
    if (result.ambiguities.length) {
      html += '<div class="ambig-strip" role="alert">' +
        result.ambiguities.map(function (a) { return "⚠ " + U.esc(a.message); }).join("<br>") +
        "</div>";
    }

    // bulk toolbar
    html += '<div class="rv-toolbar" role="toolbar" aria-label="Bulk actions">' +
      '<button class="btn" id="rv-acc-high">Accept all HIGH</button>' +
      '<button class="btn" id="rv-acc-med">+ MED</button>' +
      '<button class="btn" id="rv-rej-low">Reject all LOW</button>' +
      '<button class="btn" id="rv-rels-on">Include all links</button>' +
      "</div>";

    // entity cards
    result.entities.forEach(function (ent) {
      var st = cardState[ent.ref];
      var T = window.CRModel.ENTITY_TYPES[ent.type] || { label: ent.type };
      html += '<div class="card' + (st.include ? "" : " off") + '" id="card-' + U.escAttr(ent.ref) + '">' +
        '<div class="head">' +
        '<input type="checkbox" data-ref="' + U.escAttr(ent.ref) + '" class="rv-inc" ' +
        (st.include ? "checked" : "") + ' aria-label="include ' + U.escAttr(ent.label) + '">' +
        '<span class="ent-type t-' + U.escAttr(ent.type) + '">' + U.esc(T.label) + "</span>" +
        badge(ent.confidence) +
        "</div>" +
        '<input type="text" class="lbl rv-lbl" data-ref="' + U.escAttr(ent.ref) + '" value="' + U.escAttr(st.label) + '" aria-label="entity label">';

      var metaBits = [];
      if (ent.type === "date") metaBits.push("carried by the timeline — chart node optional");
      if (ent.attrs.dob) metaBits.push("DOB " + U.fmtDate(ent.attrs.dob));
      if (ent.attrs.raw && ent.attrs.raw !== ent.label) metaBits.push("as written: " + ent.attrs.raw);
      if (ent.attrs.iata) metaBits.push("IATA " + ent.attrs.iata);
      if (ent.attrs.postcode) metaBits.push("postcode " + ent.attrs.postcode);
      if (ent.attrs.locality) metaBits.push("in " + ent.attrs.locality);
      if (typeof ent.attrs.lat === "number") metaBits.push(ent.attrs.lat.toFixed(3) + ", " + ent.attrs.lon.toFixed(3));
      if (metaBits.length) html += '<div class="meta">' + U.esc(metaBits.join(" · ")) + "</div>";
      if (ent.flags && ent.flags.length) html += '<div class="flagline">⚠ ' + U.esc(ent.flags.join("; ")) + "</div>";

      // match-vs-new
      if (ent._suggestions.length) {
        html += '<div class="matchbox" role="radiogroup" aria-label="match decision">';
        ent._suggestions.forEach(function (sg) {
          html += '<label><input type="radio" name="m-' + U.escAttr(ent.ref) + '" value="' + U.escAttr(sg.entity.id) + '" ' +
            (st.decision === sg.entity.id ? "checked" : "") + ">" +
            "Match existing: <b>" + U.esc(sg.entity.label) + "</b> " +
            '<span class="why">(' + U.esc(sg.tier) + " — " + U.esc(sg.reasons.join(", ")) + ")</span></label>";
        });
        html += '<label><input type="radio" name="m-' + U.escAttr(ent.ref) + '" value="new" ' +
          (st.decision === "new" ? "checked" : "") + ">Add as new entity</label></div>";
      }
      html += "</div>";
    });

    // relationship cards
    if (result.relationships.length) {
      html += '<div class="sec" style="font:600 10px Consolas,monospace;letter-spacing:.14em;color:#5a6878;text-transform:uppercase;margin:12px 0 6px;border-bottom:1px solid #1f2a38;padding-bottom:3px">Inferred relationships — opt in</div>';
    }
    function isContainment(r) { return r.type === "LOCATED_IN" && /^(?:country|address parent)$/.test(r.sentence || ""); }
    var geoRels = result.relationships.filter(isContainment);
    result.relationships.filter(function (r) { return !isContainment(r); }).forEach(function (r) {
      var st = relState[r.ref];
      var src = entByRef(r.sourceRef), tgt = entByRef(r.targetRef);
      if (!src || !tgt) return;
      html += '<div class="card relcard' + (st.include ? "" : " off") + '" id="card-' + U.escAttr(r.ref) + '">' +
        '<div class="head">' +
        '<input type="checkbox" data-ref="' + U.escAttr(r.ref) + '" class="rv-rel-inc" ' +
        (st.include ? "checked" : "") + ' aria-label="include relationship">' +
        '<span class="ent-type t-event">LINK</span>' +
        badge(r.confidence) +
        (r.modality === "planned" ? '<span class="badge med" style="margin-left:6px">PLANNED</span>' : "") +
        (r.negated ? '<span class="badge low" style="margin-left:6px">DENIED</span>' : "") +
        (r.amount ? '<span class="badge high" style="margin-left:6px">' + U.esc(r.amount) + "</span>" : "") +
        "</div>" +
        '<div class="spo">' +
        "<b>" + U.esc(st.direction === "<-" ? tgt.label : src.label) + "</b>" +
        '<span class="arr" data-ref="' + U.escAttr(r.ref) + '" title="swap direction" role="button" tabindex="0" aria-label="swap direction">⇄</span>' +
        '<select class="rv-rel-type" data-ref="' + U.escAttr(r.ref) + '" aria-label="relationship type">' +
        window.CRModel.LINK_TYPES.map(function (t) {
          return '<option value="' + U.escAttr(t) + '"' + (t === st.type ? " selected" : "") + ">" + U.esc(t.replace(/_/g, " ")) + "</option>";
        }).join("") +
        "</select>" +
        "<b>" + U.esc(st.direction === "<-" ? src.label : tgt.label) + "</b>" +
        (r.dateISO ? ' <span class="why">' + U.esc(U.fmtDate(r.dateISO)) + "</span>" : "") +
        "</div>" +
        '<div class="sentence">“' + U.esc(r.sentence) + '”</div>' +
        "</div>";
    });

    // Geographic containment (city -> country, address -> locality) is structural
    // and high-volume — collapse it into one compact, auto-included group so it
    // does not bury the investigative relationships.
    if (geoRels.length) {
      html += '<details class="geo-group"><summary>Geographic containment — ' + geoRels.length +
        ' link' + (geoRels.length === 1 ? "" : "s") + ' (auto-included)</summary>';
      geoRels.forEach(function (r) {
        var st = relState[r.ref];
        var src = entByRef(r.sourceRef), tgt = entByRef(r.targetRef);
        if (!src || !tgt) return;
        html += '<label class="geo-row"><input type="checkbox" data-ref="' + U.escAttr(r.ref) + '" class="rv-rel-inc" ' +
          (st.include ? "checked" : "") + '> ' + U.esc(src.label) + ' <span class="geo-rel">located in</span> ' +
          U.esc(tgt.label) + '</label>';
      });
      html += '</details>';
    }

    box.innerHTML = html;
    wireCards(box);
    updateSummary();
  }

  function entByRef(ref) {
    return result.entities.find(function (e) { return e.ref === ref; }) || null;
  }

  function wireCards(box) {
    box.querySelectorAll(".rv-inc").forEach(function (n) {
      n.addEventListener("change", function () {
        cardState[n.getAttribute("data-ref")].include = n.checked;
        n.closest(".card").classList.toggle("off", !n.checked);
        updateSummary();
      });
    });
    box.querySelectorAll(".rv-lbl").forEach(function (n) {
      n.addEventListener("input", function () {
        cardState[n.getAttribute("data-ref")].label = n.value;
      });
      n.addEventListener("focus", function () {
        highlightSpans(n.getAttribute("data-ref"));
      });
    });
    box.querySelectorAll(".matchbox input[type=radio]").forEach(function (n) {
      n.addEventListener("change", function () {
        var ref = n.name.slice(2);
        cardState[ref].decision = n.value;
        updateSummary();
      });
    });
    box.querySelectorAll(".rv-rel-inc").forEach(function (n) {
      n.addEventListener("change", function () {
        relState[n.getAttribute("data-ref")].include = n.checked;
        n.closest(".card").classList.toggle("off", !n.checked);
        updateSummary();
      });
    });
    box.querySelectorAll(".rv-rel-type").forEach(function (n) {
      n.addEventListener("change", function () {
        relState[n.getAttribute("data-ref")].type = n.value;
      });
    });
    box.querySelectorAll(".relcard .arr").forEach(function (n) {
      function swap() {
        var st = relState[n.getAttribute("data-ref")];
        st.direction = st.direction === "->" ? "<-" : "->";
        renderCards();
      }
      n.addEventListener("click", swap);
      n.addEventListener("keydown", function (e) { if (e.key === "Enter") swap(); });
    });
    // bulk
    U.el("rv-acc-high").addEventListener("click", function () { bulk("high", true); });
    U.el("rv-acc-med").addEventListener("click", function () { bulk("med", true); });
    U.el("rv-rej-low").addEventListener("click", function () { bulk("low", false); });
    U.el("rv-rels-on").addEventListener("click", function () {
      Object.keys(relState).forEach(function (k) { relState[k].include = true; });
      renderCards();
    });
  }

  function bulk(conf, include) {
    result.entities.forEach(function (e) {
      if (e.confidence === conf) cardState[e.ref].include = include;
    });
    result.relationships.forEach(function (r) {
      if (r.confidence === conf) relState[r.ref].include = include;
    });
    renderCards();
  }

  function focusCard(ref) {
    var card = U.el("card-" + ref);
    if (!card) return;
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    document.querySelectorAll(".card.active").forEach(function (c) { c.classList.remove("active"); });
    card.classList.add("active");
    highlightSpans(ref);
  }

  function highlightSpans(ref) {
    document.querySelectorAll("#review-src mark.hl").forEach(function (mk) {
      var is = mk.getAttribute("data-ref") === ref;
      mk.classList.toggle("active", is);
      mk.classList.toggle("dimmed", !is);
      if (is) mk.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function updateSummary() {
    var nNew = 0, nMatch = 0, nRel = 0;
    var included = {}, linked = {};
    result.entities.forEach(function (e) {
      var st = cardState[e.ref];
      if (!st.include) return;
      included[e.ref] = st.decision;
      if (st.decision === "new") nNew++; else nMatch++;
    });
    result.relationships.forEach(function (r) {
      if (!relState[r.ref].include) return;
      if (!included[r.sourceRef] || !included[r.targetRef]) return;
      nRel++;
      linked[r.sourceRef] = linked[r.targetRef] = 1;
    });
    var orphans = 0;
    Object.keys(included).forEach(function (rf) {
      // matched entities join the existing chart; only NEW unlinked ones dangle
      if (included[rf] === "new" && !linked[rf]) orphans++;
    });
    var evs = result.events.length;
    var orphanGuard = U.el("rv-link-orphans");
    var tail = orphans === 0 ? " · all connected"
      : (orphanGuard && orphanGuard.checked
          ? " · " + orphans + " auto-linked to subject"
          : " · ⚠ " + orphans + " unconnected");
    U.el("review-summary").textContent =
      nNew + " new entities · " + nMatch + " matched · " + nRel + " links · " + evs + " timeline events" + tail;
  }

  /* ---------------- commit ---------------- */

  function commit() {
    store.snapshot();
    var refToId = {};
    var batch = "Text extract " + new Date().toISOString().slice(0, 16).replace("T", " ") +
      (sourceName ? " — " + sourceName : "");

    // entities
    result.entities.forEach(function (ent) {
      var st = cardState[ent.ref];
      if (!st.include) return;
      if (st.decision !== "new") {
        var existing = store.getEntity(st.decision);
        if (existing) {
          // enrich, never overwrite
          Object.keys(ent.attrs).forEach(function (k) {
            if (existing.attrs[k] === undefined) existing.attrs[k] = ent.attrs[k];
          });
          if (st.label !== existing.label && existing.attrs.aka === undefined) existing.attrs.aka = st.label;
          existing.audit.push({ ts: new Date().toISOString(), action: "enriched", detail: batch });
          refToId[ent.ref] = existing.id;
          return;
        }
      }
      var geo = null;
      if (typeof ent.attrs.lat === "number") geo = { lat: ent.attrs.lat, lon: ent.attrs.lon };
      var e = store.addEntity({
        type: st.type, label: st.label, attrs: ent.attrs, geo: geo,
        sourceText: contextSnippet(ent),
        // 3×5×2 lifted from the document itself when present ([2 A P] header)
        provenance: (result.grading
          ? { source: result.grading.source, assessment: result.grading.assessment,
              handling: result.grading.handling, sourceRef: batch, gradedBy: "document grading" }
          : { source: "B", intel: 2, handling: "P", sourceRef: batch, gradedBy: "" }),
        origin: batch
      });
      refToId[ent.ref] = e.id;
    });

    // links
    result.relationships.forEach(function (r) {
      var st = relState[r.ref];
      if (!st.include) return;
      var a = refToId[r.sourceRef], b = refToId[r.targetRef];
      if (!a || !b) return;
      var from = st.direction === "<-" ? b : a;
      var to = st.direction === "<-" ? a : b;
      store.addLink({
        from: from, to: to, type: st.type, direction: "->",
        confidence: r.confidence, dateISO: r.dateISO,
        modality: r.modality || null, negated: !!r.negated, amount: r.amount || null,
        sentence: r.sentence, origin: batch
      });
    });

    // events
    result.events.forEach(function (ev) {
      var ids = (ev.entityRefs || []).map(function (rf) { return refToId[rf]; }).filter(Boolean);
      if (!ids.length) return;
      store.addEvent({ dateISO: ev.dateISO, label: ev.label, entityIds: ids, origin: batch });
    });

    // Orphan guard: nothing committed from one passage should float free.
    // Anything still unconnected ties to the primary subject as an honest
    // low-confidence (dashed) LINKED_TO the analyst can retype or delete.
    var guard = U.el("rv-link-orphans");
    if (guard && guard.checked) {
      var primaryId = null;
      // The extractor names the document's true subject — hub on that,
      // not on whichever person happened to be extracted first.
      if (result.primary && refToId[result.primary]) primaryId = refToId[result.primary];
      for (var pi = 0; !primaryId && pi < result.entities.length; pi++) {
        var pe = result.entities[pi];
        if (pe.type === "person" && cardState[pe.ref] && cardState[pe.ref].include && refToId[pe.ref]) {
          primaryId = refToId[pe.ref];
          break;
        }
      }
      if (primaryId) {
        Object.keys(refToId).forEach(function (rf) {
          var id = refToId[rf];
          if (!id || id === primaryId) return;
          var connected = store.links.some(function (l) { return l.from === id || l.to === id; });
          if (!connected) {
            store.addLink({
              from: primaryId, to: id, type: "LINKED_TO", confidence: "low",
              origin: batch + " (orphan guard)",
              sentence: "Auto-linked: extracted from the same passage as the subject"
            });
          }
        });
      }
    }

    U.closeModal("review-veil");
    if (window.CRApp) window.CRApp.afterImport();
  }

  function contextSnippet(ent) {
    var sp = ent.spans[0];
    var s = Math.max(0, sp[0] - 60), e = Math.min(sourceText.length, sp[1] + 60);
    return (s > 0 ? "…" : "") + sourceText.slice(s, e) + (e < sourceText.length ? "…" : "");
  }

  function getResult() {
    return { result: result, cardState: cardState, relState: relState, sourceName: sourceName };
  }

  window.CRReview = { init: init, open: open, commit: commit, getResult: getResult };
})();
