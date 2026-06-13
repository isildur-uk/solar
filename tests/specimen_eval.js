/* CHART ROOM — specimen_eval.js
 * Runs the prose extractor over every readable specimen in
 * test_ingest/specimens and prints a quality report + PASS/FAIL assertions.
 * The maker never grades its own work: these checks encode the
 * INGEST-MAPPING-SPEC + CASE-KEY expectations, independent of extract.js.
 *
 *   node tests/specimen_eval.js          — full report
 *   node tests/specimen_eval.js --brief  — assertions only
 */
"use strict";

const fs = require("fs");
const path = require("path");
const base = path.join(__dirname, "..");

const FileRead = require(path.join(base, "js/core/fileread.js"));
const X = require(path.join(base, "js/core/extract.js"));

const SPEC_DIR = path.join(base, "test_ingest", "specimens");
const BRIEF = process.argv.indexOf("--brief") !== -1;

function fileLike(p) {
  const b = fs.readFileSync(p);
  return {
    name: path.basename(p),
    size: b.length,
    async text() { return b.toString("utf8"); },
    async arrayBuffer() { return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
  };
}

/* The label-word junk detector: a "person" whose tokens are document
 * furniture is a mis-extraction. Independent re-implementation (do not
 * import FIELD_LABELS from extract.js — the verifier must not share the
 * maker's blind spots). */
const JUNK_WORDS = /^(Originating|Unit|Reference|Report|Type|Subject|Status|Route|Marking|Protective|Handling|Disclosure|Glossary|Submission|Fine|Amount|Balance|Account|Payment|Lender|Search|Print|Record|Field|Value|Best|Match|Current|Linked|Associated|Document|Page|Section|Total|Source|Officer|Requesting|Applicant|Authorising|Itinerary|Booking|Movements|Operator|Telephone|Mobile|Email|Address|Surname|Forename|Name|Contact|Conviction|Warning|Signal|Marker)$/i;

function isJunkPerson(label) {
  const toks = label.split(/\s+/);
  return toks.some(t => JUNK_WORDS.test(t));
}

const results = [];
const asserts = [];
function A(file, name, ok, detail) {
  asserts.push({ file, name, ok, detail: detail || "" });
}

(async function main() {
  const files = fs.readdirSync(SPEC_DIR)
    .filter(f => /\.(docx|pdf|txt)$/i.test(f))
    .sort();

  for (const f of files) {
    const p = path.join(SPEC_DIR, f);
    const r = await FileRead.readFile(fileLike(p));
    if (r.kind !== "text" || !r.text) {
      results.push({ file: f, error: r.reason || ("kind=" + r.kind) });
      continue;
    }
    const out = X.extract(r.text, { dateFormat: "DMY" });

    // ---- derived quality stats ----
    const byType = {};
    out.entities.forEach(e => { (byType[e.type] = byType[e.type] || []).push(e); });
    const persons = byType.person || [];
    const junkPersons = persons.filter(e => isJunkPerson(e.label));
    const relTypes = {};
    out.relationships.forEach(r2 => { relTypes[r2.type] = (relTypes[r2.type] || 0) + 1; });
    const connected = new Set();
    out.relationships.forEach(r2 => { connected.add(r2.sourceRef); connected.add(r2.targetRef); });
    const orphans = out.entities.filter(e => !connected.has(e.ref) && e.type !== "date");
    // phones that are really reference numbers (long all-digit strings with
    // no plausible UK/E.164 shape, or matching known ref digits)
    const badPhones = (byType.phone || []).filter(e =>
      /^(?:\+?44)?(?:20260|2026000|0337841|004812)/.test(String(e.value).replace(/\D/g, "")) ||
      /^(2026)/.test(String(e.value).replace(/^\+/, "")));

    const mappableAddrs = (byType.address || []).filter(e => typeof e.attrs.lat === "number");
    const mappableLocs = (byType.location || []).filter(e => typeof e.attrs.lat === "number");
    const unmappedPcAddrs = (byType.address || []).filter(e =>
      e.attrs.postcode && /^[A-Z]{1,2}\d/i.test(e.attrs.postcode) && typeof e.attrs.lat !== "number");

    const primaryByOrder = persons[0] || null;          // what review.js picks today
    const primaryExported = out.primary
      ? out.entities.find(e => e.ref === out.primary) : null;

    results.push({
      file: f,
      textLen: r.text.length,
      counts: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])),
      persons: persons.map(e => e.label + (e.attrs.dob ? " (dob " + e.attrs.dob + ")" : "") +
        (e.attrs.pnc ? " [pnc]" : "") + (e.attrs.nino ? " [nino]" : "") + (e.attrs.aka ? " aka:" + e.attrs.aka : "")),
      junkPersons: junkPersons.map(e => e.label),
      relTypes,
      rels: out.relationships.length,
      orphans: orphans.length,
      orphanSample: orphans.slice(0, 6).map(e => e.type + ":" + e.label),
      primaryByOrder: primaryByOrder ? primaryByOrder.label : "(none)",
      primaryExported: primaryExported ? primaryExported.label : "(not exported)",
      badPhones: badPhones.map(e => e.value),
      mappable: mappableAddrs.length + " addr + " + mappableLocs.length + " loc"
    });

    // ---- assertions (corpus ground truth: the COLE case) ----
    const hasCole = persons.some(e => /\bCOLE\b/i.test(e.label) && /Darren/i.test(e.label));
    A(f, "no junk persons", junkPersons.length === 0, junkPersons.map(e => e.label).join("; "));
    A(f, "no reference-numbers-as-phones", badPhones.length === 0, badPhones.join("; "));
    A(f, "UK-postcode addresses carry coords", unmappedPcAddrs.length === 0,
      unmappedPcAddrs.map(e => e.label).join("; "));
    if (/^04_/.test(f)) {
      A(f, "Experian addresses mappable", mappableAddrs.length >= 2,
        "mappable addresses: " + mappableAddrs.length);
    }

    if (/^01_/.test(f)) {
      A(f, "subject Darren COLE present", hasCole);
      A(f, "vehicles found", (byType.vehicle || []).length >= 2);
      A(f, "org Northgate found", (byType.organisation || []).some(e => /Northgate/i.test(e.label)));
    }
    if (/^02_/.test(f)) {
      A(f, "subject Darren COLE present", hasCole);
      A(f, "ANSARI present", persons.some(e => /ANSARI/i.test(e.label)));
      A(f, "sort-code account captured", (byType.account || []).some(e => /30021847|20-00-00/.test(e.label + e.value)));
    }
    if (/^03_/.test(f)) {
      A(f, "PNC nominal assembled", hasCole);
      A(f, "PNC ids attached", persons.some(e => /COLE/i.test(e.label) && (e.attrs.pnc || e.attrs.cro || e.attrs.nino)));
      A(f, "alias folded not new person", !persons.some(e => /COLLINS/i.test(e.label) && !/COLE/i.test(e.label)) ||
        persons.some(e => /COLE/i.test(e.label) && /COLLINS|Daz/i.test(e.attrs.aka || "")));
    }
    if (/^08_/.test(f)) {
      A(f, "subscriber assembled", hasCole);
      A(f, "subscriber linked to MSISDN", out.relationships.some(r2 => {
        const s = out.entities.find(e => e.ref === r2.sourceRef);
        const t = out.entities.find(e => e.ref === r2.targetRef);
        return s && t && s.type === "person" && /COLE/i.test(s.label) && t.type === "phone";
      }));
    }
    if (/^(04|05|07|09|10)_/.test(f)) {
      A(f, "subject present in PDF text", hasCole || persons.length > 0,
        "persons: " + persons.slice(0, 3).map(e => e.label).join("; "));
    }
    // the hub the review screen would pick must be the real subject
    if (persons.length) {
      A(f, "first-person hub is plausible subject", primaryByOrder && !isJunkPerson(primaryByOrder.label),
        "got: " + (primaryByOrder ? primaryByOrder.label : "none"));
    }
  }

  // ---- print ----
  if (!BRIEF) {
    for (const r of results) {
      console.log("\n=== " + r.file + " ===");
      if (r.error) { console.log("  UNREADABLE: " + r.error); continue; }
      console.log("  text: " + r.textLen + " chars · entities: " + JSON.stringify(r.counts));
      console.log("  persons: " + (r.persons.length ? r.persons.join(" | ") : "(none)"));
      if (r.junkPersons.length) console.log("  JUNK persons: " + r.junkPersons.join(" | "));
      console.log("  rels: " + r.rels + " " + JSON.stringify(r.relTypes));
      console.log("  orphans (would become LINKED_TO spam): " + r.orphans +
        (r.orphans ? "  e.g. " + r.orphanSample.join(", ") : ""));
      console.log("  hub by extraction order: " + r.primaryByOrder + " · exported primary: " + r.primaryExported);
      console.log("  mappable: " + r.mappable);
      if (r.badPhones.length) console.log("  REF-AS-PHONE: " + r.badPhones.join(", "));
    }
  }

  const fails = asserts.filter(a => !a.ok);
  console.log("\n---- ASSERTIONS: " + (asserts.length - fails.length) + "/" + asserts.length + " pass ----");
  for (const a of fails) console.log("  FAIL [" + a.file + "] " + a.name + (a.detail ? " — " + a.detail : ""));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
