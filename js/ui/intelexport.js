/* SOLAR — intelexport.js
 * Operational exports, ATLAS-formatted via CRFormat:
 *  - Intelligence Logging Tool v1: Subjects CSV + Log CSV (paste-ready)
 *  - Intel Log 2: Enquiry Log CSV
 *  - Intelligence Report draft (.txt) per the APP structure, grades inline
 *  - i2 Analyst's Notebook import pack: entities.csv + links.csv + README
 */
(function () {
  "use strict";

  var U = window.CRUtil, F = window.CRFormat;
  var store = null;

  function init(caseStore) {
    store = caseStore;
    wire();
  }

  /* ---------------- helpers ---------------- */

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function csv(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }
  function officer() { return store.meta.officer || ""; }

  function subjectFor(entityId) {
    // the person this entity relates to (first linked person), else itself
    var lnk = store.links.find(function (l) {
      if (l.from !== entityId && l.to !== entityId) return false;
      var other = store.getEntity(l.from === entityId ? l.to : l.from);
      return other && other.type === "person";
    });
    if (lnk) {
      var p = store.getEntity(lnk.from === entityId ? lnk.to : lnk.from);
      return p ? F.personFreeText(p.label, p.attrs.dob) : "";
    }
    var self = store.getEntity(entityId);
    return self && self.type === "person" ? F.personFreeText(self.label, self.attrs.dob) : "";
  }

  function firstLinked(personId, type, fmt) {
    var hit = null;
    store.links.some(function (l) {
      var otherId = l.from === personId ? l.to : (l.to === personId ? l.from : null);
      if (!otherId) return false;
      var e = store.getEntity(otherId);
      if (e && e.type === type) { hit = e; return true; }
      return false;
    });
    return hit ? fmt(hit) : "";
  }

  /* ---------------- Logging Tool v1 ---------------- */

  function exportLoggingToolV1() {
    // Subjects sheet
    var subjRows = [["Subject ID", "Type", "Display Name (used in Log dropdown)", "Full Name",
      "DOB", "Address", "Mobile / Phone", "VRM", "NI Number", "PNCID", "Aliases", "Notes"]];
    var sid = 0;
    store.entities.forEach(function (e) {
      var a = e.attrs || {};
      if (e.type === "person") {
        sid++;
        subjRows.push(["S" + sid, "Person", e.label, F.personFreeText(e.label),
          a.dob ? F.ddmmyyyy(a.dob) : "",
          firstLinked(e.id, "address", function (x) { return x.label; }),
          firstLinked(e.id, "phone", function (x) { return F.phoneCM((x.ids && x.ids.e164) || x.label); }),
          firstLinked(e.id, "vehicle", function (x) { return F.vrm(x.label); }),
          a.nino || "", a.pnc || "", a.aka || "",
          "Solar export " + F.todayDDMMYYYY()]);
      } else if (e.type === "organisation") {
        sid++;
        subjRows.push(["S" + sid, "Company", F.organisationCaps(e.label),
          F.organisationCaps(e.label) + (a.companyNumber ? " (Co. No. " + a.companyNumber + ")" : ""),
          "", firstLinked(e.id, "address", function (x) { return x.label; }),
          firstLinked(e.id, "phone", function (x) { return F.phoneCM((x.ids && x.ids.e164) || x.label); }),
          "", "", "", a.aka || "", "Solar export"]);
      } else if (e.type === "vehicle") {
        sid++;
        subjRows.push(["S" + sid, "Vehicle",
          "VRM " + F.vrm(e.label) + (a.make ? " (" + [a.colour, a.make].filter(Boolean).join(" ") + ")" : ""),
          "", "", "", "", F.vrm(e.label), "", "", "", "Solar export"]);
      }
    });

    // Log sheet — one Check row per non-person identifier entity
    var logRows = [["Entry #", "Date", "Officer", "System", "Action", "Identifier", "Subject",
      "Source", "Nexus", "DC Ref", "Cross-Ref DC", "Brief Description (5–10 words)", "Notes"]];
    var n = 0;
    store.entities.forEach(function (e) {
      if (e.type === "note" || e.type === "date" || e.type === "event") return;
      n++;
      var prov = e.provenance || {};
      var nexusLink = store.links.find(function (l) { return l.from === e.id || l.to === e.id; });
      logRows.push([n, F.todayDDMMYYYY(), officer(), "Solar / Open Source", "Check",
        F.entityFreeText(e), subjectFor(e.id),
        prov.sourceRef || "open source research",
        nexusLink ? nexusLink.type.replace(/_/g, " ").toLowerCase() + " the subject" : "charted in Solar",
        "", "", "Solar smart-match extraction " + F.gradeCode(prov), ""]);
    });

    U.download(stamp("Subjects"), csv(subjRows), "text/csv");
    U.download(stamp("Log"), csv(logRows), "text/csv");
    window.CRApp.status("Logging Tool v1 CSVs exported — paste into the workbook sheets");
  }

  /* ---------------- Intel Log 2 — Enquiry Log ---------------- */

  function exportIntelLog2() {
    var rows = [["Reference", "Linked Action", "Date (dd/mm/yyyy)", "Officer",
      "Subject to which Entity Relates", "Source of Entity", "Entity",
      "Enquiry (e.g System or Name of OS check)", "Result Summary"]];
    var n = 0;
    store.entities.forEach(function (e) {
      if (e.type === "note" || e.type === "date" || e.type === "event") return;
      n++;
      var prov = e.provenance || {};
      var rel = store.links.find(function (l) { return l.from === e.id || l.to === e.id; });
      rows.push(["E" + String(n).padStart(3, "0"), "", F.todayDDMMYYYY(), officer(),
        subjectFor(e.id), prov.sourceRef || "open source",
        F.entityFreeText(e), "Solar extraction / smart match",
        (rel && rel.sentence ? rel.sentence : "Charted in Solar") + "  " + F.gradeCode(prov)]);
    });
    U.download(stamp("EnquiryLog"), csv(rows), "text/csv");
    window.CRApp.status("Intel Log 2 Enquiry CSV exported");
  }

  /* ---------------- Intelligence Report draft ---------------- */

  function exportIRDraft() {
    var meta = store.meta;
    var lines = [];
    lines.push((meta.classification || "OFFICIAL"));
    lines.push("");
    lines.push("INTELLIGENCE REPORT (DRAFT — generated by Solar, " + F.todayDDMMYYYY() + ")");
    lines.push("Report title: " + (meta.operation ? meta.operation + " — " : "") +
      "Intelligence arising from charted material" +
      (meta.caseRef ? " (" + meta.caseRef + ")" : ""));
    lines.push("Person reporting / source: [ISR or name — complete before submission]");
    lines.push("Source evaluation: 2 (Untested) [review per source]");
    lines.push("Intelligence assessment: C (Known indirectly) [review per item]");
    lines.push("Handling code: P (Lawful sharing permitted) [review]");
    lines.push("");
    lines.push("INFORMATION:");
    var n = 0;
    store.links.forEach(function (l) {
      if (!l.sentence || l.negated) return;
      var src = store.getEntity(l.from), tgt = store.getEntity(l.to);
      if (!src || !tgt) return;
      n++;
      var prov = (src.type === "person" ? src.provenance : tgt.provenance) || {};
      lines.push(n + ". " + F.gradeSentence(l.sentence, prov));
    });
    store.links.filter(function (l) { return l.negated; }).forEach(function (l) {
      if (!l.sentence) return;
      n++;
      lines.push(n + ". [DENIED/NEGATED — handle with care] " + F.gradeSentence(l.sentence, { source: "2", assessment: "E", handling: "P" }));
    });
    if (!n) lines.push("[No charted relationship sentences available]");
    lines.push("");
    lines.push("One discrete matter per IR — split before submission if needed.");
    lines.push("URN: [assigned by intelligence unit on submission]");
    lines.push("");
    lines.push(meta.classification || "OFFICIAL");
    U.download(stamp("IR_DRAFT").replace(".csv", ".txt"), lines.join("\r\n"), "text/plain");
    window.CRApp.status("IR draft exported — complete source fields before submission");
  }

  /* ---------------- i2 ANB import pack ---------------- */

  var STRENGTH = { high: "Confirmed", med: "Unconfirmed", low: "Tentative" };

  function exportI2Pack() {
    var T = window.CRModel.ENTITY_TYPES;
    var ents = [["Identity", "Label", "Entity Type", "Semantic Type", "Description",
      "Grade 1 (Source)", "Grade 2 (Assessment)", "Grade 3 (Handling)", "Source Reference",
      "Date of Birth", "Attributes"]];
    store.entities.forEach(function (e) {
      if (e.type === "note") return;
      var ty = T[e.type] || {};
      var prov = e.provenance || {};
      var attrs = Object.keys(e.attrs || {}).filter(function (k) { return k[0] !== "_"; })
        .map(function (k) { return k + "=" + e.attrs[k]; }).join("; ");
      ents.push([
        (e.ids && (e.ids.e164 || e.ids.email)) || e.label,   // i2 Identity (unique, canonical)
        e.label,                                              // i2 Label (display)
        ty.i2 || ty.label || e.type,
        ty.sem || "",
        e.sourceText ? e.sourceText.slice(0, 200) : "",
        prov.source || "", prov.assessment || "", prov.handling || "",
        prov.sourceRef || "",
        e.attrs && e.attrs.dob ? F.ddmmyyyy(e.attrs.dob) : "",
        attrs
      ]);
    });
    var lnks = [["End 1 Identity", "End 2 Identity", "Link Type", "Direction",
      "Line Strength", "Date", "Label", "Description"]];
    store.links.forEach(function (l) {
      var a = store.getEntity(l.from), b = store.getEntity(l.to);
      if (!a || !b || a.type === "note" || b.type === "note") return;
      lnks.push([
        (a.ids && (a.ids.e164 || a.ids.email)) || a.label,
        (b.ids && (b.ids.e164 || b.ids.email)) || b.label,
        l.type.replace(/_/g, " "),
        "End 1 to End 2",
        l.negated ? "Tentative" : (STRENGTH[l.confidence] || "Unconfirmed"),
        l.dateISO ? F.ddmmyyyy(l.dateISO) : "",
        l.type.replace(/_/g, " ") + (l.amount ? " " + l.amount : "") + (l.negated ? " (denied)" : ""),
        l.sentence || ""
      ]);
    });
    var readme = [
      "SOLAR → i2 Analyst's Notebook import pack (" + F.todayDDMMYYYY() + ")",
      "",
      "1. entities.csv — import first. In the Import wizard assign one entity per row:",
      "   Identity column → Identity; Label → Label; Entity Type per the 'Entity Type' column",
      "   (Person, Telephone, Email Address, Address, Location, Organization, Vehicle,",
      "   Bank Account, Event, Document). Grades 1/2/3 map to Description & Grades.",
      "2. links.csv — import second, as links between existing entities:",
      "   End 1 / End 2 Identity columns → the two link ends; Direction 'End 1 to End 2';",
      "   Line Strength column → Confirmed (solid) / Unconfirmed (dashed) / Tentative (dotted).",
      "3. Dates are DD/MM/YYYY (custom format dd/MM/yyyy in the wizard).",
      "4. Grading is NCA 3x5x2: Source 1-3, Assessment A-E, Handling P/C.",
      "Verify the first few rows after import — identities must be unique per entity."
    ].join("\r\n");
    U.download(stamp("i2_entities"), csv(ents), "text/csv");
    U.download(stamp("i2_links"), csv(lnks), "text/csv");
    U.download(stamp("i2_README").replace(".csv", ".txt"), readme, "text/plain");
    window.CRApp.status("i2 import pack exported (entities + links + README)");
  }

  function stamp(kind) {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "" + p(d.getMonth() + 1) + p(d.getDate()) +
      " - Solar - " + (store.meta.caseRef || "CASE") + " " + kind + ".csv";
  }

  /* ---------------- modal wiring ---------------- */

  function wire() {
    var ids = {
      "exp-meta-officer": "officer", "exp-meta-caseref": "caseRef", "exp-meta-op": "operation"
    };
    Object.keys(ids).forEach(function (id) {
      var el = U.el(id);
      if (!el) return;
      el.value = store.meta[ids[id]] || "";
      el.addEventListener("change", function () {
        store.meta[ids[id]] = el.value.slice(0, 60);
        store.saveLocal();
      });
    });
    var map = {
      "exp-logv1": exportLoggingToolV1,
      "exp-log2": exportIntelLog2,
      "exp-ir": exportIRDraft,
      "exp-i2": exportI2Pack,
      "exp-anx": function () { window.CRApp.exportANX(); },
      "exp-profile-short": function () { profileGuard("short"); },
      "exp-profile-long": function () { profileGuard("long"); },
      "exp-profile-html": function () { profileGuard("html"); }
    };
    Object.keys(map).forEach(function (id) {
      var el = U.el(id);
      if (el) el.addEventListener("click", map[id]);
    });
    var close = U.el("export-close");
    if (close) close.addEventListener("click", function () { U.closeModal("export-veil"); });
  }

  function doProfile(person, kind) {
    if (kind === "html") window.CRProfiles.exportHtml(person.id);
    else window.CRProfiles.exportDocx(person.id, kind);
  }

  // A profile is about ONE individual. Use the selected person; if none is
  // selected and several exist, ask which subject (never silently pick one).
  function pickPerson(kind, persons) {
    var veil = U.el("profile-pick-veil");
    if (!veil) {
      veil = document.createElement("div");
      veil.className = "modal-veil"; veil.id = "profile-pick-veil";
      veil.setAttribute("role", "dialog"); veil.setAttribute("aria-modal", "true");
      veil.setAttribute("aria-label", "choose subject");
      veil.innerHTML = '<div class="modal narrow"><div class="modal-head"><h2>Which subject?</h2>' +
        '<button class="btn x" id="pp-close" aria-label="close">✕</button></div>' +
        '<div class="modal-body"><p class="note">A subject profile covers one individual. Choose who this profile is about:</p>' +
        '<div id="pp-list" style="display:flex;flex-direction:column;gap:6px;margin-top:8px"></div></div></div>';
      document.body.appendChild(veil);
      veil.querySelector("#pp-close").addEventListener("click", function () { U.closeModal("profile-pick-veil"); });
    }
    var list = veil.querySelector("#pp-list"); list.innerHTML = "";
    persons.forEach(function (p) {
      var b = document.createElement("button");
      b.className = "btn"; b.type = "button"; b.style.justifyContent = "flex-start";
      b.textContent = F.personFreeText(p.label, p.attrs && p.attrs.dob);
      b.addEventListener("click", function () { U.closeModal("profile-pick-veil"); doProfile(p, kind); });
      list.appendChild(b);
    });
    U.openModal("profile-pick-veil");
  }

  function profileGuard(kind) {
    var sel = window.CRApp.getSelectedEntityId && window.CRApp.getSelectedEntityId();
    var person = sel && store.getEntity(sel);
    if (person && person.type === "person") { U.closeModal("export-veil"); doProfile(person, kind); return; }
    var persons = store.entities.filter(function (e) { return e.type === "person"; });
    if (!persons.length) { window.CRApp.status("No person entity on the chart yet"); return; }
    U.closeModal("export-veil");
    if (persons.length === 1) doProfile(persons[0], kind);
    else pickPerson(kind, persons);
  }

  window.CRIntelExport = {
    init: init,
    exportLoggingToolV1: exportLoggingToolV1,
    exportIntelLog2: exportIntelLog2,
    exportIRDraft: exportIRDraft,
    exportI2Pack: exportI2Pack
  };
})();
