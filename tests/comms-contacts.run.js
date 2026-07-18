/* comms-contacts.run.js — Contact Significance profiling. */
"use strict";
var pass = 0, fail = 0;
function ok(n, c){ if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
var C = require("../js/core/comms-contacts.js");
console.log("Comms-contacts tests\n");

var T = "07700900111";
var ev = [];
function push(dt, type, a, b, dur, ring){ ev.push({ startDt: dt, type: type, aParty: a, bParty: b, durationHms: dur, ringSecs: ring }); }
// 07700900222 — reciprocal voice dialogue across 5 days, long calls (the significant associate)
for (var d = 1; d <= 5; d++){ var dd = (d < 10 ? "0" : "") + d;
  push(dd + "/09/2024 08:00:00", "MOC", T, "07700900222", "00:05:00", 3);
  push(dd + "/09/2024 18:00:00", "MTC", "07700900222", T, "00:04:00", 2);
}
// 07700900999 — one-way SMS burst in a single afternoon (raw count high, low significance)
for (var i = 0; i < 8; i++) push("02/09/2024 14:0" + i + ":00", "SMS-MO", T, "07700900999", "00:00:00", 0);
// 07700900333 — covert one-ring / unanswered signalling
for (var k = 0; k < 4; k++){ var kk = (k < 10 ? "0" : "") + (k + 1); push(kk + "/09/2024 22:00:00", "MOC", T, "07700900333", "00:00:00", 2); }

var r = C.profile(ev, T);
ok("profile returns contacts", r.contacts.length === 3);
var byNum = {}; r.contacts.forEach(function(c){ byNum[c.key] = c; });

var c222 = byNum["07700900222"], c999 = byNum["07700900999"], c333 = byNum["07700900333"];
ok("the reciprocal voice associate ranks top", r.contacts[0].key === "07700900222");
ok("222 reciprocity is balanced (~1.0)", c222.reciprocity === 1);
ok("222 counted as voice, 5 active days", c222.voice === 10 && c222.activeDays === 5);
ok("222 has the top significance score (100)", c222.score === 100);
ok("one-way SMS burst scores LOWER than the dialogue despite 8 events", c999.score < c222.score);
ok("999 flagged SMS-only", c999.smsOnly === true);
ok("999 reciprocity 0 (pure one-way)", c999.reciprocity === 0);
ok("333 flagged as signalling (one-ring/unanswered)", c333.signalling === true);
ok("333 one-ring count captured", c333.oneRing >= 1 && c333.unanswered >= 1);
ok("lifecycle first/last window set", r.firstISO === "2024-09-01" && r.lastISO === "2024-09-05");
ok("a shared day-domain is returned for sparklines", Array.isArray(r.days) && r.days.length === 5);
ok("each contact has a per-day activity array on that domain", c222.spark && c222.spark.length === r.days.length);
ok("222 sparkline reflects daily activity (2 events on day 1)", c222.spark[0] === 2);
ok("999 sparkline is a single-day burst (0 on day 1)", c999.spark[0] === 0 && c999.spark.reduce(function(a,b){return a+b;},0) === 8);
ok("per-contact first/last seen set", c222.firstISO === "2024-09-01" && c222.lastISO === "2024-09-05");

/* a late-appearing new contact is flagged */
push("05/09/2024 20:00:00", "MTC", "07700900777", T, "00:02:00", 2);
var r2 = C.profile(ev, T);
var c777 = r2.contacts.filter(function(c){ return c.key === "07700900777"; })[0];
ok("a contact first-seen at the end of the window is flagged new", c777 && c777.isNew === true);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
