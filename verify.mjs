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

// ────────────────────────────────────────────────────────────────────────────
// Inert regions (§12) — comments + raw-text <script>/<style> content. Used for
// both boundary-token matching (§6.2) and the content-profile prohibition
// (§6.4a). Only the raw-text CONTENT is inert; the element's own open/close
// tags are ordinary markup.
// ────────────────────────────────────────────────────────────────────────────
function buildInertMasks(src) {
  const commentSpans = buildCommentMasks(src);
  // Neutralize comment bytes (blank to spaces, length-preserving) BEFORE the
  // raw-text scan so a <script>/<style> — or a </style>/</script> — that appears
  // only as text INSIDE a comment cannot be mistaken for a real raw-text
  // element. Otherwise the non-greedy close search, once anchored at a comment's
  // <style> mention, runs on to the next REAL </style>, spawning a bogus span
  // that masks every byte of legitimate markup in between. Same-length blanking
  // preserves every offset, so the spans are valid indices into the original.
  let scan = src;
  if (commentSpans.length) {
    let out = "", last = 0;
    for (const [s, e] of commentSpans) { out += src.slice(last, s) + " ".repeat(e - s); last = e; }
    scan = out + src.slice(last);
  }
  const spans = commentSpans.slice();
  const RAWTEXT_RE = /<(script|style)\b[^>]*>/gi;
  const scanLower = scan.toLowerCase();
  for (const m of scan.matchAll(RAWTEXT_RE)) {
    const tag = m[1].toLowerCase();
    const openEnd = m.index + m[0].length;
    const closeIdx = scanLower.indexOf(`</${tag}>`, openEnd);
    if (closeIdx > openEnd) spans.push([openEnd, closeIdx]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  return spans;
}

// Convert a string (char) index to the corresponding byte offset in htmlBuf.
function byteOffset(strIdx) {
  return Buffer.byteLength(html.slice(0, strIdx), "utf8");
}

// One mask set for the whole reader: the inert regions of §12 — HTML comments
// AND <script>/<style> raw-text content. Boundary-token matching (§6.2), unit
// discovery (§9.1), the count guard, shape detection, the content-profile check
// (§6.4a), and the dup-id scan (§6.1) all mask the same regions, because a token
// or id-shaped substring inside a comment or raw-text block is never real markup
// to a browser (§12) and MUST NOT match a boundary or be counted anywhere.
const inertMasks = buildInertMasks(html);

// ────────────────────────────────────────────────────────────────────────────
// §6.1 whole-document dup-id scan (V5/V30). A "live element" is ANY element
// carrying an id= attribute — top-level section/article units, nested
// sections, manifest <a> link targets, and any id-bearing <img> (§5.5) or
// other element. §6.1's uniqueness rule is a property of the whole
// document's id space, not a per-tag-name rule, so this scan walks every
// opening tag in the document (outside inert regions), not only
// addressable-unit opening tags.
// ────────────────────────────────────────────────────────────────────────────
const ANY_OPEN_TAG_RE = /<([a-zA-Z][\w-]*)((?:\s+[^<>]*)?)>/g;

function findGlobalDupId() {
  // Uses inertMasks (comments + <script>/<style> raw-text content, §12) so a
  // literal id-shaped substring inside JS/CSS text is not mistaken for a
  // real element's id.
  const seen = new Set();
  ANY_OPEN_TAG_RE.lastIndex = 0;
  let m;
  while ((m = ANY_OPEN_TAG_RE.exec(html)) !== null) {
    if (inMaskedRange(m.index, inertMasks)) continue;
    const a = parseTagAttrs(m[2] || "");
    const id = a.id;
    if (id == null) continue;
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// NON-CANONICAL refusal (§6.2, §6.4a) — carries a required byte offset.
// ────────────────────────────────────────────────────────────────────────────
class NonCanonical extends Error {
  constructor(message, byteOff) {
    super(message);
    this.byteOffset = byteOff;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// §6.4 canonical-serialization refusal on witnessed-unit opening tags —
// V24 (quoting) and V25 (duplicate attribute name). Quote-aware READING
// (parseTagAttrs, above) stays tolerant so an embedded `id=` cannot
// impersonate the real attribute; this is the separate document-level law:
// on the opening tag of an addressable element every valued attribute MUST
// use the double-quote form (single-quoted / unquoted → NON-CANONICAL, V24)
// and no attribute name may appear twice (V25) — required byte offset on
// both. `tagInnerStart` is the char index of tagInner's first char in html.
// ────────────────────────────────────────────────────────────────────────────
function refuseNonCanonicalAttrs(tagInner, tagInnerStart) {
  const seen = new Set();
  const n = tagInner.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(tagInner[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && !/\s/.test(tagInner[i]) && tagInner[i] !== "=" && tagInner[i] !== '"' && tagInner[i] !== "'") i++;
    if (i === nameStart) { i++; continue; }
    const name = tagInner.slice(nameStart, i).toLowerCase();
    if (seen.has(name)) {
      throw new NonCanonical(
        `duplicate attribute name '${name}' on a witnessed-unit opening tag (§6.4, V25)`,
        byteOffset(tagInnerStart + nameStart));
    }
    seen.add(name);
    let j = i;
    while (j < n && /\s/.test(tagInner[j])) j++;
    if (j < n && tagInner[j] === "=") {
      j++;
      while (j < n && /\s/.test(tagInner[j])) j++;
      if (j < n && tagInner[j] === '"') {
        j++;
        while (j < n && tagInner[j] !== '"') j++;
        if (j < n) j++;
      } else {
        const form = j < n && tagInner[j] === "'" ? "single-quoted" : "unquoted";
        throw new NonCanonical(
          `${form} value for attribute '${name}' on a witnessed-unit opening tag (§6.4, V24)`,
          byteOffset(tagInnerStart + Math.min(j, Math.max(0, n - 1))));
      }
      i = j;
    } else {
      i = j; // valueless attribute — V24 governs valued attributes only
    }
  }
}

// Shared call-site wrapper: refuse-and-exit like the other NON-CANONICAL
// sites. tagMatch is /^<TAG\s*([^>]*)>/ exec'd on the opening tag's slice;
// group 1 sits immediately before the final '>' of the match.
function checkUnitTagCanonical(tagMatch, openStart) {
  if (!tagMatch) return;
  try {
    refuseNonCanonicalAttrs(tagMatch[1], openStart + tagMatch[0].length - 1 - tagMatch[1].length);
  } catch (e) {
    if (!(e instanceof NonCanonical)) throw e;
    console.error(`FAIL: NON-CANONICAL — ${e.message} (byte offset ${e.byteOffset})`);
    process.exit(1);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// §6.2 boundary-token grammar (normative, exact). A byte sequence is an OPEN
// token for TAG iff it is '<' + TAG (case-sensitive, lowercase) followed by
// exactly one of {whitespace, '/', '>'} — an exact tag-name match, not a
// prefix match. A byte sequence is a CLOSE token iff it is exactly
// '</TAG>' with zero interior whitespace/other bytes. Anything close-tag-
// shaped but with interior bytes before '>' — and not itself a longer tag
// name sharing TAG as a prefix — is NON-CANONICAL.
// ────────────────────────────────────────────────────────────────────────────
function boundaryScanRe(tag) {
  // group 1 = the single byte after an open-ish '<TAG'
  // group 2 = everything between a close-ish '</TAG' and the next '>'
  return new RegExp(`<${tag}(.)|<\\/${tag}([^>]*)>`, "g");
}

const WS_SLASH_GT = new Set([" ", "\t", "\n", "\r", "\f", "\v", "/", ">"]);
const WS_GT = new Set([" ", "\t", "\n", "\r", "\f", "\v", ">"]);

function classifyBoundaryToken(m) {
  // m[1] set  → open-ish; m[2] set (possibly "") → close-ish
  if (m[1] !== undefined) {
    if (WS_SLASH_GT.has(m[1])) {
      return { kind: "open", end: m.index + m[0].length };
    }
    return { kind: "content" };
  } else {
    const tail = m[2];
    if (tail === "") {
      return { kind: "close", end: m.index + m[0].length };
    }
    const first = tail[0];
    if (first !== undefined && !WS_GT.has(first)) {
      // A longer tag name sharing TAG as a prefix (e.g. </section-foo>) —
      // ordinary content, not a near-miss close token, not NON-CANONICAL.
      return { kind: "content" };
    }
    return { kind: "noncanonical", start: m.index };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// §6.2 generalized depth-walk (exact-token grammar) — parameterized on TAG.
// Returns { startByte, endByte, closeIdx, closesConsumed } on success, or
// throws NonCanonical on an off-grammar boundary-adjacent token. Returns null
// only when no candidate close token exists at all (genuinely unterminated).
// ────────────────────────────────────────────────────────────────────────────
function extractInner(openEnd, tag, elemId) {
  const scanRe = boundaryScanRe(tag);
  let depth = 1, pos = openEnd, closeIdx = -1, closesConsumed = 0;
  while (depth > 0 && pos <= html.length) {
    scanRe.lastIndex = pos;
    const m = scanRe.exec(html);
    if (!m) break;
    if (inMaskedRange(m.index, inertMasks)) {
      pos = m.index + m[0].length;
      continue;
    }
    const cls = classifyBoundaryToken(m);
    if (cls.kind === "content") {
      pos = m.index + m[0].length;
      continue;
    }
    if (cls.kind === "noncanonical") {
      throw new NonCanonical(
        `close tag for <${tag}> carries interior whitespace/bytes (id=${elemId})`,
        byteOffset(cls.start)
      );
    }
    if (cls.kind === "open") {
      depth++;
    } else {
      depth--;
      closesConsumed++;
      if (depth === 0) { closeIdx = m.index; break; }
    }
    pos = m.index + m[0].length;
  }
  if (closeIdx < 0) return null;
  const startByte = byteOffset(openEnd);
  const endByte   = byteOffset(closeIdx);
  return { startByte, endByte, closeIdx, closesConsumed };
}

// ────────────────────────────────────────────────────────────────────────────
// Closing-tag count guard (independent second tally) — NOT a depth-walk
// rewrite. Counts every exact close-token literal `</TAG>` OUTSIDE an inert
// region (§12) in the char-index window [openEnd, scopeEnd) — scopeEnd is
// the next SIBLING opener's char index of the same tag (skipping any opener
// nested inside this unit), or html.length if this is the last unit. That
// literal count is compared against closesConsumed — the number of close
// tokens the depth-walk itself consumed to reach depth 0 (the depth-walk's
// own expectation, §6.2/V2; 1 for the unit's own closer, plus one per
// same-tag nested witnessed unit legally opened within the span; zero when
// no nesting, so a legal nested witnessed section is not itself a surplus).
// Both this tally and the depth-walk mask the SAME inert regions (§6.2/§12:
// comments AND <script>/<style> raw-text), so a close-token literal that is
// genuinely inert — e.g. inside a witnessed unit's own <style> — is skipped
// by both and is never a boundary; the unit's witness hash covers those bytes
// directly. The guard's remaining power is the surplus/deficit it raises for a
// NON-inert lookalike the depth-walk resolved differently — canonically a
// close-token literal inside a quoted ATTRIBUTE value (not an inert region, so
// neither mask skips it): the depth-walk stops early at it while the real
// closer later in the window makes the tally exceed what the walk consumed.
// Any surplus OR deficit is refused NON-CANONICAL.
// ────────────────────────────────────────────────────────────────────────────
function countGuard(openEnd, scopeEnd, tag, elemId, closesConsumed) {
  const closeRe = new RegExp(`<\\/${tag}>`, "g");
  closeRe.lastIndex = openEnd;
  let rawCloses = 0;
  let m;
  while ((m = closeRe.exec(html)) !== null) {
    if (m.index >= scopeEnd) break;
    if (!inMaskedRange(m.index, inertMasks)) rawCloses++;
    closeRe.lastIndex = m.index + m[0].length;
  }
  if (rawCloses !== closesConsumed) {
    const kind = rawCloses > closesConsumed ? "surplus" : "deficit";
    throw new NonCanonical(
      `closing-tag count guard: <${tag} id=${elemId}> expected ${closesConsumed} ` +
      `close token(s) (the depth-walk's own consumption), found ${rawCloses} raw ` +
      `close-token literal(s) in scope (${kind})`,
      byteOffset(openEnd)
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// §6.4a content-profile prohibition (distinct from the boundary-token
// grammar). A witnessed span MUST NOT contain, outside an inert region, a
// content element whose tag name is exactly 'section' or exactly 'article'
// followed immediately by '-', '.', or ':' (V26).
// ────────────────────────────────────────────────────────────────────────────
const PROHIBITED_RE = /<(?:section|article)[-.:]/g;

function contentProfileCheck(openEnd, closeIdx) {
  const span = html.slice(openEnd, closeIdx);
  PROHIBITED_RE.lastIndex = 0;
  let m;
  while ((m = PROHIBITED_RE.exec(span)) !== null) {
    const absIdx = openEnd + m.index;
    if (!inMaskedRange(absIdx, inertMasks)) {
      throw new NonCanonical(
        "content-profile prohibition (§6.4a): witnessed span contains an " +
        "unmasked section-/article-prefixed content element",
        byteOffset(absIdx)
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Full §6.2/§6.4a witnessed-bytes pipeline: depth-walk, count guard,
// content-profile check. openerStarts is the full sorted list of every
// same-tag opener's char index in the whole document (document order), used
// to derive the count guard's scope: the next opener at or after this unit's
// OWN depth-walk close position — i.e. the next SIBLING, skipping any opener
// nested inside this unit. Returns the span on success (bytes read via
// htmlBuf.slice(startByte, endByte)); throws NonCanonical on failure; returns
// null only when genuinely unterminated (no candidate close token at all).
// ────────────────────────────────────────────────────────────────────────────
function witnessedBytes(openEnd, openerStarts, tag, elemId) {
  const span = extractInner(openEnd, tag, elemId);
  if (!span) return null;
  let scopeEnd = html.length;
  for (const s of openerStarts) {
    if (s >= span.closeIdx) { scopeEnd = s; break; }
  }
  countGuard(openEnd, scopeEnd, tag, elemId, span.closesConsumed);
  contentProfileCheck(openEnd, span.closeIdx);
  return span;
}

// ────────────────────────────────────────────────────────────────────────────
// §6.1/§9.1 whole-document dup-id check — runs BEFORE shape dispatch, over
// every live element's id (not only addressable-unit ids; V5/V30).
// ────────────────────────────────────────────────────────────────────────────
const globalDupId = findGlobalDupId();
if (globalDupId !== null) {
  console.error(`FAIL: duplicate id: ${globalDupId}`);
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Shape detection (§5.0)
// ────────────────────────────────────────────────────────────────────────────
const NAV_OPEN_RE = /<nav\b([^>]*)>/gi;
let navStart = -1, navEnd = -1;
for (const m of html.matchAll(NAV_OPEN_RE)) {
  if (inMaskedRange(m.index, inertMasks)) continue;
  const a = parseTagAttrs(m[1]);
  if (a.id === "manifest") {
    navStart = m.index + m[0].length;
    navEnd = html.indexOf("</nav>", navStart);
    break;
  }
}
const navFound = navStart >= 0 && navEnd >= 0;

// Independent tail-shape detection (≥1 <article data-witness> with
// valid-grammar witness) — computed regardless of navFound so V18 mixed-shape
// refusal is reachable even when a manifest IS present.
const ARTICLE_OPEN_RE_DETECT = /<article\b([^>]*)>/gi;
let tailFound = false;
for (const m of html.matchAll(ARTICLE_OPEN_RE_DETECT)) {
  if (inMaskedRange(m.index, inertMasks)) continue;
  const a = parseTagAttrs(m[1]);
  if (!("data-witness" in a)) continue;
  const epoch = classifyWitness(a["data-witness"] || "");
  if (epoch === "invalid") continue; // skip invalid-grammar articles for detection
  tailFound = true;
  break;
}

// V18 — mixed-shape refusal, reachable even when a manifest is present.
if (navFound && tailFound) {
  console.error("FAIL: mixed shapes — both <nav id=\"manifest\"> and a witnessed " +
                "<article data-witness> are present (homogeneity violation)");
  process.exit(1);
}

// ── TAIL PATH (§5.3b / §9.1 verify_tail) ────────────────────────────────────
// Inserted above the unconditional manifest-missing exit.
// Condition: no <nav id="manifest"> AND ≥1 <article data-witness> whose witness
// is a valid grammar.
if (!navFound) {
  // Check for tail shape.
  const ARTICLE_OPEN_RE = /<article\b([^>]*)>/gi;
  const articles = [];
  for (const m of html.matchAll(ARTICLE_OPEN_RE)) {
    if (inMaskedRange(m.index, inertMasks)) continue;
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

  // Outer unit-discovery: locate top-level <article ...> OPENING tags via the
  // exact-token grammar (§6.2) — MUST use the identical boundary-token rule
  // as the depth-walk, not a looser prefix/word-boundary match.
  const articleScanRe = boundaryScanRe("article");
  const openers = []; // { openStart, openEnd }
  {
    let pos = 0;
    while (pos <= html.length) {
      articleScanRe.lastIndex = pos;
      const m = articleScanRe.exec(html);
      if (!m) break;
      if (inMaskedRange(m.index, inertMasks)) { pos = m.index + m[0].length; continue; }
      const cls = classifyBoundaryToken(m);
      if (cls.kind === "open") {
        const tagEnd = html.indexOf(">", cls.end);
        openers.push({ openStart: m.index, openEnd: tagEnd + 1 });
      } else if (cls.kind === "noncanonical") {
        console.error(`FAIL: NON-CANONICAL — off-grammar boundary token for <article> at byte offset ${byteOffset(cls.start)}`);
        process.exit(1);
      }
      pos = m.index + m[0].length;
    }
  }
  const openerStarts = openers.map((o) => o.openStart);

  // Tail verification (§9.1 verify_tail).
  //
  // Epoch scoping (this packet — P0.4): a tail body may hold a mix of
  // CONSECRATED and WRITING_ROOM witnesses. validCount tallies recomputing
  // consecrated articles (the non-vacuity register — §7.3); ordinalCount
  // tallies grammar-valid writing-room articles that otherwise verify (§6.6
  // char-count, id production). A tail with >=1 consecrated recompute is a
  // scoped PASS reporting BOTH counts: "PASS (verified=m, ordinal=k)". A tail
  // with ZERO consecrated witnesses but >=1 valid writing-room witness is
  // never a bare PASS — it is the distinct ORDINAL-ONLY verdict (§6.7/§7.3):
  // the ordinal register (sequence) was checked, but no byte was ever
  // recomputed, so "0 recomputed bytes verified" must not be spelled PASS.
  let ok = 0, mismatch = 0, missing = 0;
  const seenIds = new Set();
  let validCount = 0;    // non-vacuity: count consecrated articles that recompute
  let ordinalCount = 0;  // grammar-valid writing-room articles that otherwise verify

  for (const { openStart, openEnd } of openers) {
    const tagMatch = /^<article\s*([^>]*)>/.exec(html.slice(openStart, openEnd));
    // §6.4 V24/V25 — in tail shape the top-level <article> openers are what
    // unit-discovery addresses; their serialization must be canonical.
    checkUnitTagCanonical(tagMatch, openStart);
    const a = tagMatch ? parseTagAttrs(tagMatch[1]) : {};
    if (!("data-witness" in a)) continue;

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

    let span;
    try {
      span = witnessedBytes(openEnd, openerStarts, "article", id);
    } catch (e) {
      if (e instanceof NonCanonical) {
        console.error(`FAIL: NON-CANONICAL — ${e.message} (byte offset ${e.byteOffset})`);
        process.exit(1);
      }
      throw e;
    }
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

    if (epoch === "writing-room") ordinalCount++;

    ok++;
  }

  // Non-vacuity (§7.3): zero addressable units with ANY grammar-valid
  // witness (consecrated or writing-room) is the ordinary vacuous FAIL.
  if (validCount === 0 && ordinalCount === 0) {
    console.error("FAIL: vacuous — zero addressable units with recomputing or grammar-valid witnesses");
    process.exit(1);
  }

  console.log(`articles: ${openers.length}`);
  console.log();

  // ORDINAL-ONLY (this packet, P0.4): zero consecrated witnesses recomputed,
  // but at least one grammar-valid writing-room witness present. An
  // all-timestamp tail is therefore NEVER PASS.
  if (validCount === 0 && ordinalCount > 0) {
    console.log(`ORDINAL-ONLY: 0 consecrated witnesses recomputed; ${ordinalCount} ` +
                `writing-room (ordinal) witness(es) grammar-valid (mismatches: ${mismatch}, missing: ${missing})`);
    process.exit(1);
  }

  if (ordinalCount > 0) {
    // Mixed-epoch scope (this packet): the tail carries BOTH consecrated and
    // writing-room witnesses. A conforming reader states the PASS scope
    // explicitly — verified (recomputed, consecrated) vs ordinal
    // (grammar-valid, writing-room) — rather than folding the two registers
    // into one undifferentiated count.
    console.log(`PASS (verified=${validCount}, ordinal=${ordinalCount}) articles: ${openers.length} ` +
                `(mismatches: ${mismatch}, missing: ${missing})`);
  } else {
    console.log(`verified ${ok}/${openers.length} articles (mismatches: ${mismatch}, missing: ${missing})`);
  }
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
// Outer unit-discovery: locate ALL <section ...> OPENING tags (any nesting
// depth) via the exact-token grammar (§6.2) — MUST use the identical
// boundary-token rule as the depth-walk, not a looser prefix match. A bogus
// '<section-foo>' unit is never matched here. Nesting depth AND each
// opener's own immediate PARENT's close position are tracked alongside —
// depth separates top-level (order-bijection, V29) from nested
// (nested-recompute, V31); parentClose bounds a nested unit's count-guard
// scope so it never extends past its own parent's closing tag (a nested
// unit's "next sibling" for count-guard purposes is either the next
// same-depth opener or its own parent's close, whichever comes first).
// ────────────────────────────────────────────────────────────────────────────
const sectionScanRe = boundaryScanRe("section");
const openers = []; // { openStart, openEnd, attrs, depth, parentClose }
const ownClose = new Map(); // opener index -> this opener's own close-token start position
{
  let pos = 0;
  let depth = 0;
  const stack = []; // indices into `openers` for currently-open ancestors, innermost last
  while (pos <= html.length) {
    sectionScanRe.lastIndex = pos;
    const m = sectionScanRe.exec(html);
    if (!m) break;
    if (inMaskedRange(m.index, inertMasks)) { pos = m.index + m[0].length; continue; }
    const cls = classifyBoundaryToken(m);
    if (cls.kind === "open") {
      const tagEnd = html.indexOf(">", cls.end);
      const openStart = m.index, openEnd = tagEnd + 1;
      const tagMatch = /^<section\s*([^>]*)>/.exec(html.slice(openStart, openEnd));
      // §6.4 V24/V25 — every <section> (any depth) is a witnessed unit in
      // v0.3; its opening tag must be canonically serialized.
      checkUnitTagCanonical(tagMatch, openStart);
      const a = tagMatch ? parseTagAttrs(tagMatch[1]) : {};
      openers.push({ openStart, openEnd, attrs: a, depth, parentClose: null });
      stack.push(openers.length - 1);
      depth++;
    } else if (cls.kind === "noncanonical") {
      console.error(`FAIL: NON-CANONICAL — off-grammar boundary token for <section> at byte offset ${byteOffset(cls.start)}`);
      process.exit(1);
    } else { // 'close'
      depth = Math.max(0, depth - 1);
      if (stack.length) {
        const closedIdx = stack.pop();
        ownClose.set(closedIdx, m.index);
      }
    }
    pos = m.index + m[0].length;
  }
}
// Second pass: each opener's parentClose = its immediate enclosing opener's
// OWN close position (from ownClose, above) — or null if top-level. A
// depth-ordered ancestor stack over the already-document-order `openers`
// array derives "immediate enclosing opener" directly from the recorded
// depth values (cheap: openers.length iterations, no re-scan of the
// document).
{
  const ancestorStack = [];
  for (let i = 0; i < openers.length; i++) {
    const o = openers[i];
    while (ancestorStack.length && openers[ancestorStack[ancestorStack.length - 1]].depth >= o.depth) {
      ancestorStack.pop();
    }
    const parentIdx = ancestorStack.length ? ancestorStack[ancestorStack.length - 1] : null;
    o.parentClose = parentIdx !== null ? (ownClose.has(parentIdx) ? ownClose.get(parentIdx) : null) : null;
    ancestorStack.push(i);
  }
}
const openerStarts = openers.map((o) => o.openStart);
const toplevelOpeners = openers.filter((o) => o.depth === 0);

// V29 order-bijection: the manifest's link order and the body's top-level
// section document-order MUST name the identical id sequence.
{
  const manifestIdSeq = sections.map((s) => s.id);
  const bodyIdSeq = toplevelOpeners.map((o) => o.attrs.id);
  const sameLength = manifestIdSeq.length === bodyIdSeq.length;
  const sameOrder = sameLength && manifestIdSeq.every((v, i) => v === bodyIdSeq[i]);
  if (!sameOrder) {
    console.error(`FAIL: order-bijection — manifest order [${manifestIdSeq}] != body order [${bodyIdSeq}]`);
    process.exit(1);
  }
}

let ok = 0, mismatch = 0, missing = 0;
const seenIds = new Set();

for (const s of sections) {
  // Find the matching TOP-LEVEL <section> opening tag whose id matches s.id.
  const found = toplevelOpeners.find((o) => o.attrs.id === s.id);
  if (!found) {
    missing++;
    console.log(`MISSING in body: ${s.id}`);
    continue;
  }
  const { openStart, openEnd, attrs: sectionAttrs } = found;

  // §6.1 dup-id check
  if (seenIds.has(s.id)) {
    console.error(`FAIL: duplicate id: ${s.id}`);
    process.exit(1);
  }
  seenIds.add(s.id);

  let span;
  try {
    span = witnessedBytes(openEnd, openerStarts, "section", s.id);
  } catch (e) {
    if (e instanceof NonCanonical) {
      console.error(`FAIL: NON-CANONICAL — ${e.message} (byte offset ${e.byteOffset})`);
      process.exit(1);
    }
    throw e;
  }
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

  const sectionCharCount = sectionAttrs["data-char-count"] != null
    ? parseInt(sectionAttrs["data-char-count"], 10)
    : null;

  // V4 two-carrier agreement (§6.3): BOTH the section's own data-witness and
  // the manifest link's data-witness MUST equal the recomputed digest.
  // Checking only "manifest witness == recomputed" (as before) misses the
  // case where the SECTION's own carrier disagrees with a correct manifest
  // link (the carrier-mismatch fixture: a section stamped with 64 zeros
  // while the link carries the true hash) — a reader that only checks the
  // manifest carrier accepts that document.
  const sectionWitness = sectionAttrs["data-witness"];
  let carrierOk = true;
  if (sectionWitness == null) {
    carrierOk = false;
    mismatch++;
    console.log(`MISMATCH ${s.id}: section element carries no data-witness`);
  } else if (sectionWitness !== actualHash) {
    carrierOk = false;
    mismatch++;
    console.log(`MISMATCH ${s.id}: section data-witness=${sectionWitness} actual=${actualHash} (carrier disagreement: section)`);
  } else if (s.sha256 !== actualHash) {
    carrierOk = false;
    mismatch++;
    console.log(`MISMATCH ${s.id}: hash diff (claimed ${s.sha256}, actual ${actualHash}), inner bytes ${charLen} (carrier disagreement: link)`);
  } else if (sectionWitness !== s.sha256) {
    carrierOk = false;
    mismatch++;
    console.log(`MISMATCH ${s.id}: section data-witness=${sectionWitness} != link data-witness=${s.sha256} (carrier disagreement: link vs section)`);
  }
  if (!carrierOk) continue;

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
  if (charCountOk) {
    ok++;
  }
}

// V31 nested witnessed-section recompute (verify-all, charter decision #2).
// A nested <section data-witness> — not reachable from the manifest's
// top-level link list, but present inside another witnessed unit's span — is
// ALSO an addressable unit under §5.2 and MUST have its own witness
// recomputed, exactly as a top-level section's is (§7.2 fold-confirmation:
// "every prior consecrated witness still re-derives" carries no nesting-depth
// carve-out). This closes the divergence with
// trials/scripts/verify_sections.py's isolation-mode checker, which
// recomputes every section it finds regardless of nesting depth.
let nestedOk = 0, nestedMismatch = 0;
for (const { openEnd, attrs: a, depth, parentClose } of openers) {
  if (depth === 0) continue; // top-level — already verified above
  const nid = a.id;
  if (nid == null || seenIds.has(nid)) continue;
  const ndw = a["data-witness"];
  if (ndw == null) continue; // non-witnessed structural nesting — not addressable
  seenIds.add(nid); // dup-id already enforced globally (§9.1)

  // A nested unit's count-guard scope MUST NOT extend past its own immediate
  // parent's closing tag (§6.2) — witnessedBytes' scope-end derivation
  // assumes openerStarts bounds a TOP-LEVEL unit's sibling window; for a
  // nested unit that same derivation would otherwise fall through to
  // html.length when there is no later opener at all, wrongly counting the
  // parent's own closer as a surplus. parentClose (recorded during the
  // opener scan) is injected as an extra scope-end candidate so the nested
  // unit's own window stops there when no shallower sibling opener exists
  // first.
  const nestedOpenerStarts = parentClose != null
    ? [...openerStarts, parentClose].sort((x, y) => x - y)
    : openerStarts;

  let nspan;
  try {
    nspan = witnessedBytes(openEnd, nestedOpenerStarts, "section", nid);
  } catch (e) {
    if (e instanceof NonCanonical) {
      console.error(`FAIL: NON-CANONICAL — ${e.message} (byte offset ${e.byteOffset})`);
      process.exit(1);
    }
    throw e;
  }
  if (!nspan) {
    nestedMismatch++;
    console.log(`UNTERMINATED nested section: ${nid}`);
    continue;
  }

  const nEpoch = classifyWitness(ndw);
  if (nEpoch === "invalid") {
    nestedMismatch++;
    console.log(`FAIL: invalid witness grammar on nested section id=${nid}`);
    continue;
  }
  const ninnerBuf = htmlBuf.slice(nspan.startByte, nspan.endByte);
  if (nEpoch === "consecrated") {
    const nActual = crypto.createHash("sha256").update(ninnerBuf).digest("hex");
    if (nActual !== ndw) {
      nestedMismatch++;
      console.log(`MISMATCH nested section id=${nid}: claimed=${ndw} actual=${nActual}`);
      continue;
    }
  }

  const nccStr = a["data-char-count"];
  if (nccStr != null) {
    const nClaimedCC = parseInt(nccStr, 10);
    const nActualCC = Array.from(ninnerBuf.toString("utf8")).length;
    if (nClaimedCC !== nActualCC) {
      nestedMismatch++;
      console.log(`MISMATCH nested section id=${nid}: char-count claimed=${nClaimedCC} actual=${nActualCC}`);
      continue;
    }
  }

  nestedOk++;
}
if (nestedOk || nestedMismatch) {
  console.log(`nested sections recomputed: ${nestedOk} ok, ${nestedMismatch} mismatch`);
}

console.log(`verified ${ok}/${sections.length} sections (mismatches: ${mismatch}, missing: ${missing})`);
if (mismatch > 0 || missing > 0 || nestedMismatch > 0) process.exit(1);
