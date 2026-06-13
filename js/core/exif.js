/* SOLAR — exif.js
 * Dependency-free JPEG EXIF reader. Extracts GPS latitude/longitude (and
 * DateTimeOriginal when present) so a geotagged photo can be pinned on the map.
 * Runs in the browser and in Node (for tests). No DOM, no libraries.
 *
 * Returns { lat, lon, dateTimeOriginal } | null. lat/lon are decimal degrees,
 * signed (S/W negative). Only the tags needed for geolocation are decoded.
 */
(function () {
  "use strict";

  // --- byte access with endianness ---
  function reader(view, little) {
    return {
      u16: function (o) { return view.getUint16(o, little); },
      u32: function (o) { return view.getUint32(o, little); },
      i32: function (o) { return view.getInt32(o, little); }
    };
  }

  function toView(input) {
    if (input instanceof ArrayBuffer) return new DataView(input);
    if (input && input.buffer && input.byteLength !== undefined) {
      return new DataView(input.buffer, input.byteOffset || 0, input.byteLength);
    }
    return null;
  }

  // Decode the base64 payload of a data: URL to a Uint8Array (browser + Node).
  function bytesFromDataUrl(dataUrl) {
    var i = String(dataUrl).indexOf(",");
    if (i === -1) return null;
    var b64 = dataUrl.slice(i + 1);
    var bin;
    if (typeof atob === "function") {
      bin = atob(b64);
      var arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      return arr;
    }
    if (typeof Buffer !== "undefined") {
      var buf = Buffer.from(b64, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    return null;
  }

  // Read one TIFF value (only the types we need: ASCII=2, RATIONAL=5).
  function readRational(R, off) { // unsigned rational -> number
    var num = R.u32(off), den = R.u32(off + 4);
    return den ? num / den : 0;
  }

  function dmsToDecimal(d, m, s) { return d + m / 60 + s / 3600; }

  // Walk an IFD, calling cb(tag, type, count, valueOffset) for each entry.
  function eachEntry(R, view, tiffStart, ifdOff, cb) {
    var count = R.u16(tiffStart + ifdOff);
    for (var e = 0; e < count; e++) {
      var entry = tiffStart + ifdOff + 2 + e * 12;
      var tag = R.u16(entry);
      var type = R.u16(entry + 2);
      var cnt = R.u32(entry + 4);
      cb(tag, type, cnt, entry + 8);
    }
  }

  function asciiAt(view, tiffStart, R, valOff, count) {
    // value is inline if <=4 bytes, else at the pointer
    var base = count <= 4 ? valOff : tiffStart + R.u32(valOff);
    var out = "";
    for (var i = 0; i < count; i++) {
      var c = view.getUint8(base + i);
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out;
  }

  function parseUnsafe(input) {
    var view = toView(input);
    if (!view || view.byteLength < 12) return null;
    if (view.getUint16(0) !== 0xFFD8) return null; // not a JPEG

    // find APP1 (Exif) segment
    var offset = 2, len = view.byteLength, app1 = -1;
    while (offset < len - 4) {
      if (view.getUint8(offset) !== 0xFF) break;
      var marker = view.getUint8(offset + 1);
      var size = view.getUint16(offset + 2);
      if (marker === 0xE1) { app1 = offset + 4; break; }
      if (marker === 0xD9 || marker === 0xDA) break; // EOI / SOS
      offset += 2 + size;
    }
    if (app1 === -1) return null;

    // "Exif\0\0"
    if (view.getUint32(app1) !== 0x45786966) return null;
    var tiff = app1 + 6;
    var endian = view.getUint16(tiff);
    var little = endian === 0x4949; // 'II'
    if (!little && endian !== 0x4D4D) return null; // 'MM'
    var R = reader(view, little);
    if (R.u16(tiff + 2) !== 0x002A) return null;

    var ifd0 = R.u32(tiff + 4);
    var gpsIfd = -1, exifIfd = -1;
    eachEntry(R, view, tiff, ifd0, function (tag, type, cnt, valOff) {
      if (tag === 0x8825) gpsIfd = R.u32(valOff);       // GPS IFD pointer
      else if (tag === 0x8769) exifIfd = R.u32(valOff); // Exif sub-IFD pointer
    });

    var result = { lat: null, lon: null, dateTimeOriginal: null };

    if (gpsIfd !== -1) {
      var latRef = "N", lonRef = "E", lat = null, lon = null;
      eachEntry(R, view, tiff, gpsIfd, function (tag, type, cnt, valOff) {
        if (tag === 1) latRef = asciiAt(view, tiff, R, valOff, cnt) || "N";
        else if (tag === 3) lonRef = asciiAt(view, tiff, R, valOff, cnt) || "E";
        else if (tag === 2 || tag === 4) {
          // 3 RATIONALs at the pointer (8 bytes each)
          var p = tiff + R.u32(valOff);
          var d = readRational(R, p), m = readRational(R, p + 8), s = readRational(R, p + 16);
          var dec = dmsToDecimal(d, m, s);
          if (tag === 2) lat = dec; else lon = dec;
        }
      });
      if (lat !== null && lon !== null) {
        result.lat = /S/i.test(latRef) ? -lat : lat;
        result.lon = /W/i.test(lonRef) ? -lon : lon;
      }
    }

    if (exifIfd !== -1) {
      eachEntry(R, view, tiff, exifIfd, function (tag, type, cnt, valOff) {
        if (tag === 0x9003) { // DateTimeOriginal "YYYY:MM:DD HH:MM:SS"
          result.dateTimeOriginal = asciiAt(view, tiff, R, valOff, cnt) || null;
        }
      });
    }

    if (result.lat === null && result.dateTimeOriginal === null) return null;
    // Reject obviously invalid coordinates.
    if (result.lat !== null && (Math.abs(result.lat) > 90 || Math.abs(result.lon) > 180)) {
      result.lat = null; result.lon = null;
    }
    return result;
  }

  // Public entry: never throws. Hostile/truncated EXIF (out-of-bounds IFD
  // counts/pointers) makes DataView reads raise RangeError — contain it and
  // honour the documented "... | null" contract so the photo-add flow is safe.
  function parse(input) {
    try { return parseUnsafe(input); }
    catch (e) { return null; }
  }

  function parseDataUrl(dataUrl) {
    var bytes = bytesFromDataUrl(dataUrl);
    return bytes ? parse(bytes) : null;
  }

  // EXIF "YYYY:MM:DD HH:MM:SS" -> ISO date (date part) for the timeline.
  function exifDateToISO(s) {
    var m = String(s || "").match(/^(\d{4}):(\d{2}):(\d{2})/);
    return m ? (m[1] + "-" + m[2] + "-" + m[3]) : null;
  }

  var CRExif = { parse: parse, parseDataUrl: parseDataUrl, exifDateToISO: exifDateToISO };

  if (typeof module !== "undefined" && module.exports) module.exports = CRExif;
  if (typeof window !== "undefined") window.CRExif = CRExif;
})();
