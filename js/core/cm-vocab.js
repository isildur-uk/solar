/* cm-vocab.js — ATLAS CM recognised-terms reference vocabularies.
 *
 * Pure data, no logic. Dependency-free. Consumed by cm-standards.js.
 * Dual export: window.CRVocab (browser classic script) + module.exports (Node).
 *
 * Source: NCA ATLAS Data Standards (IM01 SD01 v6), CM system recognised terms.
 * KB conventions are intentionally excluded — CM is the single standard here.
 *
 * Lists are controlled vocabularies used to (a) validate/standardise entity
 * attributes and (b) drive on-chart organisation (status/warning badges,
 * dropdown editing). Where the source list is very large (e.g. full BS 4217
 * currency set, passport countries), a strong working subset is encoded and
 * marked EXTENSIBLE — callers must treat an unknown value as "keep raw", never
 * as invalid.
 */
"use strict";

var CRVocab = {};
CRVocab.VERSION = "2026-06-16";

/* Populated in sections below. */

/* ================================================================== */
/*  NAMES — titles, suffixes, particles                                */
/* ================================================================== */
/* CM rule: Title recorded without a full stop (Mr not Mr.). EXTENSIBLE. */
CRVocab.TITLES = [
  "Mr", "Mrs", "Miss", "Ms", "Mx", "Dr", "Prof", "Rev", "Fr", "Sr", "Sir",
  "Dame", "Lord", "Lady", "Master", "Capt", "Major", "Col", "Sgt", "Cpl",
  "Lt", "Cmdr", "Hon", "Judge", "Rabbi", "Imam", "Sheikh"
];

/* Generational / honorific suffixes kept with the name. EXTENSIBLE. */
CRVocab.PERSON_SUFFIXES = [
  "Jr", "Snr", "Sr", "II", "III", "IV", "V",
  "OBE", "MBE", "CBE", "QC", "KC", "VC", "GC", "PhD", "MD", "Esq"
];

/* Surname particles that stay lower-case unless line-initial, and that
 * join to the surname for CM caps handling. EXTENSIBLE. */
CRVocab.NAME_PARTICLES = [
  "de", "del", "della", "der", "van", "von", "da", "di", "du", "la", "le",
  "los", "las", "bin", "ibn", "al", "el", "san", "santa", "st", "ter", "ten",
  // Portuguese "of / of the" (companions to the "da" already handled)
  "do", "dos", "das",
  // Arabic / North-African patronymics "son / daughter of" (companions to bin/ibn)
  "bint", "ben", "ould", "wuld"
];


/* ================================================================== */
/*  STATUS OF SUBJECT                                                   */
/* ================================================================== */
/* CM recognised terms describing a subject's current standing. Each has a
 * code (stable key), a label (CM display term) and detect cues (lowercase
 * substrings used by the extractor to tag free text). EXTENSIBLE. */
CRVocab.STATUS_OF_SUBJECT = [
  { code: "WANTED",         label: "Wanted",                       cues: ["wanted", "circulated as wanted"] },
  { code: "SUSPECT",        label: "Suspect",                      cues: ["suspect", "suspected of"] },
  { code: "ARRESTED",       label: "Arrested",                     cues: ["arrested", "under arrest"] },
  { code: "CHARGED",        label: "Charged",                      cues: ["charged with", "has been charged"] },
  { code: "ON_BAIL",        label: "On Bail",                      cues: ["on bail", "released on bail", "bail conditions"] },
  { code: "REMANDED",       label: "Remanded in Custody",          cues: ["remanded", "on remand"] },
  { code: "CONVICTED",      label: "Convicted",                    cues: ["convicted", "found guilty"] },
  { code: "IN_CUSTODY",     label: "In Custody",                   cues: ["in custody", "in prison", "imprisoned", "incarcerated", "serving a sentence"] },
  { code: "ON_LICENCE",     label: "On Licence",                   cues: ["on licence", "released on licence"] },
  { code: "RUI",            label: "Released Under Investigation", cues: ["released under investigation", "rui"] },
  { code: "WITNESS",        label: "Witness",                      cues: ["witness", "eyewitness"] },
  { code: "VICTIM",         label: "Victim",                       cues: ["victim", "complainant", "injured party"] },
  { code: "MISSING",        label: "Missing Person",               cues: ["missing person", "reported missing", "misper"] },
  { code: "DECEASED",       label: "Deceased",                     cues: ["deceased", "found dead", "pronounced dead"] },
  { code: "NFA",            label: "No Further Action",            cues: ["no further action", "nfa"] }
];

/* ================================================================== */
/*  IMMIGRATION STATUS                                                  */
/* ================================================================== */
/* EXTENSIBLE. */
CRVocab.IMMIGRATION_STATUS = [
  { code: "BRITISH",         label: "British Citizen" },
  { code: "ILR",             label: "Indefinite Leave to Remain" },
  { code: "LTR",             label: "Limited Leave to Remain" },
  { code: "EUSS",            label: "EU Settlement Scheme" },
  { code: "VISA",            label: "Visa Holder" },
  { code: "ASYLUM",          label: "Asylum Seeker" },
  { code: "REFUGEE",         label: "Refugee" },
  { code: "OVERSTAYER",      label: "Overstayer" },
  { code: "ILLEGAL_ENTRANT", label: "Illegal Entrant" },
  { code: "UNKNOWN",         label: "Immigration Status Unknown" }
];

/* ================================================================== */
/*  WARNING SIGNALS                                                     */
/* ================================================================== */
/* Officer-safety markers (PNC-style warning signals). code + label + cues.
 * Used to raise a warning badge on a person node. EXTENSIBLE. */
CRVocab.WARNING_SIGNALS = [
  { code: "VIOLENT",     label: "Violent",                cues: ["violent", "violence", "assault", "gbh", "abh"] },
  { code: "WEAPONS",     label: "Weapons",                cues: ["weapon", "knife", "bladed", "offensive weapon"] },
  { code: "FIREARMS",    label: "Firearms",               cues: ["firearm", "armed", "gun"] },
  { code: "DRUGS",       label: "Drugs",                  cues: ["drugs", "controlled substance", "supply of"] },
  { code: "ESCAPER",     label: "Escaper / Absconder",    cues: ["escaper", "absconder", "absconded", "unlawfully at large"] },
  { code: "SELF_HARM",   label: "Self-Harm Risk",         cues: ["self-harm", "self harm", "suicidal"] },
  { code: "CONTAGIOUS",  label: "Contagious",             cues: ["contagious", "infectious"] },
  { code: "MENTAL",      label: "Mental Health",          cues: ["mental health", "sectioned", "mental disorder"] },
  { code: "ALLEGER",     label: "Alleges / Complaints",   cues: ["makes allegations", "false allegations"] },
  { code: "DRIVER",      label: "Wanted Driver",          cues: ["disqualified driver", "fails to stop"] }
];

/* ================================================================== */
/*  DISTINGUISHING MARKS — taxonomy                                     */
/* ================================================================== */
/* Categories for marks/scars/tattoos so they can be recorded consistently.
 * EXTENSIBLE. */
CRVocab.DISTINGUISHING_MARKS = [
  { code: "TATTOO",   label: "Tattoo" },
  { code: "SCAR",     label: "Scar" },
  { code: "BIRTHMARK",label: "Birthmark" },
  { code: "PIERCING", label: "Piercing" },
  { code: "AMPUTEE",  label: "Amputation / Missing Limb" },
  { code: "MOLE",     label: "Mole" },
  { code: "BRAND",    label: "Brand / Burn Mark" },
  { code: "OTHER",    label: "Other Mark" }
];

/* ================================================================== */
/*  VEHICLE TYPES                                                       */
/* ================================================================== */
/* CM vehicle classification. EXTENSIBLE. */
CRVocab.VEHICLE_TYPES = [
  "Car", "Van", "Lorry / HGV", "Motorcycle", "Moped / Scooter", "Bus / Coach",
  "Minibus", "Taxi / PHV", "Pickup", "SUV / 4x4", "Trailer", "Caravan",
  "Agricultural Vehicle", "Plant / Construction", "Bicycle", "E-Scooter",
  "Boat / Vessel", "Aircraft", "Other"
];

/* ================================================================== */
/*  VIRTUAL CURRENCY                                                    */
/* ================================================================== */
/* CM recognised virtual-currency tokens. EXTENSIBLE. */
CRVocab.VIRTUAL_CURRENCY = [
  { code: "BTC",  label: "Bitcoin" },
  { code: "ETH",  label: "Ethereum" },
  { code: "XMR",  label: "Monero" },
  { code: "LTC",  label: "Litecoin" },
  { code: "USDT", label: "Tether" },
  { code: "XRP",  label: "Ripple" },
  { code: "BCH",  label: "Bitcoin Cash" },
  { code: "DASH", label: "Dash" }
];

/* ================================================================== */
/*  THREAT TIER / TRB                                                   */
/* ================================================================== */
/* Tiering / Threat Risk Band entries used to grade a subject's threat.
 * EXTENSIBLE. */
CRVocab.TIER_TRB = [
  { code: "T1", label: "Tier 1" },
  { code: "T2", label: "Tier 2" },
  { code: "T3", label: "Tier 3" },
  { code: "T4", label: "Tier 4" },
  { code: "TRB_HIGH",   label: "TRB — High" },
  { code: "TRB_MEDIUM", label: "TRB — Medium" },
  { code: "TRB_LOW",    label: "TRB — Low" }
];

/* ================================================================== */
/*  CURRENCY — ISO 4217 / BS 4217 working subset                       */
/* ================================================================== */
/* code -> { name, symbol }. Strong working subset of the BS 4217 set used
 * by CM for monetary amounts. EXTENSIBLE — unknown codes are kept raw, not
 * rejected. Amount formatting (code + value, minus for negative) lives in
 * cm-standards.js. */
CRVocab.CURRENCY_CODES = {
  GBP: { name: "Pound Sterling",        symbol: "£" },
  EUR: { name: "Euro",                  symbol: "€" },
  USD: { name: "US Dollar",             symbol: "$" },
  JPY: { name: "Japanese Yen",          symbol: "¥" },
  CHF: { name: "Swiss Franc",           symbol: "CHF" },
  AUD: { name: "Australian Dollar",     symbol: "$" },
  CAD: { name: "Canadian Dollar",       symbol: "$" },
  CNY: { name: "Chinese Yuan Renminbi", symbol: "¥" },
  HKD: { name: "Hong Kong Dollar",      symbol: "$" },
  SGD: { name: "Singapore Dollar",      symbol: "$" },
  NZD: { name: "New Zealand Dollar",    symbol: "$" },
  SEK: { name: "Swedish Krona",         symbol: "kr" },
  NOK: { name: "Norwegian Krone",       symbol: "kr" },
  DKK: { name: "Danish Krone",          symbol: "kr" },
  PLN: { name: "Polish Zloty",          symbol: "zł" },
  RUB: { name: "Russian Rouble",        symbol: "₽" },
  INR: { name: "Indian Rupee",          symbol: "₹" },
  AED: { name: "UAE Dirham",            symbol: "AED" },
  SAR: { name: "Saudi Riyal",           symbol: "SAR" },
  TRY: { name: "Turkish Lira",          symbol: "₺" },
  ZAR: { name: "South African Rand",    symbol: "R" },
  BRL: { name: "Brazilian Real",        symbol: "R$" },
  MXN: { name: "Mexican Peso",          symbol: "$" },
  NGN: { name: "Nigerian Naira",        symbol: "₦" },
  PKR: { name: "Pakistani Rupee",       symbol: "₨" },
  THB: { name: "Thai Baht",             symbol: "฿" },
  KRW: { name: "South Korean Won",      symbol: "₩" }
};

/* Symbol -> default currency code, for parsing amounts written with a glyph.
 * '$' is ambiguous and intentionally maps to USD as the default. */
CRVocab.CURRENCY_SYMBOLS = { "£": "GBP", "€": "EUR", "$": "USD", "¥": "JPY", "₽": "RUB", "₹": "INR", "₺": "TRY", "₦": "NGN", "₩": "KRW", "฿": "THB" };

/* ================================================================== */
/*  PASSPORT / NATIONALITY COUNTRIES — working subset                  */
/* ================================================================== */
/* Used to validate the country qualifier on a passport free-text string.
 * Strong working subset; EXTENSIBLE — unknown country names are kept, not
 * rejected. Stored title-cased as CM displays them. */
CRVocab.PASSPORT_COUNTRIES = [
  "United Kingdom", "Ireland", "France", "Germany", "Spain", "Italy",
  "Portugal", "Netherlands", "Belgium", "Luxembourg", "Switzerland",
  "Austria", "Poland", "Czech Republic", "Slovakia", "Hungary", "Romania",
  "Bulgaria", "Greece", "Cyprus", "Malta", "Sweden", "Norway", "Denmark",
  "Finland", "Iceland", "Estonia", "Latvia", "Lithuania", "Croatia",
  "Slovenia", "Serbia", "Albania", "Ukraine", "Russia", "Turkey",
  "United States", "Canada", "Mexico", "Brazil", "Argentina", "Colombia",
  "Australia", "New Zealand", "India", "Pakistan", "Bangladesh", "Sri Lanka",
  "China", "Hong Kong", "Japan", "South Korea", "Thailand", "Vietnam",
  "Malaysia", "Singapore", "Indonesia", "Philippines", "Nigeria", "Ghana",
  "Kenya", "South Africa", "Egypt", "Morocco", "Algeria", "Somalia",
  "United Arab Emirates", "Saudi Arabia", "Iran", "Iraq", "Afghanistan",
  "Jamaica", "Trinidad and Tobago"
];

/* ---- export ---- */
if (typeof module !== "undefined" && module.exports) { module.exports = CRVocab; }
if (typeof window !== "undefined") { window.CRVocab = CRVocab; }
