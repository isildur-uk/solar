/* query.run.js — tests for the faceted search/query engine. */
"use strict";
var Q = require("../core/query.js");
var pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error("  FAIL: " + m); } }
function eq(a, b, m) { ok(a === b, m + "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

console.log("Query engine tests\n");

function ir(o) {
  return { urn: o.urn, title: o.title || "", operation: o.operation || "", threatArea: o.threatArea || "",
    status: o.status || "AUTHORISED", protectiveMarking: o.marking || "OFFICIAL-SENSITIVE",
    confidence: o.confidence || "Medium", handling: { code: o.code || "P" },
    submittedBySelf: o.self !== false, dateOfCollection: o.date || "01/01/2025",
    items: (o.sources || ["PND"]).map(function (s, i) { return { sourceType: s, text: o.text || "" }; }),
    provenance: { text: o.prov || "" }, structuredIntelligence: { entities: [] }, updatedAt: o.urn };
}
var rows = [
  ir({ urn: "IR000001", operation: "OP A", status: "AUTHORISED", marking: "OFFICIAL-SENSITIVE", confidence: "High", code: "P", date: "10/01/2025", sources: ["PND", "Experian"], title: "Alpha travels to Dover", text: "cocaine importation" }),
  ir({ urn: "IR000002", operation: "OP A", status: "DRAFT",      marking: "SECRET",             confidence: "Low",  code: "C", date: "20/02/2025", sources: ["GBG"],            title: "Bravo network", text: "money laundering" }),
  ir({ urn: "IR000003", operation: "OP B", status: "AUTHORISED", marking: "OFFICIAL-SENSITIVE", confidence: "High", code: "P", date: "05/03/2025", sources: ["PND"],            title: "Charlie meeting", text: "firearm supply" }),
  ir({ urn: "IR000004", operation: "OP B", status: "AUTHORISED", marking: "OFFICIAL",           confidence: "Medium", code: "P", date: "15/04/2025", sources: ["SAR", "PND"],   title: "Delta launder", text: "money laundering ring" })
];

// no criteria -> all, default sort date desc
var r = Q.run(rows, {});
eq(r.total, 4, "no filter returns all");
eq(r.rows[0].urn, "IR000004", "default sort is date desc (newest first)");

// text AND
eq(Q.run(rows, { text: "money laundering" }).total, 2, "text AND matches 2");
eq(Q.run(rows, { text: "cocaine" }).total, 1, "text single term matches 1");

// structured filter (single)
eq(Q.run(rows, { filters: { status: ["AUTHORISED"] } }).total, 3, "status=AUTHORISED -> 3");
// OR within a field
eq(Q.run(rows, { filters: { confidence: ["High", "Low"] } }).total, 3, "confidence High OR Low -> 3");
// AND across fields
eq(Q.run(rows, { filters: { status: ["AUTHORISED"], operation: ["OP B"] } }).total, 2, "AUTHORISED AND OP B -> 2");
// multi-valued sourceType
eq(Q.run(rows, { filters: { sourceType: ["Experian"] } }).total, 1, "sourceType Experian -> 1");
eq(Q.run(rows, { filters: { sourceType: ["PND"] } }).total, 3, "sourceType PND -> 3 (multi-valued)");

// date range (inclusive)
eq(Q.run(rows, { dateFrom: "2025-02-01", dateTo: "2025-03-31" }).total, 2, "date range Feb–Mar -> 2");

// facet counts exclude their own dimension: with status=AUTHORISED selected,
// the status facet still shows all statuses (so you can change choice).
var f = Q.run(rows, { filters: { status: ["AUTHORISED"] } });
var statusFacet = f.facets.filter(function (x) { return x.key === "status"; })[0];
eq(statusFacet.values.length, 2, "status facet still lists all statuses when one selected");
ok(statusFacet.values.filter(function (v) { return v.value === "AUTHORISED"; })[0].selected, "selected status is flagged selected");
// but a DIFFERENT facet reflects the status filter
var opFacet = f.facets.filter(function (x) { return x.key === "operation"; })[0];
eq(opFacet.values.filter(function (v) { return v.value === "OP A"; })[0].count, 1, "operation facet honours the status filter (OP A has 1 authorised)");

// markings present in matched set
ok(Q.run(rows, {}).markings.indexOf("SECRET") !== -1, "markings list includes SECRET when present");
eq(Q.run(rows, { filters: { status: ["AUTHORISED"] } }).markings.sort().join(","), "OFFICIAL,OFFICIAL-SENSITIVE", "markings reflect filtered set");

// sort by urn asc
var sa = Q.run(rows, { sort: { key: "urn", dir: 1 } });
eq(sa.rows[0].urn, "IR000001", "sort urn asc");

// pagination
var pg = Q.run(rows, { pageSize: 2, page: 1, sort: { key: "urn", dir: 1 } });
eq(pg.pages, 2, "2 pages at pageSize 2");
eq(pg.rows.length, 2, "page 1 has 2 rows");
eq(pg.start + "-" + pg.end, "1-2", "page 1 start-end");
var pg2 = Q.run(rows, { pageSize: 2, page: 2, sort: { key: "urn", dir: 1 } });
eq(pg2.rows[0].urn, "IR000003", "page 2 first row");
eq(Q.run(rows, { pageSize: 2, page: 99 }).page, 2, "page clamps to last page");

// realistic dataset sanity
var D = require("../core/demo-seed.js");
var ds = D.buildDemoDataset();
eq(Q.run(ds, {}).total, 240, "demo: 240 total");
eq(Q.run(ds, { filters: { operation: ["OP NEPTUNE"] } }).total, 20, "demo: OP NEPTUNE -> 20");
ok(Q.run(ds, { filters: { operation: ["OP NEPTUNE"] }, pageSize: 50 }).rows.length === 20, "demo: NEPTUNE page holds its 20");
ok(Q.run(ds, { text: "neptune" }).total >= 20, "demo: free-text 'neptune' finds its reports");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
