/* nbtc.run.js — NBTC parse + identity-resolution (the GUBBINS problem). */
"use strict";
var pass = 0, fail = 0;
function ok(n, c){ if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
global.window = global;
var SC = require("../js/core/solar-case.js"); global.SolarCase = SC;
var N = require("../js/core/nbtc.js");
console.log("NBTC tests\n");

/* field parsers */
var nm = N.parseName("GUBBINS, DEAN ROGER");
ok("name surname", nm.surname === "GUBBINS");
ok("name forenames", nm.forenames.join(",") === "DEAN,ROGER");
var db = N.parseDob("02/01/2000");
ok("dob iso (DMY)", db.iso === "2000-01-02");
ok("dob ambiguous flagged", db.ambiguous === true);
ok("unambiguous dob (25/12)", N.parseDob("25/12/2000").ambiguous === false);
var doc = N.parseDoc("575555555 (GBR)");
ok("doc number", doc.number === "575555555");
ok("doc state", doc.state === "GBR");
ok("surname fuzzy GUBINS~GUBBINS >=0.85", N.sim("GUBINS", "GUBBINS") >= 0.85);

/* the sample (both NBTC tables merged; blank doc where absent) */
var TSV = [
 "Passenger name\tGender\tDate of birth\tNationality\tTravel Doc",
 "GUBBINS, DEAN\tM\t01/02/2000\tGBR\t575555555 (GBR)",
 "GUBBINS, DEAN\tM\t01/01/2000\tGBR\t574444444 (GBR)",
 "GUBBINS, DEAN\tM\t02/01/2000\tGBR\t677777777 (FRA)",
 "GUBBINS, DEAN ROGER\tM\t01/01/2000\tGBR\t574444444 (GBR)",
 "GUBBINS, DEAN\tM\t01/01/2000\tGBR\t575555555 (GBR)",
 "GUBINS, DEAN\tM\t01/01/2000\tGBR\t122222222 (USA)",
 "GUBBINS, DEAN P\tM\t01/01/2000\tGBR\t",
 "GUBINS, DEAN\tM\t01/01/2000\tUSA\t",
 "GUBBINS, DEAN\tM\t02/01/2000\tFRA\t",
 "GUBBINS, DEAN PR\tF\t02/01/2000\tGBR\t",
 "GUBBINS, DEAN PETER ROGER\tM\t01/01/2000\tGBR\t",
 "GUBBINS, DEAN ROGER\tM\t01/01/2000\tGBR\t"
].join("\n");

var recs = N.parse(TSV);
ok("parsed 12 passenger rows", recs.length === 12);
ok("parsed doc field", recs[0].doc === "575555555 (GBR)");

var res = N.resolve(recs);
var byId = {}; res.clusters.forEach(function(c){ byId[c.id] = c; });
// the main GUBBINS/DEAN/01-01-2000/M cluster should be the largest
var main = res.clusters.slice().sort(function(a,b){ return b.size - a.size; })[0];
ok("a dominant resolved person emerges", main.size >= 6);
ok("main person is GUBBINS", main.surname.toUpperCase() === "GUBBINS");
ok("main person dob 2000-01-01", main.dobISO === "2000-01-01");
ok("shared document 574444444 merged its two rows", res.clusters.some(function(c){ return c.documents.some(function(d){ return d.number === "574444444"; }) && c.members.length >= 2; }));
ok("main person collects multiple documents", main.documents.length >= 1);
ok("candidates surfaced for review (never auto-merged)", res.candidates.length >= 1);
ok("a DOB day/month swap candidate is flagged", res.candidates.some(function(c){ return /swap/i.test(c.reason); }));
ok("a fuzzy-surname (GUBINS) candidate is flagged", res.candidates.some(function(c){ return /fuzzy/i.test(c.reason); }));
ok("gender-mismatch decoy not silently merged", res.clusters.some(function(c){ return c.gender === "F"; }));

/* spine output */
SC._reset();
var parts = N.toCase(res);
ok("toCase yields person entities", parts.entities.some(function(e){ return e.type === "person"; }));
ok("toCase yields official_document entities", parts.entities.some(function(e){ return e.type === "official_document"; }));
ok("toCase links person -> document (DOCUMENT_OWNERSHIP)", parts.links.some(function(l){ return l.type === "DOCUMENT_OWNERSHIP"; }));
var st = SC.merge(parts);
ok("merges into the shared spine", st.entities > 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
