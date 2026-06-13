const { JSDOM } = require("jsdom");
const fs = require("fs");
const base = require('path').join(__dirname,'..');
const dom = new JSDOM(`<!DOCTYPE html><body>
  <div id="drop-overlay" aria-hidden="true"><div class="drop-card"></div></div>
  <span id="status-msg"></span><input id="case-name">
</body>`, { runScripts: "outside-only", url: "http://localhost/" });
const { window } = dom; const document = window.document;
// File polyfill carrying bytes
class FakeFile {
  constructor(buf, name){ this._buf=buf; this.name=name; }
  async text(){ return this._buf.toString("utf8"); }
  async arrayBuffer(){ return this._buf.buffer.slice(this._buf.byteOffset, this._buf.byteOffset+this._buf.byteLength); }
}
window.File = FakeFile;
// globals used by fileread.js (present in jsdom's realm? ensure)
window.DecompressionStream = DecompressionStream; window.Blob = Blob; window.Response = Response; window.TextDecoder = TextDecoder;
// CRUtil stub
window.CRUtil = { el: id => document.getElementById(id) };
// capture review + status
let reviewedText = null, statusMsg = "";
window.CRReview = { open: t => { reviewedText = t; } };
window.CRImporter = { importFile: ()=>{} };
window.CRApp = { status: m => { statusMsg = m; }, afterImport: ()=>{} };
// load the REAL modules into the window realm
window.eval(fs.readFileSync(base+"/js/core/fileread.js","utf8"));
window.eval(fs.readFileSync(base+"/js/ui/dragdrop.js","utf8"));
window.CRDragDrop.init({ entities: [] });

// build a synthetic file drop (docx + pdf + txt)
const sdir = base+"/test_ingest/specimens/";
const files = [
  new FakeFile(fs.readFileSync(sdir+"01_CM_Atlas_3x5x2_Intel_Report.docx"), "01_CM_Atlas_3x5x2_Intel_Report.docx"),
  new FakeFile(fs.readFileSync(sdir+"04_Experian_Report.pdf"), "04_Experian_Report.pdf"),
  new FakeFile(fs.readFileSync(sdir+"03_PNC_Print.txt"), "03_PNC_Print.txt"),
];
function fire(type, withFiles){
  const ev = new window.Event(type, { bubbles:true, cancelable:true });
  ev.dataTransfer = { types:["Files"], files: withFiles?files:[], dropEffect:"" };
  window.dispatchEvent(ev);
  return ev;
}
let P=0,Fl=0; const T=(n,c)=>{ (c?P++:Fl++); console.log((c?"PASS":"FAIL")+": "+n); };

fire("dragenter", false);
T("overlay shows on dragenter (Files)", document.getElementById("drop-overlay").classList.contains("show"));
fire("dragleave", false);
T("overlay hides on dragleave", !document.getElementById("drop-overlay").classList.contains("show"));
fire("drop", true);
setTimeout(()=>{
  T("overlay hidden after drop", !document.getElementById("drop-overlay").classList.contains("show"));
  T("CRReview.open received combined text", !!reviewedText);
  T("combined text spans all 3 files", reviewedText && reviewedText.includes("01_CM_Atlas") && reviewedText.includes("04_Experian") && reviewedText.includes("03_PNC_Print"));
  T("docx content present", reviewedText && reviewedText.includes("CRIME MANAGEMENT"));
  T("pdf content present", reviewedText && reviewedText.includes("Experian"));
  T("txt content present", reviewedText && reviewedText.includes("PNC NOMINAL PRINT"));
  T("status reported 3 files", /3 file/.test(statusMsg));
  console.log("\n"+(P)+" passed, "+Fl+" failed");
  process.exit(Fl?1:0);
}, 600);
