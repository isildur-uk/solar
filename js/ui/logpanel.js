/* CHART ROOM — logpanel.js
 * Intelligence logs UI mirroring the NTC workbook tabs in-app: Enquiry,
 * Disclosure, Comms Apps, Actions and the Decision log. Schema-driven (one
 * field/column table per record type) over the shared record + collab spine
 * (CRRecords / CRCollab); enquiry & disclosure auto-write disclosure-grade
 * text + file names via CRDisclosure. Every analyst value is rendered through
 * CRUtil.esc() (XSS gate). Browser: window.CRLogPanel.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var R = window.CRRecords, C = window.CRCollab, D = window.CRDisclosure, V = window.CRIntelVocab;
  var store = null;
  var veil = null, activeTab = "enquiry", editingId = null;

  var TABS = [
    { key: "enquiry", label: "Enquiry Log" },
    { key: "disclosure", label: "Disclosure Log" },
    { key: "commsapp", label: "Comms Apps" },
    { key: "action", label: "Actions" },
    { key: "decision", label: "Decision Log" },
    { key: "profile", label: "Profiles" },
    { key: "coverage", label: "Coverage" }
  ];

  function init(caseStore) {
    store = caseStore;
    if (R && R.attach) R.attach(store);
    if (window.CRCaseSync) window.CRCaseSync.setWho(who);
    injectButton();
  }

  function injectButton() {
    if (document.getElementById("btn-logs")) return;
    var bar = document.getElementById("topbar");
    if (!bar) return;
    var btn = document.createElement("button");
    btn.className = "btn";
    btn.id = "btn-logs";
    btn.textContent = "Logs";
    btn.title = "Intelligence logs — enquiries, disclosure, comms apps, actions, decisions";
    btn.addEventListener("click", open);
    var anchor = document.getElementById("menu-case");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    else bar.appendChild(btn);
  }

  /* ---------------- helpers ---------------- */
  function who() {
    return (store && store.meta && store.meta.officer) ||
      (window.localStorage && localStorage.getItem("cr_officer")) || "";
  }
  function caseRef() { return (store && store.meta && store.meta.caseRef) || "CASEREF"; }
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function entityLabels() {
    return (store.entities || []).map(function (e) { return e.label; })
      .filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  }
  function esc(s) { return U.esc(s == null ? "" : s); }
  function persist() { if (store.saveLocal) store.saveLocal(); }
  function trunc(s) { return U.truncate ? U.truncate(String(s == null ? "" : s), 64) : String(s == null ? "" : s); }
  function tabLabel(key) { for (var i = 0; i < TABS.length; i++) if (TABS[i].key === key) return TABS[i].label; return key; }

  /* ---------------- per-type schema ---------------- */
  var ENT = "ent";
  function fieldsFor(type) {
    switch (type) {
      case "enquiry": return [
        { id: "date", label: "Date", kind: "date", def: todayISO },
        { id: "officer", label: "Officer (staff no.)", kind: "text", def: who },
        { id: "system", label: "System / enquiry", kind: "select", opts: V.SYSTEMS },
        { id: "subject", label: "Subject", kind: ENT },
        { id: "entity", label: "Entity / identifier searched", kind: ENT },
        { id: "source", label: "Source of entity", kind: "select", opts: V.SOURCES },
        { id: "brief", label: "Brief description (for file name, 5-10 words)", kind: "text" },
        { id: "result", label: "Result summary (optional)", kind: "textarea" }
      ];
      case "disclosure": return [
        { id: "date", label: "Date", kind: "date", def: todayISO },
        { id: "officer", label: "Officer (staff no.)", kind: "text", def: who },
        { id: "docType", label: "Document type", kind: "select", opts: V.DOC_TYPES },
        { id: "system", label: "System (if applicable)", kind: "select", opts: V.SYSTEMS },
        { id: "subject", label: "Subject", kind: ENT },
        { id: "entity", label: "Entity", kind: ENT },
        { id: "brief", label: "Brief description (for file name)", kind: "text" },
        { id: "notes", label: "Notes (e.g. sensitivity)", kind: "textarea" }
      ];
      case "commsapp": return [
        { id: "date", label: "Application date", kind: "date", def: todayISO },
        { id: "officer", label: "Applicant (staff no.)", kind: "text", def: who },
        { id: "subject", label: "Subject", kind: ENT },
        { id: "entity", label: "Selector (number / IP / identifier)", kind: ENT },
        { id: "purpose", label: "Necessity & proportionality", kind: "textarea" },
        { id: "period", label: "Data / period requested", kind: "text" },
        { id: "sentDate", label: "Date sent to SPoC", kind: "date" },
        { id: "returnedDate", label: "Date returned", kind: "date" },
        { id: "brief", label: "Brief description (for file name)", kind: "text" },
        { id: "result", label: "Result summary", kind: "textarea" }
      ];
      case "action": return [
        { id: "date", label: "Date raised", kind: "date", def: todayISO },
        { id: "officer", label: "Officer (staff no.)", kind: "text", def: who },
        { id: "description", label: "Action description", kind: "textarea" },
        { id: "linkedRef", label: "Linked enquiry / disclosure ref", kind: "text" },
        { id: "comments", label: "Comments", kind: "textarea" }
      ];
      case "decision": return [
        { id: "date", label: "Date & time", kind: "date", def: todayISO },
        { id: "officer", label: "Officer (staff no.)", kind: "text", def: who },
        { id: "entryType", label: "Entry type", kind: "select", opts: V.ENTRY_TYPES },
        { id: "entry", label: "Entry", kind: "textarea" },
        { id: "rationale", label: "Rationale / considerations", kind: "textarea" },
        { id: "resultingAction", label: "Resulting action ref", kind: "text" }
      ];
      case "profile": return [
        { id: "date", label: "Date", kind: "date", def: todayISO },
        { id: "officer", label: "Owner (staff no.)", kind: "text", def: who },
        { id: "subject", label: "Subject (a Person on the chart)", kind: ENT },
        { id: "summary", label: "Profile summary", kind: "textarea" },
        { id: "notes", label: "Notes", kind: "textarea" }
      ];
      default: return [];
    }
  }

  function listColsFor(type) {
    switch (type) {
      case "enquiry": return [["Ref", refGet], ["Date", dg("date")], ["System", dg("system")], ["Subject", dg("subject")], ["Entity", dg("entity")], ["__status", null], ["Owner", og("owner")], ["Assignee", og("assignee")]];
      case "disclosure": return [["Ref", refGet], ["Date", dg("date")], ["Doc type", dg("docType")], ["Subject", dg("subject")], ["Entity", dg("entity")], ["__status", null], ["Owner", og("owner")], ["Assignee", og("assignee")]];
      case "commsapp": return [["Ref", refGet], ["Date", dg("date")], ["Subject", dg("subject")], ["Selector", dg("entity")], ["__status", null], ["Owner", og("owner")], ["Assignee", og("assignee")]];
      case "action": return [["Ref", refGet], ["Date", dg("date")], ["Description", function (r) { return trunc((r.data || {}).description); }], ["__status", null], ["Owner", og("owner")], ["Assignee", og("assignee")]];
      case "decision": return [["Ref", refGet], ["Date", dg("date")], ["Type", dg("entryType")], ["Entry", function (r) { return trunc((r.data || {}).entry); }], ["__status", null], ["Owner", og("owner")]];
      case "profile": return [["Ref", refGet], ["Date", dg("date")], ["Subject", dg("subject")], ["__status", null], ["Owner", og("owner")], ["Reviewer", og("assignee")]];
      default: return [["Ref", refGet], ["__status", null]];
    }
  }
  function refGet(r) { return r.ref; }
  function dg(k) { return function (r) { return (r.data || {})[k] || ""; }; }
  function og(k) { return function (r) { return r[k] || ""; }; }

  /* type -> auto-generated preview {text, file} or null */
  function computePreview(type, v) {
    if (type === "enquiry") return {
      text: D.enquirySentence({ system: v.system, date: v.date, who: v.officer, entity: v.entity, subject: v.subject, result: v.result }),
      file: D.fileName({ date: v.date, system: v.system, caseRef: caseRef(), brief: v.brief })
    };
    if (type === "disclosure") return {
      text: D.disclosureTitle({ system: v.system || v.docType, entity: v.entity, date: v.date, who: v.officer }) + "\n\n" +
            D.docDescription(v.docType, { subject: v.subject, date: v.date, who: v.officer, entity: v.entity, system: v.system }),
      file: D.fileName({ date: v.date, system: v.system || v.docType, caseRef: caseRef(), brief: v.brief })
    };
    if (type === "commsapp") return {
      text: "Comms data application by officer " + (v.officer || "[staff no.]") + " on " + D.ddmmyyyy(v.date) +
            " in relation to " + (v.subject || "[subject]") + ". Selector: " + (v.entity || "[selector]") +
            ". Data/period requested: " + (v.period || "[period]") + ". Necessity & proportionality: " +
            (v.purpose || "[to complete]") + ".",
      file: D.fileName({ date: v.date, system: "Comms Data", caseRef: caseRef(), brief: v.brief })
    };
    return null;
  }

  /* ---------------- open / shell ---------------- */
  function open() { if (!veil) build(); render(); veil.classList.add("open"); }
  function close() { if (veil) veil.classList.remove("open"); }

  function build() {
    veil = document.createElement("div");
    veil.className = "modal-veil";
    veil.setAttribute("role", "dialog");
    veil.setAttribute("aria-modal", "true");
    veil.setAttribute("aria-label", "Intelligence logs");
    var modal = document.createElement("div");
    modal.className = "modal";
    modal.style.cssText = "width:min(1100px,96vw);max-height:92vh;display:flex;flex-direction:column";
    modal.innerHTML =
      '<div class="modal-head" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<h2 style="margin:0">Intelligence logs</h2>' +
        '<div id="lp-tabs" style="display:flex;gap:4px;flex-wrap:wrap"></div>' +
        '<div style="flex:1"></div>' +
        '<button class="btn x" id="lp-close" aria-label="close">✕</button></div>' +
      '<div class="modal-body" id="lp-body" style="overflow:auto;flex:1"></div>';
    veil.appendChild(modal);
    document.body.appendChild(veil);
    veil.addEventListener("click", function (e) { if (e.target === veil) close(); });
    document.getElementById("lp-close").addEventListener("click", close);
  }

  function render() {
    var tabs = document.getElementById("lp-tabs");
    tabs.innerHTML = TABS.map(function (t) {
      return '<button class="btn' + (activeTab === t.key ? " primary" : "") + '" data-tab="' + U.escAttr(t.key) + '">' + esc(t.label) + "</button>";
    }).join("");
    Array.prototype.forEach.call(tabs.querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { activeTab = b.getAttribute("data-tab"); editingId = null; render(); });
    });
    var body = document.getElementById("lp-body");
    body.innerHTML = "";
    body.appendChild(syncBar());
    if (activeTab === "coverage") { body.appendChild(coverageView()); return; }
    body.appendChild(officerRow());
    body.appendChild((editingId === "new" || editing()) ? formView() : listView());
  }

  function editing() { return editingId && editingId !== "new" ? R.get(store, activeTab, editingId) : null; }

  var LB = "font:10px var(--mono);color:var(--faint);text-transform:uppercase;letter-spacing:.08em";
  var IN = "background:var(--panel-2,#17171a);border:1px solid var(--line,#2a2a27);color:var(--text,#f4f3e8);font:12px var(--mono,Consolas,monospace);padding:6px 8px;width:100%;box-sizing:border-box";

  function officerRow() {
    var wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap";
    var noun = activeTab === "decision" ? "entry" : (activeTab === "commsapp" ? "application" : activeTab);
    wrap.innerHTML =
      '<label style="' + LB + '">Your staff no. <input id="lp-officer" value="' + U.escAttr(who()) + '" style="' + IN + ';width:120px" title="Default officer / owner on new rows"></label>' +
      '<span style="' + LB + '">Case ref: ' + esc(caseRef()) + '</span>' +
      '<div style="flex:1"></div>' +
      '<button class="btn primary" id="lp-new">+ New ' + esc(noun) + '</button>' +
      '<button class="btn" id="lp-export">Export CSV</button>';
    wrap.querySelector("#lp-officer").addEventListener("change", function (e) {
      var v = e.target.value.trim();
      if (window.localStorage) localStorage.setItem("cr_officer", v);
      if (store.meta && !store.meta.officer) store.meta.officer = v;
    });
    wrap.querySelector("#lp-new").addEventListener("click", function () { editingId = "new"; render(); });
    wrap.querySelector("#lp-export").addEventListener("click", exportCSV);
    return wrap;
  }

  /* ---------------- list view ---------------- */
  function listView() {
    var recs = R.list(store, activeTab).slice().sort(function (a, b) { return (a.ref < b.ref) ? -1 : 1; });
    var cols = listColsFor(activeTab);
    var box = document.createElement("div");
    if (!recs.length) {
      box.innerHTML = '<div class="hint" style="padding:20px;text-align:center;color:#84837b">No ' +
        esc(tabLabel(activeTab)) + ' rows yet. Use “+ New”.</div>';
      return box;
    }
    var html = '<table style="width:100%;border-collapse:collapse;font:12px var(--mono,Consolas,monospace)">';
    html += "<tr>" + cols.map(function (c) {
      var h = c[0] === "__status" ? "Status" : c[0];
      return '<th style="text-align:left;padding:5px 7px;border-bottom:1px solid var(--line,#2a2a27);color:#84837b;font-weight:600">' + esc(h) + "</th>";
    }).join("") + '<th style="border-bottom:1px solid var(--line,#2a2a27)"></th></tr>';
    recs.forEach(function (r) {
      html += '<tr data-id="' + U.escAttr(r.id) + '" class="lp-row" style="cursor:pointer">';
      cols.forEach(function (c) {
        if (c[0] === "__status") html += '<td style="padding:4px 7px;border-bottom:1px solid var(--line)">' + statusSelect(r) + "</td>";
        else html += td(c[1](r));
      });
      html += '<td style="padding:4px 7px;border-bottom:1px solid var(--line)"><button class="btn lp-copy" data-id="' + U.escAttr(r.id) + '" title="Copy text">Copy</button></td></tr>';
    });
    html += "</table>";
    box.innerHTML = '<div class="lp-tablewrap">' + html + '</div>';
    Array.prototype.forEach.call(box.querySelectorAll(".lp-row"), function (tr) {
      tr.addEventListener("click", function (e) {
        if (e.target.closest("select") || e.target.closest("button")) return;
        openForEdit(tr.getAttribute("data-id"));
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll(".lp-copy"), function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); copyText(R.get(store, activeTab, b.getAttribute("data-id"))); });
    });
    wireStatusSelects(box);
    return box;
  }
  function td(v) { return '<td style="padding:4px 7px;border-bottom:1px solid var(--line)">' + esc(v) + "</td>"; }

  function statusSelect(r) {
    var t = R.RECORD_TYPES[r.type] || { statuses: [] };
    var opts = [r.status];
    (t.statuses || []).forEach(function (s) { if (s !== r.status && C.canTransition(r.type, r.status, s)) opts.push(s); });
    return '<select class="lp-status" data-id="' + U.escAttr(r.id) + '" style="' + IN + ';width:auto;padding:3px 4px">' +
      opts.map(function (s, i) { return '<option value="' + U.escAttr(s) + '"' + (i === 0 ? " selected" : "") + ">" + esc(s) + (i === 0 ? "" : " →") + "</option>"; }).join("") +
      "</select>";
  }
  function wireStatusSelects(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll(".lp-status"), function (sel) {
      sel.addEventListener("click", function (e) { e.stopPropagation(); });
      sel.addEventListener("change", function (e) {
        e.stopPropagation();
        var rec = R.get(store, activeTab, sel.getAttribute("data-id"));
        var res = C.transition(rec, sel.value, who());
        if (!res.ok) { alert(res.error); render(); return; }
        persist(); render();
      });
    });
  }

  /* ---------------- form view ---------------- */
  function field(id, label, value, kind, opts) {
    var inner;
    if (kind === "select") {
      inner = '<select id="' + id + '" style="' + IN + '">' +
        ['<option value=""></option>'].concat((opts || []).map(function (o) {
          return '<option value="' + U.escAttr(o) + '"' + (o === value ? " selected" : "") + ">" + esc(o) + "</option>";
        })).join("") + "</select>";
    } else if (kind === "textarea") {
      inner = '<textarea id="' + id + '" rows="3" style="' + IN + ';resize:vertical">' + esc(value) + "</textarea>";
    } else {
      var list = opts ? ' list="' + id + '-dl"' : "";
      var dl = opts ? '<datalist id="' + id + '-dl">' + opts.map(function (o) { return '<option value="' + U.escAttr(o) + '">'; }).join("") + "</datalist>" : "";
      inner = '<input id="' + id + '" value="' + U.escAttr(value) + '"' + (kind === "date" ? ' type="date"' : "") + list + ' style="' + IN + '">' + dl;
    }
    return '<label style="display:block;margin-bottom:10px">' +
      '<span style="' + LB + ';display:block;margin-bottom:3px">' + esc(label) + "</span>" + inner + "</label>";
  }

  function formView() {
    var rec = editing();
    var d = (rec && rec.data) || {};
    var type = activeTab;
    var schema = fieldsFor(type);
    var ents = entityLabels();
    var box = document.createElement("div");

    var leftHtml = schema.map(function (f) {
      var val = d[f.id] != null ? d[f.id] : (f.def ? (typeof f.def === "function" ? f.def() : f.def) : "");
      if (!rec && pendingNew && pendingNew[f.id] != null) val = pendingNew[f.id];
      var kind = f.kind === ENT ? "text" : f.kind;
      var opts = f.kind === ENT ? ents : f.opts;
      return field("f-" + f.id, f.label, val, kind, opts);
    }).join("");
    if (!rec) pendingNew = null; // consumed at point-of-use

    var assignBlock = rec
      ? '<div style="display:flex;gap:8px;margin:6px 0 12px">' +
          '<label style="flex:1"><span style="' + LB + ';display:block;margin-bottom:3px">Owner</span>' +
            '<input id="f-owner" value="' + U.escAttr(rec.owner || "") + '" style="' + IN + '"></label>' +
          '<label style="flex:1"><span style="' + LB + ';display:block;margin-bottom:3px">Assignee</span>' +
            '<input id="f-assignee" value="' + U.escAttr(rec.assignee || "") + '" style="' + IN + '"></label>' +
          '<label style="flex:1"><span style="' + LB + ';display:block;margin-bottom:3px">Status</span><div style="padding-top:4px">' + statusSelect(rec) + '</div></label>' +
        "</div>"
      : "";

    var isProfile = type === "profile";
    var hasPreview = !!computePreview(type, {});
    var rightHtml = isProfile
      ? '<div>' +
          '<div style="' + LB + ';margin-bottom:8px">Generate profile (NCA Short / Long)</div>' +
          '<p style="font:11px var(--mono,Consolas,monospace);color:var(--dim);line-height:1.5;margin:0 0 12px">Builds the profile for the selected subject from everything linked to them on the chart. Verify before dissemination.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn" id="prof-short">Short .docx</button>' +
            '<button class="btn" id="prof-long">Long .docx</button>' +
            '<button class="btn" id="prof-html">Print .html</button>' +
          "</div>" +
          '<div id="prof-msg" style="font:10px Consolas,monospace;color:var(--faint);margin-top:10px"></div>' +
        "</div>"
      : (hasPreview
      ? '<div>' +
          '<div style="' + LB + ';margin-bottom:8px">Auto-generated (verify before use)</div>' +
          '<div style="' + LB + '">' + (type === "disclosure" ? "Title & description" : "Disclosure text") + '</div>' +
          '<div id="lp-prev-sentence" style="background:var(--bg);border:1px solid var(--line);padding:10px;font:12px var(--mono,Consolas,monospace);line-height:1.5;white-space:pre-wrap;min-height:90px;margin:3px 0 12px"></div>' +
          '<div style="' + LB + '">File name</div>' +
          '<div id="lp-prev-file" style="background:var(--bg);border:1px solid var(--line);padding:8px;font:12px var(--mono,Consolas,monospace);margin:3px 0 12px;word-break:break-all"></div>' +
          '<div style="font:10px Consolas,monospace;color:var(--faint)">' + esc(D.CAVEAT) + "</div>" +
        "</div>"
      : "");

    var lockBanner = (rec && lockInfo && lockInfo.heldBy)
      ? '<div style="margin-bottom:10px;padding:8px 10px;border:1px solid #d8a16e;border-radius:var(--radius);background:#2a2113;color:#e8c98a;font:11px var(--mono,Consolas,monospace)">Checked out by ' + esc(lockInfo.heldBy) + ' since ' + esc(String(lockInfo.since || "").slice(0, 16).replace("T", " ")) + ' — editing anyway will risk a conflict on save.</div>'
      : "";
    box.innerHTML = lockBanner +
      '<div class="lp-grid' + ((hasPreview || isProfile) ? "" : " one") + '">' +
        '<div><div style="' + LB + ';margin-bottom:8px">' + (rec ? "Edit " + esc(rec.ref) : "New " + esc(tabLabel(type))) + "</div>" +
          assignBlock + leftHtml + "</div>" + rightHtml +
      "</div>" +
      '<div class="modal-foot" style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' +
        (rec ? '<button class="btn" id="lp-delete" style="margin-right:auto">Delete</button>' : "") +
        '<button class="btn" id="lp-cancel">Cancel</button>' +
        (hasPreview ? '<button class="btn" id="lp-copy2">Copy text</button>' : "") +
        '<button class="btn primary" id="lp-save">' + (rec ? "Save changes" : "Add to log") + "</button>" +
      "</div>";

    function gv(id) { var el = box.querySelector("#" + id); return el ? el.value : ""; }
    function vals() { var o = {}; schema.forEach(function (f) { o[f.id] = gv("f-" + f.id); }); return o; }
    function preview() {
      if (!hasPreview) return;
      var pr = computePreview(type, vals());
      box.querySelector("#lp-prev-sentence").textContent = pr.text;
      box.querySelector("#lp-prev-file").textContent = pr.file;
    }
    Array.prototype.forEach.call(box.querySelectorAll("input,select,textarea"), function (el) {
      el.addEventListener("input", preview); el.addEventListener("change", preview);
    });
    preview();

    box.querySelector("#lp-cancel").addEventListener("click", function () { var Sync = window.CRCaseSync; if (rec && Sync && Sync.isConnected()) Sync.releaseLock(rec); lockInfo = null; editingId = null; render(); });
    var copyBtn = box.querySelector("#lp-copy2");
    if (copyBtn) copyBtn.addEventListener("click", function () { clip(previewClip(type, vals())); });
    box.querySelector("#lp-save").addEventListener("click", function () { save(type, vals(), rec); });
    if (rec) {
      box.querySelector("#lp-delete").addEventListener("click", function () {
        if (confirm("Delete " + rec.ref + "?")) { R.remove(store, activeTab, rec.id); persist(); editingId = null; render(); }
      });
      var sel = box.querySelector(".lp-status");
      if (sel) sel.addEventListener("change", function () {
        var res = C.transition(rec, sel.value, who());
        if (!res.ok) { alert(res.error); render(); return; }
        persist();
      });
      var ow = box.querySelector("#f-owner"), asg = box.querySelector("#f-assignee");
      if (ow) ow.addEventListener("change", function () { C.setOwner(rec, who(), ow.value.trim()); persist(); });
      if (asg) asg.addEventListener("change", function () { C.assign(rec, who(), asg.value.trim()); persist(); });
    }
    if (isProfile) {
      var pmsg = box.querySelector("#prof-msg");
      function resolvePerson() {
        var lab = (box.querySelector("#f-subject") || {}).value || "";
        return (store.entities || []).find(function (e) { return e.type === "person" && e.label === lab; }) || null;
      }
      function gen(kind) {
        var person = resolvePerson();
        if (!person) { if (pmsg) pmsg.textContent = "Pick a subject who is a Person entity on the chart first."; return; }
        if (!window.CRProfiles) { if (pmsg) pmsg.textContent = "Profile generator unavailable."; return; }
        try {
          if (kind === "html") window.CRProfiles.exportHtml(person.id);
          else window.CRProfiles.exportDocx(person.id, kind);
          if (pmsg) pmsg.textContent = "Generated " + kind + " profile for " + person.label + ".";
        } catch (e) { if (pmsg) pmsg.textContent = "Could not generate: " + (e && e.message || e); }
      }
      var ps = box.querySelector("#prof-short"), pl = box.querySelector("#prof-long"), ph = box.querySelector("#prof-html");
      if (ps) ps.addEventListener("click", function () { gen("short"); });
      if (pl) pl.addEventListener("click", function () { gen("long"); });
      if (ph) ph.addEventListener("click", function () { gen("html"); });
    }
    return box;
  }

  /* build the data object saved on a record (raw fields + computed text) */
  function collect(type, v) {
    var data = {};
    fieldsFor(type).forEach(function (f) { data[f.id] = v[f.id] || ""; });
    var pr = computePreview(type, v);
    if (type === "enquiry") { data.purpose = D.purposeFor(v.system); data.sentence = pr.text; data.fileName = pr.file; }
    else if (type === "disclosure") {
      data.title = D.disclosureTitle({ system: v.system || v.docType, entity: v.entity, date: v.date, who: v.officer });
      data.description = D.docDescription(v.docType, { subject: v.subject, date: v.date, who: v.officer, entity: v.entity, system: v.system });
      data.fileName = pr.file;
    } else if (type === "commsapp") { data.summary = pr.text; data.fileName = pr.file; }
    return data;
  }

  function save(type, v, rec) {
    var data = collect(type, v);
    if (rec) { rec.data = data; C.touch(rec, who(), "edited fields"); }
    else { rec = R.add(store, type, { data: data, owner: v.officer || who() }, v.officer || who()); }
    persist();
    var Sync = window.CRCaseSync;
    if (Sync && Sync.isConnected()) {
      Sync.saveRecord(store, type, rec).then(function (res) {
        if (res && res.conflict) {
          var keepMine = confirm(rec.ref + " was changed in the shared folder by someone else.\n\nOK = keep MINE (overwrite)\nCancel = take THEIRS (discard my change)");
          Sync.resolveConflict(store, type, rec, keepMine ? "mine" : "theirs").then(finishSave);
        } else { finishSave(); }
      }, function () { finishSave(); });
    } else { finishSave(); }
    function finishSave() { if (rec) { var Sync2 = window.CRCaseSync; if (Sync2 && Sync2.isConnected()) Sync2.releaseLock(rec); } editingId = null; lockInfo = null; render(); }
  }

  /* ---------------- copy / export ---------------- */
  function recordText(rec) {
    var d = rec.data || {};
    if (rec.type === "enquiry") return d.sentence || "";
    if (rec.type === "disclosure") return (d.title || "") + "\n" + (d.description || "");
    if (rec.type === "commsapp") return d.summary || "";
    if (rec.type === "action") return d.description || "";
    if (rec.type === "decision") return (d.entry || "") + (d.rationale ? "\nRationale: " + d.rationale : "");
    return "";
  }
  function previewClip(type, v) {
    var pr = computePreview(type, v);
    return (pr ? pr.text + "\n\nFile name: " + pr.file : "");
  }
  function copyText(rec) {
    if (!rec) return;
    var d = rec.data || {};
    clip(recordText(rec) + (d.fileName ? "\n\nFile name: " + d.fileName : ""));
  }
  function clip(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else done();
    function done() { if (window.CRApp && window.CRApp.status) window.CRApp.status("Copied to clipboard"); }
  }

  function csvSafe(v) {
    var s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s.replace(/"/g, '""');
  }
  function csvColsFor(type) {
    var ids = fieldsFor(type).map(function (f) { return f.id; });
    var computed = type === "enquiry" ? ["purpose", "sentence", "fileName"]
      : type === "disclosure" ? ["title", "description", "fileName"]
      : type === "commsapp" ? ["summary", "fileName"] : [];
    return ["ref", "status", "owner", "assignee"].concat(ids).concat(computed);
  }
  function exportCSV() {
    var recs = R.list(store, activeTab);
    var cols = csvColsFor(activeTab);
    var rows = [cols.join(",")];
    recs.forEach(function (r) {
      var d = r.data || {};
      rows.push(cols.map(function (c) {
        var v = (c === "ref" || c === "status" || c === "owner" || c === "assignee") ? r[c] : d[c];
        return '"' + csvSafe(v) + '"';
      }).join(","));
    });
    var name = (caseRef() || "case") + " - " + tabLabel(activeTab) + ".csv";
    U.download(name, rows.join("\r\n"), "text/csv");
  }


  /* ---------------- coverage matrix (RAG) ---------------- */
  var pendingNew = null;
  var TYPE_MAP = { person: "Person", organisation: "Company", vehicle: "Vehicle", address: "Postal Address", location: "Postal Address", email: "Email Address", phone: "Phone Number", account: "Bank Account" };
  function intelType(e) { return TYPE_MAP[e.type] || "Other"; }

  function coverageData() {
    var rows = (store.entities || []).slice();
    var cov = {}; // labelLower -> { system: true }
    R.list(store, "enquiry").forEach(function (r) {
      var d = r.data || {}; if (!d.system) return;
      [d.subject, d.entity].forEach(function (lab) {
        if (!lab) return; var k = String(lab).toLowerCase();
        (cov[k] = cov[k] || {})[d.system] = true;
      });
    });
    var colset = {};
    rows.forEach(function (e) { (V.CORE_CHECKS_BY_TYPE[intelType(e)] || []).forEach(function (sy) { colset[sy] = 1; }); });
    R.list(store, "enquiry").forEach(function (r) { if (r.data && r.data.system) colset[r.data.system] = 1; });
    var cols = V.SYSTEMS.filter(function (sy) { return colset[sy]; });
    return { rows: rows, cols: cols, cov: cov };
  }
  function rowCoverage(e, cov) { return cov[String(e.label).toLowerCase()] || {}; }
  function coreStat(e, lit) {
    var core = V.CORE_CHECKS_BY_TYPE[intelType(e)] || [];
    var done = core.filter(function (sy) { return lit[sy]; }).length;
    return { done: done, total: core.length, core: core };
  }
  function ragColour(done, total) {
    if (!total) return "#5a5a55";
    if (done === 0) return "#d86e6e";
    if (done < total) return "#d8a16e";
    return "#79c98f";
  }

  function coverageView() {
    var box = document.createElement("div");
    var data = coverageData();
    if (!data.rows.length) {
      box.innerHTML = '<div class="hint" style="padding:20px;text-align:center;color:#84837b">No entities on the chart yet. Add subjects/selectors, then the coverage board fills in.</div>';
      return box;
    }
    var head = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">' +
      '<span style="' + LB + '">Coverage — core checks lit from the Enquiry Log</span>' +
      '<div style="flex:1"></div>' +
      '<button class="btn" id="cov-export">Export CSV</button></div>';
    var legend = '<div style="' + LB + ';margin-top:10px">Legend: ring = core check for this type · filled = done · ' +
      '<span style="color:#79c98f">green</span> all core done · <span style="color:#d8a16e">amber</span> partial · <span style="color:#d86e6e">red</span> none · click an empty core cell to log it</div>';

    var th = '<th style="text-align:left;padding:5px 7px;border-bottom:1px solid var(--line,#2a2a27);color:#84837b;font-weight:600;position:sticky;left:0;background:var(--panel,var(--bg))">Selector</th>' +
      '<th style="padding:5px 7px;border-bottom:1px solid var(--line,#2a2a27);color:#84837b;font-weight:600">Core</th>' +
      data.cols.map(function (sy) { return '<th style="padding:5px 4px;border-bottom:1px solid var(--line,#2a2a27);color:#84837b;font-weight:600;font-size:10px;white-space:nowrap">' + esc(sy) + "</th>"; }).join("");
    var body = data.rows.map(function (e) {
      var lit = rowCoverage(e, data.cov);
      var st = coreStat(e, lit);
      var coreSet = {}; st.core.forEach(function (sy) { coreSet[sy] = 1; });
      var cells = data.cols.map(function (sy) {
        var isCore = !!coreSet[sy], isLit = !!lit[sy];
        var bg = isLit ? "#79c98f" : "transparent";
        var ring = isCore ? "box-shadow:inset 0 0 0 2px #d8a16e;" : "";
        var dot = '<span style="display:inline-block;width:14px;height:14px;border-radius:var(--radius);background:' + bg + ';' + ring + '"></span>';
        var clickable = (isCore && !isLit) ? ' class="cov-cell" data-ent="' + U.escAttr(e.label) + '" data-sys="' + U.escAttr(sy) + '" style="cursor:pointer;text-align:center;padding:4px;border-bottom:1px solid var(--line)" title="Log ' + U.escAttr(sy) + ' on ' + U.escAttr(e.label) + '"' : ' style="text-align:center;padding:4px;border-bottom:1px solid var(--line)"';
        return "<td" + clickable + ">" + dot + "</td>";
      }).join("");
      var rag = ragColour(st.done, st.total);
      var typeLbl = intelType(e);
      return '<tr><td style="padding:4px 7px;border-bottom:1px solid var(--line);position:sticky;left:0;background:var(--panel,var(--bg));white-space:nowrap">' +
          esc(e.label) + ' <span style="color:var(--faint);font-size:10px">' + esc(typeLbl) + "</span></td>" +
          '<td style="padding:4px 7px;border-bottom:1px solid var(--line);text-align:center"><span style="display:inline-block;min-width:34px;padding:1px 6px;border-radius:var(--radius);background:' + rag + ';color:var(--bg);font-weight:600">' + st.done + "/" + st.total + "</span></td>" +
          cells + "</tr>";
    }).join("");

    box.innerHTML = head +
      '<div style="overflow:auto;max-height:62vh"><table style="border-collapse:collapse;font:12px var(--mono,Consolas,monospace)"><tr>' + th + "</tr>" + body + "</table></div>" + legend;

    Array.prototype.forEach.call(box.querySelectorAll(".cov-cell"), function (c) {
      c.addEventListener("click", function () {
        pendingNew = { subject: c.getAttribute("data-ent"), entity: c.getAttribute("data-ent"), system: c.getAttribute("data-sys") };
        activeTab = "enquiry"; editingId = "new"; render();
      });
    });
    var ce = box.querySelector("#cov-export");
    if (ce) ce.addEventListener("click", function () { coverageCSV(data); });
    return box;
  }

  function coverageCSV(data) {
    data = data || coverageData();
    var cols = ["Selector", "Type", "CoreDone", "CoreTotal"].concat(data.cols);
    var rows = [cols.map(function (c) { return '"' + csvSafe(c) + '"'; }).join(",")];
    data.rows.forEach(function (e) {
      var lit = rowCoverage(e, data.cov); var st = coreStat(e, lit);
      var line = ['"' + csvSafe(e.label) + '"', '"' + csvSafe(intelType(e)) + '"', st.done, st.total]
        .concat(data.cols.map(function (sy) { return lit[sy] ? 1 : 0; }));
      rows.push(line.join(","));
    });
    U.download((caseRef() || "case") + " - Coverage.csv", rows.join("\r\n"), "text/csv");
  }


  /* ---------------- shared-folder sync bar ---------------- */
  var lockInfo = null; // {ok:false, heldBy, since} when current edit is locked by another

  function openForEdit(id) {
    var Sync = window.CRCaseSync;
    var rec = R.get(store, activeTab, id);
    if (Sync && Sync.isConnected() && rec) {
      Sync.acquireLock(rec).then(function (r) { lockInfo = r && r.ok ? null : r; editingId = id; render(); });
    } else { lockInfo = null; editingId = id; render(); }
  }

  function syncBar() {
    var Sync = window.CRCaseSync;
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:7px 10px;border:1px solid var(--line,#2a2a27);border-radius:var(--radius);flex-wrap:wrap;background:var(--bg)";
    var connected = !!(Sync && Sync.isConnected());
    var fsOk = window.CRFs && window.CRFs.supported();
    bar.innerHTML =
      '<span style="' + LB + '">Shared folder</span>' +
      '<span style="font:11px var(--mono,Consolas,monospace);color:' + (connected ? "#79c98f" : "var(--dim)") + '">' +
        (connected ? esc(Sync.folder()) : "not connected") + "</span>" +
      '<div style="flex:1"></div>' +
      (connected
        ? '<button class="btn" id="sync-save">Save to folder</button><button class="btn" id="sync-refresh">Refresh</button><button class="btn" id="sync-act">Activity</button>'
        : '<button class="btn" id="sync-connect"' + (fsOk ? "" : ' disabled title="This browser blocks folder access — use Case ▸ Save/Open JSON instead"') + ">Connect folder…</button>");

    var connectBtn = bar.querySelector("#sync-connect");
    if (connectBtn) connectBtn.addEventListener("click", connectFolder);
    var saveBtn = bar.querySelector("#sync-save");
    if (saveBtn) saveBtn.addEventListener("click", function () {
      Sync.saveAll(store).then(function (n) { status("Saved " + n + " files to shared folder"); }, function (e) { status("Save failed: " + (e && e.message || e)); });
    });
    var refBtn = bar.querySelector("#sync-refresh");
    if (refBtn) refBtn.addEventListener("click", function () {
      if (!confirm("Reload the case from the shared folder? Unsaved local record edits will be replaced.")) return;
      Sync.loadAll(store).then(function () { editingId = null; render(); status("Refreshed from shared folder"); }, function (e) { status("Refresh failed: " + (e && e.message || e)); });
    });
    var actBtn = bar.querySelector("#sync-act");
    if (actBtn) actBtn.addEventListener("click", function () {
      Sync.activity(40).then(function (rows) {
        var txt = rows.slice().reverse().map(function (a) { return (a.ts || "").slice(0, 19).replace("T", " ") + "  " + (a.who || "?") + "  " + a.action + "  " + (a.ref || "") + " " + (a.detail || ""); }).join("\n") || "No activity yet.";
        alert("Shared-folder activity (most recent first):\n\n" + txt);
      });
    });
    return bar;
  }

  function connectFolder() {
    var Sync = window.CRCaseSync, Fs = window.CRFs;
    if (!Sync || !Fs || !Fs.supported()) { alert("Folder access is not available in this browser. Use Case ▸ Save/Open JSON to share the case file instead."); return; }
    Fs.pickFolder().then(function (h) {
      Sync.setBackend(h, Fs, h && h.name);
      return Fs.readAllJSON(h);
    }).then(function (files) {
      var hasCase = Object.keys(files).some(function (k) { return k === "case.json" || k.indexOf("/") !== -1; });
      if (hasCase) {
        if (confirm("This folder already holds a case. Load it? (replaces what is open)\nCancel keeps your current case and you can Save to folder.")) {
          return Sync.loadAll(store).then(function () { status("Loaded case from shared folder"); });
        }
        status("Connected. Use Save to folder to push your case.");
      } else {
        return Sync.saveAll(store).then(function (n) { status("Seeded shared folder with " + n + " files"); });
      }
    }).then(function () { editingId = null; render(); }, function (e) {
      if (e && e.name === "AbortError") return; // user cancelled the picker
      alert("Could not connect folder: " + (e && e.message || e));
    });
  }
  function status(m) { if (window.CRApp && window.CRApp.status) window.CRApp.status(m); }

  window.CRLogPanel = { init: init, open: open };
})();
