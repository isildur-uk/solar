/* cm-recognisers-corpus.test.js — end-to-end extract() gate over the acid corpus.
 * Verifies the i2/ATLAS model: identifiers are PERSON ATTRIBUTES (not nodes); only
 * chart-renderable types are nodes; report metadata (grading/operation) is captured;
 * capitalisation false-positive persons are dropped. Run: node cm-recognisers-corpus.test.js */
"use strict";
var X = require("../js/core/extract.js"), fs = require("fs"), path = require("path");
var DIR = path.join(__dirname, "../../test_data/cm-acid-corpus");
var pass = 0, fail = 0;
function res(f, dir) { return X.extract(fs.readFileSync(path.join(dir || DIR, f), "utf8")); }
function ok(name, c) { if (c) pass++; else { fail++; console.log("  FAIL " + name); } }
function people(r) { return r.entities.filter(function (e) { return e.type === "person"; }); }
function personWith(r, labelSub) { return people(r).find(function (e) { return String(e.label).indexOf(labelSub) !== -1; }); }
function node(r, type, valSub) { return r.entities.some(function (e) { return e.type === type && String(e.value || e.label).indexOf(valSub) !== -1; }); }
var ENTITY_TYPES = "person phone email address location organisation vehicle weapon drug account date money ip document event note".split(" ");

var A1 = res("A1-CM-COMPLIANT-IR.txt"), A2 = res("A2-NARRATIVE-IR.txt"),
    A3 = res("A3-MIXED-PROFILE.txt"), A4 = res("A4-ADVERSARIAL-FP-BAIT.txt"), A5 = res("A5-CHAT-LOG.txt");

/* CLEAN CHART — every node must be a model.js-supported entity type (no junk) */
[["A1",A1],["A2",A2],["A3",A3],["A4",A4],["A5",A5]].forEach(function (p) {
  var bad = p[1].entities.filter(function (e) { return ENTITY_TYPES.indexOf(e.type) === -1; });
  ok(p[0] + " all nodes are supported chart types", bad.length === 0);
});

/* IDENTIFIERS AS PERSON ATTRIBUTES (compliant A1 AND narrative A2) */
[["A1",A1],["A2",A2]].forEach(function (p) {
  var pr = personWith(p[1], "PRESTON");
  ok(p[0] + " person PRESTON exists", !!pr);
  ok(p[0] + " PRESTON has nino attr PR882013C", pr && pr.attrs.nino === "PR882013C");
  ok(p[0] + " PRESTON has pnc attr", pr && /0998812K/.test(pr.attrs.pnc || ""));
  ok(p[0] + " PRESTON has cro attr", pr && /18820\/05P/.test(pr.attrs.cro || ""));
  ok(p[0] + " PRESTON has dob attr", pr && !!pr.attrs.dob);
});
/* identifiers must NOT be standalone nodes */
ok("A2 nino is NOT a standalone node", !A2.entities.some(function (e) { return e.type === "nino"; }));
ok("A2 no junk operation/grading nodes", !A2.entities.some(function (e) { return e.type === "operation" || e.type === "grading"; }));

/* REAL NODES still present */
ok("A1 sort code -> account node", node(A1, "account", "204567"));
ok("A2 money node", A2.entities.some(function (e) { return e.type === "money"; }));

/* A3 invalid NINO kept as-observed on the person (flag-don't-correct) */
ok("A3 invalid NINO kept on person attrs (not corrected)", people(A3).some(function (e) { return (e.attrs.nino || "").indexOf("NK449201A") !== -1; }));

/* A4 PRECISION — capitalisation FPs are not persons */
["Medium WHITE","War Memorial","New Conference Suite","Threat Desk","Riverside Community Hub","NFA"].forEach(function (fp) {
  ok("A4 NOT person '" + fp + "'", !personWith(A4, fp));
});
ok("A4 keeps real person AKINFENWA", !!personWith(A4, "AKINFENWA"));

/* A5 chat phones */
ok("A5 has a phone", A5.entities.some(function (e) { return e.type === "phone"; }));

/* COMPREHENSIVENESS on the real narrative report (SAMPLE-IR-Geoff-Baines) */
var B = res("SAMPLE-IR-Geoff-Baines.txt", path.join(__dirname, "../../test_data"));
ok("Baines: grading captured (2C/P)", B.grading && B.grading.source === "2" && B.grading.handling === "P");
ok("Baines: operation captured (SOLAR DAWN)", /SOLAR DAWN/.test(B.operation || ""));
ok("Baines: ASHTON CREW is an organisation node", B.entities.some(function (e) { return e.type === "organisation" && /ASHTON CREW/.test(e.label); }));
var baines = personWith(B, "BAINES");
ok("Baines: BAINES has narrative nino attr (JT601320B)", baines && baines.attrs.nino === "JT601320B");
ok("Baines: BAINES has narrative passport attr (503842156)", baines && baines.attrs.passport === "503842156");
ok("Baines: BAINES has dob attr", baines && !!baines.attrs.dob);
ok("Baines: rich relationships (>=20)", B.relationships.length >= 20);

console.log("\nCorpus E2E: PASS " + pass + "  FAIL " + fail);
if (fail > 0) process.exit(1);
