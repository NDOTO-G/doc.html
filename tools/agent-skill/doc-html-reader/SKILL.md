---
name: doc-html-reader
description: This skill should be used when the user attaches, references, or asks to "read", "navigate", "summarize", "look up", or "find something in" a file named `doc.html` or `*.doc.html`, or any HTML file containing a `<nav id="manifest">` block in its body. Enforces selective hydration — extract only the sections needed, never the whole file.
version: 0.4.0
---

# Reading a doc.html

A `doc.html` is a single HTML artifact that carries a machine-readable manifest of its own addressable sections. In a manifest-first document the manifest lives in a `<nav id="manifest">` element in the document body. Each entry is an `<a>` anchor with `href="#section-id"`, `data-witness` (64 bare hex characters — no prefix), and `data-char-count` (integer character count).

The manifest is the discovery layer. The sections are the hydration layer. Never read the whole file with the Read tool — it may be hundreds of KB and most of it is irrelevant to any given question.

This skill is a convenience. The same selective hydration is achievable with standard text tools alone — locate the `<nav id="manifest">`, pick an id, extract that section's span. The format does not require this skill: a `doc.html` carries everything a reader needs in-band.

## Workflow

To answer a question about a `doc.html` file, follow these steps in order.

### Step 1 — Fetch the manifest

Run `scripts/manifest.py <path>`. This returns a small JSON object (typically <5% the size of the full document) listing every section with its id, sha256, char_count, and title — plus a separate `summary` field when the manifest anchor carries a `<span class="summary">`.

```bash
python scripts/manifest.py /path/to/doc.html
```

**When integrity matters — memory organs, records you will act on, anything post-tamper-suspicion — add `--verify`:** every entry's witness is recomputed over the section's raw inner bytes and the exit code is 0 only if all match. Recomputation does not happen spontaneously (0/27 in the drift-defense tracer); it must be invoked.

```bash
python scripts/manifest.py --verify /path/to/doc.html
```

(The script lives next to this `SKILL.md` in the skill directory; Claude Code resolves the path automatically when the skill is active. Running it by hand from this repository's root, the working form is:)

```bash
python tools/agent-skill/doc-html-reader/scripts/manifest.py examples/minimal.doc.html
```

### Step 2 — Scan the entries, pick sections

Scan the returned JSON entries. Identify the section ids whose titles indicate they likely contain the answer to the current question. Be conservative — selecting fewer sections is always better than selecting more.

If no entry clearly matches, prefer to ask the user a clarifying question over hydrating sections speculatively.

### Step 3 — Hydrate only the chosen sections

For each chosen section id, run `scripts/section.py <path> <id>`. This returns only that section's HTML, not the rest of the document.

```bash
python scripts/section.py /path/to/doc.html section-id
```

Do not call `section.py` for every id in the manifest — that defeats the purpose of selective hydration. If the question genuinely requires the whole document, say so explicitly to the user and ask whether to proceed.

### Step 4 — Drift detection (when applicable)

If the current conversation has previously hydrated sections from this same `doc.html`, compare the stored sha256 for each section against the current manifest's `data-witness`. Re-hydrate only sections whose hash has changed. Sections with matching hashes are still valid in the existing context.

## Design rationale

The manifest contains all section titles (and optionally summaries) because comparing options requires seeing them. This is not a leak — the manifest is typically 1-5% of the full document. The win is loading 1-5% to skip 95-99%.

The manifest IS the discovery layer; the sections are the hydration layer. Do not conflate the two.

For very large documents (thousands of sections, hundreds of KB of manifest alone), the flat manifest is not optimized. Note the limitation to the user rather than silently incurring high discovery costs.

## When to refuse to hydrate

Refuse, or warn the user, in these cases:

- The user asks to "read the whole document" — explain that the file may be large and confirm before calling `section.py` for every id.
- The manifest is missing or malformed — with one lawful exception, the file does not follow the doc.html manifest-first contract and the skill cannot operate; report this and fall back to user guidance. **The exception:** an append-oriented chat body (the writing-room-tail shape, SPEC §5.0) lawfully carries *no* `<nav id="manifest">` — its witnessed units are `<article data-witness>` elements. This skill's manifest-first flow does not apply to that shape; point the reference readers (`verify.py` / `verify.mjs`) at it directly.
- The manifest nav exceeds 50KB — discovery itself is now expensive; consider whether the user has a smaller index or whether to answer from the catalog directly without hydrating.

## The format, summarized

The manifest-first shape (inside `<nav id="manifest">`):

```html
<nav id="manifest">
  <a href="#stable-kebab-case"
     data-witness="64hexcharsnoprefix"
     data-char-count="1842">Human-Readable Title</a>
  ...
</nav>
```

Each anchor corresponds to a `<section id="...">` element in the document body. Section ids are stable across edits unless the section is structurally rewritten. The `data-witness` value is 64 bare hex digits (SHA-256, no `sha256-` prefix). The `data-char-count` is the integer character count of the section's inner content.

## Scripts

- **`scripts/manifest.py <path>`** — walks `<nav id="manifest">` and prints a synthesized JSON manifest
- **`scripts/section.py <path> <id>`** — extracts and prints the inner HTML of a single section by id
