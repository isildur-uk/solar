/* ============================================================
   known-entities.js — the deterministic overlap between surfaces.
   A small, fixed set of identities that appear BOTH in the Database
   sample reports (seeded with these exact values) and in the Analyse
   sample comms data — so loading a CDR/ANPR return can show which
   subjects/contacts are already known to the intelligence picture,
   and where. Single source of truth for that overlap; loaded by both
   the Analyse view and the Database seed.
   ============================================================ */
(function () {
  "use strict";

  // phone (E.164/national digits) -> known nominal + where they sit in the DB.
  var PHONES = {
    "07700900111": { label: "Geoffrey BAINES", operation: "Environmental Crime", opCode: "ENV", role: "Principal" },
    "07700900222": { label: "Aimee FRANKLIN", operation: "cross-operation bridge", opCode: "XREF", role: "Nominal" },
    "07700900333": { label: "Marcus DELANEY", operation: "Modern Slavery & Human Trafficking", opCode: "MODSL", role: "Principal" },
    "07700900777": { label: "Stefan VOSS", operation: "Organised Immigration Crime", opCode: "OIC", role: "Principal" }
  };
  // vehicle VRM -> known nominal.
  var VEHICLES = {
    "LD12ABC": { label: "Geoffrey BAINES (kr)", operation: "Environmental Crime", opCode: "ENV", role: "Vehicle" }
  };

  function normPhone(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }
  function normVrm(v) { return String(v == null ? "" : v).replace(/\s|-/g, "").toUpperCase(); }

  // lookup(type, value) -> match record or null. type: "phone" | "vehicle".
  function lookup(type, value) {
    if (type === "phone") { return PHONES[normPhone(value)] || null; }
    if (type === "vehicle") { return VEHICLES[normVrm(value)] || null; }
    return null;
  }

  window.SolarKnownEntities = {
    lookup: lookup,
    phones: PHONES,
    vehicles: VEHICLES,
    // the fixed nominals the Database seed injects (so the overlap is truthful)
    seedList: function () {
      var out = [];
      Object.keys(PHONES).forEach(function (n) { out.push({ kind: "phone", value: n, info: PHONES[n] }); });
      Object.keys(VEHICLES).forEach(function (v) { out.push({ kind: "vehicle", value: v, info: VEHICLES[v] }); });
      return out;
    }
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = window.SolarKnownEntities; }
})();
