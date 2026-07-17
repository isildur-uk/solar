/* aviation-ref.run.js — vendored airline/airport reference (Analyse / NBTC). */
"use strict";
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
function eq(n, a, b) { ok(n + "  (got " + JSON.stringify(a) + ")", a === b); }

var AV = require("../js/core/aviation-ref.js");
console.log("Aviation-ref tests\n");

var c = AV.counts();
ok("thousands of airports loaded", c.airports > 5000);
ok("thousands of airlines loaded", c.airlines > 1000);

/* flight-designator -> airline */
var ba = AV.airlineFromFlight("BA286");
eq("BA286 code", ba.code, "BA");
eq("BA286 airline", ba.airline.name, "British Airways");
eq("BA286 flight number retained", ba.flightNumber, "286");
eq("BA286 callsign", ba.airline.callsign, "SPEEDBIRD");
eq("easyJet U2 8040 (with space) resolves", AV.airlineFromFlight("U2 8040").airline.name, "easyJet");
eq("Ryanair FR1234", AV.airlineFromFlight("FR1234").airline.name, "Ryanair");
eq("ICAO designator BAW286 -> British Airways", AV.airlineFromFlight("BAW286").airline.name, "British Airways");
ok("well-formed designator parses code + flight number", (function () { var r = AV.airlineFromFlight("BA2490"); return r && r.code === "BA" && r.flightNumber === "2490"; })());
ok("gibberish flight -> null", AV.airlineFromFlight("!!!") === null);

/* airline() direct */
eq("airline by IATA BA", AV.airline("BA").name, "British Airways");
eq("airline by ICAO EZY -> easyJet", AV.airline("EZY").name, "easyJet");
ok("unknown airline -> null", AV.airline("ZZ9") === null);

/* airports: IATA + ICAO, name + lat/lon for mapping */
var lhr = AV.airport("LHR");
eq("LHR name", lhr.name, "Heathrow");
eq("LHR city", lhr.city, "London");
ok("LHR latitude ~51.47", Math.abs(lhr.lat - 51.4775) < 0.01);
ok("LHR longitude ~-0.46", Math.abs(lhr.lon - (-0.461389)) < 0.01);
eq("ICAO EGLL resolves to Heathrow", AV.airport("EGLL").name, "Heathrow");
eq("lower-case iata 'jfk' resolves", AV.airport("jfk").city, "New York");
ok("airportLatLon returns {lat,lon}", (function () { var ll = AV.airportLatLon("CDG"); return ll && isFinite(ll.lat) && isFinite(ll.lon); })());
ok("unknown airport -> null", AV.airport("ZZZ") === null);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
