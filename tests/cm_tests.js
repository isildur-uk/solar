/* cm_tests.js — spec tests for the ATLAS CM standards layer.
 * No framework. Run: node tests/cm_tests.js from the Solar directory.
 * Written against the CM data standard, NOT the implementation.
 */
"use strict";

var path = require("path");
var base = path.join(__dirname, "..");
var S = require(path.join(base, "js/core/cm-standards.js"));
var V = require(path.join(base, "js/core/cm-vocab.js"));

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("PASS: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + "\n      " + e.message); failed++; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || "eq") + " — expected " + JSON.stringify(b) + ", got " + JSON.stringify(a));
}
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy, got " + JSON.stringify(v)); }
function no(v, msg) { if (v) throw new Error(msg || "expected falsy, got " + JSON.stringify(v)); }

/* ---------------- NAMES ---------------- */
test("NAME: surname rendered in CAPS", function () { eq(S.personLabelCM("john smith"), "John SMITH"); });
test("NAME: Mc/Mac kept in forename", function () { eq(S.forenameTitle("ronald mcdonald"), "Ronald McDonald"); });
test("NAME: title stripped, suffix kept", function () {
  var p = S.splitName("Dr John McDonald Jr");
  eq(p.title, "Dr"); eq(p.suffix, "Jr"); eq(p.surname, "MCDONALD");
});
test("NAME: comma form 'Surname, Forename'", function () {
  var p = S.splitName("SMITH, Jane"); eq(p.surname, "SMITH"); eq(p.forenames, "Jane");
});
test("NAME: surname particles join & uppercase", function () { eq(S.personLabelCM("maria van der berg"), "Maria VAN DER BERG"); });
test("NAME: title recorded without full stop", function () { eq(S.splitName("Mr. Tom Jones").title, "Mr"); });

/* ---------------- ORG ---------------- */
test("ORG: Limited -> LTD, caps", function () { eq(S.organisationCaps("Acme Trading Limited"), "ACME TRADING LTD"); });
test("ORG: plc -> PLC", function () { eq(S.organisationCaps("Globex plc"), "GLOBEX PLC"); });

/* ---------------- DATES / TIME ---------------- */
test("DATE: ISO -> DD/MM/YYYY", function () { eq(S.ddmmyyyy("2024-03-05"), "05/03/2024"); });
test("DATE: human '5 March 2024'", function () { eq(S.ddmmyyyy("5 March 2024"), "05/03/2024"); });
test("DATE: 'March 12, 2024'", function () { eq(S.ddmmyyyy("March 12, 2024"), "12/03/2024"); });
test("DATE: 2-digit year window", function () { eq(S.ddmmyyyy("05/03/99"), "05/03/1999"); });
test("DATE: invalid rejected", function () { eq(S.ddmmyyyy("31/02/2024"), ""); });
test("DOB: uses DD/MM/CCYY", function () { eq(S.dobCM("1/1/1980"), "01/01/1980"); });
test("TIME: 12h pm -> 24h", function () { eq(S.time24("9:05 pm"), "21:05"); });
test("TIME: zulu qualifier kept", function () { eq(S.time24("23:15 (Zulu)"), "23:15 (ZULU)"); });
test("TIME: invalid hour rejected", function () { eq(S.time24("25:00"), ""); });

/* ---------------- PHONE (CM, no +) ---------------- */
test("PHONE: UK +44 -> national 0", function () { eq(S.phoneCM("+44 7686 868 686"), "07686868686"); });
test("PHONE: UK 0044 -> national 0", function () { eq(S.phoneCM("0044 7686868686"), "07686868686"); });
test("PHONE: intl + -> 00CC", function () { eq(S.phoneCM("+1 415 555 0100"), "0014155550100"); });
test("PHONE: never contains a plus", function () { no(S.phoneCM("+33 1 23 45 67 89").indexOf("+") !== -1); });
test("PHONE: never contains a space", function () { no(/\s/.test(S.phoneCM("+44 7686 868 686"))); });
test("PHONE: validity UK", function () { ok(S.phoneValid("07686868686")); });

/* ---------------- CURRENCY ---------------- */
test("CCY: £ -> GBP", function () { eq(S.currencyCM("£1,500"), "GBP 1500"); });
test("CCY: code preserved with decimals", function () { eq(S.currencyCM("USD 250.50"), "USD 250.50"); });
test("CCY: unknown kept raw", function () { eq(S.currencyCM("XYZ 10").indexOf("XYZ"), 0); });
test("CCY: name lookup", function () { eq(S.currencyName("GBP"), "Pound Sterling"); });

/* ---------------- IDENTIFIERS ---------------- */
test("ID account: pad to 8", function () { eq(S.identifiers.account.canonical("12345"), "00012345"); });
test("ID account: free text AC prefix", function () { eq(S.identifiers.account.freeText("12345"), "AC 00012345"); });
test("ID sortCode: SC + 6 digits", function () { eq(S.identifiers.sortCode.freeText("12-34-56"), "SC 123456"); });
test("ID sortCode: rejects 5 digits", function () { no(S.identifiers.sortCode.validate("12345")); });
test("ID CRO: canonical + prefix", function () { eq(S.identifiers.cro.freeText("12345/86g"), "CRO 12345/86G"); });
test("ID CRO: Scottish prefix", function () { eq(S.identifiers.cro.freeText("S123/86G").indexOf("SCRO"), 0); });
test("ID PNC: 2-digit year canonical", function () { eq(S.identifiers.pnc.canonical("95/11112R"), "95/11112R"); });
test("ID NINO: valid structure", function () { ok(S.validateId("nino", "AB123456C")); });
test("ID NINO: rejects bad prefix", function () { no(S.validateId("nino", "GB123456C")); });
test("ID NINO: rejects bad final letter", function () { no(S.validateId("nino", "AB123456E")); });
test("ID NINO: free text NINO prefix", function () { eq(S.identifiers.nino.freeText("AB123456C").indexOf("NINO"), 0); });
test("ID passport: 9 digits valid", function () { ok(S.identifiers.passport.validate("123456789")); });
test("ID passport: legacy 6+alpha valid", function () { ok(S.identifiers.passport.validate("123456A")); });
test("ID passport: country qualifier", function () { eq(S.identifiers.passport.freeText("123456789", "united kingdom"), "PPT 123456789 United Kingdom"); });
test("ID DRV: structure valid", function () { ok(S.validateId("driverLicence", "MORGA657054SM9IJ")); });
test("ID VAT: 9 digits valid", function () { ok(S.validateId("vat", "123456789")); });
test("ID Companies House: 8 digit", function () { ok(S.validateId("companiesHouse", "01234567")); });
test("ID Companies House: SC prefix form", function () { ok(S.validateId("companiesHouse", "SC123456")); });
test("ID VRM: caps no spaces", function () { eq(S.identifiers.vrm.canonical("ab12 cde"), "AB12CDE"); });
test("ID VIN: 17 chars valid", function () { ok(S.validateId("vin", "1HGCM82633A004352")); });
test("ID VIN: rejects I/O/Q", function () { no(S.validateId("vin", "1HGCM82633A0043IO")); });
test("ID Twitter: strips @", function () { eq(S.identifiers.twitter.canonical("@handle"), "handle"); });
test("ID IP: v4 valid", function () { ok(S.validateId("ip", "192.168.0.1")); });
test("ID IP: rejects >255 octet", function () { no(S.validateId("ip", "999.1.1.1")); });

/* ---------------- GRADING ---------------- */
test("GRADE: code form [1BP]", function () { eq(S.gradeCode(1, "b", "p"), "[1BP]"); });
test("GRADE: invalid coerced to defaults", function () { eq(S.gradeCode(9, "Z", "X"), "[2BP]"); });
test("GRADE: validity check", function () { ok(S.gradeValid("[3EP]")); no(S.gradeValid("[9ZP]")); });
test("GRADE: sentence expansion", function () { ok(S.gradeSentence("[1AP]").length > 10); });
test("GRADE: confidence migration (gradeFromConfidence)", function () { eq(S.gradeFromConfidence("high").code, "[1AP]"); });

/* ---------------- i2 LINE STRENGTH ---------------- */
test("LINE: high -> Confirmed solid", function () { var l = S.lineStrength("high"); eq(l.strength, "Confirmed"); no(l.dash); });
test("LINE: med -> Unconfirmed dashed", function () { eq(S.lineStrength("med").strength, "Unconfirmed"); });
test("LINE: low -> Tentative dotted", function () { eq(S.lineStrength("low").strength, "Tentative"); });

/* i2 Playbook: line strength derived from the 3x5x2 SOURCE evaluation. */
test("GRADE-LINE: source 1 (Reliable) -> Confirmed solid", function () {
  var l = S.lineStrengthFromGrade("1"); eq(l.strength, "Confirmed"); no(l.dash);
});
test("GRADE-LINE: source 2 (Untested) -> Unconfirmed dashed", function () {
  var l = S.lineStrengthFromGrade("2"); eq(l.strength, "Unconfirmed"); ok(l.dash);
});
test("GRADE-LINE: source 3 (Not reliable) -> Tentative dotted", function () {
  var l = S.lineStrengthFromGrade("3"); eq(l.strength, "Tentative"); ok(l.dash);
});
test("GRADE-LINE: unknown/blank grade falls back to Unconfirmed", function () {
  eq(S.lineStrengthFromGrade("").strength, "Unconfirmed");
  eq(S.lineStrengthFromGrade("9").strength, "Unconfirmed");
});

/* ---------------- RECOGNISED-TERM DETECTION ---------------- */
test("DETECT: status wanted + on bail", function () {
  var codes = S.detectStatus("the subject is currently wanted and on bail").map(function (x) { return x.code; });
  ok(codes.indexOf("WANTED") !== -1); ok(codes.indexOf("ON_BAIL") !== -1);
});
test("DETECT: status deceased", function () {
  ok(S.detectStatus("the male was found dead at the scene").some(function (x) { return x.code === "DECEASED"; }));
});
test("DETECT: warning violent + firearms", function () {
  var codes = S.detectWarningSignals("believed to be armed and violent").map(function (x) { return x.code; });
  ok(codes.indexOf("VIOLENT") !== -1); ok(codes.indexOf("FIREARMS") !== -1);
});
test("DETECT: no false positives on clean text", function () {
  eq(S.detectWarningSignals("attended a meeting about logistics").length, 0);
});
test("VOCAB: lookups by code", function () {
  eq(S.statusByCode("WANTED").label, "Wanted");
  eq(S.warningByCode("FIREARMS").label, "Firearms");
});

/* ---------------- KB REMOVED (regression guard) ---------------- */
test("CM-ONLY: no phoneFreeText '+' convention on CRStandards", function () {
  no(typeof S.phoneFreeText === "function", "phoneFreeText (KB convention) must not exist on CRStandards");
});

/* ---------------- CRYPTO ---------------- */
test("CRYPTO: detects ETH + BTC, maps coin label", function () {
  var hits = S.detectCrypto("pay 0x52908400098527886E0F7030069857D2E4169EE7 or 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
  var coins = hits.map(function (h) { return h.coin; });
  ok(coins.indexOf("ETH") !== -1, "eth"); ok(coins.indexOf("BTC") !== -1, "btc");
  eq(S.cryptoLabel("BTC"), "Bitcoin");
});
test("CRYPTO: clean prose yields none", function () { eq(S.detectCrypto("met at the cafe on Tuesday").length, 0); });

/* ---------------- summary ---------------- */
console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) { process.exit(1); }
