/* source-meta.js — per-source-system colour + plain-English description, used by
 * the report read view to colour-code the SOURCE column and explain a system on
 * click. Descriptions marked {indicative:true} are best-effort for bespoke/internal
 * tools and should be confirmed against local documentation.
 * Dual export: module.exports (Node) + window.RegistrySourceMeta (browser). */
"use strict";
(function () {
  // Colours are grouped by family and chosen to read on the dark console (#0c0c0b).
  var COLOURS = {
    "PNC":"#6ea8d8", "PNC Vehicle":"#4f86c6", "PND":"#7fb0c9",
    "ATLAS CM":"#5fc4c0", "ATLAS KB":"#4aa8a4",
    "NBTC Historical Travel":"#56b6a6", "NBTC Watchlist":"#3f9e93",
    "IPA Comms Data":"#66b8d6",
    "Experian":"#79c98f", "Equifax":"#8fca7a", "Dunn & Bradstreet":"#a8c97f",
    "GBG":"#94c26a", "Moneyweb/Discover":"#b6c96a", "SAR":"#c9c36a",
    "DVLA":"#e0b05e", "Companies House":"#d8a16e", "Land Registry":"#cf9a5a",
    "Section 7 (DPA)":"#c98f6a",
    "CHIS reporting":"#b48ad6", "Surveillance":"#a87fd0", "Intelligence report":"#9a8ad6",
    "NCA Tasking":"#c58ad6", "JARD":"#ba8ac0", "Cycomms":"#8f8ad6",
    "ANPR":"#d88c6e", "Open Source":"#9aa5b1", "LEA RFI":"#7fb0c9",
    "Pre Order Enquiry":"#a3a299", "Other":"#8d99ae"
  };
  var DEFAULT_COLOUR = "#8d99ae";

  // {text, indicative?} — indicative flags a best-effort description for a bespoke/internal tool.
  var DESCRIPTIONS = {
    "PNC": { text: "Police National Computer — the UK-wide record of persons and their offending history: convictions, cautions, reprimands, wanted/missing and bail markers. The authoritative 'hard' criminal-record check." },
    "PNC Vehicle": { text: "Police National Computer (vehicle) — registered keeper, vehicle details and markers (e.g. stolen or of-interest) held on the PNC." },
    "PND": { text: "Police National Database — shared 'soft' intelligence and operational records (POLE: People, Objects, Locations, Events) contributed by police forces across England & Wales. Holds allegations and intelligence, not convictions." },
    "ATLAS CM": { text: "Home Office ATLAS casework system — immigration and border casework: status, applications and case history for a subject." },
    "ATLAS KB": { text: "Reference/knowledge content associated with the Home Office ATLAS casework system.", indicative: true },
    "NBTC Historical Travel": { text: "National Border Targeting Centre (Border Force) — historical travel derived from Passenger Name Record / Advance Passenger Information; movements in and out of the UK, held back over an extended period." },
    "NBTC Watchlist": { text: "National Border Targeting Centre — a watchlist match/alert generated when a subject's travel is screened against border warnings indices." },
    "IPA Comms Data": { text: "Communications data obtained under the Investigatory Powers Act — subscriber, contact and usage data (the who/when/where of a communication, not its content)." },
    "Experian": { text: "Consumer credit reference agency — address history, financial associations, accounts and credit footprint for an individual." },
    "Equifax": { text: "Consumer credit reference agency — address history, financial associations, accounts and credit footprint for an individual." },
    "Dunn & Bradstreet": { text: "Business/commercial credit reference agency — company financials, directors and trade data (corporate credit intelligence)." },
    "GBG": { text: "GBG identity & location intelligence — identity verification, address and consumer-data services." },
    "Moneyweb/Discover": { text: "Financial-intelligence search tool used for money-flow and account enquiries.", indicative: true },
    "SAR": { text: "Suspicious Activity Report — a disclosure filed by a regulated business to the UK Financial Intelligence Unit about suspected money laundering or terrorist financing." },
    "DVLA": { text: "Driver & Vehicle Licensing Agency — driver record and licence details, and the registered keeper/vehicle particulars for a vehicle." },
    "Companies House": { text: "UK register of companies — incorporation, directors and officers, filings, and company numbers." },
    "Land Registry": { text: "HM Land Registry — registered proprietor, title number and price-paid information for a registered property." },
    "Section 7 (DPA)": { text: "Personal data obtained via a Data Protection Act disclosure route.", indicative: true },
    "CHIS reporting": { text: "Covert Human Intelligence Source reporting — intelligence provided by a tasked and handled human source. Sensitive to source; handle accordingly." },
    "Surveillance": { text: "Directed/physical surveillance product — first-hand observations recorded by officers during an authorised deployment." },
    "Intelligence report": { text: "A general intelligence report submitted by a reporting officer or unit." },
    "NCA Tasking": { text: "A tasking or intelligence requirement issued within the National Crime Agency.", indicative: true },
    "JARD": { text: "An agency reference-data source.", indicative: true },
    "Cycomms": { text: "A cyber/communications intelligence source.", indicative: true },
    "ANPR": { text: "Automatic Number Plate Recognition — time-and-place sightings of a vehicle captured by camera networks." },
    "Open Source": { text: "Open-source information (OSINT) — publicly available material such as websites, social media and public records." },
    "LEA RFI": { text: "Request For Information exchanged with a law-enforcement agency partner (domestic or international)." },
    "Pre Order Enquiry": { text: "A preliminary scoping enquiry made before formal tasking or acquisition.", indicative: true },
    "Other": { text: "A source not covered by a standard category." }
  };
  var DEFAULT_DESC = { text: "No description held for this source system.", indicative: true };

  var api = {
    colour: function (src) { return COLOURS[String(src)] || DEFAULT_COLOUR; },
    describe: function (src) { return DESCRIPTIONS[String(src)] || DEFAULT_DESC; },
    list: function () { return Object.keys(DESCRIPTIONS); }
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistrySourceMeta = api; }
})();
