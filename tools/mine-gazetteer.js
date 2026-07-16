/* mine-gazetteer.js — distil a NER teacher's knowledge into a Solar gazetteer.
 *
 * Run OFFLINE (desktop / build machine) with the FULL GLiNER as the teacher, over
 * a corpus of intelligence-style prose. It aggregates what the model finds into a
 * compact, frequency-filtered, CM-normalised gazetteer JSON that ships online and
 * plugs into js/core/gazetteer.js — so the model's knowledge runs everywhere with
 * no weights and no ML runtime.
 *
 * Teacher contract: teacher(text) -> spans | Promise<spans>, where a span is
 * { text, start, end, label, score }. GLiNER labels are mapped to Solar entity
 * types via SmartNER.LABEL_MAP; unmapped labels are ignored.
 *
 *   const { mine } = require("./tools/mine-gazetteer.js");
 *   const gaz = await mine(corpusArray, glinerTeacher, { minCount: 3 });
 *   fs.writeFileSync("gazetteer.json", JSON.stringify(gaz, null, 2));
 *
 * Node module (build-time tool; not shipped in the browser bundle).
 */
"use strict";
var CM = require("../js/core/cm-standards.js");
var SN = require("../js/core/smartner.js");

function lc(x) { return String(x == null ? "" : x).toLowerCase().trim(); }
function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim(); }

/* CM-normalise the display form by entity type (person -> "Forename SURNAME", org caps). */
function display(label, text) {
  text = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (label === "person" && CM.personLabelCM) return CM.personLabelCM(text);
  if (label === "organisation" && CM.organisationCaps) return CM.organisationCaps(text);
  return text;
}

/* mine(corpus, teacher, opts) -> Promise<gazetteer JSON>.
 * opts: { minCount = 2, source } */
function mine(corpus, teacher, opts) {
  opts = opts || {};
  var minCount = (opts.minCount != null) ? opts.minCount : 2;
  corpus = corpus || [];
  var buckets = {};   // solarLabel -> { normDisplay -> { display, count } }

  function handle(spans) {
    (spans || []).forEach(function (sp) {
      var solar = SN.LABEL_MAP[lc(sp.label)];
      if (!solar) return;
      var disp = display(solar, sp.text);
      var key = norm(disp);
      if (!disp || !key) return;
      if (!buckets[solar]) buckets[solar] = {};
      if (!buckets[solar][key]) buckets[solar][key] = { display: disp, count: 0 };
      buckets[solar][key].count++;
    });
  }

  return corpus.reduce(function (p, text) {
    return p.then(function () { return Promise.resolve(teacher(text)).then(handle); });
  }, Promise.resolve()).then(function () {
    var entities = {}, counts = {};
    Object.keys(buckets).sort().forEach(function (label) {
      var items = Object.keys(buckets[label]).map(function (k) { return buckets[label][k]; })
        .filter(function (x) { return x.count >= minCount; })
        .sort(function (a, b) { return b.count - a.count || a.display.localeCompare(b.display); });
      if (items.length) { entities[label] = items.map(function (x) { return x.display; }); counts[label] = items.length; }
    });
    return {
      version: "1",
      source: opts.source || "NER teacher (mined)",
      generated: new Date().toISOString(),
      minCount: minCount,
      counts: counts,
      entities: entities
    };
  });
}

module.exports = { mine: mine, display: display };
