/* comms-data.run.js — tests for the comms-data CDR parse/clean/geo module. */
"use strict";
var C = require("../js/core/comms-data.js");

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("  FAIL: " + name); } }
function near(a, b, tol) { return a != null && Math.abs(a - b) <= tol; }

console.log("Comms-data tests\n");

/* ---- 1. OSGB36 grid -> WGS84 against the OS worked-example control point ---- */
// Caister water tower: E 651409.903, N 313177.270 -> WGS84 ~52.6576 N, 1.7179 E.
// OSGB36 grid E 651409.903 N 313177.270 -> WGS84 52.657979 N, 1.716052 E
// (the documented OS/Veness worked-example result, post datum shift).
var w = C.osgbToWgs84(651409.903, 313177.270);
ok("BNG control point latitude ~52.65798", near(w.lat, 52.657979, 0.0005));
ok("BNG control point longitude ~1.71605", near(w.lon, 1.716052, 0.0005));
// A central-London grid ref (~E530000,N180000) should land in a sane UK box.
var wl = C.osgbToWgs84(530000, 180000);
ok("London-ish grid gives plausible UK lat", wl.lat > 51 && wl.lat < 52);
ok("London-ish grid gives plausible UK lon", wl.lon > -0.6 && wl.lon < 0.4);
ok("non-numeric grid returns null", C.osgbToWgs84("", null) === null);

/* ---- 2. Raw Call Data CSV: header rows + 36-col events -------------------- */
var HDR = ["Start Date","Start Time (local)","End Date","End Time (local)","Calling Number","Called Number","Forwarding Number","CDR Type","IMSI","IMEI","Ring time (secs)","Call Duration (HH:mm:ss)","IPv4 address","IPv6 address","Data Volume Uploaded (KB)","Data Volume Downloaded (KB)","APN","Country of Origin","Operator","Start Cell ID or MAC Address","Start Cell Site Name","Start Cell 1st line of Address","Start Cell ID Postcode","Start Cell Generation","Start Cell Easting","Start Cell Northing","Start Cell Azimuth","End Cell ID or MAC Address","End Cell Site Name","End Cell 1st line of Address","End Cell ID Postcode","End Cell Generation","End Cell Easting","End Cell Northing","End Cell Azimuth","Row"].join(",");
var ROW1 = ["01/09/2024","08:15:22","01/09/2024","08:16:00","+447700900123","447700900456","","Voice","234159876543210","350000000000001","3","00:00:38","","","","","","GBR","EE","12345","CAISTER WATER TWR","1 Tower Rd","NR30 5AA","4G","651409","313177","120","","","","","","","","","1"].join(",");
var ROW2 = ["01/09/2024","09:02:10","01/09/2024","09:02:10","+447700900123","","","SMS-MO","234159876543210","350000000000009","0","00:00:00","","","","","","GBR","EE","12346","YARMOUTH CENTRAL","2 High St","NR30 1PX","4G","652000","307500","240","","","","","","","","","2"].join(",");
var csv = ["URN:,,,,IR123456","Grade:,,,,OFFICIAL-SENSITIVE","Target identity:,,,,07700900123","","" + HDR, "", ROW1, ROW2].join("\n");

var rowsCsv = C.parseDelimited(csv);
var resCsv = C.cleanFromRows(rowsCsv);
ok("CSV detected as csv", resCsv.format === "csv");
ok("CSV meta URN captured", resCsv.meta.URN === "IR123456");
ok("CSV two events parsed", resCsv.events.length === 2);
ok("CSV phone CM-standardised (no +, national 0)", resCsv.events[0].aParty === "07700900123");
ok("CSV called number standardised", resCsv.events[0].bParty === "07700900456");
ok("CSV event type mapped", resCsv.events[0].type === "Voice");
ok("CSV IMEI mapped", resCsv.events[0].imei === "350000000000001");
ok("CSV duration mapped", resCsv.events[0].durationHms === "00:00:38");
ok("CSV start-cell easting/northing -> lat", near(resCsv.events[0].lat, 52.6576, 0.01));
ok("CSV azimuth numeric", resCsv.events[0].cellAzimuth === 120);
ok("CSV SIM-swap visible (two IMEIs on one number)", resCsv.events[0].imei !== resCsv.events[1].imei);

/* ---- 3. ADM-style rows: lat/long already present ------------------------- */
var adm = [
  ["Event Type (*Enriched)","Start Datetime (*Raw)","Originator Comms Address (*Standardised)","Recipient Comms Address (*Standardised)","Start Cell Postcode (*Raw)","Start Cell Latitude (*Calculated)","Start Cell Longitude (*Calculated)","Start Cell Azimuth (*Standardised)","IMEI (*Decoded)"],
  ["Voice call","2024-09-01 08:15","+447700900123","07700900456","NR30 5AA","52.6576","1.7179","120","350000000000001"]
];
var resAdm = C.cleanFromRows(adm);
ok("ADM detected as adm", resAdm.format === "adm");
ok("ADM originator standardised", resAdm.events[0].aParty === "07700900123");
ok("ADM latitude taken directly", near(resAdm.events[0].lat, 52.6576, 0.0001));
ok("ADM longitude taken directly", near(resAdm.events[0].lon, 1.7179, 0.0001));
ok("ADM event type mapped", resAdm.events[0].type === "Voice call");

/* ---- 4. summary / de-bloat ---------------------------------------------- */
var sum = C.summarise(resCsv.events);
ok("summary event count", sum.eventCount === 2);
ok("summary geolocated count", sum.geolocated === 2);
ok("summary top cells present", sum.topCells.length >= 1);
ok("summary handset combos (SIM swap) >=2 for the number", sum.handsetCombos.length >= 2);
ok("clean columns are de-bloated (15 analyst columns)", C.CLEAN_COLUMNS.length === 15);
ok("clean columns include lat/long", C.CLEAN_COLUMNS.some(function (c) { return c.key === "lat"; }) && C.CLEAN_COLUMNS.some(function (c) { return c.key === "lon"; }));
ok("clean columns exclude data-volume bloat", !C.CLEAN_COLUMNS.some(function (c) { return /data volume/i.test(c.label); }));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
