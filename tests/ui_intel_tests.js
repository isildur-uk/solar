const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const html = `<!DOCTYPE html><html><body>
<div id="class-banner">OFFICIAL</div>
<header id="topbar"><div id="brand"></div><input id="search"></header>
<div class="modal-veil" id="export-veil"><div class="modal">
  <button id="export-close"></button>
  <input id="exp-meta-officer"><input id="exp-meta-caseref"><input id="exp-meta-op">
  <button id="exp-logv1"></button><button id="exp-log2"></button><button id="exp-ir"></button>
  <button id="exp-i2"></button><button id="exp-anx"></button>
  <button id="exp-profile-short"></button><button id="exp-profile-long"></button><button id="exp-profile-html"></button>
</div></div>
<div id="inspector"></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/" });
const { window } = dom;
const errors = [];
window.addEventListener("error", e => errors.push(e.message));
window.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });

// capture downloads
const downloads = [];
const scripts = ["js/core/match.js","js/core/cm-vocab.js","js/core/cm-standards.js","js/core/format.js","js/core/geo.js","js/core/lang.js",
  "js/core/extract.js","js/core/model.js","js/core/docxzip.js",
  "js/ui/util.js","js/ui/profiles.js","js/ui/intelexport.js"];
for (const s of scripts) {
  try { window.eval(fs.readFileSync(path.join(root, s), "utf8")); }
  catch (e) { errors.push("load " + s + ": " + e.message); }
}
window.CRUtil.download = (name, text) => downloads.push({ name, text });
window.CRApp = { status(){}, getSelectedEntityId(){ return null; }, exportANX(){} };

let pass = 0, fail = 0;
const T = (n, c) => { c ? (pass++, console.log("PASS:", n)) : (fail++, console.log("FAIL:", n)); };

// ---- build a case ----
const store = new window.CRModel.CaseStore();
store.meta.officer = "44752"; store.meta.caseRef = "IR123456"; store.meta.operation = "OP EXAMPLE";
const p = store.addEntity({ type: "person", label: "Geoff BAINES", attrs: { dob: "2000-12-20", aka: "Gee", pnc: "95/11112R" } });
const ph = store.addEntity({ type: "phone", label: "+447686868686" });
const ad = store.addEntity({ type: "address", label: "C. Maestranza 20, Málaga", attrs: { postcode: "29016" } });
const vh = store.addEntity({ type: "vehicle", label: "VK21 ABC", attrs: { colour: "black", make: "BMW" } });
const org = store.addEntity({ type: "organisation", label: "ACME LIMITED", attrs: { companyNumber: "12345678" } });
store.addLink({ from: p.id, to: ph.id, type: "USES", confidence: "high", sentence: "BAINES uses 07686868686" });
store.addLink({ from: p.id, to: ad.id, type: "STAYS_AT", confidence: "med", sentence: "He will be staying at the hotel" });
store.addLink({ from: p.id, to: vh.id, type: "USES", confidence: "high" });
store.addLink({ from: p.id, to: org.id, type: "ASSOCIATE_OF", confidence: "med" });

T("provenance corrected shape", p.provenance.source === "2" && p.provenance.assessment === "C" && p.provenance.handling === "P");
T("legacy provenance migrates", (() => {
  const j = JSON.parse(JSON.stringify(store.toJSON()));   // deep copy — never mutate live state
  j.entities[0].provenance = { source: "B", intel: 2, handling: "P" };
  const s2 = new window.CRModel.CaseStore(); s2.fromJSON(j);
  const m = s2.entities[0].provenance; return m.source === "2" && m.assessment === "B";
})());
T("gradeCode defends against legacy shape", window.CRFormat.gradeCode({ source: "B", intel: 2, handling: "P" }) === "[2BP]");

// media
const med = store.addMedia(p.id, { name: "custody.jpg", dataUrl: "data:image/jpeg;base64,/9j/4AAQ" });
T("media added + auto face", med && p.media.length === 1 && p.media[0].face === true);

// profiles
window.CRProfiles.init(store);
const s = window.CRProfiles.collect(p.id);
T("collect gathers linked", s.phones.length === 1 && s.addresses.length === 1 && s.vehicles.length === 1 && s.orgs.length === 1);
const tk = window.CRProfiles.shortTokens(s);
T("token NAME_DOB", tk.NAME_DOB === "Geoff BAINES DOB 20/12/2000");
T("token SURNAME caps", tk.SURNAME === "BAINES");
T("token VRM list", /VRM VK21ABC/.test(tk.VEH_VRM_LIST));
T("token comm CM format (no +)", /07686868686 \(Mobile\)/.test(tk.COMM_IDS) && tk.COMM_IDS.indexOf("+0") === -1);
T("token PNC", tk.PNC === "95/11112R");

// real docx fill with these tokens
const buf = fs.readFileSync(path.join(root, "assets/profile_short.docx"));
const out = window.CRDocx.fill(new Uint8Array(buf), tk, null);
fs.writeFileSync("/tmp/jsdom_filled.docx", Buffer.from(out));
T("docx filled in jsdom env", out.length > 100000);

// intel exports
window.CRIntelExport.init(store);
window.CRIntelExport.exportLoggingToolV1();
window.CRIntelExport.exportIntelLog2();
window.CRIntelExport.exportIRDraft();
window.CRIntelExport.exportI2Pack();
T("7 files downloaded", downloads.length === 7);
const subjects = downloads.find(d => /Subjects/.test(d.name));
T("Subjects header exact", subjects && subjects.text.startsWith("Subject ID,Type,Display Name (used in Log dropdown),Full Name,DOB,Address,Mobile / Phone,VRM,NI Number,PNCID,Aliases,Notes"));
T("Subjects person row", subjects && /S1,Person,Geoff BAINES,Geoff BAINES,20\/12\/2000/.test(subjects.text));
T("Subjects phone CM format", subjects && /07686868686/.test(subjects.text) && !/\+44768/.test(subjects.text.split("\r\n")[1]));
const log = downloads.find(d => / Log\.csv$/.test(d.name));
T("Log rows carry grade [2CP]", log && /\[2CP\]/.test(log.text));
const enq = downloads.find(d => /EnquiryLog/.test(d.name));
T("Enquiry header matches Intel Log 2", enq && enq.text.startsWith("Reference,Linked Action,Date (dd/mm/yyyy),Officer,Subject to which Entity Relates,Source of Entity,Entity"));
const ir = downloads.find(d => /IR_DRAFT/.test(d.name));
T("IR draft has APP fields", ir && /Source evaluation: 2/.test(ir.text) && /Handling code: P/.test(ir.text) && /\.  \[2CP\]/.test(ir.text));
const i2e = downloads.find(d => /i2_entities/.test(d.name));
T("i2 entities use i2 type names", i2e && /Telephone/.test(i2e.text) && /Organization/.test(i2e.text));
const i2l = downloads.find(d => /i2_links/.test(d.name));
T("i2 link strengths", i2l && /Confirmed/.test(i2l.text) && /Unconfirmed/.test(i2l.text));

T("no js errors", errors.length === 0);
if (errors.length) errors.forEach(e => console.log("   ", e));
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
