# doc.html v0.4 — worked examples

Self-contained `doc.html` files that demonstrate the format, in two deliberate groups. The
**conforming exhibits** (`minimal`, `memory`, `selective-context-demo`, `chat`, `reference`,
`mixed-epoch`) are documents both reference readers PASS: witnessed addressable units (SHA-256
over raw inner bytes), all CSS in `<head>` outside the witnessed spans, zero JavaScript. The
**asserted-failing negatives** (`writing-room-tail`, `all-timestamp`, `invalid-witness-grammar`,
`placeholder-grammar`, `out-of-order`) are deliberately malformed or unfinished shapes that both
readers must REFUSE — `tools/conformance.mjs` asserts every one of them non-zero on both readers,
so a refusal that stops firing is caught as a regression. Open any in a browser to read it;
verify (or watch it refuse) with:

```
node verify.mjs examples/memory.doc.html
node verify.mjs examples/chat.doc.html
```

Three exhibits ship with their **emitter script beside them** (`build-chat-example.mjs`,
`build-memory-example.mjs`, `build-selective-context-example.mjs`) — rebuild those three with
`node examples/build-<name>-example.mjs`; the remaining exhibits are emitted by lab-side
builders and ship as sealed artifacts.
The builders reuse the same witness law as the reference builder (`build-doc.mjs`) — a small piece of
evidence that the spec is implementable by more than one hand (the literal "the document is
the spec" claim, at the smallest scale).

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

## `mixed-epoch.doc.html` — two epochs in one tail

A tail document whose articles span **two epochs**: a consecrated (sealed, hash-witnessed) head
and a writing-room (live, timestamp-ordinal) tail — the shape of a chat mid-conversation. The
readers verify the sealed articles byte-for-byte and report the live ones as ordinal-only, in one
epoch-scoped verdict (§7.3a).

- 4 articles · 2 verified + 2 ordinal · `PASS (verified=2, ordinal=2)` on both readers.

## The asserted-failing negatives

Five exhibits exist to be **refused** — each isolates one law by breaking it:

- `writing-room-tail.doc.html` / `all-timestamp.doc.html` — a live tail with no consecrated
  articles: nothing is byte-witnessed yet, so a Core reader has nothing to PASS (ORDINAL-ONLY,
  non-zero exit).
- `invalid-witness-grammar.doc.html` / `placeholder-grammar.doc.html` — a carrier whose witness
  value breaks the grammar (one malformed, one a plausible-looking placeholder): the readers count
  it as a **mismatch** (`verified 1/2, mismatches: 1`) — an unreadable witness is a refusal, never
  a silent skip.
- `out-of-order.doc.html` — writing-room timestamps out of order (§6.7/V15; Core readers report
  ORDINAL-ONLY with non-zero exit; the ordering law itself binds the Append profile).

`tools/conformance.mjs` runs the full battery — these five plus ten forged-document fixtures
under `trials/scripts/fixtures/chat-v3/` — and asserts every one fails on BOTH readers.

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
