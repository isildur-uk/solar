var X = require("../js/core/extract.js");
var R = require("../js/core/cm-recognisers.js");
// ~50KB capitalised paste: many Title-Case + ALLCAPS tokens, worst-ish for the loops
var unit = "DI Sarah CHEN met Mr Robert VAN DER BERG at the New Conference Suite near the War Memorial. ";
var big = "";
while (big.length < 50000) big += unit;
console.log("len", big.length);
var t0 = Date.now();
var dt = R.detectTyped(big);
var t1 = Date.now();
var r = X.extract(big);
var t2 = Date.now();
console.log("detectTyped ms", t1 - t0, "typed", dt.length);
console.log("extract ms", t2 - t1, "entities", r.entities.length);
// pathological looksLikePerson input: one giant token
var giant = "A".repeat(40000);
var t3 = Date.now(); R.looksLikePerson(giant); var t4 = Date.now();
console.log("looksLikePerson 40k-token ms", t4 - t3);
var manyTok = ("Word ".repeat(8000)); 
var t5 = Date.now(); R.looksLikePerson(manyTok); var t6 = Date.now();
console.log("looksLikePerson 8k-tokens ms", t6 - t5);
