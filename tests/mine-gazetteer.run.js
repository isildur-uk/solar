/* mine-gazetteer.run.js — tests for distilling a NER teacher into a gazetteer. */
"use strict";
var mg = require("../tools/mine-gazetteer.js");
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

console.log("Mine-gazetteer tests\n");

/* display normalisation via CM standards */
ok("person display -> Forename SURNAME", mg.display("person", "JUNE BAILEY") === "June BAILEY");
ok("organisation display -> caps + LTD", mg.display("organisation", "oakdale auctions ltd") === "OAKDALE AUCTIONS LTD");
ok("location display trimmed", mg.display("location", "  Rotterdam ") === "Rotterdam");

/* stub teacher (stands in for the full GLiNER run) */
function teacher(text) {
  var out = [], names = { "June BAILEY": "person", "David ROBERTS": "person", "OAKDALE AUCTIONS": "organization" };
  Object.keys(names).forEach(function (nm) { var i = text.indexOf(nm); if (i >= 0) out.push({ text: nm, start: i, end: i + nm.length, label: names[nm], score: 0.9 }); });
  return out;
}
var corpus = ["June BAILEY met David ROBERTS.", "June BAILEY runs OAKDALE AUCTIONS.", "David ROBERTS again."];

mg.mine(corpus, teacher, { minCount: 2 }).then(function (g2) {
  ok("persons mined (freq >= 2)", g2.entities.person && g2.entities.person.indexOf("June BAILEY") !== -1 && g2.entities.person.indexOf("David ROBERTS") !== -1);
  ok("org filtered out at minCount 2 (freq 1)", !g2.entities.organisation);
  ok("gazetteer metadata present", g2.version === "1" && g2.minCount === 2 && !!g2.generated);
  return mg.mine(corpus, teacher, { minCount: 1 });
}).then(function (g1) {
  ok("org mined at minCount 1, GLiNER label mapped to 'organisation'", g1.entities.organisation && g1.entities.organisation[0] === "OAKDALE AUCTIONS");
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.log("  ERROR", e && e.message); process.exit(1); });
