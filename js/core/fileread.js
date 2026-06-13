/* SOLAR — fileread.js
 * Read dropped files into ingestible text, fully offline & dependency-free.
 *   .txt / .md / .log / .csv  → text (csv routed to the import wizard by the UI)
 *   .json (.chartroom.json)   → case object (load/replace)
 *   .docx                     → text (unzip word/document.xml, inflate, strip tags)
 *   .pdf                      → best-effort text (uncompressed or Flate content streams)
 * Uses only platform primitives present in the browser AND in Node:
 *   DecompressionStream, Blob, Response, TextDecoder. No DOMParser (Node-testable).
 * Browser: window.CRFileRead.  Node: module.exports.
 */
(function () {
  "use strict";

  var MAX_INPUT = 30 * 1024 * 1024;   // reject input files larger than 30 MB
  var MAX_TEXT  = 6 * 1024 * 1024;    // cap decompressed/accumulated text (zip-bomb guard)

  /* ------------------------------------------------------------ inflate */
  async function inflate(u8, format, cap) {
    if (typeof DecompressionStream === "undefined")
      throw new Error("DecompressionStream unavailable");
    var ds = new DecompressionStream(format);          // "deflate-raw" | "deflate"
    var reader = new Blob([u8]).stream().pipeThrough(ds).getReader();
    var chunks = [], total = 0;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      total += r.value.length;
      if (cap && total > cap) { try { reader.cancel(); } catch (_) {} throw new Error("decompressed size exceeds cap"); }
      chunks.push(r.value);
    }
    var out = new Uint8Array(total), off = 0;
    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
    return out;
  }
  var inflateRaw  = function (u8) { return inflate(u8, "deflate-raw", MAX_TEXT); }; // zip member
  var inflateZlib = function (u8) { return inflate(u8, "deflate", MAX_TEXT); };     // pdf FlateDecode

  /* ------------------------------------------------------------ zip */
  function u8of(buf) { return buf instanceof Uint8Array ? buf : new Uint8Array(buf); }

  // Parse a zip central directory → { name: {method, bytes} } (compressed bytes).
  function zipEntries(buf) {
    var u8 = u8of(buf);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var eocd = -1, min = Math.max(0, u8.length - 22 - 65536);
    for (var i = u8.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("zip: EOCD not found");
    var count = dv.getUint16(eocd + 10, true);
    var off = dv.getUint32(eocd + 16, true);
    var out = {};
    for (var k = 0; k < count && off + 46 <= u8.length; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break; // central file header sig
      var method = dv.getUint16(off + 10, true);
      var csize  = dv.getUint32(off + 20, true);
      var fnl    = dv.getUint16(off + 28, true);
      var efl    = dv.getUint16(off + 30, true);
      var cml    = dv.getUint16(off + 32, true);
      var lho    = dv.getUint32(off + 42, true);
      var name   = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + fnl));
      // walk the local header to find where the data actually begins
      var lfnl = dv.getUint16(lho + 26, true);
      var lefl = dv.getUint16(lho + 28, true);
      var dstart = lho + 30 + lfnl + lefl;
      out[name] = { method: method, bytes: u8.subarray(dstart, dstart + csize) };
      off += 46 + fnl + efl + cml;
    }
    return out;
  }

  function decodeEntities(s) {
    return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
            .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); });
  }

  /* ------------------------------------------------------------ docx */
  async function docxToText(buf) {
    var entries = zipEntries(buf);
    var ent = entries["word/document.xml"];
    if (!ent) throw new Error("docx: word/document.xml not found");
    var xmlBytes = ent.method === 0 ? ent.bytes : await inflateRaw(ent.bytes);
    var xml = new TextDecoder().decode(xmlBytes);
    // structure → whitespace BEFORE stripping tags
    xml = xml
      .replace(/<w:tab\b[^>]*\/?>/g, "\t")
      .replace(/<w:br\b[^>]*\/?>/g, "\n")
      .replace(/<w:cr\b[^>]*\/?>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<[^>]+>/g, "");
    xml = decodeEntities(xml);
    return xml.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
              .replace(/[ \t]{2,}/g, " ").trim();
  }

  /* ------------------------------------------------------------ pdf */
  // Decode the text-showing operators of a content stream to plain text.
  function pdfOpsToText(s) {
    var out = "";
    var re = /\((?:\\.|[^\\()])*\)|\[(?:[^\]\\]|\\.)*\]|T\*|Td|TD|'|"/g, m;
    function unesc(x) {
      return x.replace(/\\(\d{1,3}|.)/g, function (_, c) {
        if (/^[0-7]{1,3}$/.test(c)) return String.fromCharCode(parseInt(c, 8));
        return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" })[c] || c;
      });
    }
    while ((m = re.exec(s))) {
      var t = m[0];
      if (t === "T*" || t === "Td" || t === "TD" || t === "'") out += "\n";
      else if (t.charCodeAt(0) === 40 /* ( */) out += unesc(t.slice(1, -1));
      else if (t.charCodeAt(0) === 91 /* [ */) {
        var rr = /\((?:\\.|[^\\()])*\)/g, mm;
        while ((mm = rr.exec(t))) out += unesc(mm[0].slice(1, -1));
      }
    }
    return out;
  }

  function printableRatio(s) {
    if (!s) return 0;
    var ok = s.replace(/[^\x20-\x7e\n\t]/g, "").length;
    return ok / s.length;
  }

  // Best-effort: works on text-based PDFs (incl. these specimens). Returns "" if the
  // PDF is image/scanned/font-subset and no readable text can be recovered — the UI
  // then asks the user to drop the .docx/.txt or paste the text. Never returns garbage.
  async function pdfToText(buf) {
    var u8 = u8of(buf);
    var s = new TextDecoder("latin1").decode(u8);
    var out = "";
    var re = /stream\r?\n/g, m;
    while ((m = re.exec(s))) {
      var a = m.index + m[0].length;
      var e = s.indexOf("endstream", a);
      if (e < 0) continue;
      var seg = s.slice(a, e);
      var txt = pdfOpsToText(seg);
      if (txt.replace(/\s/g, "").length < 8) {       // looks compressed → try inflate
        try {
          var inf = await inflateZlib(u8.subarray(a, e));
          txt = pdfOpsToText(new TextDecoder("latin1").decode(inf));
        } catch (_) { /* not Flate / not text */ }
      }
      if (printableRatio(txt) > 0.85 && /[A-Za-z0-9]/.test(txt) && out.length < MAX_TEXT) out += txt + "\n";
    }
    out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (out.replace(/\s/g, "").length < 20 || printableRatio(out) < 0.8) return "";
    return out;
  }

  /* ------------------------------------------------------------ classify + read */
  function extOf(name) {
    var mm = /\.([a-z0-9]+)$/i.exec(name || "");
    return mm ? mm[1].toLowerCase() : "";
  }
  function looksLikeCase(obj) {
    return !!obj && typeof obj === "object" &&
      (Array.isArray(obj.entities) || (obj.meta && Array.isArray(obj.links)) ||
       (obj.meta && obj.entities));
  }

  // Read a browser File → { kind, name, text?, json?, file?, reason? }
  // kind ∈ 'case' | 'csv' | 'text' | 'unsupported'
  async function readFile(file) {
    var name = file.name || "file";
    var ext = extOf(name);
    if (typeof file.size === "number" && file.size > MAX_INPUT)
      return { kind: "unsupported", name: name, reason: "file too large (>30 MB)" };
    try {
      if (ext === "json") {
        var raw = await file.text();
        var obj; try { obj = JSON.parse(raw); } catch (e) { return { kind: "unsupported", name: name, reason: "invalid JSON" }; }
        if (looksLikeCase(obj)) return { kind: "case", name: name, json: obj };
        return { kind: "unsupported", name: name, reason: "JSON is not a Chart Room case" };
      }
      if (ext === "csv") return { kind: "csv", name: name, file: file };
      if (ext === "txt" || ext === "md" || ext === "log" || ext === "text" || ext === "") {
        return { kind: "text", name: name, text: await file.text() };
      }
      if (ext === "docx") {
        var d = await docxToText(await file.arrayBuffer());
        if (!d) return { kind: "unsupported", name: name, reason: "no text in .docx" };
        return { kind: "text", name: name, text: d };
      }
      if (ext === "pdf") {
        var p = await pdfToText(await file.arrayBuffer());
        if (!p) return { kind: "unsupported", name: name, reason: "PDF text not readable — drop the .docx/.txt or paste the text" };
        return { kind: "text", name: name, text: p };
      }
      if (ext === "doc") return { kind: "unsupported", name: name, reason: "legacy .doc not supported — save as .docx" };
      return { kind: "unsupported", name: name, reason: "unsupported file type ." + ext };
    } catch (err) {
      return { kind: "unsupported", name: name, reason: (err && err.message) || "read error" };
    }
  }

  var API = {
    readFile: readFile,
    docxToText: docxToText,
    pdfToText: pdfToText,
    zipEntries: zipEntries,
    classify: function (name) { return extOf(name); },
    printableRatio: printableRatio
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.CRFileRead = API;
})();
