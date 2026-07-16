/* identity.run.js — tests for the single SolarIdentity source. */
"use strict";
var I = require("../js/ui/identity.js");
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

console.log("SolarIdentity tests\n");

I._reset();
var d = I.get();
ok("default identity", d.grade === "G5" && d.name === "Analyst");

var v = I.set({ grade: "G4", name: "Jane SMITH" });
ok("set returns normalised identity", v.grade === "G4" && v.name === "Jane SMITH");
ok("get round-trips the set value", (function () { var g = I.get(); return g.grade === "G4" && g.name === "Jane SMITH"; })());
ok("label formats 'grade · name'", I.label() === "G4 · Jane SMITH");

I.set({ grade: "", name: "" });
ok("empty values fall back to defaults", (function () { var g = I.get(); return g.grade === "G5" && g.name === "Analyst"; })());

I.set({ grade: "  G3  ", name: "  Alex JONES  " });
ok("values are trimmed", I.label() === "G3 · Alex JONES");

I._reset();
ok("reset returns to default", I.get().name === "Analyst");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
