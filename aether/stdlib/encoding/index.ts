/**
 * Aether stdlib — `encoding` module.
 *
 * Encoding helpers for common serialization formats.  Built on the standard
 * built-ins (`JSON`, `TextEncoder`/`TextDecoder`, `btoa`/`atob`,
 * `encodeURIComponent`/`decodeURIComponent`).  For Base64 in Node we fall
 * back to `Buffer` when `btoa`/`atob` are unavailable; in the browser the
 * global `btoa`/`atob` are used directly.
 *
 * CSV is implemented by hand (handles quoted fields, embedded commas,
 * embedded newlines, and escaped double quotes per RFC 4180).
 *
 * The "simple subset" serializers for YAML, TOML, and msgpack are
 * deliberately minimal — they cover JSON-shaped values (primitives, arrays,
 * maps/objects) for round-tripping with the corresponding `json*` helpers,
 * and document their limitations in the README.
 */

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export function jsonStringify(v: any): string {
  return JSON.stringify(v);
}

export function jsonParse(s: string): any {
  assertString(s, "jsonParse");
  try {
    return JSON.parse(s);
  } catch (e: any) {
    throw new Error("jsonParse: " + (e?.message ?? String(e)));
  }
}

export function jsonPretty(v: any): string {
  return JSON.stringify(v, null, 2);
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

function utf8ToBytes(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  // Node fallback (older runtimes).
  const buf = Buffer.from(s, "utf8");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function bytesToUtf8(b: Uint8Array | number[]): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf8").decode(u8(b));
  }
  return Buffer.from(u8(b)).toString("utf8");
}

function u8(b: Uint8Array | number[]): Uint8Array {
  return b instanceof Uint8Array ? b : new Uint8Array(b);
}

function getBuffer(): any {
  const g = globalThis as any;
  return typeof g.Buffer !== "undefined" ? g.Buffer : null;
}

export function base64Encode(s: string): string {
  assertString(s, "base64Encode");
  const g = globalThis as any;
  if (typeof g.btoa === "function") {
    // btoa operates on Latin-1 strings; we must first UTF-8 encode.
    const bytes = utf8ToBytes(s);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return g.btoa(bin);
  }
  const Buffer = getBuffer();
  if (Buffer) return Buffer.from(s, "utf8").toString("base64");
  throw new Error("base64Encode: no base64 implementation available");
}

export function base64Decode(s: string): string {
  assertString(s, "base64Decode");
  const g = globalThis as any;
  if (typeof g.atob === "function") {
    const bin = g.atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytesToUtf8(bytes);
  }
  const Buffer = getBuffer();
  if (Buffer) return Buffer.from(s, "base64").toString("utf8");
  throw new Error("base64Decode: no base64 implementation available");
}

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------

export function hexEncode(s: string): string {
  assertString(s, "hexEncode");
  const bytes = utf8ToBytes(s);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

export function hexDecode(s: string): string {
  assertString(s, "hexDecode");
  if (s.length % 2 !== 0) throw new Error("hexDecode: odd-length input");
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const b = parseInt(s.substr(i * 2, 2), 16);
    if (Number.isNaN(b)) throw new Error("hexDecode: invalid hex digit at index " + i * 2);
    bytes[i] = b;
  }
  return bytesToUtf8(bytes);
}

// ---------------------------------------------------------------------------
// UTF-8 / bytes
// ---------------------------------------------------------------------------

export function utf8Encode(s: string): number[] {
  assertString(s, "utf8Encode");
  return Array.from(utf8ToBytes(s));
}

export function utf8Decode(bytes: Uint8Array | number[]): string {
  return bytesToUtf8(bytes);
}

export function bytesToString(bytes: Uint8Array | number[]): string {
  return bytesToUtf8(bytes);
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

export function urlEncode(s: string): string {
  assertString(s, "urlEncode");
  return encodeURIComponent(s);
}

export function urlDecode(s: string): string {
  assertString(s, "urlDecode");
  try {
    return decodeURIComponent(s);
  } catch (e: any) {
    throw new Error("urlDecode: " + (e?.message ?? String(e)));
  }
}

// `urlencode(v)` — alias: form-encode an object/map of key-value pairs.
export function urlencode(v: any): string {
  if (v && typeof v === "object") {
    const entries = v instanceof Map ? Array.from(v.entries()) : Object.entries(v);
    return entries
      .map(([k, val]) => encodeURIComponent(String(k)) + "=" + encodeURIComponent(String(val)))
      .join("&");
  }
  if (typeof v === "string") return encodeURIComponent(v);
  throw new Error("urlencode: expected string or object");
}

export function queryParse(s: string): any {
  assertString(s, "queryParse");
  const out: any = {};
  if (s === "") return out;
  const qs = s.startsWith("?") ? s.slice(1) : s;
  for (const part of qs.split("&")) {
    if (part === "") continue;
    const eq = part.indexOf("=");
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? "" : part.slice(eq + 1);
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

export function queryStringify(obj: any): string {
  if (!obj || typeof obj !== "object") throw new Error("queryStringify: expected object");
  const entries = obj instanceof Map ? Array.from(obj.entries()) : Object.entries(obj);
  return entries
    .map(([k, v]) => encodeURIComponent(String(k)) + "=" + encodeURIComponent(String(v)))
    .join("&");
}

// ---------------------------------------------------------------------------
// CSV — RFC 4180 subset
// ---------------------------------------------------------------------------

export function csvParse(s: string): string[][] {
  assertString(s, "csvParse");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Flush the last field/row if any.
  if (field !== "" || row.length > 0 || inQuotes) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function csvStringify(rows: any[][]): string {
  if (!Array.isArray(rows)) throw new Error("csvStringify: expected array of arrays");
  const out: string[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) throw new Error("csvStringify: each row must be an array");
    const cells = row.map((c) => csvField(c));
    out.push(cells.join(","));
  }
  return out.join("\n");
}

function csvField(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ---------------------------------------------------------------------------
// YAML — minimal subset (mappings + sequences + scalars)
// ---------------------------------------------------------------------------

export function yamlStringify(v: any): string {
  return yamlEmit(v, 0);
}

function yamlEmit(v: any, indent: number): string {
  const pad = "  ".repeat(indent);
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") {
    if (/[:{}\[\],&*#?|<>=!%@`"'\n]/.test(v) || v.trim() === "") return JSON.stringify(v);
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return v
      .map((x) => {
        const item = yamlEmit(x, indent + 1);
        return pad + "- " + item.replace(/\n/g, "\n" + "  ".repeat(indent + 1));
      })
      .join("\n");
  }
  if (typeof v === "object") {
    const entries = v instanceof Map ? Array.from(v.entries()) : Object.entries(v);
    if (entries.length === 0) return "{}";
    return entries
      .map(([k, val]) => {
        const key = String(k);
        const valStr = yamlEmit(val, indent + 1);
        if (valStr.includes("\n")) {
          return pad + key + ":\n" + valStr;
        }
        return pad + key + ": " + valStr;
      })
      .join("\n");
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// TOML — minimal subset (flat tables)
// ---------------------------------------------------------------------------

export function tomlStringify(v: any): string {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("tomlStringify: expected a top-level object/map");
  }
  const entries = v instanceof Map ? Array.from(v.entries()) : Object.entries(v);
  const lines: string[] = [];
  const table: string[] = [];
  for (const [k, val] of entries) {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      lines.push("[" + String(k) + "]");
      const inner = val instanceof Map ? Array.from(val.entries()) : Object.entries(val);
      for (const [ik, iv] of inner) {
        lines.push(ik + " = " + tomlValue(iv));
      }
      lines.push("");
    } else {
      table.push(String(k) + " = " + tomlValue(val));
    }
  }
  return [...table, ...lines].join("\n");
}

function tomlValue(v: any): string {
  if (v === null || v === undefined) throw new Error("tomlStringify: TOML has no null");
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isInteger(v) ? v.toString() : v.toString();
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(tomlValue).join(", ") + "]";
  throw new Error("tomlStringify: unsupported value type " + typeof v);
}

// ---------------------------------------------------------------------------
// msgpack — minimal: same shape as JSON, packed with a 1-byte type tag
// (this is NOT the real msgpack spec — it is a tiny, self-describing subset
// for demo purposes; see README).
// ---------------------------------------------------------------------------

export function msgpackPack(v: any): number[] {
  const bytes: number[] = [];
  packWrite(v, bytes);
  return bytes;
}

function packWrite(v: any, out: number[]): void {
  if (v === null || v === undefined) {
    out.push(0xc0);
  } else if (typeof v === "boolean") {
    out.push(v ? 0xc3 : 0xc2);
  } else if (typeof v === "number") {
    if (Number.isInteger(v) && v >= 0 && v <= 0x7f) out.push(v);
    else if (Number.isInteger(v) && v < 0 && v >= -32) out.push(v & 0xff);
    else {
      out.push(0xcb);
      const buf = new DataView(new ArrayBuffer(8));
      buf.setFloat64(0, v);
      for (let i = 0; i < 8; i++) out.push(buf.getUint8(i));
    }
  } else if (typeof v === "string") {
    const strBytes = utf8ToBytes(v);
    if (strBytes.length < 32) out.push(0xa0 | strBytes.length);
    else if (strBytes.length < 256) {
      out.push(0xd9);
      out.push(strBytes.length);
    } else {
      out.push(0xda);
      out.push((strBytes.length >> 8) & 0xff);
      out.push(strBytes.length & 0xff);
    }
    for (let i = 0; i < strBytes.length; i++) out.push(strBytes[i]);
  } else if (Array.isArray(v)) {
    if (v.length < 16) out.push(0x90 | v.length);
    else if (v.length < 256) {
      out.push(0xdc);
      out.push((v.length >> 8) & 0xff);
      out.push(v.length & 0xff);
    }
    for (const x of v) packWrite(x, out);
  } else if (typeof v === "object") {
    const entries = v instanceof Map ? Array.from(v.entries()) : Object.entries(v);
    if (entries.length < 16) out.push(0x80 | entries.length);
    else {
      out.push(0xde);
      out.push((entries.length >> 8) & 0xff);
      out.push(entries.length & 0xff);
    }
    for (const [k, val] of entries) {
      packWrite(String(k), out);
      packWrite(val, out);
    }
  } else {
    out.push(0xc0);
  }
}

// ---------------------------------------------------------------------------
function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") throw new Error(fn + ": expected string, got " + typeof x);
}

// ---------------------------------------------------------------------------
export const MANIFEST = {
  module: "encoding",
  fns: [
    { name: "jsonStringify", sig: "(v: any) -> string", desc: "Compact JSON encoding." },
    { name: "jsonParse", sig: "(s: string) -> any", desc: "Parse JSON into a value." },
    { name: "jsonPretty", sig: "(v: any) -> string", desc: "Pretty (2-space) JSON encoding." },
    { name: "base64Encode", sig: "(s: string) -> string", desc: "UTF-8 -> Base64." },
    { name: "base64Decode", sig: "(s: string) -> string", desc: "Base64 -> UTF-8." },
    { name: "hexEncode", sig: "(s: string) -> string", desc: "UTF-8 -> hex." },
    { name: "hexDecode", sig: "(s: string) -> string", desc: "Hex -> UTF-8." },
    { name: "utf8Encode", sig: "(s: string) -> int[]", desc: "UTF-8 byte array." },
    { name: "utf8Decode", sig: "(bytes: int[]|Uint8Array) -> string", desc: "Decode UTF-8 bytes." },
    { name: "bytesToString", sig: "(bytes: int[]|Uint8Array) -> string", desc: "Alias of utf8Decode." },
    { name: "urlEncode", sig: "(s: string) -> string", desc: "encodeURIComponent." },
    { name: "urlDecode", sig: "(s: string) -> string", desc: "decodeURIComponent." },
    { name: "csvParse", sig: "(s: string) -> string[][]", desc: "RFC 4180 CSV parser." },
    { name: "csvStringify", sig: "(rows: any[][]) -> string", desc: "RFC 4180 CSV writer." },
    { name: "yamlStringify", sig: "(v: any) -> string", desc: "Minimal YAML emit (subset)." },
    { name: "tomlStringify", sig: "(v: any) -> string", desc: "Minimal TOML emit (subset)." },
    { name: "msgpackPack", sig: "(v: any) -> int[]", desc: "Tiny msgpack-style binary pack (demo)." },
    { name: "urlencode", sig: "(v: any) -> string", desc: "Form-encode a map/object." },
    { name: "queryParse", sig: "(s: string) -> map", desc: "Parse a query string into an object." },
    { name: "queryStringify", sig: "(obj: object) -> string", desc: "Stringify an object into a query string." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("jsonStringify", jsonStringify);
  registerBuiltin("jsonParse", jsonParse);
  registerBuiltin("jsonPretty", jsonPretty);
  registerBuiltin("base64Encode", base64Encode);
  registerBuiltin("base64Decode", base64Decode);
  registerBuiltin("hexEncode", hexEncode);
  registerBuiltin("hexDecode", hexDecode);
  registerBuiltin("utf8Encode", utf8Encode);
  registerBuiltin("utf8Decode", utf8Decode);
  registerBuiltin("bytesToString", bytesToString);
  registerBuiltin("urlEncode", urlEncode);
  registerBuiltin("urlDecode", urlDecode);
  registerBuiltin("csvParse", csvParse);
  registerBuiltin("csvStringify", csvStringify);
  registerBuiltin("yamlStringify", yamlStringify);
  registerBuiltin("tomlStringify", tomlStringify);
  registerBuiltin("msgpackPack", msgpackPack);
  registerBuiltin("urlencode", urlencode);
  registerBuiltin("queryParse", queryParse);
  registerBuiltin("queryStringify", queryStringify);
}
