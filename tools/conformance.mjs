#!/usr/bin/env node
// tools/conformance.mjs — conformance harness for doc.html v0.4
//
// Runs BOTH reference readers (verify.mjs, verify.py) over every present
// example, asserts SPEC §13 vectors byte-exact, and checks the NIST "abc"
// SHA-256 sanity vector.
//
// Exit code 0 = all assertions pass.  Nonzero = at least one failure.
//
// Usage:  node tools/conformance.mjs
//
import { createHash } from "node:crypto";
import { execSync }   from "node:child_process";
import fs              from "node:fs";
import path            from "node:path";
import { fileURLToPath } from "node:url";

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const REPO   = path.resolve(__dir, "..");

// ─── helpers ──────────────────────────────────────────────────────────────────

function sha256hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function codePoints(str) {
  return Array.from(str).length;
}

let failures = 0;

function pass(msg)  { console.log(`  PASS  ${msg}`); }
function fail(msg)  { console.log(`  FAIL  ${msg}`); failures++; }
function header(msg){ console.log(`\n── ${msg} ──`); }
function warn(msg)  { console.log(`  WARN  ${msg}`); }

// ─── 1. NIST sanity (V17) ─────────────────────────────────────────────────────
header("NIST SHA-256 sanity (V17)");
const NIST_EXPECTED = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const nistActual    = sha256hex(Buffer.from("abc", "utf8"));
if (nistActual === NIST_EXPECTED) {
  pass(`sha256("abc") = ${nistActual}`);
} else {
  fail(`sha256("abc") expected ${NIST_EXPECTED} got ${nistActual}`);
}

// ─── 2. SPEC §13 anti-vacuity gate ───────────────────────────────────────────
header("Anti-vacuity gate — §13 Vector set 2 must not contain PLACEHOLDER");
const specPath = path.join(REPO, "SPEC.md");
const specText = fs.readFileSync(specPath, "utf8");

// Find Vector set 2 section — bounded to end at the NEXT "Vector set N"
// heading (or, absent one, end of file) so this gate checks only Vector
// set 2's own hashes and does not false-positive on unrelated later
// content (e.g. a later vector set's own, deliberately-named "placeholder
// grammar" fixture prose — P0.4 Vector set 4).
const vs2Idx = specText.indexOf("Vector set 2");
if (vs2Idx < 0) {
  fail("SPEC.md does not contain 'Vector set 2' — cannot check anti-vacuity");
} else {
  const nextVectorSetMatch = specText.slice(vs2Idx + "Vector set 2".length).match(/Vector set \d+/);
  const vs2End = nextVectorSetMatch
    ? vs2Idx + "Vector set 2".length + nextVectorSetMatch.index
    : specText.length;
  const vs2Tail = specText.slice(vs2Idx, vs2End);
  if (/PLACEHOLDER/i.test(vs2Tail)) {
    fail("SPEC.md §13 Vector set 2 contains the word PLACEHOLDER — Phase B2 did not backfill real hashes");
    console.log("  The harness cannot pass on placeholder vectors.");
    process.exit(1);
  } else {
    pass("§13 Vector set 2 has no PLACEHOLDER — real hashes are present");
  }
}

// ─── 3. SPEC §13 Vector set 1 — manifest-first section vectors ───────────────
header("SPEC §13 Vector set 1 — manifest-first sections");

// Section "intro" — inner bytes exactly as stated in §13 (UTF-8, untrimmed).
// The SPEC shows:
//   <h1>Introduction</h1>
//   <p>A doc.html is a single self-verifying HTML file.</p>
// with a trailing newline implied by the code block boundaries.
//
// Cross-checked from examples/minimal.doc.html: the section opening tag ends
// immediately before the content and the closing </section> starts at the end.
// The exact inner span is the string below.
const INTRO_INNER = `<h1>Introduction</h1>\n<p>A doc.html is a single self-verifying HTML file.</p>`;
const INTRO_BUF   = Buffer.from(INTRO_INNER, "utf8");
const INTRO_EXPECTED_HASH = "e7a0ef76d83c419931b7f68207f9cce7229321f7d3c7ac3bf45f5e250b1558e3";
const INTRO_EXPECTED_CC   = 77;

const introHash = sha256hex(INTRO_BUF);
const introCC   = codePoints(INTRO_INNER);

if (INTRO_BUF.length !== 77) {
  fail(`intro: byte length expected 77, got ${INTRO_BUF.length}`);
} else {
  pass(`intro: byte length = ${INTRO_BUF.length}`);
}
if (introCC !== INTRO_EXPECTED_CC) {
  fail(`intro: code-point count expected ${INTRO_EXPECTED_CC}, got ${introCC}`);
} else {
  pass(`intro: code-point count = ${introCC}`);
}
if (introHash !== INTRO_EXPECTED_HASH) {
  fail(`intro: sha256 expected ${INTRO_EXPECTED_HASH}, got ${introHash}`);
} else {
  pass(`intro: sha256 = ${introHash}`);
}

// Section "fold" — inner bytes:
//   <h1>The Fold</h1>
//   <p>Memory is append-only; correction is supersession.</p>
const FOLD_INNER = `<h1>The Fold</h1>\n<p>Memory is append-only; correction is supersession.</p>`;
const FOLD_BUF   = Buffer.from(FOLD_INNER, "utf8");
const FOLD_EXPECTED_HASH = "771feff3620a380e35e3fa970868af438c21223dd279aa3001851387b2647d91";
const FOLD_EXPECTED_CC   = 75;

const foldHash = sha256hex(FOLD_BUF);
const foldCC   = codePoints(FOLD_INNER);

if (FOLD_BUF.length !== 75) {
  fail(`fold: byte length expected 75, got ${FOLD_BUF.length}`);
} else {
  pass(`fold: byte length = ${FOLD_BUF.length}`);
}
if (foldCC !== FOLD_EXPECTED_CC) {
  fail(`fold: code-point count expected ${FOLD_EXPECTED_CC}, got ${foldCC}`);
} else {
  pass(`fold: code-point count = ${foldCC}`);
}
if (foldHash !== FOLD_EXPECTED_HASH) {
  fail(`fold: sha256 expected ${FOLD_EXPECTED_HASH}, got ${foldHash}`);
} else {
  pass(`fold: sha256 = ${foldHash}`);
}

// ─── 4. SPEC §13 Vector set 2 — tail article vectors ─────────────────────────
// The SPEC gives literal inner bytes for turn-000001 and turn-000004.
// For the remaining 6 we assert the witnesses by running the reader against
// chat.doc.html and cross-checking the §13 table.

header("SPEC §13 Vector set 2 — tail articles (literal-bytes check for turns 1 + 4)");

// turn-000001: inner bytes (UTF-8, untrimmed).
// "—" is U+2014 EM DASH (3 bytes); byte length 197, code points 195.
const T1_INNER = `\n  <header><h3>Turn 1 — User</h3>\n    <p class="meta">kind: transcription</p></header>\n  <div class="turn-content">\n    <p>What is a doc.html file and how does it store information?</p>\n  </div>\n`;
const T1_BUF   = Buffer.from(T1_INNER, "utf8");
const T1_EXPECTED_HASH = "f4f2f5db437a1156c1ec65185646e1bb8dda27118e3230d348b87e7acb865368";
const T1_EXPECTED_BYTES = 197;
const T1_EXPECTED_CC    = 195;

const t1Hash = sha256hex(T1_BUF);
const t1CC   = codePoints(T1_INNER);

if (T1_BUF.length !== T1_EXPECTED_BYTES) {
  fail(`turn-000001: byte length expected ${T1_EXPECTED_BYTES}, got ${T1_BUF.length}`);
} else {
  pass(`turn-000001: byte length = ${T1_BUF.length}`);
}
if (t1CC !== T1_EXPECTED_CC) {
  fail(`turn-000001: code-point count expected ${T1_EXPECTED_CC}, got ${t1CC}`);
} else {
  pass(`turn-000001: code-point count = ${t1CC}`);
}
if (t1Hash !== T1_EXPECTED_HASH) {
  fail(`turn-000001: sha256 expected ${T1_EXPECTED_HASH}, got ${t1Hash}`);
} else {
  pass(`turn-000001: sha256 = ${t1Hash}`);
}

// turn-000004: literal inner bytes containing the critical <!-- </article> --> comment.
// byte length 1159, code points 1154.
// We extract the inner bytes directly from chat.doc.html to assert them byte-exact.
header("SPEC §13 Vector set 2 — turn-000004 (comment-masking exercise, byte-extracted)");

const chatPath = path.join(REPO, "examples", "chat.doc.html");
const chatBuf  = fs.readFileSync(chatPath);
const chatStr  = chatBuf.toString("utf8");

// Build comment masks for the depth-walk.
function buildMasks(src) {
  const masks = [];
  let p = 0;
  while (p < src.length) {
    const s = src.indexOf("<!--", p);
    if (s < 0) break;
    const e = src.indexOf("-->", s + 4);
    if (e < 0) break;
    masks.push([s, e + 3]);
    p = e + 3;
  }
  return masks;
}

function inMask(idx, masks) {
  for (const [s, e] of masks) {
    if (s > idx) break;
    if (idx < e) return true;
  }
  return false;
}

function byteOff(str, charIdx) {
  return Buffer.byteLength(str.slice(0, charIdx), "utf8");
}

const chatMasks = buildMasks(chatStr);

function extractInner(openMatch, tag) {
  const openEnd = openMatch.index + openMatch[0].length;
  const DR = new RegExp(`<${tag}\\b|<\\/${tag}>`, "gi");
  let depth = 1, pos = openEnd, closeIdx = -1;
  while (depth > 0 && pos < chatStr.length) {
    DR.lastIndex = pos;
    const dm = DR.exec(chatStr);
    if (!dm) break;
    if (inMask(dm.index, chatMasks)) { pos = dm.index + dm[0].length; continue; }
    if (dm[0].toLowerCase().startsWith(`<${tag}`)) depth++;
    else { depth--; if (depth === 0) { closeIdx = dm.index; break; } }
    pos = dm.index + dm[0].length;
  }
  if (closeIdx < 0) return null;
  const sb = byteOff(chatStr, openEnd);
  const eb = byteOff(chatStr, closeIdx);
  return chatBuf.slice(sb, eb);
}

const ARTICLE_RE = /<article\b([^>]*)>/gi;
let t4inner = null;
for (const m of chatStr.matchAll(ARTICLE_RE)) {
  if (m[1].includes("turn-000004")) {
    t4inner = extractInner(m, "article");
    break;
  }
}

const T4_EXPECTED_BYTES = 1159;
const T4_EXPECTED_CC    = 1154;
const T4_EXPECTED_HASH  = "2709fd288f0fc457a0e05df650b1d92f8727b3d8b31e012a0b0574206b8d8059";

if (!t4inner) {
  fail("turn-000004: could not extract inner bytes from chat.doc.html");
} else {
  const t4Hash = sha256hex(t4inner);
  const t4CC   = codePoints(t4inner.toString("utf8"));
  if (t4inner.length !== T4_EXPECTED_BYTES) {
    fail(`turn-000004: byte length expected ${T4_EXPECTED_BYTES}, got ${t4inner.length}`);
  } else {
    pass(`turn-000004: byte length = ${t4inner.length}`);
  }
  if (t4CC !== T4_EXPECTED_CC) {
    fail(`turn-000004: code-point count expected ${T4_EXPECTED_CC}, got ${t4CC}`);
  } else {
    pass(`turn-000004: code-point count = ${t4CC}`);
  }
  if (t4Hash !== T4_EXPECTED_HASH) {
    fail(`turn-000004: sha256 expected ${T4_EXPECTED_HASH}, got ${t4Hash}`);
  } else {
    pass(`turn-000004: sha256 = ${t4Hash}`);
  }
}

// ─── 5. Run readers over all examples ─────────────────────────────────────────
header("Reader × example matrix");

// Examples to test — skip any that do not exist.
const EXAMPLES = [
  "minimal",
  "memory",
  "selective-context",
  "chat",
  "reference",
  "mixed-epoch",
];

// Maps example short-name → resolved path.
const exampleFiles = {
  "minimal":           path.join(REPO, "examples", "minimal.doc.html"),
  "memory":            path.join(REPO, "examples", "memory.doc.html"),
  "selective-context": path.join(REPO, "examples", "selective-context-demo.doc.html"),
  "chat":              path.join(REPO, "examples", "chat.doc.html"),
  "reference":         path.join(REPO, "examples", "reference.doc.html"),
  "mixed-epoch":       path.join(REPO, "examples", "mixed-epoch.doc.html"),
};

const verifyMjs = path.join(REPO, "verify.mjs");
const verifyPy  = path.join(REPO, "verify.py");

// Parse unit count from reader stdout.
// Both readers print either "sections: N" or "articles: N".
function parseUnitCount(stdout) {
  const m = stdout.match(/(?:sections|articles):\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Parse pass count from "verified N/M" line.
function parseVerified(stdout) {
  const m = stdout.match(/verified\s+(\d+)\/(\d+)/);
  return m ? { ok: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
}

function runReader(cmd, filePath) {
  try {
    const stdout = execSync(`${cmd} "${filePath}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { exit: 0, stdout, stderr: "" };
  } catch (e) {
    return {
      exit: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

// Determine python command (python or python3).
let pythonCmd = "python";
try {
  execSync("python --version", { stdio: "ignore" });
} catch {
  pythonCmd = "python3";
}

// Header row for the matrix.
const COL = 20;
const present = [];
const skipped = [];

for (const name of EXAMPLES) {
  const fp = exampleFiles[name];
  if (!fs.existsSync(fp)) {
    skipped.push(name);
  } else {
    present.push(name);
  }
}

if (skipped.length > 0) {
  console.log();
  for (const s of skipped) {
    warn(`${s}.doc.html not found — skipped`);
  }
}

console.log();
console.log(
  "  " +
  "example".padEnd(COL) +
  "node verify.mjs".padEnd(22) +
  "python verify.py".padEnd(22) +
  "units agree?"
);
console.log("  " + "─".repeat(COL + 22 + 22 + 12));

let readerFailures = 0;

for (const name of present) {
  const fp = exampleFiles[name];

  const mjsResult = runReader(`node "${verifyMjs}"`, fp);
  const pyResult  = runReader(`${pythonCmd} "${verifyPy}"`, fp);

  const mjsPass  = mjsResult.exit === 0;
  const pyPass   = pyResult.exit === 0;

  const mjsCount = parseVerified(mjsResult.stdout);
  const pyCount  = parseVerified(pyResult.stdout);

  const mjsLabel = mjsPass
    ? `PASS ${mjsCount ? `${mjsCount.ok}/${mjsCount.total}` : ""}`.trim()
    : `FAIL`;
  const pyLabel  = pyPass
    ? `PASS ${pyCount ? `${pyCount.ok}/${pyCount.total}` : ""}`.trim()
    : `FAIL`;

  let unitsAgree = "—";
  if (mjsCount && pyCount) {
    unitsAgree = (mjsCount.ok === pyCount.ok && mjsCount.total === pyCount.total)
      ? `YES (${mjsCount.ok}/${mjsCount.total})`
      : `NO: mjs=${mjsCount.ok}/${mjsCount.total} py=${pyCount.ok}/${pyCount.total}`;
  } else if (mjsCount || pyCount) {
    unitsAgree = "MISMATCH (one reader missing count)";
  }

  console.log(
    "  " +
    name.padEnd(COL) +
    mjsLabel.padEnd(22) +
    pyLabel.padEnd(22) +
    unitsAgree
  );

  // Accumulate failures.
  if (!mjsPass) {
    readerFailures++;
    console.log(`    [mjs stdout] ${mjsResult.stdout.trim()}`);
    if (mjsResult.stderr) console.log(`    [mjs stderr] ${mjsResult.stderr.trim()}`);
  }
  if (!pyPass) {
    readerFailures++;
    console.log(`    [py  stdout] ${pyResult.stdout.trim()}`);
    if (pyResult.stderr) console.log(`    [py  stderr] ${pyResult.stderr.trim()}`);
  }
  if (mjsPass && pyPass && mjsCount && pyCount &&
      (mjsCount.ok !== pyCount.ok || mjsCount.total !== pyCount.total)) {
    readerFailures++;
    console.log(`    [count mismatch] mjs says ${mjsCount.ok}/${mjsCount.total}, py says ${pyCount.ok}/${pyCount.total}`);
  }
}

failures += readerFailures;

// ─── 6. Negative fixture battery — every negative fixture asserted-failing ───
// P0.4: the full negative-fixture roster (writing-room negatives in
// examples/, plus the P0.2/P0.3 smuggle/linter fixtures in
// trials/scripts/fixtures/chat-v3/) MUST be asserted-failing on BOTH readers,
// as one command. A fixture that unexpectedly PASSES is a conformance
// regression the harness must catch — not a fixture that merely "happens to
// still fail" without being checked.
header("Negative fixture battery — every fixture asserted-failing (both readers)");

const FIXTURES_DIR = path.join(REPO, "trials", "scripts", "fixtures", "chat-v3");

// name -> resolved path. All of these MUST exit non-zero on BOTH verify.py
// and verify.mjs.
const NEGATIVE_FIXTURES = {
  "writing-room-tail (all-timestamp form)": path.join(REPO, "examples", "writing-room-tail.doc.html"),
  "all-timestamp":                path.join(REPO, "examples", "all-timestamp.doc.html"),
  "invalid-witness-grammar":      path.join(REPO, "examples", "invalid-witness-grammar.doc.html"),
  "placeholder-grammar":          path.join(REPO, "examples", "placeholder-grammar.doc.html"),
  "exploit":                      path.join(FIXTURES_DIR, "exploit.doc.html"),
  "exploit_v2":                   path.join(FIXTURES_DIR, "exploit_v2.doc.html"),
  "r3-closing-space":             path.join(FIXTURES_DIR, "r3-closing-space.doc.html"),
  "r4-inside-span-custom-element":path.join(FIXTURES_DIR, "r4-inside-span-custom-element.doc.html"),
  "dup-id-toplevel":              path.join(FIXTURES_DIR, "dup-id-toplevel.doc.html"),
  "dup-id-anchor-image":          path.join(FIXTURES_DIR, "dup-id-anchor-image.doc.html"),
  "mixed-shape-manifest-article": path.join(FIXTURES_DIR, "mixed-shape-manifest-article.doc.html"),
  "minimal-manifest-reversed":    path.join(FIXTURES_DIR, "minimal-manifest-reversed.doc.html"),
  "nested-bad-witness":           path.join(FIXTURES_DIR, "nested-bad-witness.doc.html"),
  "carrier-mismatch":             path.join(FIXTURES_DIR, "carrier-mismatch.doc.html"),
};

// out-of-order.doc.html is NOT in this table: it is an Append-profile-only
// vector (§6.7/V15) — Core readers (verify.py/verify.mjs) do not enforce
// writing-room ordering, so it correctly reports ORDINAL-ONLY (still exit 1,
// asserted separately below) rather than an ordering-specific refusal.
const outOfOrderPath = path.join(REPO, "examples", "out-of-order.doc.html");

let negFailures = 0;
for (const [name, fp] of Object.entries(NEGATIVE_FIXTURES)) {
  if (!fs.existsSync(fp)) {
    fail(`${name}: fixture not found at ${fp}`);
    negFailures++;
    continue;
  }
  const mjsResult = runReader(`node "${verifyMjs}"`, fp);
  const pyResult  = runReader(`${pythonCmd} "${verifyPy}"`, fp);
  const mjsRefused = mjsResult.exit !== 0;
  const pyRefused  = pyResult.exit !== 0;
  if (mjsRefused && pyRefused) {
    pass(`${name}: asserted-failing on both readers (exit ${mjsResult.exit}/${pyResult.exit})`);
  } else {
    fail(`${name}: expected BOTH readers to refuse (non-zero exit); got mjs=${mjsResult.exit} py=${pyResult.exit}`);
    negFailures++;
  }
}

// out-of-order.doc.html: asserted non-zero exit (ORDINAL-ONLY) on both
// Core readers, even though it is not a same-named-reason case.
if (fs.existsSync(outOfOrderPath)) {
  const mjsResult = runReader(`node "${verifyMjs}"`, outOfOrderPath);
  const pyResult  = runReader(`${pythonCmd} "${verifyPy}"`, outOfOrderPath);
  if (mjsResult.exit !== 0 && pyResult.exit !== 0) {
    pass(`out-of-order: asserted-failing on both readers (ORDINAL-ONLY scope, exit ${mjsResult.exit}/${pyResult.exit})`);
  } else {
    fail(`out-of-order: expected BOTH readers to refuse; got mjs=${mjsResult.exit} py=${pyResult.exit}`);
    negFailures++;
  }
} else {
  fail(`out-of-order: fixture not found at ${outOfOrderPath}`);
  negFailures++;
}

failures += negFailures;

// ─── 7. Summary ───────────────────────────────────────────────────────────────
console.log();
console.log("─".repeat(72));
if (skipped.length > 0) {
  console.log(`Skipped (absent): ${skipped.join(", ")}`);
}
if (failures === 0) {
  console.log("ALL ASSERTIONS PASSED — exit 0");
  process.exit(0);
} else {
  console.log(`${failures} assertion(s) FAILED — exit 1`);
  process.exit(1);
}
