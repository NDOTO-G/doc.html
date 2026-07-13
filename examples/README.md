# doc.html v0.3 — worked examples

Self-contained `doc.html` files that demonstrate the format. Every exhibit is a conformant v0.3
document: witnessed addressable units (SHA-256 over raw inner bytes), all CSS in `<head>` outside
the witnessed spans, zero JavaScript. Open any in a browser to read it; verify with:

```
node verify.mjs examples/memory.doc.html
node verify.mjs examples/chat.doc.html
```

All exhibits are **emitted by a builder script** (`build-*.mjs` beside them), not hand-written.
The builders reuse the same witness law as the reference builder (`build-doc.mjs`) — a small piece of evidence
that the v0.3 spec is implementable by more than one hand (the literal "the document is the spec"
claim, at the smallest scale). Rebuild any with `node examples/build-<name>.mjs`.

## `chat.doc.html` — writing-room-tail (chat body)

A worked example of the **writing-room-tail shape**: a Q&A exchange about the doc.html format
stored as an ordered sequence of 8 witnessed `<article>` elements. There is no
`<nav id="manifest">` — shape is detected by the presence of `<article data-witness>` elements
with valid-grammar witnesses.

All turns are **consecrated** (sealed with SHA-256); this is a finished example, not a live
writing-room body. One turn (`turn-000004`) contains a literal `<!-- </article> -->` comment
inside its prose, exercising the §6.2 depth-walk comment-masking rule (the commented token must
not be counted as this article's closing boundary).

The `data-witness` on each article appears once — no manifest link to cross-check; this
exercises the §6.3 single-carrier path (V4 is N/A for tail documents).

- 8 turns · consecrated · verifies 8/8 · see SPEC.md §13 Vector set 2 for the sealed hashes.

## `memory.doc.html` — memory as a document

A worked example of **memory-as-document**: an AI coding assistant's project memory for a
fictional "Lantern service," kept as a doc.html instead of in an opaque agent-memory store.
12 witnessed facts (conventions, an architecture decision, a gotcha, a preference). A reader
hydrates the manifest, then drills only the `#id` it needs — it never loads the whole file.

It also demonstrates the **fold** (append-and-supersede): the section `#datastore` records an
early decision ("SQLite for the job queue"); a later section `#datastore-revised` carries
`data-supersedes="#datastore"` and records the migration to PostgreSQL. The original is **not
deleted** — it stays permanently addressable at its id; the newer section is authoritative.
Memory grows by appending and superseding, never by erasing.

- 12 sections · ~13 KB · verifies 12/12.

## `selective-context-demo.doc.html` — reading past the window

A **representative large body**: a fictional "Zephyr Stream API Reference" with 152 sections
(resources, methods, error codes, config keys, a glossary, type definitions, guides). It is
large enough that loading the whole file to answer one question is visibly wasteful — which is
the point. The reader reads the manifest, drills by `#id`, and loads only the handful of
sections it needs.

The first section states this in-band, and notes honestly that a **flat manifest grows with
section count** — at large scale that is a real cost (a hierarchical manifest is future work;
see `../EVIDENCE.md` §5). This exhibit is the *shape* of selective hydration; it is
not the at-scale proof.

- 152 sections · ~147 KB · verifies 152/152.

### The at-scale proof lives elsewhere

These exhibits are deliberately small enough to ship and read. The **measured** beyond-window
results come from sealed runs at real scale:

- `apparatus-memori` — 72.5 MB / 17,631 sections, 480/480 navigation turns, proof-of-read
  120/120, self-citations 240/240 byte-verified.
- `tracer-memory-at-scale` — 74 MB / 17,627 sections; the manifest-only arm answered with zero
  body hydration.

The ~72 MB XL corpus itself is **not shipped** — the corpora are large. The measured results
above come from sealed runs; this bundle ships the format, the readers, and these worked
examples, not the multi-gigabyte research corpora.
