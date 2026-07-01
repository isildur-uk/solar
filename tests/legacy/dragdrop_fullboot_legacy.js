/* Full-app boot + drag-drop integration test (jsdom). Needs: npm i jsdom.
 * Loads every real script in index.html order (native libs stubbed), boots the
 * app like the browser, fires a real file drop, asserts overlay / file-nav
 * prevention / review modal / hero dismissal / status.
 * Run from chart_room/ with NODE_PATH=./node_modules.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const base = require("path").join(__dirname, "..", "..");
const html = fs.readFileSync(base + "/index.html", "utf8");
const bodyHtml = html.slice(html.indexOf("<body>"), html.indexOf("</body>") + 7);
const dom = new JSDOM("<!DOCTYPE html><html><head></head>" + bodyHtml + "</html>",
  { runScripts: "outside-only", pretendToBeVisual: true, url: "http://127.0.0.1:48417/" });
const window = dom.window, document = window.document, errors = [];
window.addEventListener("error", e => errors.push("onerror: " + e.message));
window.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
window.HTMLCanvasElement.prototype.getContext = () => null;
window.requestAnimationFrame = cb => setTimeout(cb, 0); window.scrollTo = () => {};
window.DecompressionStream = DecompressionStream; window.Blob = Blob; window.Response = Response; window.TextDecoder = TextDecoder; window.File = File;
function DataSet(){ const m=new Map(); return { add(x){(Array.isArray(x)?x:[x]).forEach(i=>m.set(i.id,i));}, update(x){(Array.isArray(x)?x:[x]).forEach(i=>m.set(i.id,i));}, remove(id){(Array.isArray(id)?id:[id]).forEach(i=>m.delete(i&&i.id?i.id:i));}, get(id){return id?m.get(id):[...m.values()];}, getIds(){return[...m.keys()];}, forEach(f){m.forEach(f);}, clear(){m.clear();}, on(){}, off(){}, length:0 }; }
window.vis = { DataSet: DataSet, Network: function(){ return new Proxy({}, { get:(t,p)=>(t[p]||(t[p]=()=>{})) }); } };
function Lobj(){ return new Proxy(function(){}, { get:(t,p)=>(t[p]||(t[p]=Lobj())), apply:()=>Lobj() }); } window.L = Lobj();
window.Papa = { parse:(f,opt)=>{ opt&&opt.complete&&opt.complete({data:[],meta:{fields:[]}}); } };
const order = ["js/core/match.js","js/core/cm-vocab.js","js/core/cm-standards.js","js/core/format.js","js/core/docxzip.js","js/core/geo.js","js/core/lang.js","js/core/extract.js","js/core/model.js","js/core/fileread.js","js/ui/util.js","js/ui/icons.js","js/ui/graph.js","js/ui/mappane.js","js/ui/timeline.js","js/ui/review.js","js/ui/importer.js","js/ui/dragdrop.js","js/ui/inspector.js","js/ui/profiles.js","js/ui/intelexport.js","js/ui/app.js","js/ui/solar.js","js/ui/hero.js"];
for (const s of order) { try { window.eval(fs.readFileSync(base + "/" + s, "utf8")); } catch (e) { errors.push("load " + s + ": " + e.message); } }
try { window.CRApp && window.CRApp.boot && window.CRApp.boot(); } catch (e) { errors.push("boot: " + e.message); }
setTimeout(() => {
  let P = 0, F = 0; const T = (n, c) => { (c ? P++ : F++); console.log((c ? "PASS" : "FAIL") + ": " + n); };
  T("0 boot errors", errors.length === 0); errors.slice(0,5).forEach(e => console.log("   - " + e));
  const hero = document.getElementById("hero-cover");
  T("hero cover shown on empty case", !!hero && !hero.classList.contains("hidden"));
  const sdir = base + "/test_ingest/specimens/";
  const mk = p => { const b = fs.readFileSync(p); return { name: p.split("/").pop(), size: b.length, async text(){ return b.toString("utf8"); }, async arrayBuffer(){ return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } }; };
  const files = [mk(sdir+"01_CM_Atlas_3x5x2_Intel_Report.docx"), mk(sdir+"04_Experian_Report.pdf"), mk(sdir+"03_PNC_Print.txt")];
  const tgt = document.getElementById("hero-stars") || hero || document.body;
  const fire = type => { const ev = new window.Event(type, { bubbles:true, cancelable:true }); ev.dataTransfer = { types:["Files"], files, items: files.map(f=>({kind:"file",getAsFile:()=>f})), dropEffect:"" }; tgt.dispatchEvent(ev); return ev; };
  fire("dragenter"); T("overlay shows on dragenter", document.getElementById("drop-overlay").classList.contains("show"));
  T("dragover preventDefault (no file-nav)", fire("dragover").defaultPrevented);
  fire("drop");
  setTimeout(() => {
    const rv = document.getElementById("review-veil");
    T("review modal opened", rv.classList.contains("open"));
    T("review rendered content", rv.querySelectorAll("[data-ref], .rev-card, mark, label").length > 5);
    T("hero cover dismissed", hero.classList.contains("hidden") || hero.classList.contains("closing"));
    T("status reflects 3 files", /3 file/.test((document.getElementById("status-msg")||{}).textContent || ""));
    console.log("\n" + P + " passed, " + F + " failed");
    process.exit(F ? 1 : 0);
  }, 400);
}, 250);
