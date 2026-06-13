/* CHART ROOM — corpus_review.js
 * Manual-review assistant for EVERYTHING in test_ingest:
 *   A) CASE-KEY cross-reference: each canonical identifier must surface as an
 *      entity in every specimen the key says it appears in.
 *   B) Uncovered-signal scan: identifier-shaped strings in the raw text that
 *      NO entity span claimed — the "what got missed" report. Runs over
 *      specimens AND baines_logs.
 *
 *   node tests/corpus_review.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const base = path.join(__dirname, "..");
const FileRead = require(path.join(base, "js/core/fileread.js"));
const X = require(path.join(base, "js/core/extract.js"));

function fileLike(p) {
  const b = fs.readFileSync(p);
  return {
    name: path.basename(p), size: b.length,
    async text() { return b.toString("utf8"); },
    async arrayBuffer() { return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
  };
}

/* ---- A) CASE-KEY matrix: identifier (regex over entity labels+values) per doc ---- */
const KEY = {
  cole:      { re: /darren.*cole|cole.*darren/i, name: "Darren COLE" },
  p118:      { re: /447700900118/, name: "07700 900118" },
  p342:      { re: /447700900342/, name: "07700 900342" },
  imei:      { re: /359872041256683/, name: "IMEI …683" },
  acct1847:  { re: /30021847|ending 1847|\*{2,}1847/i, name: "a/c 30021847 (incl masked)" },
  northgate: { re: /northgate/i, name: "Northgate Logistics" },
  cono:      { re: /11428876/, name: "Co. No. 11428876" },
  nino:      { re: /JT\s?60\s?12\s?04\s?C/i, name: "NINO JT601204C" },
  ld18:      { re: /LD18\s?KPN/i, name: "LD18 KPN" },
  vk69:      { re: /VK69\s?RNZ/i, name: "VK69 RNZ" },
  foster:    { re: /foster/i, name: "Lee FOSTER" },
  ansari:    { re: /ansari/i, name: "Nadia ANSARI" },
  dragomir:  { re: /dragomir/i, name: "Sofia DRAGOMIR" },
  pnr:       { re: /K7T2QL/i, name: "PNR K7T2QL" },
  spain:     { re: /marbella|malaga|m[aá]laga/i, name: "Marbella/Málaga" }
};
// CASE-KEY matrix: which keys must appear in which specimen (by file prefix)
const MATRIX = {
  "01": ["cole","p118","p342","imei","northgate","cono","ld18","vk69","foster","ansari","dragomir","pnr","spain"],
  "02": ["cole","p118","acct1847","northgate","cono","nino","ansari","spain"],
  "03": ["cole","p118","p342","northgate","nino","ld18","vk69","foster"],
  "04": ["cole","p118","acct1847","northgate","ansari"],
  "05": ["cole","p118","p342","northgate","cono","nino","ld18","vk69","foster","ansari"],
  "06": ["cole","p118","northgate","ld18","ansari","dragomir","pnr","spain"],
  "07": ["cole","p118","p342","imei","northgate","nino","ld18","vk69","foster","ansari"],
  "08": ["cole","p118","p342","imei","acct1847","northgate"],
  "09": ["cole","northgate","cono","nino","ansari"],
  "10": ["cole","p118","acct1847","foster","dragomir","pnr","spain"]
};

/* ---- B) uncovered-signal patterns (broad, independent of the extractor) ---- */
const SIGNALS = [
  { name: "phone",   re: /\b(?:\+44\s?7\d{3}|07\d{3})[\s-]?\d{3}[\s-]?\d{3}\b/g },
  { name: "email",   re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: "vrm",     re: /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/g },
  { name: "nino",    re: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/g },
  { name: "pncid",   re: /\b(?:19|20)\d{2}\/\d{6,7}[A-Z]\b/g },
  { name: "postcode",re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g },
  { name: "sortcode+acct", re: /\b\d{2}-\d{2}-\d{2}\b[^\n]{0,20}\b\d{7,8}\b/g },
  { name: "co-number", re: /\bCo\.?\s*No\.?\s*\d{8}\b/gi, digitsOnly: true },
  { name: "pnr",     re: /\b(?:PNRs?|Locators?|locators?|Booking\s+refs?)[:\s]+([A-Z][A-Z0-9]{5})\b/g, digitsOnly: false },
  { name: "imei",    re: /\bIMEI[\s.:]*\d{15}\b/gi },
  { name: "utr",     re: /\bUTR[\s.:]*\d{10}\b/gi },
  { name: "org-ltd", re: /\b[A-Z][A-Za-z&'’ -]{2,40}\s(?:Ltd|LTD|Limited|PLC|Plc|LLP)\b/g },
  { name: "caps-name", re: /\b[A-Z][A-Z'’-]{2,},\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g },
  { name: "grading", re: /\[\s*[1-3]\s*[A-E]\s*[PC]\s*\]/g },
  { name: "xx-code", re: /\bXX-[A-Z]{2,6}\b/g }
];

(async function main() {
  const dirs = ["specimens", "baines_logs"];
  let totalUncovered = 0, matrixMisses = 0;

  for (const d of dirs) {
    const dir = path.join(base, "test_ingest", d);
    const files = fs.readdirSync(dir).filter(f => /\.(docx|pdf|txt)$/i.test(f)).sort();
    for (const f of files) {
      const r = await FileRead.readFile(fileLike(path.join(dir, f)));
      if (r.kind !== "text" || !r.text) { console.log("\n## " + f + " — UNREADABLE: " + (r.reason || r.kind)); continue; }
      const text = r.text;
      const out = X.extract(text, { dateFormat: "DMY" });

      // squash everything the extractor knows into one searchable string + spans
      const claimed = [];
      out.entities.forEach(e => e.spans.forEach(sp => claimed.push(sp)));
      const entBlob = out.entities.map(e =>
        e.type + " " + e.label + " " + e.value + " " + JSON.stringify(e.attrs)).join("\n") +
        "\n" + (out.tags || []).join(" ") +
        (out.grading ? "\n[" + out.grading.source + " " + out.grading.assessment + " " + out.grading.handling + "]" : "");

      const lines = [];

      // A) matrix check (specimens only)
      const prefix = f.slice(0, 2);
      if (d === "specimens" && MATRIX[prefix]) {
        for (const k of MATRIX[prefix]) {
          if (!KEY[k].re.test(entBlob)) {
            lines.push("  KEY MISS    " + KEY[k].name);
            matrixMisses++;
          }
        }
      }

      // B) uncovered signals
      for (const sig of SIGNALS) {
        sig.re.lastIndex = 0;
        let m;
        while ((m = sig.re.exec(text))) {
          const s = m.index, e = m.index + m[0].length;
          const covered = claimed.some(sp => s < sp[1] && e > sp[0]);
          // also accept "represented" — the value appears in some entity/attr
          const norm = sig.digitsOnly ? m[0].replace(/\D/g, "") : m[0].replace(/\s+/g, "");
          const represented = covered ||
            entBlob.replace(/\s+/g, "").toLowerCase().includes(norm.toLowerCase()) ||
            (sig.name === "phone" && entBlob.includes("+44" + norm.replace(/\D/g, "").replace(/^0/, "")));
          if (!represented) {
            lines.push("  UNCOVERED   " + sig.name.padEnd(10) + " " + m[0].replace(/\s+/g, " ").slice(0, 60));
            totalUncovered++;
          }
        }
      }

      console.log("\n## " + d + "/" + f + "  (" + out.entities.length + " ents, " + out.relationships.length + " rels)");
      if (lines.length) console.log(lines.join("\n"));
      else console.log("  clean — nothing missed by the scan");
    }
  }
  console.log("\n==== TOTAL: " + matrixMisses + " key misses · " + totalUncovered + " uncovered signals ====");
})().catch(e => { console.error("REVIEW ERROR:", e); process.exit(2); });
