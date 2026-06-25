/* cm-validators.test.js — edge-case vectors for the checksum/format validators
 * and the person precision gate. Run: node cm-validators.test.js */
"use strict";
var S = require("../js/core/cm-standards.js");
var R = require("../js/core/cm-recognisers.js");
var pass = 0, fail = 0;
function eq(name, got, want) { if (got === want) pass++; else { fail++; console.log("  FAIL " + name + "  got=" + JSON.stringify(got) + " want=" + JSON.stringify(want)); } }

// Luhn
eq("luhn valid card", S.luhn("4111111111111111"), true);
eq("luhn bad card", S.luhn("4111111111111112"), false);
// IBAN mod-97
eq("iban GB valid", S.identifiers.iban.validate("GB82 WEST 1234 5698 7654 32"), true);
eq("iban bad check", S.identifiers.iban.validate("GB00 WEST 1234 5698 7654 32"), false);
// NINO: forbidden prefixes (all 7) + forbidden letters must fail; a clean one passes
eq("nino valid", S.identifiers.nino.validate("AB123456C"), true);
["BG","GB","NK","KN","TN","NT","ZZ"].forEach(function (p) { eq("nino forbidden prefix " + p, S.identifiers.nino.validate(p + "123456C"), false); });
eq("nino forbidden 1st letter D", S.identifiers.nino.validate("DA123456C"), false);
eq("nino forbidden 2nd letter O", S.identifiers.nino.validate("AO123456C"), false);
eq("nino bad suffix E", S.identifiers.nino.validate("AB123456E"), false);
// VAT mod-97 / mod-9755
eq("vat valid 980780684", S.vatChecksum("980780684"), true);
eq("vat invalid 123456789", S.vatChecksum("123456789"), false);
// IMEI Luhn
eq("imei valid", S.imeiValid("490154203237518"), true);
eq("imei bad luhn", S.imeiValid("490154203237519"), false);
eq("imei wrong length 14", S.imeiValid("49015420323751"), false);
// UK postcode
eq("postcode M14 7QP valid", S.postcodeValid("M14 7QP"), true);
eq("postcode canon m147qp", S.postcodeCanonical("m147qp"), "M14 7QP");
eq("postcode malformed invalid", S.postcodeValid("M14 7Q"), false);
// VRM format
eq("vrm current AB12CDE", S.vrmFormatValid("AB12 CDE"), true);
eq("vrm rubbish", S.vrmFormatValid("ZZZZZZZZ"), false);
// Company number
eq("co 09876543", S.companyNumberValid("09876543"), true);
eq("co SC123456", S.companyNumberValid("SC123456"), true);
eq("co OC123456 (LLP)", S.companyNumberValid("OC123456"), true);
eq("co R1234567 (NI old)", S.companyNumberValid("R1234567"), true);
eq("co AB123456 (bad prefix)", S.companyNumberValid("AB123456"), false);
eq("co 1234567 (7 digits)", S.companyNumberValid("1234567"), false);
// URL
eq("url www ok", S.urlValid("www.hyabada.co.uk"), true);
eq("url https ok", S.urlValid("https://x.io/a"), true);
eq("url plain text no", S.urlValid("Mr Smith went home."), false);
// looksLikePerson (reviewer batch)
[["O'BRIEN",1],["Anne-Marie OKAFOR",1],["VAN DER BERG",1],["MacLEOD",1],["Dr Sarah Chen",1],
 ["Smith",1],["FROST",1],["de Souza",1],["NOWAK",1],["Mr Walther",1],["john smith",1],["Ronald McDonald Jr",1],
 ["Medium WHITE",0],["War Memorial",0],["New Conference Suite",0],["NFA",0],["Threat Desk",0]
].forEach(function (c) { eq("looksLikePerson " + c[0], R.looksLikePerson(c[0]), !!c[1]); });

console.log("\nValidators: PASS " + pass + "  FAIL " + fail);
if (fail > 0) process.exit(1);
