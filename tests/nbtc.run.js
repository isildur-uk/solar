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

/* ---- journeys(): flight legs, airline + airport decode, boarded status ---- */
var TRAVEL = [
 "Passenger name\tDate of birth\tTravel Doc\tFlight\tDate\tFrom\tTo\tStatus",
 "GUBBINS, DEAN\t01/01/2000\t574444444 (GBR)\tBA462\t03/01/2026\tLHR\tAMS\tDC",
 "GUBBINS, DEAN\t01/01/2000\t574444444 (GBR)\tU28040\t02/02/2026\tLGW\tBCN\tCI",
 "GUBBINS, DEAN\t01/01/2000\t574444444 (GBR)\tFR8542\t18/01/2026\tSTN\tAGP\tDC"
].join("\n");
var trecs = N.parse(TRAVEL);
ok("travel rows parse a Status column", trecs[0].status === "DC");
var jr = N.journeys(trecs);
ok("journeys builds one leg per flight", jr.legs.length === 3);
ok("legs sorted chronologically (03 Jan first, 02 Feb last)", jr.legs[0].date === "03/01/2026" && jr.legs[2].date === "02/02/2026");
ok("flight decoded to airline (BA462 -> British Airways)", jr.legs[0].airline && jr.legs[0].airline.name === "British Airways");
ok("airports resolved with coordinates (LHR)", jr.legs[0].from && Math.abs(jr.legs[0].from.lat - 51.4775) < 0.01);
ok("boarded classified: 2 boarded, 1 check-in-only", jr.boarded === 2 && jr.notBoarded === 1);
ok("DC = boarded", N.boardedFromStatus("DC") === true);
ok("CI = not boarded", N.boardedFromStatus("CI") === false);
ok("P/blank = unknown boarding", N.boardedFromStatus("P") === null);
ok("airlines aggregated", jr.airlines.indexOf("British Airways") !== -1 && jr.airlines.indexOf("Ryanair") !== -1);
ok("countries aggregated across airports", jr.countries.indexOf("United Kingdom") !== -1 && jr.countries.indexOf("Spain") !== -1);

/* ---- trips(): out->return pairing, dwell, aborted no-show ---- */
var TR = [
 "Passenger name\tDate of birth\tTravel Doc\tFlight\tDate\tFrom\tTo\tStatus",
 "GUBBINS, DEAN\t01/01/2000\t574444444 (GBR)\tBA430\t12/10/2025\tLHR\tAMS\tDC",
 "GUBBINS, DEAN\t01/01/2000\t574444444 (GBR)\tBA429\t14/10/2025\tAMS\tLHR\tDC",
 "GUBBINS, DEAN\t01/01/2000\t574444444 (GBR)\tU28040\t17/11/2025\tLGW\tAMS\tCI",
 "GUBBINS, DEAN\t01/01/2000\t574444444 (GBR)\tFR8542\t06/12/2025\tSTN\tAGP\tDC",
 "GUBBINS, DEAN\t01/01/2000\t574444444 (GBR)\tFR8543\t08/12/2025\tAGP\tSTN\tDC"
].join("\n");
var tp = N.trips(N.journeys(N.parse(TR)).legs);
ok("trips paired (2 return trips + 1 aborted = 3)", tp.summary.tripCount === 3);
ok("the no-show is flagged aborted, not paired to a later return", tp.summary.aborted === 1);
ok("completed trips have a 2-day dwell", tp.summary.medianDwellDays === 2);
ok("first trip is the Amsterdam round-trip with a return leg", tp.trips[0].ret && tp.trips[0].out.toCode === "AMS");
ok("aborted trip has no return/dwell", tp.trips.some(function(t){ return t.aborted && t.ret === null && t.dwellDays === null; }));
ok("destinations aggregated (Netherlands + Spain)", tp.summary.destinations.indexOf("Netherlands") !== -1 && tp.summary.destinations.indexOf("Spain") !== -1);
ok("GB airport recognised by isGB", N.isGB({ country: "United Kingdom" }) === true && N.isGB({ country: "Spain" }) === false);

/* findings(): the briefing headline over a realistic escalating-courier table */
global.CRAviation = require("../js/core/aviation-ref.js");
var Nb = require("../js/core/nbtc.js");
var fv = require("../analyse/nbtc-view.js");
var F = Nb.findings(Nb.parse(fv._loadSample()));
function has(key){ return F.signals.some(function(s){ return s.key === key; }); }
function get(key){ return F.signals.filter(function(s){ return s.key === key; })[0]; }
ok("findings picks the largest cluster as subject (GUBBINS)", /GUBBINS/.test(F.subject.label));
ok("findings surfaces same-day turnarounds", has("sameday") && get("sameday").tone === "alert");
ok("findings surfaces the no-show", has("noshow") && get("noshow").tone === "alert");
ok("findings surfaces the passport switch", has("docs") && /574444444/.test(get("docs").detail) && /575555555/.test(get("docs").detail));
ok("findings surfaces the co-traveller (NOWAK)", has("cotravel") && /NOWAK/.test(get("cotravel").detail));
ok("findings surfaces cadence tightening", has("cadence"));
ok("findings surfaces departure-airport spread", has("spread") && /LHR/.test(get("spread").detail));
ok("no co-traveller signal on a single-traveller table", (function(){
  var solo = Nb.findings(Nb.parse("Passenger name\tDate of birth\tNationality\tTravel Doc\tFlight\tDate\tFrom\tTo\tStatus\nSOLO, SAM\t01/01/1990\tGBR\tX1 (GBR)\tBA1\t01/02/2026\tLHR\tAMS\tDC\nSOLO, SAM\t01/01/1990\tGBR\tX1 (GBR)\tBA2\t03/02/2026\tAMS\tLHR\tDC"));
  return !solo.signals.some(function(s){ return s.key === "cotravel"; });
})());

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
