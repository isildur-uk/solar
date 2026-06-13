/* SOLAR — docxzip.js
 * Minimal zip surgeon for filling the subject-profile .docx templates fully
 * offline: parses the zip, edits the STORED word/document.xml (token fill)
 * and optionally swaps the STORED placeholder photo PNG, then rebuilds the
 * archive copying every other entry's compressed bytes verbatim.
 * No inflate needed — the build step stores exactly the entries we touch.
 * Browser: window.CRDocx. Node: module.exports (for round-trip tests).
 */
(function () {
  "use strict";

  /* ---------------- CRC32 ---------------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------------- zip parse ---------------- */

  function parseZip(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    // find EOCD (PK\x05\x06) scanning from the end
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65536); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("EOCD not found");
    var count = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);

    var entries = [];
    var p = cdOff;
    for (var e = 0; e < count; e++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("bad central header");
      var method = dv.getUint16(p + 10, true);
      var time = dv.getUint16(p + 12, true);
      var date = dv.getUint16(p + 14, true);
      var crc = dv.getUint32(p + 16, true);
      var csize = dv.getUint32(p + 20, true);
      var usize = dv.getUint32(p + 24, true);
      var nlen = dv.getUint16(p + 28, true);
      var elen = dv.getUint16(p + 30, true);
      var clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = "";
      for (var c2 = 0; c2 < nlen; c2++) name += String.fromCharCode(u8[p + 46 + c2]);
      // locate data after the local header (its own name/extra lengths)
      var lnlen = dv.getUint16(lho + 26, true);
      var lelen = dv.getUint16(lho + 28, true);
      var dataOff = lho + 30 + lnlen + lelen;
      entries.push({
        name: name, method: method, time: time, date: date,
        crc: crc, csize: csize, usize: usize,
        data: u8.subarray(dataOff, dataOff + csize)
      });
      p += 46 + nlen + elen + clen;
    }
    return entries;
  }

  /* ---------------- zip build ---------------- */

  function buildZip(entries) {
    var total = 0;
    entries.forEach(function (en) { total += 30 + en.name.length + en.data.length; });
    var cdSize = 0;
    entries.forEach(function (en) { cdSize += 46 + en.name.length; });
    var out = new Uint8Array(total + cdSize + 22);
    var dv = new DataView(out.buffer);
    var p = 0;
    var offsets = [];

    entries.forEach(function (en) {
      offsets.push(p);
      dv.setUint32(p, 0x04034b50, true);
      dv.setUint16(p + 4, 20, true);            // version needed
      dv.setUint16(p + 6, 0, true);             // flags
      dv.setUint16(p + 8, en.method, true);
      dv.setUint16(p + 10, en.time, true);
      dv.setUint16(p + 12, en.date, true);
      dv.setUint32(p + 14, en.crc, true);
      dv.setUint32(p + 18, en.data.length, true);
      dv.setUint32(p + 22, en.usize, true);
      dv.setUint16(p + 26, en.name.length, true);
      dv.setUint16(p + 28, 0, true);
      p += 30;
      for (var i = 0; i < en.name.length; i++) out[p++] = en.name.charCodeAt(i);
      out.set(en.data, p);
      p += en.data.length;
    });

    var cdStart = p;
    entries.forEach(function (en, idx) {
      dv.setUint32(p, 0x02014b50, true);
      dv.setUint16(p + 4, 20, true);
      dv.setUint16(p + 6, 20, true);
      dv.setUint16(p + 8, 0, true);
      dv.setUint16(p + 10, en.method, true);
      dv.setUint16(p + 12, en.time, true);
      dv.setUint16(p + 14, en.date, true);
      dv.setUint32(p + 16, en.crc, true);
      dv.setUint32(p + 20, en.data.length, true);
      dv.setUint32(p + 24, en.usize, true);
      dv.setUint16(p + 28, en.name.length, true);
      // extra/comment/disk/attrs zero
      dv.setUint16(p + 30, 0, true);
      dv.setUint16(p + 32, 0, true);
      dv.setUint16(p + 34, 0, true);
      dv.setUint16(p + 36, 0, true);
      dv.setUint32(p + 38, 0, true);
      dv.setUint32(p + 42, offsets[idx], true);
      p += 46;
      for (var i = 0; i < en.name.length; i++) out[p++] = en.name.charCodeAt(i);
    });

    dv.setUint32(p, 0x06054b50, true);
    dv.setUint16(p + 8, entries.length, true);
    dv.setUint16(p + 10, entries.length, true);
    dv.setUint32(p + 12, p - cdStart, true);
    dv.setUint32(p + 16, cdStart, true);
    p += 22;
    return out.subarray(0, p);
  }

  /* ---------------- text codecs ---------------- */

  function u8ToString(u8) {
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(u8);
    return Buffer.from(u8).toString("utf8");
  }
  function stringToU8(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    return new Uint8Array(Buffer.from(s, "utf8"));
  }

  function xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  /** Value → run-safe XML; newlines become <w:br/> inside the run. */
  function xmlValue(v) {
    var parts = String(v == null ? "" : v).split(/\r?\n/);
    return parts.map(xmlEsc).join('</w:t><w:br/><w:t xml:space="preserve">');
  }

  /* ---------------- fill ---------------- */

  /**
   * fill(templateBuffer, tokenMap, photo?) → Uint8Array of the finished .docx
   *  tokenMap: { TOKEN: "value", ... } — unknown {{TOKENS}} are blanked.
   *  photo: { entryName: "word/media/imageN.png", bytes: Uint8Array } | null
   */
  // Repeat a template UNIT (a <w:tr> row or a <w:tbl> table) once per record.
  // A repeatable unit carries the sentinel {{*ROW:NAME}} or {{*TBL:NAME}} in its
  // first cell. Each clone has its {{FIELD}} tokens filled from that record (then
  // the global map as fallback, else blank). Zero records -> the unit is removed
  // (the section header lives in a different row/table, so it stays).
  function expandUnit(xml, kind, name, recs, globalMap) {
    var sentinel = "{{*" + kind + ":" + name + "}}";
    var tag = kind === "ROW" ? "w:tr" : "w:tbl";
    var guard = 0;
    while (xml.indexOf(sentinel) !== -1 && guard++ < 500) {
      var at = xml.indexOf(sentinel);
      // find the ENCLOSING element start, matching <w:tr>/<w:tr ... > exactly and
      // NOT prefixes like <w:trPr>/<w:tblPr> (the bug that broke row cloning).
      var openRe = new RegExp("<" + tag + "[ >]", "g");
      var start = -1, mm;
      while ((mm = openRe.exec(xml)) !== null) { if (mm.index < at) start = mm.index; else break; }
      var endTag = "</" + tag + ">";
      var end = xml.indexOf(endTag, at);
      if (start === -1 || end === -1) break;
      end += endTag.length;
      var unit = xml.slice(start, end);
      var sentRe = new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      var built = (recs || []).map(function (rec) {
        return unit.replace(sentRe, "").replace(/\{\{([A-Z0-9_]+)\}\}/g, function (_, t) {
          if (rec && Object.prototype.hasOwnProperty.call(rec, t)) return xmlValue(rec[t]);
          if (globalMap && Object.prototype.hasOwnProperty.call(globalMap, t)) return xmlValue(globalMap[t]);
          return "";
        });
      }).join("");
      xml = xml.slice(0, start) + built + xml.slice(end);
    }
    return xml;
  }

  function expandSections(xml, sections, globalMap) {
    Object.keys(sections).forEach(function (name) {
      var recs = sections[name] || [];
      xml = expandUnit(xml, "ROW", name, recs, globalMap);
      xml = expandUnit(xml, "TBL", name, recs, globalMap);
    });
    return xml;
  }

  /**
   * fill(templateBuffer, tokenMap, photo?, sections?) -> Uint8Array .docx
   *  sections: { NAME: [ {FIELD: value,...}, ... ] } expands {{*ROW:NAME}} /
   *  {{*TBL:NAME}} repeatable units before the global token pass.
   */
  function fill(buf, tokenMap, photo, sections) {
    var entries = parseZip(buf);
    entries.forEach(function (en) {
      if (en.name === "word/document.xml") {
        if (en.method !== 0) throw new Error("document.xml is not stored");
        var xml = u8ToString(en.data);
        if (sections) xml = expandSections(xml, sections, tokenMap);
        xml = xml.replace(/\{\{([A-Z0-9_]+)\}\}/g, function (_, t) {
          return tokenMap && Object.prototype.hasOwnProperty.call(tokenMap, t)
            ? xmlValue(tokenMap[t]) : "";
        });
        var nd = stringToU8(xml);
        en.data = nd;
        en.usize = nd.length;
        en.csize = nd.length;
        en.crc = crc32(nd);
      } else if (photo && en.name === photo.entryName) {
        if (en.method !== 0) throw new Error("photo entry is not stored");
        en.data = photo.bytes;
        en.usize = photo.bytes.length;
        en.csize = photo.bytes.length;
        en.crc = crc32(photo.bytes);
      }
    });
    return buildZip(entries);
  }

  var CRDocx = { fill: fill, parseZip: parseZip, buildZip: buildZip, crc32: crc32 };
  if (typeof module !== "undefined" && module.exports) module.exports = CRDocx;
  if (typeof window !== "undefined") window.CRDocx = CRDocx;
})();
