/* SOLAR — profiles.js
 * Auto-populated NCA subject profiles from a person entity and everything
 * linked to it: the Short and Long .docx prototypes (filled offline via
 * CRDocx, photo placeholder swapped with the node face) plus a standalone
 * print-ready HTML profile carrying the full photo gallery.
 */
(function () {
  "use strict";

  var U = window.CRUtil, F = window.CRFormat;
  var store = null;

  function init(caseStore) { store = caseStore; }

  /* ---------------- subject data collection ---------------- */

  function linkedOf(personId, type) {
    var out = [];
    store.links.forEach(function (l) {
      var otherId = l.from === personId ? l.to : (l.to === personId ? l.from : null);
      if (!otherId) return;
      var e = store.getEntity(otherId);
      if (e && e.type === type) out.push({ e: e, link: l });
    });
    return out;
  }

  function collect(personId) {
    var p = store.getEntity(personId);
    if (!p || p.type !== "person") return null;
    var a = p.attrs || {};
    var name = F.splitName(p.label);
    var prov = p.provenance || {};
    var urn = prov.sourceRef || "";

    var addresses = linkedOf(personId, "address").concat(linkedOf(personId, "location"));
    var vehicles = linkedOf(personId, "vehicle");
    var phones = linkedOf(personId, "phone");
    var emails = linkedOf(personId, "email");
    var accounts = linkedOf(personId, "account");
    var orgs = linkedOf(personId, "organisation");
    var associates = linkedOf(personId, "person");

    return {
      entity: p, attrs: a, name: name, urn: urn,
      addresses: addresses, vehicles: vehicles, phones: phones,
      emails: emails, accounts: accounts, orgs: orgs, associates: associates,
      photos: p.media || [],
      face: (p.media || []).find(function (m) { return m.face; }) || null
    };
  }

  function commLines(s) {
    var lines = [];
    s.phones.forEach(function (x) {
      lines.push(F.phoneFreeText(x.e.ids && x.e.ids.e164 || x.e.label,
        x.e.attrs.kind === "IMEI" ? "" : "mobile") + (x.link.modality === "planned" ? " (planned)" : ""));
    });
    s.emails.forEach(function (x) { lines.push("Email " + ((x.e.ids && x.e.ids.email) || x.e.label)); });
    return lines;
  }

  function intelLines(s) {
    var lines = [];
    store.links.forEach(function (l) {
      if (l.from !== s.entity.id && l.to !== s.entity.id) return;
      if (!l.sentence) return;
      lines.push(F.gradeSentence(l.sentence, s.entity.provenance));
    });
    return lines.slice(0, 10);
  }

  /* ---------------- token maps ---------------- */

  function shortTokens(s) {
    var a = s.attrs;
    return {
      OPERATION: store.meta.operation || "",
      SUBJECT_NO: store.meta.caseRef || "",
      NAME_DOB: F.personFreeText(s.entity.label, a.dob),
      SUBJECT_DESCRIPTION: a.description || s.entity.sourceText || "",
      SUBJECT_SUMMARY: autoSummary(s),
      INTEL_RECENT: intelLines(s).join("\n"),
      SURNAME: F.surnameCaps(s.name.surname),
      FORENAMES: F.forenameTitle(s.name.forenames),
      DOB: a.dob ? F.ddmmyyyy(a.dob) : "",
      GENDER: a.gender || "",
      ALIASES: a.aka || "",
      NICKNAMES: a.nicknames || "",
      NATIONALITY: a.nationality || "",
      ETHNIC: a.ethnic || "",
      DESCRIPTION: a.description || "",
      LANGUAGES: a.languages || "",
      PNC: a.pnc || "",
      CRO: a.cro || "",
      DOC_PASSPORTS: a.passport || "",
      DOC_DL: a.drivingLicence || "",
      DOC_NI: a.nino || "",
      FIN_ACCOUNTS: s.accounts.map(function (x) { return x.e.label; }).join("\n"),
      FIN_ADDRESSES: "",
      FIN_LINKED: s.associates.map(function (x) { return F.personFreeText(x.e.label, x.e.attrs.dob); }).join("\n"),
      ADDR_REF: s.addresses.length ? "A1" : "",
      ADDR_LIST: s.addresses.map(function (x, i) {
        return "A" + (i + 1) + " — " + x.e.label + " (" + x.link.type.replace(/_/g, " ") + ")";
      }).join("\n"),
      ADDR_FULL: s.addresses[0] ? s.addresses[0].e.label : "",
      ADDR_PC: s.addresses[0] ? (s.addresses[0].e.attrs.postcode || "") : "",
      ADDR_OCCUPANTS: "",
      VEH_REF: s.vehicles.length ? "V1" : "",
      VEH_ASSOC: s.vehicles[0] ? s.vehicles[0].link.type.replace(/_/g, " ") : "",
      VEH_VRM: s.vehicles[0] ? F.vrm(s.vehicles[0].e.label) : "",
      VEH_VRM_LIST: s.vehicles.map(function (x) { return F.vrmFreeText(x.e.label); }).join("\n"),
      VEH_CMM: s.vehicles[0] ? [s.vehicles[0].e.attrs.colour, s.vehicles[0].e.attrs.make].filter(Boolean).join(" ") : "",
      VEH_CMM_LIST: s.vehicles.map(function (x) {
        return [x.e.attrs.colour, x.e.attrs.make].filter(Boolean).join(" ");
      }).join("\n"),
      VEH_TYPE: "",
      COMM_TYPE: s.phones.length || s.emails.length ? "Phone / Email" : "",
      COMM_IDS: commLines(s).join("\n"),
      COMM_DATE: F.todayDDMMYYYY(),
      COMM_URN: s.urn
    };
  }

  function longTokens(s) {
    var a = s.attrs;
    var t = shortTokens(s);   // shared personal-detail tokens land where present
    t.L_SUBJECT = F.personFreeText(s.entity.label);
    t.L_DOB = a.dob ? F.ddmmyyyy(a.dob) : "";
    t.L_OWNER = store.meta.officer || "";
    t.L_REFERENCE = store.meta.caseRef || "";
    t.L_DATE = F.todayDDMMYYYY();
    t.MOBILE = s.phones[0] ? F.phoneFreeText((s.phones[0].e.ids && s.phones[0].e.ids.e164) || s.phones[0].e.label, "mobile") : "";
    t.PHONE1 = s.phones[0] ? ((s.phones[0].e.ids && s.phones[0].e.ids.e164) || s.phones[0].e.label) : "";
    t.VEHICLE = s.vehicles[0] ? F.vrmFreeText(s.vehicles[0].e.label) : "";
    t.VEHICLE_SUMMARY = t.VEHICLE;
    t.VEH_MAKE = s.vehicles[0] ? (s.vehicles[0].e.attrs.make || "") : "";
    t.VEH_MODEL = s.vehicles[0] ? (s.vehicles[0].e.attrs.model || "") : "";
    t.VEH_COLOUR = s.vehicles[0] ? (s.vehicles[0].e.attrs.colour || "") : "";
    t.ORG_NAME = s.orgs[0] ? F.organisationCaps(s.orgs[0].e.label) : "";
    t.ORG_TYPE = s.orgs[0] ? (s.orgs[0].e.attrs.kind || "") : "";
    t.ORG_REL = s.orgs[0] ? s.orgs[0].link.type.replace(/_/g, " ") : "";
    t.ORG_NUMBER = s.orgs[0] ? (s.orgs[0].e.attrs.companyNumber || "") : "";
    t.POB = a.pob || "";
    return t;
  }

  /* ---------------- repeat sections (cloned rows in the NCA forms) ---------------- */
  function shortSections(s) {
    return {
      ADDR: s.addresses.map(function (x, i) {
        return { ADDR_REF: "A" + (i + 1),
                 ADDR_FULL: x.e.label + (x.e.attrs && x.e.attrs.postcode ? ", " + x.e.attrs.postcode : "") };
      }),
      VEH: s.vehicles.map(function (x, i) {
        return { VEH_REF: "V" + (i + 1), VEH_VRM: F.vrm(x.e.label),
                 VEH_CMM: [x.e.attrs.colour, x.e.attrs.make, x.e.attrs.model].filter(Boolean).join(" / ") };
      })
    };
  }
  function longSections(s) {
    return {
      ASSOC: s.associates.map(function (x) {
        var nm = F.splitName(x.e.label);
        return { ASSOC_SURNAME: F.surnameCaps(nm.surname), ASSOC_FORENAME: F.forenameTitle(nm.forenames),
                 ASSOC_DOB: x.e.attrs.dob ? F.ddmmyyyy(x.e.attrs.dob) : "",
                 ASSOC_ROLE: x.link.type.replace(/_/g, " ") };
      })
    };
  }

  function autoSummary(s) {
    var bits = [];
    bits.push(F.personFreeText(s.entity.label, s.attrs.dob) +
      " is charted in Solar with " + (s.phones.length + s.emails.length) +
      " communication identifiers, " + s.addresses.length + " addresses and " +
      s.vehicles.length + " vehicles.");
    if (s.associates.length) {
      bits.push("Associates: " + s.associates.map(function (x) { return x.e.label; }).join(", ") + ".");
    }
    if (s.orgs.length) {
      bits.push("Linked organisations: " + s.orgs.map(function (x) { return F.organisationCaps(x.e.label); }).join(", ") + ".");
    }
    bits.push("Auto-drafted by Solar on " + F.todayDDMMYYYY() + " — verify before dissemination.");
    return bits.join(" ");
  }

  /* ---------------- photo → PNG bytes ---------------- */

  function facePngBytes(s, cb) {
    if (!s.face) { cb(null); return; }
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas");
      var scale = Math.min(1, 640 / Math.max(img.width, img.height));
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      var dataUrl = c.toDataURL("image/png");
      var bin = atob(dataUrl.split(",")[1]);
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      cb(u8);
    };
    img.onerror = function () { cb(null); };
    img.src = s.face.dataUrl;
  }

  /* ---------------- exports ---------------- */

  function exportDocx(personId, kind) {
    var s = collect(personId);
    if (!s) { window.CRApp.status("Select a person entity first"); return; }
    var asset = kind === "long" ? "assets/profile_long.docx" : "assets/profile_short.docx";
    var photoEntry = kind === "long" ? "word/media/image1.png" : "word/media/image2.png";
    var tokens = kind === "long" ? longTokens(s) : shortTokens(s);
    var sections = kind === "long" ? longSections(s) : shortSections(s);

    fetch(asset).then(function (r) {
      if (!r.ok) throw new Error("template fetch " + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      facePngBytes(s, function (png) {
        try {
          var out = window.CRDocx.fill(new Uint8Array(buf),
            tokens, png ? { entryName: photoEntry, bytes: png } : null, sections);
          var blob = new Blob([out], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          });
          var aEl = document.createElement("a");
          aEl.href = URL.createObjectURL(blob);
          aEl.download = profileFileName(s, kind) + ".docx";
          aEl.click();
          setTimeout(function () { URL.revokeObjectURL(aEl.href); }, 400);
          window.CRApp.status("Profile exported — review every field before use");
        } catch (e) {
          window.CRApp.status("Profile build failed: " + e.message);
        }
      });
    }).catch(function (e) {
      window.CRApp.status("Template unavailable (" + e.message + ") — HTML profile still works");
    });
  }

  function profileFileName(s, kind) {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "" + p(d.getMonth() + 1) + p(d.getDate()) +
      " - Subject Profile " + (kind === "long" ? "Long" : "Short") + " - " +
      (store.meta.caseRef || "CASE") + " " + F.surnameCaps(s.name.surname);
  }

  function exportHtml(personId) {
    var s = collect(personId);
    if (!s) { window.CRApp.status("Select a person entity first"); return; }
    var esc = U.esc;
    var t = shortTokens(s);
    var num = function (n) { return n < 10 ? "0" + n : "" + n; };
    var field = function (label, value) {
      if (!value) return "";
      return '<div class="row"><div class="k">' + esc(label) + '</div><div class="v">' +
             esc(value).replace(/\n/g, "<br>") + '</div></div>';
    };
    var bignum = function (label, value) {
      if (!value) return "";
      return '<div class="row"><div class="k">' + esc(label) + '</div><div class="v num">' +
             esc(value).replace(/\n/g, "<br>") + '</div></div>';
    };
    var sectionN = 0;
    var section = function (title, inner) {
      if (!inner) return "";
      sectionN++;
      return '<section class="sec"><div class="sechead"><span class="secno">' + num(sectionN) +
             '</span><h2>' + esc(title) + '</h2></div><div class="secbody">' + inner + '</div></section>';
    };
    var photos = s.photos.map(function (m) {
      return '<figure><img src="' + m.dataUrl + '" alt=""><figcaption>' +
        esc(m.name) + (m.sourceRef ? " · " + esc(m.sourceRef) : "") + '</figcaption></figure>';
    }).join("");
    // Muller-Brockmann discipline: modular grid + 8px baseline, grotesque flush-left,
    // mono kicker labels, large tabular numerals, white/ink + a single amber accent
    // used ONLY for rules (text stays ink for WCAG contrast). Offline system fonts.
    var CSS =
      ":root{--ink:#141414;--ink2:#565248;--faint:#676b74;--rule:#e4e2dc;--paper:#fff;--accent:#c8941a;--bl:8px;--lh:24px;--maxw:960px;--mg:56px}" +
      "*{box-sizing:border-box}html,body{margin:0;background:#eceae4;color:var(--ink)}" +
      "body{font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:var(--lh);-webkit-font-smoothing:antialiased}" +
      ".num{font-family:'Geist Mono','IBM Plex Mono',Consolas,monospace;font-variant-numeric:tabular-nums;font-size:15px;letter-spacing:-.01em}" +
      ".mark{font:700 11px/1 'Geist Mono','IBM Plex Mono',Consolas,monospace;letter-spacing:.28em;text-transform:uppercase;text-align:center;color:var(--ink);background:#fff;border-top:3px solid var(--accent);border-bottom:1px solid var(--rule);padding:12px}" +
      ".wrap{max-width:var(--maxw);margin:0 auto;background:var(--paper);padding:48px var(--mg) 64px;box-shadow:0 1px 40px rgba(0,0,0,.06)}" +
      ".masthead{border-bottom:3px solid var(--accent);padding-bottom:24px;margin-bottom:32px}" +
      ".kicker{font:600 11px/1 'Geist Mono','IBM Plex Mono',Consolas,monospace;letter-spacing:.22em;text-transform:uppercase;color:var(--ink2);margin-bottom:16px}" +
      "h1{font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:800;font-size:44px;line-height:48px;letter-spacing:-.02em;margin:0 0 16px}" +
      ".meta{display:flex;flex-wrap:wrap;gap:8px 32px;font:12px/16px 'Geist Mono','IBM Plex Mono',Consolas,monospace;color:var(--ink2);font-variant-numeric:tabular-nums}" +
      ".meta b{color:var(--faint);font-weight:600;text-transform:uppercase;letter-spacing:.1em;font-size:10px;margin-right:6px}" +
      ".sec{margin:0 0 32px}.sechead{display:grid;grid-template-columns:3fr 9fr;gap:32px;align-items:baseline;border-bottom:2px solid var(--accent);padding-bottom:6px;margin-bottom:16px}" +
      ".secno{font:700 14px/1 'Geist Mono','IBM Plex Mono',Consolas,monospace;color:var(--ink)}" +
      ".sechead h2{font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:700;font-size:18px;line-height:24px;margin:0;letter-spacing:-.01em}" +
      ".row{display:grid;grid-template-columns:3fr 9fr;gap:32px;padding:0 0 8px;border-bottom:1px solid var(--rule);margin-bottom:8px}" +
      ".k{font:600 10px/16px 'Geist Mono','IBM Plex Mono',Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}" +
      ".v{color:var(--ink)}.prose{margin:0;max-width:64ch}" +
      ".gallery{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:192px}" +
      "figure img{width:192px;height:192px;object-fit:cover;border:1px solid var(--rule);display:block}" +
      "figcaption{font:10px/16px 'Geist Mono','IBM Plex Mono',Consolas,monospace;color:var(--ink2);margin-top:6px}" +
      "@page{margin:16mm}@media print{html,body{background:#fff}.wrap{max-width:none;margin:0;padding:0 8mm;box-shadow:none}.sec{break-inside:avoid}.gallery{break-inside:avoid}}" +
      "@media(max-width:620px){.wrap{padding:28px 20px}h1{font-size:32px;line-height:36px}.sechead,.row{grid-template-columns:1fr;gap:4px}}";
    var marking = esc(store.meta.classification || "OFFICIAL");
    var html = "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'>" +
      "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
      "<title>" + esc("Subject Profile — " + s.entity.label) + "</title><style>" + CSS + "</style></head><body>" +
      "<div class='mark'>" + marking + "</div><div class='wrap'>" +
      "<header class='masthead'><div class='kicker'>Subject profile</div>" +
      "<h1>" + esc(F.personFreeText(s.entity.label, s.attrs.dob)) + "</h1>" +
      "<div class='meta'><span><b>Operation</b>" + esc(store.meta.operation || "—") + "</span>" +
      "<span><b>Reference</b>" + esc(store.meta.caseRef || "—") + "</span>" +
      "<span><b>Grading</b>" + esc(F.gradeCode(s.entity.provenance)) + "</span>" +
      "<span><b>Generated</b>" + esc(F.todayDDMMYYYY()) + "</span></div></header>" +
      (photos ? section("Official photographs", '<div class="gallery">' + photos + '</div>') : "") +
      section("Personal details",
        field("Surname", t.SURNAME) + field("Forename(s)", t.FORENAMES) + bignum("DOB", t.DOB) +
        field("Aliases", t.ALIASES) + field("Nationality", t.NATIONALITY) +
        bignum("PNC", t.PNC) + bignum("CRO", t.CRO) + bignum("NINO", t.DOC_NI) + bignum("Passport", t.DOC_PASSPORTS)) +
      section("Communication identifiers", field("Identifiers", t.COMM_IDS)) +
      section("Addresses", field("Addresses", t.ADDR_LIST)) +
      section("Vehicles", field("VRM", t.VEH_VRM_LIST) + field("Colour / make", t.VEH_CMM_LIST)) +
      section("Associates & organisations",
        field("Associates", t.FIN_LINKED) +
        field("Organisations", s.orgs.map(function (x) { return F.organisationCaps(x.e.label); }).join("\n"))) +
      section("Assessment (auto-draft)", '<p class="prose">' + esc(t.SUBJECT_SUMMARY) + '</p>') +
      section("Recent & relevant intelligence", '<p class="prose">' + esc(t.INTEL_RECENT).replace(/\n/g, "<br>") + '</p>') +
      "</div><div class='mark'>" + marking + "</div></body></html>";
    U.download(profileFileName(s, "html") + ".html", html, "text/html");
    window.CRApp.status("HTML profile exported — print to PDF from the browser");
  }

  window.CRProfiles = { init: init, collect: collect, exportDocx: exportDocx, exportHtml: exportHtml, shortTokens: shortTokens, longTokens: longTokens };
})();
