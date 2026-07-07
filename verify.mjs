// verify.mjs — Core reader for doc.html v0.3 (manifest-first + writing-room-tail)
//
// Usage:
//   node verify.mjs              # validates ./doc.html (next to this script)
//   node verify.mjs <path>       # validates the given file
//
// Exit code 0 = PASS, 1 = FAIL.
// Shape detection (§5.0): if <nav id="manifest"> is present → manifest-first path;
// else if ≥1 <article data-witness> with valid-grammar witness → tail path;
// else FAIL.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "doc.html");
const html = fs.readFileSync(targetPath, "utf8");
// Also keep a Buffer for bytes-exact hashing (§6.2).
const htmlBuf = fs.readFileSync(targetPath);

// ────────────────────────────────────────────────────────────────────────────
// Witness grammar classification (§6.7)
// Returns "consecrated", "writing-room", or "invalid".
// ────────────────────────────────────────────────────────────────────────────
const CONSECRATED_RE = /^[0-9a-f]{64}$/;
const WRITING_ROOM_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;

function classifyWitness(v) {
  const isCons = CONSECRATED_RE.test(v);
  const isWR   = WRITING_ROOM_RE.test(v);
  if (isCons && isWR) {
    // Unreachable under the Disjointness Theorem.
    console.error(`FATAL: witness ${v} matches BOTH grammars — theorem violated`);
    process.exit(2);
  }
  if (isCons) return "consecrated";
  if (isWR)   return "writing-room";
  return "invalid";
}

// ────────────────────────────────────────────────────────────────────────────
// Attribute tokenizer — quote-aware (§6.4).
// ────────────────────────────────────────────────────────────────────────────
function parseTagAttrs(tagInner) {
  const attrs = {};
  const n = tagInner.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(tagInner[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && !/\s/.test(tagInner[i]) && tagInner[i] !== "=" && tagInner[i] !== '"' && tagInner[i] !== "'") i++;
    if (i === nameStart) { i++; continue; }
    const name = tagInner.slice(nameStart, i).toLowerCase();
    let j = i;
    while (j < n && /\s/.test(tagInner[j])) j++;
    if (j < n && tagInner[j] === "=") {
      j++;
      while (j < n && /\s/.test(tagInner[j])) j++;
      if (j < n && (tagInner[j] === '"' || tagInner[j] === "'")) {
        const quote = tagInner[j];
        j++;
        const valStart = j;
        while (j < n && tagInner[j] !== quote) j++;
        attrs[name] = tagInner.slice(valStart, j);
        if (j < n) j++;
      } else {
        const valStart = j;
        while (j < n && !/\s/.test(tagInner[j])) j++;
        attrs[name] = tagInner.slice(valStart, j);
      }
      i = j;
    } else {
      attrs[name] = null;
      i = j;
    }
  }
  return attrs;
}

// ────────────────────────────────────────────────────────────────────────────
// Comment masking — build a list of [start, end) char offsets for all HTML
// comments so that open/close tokens inside comments are ignored during
// the depth-walk (§6.2).
// ────────────────────────────────────────────────────────────────────────────
function buildCommentMasks(src) {
  const masks = [];
  let pos = 0;
  while (pos < src.length) {
    const s = src.indexOf("<!--", pos);
    if (s < 0) break;
    const e = src.indexOf("-->", s + 4);
    if (e < 0) break;
    masks.push([s, e + 3]);
    pos = e + 3;
  }
  return masks;
}

function inMaskedRange(idx, masks) {
  for (const [s, e] of masks) {
    if (s > idx) break;
    if (idx < e) return true;
  }
  return false;
}

// Convert a string (char) index to the corresponding byte offset in htmlBuf.
function byteOffset(strIdx) {
  return Buffer.byteLength(html.slice(0, strIdx), "utf8");
}

const masks = buildCommentMasks(html);

// ────────────────────────────────────────────────────────────────────────────
// §6.2 generalized depth-walk — parameterized on TAG (e.g. "section" or
// "article").  Returns { startByte, endByte, closeIdx } where:
//   startByte/endByte  = byte offsets into htmlBuf of the raw inner span
//   closeIdx           = char index of the < that opens the closing tag
// Returns null if the element is unterminated.
// ────────────────────────────────────────────────────────────────────────────
function witnessedBytes(openMatch, tag) {
  const openEnd = openMatch.index + openMatch[0].length;
  const DEPTH_RE = new RegExp(`<${tag}\\b|<\\/${tag}>`, "gi");
  let depth = 1, pos = openEnd;
  let closeIdx = -1;
  while (depth > 0 && pos < html.length) {
    DEPTH_RE.lastIndex = pos;
    const dm = DEPTH_RE.exec(html);
    if (!dm) break;
    if (inMaskedRange(dm.index, masks)) {
      pos = dm.index + dm[0].length;
      continue;
    }
    if (dm[0].toLowerCase().startsWith(`<${tag}`)) {
      depth++;
    } else {
      depth--;
      if (depth === 0) { closeIdx = dm.index; break; }
    }
    pos = dm.index + dm[0].length;
  }
  if (closeIdx < 0) return null;
  const startByte = byteOffset(openEnd);
  const endByte   = byteOffset(closeIdx);
  return { startByte, endByte, closeIdx };
}

// ────────────────────────────────────────────────────────────────────────────
// Shape detection (§5.0)
// ────────────────────────────────────────────────────────────────────────────
const NAV_OPEN_RE = /<nav\b([^>]*)>/gi;
let navStart = -1, navEnd = -1;
for (const m of html.matchAll(NAV_OPEN_RE)) {
  const a = parseTagAttrs(m[1]);
  if (a.id === "manifest") {
    navStart = m.index + m[0].length;
    navEnd = html.indexOf("</nav>", navStart);
    break;
  }
}

// ── TAIL PATH (§5.3b / §9.1 verify_tail) ────────────────────────────────────
// Inserted above the unconditional manifest-missing exit.
// Condition: no <nav id="manifest"> AND ≥1 <article data-witness> whose witness
// is a valid grammar.
if (navStart < 0 || navEnd < 0) {
  // Check for tail shape.
  const ARTICLE_OPEN_RE = /<article\b([^>]*)>/gi;
  const articles = [];
  for (const m of html.matchAll(ARTICLE_OPEN_RE)) {
    if (inMaskedRange(m.index, masks)) continue;
    const a = parseTagAttrs(m[1]);
    if (!("data-witness" in a)) continue;
    const epoch = classifyWitness(a["data-witness"] || "");
    if (epoch === "invalid") continue; // skip invalid-grammar articles for detection
    articles.push({ match: m, attrs: a });
  }

  if (articles.length === 0) {
    console.error("FAIL: shape detection failed — no <nav id=\"manifest\"> and no witnessed <article> elements with valid-grammar witness");
    process.exit(1);
  }

  // Tail verification (§9.1 verify_tail).
  let ok = 0, mismatch = 0, missing = 0;
  const seenIds = new Set();
  let validCount = 0;  // non-vacuity: count consecrated articles that recompute

  for (const { match, attrs: a } of articles) {
    const id = a.id || null;
    if (!id) {
      console.error("FAIL: <article data-witness> with no id");
      mismatch++;
      continue;
    }
    // §6.1 id production check
    if (!/^[A-Za-z_][\w\-.:]*$/.test(id)) {
      console.error(`FAIL: invalid id production: ${id}`);
      mismatch++;
      continue;
    }
    if (seenIds.has(id)) {
      console.error(`FAIL: duplicate id: ${id}`);
      process.exit(1);
    }
    seenIds.add(id);

    const w = a["data-witness"] || "";
    const epoch = classifyWitness(w);
    if (epoch === "invalid") {
      console.error(`FAIL: invalid witness grammar on article id=${id}`);
      mismatch++;
      continue;
    }

    const span = witnessedBytes(match, "article");
    if (!span) {
      console.error(`FAIL: unterminated <article id=${id}>`);
      missing++;
      continue;
    }

    const innerBuf = htmlBuf.slice(span.startByte, span.endByte);
    if (epoch === "consecrated") {
      const actual = crypto.createHash("sha256").update(innerBuf).digest("hex");
      if (actual !== w) {
        mismatch++;
        console.log(`MISMATCH article id=${id}: claimed=${w} actual=${actual}`);
        continue;
      }
      validCount++;
    }
    // writing-room ordering is Append (V15), not checked here in Core.

    // §6.6 char-count check (optional attribute)
    const ccStr = a["data-char-count"];
    if (ccStr != null) {
      const claimedCC = parseInt(ccStr, 10);
      const innerStr  = innerBuf.toString("utf8");
      const actualCC  = Array.from(innerStr).length;
      if (claimedCC !== actualCC) {
        mismatch++;
        console.log(`MISMATCH article id=${id}: char-count claimed=${claimedCC} actual=${actualCC}`);
        continue;
      }
    }

    ok++;
  }

  // Non-vacuity (§7.3): at least one consecrated article must have recomputed.
  if (validCount === 0) {
    console.error("FAIL: vacuous — zero consecrated articles with recomputing witnesses");
    process.exit(1);
  }

  console.log(`articles: ${articles.length}`);
  console.log();
  console.log(`verified ${ok}/${articles.length} articles (mismatches: ${mismatch}, missing: ${missing})`);
  if (mismatch > 0 || missing > 0) process.exit(1);
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
// MANIFEST-FIRST PATH (§5.3 / §9.1 verify_manifest_first)
// ────────────────────────────────────────────────────────────────────────────
const navInner = html.slice(navStart, navEnd);

const sections = [];
const A_TAG_RE = /<a\b([^>]*)>/gi;
for (const m of navInner.matchAll(A_TAG_RE)) {
  const a = parseTagAttrs(m[1]);
  const href = a.href || "";
  const sha256 = a["data-witness"] || "";
  if (!href.startsWith("#") || !sha256) continue;
  const id = href.slice(1);
  const manifestCharCount = a["data-char-count"] != null ? parseInt(a["data-char-count"], 10) : null;
  sections.push({ id, sha256, manifestCharCount });
}

if (sections.length === 0) {
  console.error("FAIL: <nav id=\"manifest\"> has no <a> entries");
  process.exit(1);
}

console.log(`sections: ${sections.length}`);
console.log();

// ────────────────────────────────────────────────────────────────────────────
// Section extraction — bytes-exact (§6.2), parameterized on tag="section".
// ────────────────────────────────────────────────────────────────────────────
const SECTION_OPEN_RE = /<section\b([^>]*)>/gi;

let ok = 0, mismatch = 0, missing = 0;
const seenIds = new Set();

for (const s of sections) {
  // Find the <section> opening tag whose id matches s.id.
  let openMatch = null;
  SECTION_OPEN_RE.lastIndex = 0;
  let m;
  while ((m = SECTION_OPEN_RE.exec(html)) !== null) {
    if (inMaskedRange(m.index, masks)) continue;
    const a = parseTagAttrs(m[1]);
    if (a.id === s.id) { openMatch = m; break; }
  }
  if (!openMatch) {
    missing++;
    console.log(`MISSING in body: ${s.id}`);
    continue;
  }

  // §6.1 dup-id check
  if (seenIds.has(s.id)) {
    console.error(`FAIL: duplicate id: ${s.id}`);
    process.exit(1);
  }
  seenIds.add(s.id);

  const span = witnessedBytes(openMatch, "section");
  if (!span) {
    missing++;
    console.log(`UNTERMINATED section: ${s.id}`);
    continue;
  }

  const innerBuf = htmlBuf.slice(span.startByte, span.endByte);
  const charLen = innerBuf.length;
  const actualHash = crypto.createHash("sha256").update(innerBuf).digest("hex");
  const innerStr = innerBuf.toString("utf8");
  const actualCharCount = Array.from(innerStr).length;

  const sectionAttrs = parseTagAttrs(openMatch[1]);
  const sectionCharCount = sectionAttrs["data-char-count"] != null
    ? parseInt(sectionAttrs["data-char-count"], 10)
    : null;

  const hashMatch = actualHash === s.sha256;
  let charCountOk = true;
  if (s.manifestCharCount !== null && s.manifestCharCount !== actualCharCount) {
    charCountOk = false;
    mismatch++;
    console.log(`MISMATCH ${s.id}: char-count manifest=${s.manifestCharCount} actual=${actualCharCount}`);
  }
  if (sectionCharCount !== null && sectionCharCount !== actualCharCount) {
    charCountOk = false;
    mismatch++;
    console.log(`MISMATCH ${s.id}: char-count section-attr=${sectionCharCount} actual=${actualCharCount}`);
  }
  if (s.manifestCharCount !== null && sectionCharCount !== null && s.manifestCharCount !== sectionCharCount) {
    charCountOk = false;
    mismatch++;
    console.log(`MISMATCH ${s.id}: char-count manifest=${s.manifestCharCount} vs section-attr=${sectionCharCount} (diverge)`);
  }
  if (hashMatch && charCountOk) {
    ok++;
  } else if (!hashMatch) {
    mismatch++;
    console.log(`MISMATCH ${s.id}: hash diff (claimed ${s.sha256}, actual ${actualHash}), inner bytes ${charLen}`);
  }
}

console.log(`verified ${ok}/${sections.length} sections (mismatches: ${mismatch}, missing: ${missing})`);
if (mismatch > 0 || missing > 0) process.exit(1);
