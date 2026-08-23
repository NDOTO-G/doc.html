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
// Read once, as raw bytes (§6.2's bytes-exact hashing needs the Buffer
// regardless), and validate BEFORE deriving the string form used everywhere
// else in this reader — see the R7 check immediately below for why.
const htmlBuf = fs.readFileSync(targetPath);

// ────────────────────────────────────────────────────────────────────────────
// R7: whole-document UTF-8 well-formedness — the FIRST check this reader
// performs, before any other, including the id scan.
//
// Pre-existing on the sealed baseline: invalid UTF-8 anywhere in the document
// diverges the two readers. verify.py either PASSes silently (an off-grammar
// byte outside any `errors='strict'` decode site is never even looked at) or
// raises an unhandled UnicodeDecodeError — a Python traceback, not a
// "FAIL: ..." verdict — depending on WHERE the bad byte falls; verify.mjs
// previously read the file via `fs.readFileSync(path, "utf8")`, which never
// throws and instead silently substitutes U+FFFD per invalid byte, so it
// reported whatever downstream mismatch that substitution happened to cause
// rather than the real defect. Two different failure shapes for the identical
// input is a divergence R5 (same-reason parity) forbids, so this trial closes
// it as a new fail-closed rule (R7): both readers validate the ENTIRE raw
// file is well-formed UTF-8 before doing anything else with it.
//
// firstInvalidUtf8Offset is a hand-written strict UTF-8 scanner over the raw
// Buffer, following the Unicode Standard's Table 3-7 "well-formed UTF-8 byte
// sequences" restricted-second-byte table — the same table CPython's decoder
// implements, which is why its offsets are proven (fixture battery, both
// readers) to agree with Python's `UnicodeDecodeError.start` byte for byte on
// every probe case: a truncated multibyte sequence at EOF, an overlong
// encoding, an encoded UTF-16 surrogate (U+D800..U+DFFF), a codepoint above
// U+10FFFF, a stray continuation byte, and an invalid lead byte. In every
// case the restricted table places the reported offset at the LEAD byte of
// the ill-formed subsequence, never at a later continuation byte — matching
// Python exactly, not merely "some byte in the bad span."
//
// A UTF-8 BOM (`EF BB BF`) at offset 0 is NOT rejected here: it is a legal,
// well-formed UTF-8 encoding of U+FEFF, so this scanner does not flag it, and
// empirically neither reader's behavior on a BOM-prefixed document differs
// from the same document without one (the BOM sits in the prelude before any
// witnessed span or checked construct, so it is inert to every downstream
// check on both readers) — no divergence exists to close, so this rule adds
// none.
// ────────────────────────────────────────────────────────────────────────────
function firstInvalidUtf8Offset(buf) {
  const isCont = (b) => b >= 0x80 && b <= 0xbf;
  const n = buf.length;
  let i = 0;
  while (i < n) {
    const b0 = buf[i];
    if (b0 <= 0x7f) { i += 1; continue; }
    if (b0 >= 0xc2 && b0 <= 0xdf) {                       // 2-byte: C2-DF, 80-BF
      if (i + 1 >= n || !isCont(buf[i + 1])) return i;
      i += 2; continue;
    }
    if (b0 === 0xe0) {                                    // 3-byte: E0, A0-BF, 80-BF
      if (i + 1 >= n || buf[i + 1] < 0xa0 || buf[i + 1] > 0xbf) return i;
      if (i + 2 >= n || !isCont(buf[i + 2])) return i;
      i += 3; continue;
    }
    if (b0 >= 0xe1 && b0 <= 0xec) {                       // 3-byte: E1-EC, 80-BF, 80-BF
      if (i + 1 >= n || !isCont(buf[i + 1])) return i;
      if (i + 2 >= n || !isCont(buf[i + 2])) return i;
      i += 3; continue;
    }
    if (b0 === 0xed) {                                    // 3-byte: ED, 80-9F, 80-BF (excludes surrogates)
      if (i + 1 >= n || buf[i + 1] < 0x80 || buf[i + 1] > 0x9f) return i;
      if (i + 2 >= n || !isCont(buf[i + 2])) return i;
      i += 3; continue;
    }
    if (b0 >= 0xee && b0 <= 0xef) {                       // 3-byte: EE-EF, 80-BF, 80-BF
      if (i + 1 >= n || !isCont(buf[i + 1])) return i;
      if (i + 2 >= n || !isCont(buf[i + 2])) return i;
      i += 3; continue;
    }
    if (b0 === 0xf0) {                                    // 4-byte: F0, 90-BF, 80-BF, 80-BF (excludes overlong)
      if (i + 1 >= n || buf[i + 1] < 0x90 || buf[i + 1] > 0xbf) return i;
      if (i + 2 >= n || !isCont(buf[i + 2])) return i;
      if (i + 3 >= n || !isCont(buf[i + 3])) return i;
      i += 4; continue;
    }
    if (b0 >= 0xf1 && b0 <= 0xf3) {                       // 4-byte: F1-F3, 80-BF, 80-BF, 80-BF
      if (i + 1 >= n || !isCont(buf[i + 1])) return i;
      if (i + 2 >= n || !isCont(buf[i + 2])) return i;
      if (i + 3 >= n || !isCont(buf[i + 3])) return i;
      i += 4; continue;
    }
    if (b0 === 0xf4) {                                    // 4-byte: F4, 80-8F, 80-BF, 80-BF (excludes > U+10FFFF)
      if (i + 1 >= n || buf[i + 1] < 0x80 || buf[i + 1] > 0x8f) return i;
      if (i + 2 >= n || !isCont(buf[i + 2])) return i;
      if (i + 3 >= n || !isCont(buf[i + 3])) return i;
      i += 4; continue;
    }
    return i; // invalid lead byte: stray continuation (80-BF) or F5-FF/C0-C1
  }
  return null;
}

const utf8Fault = firstInvalidUtf8Offset(htmlBuf);
if (utf8Fault !== null) {
  console.error(`FAIL: invalid UTF-8 at byte offset ${utf8Fault}`);
  process.exit(1);
}

// Safe now: htmlBuf is proven well-formed UTF-8, so this decode is lossless
// (no U+FFFD substitution can occur).
const html = htmlBuf.toString("utf8");

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
//
// If *dupNames* (an array) is given, every attribute name this SAME
// tokenization sees more than once is pushed onto it, in document order, the
// first time each repeat is seen (§6.4/§9.1 R6c — findGlobalIdFault's own
// duplicate-attribute-name refusal). Detecting duplicates from inside this
// exact tokenizer — rather than a second, separately-written scan — guarantees
// the dup-name check and this function's own last-wins VALUE resolution can
// never disagree about where one attribute name ends and the next begins.
// Presence is tracked in a Set, not `name in attrs`: `attrs` is a plain
// object, so an attribute literally named e.g. "constructor" would otherwise
// read as already-present via the prototype chain before this tokenizer ever
// assigned it. Omitted (the default, `undefined`), this costs nothing — every
// other call site is unaffected.
//
// §6.4 ATTRIBUTE-SEPARATOR set (R8, RULED by the Operator 2026-08-22).
// The set that separates one attribute from the next inside a start tag. It is
// HTML5's five whitespace codepoints and nothing else:
//
//     U+0009 TAB, U+000A LF, U+000C FF, U+000D CR, U+0020 SPACE
//
// F2/F6 (post-round-4-validation) first closed the cross-READER skew here: the
// separator test used the ENGINE's own `/\s/` — whatever Unicode General
// Category Zs plus format/control codepoints the CURRENT V8 build's table says,
// a table this specification does not pin and a stranger reader cannot
// reproduce from SPEC.md alone — and R8 replaced it with an enumerated
// 25-codepoint constant copied member-for-member from verify.py's twin.
//
// That freeze left a reader-vs-BROWSER gap. The WHATWG tokenizer's
// before-attribute-name state treats only TAB/LF/FF/SPACE as whitespace (CR is
// folded to LF by input-stream normalization before the tokenizer ever sees
// it); the other twenty codepoints of the JS class — NBSP, the
// General-Punctuation space run, LINE/PARAGRAPH SEPARATOR, IDEOGRAPHIC SPACE,
// the BOM, and VT (U+000B, which JS `\s` matches and HTML5 does NOT) — each
// BEGIN the following attribute NAME in a browser. A reader accepting them as
// separators verifies bytes a browser reads differently, and what is verified
// must be what is read (the V4 Discernment). RULED 2026-08-22: narrowed to
// HTML5's five. A codepoint outside this set, sitting inside a tag where a
// separator was intended, is NOT a separator — it is absorbed into the adjacent
// attribute NAME, exactly as a browser absorbs it.
//
// The constant is named for what it holds. It is no longer JS `\s` and must
// never again be spelled as though it were. Identical, member for member, to
// verify.py's `_ATTR_SEP`.
//
// NOTE the relationship with §6.2's boundary-token OPEN set (`WS_SLASH_GT`,
// below). It rested on SIX whitespace bytes — the five here plus 0x0B VT — until
// the SECOND Operator ruling of 2026-08-22 dropped VT from it too, for the
// identical reason it is absent here: a browser's tag-name state APPENDS VT to
// the tag NAME, so `<section\x0b…>` yields no `<section>` element at all. The two
// sets answer different questions at different positions — what may FOLLOW a tag
// name (§6.2) versus what SEPARATES two attributes (§6.4) — but their whitespace
// ground is now ONE ground, HTML5's five, and the earlier inversion is closed.
// (`WS_GT`, the close-tail near-miss discriminator, is a third set answering a
// third question and is deliberately still six wide — see its own comment.)
// ────────────────────────────────────────────────────────────────────────────
const ATTR_SEP = new Set([
  "\u0009", // U+0009 TAB
  "\u000a", // U+000A LF
  "\u000c", // U+000C FF
  "\u000d", // U+000D CR
  "\u0020", // U+0020 SPACE
]);

// ────────────────────────────────────────────────────────────────────────────
function parseTagAttrs(tagInner, dupNames) {
  const attrs = {};
  const seenNames = dupNames ? new Set() : null;
  const n = tagInner.length;
  let i = 0;
  while (i < n) {
    while (i < n && ATTR_SEP.has(tagInner[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && !ATTR_SEP.has(tagInner[i]) && tagInner[i] !== "=" && tagInner[i] !== '"' && tagInner[i] !== "'") i++;
    if (i === nameStart) { i++; continue; }
    const name = tagInner.slice(nameStart, i).toLowerCase();
    if (seenNames) {
      if (seenNames.has(name)) dupNames.push(name);
      else seenNames.add(name);
    }
    let j = i;
    while (j < n && ATTR_SEP.has(tagInner[j])) j++;
    if (j < n && tagInner[j] === "=") {
      j++;
      while (j < n && ATTR_SEP.has(tagInner[j])) j++;
      if (j < n && (tagInner[j] === '"' || tagInner[j] === "'")) {
        const quote = tagInner[j];
        j++;
        const valStart = j;
        while (j < n && tagInner[j] !== quote) j++;
        attrs[name] = tagInner.slice(valStart, j);
        if (j < n) j++;
      } else {
        const valStart = j;
        while (j < n && !ATTR_SEP.has(tagInner[j])) j++;
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
// §6.1 id production — ONE definition, called from every path that holds an id
// to the grammar: the whole-document live-element walk (findGlobalIdFault), the
// tail path's <article id>, the manifest link's fragment, and the
// nested-recompute loop. The production is a property of the format, not of a
// shape or a call site, so it MUST NOT be re-inlined anywhere.
//
//     id    := start cont*
//     start := [A-Za-z_]
//     cont  := [A-Za-z0-9_.:-]
//
// ASCII, spelled byte-exact — NOT Unicode property escapes. A stranger with a
// text editor and SHA-256 must be able to evaluate the production without a
// versioned Unicode table (V6), and §9.2a's byte-scanner must reach the same
// answer as this reader. `\w` is deliberately not used: JS's `\w` is ASCII-only
// (even under /u) while Python's IS Unicode-aware, so a `\w`-spelled production
// could never be identical across the two readers.
//
// NO FLAGS on the regex — in particular no /m, so `$` means end of input and
// `abc\n` is refused here exactly as verify.py's re.fullmatch refuses it. The
// typeof guard keeps a null (a valueless `id`) from being coerced to the string
// "null" and passing, which is what a bare `.test(null)` would do.
// ────────────────────────────────────────────────────────────────────────────
const ID_PRODUCTION_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

function validId(idStr) {
  return typeof idStr === "string" && ID_PRODUCTION_RE.test(idStr);
}

// ────────────────────────────────────────────────────────────────────────────
// §6.6 count-value grammar — ONE definition, called from every path that turns
// a `data-char-count` attribute STRING into a number (tail article, manifest
// link, top-level section attribute, nested section attribute).
//
//     count := "0" | [1-9][0-9]*
//
// No sign, no leading zeros, no separators, no surrounding whitespace, no hex,
// no underscores, no fullwidth digits, no junk suffix. Anything else is a
// refusal — never a best-effort parse (`parseInt("120abc", 10)` cheerfully
// returns 120, and `parseInt("0x78", 10)` returns 0) and never a silent skip.
// The verdict string lives here and nowhere else.
// ────────────────────────────────────────────────────────────────────────────
const COUNT_PRODUCTION_RE = /^(?:0|[1-9][0-9]*)$/;

function parseCount(raw) {
  if (typeof raw !== "string" || !COUNT_PRODUCTION_RE.test(raw)) {
    console.error(`FAIL: invalid char-count grammar: ${typeof raw === "string" ? raw : ""}`);
    process.exit(1);
  }
  return parseInt(raw, 10);
}

// ────────────────────────────────────────────────────────────────────────────
// §6.1 whole-document id scan: production + uniqueness (V5/V30/V33). A "live
// element" is ANY element carrying an id= attribute — top-level
// section/article units, nested sections (witnessed or not), manifest <a> link
// targets, and any id-bearing <img> (§5.5), append-anchor, or other element.
// §6.1's rules are properties of the whole document's id space, not
// per-tag-name rules, so this scan walks every opening tag in the document
// (outside inert regions), not only addressable-unit opening tags.
//
// BOTH §6.1 laws are enforced here, in one pass, in document order: the id
// PRODUCTION (V33 — the scope clause binds every live element, not only the
// elements an addressing path happens to reach) and UNIQUENESS (V30). Because
// this walk runs before shape dispatch, an off-grammar id anywhere in the
// document is refused with the same verdict at the same point in the output on
// both readers, whatever shape the document turns out to be.
//
// QUOTE-AWARE tag-end scan (round-eight-a fleet, BLOCKER B): the attrs blob
// (group 2) is a repetition of THREE alternatives — a double-quoted span, a
// single-quoted span, or a single char that is none of `< > ' "`. A literal
// `>` INSIDE a quoted value (`id="ok>evil"`) is consumed by the quoted
// alternative and can never end the match early; only a real, unquoted `>`
// closes the tag. The previous `[^<>]*` capture could not tell a quoted `>`
// from the tag's own terminator and truncated the tag there, handing the
// tokenizer `id="ok` — a shared fail-open both readers accepted as PASS.
//
// NO SEPARATOR REQUIREMENT and NO `\s` anywhere in this pattern (round-eight-a
// fleet, BLOCKER A): the previous pattern required a literal `\s+` between the
// tag name and the attrs blob, and JS's STRING-mode `\s` matches U+00A0 NBSP
// and other Unicode space characters while Python's BYTES-mode `\s` is
// ASCII-only — a cross-reader divergence (`<span id="bad id">` FAILED on
// verify.mjs, PASSED on verify.py). Requiring an explicit ASCII separator here
// does not fix that divergence — it would make BOTH readers silently DROP the
// malformed tag instead (neither would even see its `id`), which is worse, not
// safer. The catch-all alternative `[^<>'"]` already contains every ASCII
// whitespace char (space, tab, LF, FF, CR) AND NBSP AND any other non-special
// char, with no whitespace-vs-not decision made here at all: the blob is
// captured whole and handed to `parseTagAttrs` below, whose OWN separator
// handling (its `ATTR_SEP` tests, §6.4) is the enumerated set pinned identically
// in both readers (see the comment at `ATTR_SEP`'s definition) — so the real
// whitespace-recognition decision is made exactly ONCE, in code already proven
// cross-reader-identical, not re-decided here in a second, differently-behaved
// class. Since the 2026-08-22 ruling that set is HTML5's five, so NBSP here is
// absorbed into the attribute NAME rather than treated as a separator — on both
// readers alike.
// ────────────────────────────────────────────────────────────────────────────
const ANY_OPEN_TAG_RE = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^<>'"])*)>/y;

// ────────────────────────────────────────────────────────────────────────────
// §6.1 BLOCKER (round-eight-b): the unterminated-quote hole in the outer tag
// regex ITSELF (post-R6 review) — verify.py's `_find_global_id_fault` carries
// the full rationale; this is its behavioral twin.
//
// ANY_OPEN_TAG_RE has no fallback when a quote opens with no reachable close.
// `<b id="bad id>` (or the single-quote twin) makes the match, ANCHORED at
// that tag's own '<', FAIL: the quoted-span alternative needs a matching
// close quote and finds none it can pair with all the way to a legal '>',
// the catch-all alternative categorically excludes the bare quote char, and
// no other alternative can consume it either. Under a document-wide `exec`
// loop (the prior implementation, `g` flag only), a failed match at one
// position is simply INVISIBLE — the engine silently retries at the next
// char and resyncs at whatever tag DOES parse later in the document.
// `<b id="bad id>` was therefore never seen by this scan at all: both
// readers PASSED it, and V30's dup-id defense rode the identical hole.
//
// THE FIX: ANY_OPEN_TAG_RE above is now `y` (sticky, not `g`) — sticky mode
// requires a match to start EXACTLY at `lastIndex` and fails (rather than
// searching forward) otherwise, which is JS's equivalent of Python's
// `.match(html, start)`. findGlobalIdFault walks every candidate tag-start
// position explicitly (a '<' immediately followed by an ASCII letter —
// TAG_START_RE; `<!--`, `<!DOCTYPE`, `</...>`, and `<?...` never qualify,
// since none has a letter immediately after '<') and, at each one outside an
// inert region, sets `lastIndex` there and execs the sticky regex. A
// candidate that matches is handled exactly as before (production, then
// uniqueness) and the walk resumes at the match's own end. A candidate that
// does NOT match needs one more question answered before it can be refused.
//
// Plain body text can ALSO start with '<letter' with no fallback in sight —
// `a<b` in prose, `<b` immediately followed by another real tag with nothing
// in between — and that failure carries NO quote at all; it was invisible
// before this fix and MUST stay invisible now (refusing it would turn
// ordinary prose into a false-positive FAIL). The discriminator: consume the
// tag name, then as much plain (non-`< > ' "`) content as the quote-FREE
// catch-all alone would consume (TAG_NAME_ONLY_RE + ATTR_PLAIN_RE). If the
// char immediately after that is a quote, an attribute value was OPENED and
// never reachably closed — THAT is BLOCKER 1's fault, refused at the byte
// offset of the tag's own '<' (converted via byteOffset, since html is a
// char-indexed string here, unlike verify.py's raw bytes). If it is anything
// else ('<', or end of string — a bare '>' cannot occur here, by the same
// contradiction argument as verify.py's twin), no quote was ever opened —
// this "<letter" was never a real tag attempt, and the walk simply resumes
// one char later, exactly as invisible as it always was.
// ────────────────────────────────────────────────────────────────────────────
const TAG_START_RE = /<[a-zA-Z]/g;
const TAG_NAME_ONLY_RE = /<[a-zA-Z][\w-]*/y;
const ATTR_PLAIN_RE = /[^<>'"]*/y;

function findGlobalIdFault() {
  // Uses inertMasks (comments + <script>/<style> raw-text content, §12) so a
  // literal id-shaped substring inside JS/CSS text is not mistaken for a
  // real element's id.
  //
  // Order matters and is deterministic: each element is tested for the
  // production before it is entered into the uniqueness set, so an id that is
  // both off-grammar and repeated is reported as a production fault at its
  // FIRST occurrence, identically on both readers. A malformed tag is
  // likewise reported at its own document-order position, ahead of any
  // production or duplicate fault found on a LATER tag. A VALUELESS `id`
  // attribute (`<div id>`) parses as null but IS present (`"id" in a`) — F4
  // (post-round-4-validation) resolves it the same way §5.4 resolves a
  // valueless `data-witness`: presence-with-no-value coalesces to the empty
  // string and is held to the production exactly as `id=""` is, both
  // returning `{kind:"production", id:""}`. Only an id attribute that was
  // never written at all (`"id" in a` is false) is invisible to this walk.
  //
  // R6c (post-R6/R6-refinement review): a tag carrying the SAME attribute
  // name twice (`<img id="ok" id="bad id">`, two `class=` on one tag, ...) is
  // resolved by parseTagAttrs's tokenizer to a single last-wins value with no
  // trace a second occurrence ever existed, so the off-grammar or duplicate id
  // inside it was never seen — both readers PASSED such a tag identically.
  // <section>/<article> unit openers were incidentally protected by the
  // SEPARATE downstream V25 refusal (refuseNonCanonicalAttrs), but that check
  // never runs on <img>, an append-anchor, or any other non-unit live element.
  // THE FIX: parseTagAttrs is asked, via its optional dupNames parameter, to
  // report every repeated name it sees while tokenizing THIS SAME tag, and a
  // duplicate found on ANY opening tag the walk visits (id-bearing or not,
  // matching V37's identical breadth) is refused BEFORE that tag's id is ever
  // read, at the tag's own '<' (V37's offset rule — not the offset of the
  // duplicate occurrence, which is what the pre-existing, unit-opener-only
  // V25 refusal reports).
  const seen = new Set();
  let pos = 0;
  const n = html.length;
  while (pos < n) {
    TAG_START_RE.lastIndex = pos;
    const sm = TAG_START_RE.exec(html);
    if (!sm) break;
    const start = sm.index;
    if (inMaskedRange(start, inertMasks)) { pos = start + 1; continue; }
    ANY_OPEN_TAG_RE.lastIndex = start;
    const m = ANY_OPEN_TAG_RE.exec(html);
    if (m) {
      const dupNames = [];
      const a = parseTagAttrs(m[2] || "", dupNames);
      if (dupNames.length) {
        return { kind: "dup-attr", name: dupNames[0], offset: byteOffset(start) };
      }
      if ("id" in a) {
        // A VALUELESS `id` (`<div id>`) tokenizes to null here — same as
        // `id=""` after the `?? ""` coalesce, and different from an id
        // attribute that was never written at all (`"id" in a` is false and
        // this branch is not entered, exactly as before). F4: a valueless
        // id IS an id attribute, just an empty one — it is not skipped, it
        // is held to the same production as `id=""`.
        const id = a.id ?? "";
        if (!validId(id)) return { kind: "production", id };
        if (seen.has(id)) return { kind: "duplicate", id };
        seen.add(id);
      }
      pos = m.index + m[0].length;
      continue;
    }
    // The anchored match failed. Discriminate an unterminated attribute quote
    // (refuse) from ordinary text that merely LOOKS like a tag start (stay
    // invisible, as always) — see the BLOCKER comment above.
    TAG_NAME_ONLY_RE.lastIndex = start;
    const nameM = TAG_NAME_ONLY_RE.exec(html);
    ATTR_PLAIN_RE.lastIndex = nameM.index + nameM[0].length;
    const plainM = ATTR_PLAIN_RE.exec(html);
    const plainEnd = plainM.index + plainM[0].length;
    const nextCh = plainEnd < n ? html[plainEnd] : "";
    if (nextCh === '"' || nextCh === "'") {
      return { kind: "malformed", offset: byteOffset(start) };
    }
    pos = start + 1;
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
//
// R8 follow-up (post-round-4-validation item 1): this used to test the
// running engine's own `/\s/` — verify.py's sibling function tested
// `bytes.isspace()` on raw bytes instead, a DIFFERENT and narrower predicate
// (6 ASCII bytes, unable to see a multi-byte UTF-8 separator at all). Two
// unpinned, mutually-inconsistent separator predicates on two supposedly-
// identical functions — exactly what R8 exists to close. Now uses ATTR_SEP,
// the SAME enumerated separator set parseTagAttrs uses (HTML5's five since the
// 2026-08-22 ruling) — one predicate,
// shared by every tokenizer in this reader.
// ────────────────────────────────────────────────────────────────────────────
function refuseNonCanonicalAttrs(tagInner, tagInnerStart) {
  const seen = new Set();
  const n = tagInner.length;
  let i = 0;
  while (i < n) {
    while (i < n && ATTR_SEP.has(tagInner[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && !ATTR_SEP.has(tagInner[i]) && tagInner[i] !== "=" && tagInner[i] !== '"' && tagInner[i] !== "'") i++;
    if (i === nameStart) { i++; continue; }
    const name = tagInner.slice(nameStart, i).toLowerCase();
    if (seen.has(name)) {
      throw new NonCanonical(
        `duplicate attribute name '${name}' on a witnessed-unit opening tag (§6.4, V25)`,
        byteOffset(tagInnerStart + nameStart));
    }
    seen.add(name);
    let j = i;
    while (j < n && ATTR_SEP.has(tagInner[j])) j++;
    if (j < n && tagInner[j] === "=") {
      j++;
      while (j < n && ATTR_SEP.has(tagInner[j])) j++;
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
// sites. tagMatch is /^<TAG([^>]*)>/ exec'd on the opening tag's slice (no
// `\s` at the join since the 2026-08-22 separator ruling — see the ATTR_SEP
// comment); group 1 sits immediately before the final '>' of the match.
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

// §6.2 BOUNDARY-TOKEN OPEN set (RULED by the Operator, 2026-08-22 — the second
// ruling of that sitting). A byte sequence is an open token for TAG iff it is
// `<` + TAG followed by exactly one of these bytes. The whitespace members are
// HTML5's five — 0x09 TAB, 0x0A LF, 0x0C FF, 0x0D CR, 0x20 SPACE — plus `/` and
// `>`. 0x0B VT was a member until the ruling and is NOT one now: a browser's
// tag-name state appends VT to the tag NAME, so `<section\x0bid="x">` opens an
// element named `section\x0b` and NO `<section>` element is ever produced. A
// reader that called it an open token was reading bytes a browser reads
// differently — what is verified must be what is read (the V4 Discernment) — so
// under the ruling the element is invisible to this reader exactly as it is
// invisible to a browser. Identical, member for member, to verify.py's
// `_BOUNDARY_NEXT`, and resting on the same five bytes as §6.4's `ATTR_SEP`.
const WS_SLASH_GT = new Set([" ", "\t", "\n", "\r", "\f", "/", ">"]);
// NOT `WS_SLASH_GT`, and deliberately still SIX bytes wide (0x0B VT included).
// This set does not decide what a boundary IS; it decides whether a
// close-tag-SHAPED token that is not canonical is a near-miss worth refusing as
// NON-CANONICAL or a longer tag name that is ordinary content. Keeping VT here
// keeps `</section\x0b>` a refusal rather than a silent skip — the fail-closed
// direction — and it is byte-identical on both trial readers AND on the sealed
// dev pair. The 2026-08-22 VT ruling names the OPEN set; this position is
// recorded in SPEC.md §6.2 as its own residual, not folded in silently.
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
// §6.1/§9.1 whole-document id check — runs BEFORE shape dispatch, over every
// live element's id (not only addressable-unit ids; V5/V30/V33): the id
// PRODUCTION and then uniqueness, in document order.
// ────────────────────────────────────────────────────────────────────────────
const globalIdFault = findGlobalIdFault();
if (globalIdFault !== null) {
  if (globalIdFault.kind === "production") {
    console.error(`FAIL: invalid id production: ${globalIdFault.id}`);
  } else if (globalIdFault.kind === "duplicate") {
    console.error(`FAIL: duplicate id: ${globalIdFault.id}`);
  } else if (globalIdFault.kind === "dup-attr") {
    // R6c: duplicate attribute NAME on any tag the walk visits
    console.error(`FAIL: duplicate attribute name '${globalIdFault.name}' in tag at byte offset ${globalIdFault.offset}`);
  } else {
    // 'malformed' — BLOCKER 1: unterminated attribute quote
    console.error(`FAIL: unterminated attribute quote in tag at byte offset ${globalIdFault.offset}`);
  }
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Shape detection (§5.0)
// ────────────────────────────────────────────────────────────────────────────
const NAV_OPEN_RE = /<nav\b([^>]*)>/gi;
let navStart = -1;
for (const m of html.matchAll(NAV_OPEN_RE)) {
  if (inMaskedRange(m.index, inertMasks)) continue;
  const a = parseTagAttrs(m[1]);
  if (a.id === "manifest") {
    navStart = m.index + m[0].length;
    break;
  }
}
// Presence-only: whether `</nav>` can be located (masked-aware, R4b) is
// resolved later, once the manifest-first path actually runs — mirroring
// verify.py's `_verify_manifest_first`, which re-locates `</nav>` itself
// rather than folding well-formedness into shape detection. This keeps V18
// (mixed-shape refusal) reachable purely on nav PRESENCE, exactly as py's
// `nav_found` is presence-only.
const navFound = navStart >= 0;

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
    // R8 RULING (Operator, 2026-08-22) — NO `\s` at the tag-name/attrs
    // join; see verify.py's twin comment for the full argument. In short: a
    // `\s*` here is a SEPARATOR decision made outside the one pinned
    // predicate, and this engine's `\s` (25 codepoints) is not Python's
    // bytes-mode `\s` (6 bytes). With `ATTR_SEP` narrowed to HTML5's five
    // the two no longer cover for each other, so the blob is captured whole
    // and `ATTR_SEP` alone decides — the shape ANY_OPEN_TAG_RE already uses.
    const tagMatch = /^<article([^>]*)>/.exec(html.slice(openStart, openEnd));
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
    // §6.1 id production check — the ONE definition, never re-inlined.
    if (!validId(id)) {
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

    // §6.6 char-count check (optional attribute). A PRESENT value is held to
    // the §6.6 count grammar — off-grammar is a refusal, not a best-effort
    // parse and not a skip.
    const ccStr = a["data-char-count"];
    if (ccStr != null) {
      const claimedCC = parseCount(ccStr);
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
// R4b: find the first `</nav>` at or after navStart that is NOT itself
// inside an inert region (§12) — the same inMaskedRange test already used
// to locate the <nav id="manifest"> opener above (same absolute-offset
// arithmetic; `candidate` is already an absolute index into `html`, not
// relative to navStart). A `</nav>` written inside an HTML comment INSIDE
// the manifest (e.g. a commented-out usage example) is not the manifest's
// real close and must not truncate it.
let navEnd = -1;
{
  let searchPos = navStart;
  while (true) {
    const candidate = html.indexOf("</nav>", searchPos);
    if (candidate < 0) break;
    if (inMaskedRange(candidate, inertMasks)) { searchPos = candidate + 1; continue; }
    navEnd = candidate;
    break;
  }
}
if (navEnd < 0) {
  console.error("FAIL: <nav id=\"manifest\"> is unterminated");
  process.exit(1);
}
const navInner = html.slice(navStart, navEnd);

const sections = [];
const A_TAG_RE = /<a\b([^>]*)>/gi;
for (const m of navInner.matchAll(A_TAG_RE)) {
  // §12 inert regions (comments etc.) are invisible to every check — mirrors
  // the adjacent nav-locating scan's mask idiom above. An <a> written inside
  // an HTML comment inside nav#manifest is not a live manifest entry (a
  // commented-out example, say); skip it rather than refusing the document
  // over dead markup. m.index is relative to navInner, so the mask lookup
  // needs the ABSOLUTE char offset (navStart + m.index) — inertMasks is
  // built over the whole document.
  if (inMaskedRange(navStart + m.index, inertMasks)) continue;
  const a = parseTagAttrs(m[1]);
  const href = a.href || "";
  const sha256 = a["data-witness"] || "";
  // §5.4 already REQUIRES `href="#id"` and `data-witness` on a manifest entry.
  // A malformed entry was previously a silent `continue` — the entry simply
  // vanished from the list, and with it the unit it was supposed to address, so
  // a document could shed a section from the verified set by malforming its own
  // link. That is a refusal, not a drop. The gate is `<a>` inside
  // `<nav id="manifest">`; anchors elsewhere in the document are untouched.
  if (!href.startsWith("#")) {
    console.error(`FAIL: manifest link href is not a fragment: ${href}`);
    process.exit(1);
  }
  if (!sha256) {
    console.error(`FAIL: manifest link missing data-witness: ${href}`);
    process.exit(1);
  }
  const id = href.slice(1);
  // §6.1 id production — the manifest link's fragment IS the addressable
  // unit's id, so it is held to the same production every other live element's
  // id is held to. Reachable here for a fragment that names no element at all
  // (`href="#"`), which the whole-document walk cannot see.
  if (!validId(id)) {
    console.error(`FAIL: invalid id production: ${id}`);
    process.exit(1);
  }
  const manifestCharCount = a["data-char-count"] != null ? parseCount(a["data-char-count"]) : null;
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
      // R8 RULING (Operator, 2026-08-22) — NO `\s` at the tag-name/attrs
      // join; see verify.py's twin comment for the full argument. In short: a
      // `\s*` here is a SEPARATOR decision made outside the one pinned
      // predicate, and this engine's `\s` (25 codepoints) is not Python's
      // bytes-mode `\s` (6 bytes). With `ATTR_SEP` narrowed to HTML5's five
      // the two no longer cover for each other, so the blob is captured whole
      // and `ATTR_SEP` alone decides — the shape ANY_OPEN_TAG_RE already uses.
      const tagMatch = /^<section([^>]*)>/.exec(html.slice(openStart, openEnd));
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
  // §6.6 count grammar on the SECTION's own attribute. Parsed HERE — after the
  // manifest comparison and before the section comparison — because verify.py
  // parses it at exactly this point; a section carrying both a manifest-count
  // mismatch and an off-grammar section count must produce the same lines in
  // the same order on both readers.
  const sectionCharCount = sectionAttrs["data-char-count"] != null
    ? parseCount(sectionAttrs["data-char-count"])
    : null;
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
  // ABSENT and VALUELESS are different, and the difference is a verdict.
  // Absent -> non-witnessed structural nesting; skip. Present but valueless
  // (`<section data-witness>`) -> a witness that cannot be classified, which
  // classifyWitness reports as invalid grammar rather than a skip — so the test
  // is attribute PRESENCE, not `!= null`. It also comes FIRST: whether the unit
  // is addressable at all is decided by the WITNESS, not by the id.
  if (!("data-witness" in a)) continue; // non-witnessed structural nesting — not addressable
  const nid = a.id;
  // §5.2 REQUIRES an id on an addressable unit, and a nested <section> carrying
  // data-witness IS one. Refuse rather than skip. This also retires the latent
  // `seenIds.add(null)` — under the old ordering an id-less witnessed nested
  // section fell through to the dup guard, so the FIRST one was silently
  // skipped and every later one was skipped again as a "duplicate" of null. An
  // all-zeros witness on such a section is now refused, never passed.
  if (!nid) {
    console.error("FAIL: nested <section data-witness> with no id");
    process.exit(1);
  }
  if (!validId(nid)) {
    console.error(`FAIL: invalid id production: ${nid}`);
    process.exit(1);
  }
  if (seenIds.has(nid)) continue;
  const ndw = a["data-witness"];
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
    const nClaimedCC = parseCount(nccStr);
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
