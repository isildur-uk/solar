/* inbox.js — SOLAR deconfliction inbox + secure messaging (DEMO-SIMULATED).
 *
 * A self-contained analyst inbox for the Database surface. Two message kinds:
 *   - 'deconfliction' : a structured enquiry between operations that share an
 *                       entity / report / subject, so two teams don't trip over
 *                       each other (the real NCA deconfliction flow, in demo).
 *   - 'message'       : a plain secure enquiry to an operation team / report author.
 *
 * TRUST-CRITICAL. This is a demonstrator, NOT a real messaging system:
 *   - Nothing leaves the browser. "Delivery" is SIMULATED locally and written to
 *     an audit register (mirrors registry/core/access-log.js). We NEVER claim a
 *     real message was sent; every simulated reply is flagged simulated:true and
 *     rendered with a visible "simulated" affordance.
 *   - The analyst ALWAYS confirms before anything is "sent" — no auto-contact.
 *   - ALL counterparty / message / subject text is rendered via textContent or
 *     an escaped builder. We NEVER interpolate analyst/thread data into innerHTML.
 *
 * Persistence: localStorage key `solar_inbox_v1` (versioned), in-memory fallback
 * so it stays Node-loadable. Audit: `solar_inbox_audit_v1`.
 *
 * Public API (window.SolarInbox):
 *   open(view)        view ∈ 'list' | 'mine' | 'incoming' | 'compose' (default 'list')
 *   openThread(id)    open a specific thread
 *   compose(prefill)  open the composer, optionally pre-filled (see composeFor*)
 *   composeForOverlap({operation, author, grade, entity, ref, label})
 *   unreadCount()     number of unread incoming threads (for the Row-2 badge)
 *   list()/audit()    raw reads (tests / debugging)
 *
 * Emits a "solar-inbox" event whenever state changes so the badge stays in sync.
 * No dependency on the shell; the shell only calls open()/unreadCount().
 */
"use strict";
(function () {
  var KEY = "solar_inbox_v1";
  var AUDIT_KEY = "solar_inbox_audit_v1";
  var VERSION = 1;
  var mem = null, memAudit = [];

  /* ---- store (mirrors access-log.js: localStorage + in-memory fallback) ---- */
  function store() {
    try { return (typeof window !== "undefined" && window.localStorage) ? window.localStorage : null; }
    catch (e) { return null; }
  }
  function currentUser() {
    try { return (window.localStorage && localStorage.getItem("reg_user")) || "G5 Analyst"; }
    catch (e) { return "G5 Analyst"; }
  }
  function nowIso() { return new Date().toISOString(); }
  function uid(p) { return (p || "t") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7); }

  function loadState() {
    var s = store();
    if (!s) { return mem || seedState(); }
    var raw;
    try { raw = s.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) { var seeded = seedState(); saveState(seeded); return seeded; }
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.threads)) {
        var re = seedState(); saveState(re); return re;
      }
      return parsed;
    } catch (e) { var f = seedState(); saveState(f); return f; }
  }
  function saveState(state) {
    var s = store();
    if (!s) { mem = state; return; }
    try { s.setItem(KEY, JSON.stringify(state)); } catch (e) { mem = state; }
  }
  function loadAudit() {
    var s = store(); if (!s) { return memAudit.slice(); }
    try { return JSON.parse(s.getItem(AUDIT_KEY) || "[]"); } catch (e) { return []; }
  }
  function recordAudit(entry) {
    var row = {
      ts: nowIso(), actor: String(entry.actor || currentUser()), action: String(entry.action || ""),
      thread: String(entry.thread || ""), counterparty: String(entry.counterparty || ""),
      classification: "OFFICIAL", simulated: true
    };
    var s = store();
    if (!s) { memAudit.unshift(row); if (memAudit.length > 500) memAudit = memAudit.slice(0, 500); return row; }
    try {
      var arr = loadAudit(); arr.unshift(row); if (arr.length > 500) arr = arr.slice(0, 500);
      s.setItem(AUDIT_KEY, JSON.stringify(arr));
    } catch (e) { memAudit.unshift(row); }
    return row;
  }

  /* ---- seed data: realistic INCOMING threads on first load ---------------- */
  function agoIso(mins) { return new Date(Date.now() - mins * 60000).toISOString(); }
  function seedState() {
    return {
      version: VERSION,
      threads: [
        {
          id: "seed_deconf_1", kind: "deconfliction",
          subject: "Deconfliction — shared subject BANHAM, Curtis",
          counterparty: { operation: "Operation MERIDIAN", author: "DS L. Okafor", grade: "G3" },
          trigger: { type: "entity", ref: "ENT-4471", label: "BANHAM, Curtis (nominal)" },
          classification: "OFFICIAL", status: "unread", createdTs: agoIso(52),
          messages: [{
            from: "them", ts: agoIso(52), simulated: true,
            body: "Our operation holds active interest in BANHAM, Curtis (ENT-4471). We can see overlapping tasking against the same nominal. Can you confirm the nature of your interest so we can deconflict surveillance windows and avoid compromise?"
          }]
        },
        {
          id: "seed_enq_1", kind: "message",
          subject: "Enquiry — sourcing on report SOL-2291",
          counterparty: { operation: "Operation SANDPIPER", author: "Int Analyst R. Vance", grade: "G4" },
          trigger: { type: "report", ref: "SOL-2291", label: "Report SOL-2291" },
          classification: "OFFICIAL", status: "unread", createdTs: agoIso(133),
          messages: [{
            from: "them", ts: agoIso(133), simulated: true,
            body: "Reading your report SOL-2291 — is the vehicle sighting corroborated by a second source, or single-stranded? Trying to grade a linked entity our end before dissemination."
          }]
        },
        {
          id: "seed_deconf_2", kind: "deconfliction",
          subject: "Deconfliction — potential conflict on premises WESTGATE 14",
          counterparty: { operation: "Operation HALLMARK", author: "DC M. Pryce", grade: "G4" },
          trigger: { type: "entity", ref: "ENT-3120", label: "14 Westgate Rd (premises)" },
          classification: "OFFICIAL", status: "replied", createdTs: agoIso(1440),
          messages: [
            { from: "them", ts: agoIso(1440), simulated: true,
              body: "We're planning activity at 14 Westgate Rd (ENT-3120) next week. Do you hold live interest at this address? Flagging for potential conflict of operations." },
            { from: "me", ts: agoIso(1400), simulated: false,
              body: "Thanks for flagging. We hold historic interest only at that premises — no live tasking. No conflict our end; proceed. Suggest a coordination call if that changes." },
            { from: "them", ts: agoIso(1380), simulated: true,
              body: "Understood, appreciated. We'll note historic-only and proceed. Will re-deconflict if our timeline shifts." }
          ]
        }
      ]
    };
  }

  /* ---- state helpers ------------------------------------------------------ */
  function findThread(state, id) {
    for (var i = 0; i < state.threads.length; i++) { if (state.threads[i].id === id) { return state.threads[i]; } }
    return null;
  }
  function isIncoming(t) { return t.messages.length > 0 && t.messages[0].from === "them"; }
  function isMine(t) { return t.messages.length > 0 && t.messages[0].from === "me"; }
  function unreadCount() {
    var st = loadState(), n = 0;
    st.threads.forEach(function (t) { if (t.status === "unread") { n++; } });
    return n;
  }
  function emit() {
    try { window.dispatchEvent(new CustomEvent("solar-inbox")); } catch (e) { /* noop */ }
  }
  function markRead(id) {
    var st = loadState(), t = findThread(st, id);
    if (t && t.status === "unread") { t.status = "replied"; if (isIncoming(t) && t.messages.length === 1) { t.status = "awaiting"; } saveState(st); emit(); }
  }

  /* ---- simulated replies (varied by thread + turn index) ------------------ */
  var DECONF_REPLIES = [
    "Received and logged. We'll deconflict against that window our end and revert if there's a clash. Appreciate the early flag.",
    "Noted — no conflict visible from here at present. We'll hold this thread open and re-check before any activity.",
    "Thanks. Proposing a short coordination call to align tasking; in the meantime we'll avoid the overlapping window you've described.",
    "Understood. We'll treat the shared subject as jointly-sensitive and route any new intelligence through this thread before acting."
  ];
  var MSG_REPLIES = [
    "Thanks for coming back to us — that answers it. We'll grade accordingly and note the coordination on file.",
    "Appreciated. On that basis we'll hold dissemination until we've corroborated our end. Will keep you posted.",
    "Got it, that's clear. No further questions for now; we'll flag anything relevant back to you here.",
    "Understood — we'll treat it as single-stranded and caveat our product. Thanks for the quick turnaround."
  ];
  function pickReply(kind, idx) {
    var pool = kind === "deconfliction" ? DECONF_REPLIES : MSG_REPLIES;
    return pool[idx % pool.length];
  }

  /* ---- DOM helpers (all text goes through textContent) -------------------- */
  function elt(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = String(text); }
    return n;
  }
  function svgIco(kind) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    n.setAttribute("viewBox", "0 0 16 16"); n.setAttribute("aria-hidden", "true"); n.setAttribute("focusable", "false");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.3"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("d", kind === "back" ? "M9.5 3L5 8l4.5 5" : "M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z");
    n.appendChild(p); return n;
  }
  function fmtTime(iso) {
    try {
      var d = new Date(iso), diff = (Date.now() - d.getTime()) / 60000;
      if (diff < 1) { return "just now"; }
      if (diff < 60) { return Math.round(diff) + " min ago"; }
      if (diff < 1440) { return Math.round(diff / 60) + " h ago"; }
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }
  function statusLabel(t) {
    if (t.status === "unread") { return "Unread"; }
    if (t.status === "awaiting") { return "Awaiting reply"; }
    if (t.status === "sent") { return "Sent"; }
    if (t.status === "replied") { return "Replied"; }
    return t.status;
  }

  /* ---- overlay scaffold --------------------------------------------------- */
  var overlay = null, panel = null, bodyWrap = null, escHandler = null;
  function ensureOverlay() {
    if (overlay) { return; }
    overlay = elt("div", "sib-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Secure inbox");
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) { close(); } });

    panel = elt("div", "sib-panel");
    overlay.appendChild(panel);

    var head = elt("div", "sib-head");
    var title = elt("div", "sib-title");
    title.appendChild(elt("span", "sib-title-main", "Secure inbox"));
    var classif = elt("span", "sib-classif", "OFFICIAL");
    title.appendChild(classif);
    head.appendChild(title);
    var demoTag = elt("span", "sib-demo", "demo — simulated delivery");
    demoTag.title = "This is a demonstrator. No message leaves this device; replies are simulated.";
    head.appendChild(demoTag);
    var closeBtn = elt("button", "sib-close");
    closeBtn.type = "button"; closeBtn.setAttribute("aria-label", "Close inbox"); closeBtn.textContent = "×";
    closeBtn.addEventListener("click", close);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    bodyWrap = elt("div", "sib-body");
    panel.appendChild(bodyWrap);

    document.body.appendChild(overlay);
    escHandler = function (e) { if (e.key === "Escape") { close(); } };
    document.addEventListener("keydown", escHandler);
  }
  function close() {
    if (!overlay) { return; }
    if (escHandler) { document.removeEventListener("keydown", escHandler); escHandler = null; }
    overlay.parentNode && overlay.parentNode.removeChild(overlay);
    overlay = panel = bodyWrap = null;
    emit();
  }
  function clearBody() { bodyWrap.removeAttribute("data-thread"); while (bodyWrap.firstChild) { bodyWrap.removeChild(bodyWrap.firstChild); } }
  function sound(cue) { try { if (window.SolarSound) { window.SolarSound.play(cue); } } catch (e) { /* noop */ } }

  /* ---- view: LIST (with optional filter) ---------------------------------- */
  function renderList(filter) {
    clearBody();
    var st = loadState();

    var tabs = elt("div", "sib-tabs");
    [["all", "All"], ["incoming", "Incoming"], ["mine", "Mine"]].forEach(function (pair) {
      var b = elt("button", "sib-tab" + (filter === pair[0] ? " is-active" : ""), pair[1]);
      b.type = "button";
      b.addEventListener("click", function () { sound("select"); renderList(pair[0]); });
      tabs.appendChild(b);
    });
    var composeBtn = elt("button", "sib-compose-btn", "Compose");
    composeBtn.type = "button";
    composeBtn.addEventListener("click", function () { sound("open"); renderCompose(null); });
    tabs.appendChild(composeBtn);
    bodyWrap.appendChild(tabs);

    var rows = st.threads.filter(function (t) {
      if (filter === "incoming") { return isIncoming(t); }
      if (filter === "mine") { return isMine(t); }
      return true;
    });

    if (!rows.length) {
      var empty = elt("div", "sib-empty");
      empty.appendChild(elt("p", "sib-empty-h", "Nothing here yet"));
      empty.appendChild(elt("p", "sib-empty-p",
        filter === "mine" ? "Requests and messages you start will appear here."
          : filter === "incoming" ? "Incoming deconfliction requests and enquiries will appear here."
            : "Use Compose to start a deconfliction enquiry or a secure message."));
      bodyWrap.appendChild(empty);
      return;
    }

    var listEl = elt("ul", "sib-list");
    rows.forEach(function (t) {
      var li = elt("li", "sib-row" + (t.status === "unread" ? " is-unread" : ""));
      var btn = elt("button", "sib-row-btn");
      btn.type = "button";

      var top = elt("div", "sib-row-top");
      var kindTag = elt("span", "sib-kind sib-kind-" + t.kind, t.kind === "deconfliction" ? "Deconfliction" : "Message");
      top.appendChild(kindTag);
      var subj = elt("span", "sib-row-subj", t.subject);
      top.appendChild(subj);
      if (t.status === "unread") { top.appendChild(elt("span", "sib-dot", "")); }
      btn.appendChild(top);

      var meta = elt("div", "sib-row-meta");
      meta.appendChild(elt("span", "sib-cp", t.counterparty.operation + " · " + t.counterparty.author + " (" + t.counterparty.grade + ")"));
      var last = t.messages[t.messages.length - 1];
      meta.appendChild(elt("span", "sib-row-time", fmtTime(last.ts)));
      btn.appendChild(meta);

      var foot = elt("div", "sib-row-foot");
      foot.appendChild(elt("span", "sib-status sib-status-" + t.status, statusLabel(t)));
      if (t.trigger) { foot.appendChild(elt("span", "sib-trigger", t.trigger.label + " · " + t.trigger.ref)); }
      btn.appendChild(foot);

      btn.addEventListener("click", function () { sound("select"); renderThread(t.id); });
      li.appendChild(btn);
      listEl.appendChild(li);
    });
    bodyWrap.appendChild(listEl);
  }

  /* ---- view: THREAD ------------------------------------------------------- */
  function renderThread(id) {
    markRead(id);
    clearBody();
    bodyWrap.setAttribute("data-thread", id);
    var st = loadState(), t = findThread(st, id);
    if (!t) { renderList("all"); return; }

    var nav = elt("div", "sib-thread-nav");
    var back = elt("button", "sib-back", null);
    back.type = "button"; back.setAttribute("aria-label", "Back to inbox");
    back.appendChild(svgIco("back")); back.appendChild(elt("span", null, "Inbox"));
    back.addEventListener("click", function () { sound("select"); renderList(isIncoming(t) ? "incoming" : "all"); });
    nav.appendChild(back);
    bodyWrap.appendChild(nav);

    var head = elt("div", "sib-thread-head");
    head.appendChild(elt("h3", "sib-thread-subj", t.subject));
    var line = elt("div", "sib-thread-cp");
    line.appendChild(elt("span", "sib-kind sib-kind-" + t.kind, t.kind === "deconfliction" ? "Deconfliction" : "Message"));
    line.appendChild(elt("span", null, t.counterparty.operation + " · " + t.counterparty.author + " (" + t.counterparty.grade + ")"));
    line.appendChild(elt("span", "sib-classif sib-classif-sm", "OFFICIAL"));
    head.appendChild(line);
    if (t.trigger) {
      head.appendChild(elt("div", "sib-thread-trigger", "Trigger: " + t.trigger.label + " (" + t.trigger.ref + ")"));
    }
    bodyWrap.appendChild(head);

    var stream = elt("div", "sib-stream");
    t.messages.forEach(function (m) {
      var b = elt("div", "sib-msg sib-msg-" + (m.from === "me" ? "me" : "them"));
      var bhead = elt("div", "sib-msg-head");
      bhead.appendChild(elt("span", "sib-msg-from", m.from === "me" ? currentUser() : (t.counterparty.author + " · " + t.counterparty.operation)));
      bhead.appendChild(elt("span", "sib-msg-time", fmtTime(m.ts)));
      b.appendChild(bhead);
      b.appendChild(elt("div", "sib-msg-body", m.body));   // textContent — XSS-safe
      if (m.simulated) {
        var sim = elt("span", "sib-sim", "simulated");
        sim.title = "Demonstrator: this reply was generated locally, not received from a real sender.";
        b.appendChild(sim);
      }
      stream.appendChild(b);
    });
    bodyWrap.appendChild(stream);

    // reply box
    var replyWrap = elt("div", "sib-reply");
    var ta = elt("textarea", "sib-reply-ta");
    ta.setAttribute("placeholder", "Write a reply… (OFFICIAL)");
    ta.setAttribute("aria-label", "Reply message");
    replyWrap.appendChild(ta);
    var actions = elt("div", "sib-reply-actions");
    actions.appendChild(elt("span", "sib-reply-note", "You'll confirm before this is sent. Delivery is simulated."));
    var sendBtn = elt("button", "sib-btn sib-btn-primary", "Send reply");
    sendBtn.type = "button";
    sendBtn.addEventListener("click", function () {
      var body = ta.value.trim();
      if (!body) { ta.focus(); return; }
      confirmSend(t, body, false, function () { renderThread(id); });
    });
    actions.appendChild(sendBtn);
    replyWrap.appendChild(actions);
    bodyWrap.appendChild(replyWrap);

    stream.scrollTop = stream.scrollHeight;
  }

  /* ---- confirm-then-send (analyst ALWAYS confirms) ------------------------ */
  function confirmSend(thread, body, isNew, after) {
    var cp = thread.counterparty;
    var msg = "Send this " + (thread.kind === "deconfliction" ? "deconfliction enquiry" : "secure message") +
      " to " + cp.author + " (" + cp.operation + ")?\n\n" +
      "Classification: OFFICIAL\n" +
      "Delivery is SIMULATED (demonstrator — nothing leaves this device).";
    if (!window.confirm(msg)) { return false; }

    var st = loadState(), t = findThread(st, thread.id) || thread;
    if (isNew && !findThread(st, thread.id)) { st.threads.unshift(t); }
    t.messages.push({ from: "me", ts: nowIso(), body: body, simulated: false });
    t.status = "awaiting";
    saveState(st); emit();
    sound("success");
    recordAudit({ action: isNew ? "compose-send" : "reply-send", thread: t.id, counterparty: cp.operation + " · " + cp.author });

    // simulated reply arrives shortly (or on next open, whichever first)
    scheduleReply(t.id, t.messages.length);
    if (after) { after(); }
    return true;
  }

  var replyTimers = {};
  function reduced() {
    try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }
  function scheduleReply(id, turnIdx) {
    if (replyTimers[id]) { clearTimeout(replyTimers[id]); }
    var delay = reduced() ? 900 : 2600;   // demo-plausible latency; short under reduced-motion
    replyTimers[id] = setTimeout(function () {
      delete replyTimers[id];
      var st = loadState(), t = findThread(st, id);
      if (!t || t.status !== "awaiting") { return; }
      t.messages.push({ from: "them", ts: nowIso(), body: pickReply(t.kind, turnIdx), simulated: true });
      t.status = "replied";
      saveState(st); emit();
      recordAudit({ action: "reply-received (simulated)", thread: t.id, counterparty: t.counterparty.operation + " · " + t.counterparty.author });
      // refresh if this thread is on screen
      if (overlay && bodyWrap && bodyWrap.querySelector(".sib-stream")) {
        var open = bodyWrap.getAttribute("data-thread");
        if (open === id) { renderThread(id); }
      }
      sound("notify");
    }, delay);
  }

  /* ---- view: COMPOSE ------------------------------------------------------ */
  function renderCompose(prefill) {
    clearBody();
    prefill = prefill || {};

    var nav = elt("div", "sib-thread-nav");
    var back = elt("button", "sib-back", null);
    back.type = "button"; back.setAttribute("aria-label", "Back to inbox");
    back.appendChild(svgIco("back")); back.appendChild(elt("span", null, "Inbox"));
    back.addEventListener("click", function () { sound("select"); renderList("all"); });
    nav.appendChild(back);
    bodyWrap.appendChild(nav);

    var form = elt("div", "sib-compose");
    form.appendChild(elt("h3", "sib-compose-h", "New secure enquiry"));
    form.appendChild(elt("p", "sib-compose-sub", "Contact an operation team or report author. All traffic is OFFICIAL and simulated in this demonstrator."));

    // kind selector
    var kindRow = elt("div", "sib-field");
    kindRow.appendChild(elt("label", "sib-label", "Type"));
    var kindSel = elt("select", "sib-input");
    [["deconfliction", "Deconfliction enquiry"], ["message", "Plain secure message"]].forEach(function (o) {
      var opt = elt("option", null, o[1]); opt.value = o[0]; kindSel.appendChild(opt);
    });
    if (prefill.kind === "message") { kindSel.value = "message"; }
    kindRow.appendChild(kindSel);
    form.appendChild(kindRow);

    function field(label, value, placeholder) {
      var row = elt("div", "sib-field");
      row.appendChild(elt("label", "sib-label", label));
      var inp = elt("input", "sib-input");
      inp.type = "text"; inp.value = value || ""; if (placeholder) { inp.setAttribute("placeholder", placeholder); }
      row.appendChild(inp); form.appendChild(row); return inp;
    }
    var opInp = field("Operation", prefill.operation, "e.g. Operation MERIDIAN");
    var authInp = field("Author / team contact", prefill.author, "e.g. DS L. Okafor");
    var gradeInp = field("Grade", prefill.grade, "e.g. G3");
    var refInp = field("Shared entity / report ref", prefill.ref, "e.g. ENT-4471 or SOL-2291");
    var labelInp = field("Reference label", prefill.label, "e.g. BANHAM, Curtis (nominal)");

    // reason picker (deconfliction only)
    var reasonRow = elt("div", "sib-field sib-reason-row");
    reasonRow.appendChild(elt("label", "sib-label", "Reason"));
    var reasonSel = elt("select", "sib-input");
    ["Overlapping subject", "Shared entity", "Potential conflict of operations", "Request coordination"].forEach(function (r) {
      var opt = elt("option", null, r); opt.value = r; reasonSel.appendChild(opt);
    });
    if (prefill.reason) { reasonSel.value = prefill.reason; }
    reasonRow.appendChild(reasonSel);
    form.appendChild(reasonRow);

    // message body — pre-filled for deconfliction
    var bodyRow = elt("div", "sib-field");
    bodyRow.appendChild(elt("label", "sib-label", "Message (OFFICIAL)"));
    var ta = elt("textarea", "sib-input sib-textarea");
    ta.setAttribute("aria-label", "Message body");
    bodyRow.appendChild(ta);
    form.appendChild(bodyRow);

    function defaultBody() {
      if (kindSel.value === "deconfliction") {
        var ref = refInp.value.trim(), lbl = labelInp.value.trim();
        return "Deconfliction enquiry — reason: " + reasonSel.value + ".\n\n" +
          "We may hold overlapping interest in " + (lbl || "a shared subject") +
          (ref ? " (" + ref + ")" : "") + ". Can you confirm the nature and status of your interest so we can deconflict tasking and avoid compromise? Happy to coordinate windows or take a call.";
      }
      return "";
    }
    function syncBody() {
      // only auto-fill when the analyst hasn't typed their own text
      if (!ta.value.trim() || ta.getAttribute("data-auto") === "1") {
        ta.value = defaultBody(); ta.setAttribute("data-auto", "1");
      }
      reasonRow.style.display = kindSel.value === "deconfliction" ? "" : "none";
    }
    ta.addEventListener("input", function () { ta.setAttribute("data-auto", "0"); });
    kindSel.addEventListener("change", syncBody);
    reasonSel.addEventListener("change", function () { if (ta.getAttribute("data-auto") === "1") { syncBody(); } });
    refInp.addEventListener("input", function () { if (ta.getAttribute("data-auto") === "1") { syncBody(); } });
    labelInp.addEventListener("input", function () { if (ta.getAttribute("data-auto") === "1") { syncBody(); } });
    syncBody();
    if (prefill.body) { ta.value = prefill.body; ta.setAttribute("data-auto", "0"); }

    var actions = elt("div", "sib-reply-actions");
    actions.appendChild(elt("span", "sib-reply-note", "You'll confirm before this is sent. Delivery is simulated."));
    var sendBtn = elt("button", "sib-btn sib-btn-primary", "Send enquiry");
    sendBtn.type = "button";
    sendBtn.addEventListener("click", function () {
      var op = opInp.value.trim(), auth = authInp.value.trim();
      var bodyTxt = ta.value.trim();
      if (!op || !auth) { (op ? authInp : opInp).focus(); return; }
      if (!bodyTxt) { ta.focus(); return; }
      var kind = kindSel.value;
      var thread = {
        id: uid("t"), kind: kind,
        subject: (kind === "deconfliction" ? "Deconfliction — " + (reasonSel.value) : "Enquiry — " + op),
        counterparty: { operation: op, author: auth, grade: gradeInp.value.trim() || "—" },
        trigger: refInp.value.trim() ? { type: "ref", ref: refInp.value.trim(), label: labelInp.value.trim() || refInp.value.trim() } : null,
        classification: "OFFICIAL", status: "sent", createdTs: nowIso(), messages: []
      };
      confirmSend(thread, bodyTxt, true, function () { renderThread(thread.id); });
    });
    actions.appendChild(sendBtn);
    form.appendChild(actions);
    bodyWrap.appendChild(form);
    opInp.focus();
  }

  /* ---- public open() ------------------------------------------------------ */
  function open(view) {
    ensureOverlay();
    view = view || "list";
    if (view === "compose") { renderCompose(null); }
    else if (view === "mine") { renderList("mine"); }
    else if (view === "incoming") { renderList("incoming"); }
    else { renderList("all"); }
    // fire any pending simulated replies for threads currently awaiting
    loadState().threads.forEach(function (t) { if (t.status === "awaiting") { scheduleReply(t.id, t.messages.length); } });
  }
  function openThread(id) { ensureOverlay(); renderThread(id); }
  function composeForOverlap(o) {
    o = o || {};
    open("compose");
    renderCompose({
      kind: "deconfliction", operation: o.operation || "", author: o.author || "", grade: o.grade || "",
      ref: o.ref || o.entity || "", label: o.label || "", reason: o.reason || "Shared entity"
    });
  }

  window.SolarInbox = {
    open: open,
    openThread: openThread,
    compose: function (p) { ensureOverlay(); renderCompose(p || null); },
    composeForOverlap: composeForOverlap,
    unreadCount: unreadCount,
    list: function () { return loadState().threads.slice(); },
    audit: function () { return loadAudit(); }
  };
})();
