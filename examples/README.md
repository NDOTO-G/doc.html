# Examples — a reading order

Five self-contained `doc.html` files, ordered so each one adds a single idea to the one before
it. They are ordinary HTML pages: open any of them in a browser to read it — no server, no
JavaScript, no tooling required.

1. **[`minimal.doc.html`](minimal.doc.html)** — the whole grammar on one page. A
   `<nav id="manifest">` of links, and the witnessed `<section>` each link addresses. Read this
   one first; everything after it is the same shape at a larger size.

2. **[`memory.doc.html`](memory.doc.html)** — memory as a document. An AI coding assistant's
   project memory for a fictional service, kept as a file you can read instead of an opaque
   store. It also shows the **fold**: `#datastore` records an early decision, `#datastore-revised`
   carries `data-supersedes="#datastore"` and records the migration that replaced it, and the
   original is not deleted — it stays permanently addressable at its id. Memory grows by
   appending and superseding, never by erasing.

3. **[`selective-context-demo.doc.html`](selective-context-demo.doc.html)** — reading past the
   window. A large API reference, big enough that loading the whole file to answer one question
   is visibly wasteful. The reader takes the manifest, drills only the handful of `#id`s it
   needs, and leaves the rest on disk. Its first section states the honest cost in-band: a flat
   manifest grows with section count.

4. **[`chat.doc.html`](chat.doc.html)** — the other document shape. A conversation stored as an
   ordered run of witnessed `<article>` elements with **no manifest at all**; the shape is
   detected from the articles themselves. One turn carries a literal `<!-- </article> -->` inside
   its prose, so it also demonstrates that a boundary token inside a comment is not a boundary.

5. **[`mixed-epoch.doc.html`](mixed-epoch.doc.html)** — two epochs in one file. A sealed,
   hash-witnessed head followed by a live, timestamp-ordered tail: a conversation caught
   mid-sentence. The readers check the sealed part byte-for-byte and report the live part as
   ordinal-only, in a single epoch-scoped verdict.

## Verify one

```
node tools/verify.mjs examples/memory.doc.html
python tools/verify.py examples/memory.doc.html
```

Both readers implement the same rule and must agree on it: the SHA-256 of a witnessed unit's
raw, untrimmed inner bytes equals the `data-witness` the document carries. A mismatch is a
refusal, never a warning.

## `builders/`

Two of these exhibits were emitted by a script rather than typed by hand:

```
node examples/builders/build-memory-example.mjs
node examples/builders/build-chat-example.mjs
```

Each rewrites its own exhibit in place. They reuse the same witness law as the reference builder
(`tools/build-doc.mjs`) — a small piece of evidence that the spec is implementable by more than
one hand, at the smallest scale.
