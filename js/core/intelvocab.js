/* CHART ROOM — intelvocab.js
 * Controlled vocabulary for the intelligence enquiry/disclosure logs, taken
 * verbatim from the NTC Intelligence Case Log v8 "Lists" tab (the matured NCA
 * workbook). Kept as a dedicated single source for the intel-log feature
 * (complements cm-vocab.js/cm-standards.js, which hold the general CM/i2 vocab).
 * Pure data — no DOM, no network. Edit here to change wording everywhere.
 * Browser: window.CRIntelVocab. Node: module.exports.
 */
(function () {
  "use strict";

  /* System / Enquiry -> purpose phrase (used by the disclosure sentence). */
  var PURPOSE_BY_SYSTEM = {
    "ANPR": "movement of the vehicle within the relevant date period",
    "ATLAS CM": "any intelligence held on NCA systems",
    "ATLAS KB": "any intelligence held on NCA flagging or compromise systems",
    "Companies House": "company, director or address information",
    "Cycomms": "communications data",
    "Dunn & Bradstreet": "company and ownership information",
    "Equifax": "account credit reference information",
    "Experian": "account credit reference information",
    "GBG": "associations, addresses, electoral roll and telephone information",
    "IWF": "indecent imagery references held by the Internet Watch Foundation",
    "JARD": "any asset recovery interest",
    "Land Registry": "property ownership details",
    "Moneyweb/Discover": "any suspicious activity reports",
    "Open Source": "open source intelligence",
    "PNC": "any association to criminality, criminal history, warning markers or contact information",
    "PNC Vehicle": "information surrounding the known vehicle or address to identify linked vehicles",
    "PND": "any association to criminality, criminal history or contact information",
    "Section 7 (DPA)": "information held by the agency under a Section 7 disclosure",
    "IPA Comms Data": "entity and event communications data",
    "NBTC": "advance passenger information and travel data",
    "NCA Tasking": "tasking allocation or upgrade",
    "JMLIT": "financial intelligence held by the Joint Money Laundering Intelligence Taskforce",
    "LEA RFI": "intelligence held by other Law Enforcement Agencies",
    "HMRC": "information held by HM Revenue and Customs",
    "DVLA": "driver and vehicle records",
    "Pre Order Enquiry": "pre-order due diligence enquiries",
    "Other": "the matters set out in the result summary"
  };
  var SYSTEMS = Object.keys(PURPOSE_BY_SYSTEM);

  /* Mandatory "core checks" per entity type (RAG coverage board uses these). */
  var CORE_CHECKS_BY_TYPE = {
    "Person": ["ATLAS CM", "ATLAS KB", "PNC", "PND", "Moneyweb/Discover"],
    "Company": ["ATLAS CM", "ATLAS KB", "Companies House", "Dunn & Bradstreet", "PND"],
    "Vehicle": ["PNC Vehicle", "ANPR", "DVLA", "ATLAS CM", "PND"],
    "Phone Number": ["ATLAS CM", "ATLAS KB", "PND", "IPA Comms Data", "GBG"],
    "IMEI": ["ATLAS CM", "ATLAS KB", "PND", "IPA Comms Data"],
    "IMSI": ["ATLAS CM", "ATLAS KB", "PND", "IPA Comms Data"],
    "Email Address": ["ATLAS CM", "ATLAS KB", "PND", "Open Source", "IWF"],
    "Username": ["ATLAS CM", "ATLAS KB", "PND", "Open Source"],
    "Postal Address": ["ATLAS CM", "PND", "Land Registry", "Companies House", "Open Source"],
    "Bank Account": ["ATLAS CM", "PND", "Section 7 (DPA)", "JMLIT", "Moneyweb/Discover"],
    "Other": ["ATLAS CM", "ATLAS KB", "PND"]
  };

  /* Document type -> description starter (disclosure log). [FILL: ...] markers
   * are intentional prompts the analyst completes; [SUBJECT]/[DATE]/[WHO]/[ENTITY]
   * are auto-substituted by the engine. */
  var DOC_TYPE_STARTERS = {
    "Open Source Research Report": "Open Source Research Report on [SUBJECT], detailing searches conducted on [FILL: platforms] on [DATE]. This report highlights [FILL: summary of findings]. Report produced by officer [WHO].",
    "Open Source Research Image": "Screenshot following Open Source Research carried out by officer [WHO] on [DATE]. This screenshot is of [FILL: platform / what it shows] relating to [SUBJECT].",
    "Section 7 Request": "A Section 7 Crime and Courts Act 2013 request submitted by officer [WHO] to [FILL: agency] on [DATE] in relation to [SUBJECT]. This request was submitted to identify [FILL: what is sought, and why this agency].",
    "Intelligence Report": "An intelligence report dated [DATE] with handling conditions of [FILL: conditions]. Generated / disseminated by officer [WHO] and relates to [FILL: summary].",
    "PND Flagging Form": "Police National Database Flag Request form for [SUBJECT]. Dated [DATE]. [FILL: case reference]. Subject suspected to be [FILL: summary of criminality]. Authorised by [FILL: authorising staff number].",
    "Atlas KB SOI Form": "Subject of Interest form concerning [SUBJECT], dated [DATE], who is suspected to be [FILL: summary of criminality]. Authorised by [FILL: authorising staff number].",
    "Email": "Email dated [DATE], sent by officer [WHO] to [FILL: recipient] requesting [FILL: what was requested]. [FILL: reply / outcome if received].",
    "NBTC Request / Results": "Request from officer [WHO] on [DATE] for Advance Passenger Information from the National Border Targeting Centre for [SUBJECT], for the purposes of preventing or detecting serious crime. Travel period requested: [FILL: dates]. Results show [FILL: summary].",
    "JMLIT Request": "Request from officer [WHO] on [DATE] to the Joint Money Laundering Intelligence Taskforce within the NCA relating to [SUBJECT]. This requested information relating to [FILL: summary].",
    "Credit Reference Agency Report": "[SYSTEM] check dated [DATE] in relation to [SUBJECT], associated to [ENTITY]. This report identifies [FILL: summary of accounts / findings].",
    "RIPA Application": "Review of Directed Surveillance Authority dated [DATE], [FILL: reference], relating to [SUBJECT]. This authority requests [FILL: type of authority]. Expiry date [FILL: date].",
    "Surveillance Log": "Surveillance Log [FILL: reference] dated [DATE] covering [FILL: times]. Observations are [FILL: summary of observations].",
    "Communications Data Results": "A folder of spreadsheets and PDF documents relating to communications data obtained from [FILL: telecoms operator] for [ENTITY] covering [FILL: period]. Processed on [DATE]. [ENTITY] is associated with [SUBJECT].",
    "Other Document": "[FILL: document type] dated [DATE], produced by officer [WHO], relating to [SUBJECT]. [FILL: what it is and what it contains]."
  };
  var DOC_TYPES = Object.keys(DOC_TYPE_STARTERS);

  /* The disclosure sentence template for an enquiry/check (v8 "Check"). */
  var ENQUIRY_TEMPLATE =
    "[SYSTEM] check completed on [DATE] by officer [WHO] on [ENTITY] in relation to [SUBJECT] to identify [PURPOSE]. [RESULT]";

  var ENTRY_TYPES = ["Decision", "Operational Update", "Action Raised", "Action Closed", "Result Received", "Dissemination", "Review", "Other"];
  var ACTION_STATUS = ["Open", "In progress", "On hold", "Closed"];
  var SOURCES = ["surveillance", "S7 / DPA disclosure", "PNC", "PNC Vehicle", "intelligence report", "open source research", "co-defendant / linked subject", "SAR", "LEA RFI response", "case papers", "CHIS reporting", "other (see Notes)"];
  var ENTITY_TYPES = ["Person", "Company", "Vehicle", "Postal Address", "Email Address", "Phone Number", "IMEI", "IMSI", "Username", "Bank Account", "Other"];
  var TASKING_TYPES = ["NT", "NN", "NO", "NS", "NP"];

  var CRIntelVocab = {
    PURPOSE_BY_SYSTEM: PURPOSE_BY_SYSTEM, SYSTEMS: SYSTEMS,
    CORE_CHECKS_BY_TYPE: CORE_CHECKS_BY_TYPE,
    DOC_TYPE_STARTERS: DOC_TYPE_STARTERS, DOC_TYPES: DOC_TYPES,
    ENQUIRY_TEMPLATE: ENQUIRY_TEMPLATE,
    ENTRY_TYPES: ENTRY_TYPES, ACTION_STATUS: ACTION_STATUS, SOURCES: SOURCES,
    ENTITY_TYPES: ENTITY_TYPES, TASKING_TYPES: TASKING_TYPES
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CRIntelVocab;
  if (typeof window !== "undefined") window.CRIntelVocab = CRIntelVocab;
})();
