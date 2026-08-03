#!/usr/bin/env node
// build-chat-example.mjs — emits examples/chat.doc.html, a CONFORMANT
// doc.html v0.3 writing-room-tail document (chat body shape).
//
// Shape: pure tail — NO <nav id="manifest">, NO <section data-witness>.
// Addressable units are a homogeneous run of <article> elements, each
// witnessed by SHA-256 over its raw inner UTF-8 bytes (untrimmed).
//
// All turns are CONSECRATED (sealed); this is a finished example, not a
// live writing-room body. The append-anchor is omitted per §5.3b.
//
// One turn (turn-000004) contains a literal <!-- </article> --> comment
// inside its prose, exercising the §6.2 depth-walk comment-masking rule:
// that commented token MUST NOT count as a boundary.
//
// Run from the repo root:  node examples/builders/build-chat-example.mjs
// Verify with:             node tools/verify.mjs examples/chat.doc.html
//
// Witness law (§6.2/§6.3): SHA-256 over the raw, untrimmed UTF-8 bytes
// between the opening tag's closing > and the < that begins </article>.
// char-count = Array.from(inner).length  (Unicode code points, §6.6).

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This builder lives in examples/builders/; the exhibit it emits sits one level up.
const OUT = path.join(__dirname, "..", "chat.doc.html");

// --- helpers (ported from build-memory-example.mjs) ---
const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// sha256(s): SHA-256 over UTF-8 bytes of s, returned as 64 lowercase hex.
// This is the ONLY hash function used; it is applied to the raw inner span
// exactly as it will appear between the opening tag's > and </article>.
const sha256 = (s) =>
  crypto.createHash("sha256").update(s, "utf8").digest("hex");

// cc(s): Unicode code-point count (§6.6). Array.from splits on surrogate pairs.
const cc = (s) => Array.from(s).length;

// --- turn definitions ---
// Each turn's `inner` is the EXACT string that will be emitted between the
// opening <article ...> tag's > and the </article> closing tag.
// The witness is sha256(inner); char-count is cc(inner).
// Do NOT add or remove any leading/trailing whitespace relative to what appears here.

const TURNS = [
  {
    n: 1,
    role: "user",
    kind: "transcription",
    inner: `
  <header><h3>Turn 1 — User</h3>
    <p class="meta">kind: transcription</p></header>
  <div class="turn-content">
    <p>What is a doc.html file and how does it store information?</p>
  </div>
`,
  },
  {
    n: 2,
    role: "assistant",
    kind: "synthesis",
    inner: `
  <header><h3>Turn 2 — Assistant</h3>
    <p class="meta">kind: synthesis</p></header>
  <div class="turn-content">
    <p>A <code>doc.html</code> is a single, self-verifying HTML file. It stores information as <strong>addressable units</strong> — either <code>&lt;section&gt;</code> elements (manifest-first shape) or <code>&lt;article&gt;</code> elements (writing-room-tail shape) — each carrying a <code>data-witness</code>: a SHA-256 digest over the unit&#39;s raw inner bytes.</p>
    <ul>
      <li><strong>Self-contained</strong> — no server, no JavaScript, no sidecar files required.</li>
      <li><strong>Addressable</strong> — every unit has a unique <code>id</code>; a reader fetches only <code>#the-id</code> it needs.</li>
      <li><strong>Verifiable</strong> — a reader recomputes SHA-256 and compares byte-exact; a one-byte change causes a mismatch.</li>
      <li><strong>Append-only</strong> — memory grows by adding units, never by editing prior ones.</li>
    </ul>
  </div>
`,
  },
  {
    n: 3,
    role: "user",
    kind: "transcription",
    inner: `
  <header><h3>Turn 3 — User</h3>
    <p class="meta">kind: transcription</p></header>
  <div class="turn-content">
    <p>You mentioned two shapes — manifest-first and writing-room-tail. What is the difference?</p>
  </div>
`,
  },
  {
    n: 4,
    role: "assistant",
    kind: "synthesis",
    // NOTE: this turn contains a literal <!-- </article> --> comment in its prose.
    // The sha256 witness is computed over these raw inner bytes, INCLUDING the comment.
    // The §6.2 depth-walk MUST NOT treat the commented </article> token as a boundary.
    inner: `
  <header><h3>Turn 4 — Assistant</h3>
    <p class="meta">kind: synthesis</p></header>
  <div class="turn-content">
    <p>The two shapes differ in how a reader discovers addressable units:</p>
    <dl>
      <dt><strong>Manifest-first</strong></dt>
      <dd>Carries a <code>&lt;nav id="manifest"&gt;</code> listing every <code>&lt;section data-witness&gt;</code>. A reader reads the manifest first, decides which sections it needs, and fetches only those by <code>#id</code>.</dd>
      <dt><strong>Writing-room-tail</strong></dt>
      <dd>No manifest. Addressable units are <code>&lt;article data-witness&gt;</code> elements read in document order. Suits a chat log or append-only body.</dd>
    </dl>
    <p>The shapes are mutually exclusive: a document MUST be exactly one shape. A reader detects the shape first, then follows the appropriate discovery path.</p>
    <!-- </article> -->
    <p class="note"><em>Note:</em> the comment above is part of this turn&#39;s witnessed bytes — it exercises the §6.2 rule that an <code>&lt;/article&gt;</code> token inside an HTML comment MUST NOT be treated as this article&#39;s closing tag.</p>
  </div>
`,
  },
  {
    n: 5,
    role: "user",
    kind: "transcription",
    inner: `
  <header><h3>Turn 5 — User</h3>
    <p class="meta">kind: transcription</p></header>
  <div class="turn-content">
    <p>How does the witness work exactly? What bytes does SHA-256 cover?</p>
  </div>
`,
  },
  {
    n: 6,
    role: "assistant",
    kind: "synthesis",
    inner: `
  <header><h3>Turn 6 — Assistant</h3>
    <p class="meta">kind: synthesis</p></header>
  <div class="turn-content">
    <p>The witnessed bytes are the bytes between the <code>&gt;</code> that ends the opening tag and the <code>&lt;</code> that begins the element&#39;s own closing tag — the <strong>raw inner span, UTF-8, untrimmed</strong>. No normalization, no trimming.</p>
    <p>For a tail document the addressable element is <code>&lt;article&gt;</code>. The closing tag is found by a depth-walk that counts nested <code>article</code> tokens and skips any inside HTML comments. SHA-256 is then computed over those exact bytes.</p>
    <p><code>data-char-count</code> is the Unicode code-point count of the same slice — <code>Array.from(inner).length</code> in JavaScript. A reader that trims, re-encodes as UTF-16, or normalizes whitespace will get a different digest and fail.</p>
  </div>
`,
  },
  {
    n: 7,
    role: "user",
    kind: "transcription",
    inner: `
  <header><h3>Turn 7 — User</h3>
    <p class="meta">kind: transcription</p></header>
  <div class="turn-content">
    <p>What are the two witness epochs? What is the difference between a writing-room witness and a consecrated one?</p>
  </div>
`,
  },
  {
    n: 8,
    role: "assistant",
    kind: "synthesis",
    inner: `
  <header><h3>Turn 8 — Assistant</h3>
    <p class="meta">kind: synthesis</p></header>
  <div class="turn-content">
    <p>The <code>data-witness</code> slot carries one of two formally disjoint grammars:</p>
    <dl>
      <dt><strong>Writing-room epoch</strong></dt>
      <dd>A UTC timestamp (<code>YYYY-MM-DDTHH:MM:SSZ</code>, exactly 20 chars). Used while the document is live: timestamps must be strictly increasing in document order. An <em>ordinal</em> witness — fixes sequence, not bytes.</dd>
      <dt><strong>Consecrated epoch</strong></dt>
      <dd>A 64-char lowercase SHA-256 hex digest. Used once content is sealed. A <em>identity</em> witness — fixes bytes for all time. A reader recomputes and compares byte-exact.</dd>
    </dl>
    <p>The grammars are disjoint by length (20 vs 64) and alphabet (<code>-T:Z</code> never appear in hex). A reader recovers the epoch from the form alone — no separate kind attribute is needed. Consecration replaces a timestamp with the SHA-256 of the bytes it was witnessing. This file carries only consecrated witnesses — it is a sealed example.</p>
  </div>
`,
  },
];

// --- compute witnesses ---
const records = TURNS.map((t) => ({
  ...t,
  witness: sha256(t.inner),
  charCount: cc(t.inner),
}));

// --- render articles ---
const articles = records
  .map(
    (r) =>
      `<article id="turn-${String(r.n).padStart(6, "0")}" class="turn ${r.role}" ` +
      `data-role="${r.role}" data-turn="${r.n}" data-kind="${r.kind}" ` +
      `data-char-count="${r.charCount}" data-witness="${r.witness}">${r.inner}</article>`
  )
  .join("\n\n");

// --- assemble document ---
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chat body — doc.html v0.3 writing-room-tail exhibit</title>
<style>
  :root { --fg:#1a1a1a; --bg:#fafaf7; --muted:#666; --accent:#2a4d6e; --rule:#ddd; --code-bg:#f0ede5; --user-bg:#eef4fb; --asst-bg:#f0ede5; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8e8e3; --bg:#1a1a1a; --muted:#999; --accent:#8ab4d4; --rule:#333; --code-bg:#252523; --user-bg:#1c2a38; --asst-bg:#252523; } }
  body { font: 16px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; color: var(--fg); background: var(--bg); }
  h1, h2, h3 { line-height: 1.25; margin: 0 0 0.6rem; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.25rem; }
  h3 { font-size: 1.1rem; }
  p, ul, ol, dl, pre { margin: 0.8rem 0; }
  dt { font-weight: 600; margin-top: 0.6rem; }
  dd { margin-left: 1.5rem; }
  a { color: var(--accent); text-decoration: none; border-bottom: 1px solid currentColor; }
  code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 3px; font: 0.92em "SF Mono", Consolas, monospace; }
  pre { background: var(--code-bg); padding: 1rem; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  header.doc-header { border-bottom: 1px solid var(--rule); padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .header-meta { color: var(--muted); font-size: 0.9em; margin: 0.3rem 0 0; }
  article.turn { margin: 1.5rem 0; border-radius: 8px; padding: 1.2rem 1.5rem; }
  article.turn.user { background: var(--user-bg); }
  article.turn.assistant { background: var(--asst-bg); }
  article.turn header { margin-bottom: 0.5rem; }
  article.turn header h3 { margin: 0; font-size: 1rem; }
  .meta { color: var(--muted); font-size: 0.85em; margin: 0.1rem 0 0; }
  .turn-content p:first-child { margin-top: 0; }
  .turn-content p:last-child { margin-bottom: 0; }
  .note { font-size: 0.92em; color: var(--muted); }
  .about-file { color: var(--muted); font-size: 0.9em; border-top: 1px solid var(--rule); padding-top: 0.8rem; margin-top: 2.5rem; }
  .about-file h2 { font-size: 1.05rem; color: var(--fg); }
</style>
</head>
<body>

<header class="doc-header">
  <h1>Chat body — doc.html v0.3 writing-room-tail exhibit</h1>
  <p class="header-meta">doc.html v0.3 · ${records.length} turns · writing-room-tail shape · all witnesses consecrated</p>
  <div>
    <h2>About this document</h2>
    <p>This is a <strong>writing-room-tail</strong> doc.html: a chat exchange stored as an ordered sequence of witnessed <code>&lt;article&gt;</code> elements. No <code>&lt;nav id="manifest"&gt;</code> — shape detection finds the tail by the presence of <code>&lt;article data-witness&gt;</code> elements with valid witnesses.</p>
    <p>Two witness <strong>epochs</strong>: a <strong>writing-room</strong> timestamp (<code>YYYY-MM-DDTHH:MM:SSZ</code>) records live entries in order; a <strong>consecrated</strong> SHA-256 hex digest seals a unit&#39;s bytes for all time. This file carries only consecrated witnesses.</p>
    <p>To verify: detect tail shape, walk articles in document order, recompute SHA-256 over each article&#39;s raw inner UTF-8 bytes (untrimmed, §6.2), confirm each digest equals the stored <code>data-witness</code>. Single carrier per unit — no manifest link to cross-check (§6.3).</p>
    <p><strong>Kind vocabulary (declared in-band, §8.3):</strong> this body uses two <code>data-kind</code> values — <code>transcription</code> (a verbatim user turn) and <code>synthesis</code> (a model-authored assistant turn). <code>data-kind</code> is descriptive only; a conforming reader never branches trust on it.</p>
  </div>
</header>

${articles}

<footer class="about-file">
  <h2>About this file</h2>
  <p>This is a <strong>doc.html</strong> — a single, self-describing HTML file. This one carries the writing-room-tail shape: there is no <code>&lt;nav id="manifest"&gt;</code>, and the addressable units are the <code>&lt;article&gt;</code> elements above, read in document order; each unit&#39;s <code>data-witness</code> is the SHA-256 (hex) of its raw inner bytes, so any reader can verify any unit with the file alone — no server, no JavaScript, no tooling. The full format definition is <a href="../SPEC.md">SPEC.md</a>, carried in the format&#39;s own body as <a href="../SPEC.doc.html">SPEC.doc.html</a>.</p>
  <p>Author: Georges Casseus (Ndoto Studios) · License: CC0 1.0 (public domain) · Built: 2026-08-01</p>
</footer>

</body>
</html>
`;

fs.writeFileSync(OUT, html, "utf8");
console.log(`Wrote ${OUT}`);
console.log(`  ${records.length} turns`);
console.log();
for (const r of records) {
  console.log(
    `  turn-${String(r.n).padStart(6, "0")}  charCount=${r.charCount}  witness=${r.witness}`
  );
}
