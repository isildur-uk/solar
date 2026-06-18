/* CHART ROOM — lang.js
 * Lightweight linguistic layer for intelligence prose: tokeniser, clause
 * splitting, subject–verb–object extraction, verb semantics, tense/modality,
 * negation, passive voice, object lists.
 * Dependency-free; browser (window.CRLang) and Node (module.exports).
 *
 * Contract — analyse(sentence, entityRanges) returns an array of clauses:
 * {
 *   subject: { kind:'entity'|'pronoun'|'np', text, start, end, entityIdx? } | null,
 *   verb:    { lemma, group, start, end, tense:'past'|'present'|'future',
 *              negated, passive, planned },
 *   objects: [{ prep:string|null, kind:'entity'|'np', text, start, end, entityIdx? }],
 *   text, start, end
 * }
 * entityRanges: [{ start, end, type }] relative to the sentence — treated as
 * atomic tokens so multi-word entities survive parsing. Offsets in the result
 * are relative to the sentence (caller adds the sentence's base offset).
 */
(function () {
  "use strict";

  /* ---------------- closed-class word lists ---------------- */

  var PRONOUN_SUBJ = { he: 1, she: 1, they: 1, i: 1, we: 1 };
  var PRONOUN_OBJ = { him: 1, her: 1, them: 1, me: 1, us: 1 };
  var SUBJECT_NOUNS = { subject: 1, male: 1, female: 1, suspect: 1, target: 1, individual: 1, nominal: 1 };
  var DETERMINERS = { the: 1, a: 1, an: 1, this: 1, that: 1, these: 1, those: 1, his: 1, her: 1, their: 1, its: 1, same: 1 };
  var PREPOSITIONS = {
    to: 1, from: 1, at: 1, "in": 1, on: 1, "with": 1, via: 1, "for": 1, by: 1,
    near: 1, into: 1, onto: 1, through: 1, towards: 1, toward: 1
  };
  var MODALS = { will: 1, would: 1, may: 1, might: 1, can: 1, could: 1, shall: 1, should: 1, must: 1 };
  var AUX = { is: 1, are: 1, was: 1, were: 1, be: 1, been: 1, being: 1, has: 1, have: 1, had: 1, "do": 1, does: 1, did: 1 };
  var NEG = { not: 1, never: 1, no: 1 };
  var NEG_CONTRACTED = {
    "didn't": 1, "doesn't": 1, "don't": 1, "won't": 1, "wouldn't": 1, "isn't": 1,
    "wasn't": 1, "weren't": 1, "aren't": 1, "hasn't": 1, "haven't": 1, "hadn't": 1,
    "can't": 1, "cannot": 1, "couldn't": 1, "shouldn't": 1, "mustn't": 1
  };
  // verbs of denial: "denies meeting X" — the embedded action is negated
  var DENIAL = { denies: 1, denied: 1, deny: 1, refutes: 1, refuted: 1, disputes: 1, disputed: 1,
    rejects: 1, rejected: 1, rebuts: 1, rebutted: 1, contests: 1, contested: 1 };
  // pre-verb future markers: "plans on making", "is expected to purchase"
  var FUTURE_MARKERS = [
    ["plans", "on"], ["plans", "to"], ["planning", "to"], ["planning", "on"],
    ["intends", "to"], ["intending", "to"], ["expected", "to"], ["expects", "to"],
    ["due", "to"], ["going", "to"], ["set", "to"], ["about", "to"],
    ["scheduled", "to"], ["likely", "to"], ["will", "be"]
  ];

  /* ---------------- verb lexicon ---------------- */
  /* rel selection: prepMap wins for the matched preposition; otherwise
   * targetMap by entity type; otherwise def. "_rev" reverses direction. */

  var VERB_GROUPS = {
    movement: {
      lemmas: ["fly", "travel", "go", "head", "drive", "sail", "move", "visit",
        "attend", "arrive", "cross", "enter", "relocate"],
      prepMap: { to: "TRAVELS_TO", into: "TRAVELS_TO", towards: "TRAVELS_TO", "for": "TRAVELS_TO", from: "DEPARTS_FROM" },
      targetMap: { location: "TRAVELS_TO", address: "STAYS_AT", vehicle: "USES", person: "ASSOCIATE_OF" },
      def: "TRAVELS_TO"
    },
    // depart/leave are directionally OPPOSITE to movement: a bare location object
    // ("departed Bristol") is the ORIGIN (DEPARTS_FROM), while an explicit
    // destination prep ("bound for Malaga", "to Lisbon") is TRAVELS_TO.
    departure: {
      lemmas: ["depart", "leave", "exit"],
      prepMap: { to: "TRAVELS_TO", "for": "TRAVELS_TO", towards: "TRAVELS_TO", into: "TRAVELS_TO", from: "DEPARTS_FROM" },
      targetMap: { location: "DEPARTS_FROM", address: "DEPARTS_FROM", vehicle: "USES", person: "ASSOCIATE_OF" },
      def: "DEPARTS_FROM"
    },
    communication: {
      lemmas: ["call", "phone", "text", "message", "email", "contact", "ring",
        "speak", "talk", "tell", "notify", "whatsapp", "dm", "facetime"],
      targetMap: { person: "COMMUNICATED_WITH", phone: "COMMUNICATED_WITH", email: "COMMUNICATED_WITH", organisation: "COMMUNICATED_WITH" },
      def: "COMMUNICATED_WITH"
    },
    transaction: {
      lemmas: ["pay", "transfer", "buy", "purchase", "sell", "supply", "send",
        "receive", "deposit", "withdraw", "owe", "lend", "borrow", "acquire",
        "obtain", "deal", "launder", "smuggle", "wire"],
      targetMap: { person: "TRANSACTED_WITH", organisation: "TRANSACTED_WITH", account: "TRANSACTED_WITH", phone: "USES", vehicle: "OWNS", money: "TRANSACTED_WITH" },
      prepMap: { to: "TRANSACTED_WITH", from: "TRANSACTED_WITH" },
      def: "TRANSACTED_WITH"
    },
    residence: {
      lemmas: ["stay", "live", "reside", "lodge", "sleep", "base", "frequent", "operate"],
      targetMap: { address: "STAYS_AT", location: "STAYS_AT", organisation: "STAYS_AT" },
      def: "STAYS_AT"
    },
    association: {
      lemmas: ["meet", "know", "associate", "marry", "befriend", "accompany",
        "join", "recruit", "introduce", "greet"],
      targetMap: { person: "ASSOCIATE_OF", organisation: "ASSOCIATE_OF" },
      def: "ASSOCIATE_OF"
    },
    employment: {
      lemmas: ["work", "employ", "hire", "manage"],
      prepMap: { "for": "EMPLOYS_rev", at: "EMPLOYS_rev", "with": "ASSOCIATE_OF" },
      def: "ASSOCIATE_OF"
    },
    possession: {
      lemmas: ["use", "own", "register", "hold", "carry", "possess", "wear", "keep", "control"],
      targetMap: { phone: "USES", email: "USES", vehicle: "USES", account: "USES", address: "LINKED_TO", document: "USES", ip: "USES" },
      def: "USES"
    },
    returnVerb: { lemmas: ["return"], def: "_RETURN_EVENT" }
  };

  // irregular past forms → lemma
  var IRREGULAR = {
    flew: "fly", flown: "fly", went: "go", gone: "go", met: "meet", bought: "buy",
    sold: "sell", sent: "send", paid: "pay", drove: "drive", driven: "drive",
    left: "leave", took: "take", taken: "take", spoke: "speak", spoken: "speak",
    told: "tell", gave: "give", given: "give", kept: "keep", held: "hold",
    came: "come", ran: "run", knew: "know", known: "know", wore: "wear",
    slept: "sleep", withdrew: "withdraw", withdrawn: "withdraw", lent: "lend",
    rang: "ring", rung: "ring"
  };

  var LEMMA_INDEX = {}; // inflected form -> { lemma, group }
  function indexForm(form, lemma, group) {
    if (!LEMMA_INDEX[form]) LEMMA_INDEX[form] = { lemma: lemma, group: group };
  }
  Object.keys(VERB_GROUPS).forEach(function (g) {
    VERB_GROUPS[g].lemmas.forEach(function (lm) {
      indexForm(lm, lm, g);
      indexForm(lm + "s", lm, g);
      indexForm(lm + "es", lm, g);
      indexForm(lm + "ed", lm, g);
      indexForm(lm + "d", lm, g);
      indexForm(lm + "ing", lm, g);
      // consonant doubling + e-drop common cases
      if (/e$/.test(lm)) indexForm(lm.slice(0, -1) + "ing", lm, g);
      var dbl = lm + lm[lm.length - 1];
      indexForm(dbl + "ed", lm, g);
      indexForm(dbl + "ing", lm, g);
      if (/y$/.test(lm)) {
        indexForm(lm.slice(0, -1) + "ied", lm, g);
        indexForm(lm.slice(0, -1) + "ies", lm, g);
      }
    });
  });
  Object.keys(IRREGULAR).forEach(function (form) {
    var lm = IRREGULAR[form];
    // find the group that owns this lemma
    Object.keys(VERB_GROUPS).forEach(function (g) {
      if (VERB_GROUPS[g].lemmas.indexOf(lm) !== -1) indexForm(form, lm, g);
    });
  });

  function verbInfo(word) { return LEMMA_INDEX[word] || null; }
  // words that read as nouns when preceded by these
  var NOUNY_VERBS = { email: 1, phone: 1, text: 1, message: 1, call: 1, ring: 1 };
  var NOUN_INTRO = { and: 1, an: 1, a: 1, the: 1, his: 1, her: 1, their: 1, "new": 1, via: 1, by: 1, on: 1, this: 1, that: 1, same: 1 };
  function isPastForm(word, lemma) {
    if (IRREGULAR[word]) return true;
    return /ed$/.test(word) && word !== lemma;
  }

  /* ---------------- tokeniser ---------------- */

  /**
   * Tokenise; entityRanges become single atomic tokens.
   * Token: { text, low, start, end, kind:'word'|'entity'|'punct', entityIdx?, type? }
   */
  function tokenise(sentence, entityRanges) {
    var ranges = (entityRanges || []).slice().sort(function (a, b) { return a.start - b.start; });
    var tokens = [];
    var pos = 0;

    function emitText(seg, base) {
      var re = /[A-Za-z][\w''-]*|\d[\d.,]*|[,;:()&]/g;
      var mm;
      while ((mm = re.exec(seg))) {
        var txt = mm[0];
        tokens.push({
          text: txt, low: txt.toLowerCase().replace(/[''-]/g, function (ch) { return ch === "-" ? "-" : "'"; }),
          start: base + mm.index, end: base + mm.index + txt.length,
          kind: /^[,;:()&]$/.test(txt) ? "punct" : "word"
        });
      }
    }

    ranges.forEach(function (r, i) {
      if (r.start > pos) emitText(sentence.slice(pos, r.start), pos);
      if (r.start >= pos) {
        tokens.push({
          text: sentence.slice(r.start, r.end), low: "",
          start: r.start, end: r.end, kind: "entity", entityIdx: i, type: r.type
        });
        pos = r.end;
      }
    });
    if (pos < sentence.length) emitText(sentence.slice(pos), pos);
    tokens.sort(function (a, b) { return a.start - b.start; });
    return tokens;
  }

  /* ---------------- clause splitting ---------------- */

  var CLAUSE_BREAKERS = { and: 1, but: 1, then: 1, who: 1, which: 1, while: 1, after: 1, before: 1, where: 1 };

  function hasFiniteVerbAhead(tokens, from, horizon) {
    for (var i = from; i < Math.min(tokens.length, from + horizon); i++) {
      var t = tokens[i];
      if (t.kind !== "word") continue;
      if (MODALS[t.low] || AUX[t.low] || verbInfo(t.low)) return true;
    }
    return false;
  }

  function splitClauses(tokens) {
    var clauses = [];
    var cur = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var brk = false;
      if (t.kind === "punct" && t.text === ";") brk = true;
      else if (t.kind === "punct" && t.text === ",") {
        // ", lives at…" — a comma directly followed by a verb starts a new
        // predicate; a comma followed by an entity is just a list
        var nx = tokens[i + 1];
        if (nx && nx.kind === "word" && (verbInfo(nx.low) || AUX[nx.low] || MODALS[nx.low])) brk = true;
      }
      else if (t.kind === "word" && CLAUSE_BREAKERS[t.low]) {
        // "and" also joins noun lists — only break if a verb follows soon
        // and the next token isn't immediately an entity that continues a list
        var prev = tokens[i - 1];
        var listy = prev && (prev.kind === "entity" || (prev.kind === "punct" && prev.text === ","));
        var verbAhead = hasFiniteVerbAhead(tokens, i + 1, 5);
        var nx1 = tokens[i + 1], nx2 = tokens[i + 2];
        var entityNext = nx1 && nx1.kind === "entity";
        // "and email geoff@…" — identifier noun + entity is a list, not a clause
        var nounyList = nx1 && nx1.kind === "word" && NOUNY_VERBS[nx1.low] &&
                        nx2 && nx2.kind === "entity";
        if (verbAhead && !nounyList &&
            !(listy && entityNext && !hasFiniteVerbAhead(tokens, i + 1, 2))) brk = true;
      }
      if (brk && cur.length) {
        clauses.push(cur);
        cur = [];
        if (t.kind === "word" && (t.low === "who" || t.low === "which")) {
          // relative pronoun: subject carries over — mark for inheritance
          cur._inherit = true;
        }
        continue;
      }
      cur.push(t);
      if (cur._inherit === undefined && clauses.length && clauses[clauses.length - 1]._relNext) {
        cur._inherit = true;
      }
    }
    if (cur.length) clauses.push(cur);
    return clauses;
  }

  /* ---------------- clause analysis ---------------- */

  function findVerbGroup(tokens) {
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.kind !== "word") continue;
      var isModal = MODALS[t.low], isAux = AUX[t.low];
      var vi = verbInfo(t.low);
      if (!isModal && !isAux && !vi && !NEG_CONTRACTED[t.low] && !DENIAL[t.low]) continue;
      // "and email geoff@…" — identifier nouns after determiners are not verbs
      if (vi && NOUNY_VERBS[t.low]) {
        var pv = tokens[i - 1];
        if (pv && pv.kind === "word" && NOUN_INTRO[pv.low]) continue;
      }

      // grow the group: modal/aux/neg/adverb-ish tokens then a head verb
      var j = i, head = null, negated = false, passive = false, future = false, denial = false;
      var sawBe = false, sawHave = false;
      for (; j < tokens.length && j < i + 6; j++) {
        var w = tokens[j];
        if (w.kind !== "word") break;
        if (NEG_CONTRACTED[w.low]) { negated = true; if (/^(won|wouldn)/.test(w.low)) future = w.low === "won't"; continue; }
        if (NEG[w.low]) { negated = true; continue; }
        if (MODALS[w.low]) { if (w.low === "will" || w.low === "shall") future = true; continue; }
        if (AUX[w.low]) {
          if (/^(is|are|was|were|be|been|being)$/.test(w.low)) sawBe = true;
          if (/^(has|have|had)$/.test(w.low)) sawHave = true;
          continue;
        }
        if (DENIAL[w.low]) { denial = true; continue; }
        var vinfo = verbInfo(w.low);
        if (vinfo) { head = { tok: w, info: vinfo }; j++; break; }
        // adverbs like "recently", "allegedly" — allow one passthrough
        if (/ly$/.test(w.low)) continue;
        if (w.low === "to" || w.low === "be") continue;
        break;
      }
      if (!head) {
        if (denial) {
          // "denies meeting X" — look ahead one token for the gerund
          var nxt = tokens[j];
          if (nxt && nxt.kind === "word" && verbInfo(nxt.low)) {
            head = { tok: nxt, info: verbInfo(nxt.low) };
            negated = true;
            j++;
          } else continue;
        } else continue;
      }

      // passive: be-aux + past participle + (usually) "by"
      var headPast = isPastForm(head.tok.low, head.info.lemma);
      if (sawBe && headPast) passive = true;

      // tense
      var tense = future ? "future" : (headPast || sawHave ? "past" : "present");

      // pre-group future markers: "plans on making", "expected to purchase"
      for (var k = Math.max(0, i - 3); k < i; k++) {
        var a = tokens[k], b = tokens[k + 1];
        if (!a || !b || a.kind !== "word" || b.kind !== "word") continue;
        for (var f = 0; f < FUTURE_MARKERS.length; f++) {
          if (a.low === FUTURE_MARKERS[f][0] && b.low === FUTURE_MARKERS[f][1]) {
            future = true; tense = "future";
          }
        }
      }

      return {
        lemma: head.info.lemma, group: head.info.group,
        start: tokens[i].start, end: head.tok.end,
        groupText: null, // caller slices
        tense: tense, negated: negated || denial, passive: passive,
        planned: tense === "future",
        idxFrom: i, idxTo: j
      };
    }
    return null;
  }

  function findSubject(tokens, verbIdxFrom) {
    for (var i = verbIdxFrom - 1; i >= 0; i--) {
      var t = tokens[i];
      if (t.kind === "entity") {
        return { kind: "entity", text: t.text, start: t.start, end: t.end, entityIdx: t.entityIdx, type: t.type };
      }
      if (t.kind === "word") {
        if (PRONOUN_SUBJ[t.low]) return { kind: "pronoun", text: t.text, start: t.start, end: t.end };
        if (SUBJECT_NOUNS[t.low]) return { kind: "np", text: t.text, start: t.start, end: t.end };
        // bare ALLCAPS token reads as a surname fragment ("WALSH denies…")
        if (/^[A-Z][A-Z'\u2019-]+$/.test(t.text)) return { kind: "name", text: t.text, start: t.start, end: t.end };
        if (DETERMINERS[t.low] || PREPOSITIONS[t.low]) continue;
      }
    }
    return null;
  }

  function findObjects(tokens, verbIdxTo) {
    var out = [];
    var prep = null;
    var drift = 0; // word tokens since the last entity — stop wandering clauses
    for (var i = verbIdxTo; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.kind === "word") {
        if (t.low === "and") {
          var nxA = tokens[i + 1], nxB = tokens[i + 2];
          var listOk = (nxA && nxA.kind === "entity") ||
                       (nxA && nxA.kind === "word" && NOUNY_VERBS[nxA.low] &&
                        nxB && nxB.kind === "entity");
          if (!listOk && out.length) break; // not a list
          continue;
        }
        if (PREPOSITIONS[t.low]) { prep = t.low; drift++; continue; }
        if (PRONOUN_OBJ[t.low]) {
          out.push({ prep: prep, kind: "pronoun", text: t.text, start: t.start, end: t.end });
          continue;
        }
        if (verbInfo(t.low) && out.length) break; // next verb begins → stop
        drift++;
        if (drift > 7 && out.length) break;
        continue;
      }
      if (t.kind === "punct") {
        if (t.text === "," || t.text === "&") continue; // lists carry on
        break;
      }
      if (t.kind === "entity") {
        out.push({ prep: prep, kind: "entity", text: t.text, start: t.start, end: t.end, entityIdx: t.entityIdx, type: t.type });
        drift = 0;
        // the preposition only survives into a list: "to X, Y and Z"
        var sep = tokens[i + 1];
        var isSep = sep && ((sep.kind === "punct" && (sep.text === "," || sep.text === "&")) ||
                            (sep.kind === "word" && sep.low === "and"));
        if (!isSep) prep = null;
      }
    }
    return out;
  }

  /* ---------------- main ---------------- */

  function analyse(sentence, entityRanges) {
    var tokens = tokenise(sentence, entityRanges);
    var clauseTokenSets = splitClauses(tokens);
    var clauses = [];
    var prevSubject = null;

    clauseTokenSets.forEach(function (ct) {
      if (!ct.length) return;
      var vg = findVerbGroup(ct);
      if (!vg) {
        // verbless fragment ("BAINES,") still names the running subject
        for (var x = ct.length - 1; x >= 0; x--) {
          if (ct[x].kind === "entity" && ct[x].type === "person") {
            prevSubject = { kind: "entity", text: ct[x].text, start: ct[x].start, end: ct[x].end, entityIdx: ct[x].entityIdx, type: ct[x].type };
            break;
          }
        }
        return;
      }
      var subject = findSubject(ct, vg.idxFrom);
      if (!subject && (ct._inherit || true) && prevSubject) {
        // relative clause / coordination inherits the prior subject
        subject = prevSubject;
      }
      if (subject && subject.kind !== "pronoun") prevSubject = subject;
      var objects = findObjects(ct, vg.idxTo);

      // passive flips roles: "X was contacted by Y" → Y verb X
      if (vg.passive) {
        var byObj = null;
        for (var i = 0; i < objects.length; i++) {
          if (objects[i].prep === "by") { byObj = objects[i]; break; }
        }
        if (byObj && subject) {
          var oldSubj = subject;
          subject = { kind: byObj.kind, text: byObj.text, start: byObj.start, end: byObj.end, entityIdx: byObj.entityIdx, type: byObj.type };
          objects = objects.filter(function (o) { return o !== byObj; });
          objects.unshift({ prep: null, kind: oldSubj.kind, text: oldSubj.text, start: oldSubj.start, end: oldSubj.end, entityIdx: oldSubj.entityIdx, type: oldSubj.type });
        }
      }

      clauses.push({
        subject: subject,
        verb: {
          lemma: vg.lemma, group: vg.group,
          start: vg.start, end: vg.end,
          tense: vg.tense, negated: vg.negated, passive: vg.passive, planned: vg.planned
        },
        objects: objects,
        start: ct[0].start, end: ct[ct.length - 1].end
      });
    });
    return clauses;
  }

  /** Map a clause verb + object to a relationship type + direction.
   *  Returns { type, reverse } or null. */
  function relFor(verbGroupName, prep, targetType) {
    var g = VERB_GROUPS[verbGroupName];
    if (!g) return null;
    if (g.def === "_RETURN_EVENT") return { type: "_RETURN_EVENT", reverse: false };
    var t = null;
    if (prep && g.prepMap && g.prepMap[prep]) t = g.prepMap[prep];
    else if (g.targetMap && g.targetMap[targetType]) t = g.targetMap[targetType];
    else if (!g.targetMap && !g.prepMap) t = g.def;   // only generic groups fall back
    if (!t) return null;
    var reverse = /_rev$/.test(t);
    return { type: t.replace(/_rev$/, ""), reverse: reverse };
  }

  var CRLang = { analyse: analyse, relFor: relFor, tokenise: tokenise, VERB_GROUPS: VERB_GROUPS };
  if (typeof module !== "undefined" && module.exports) module.exports = CRLang;
  if (typeof window !== "undefined") window.CRLang = CRLang;
})();
