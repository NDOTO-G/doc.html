#!/usr/bin/env node
// build-doc.mjs — generalized manifest-first doc.html v0.3 builder.
//
// Distilled from examples/build-memory-example.mjs; the inline SECTIONS array
// is replaced by a LOADER that reads from either:
//
//   (a) a sections JSON file  — array of objects:
//         { id, title, summary, body, [supersedes] }
//       "body" is the raw inner HTML (emitted verbatim between the opening
//       tag's > and </section>).
//
//   (b) a directory of HTML fragments + meta.json:
//         meta.json   — array of { id, title, summary, [supersedes] }
//                       in document order.
//         <id>.html   — one file per section; its content is the raw inner HTML.
//
// CLI:
//   node build-doc.mjs <input> <output.doc.html>
//
// <input> is either a .json file (form a) or a directory (form b).
// <output.doc.html> is the destination file; parent directory must exist.
//
// Witness law (§6.2/§6.3, SPEC.md):
//   data-witness    = SHA-256 hex over the RAW, UNTRIMMED inner span as UTF-8.
//   data-char-count = Array.from(inner).length  (Unicode code points, §6.6).
//
// Re-running over unchanged inputs produces byte-identical output (§9.2).
// There is no build timestamp; the output is fully deterministic.
//
// Verify output with:  node verify.mjs <output.doc.html>

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

// ─── helpers ─────────────────────────────────────────────────────────────────

const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sha256 = (s) =>
  crypto.createHash("sha256").update(s, "utf8").digest("hex");

const cc = (s) => Array.from(s).length;

// ─── loader ──────────────────────────────────────────────────────────────────

/**
 * Load sections from either a JSON file or a directory of fragments.
 * Returns an array of { id, title, summary, inner, supersedes? }.
 * "inner" is the raw inner HTML string — emitted verbatim.
 */
function loadSections(input) {
  const stat = fs.statSync(input);

  if (stat.isDirectory()) {
    // Form (b): directory + meta.json
    const metaPath = path.join(input, "meta.json");
    if (!fs.existsSync(metaPath)) {
      throw new Error(`Directory input requires a meta.json file: ${metaPath}`);
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (!Array.isArray(meta)) {
      throw new Error(`meta.json must be a JSON array, got ${typeof meta}`);
    }
    return meta.map((entry, i) => {
      const { id, title, summary, supersedes } = entry;
      if (!id) throw new Error(`meta.json entry[${i}] missing "id"`);
      if (!title) throw new Error(`meta.json entry[${i}] (id="${id}") missing "title"`);
      if (summary == null) throw new Error(`meta.json entry[${i}] (id="${id}") missing "summary"`);
      const fragPath = path.join(input, `${id}.html`);
      if (!fs.existsSync(fragPath)) {
        throw new Error(`Fragment file not found: ${fragPath}`);
      }
      const inner = fs.readFileSync(fragPath, "utf8");
      return { id, title, summary, inner, supersedes };
    });
  }

  // Form (a): JSON file
  const raw = JSON.parse(fs.readFileSync(input, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`Sections JSON must be a JSON array, got ${typeof raw}`);
  }
  return raw.map((entry, i) => {
    const { id, title, summary, body, supersedes } = entry;
    if (!id) throw new Error(`sections[${i}] missing "id"`);
    if (!title) throw new Error(`sections[${i}] (id="${id}") missing "title"`);
    if (summary == null) throw new Error(`sections[${i}] (id="${id}") missing "summary"`);
    if (body == null) throw new Error(`sections[${i}] (id="${id}") missing "body"`);
    return { id, title, summary, inner: body, supersedes };
  });
}

// ─── builder ─────────────────────────────────────────────────────────────────

/**
 * Build a manifest-first doc.html v0.3 document from the loaded sections.
 * Returns the complete HTML string.
 * Implements §9.2 build law exactly.
 */
function buildDoc(sections) {
  if (sections.length === 0) {
    throw new Error("Cannot build a doc.html with zero sections (non-vacuity, §7.3)");
  }

  // Compute witness + char-count for every section (§6.2/§6.3/§6.6).
  const records = sections.map((s) => ({
    ...s,
    hash: sha256(s.inner),
    chars: cc(s.inner),
  }));

  // ── manifest links ────────────────────────────────────────────────────────
  const manifestLinks = records
    .map(
      (r) =>
        `    <li><a href="#${r.id}" data-witness="${r.hash}" data-char-count="${r.chars}">` +
        `<span class="title">${esc(r.title)}</span> ` +
        `<span class="summary">${esc(r.summary)}</span></a></li>`
    )
    .join("\n");

  // ── section bodies ────────────────────────────────────────────────────────
  const bodyParts = records.map((r) => {
    const supersedesAttr = r.supersedes ? ` data-supersedes="${r.supersedes}"` : "";
    return (
      `<section id="${r.id}" data-witness="${r.hash}" data-char-count="${r.chars}"${supersedesAttr}>` +
      r.inner +
      `</section>`
    );
  });

  // ── full document — structure follows §9.2 exactly ────────────────────────
  // Emit order: DOCTYPE + head, then manifest nav, then sections.
  // No build timestamp (ensures deterministic / byte-identical rebuilds).
  return (
    `<!DOCTYPE html>\n` +
    `<html lang="en">\n` +
    `<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>doc.html v0.3</title>\n` +
    `<style>\n` +
    `  :root { --fg:#1a1a1a; --bg:#fafaf7; --muted:#666; --accent:#2a4d6e; --rule:#ddd; --code-bg:#f0ede5; }\n` +
    `  @media (prefers-color-scheme: dark) { :root { --fg:#e8e8e3; --bg:#1a1a1a; --muted:#999; --accent:#8ab4d4; --rule:#333; --code-bg:#252523; } }\n` +
    `  body { font: 16px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; color: var(--fg); background: var(--bg); }\n` +
    `  h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 0.6rem; }\n` +
    `  h2 { font-size: 1.3rem; }\n` +
    `  p, ul, pre { margin: 0.8rem 0; }\n` +
    `  a { color: var(--accent); text-decoration: none; border-bottom: 1px solid currentColor; }\n` +
    `  code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 3px; font: 0.92em "SF Mono", Consolas, monospace; }\n` +
    `  pre { background: var(--code-bg); padding: 1rem; border-radius: 6px; overflow-x: auto; }\n` +
    `  pre code { background: none; padding: 0; }\n` +
    `  section { margin: 2.5rem 0; padding: 1.5rem; background: var(--code-bg); border-radius: 8px; }\n` +
    `  #manifest { background: var(--code-bg); padding: 1.5rem; border-radius: 8px; margin: 2rem 0; }\n` +
    `  #manifest ol { list-style: decimal; padding-left: 1.5rem; }\n` +
    `  #manifest li { margin: 0.8rem 0; }\n` +
    `  #manifest .title { font-weight: 600; }\n` +
    `  #manifest .summary { display: block; color: var(--muted); font-size: 0.92em; }\n` +
    `</style>\n` +
    `</head>\n` +
    `<body>\n` +
    `\n` +
    `<nav id="manifest" aria-label="Document manifest">\n` +
    `  <ol>\n` +
    manifestLinks + `\n` +
    `  </ol>\n` +
    `</nav>\n` +
    `\n` +
    bodyParts.join("\n\n") + `\n` +
    `\n` +
    `</body>\n` +
    `</html>\n`
  );
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error("Usage: node build-doc.mjs <input> <output.doc.html>");
  console.error("  <input>  — a sections .json file OR a directory of .html fragments + meta.json");
  console.error("  <output> — destination path for the produced doc.html");
  process.exit(1);
}

const [inputArg, outputArg] = args;
const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);

if (!fs.existsSync(inputPath)) {
  console.error(`Input not found: ${inputPath}`);
  process.exit(1);
}

const sections = loadSections(inputPath);
const html = buildDoc(sections);
fs.writeFileSync(outputPath, html, "utf8");

const totalChars = sections.reduce((n, s) => n + cc(s.inner), 0);
console.log(`Wrote ${outputPath}`);
console.log(`  ${sections.length} section(s), ${totalChars.toLocaleString()} chars of section content`);
