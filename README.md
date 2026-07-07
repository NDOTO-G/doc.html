# doc.html

**Status:** prototype · v0.3.0 · solo-operator personal use · first public release 2026-07-07

A single self-verifying HTML file that is its own selective-context memory: carry a manifest, address sections by id, verify every byte you read against a per-unit cryptographic witness, hydrate only what you need — no server, no JavaScript, no tooling required to read.

The nearest familiar thing: a table of contents whose every entry carries a checksum, rendered as ordinary HTML.

---

## Build one from scratch

Hand the spec to any coding agent:

```
Read SPEC.md and build a conformant doc.html for the content in [your source].
Implement every MUST, pass the Validation Matrix (§10), and satisfy the
Definition of Done (§11). The format requires no server, no JavaScript, and
no tooling to read — the file alone is the whole format.
```

The agent needs only `SPEC.md`. No other context is required.

---

## Or use the reference and examples

| Path | What it is |
|---|---|
| [`SPEC.md`](SPEC.md) | The complete, self-contained format specification. This is the source of truth. |
| [`MISSION.md`](MISSION.md) | Why the format exists — the two testimonies (human and AI) it answers to. |
| [`VOWS.md`](VOWS.md) | The ten public promises: what the format will never do, what it will always do, and how each is kept. |
| [`examples/minimal.doc.html`](examples/minimal.doc.html) | Smallest conforming document: one section, one manifest entry. |
| [`examples/memory.doc.html`](examples/memory.doc.html) | Memory body example: multi-section manifest-first document. |
| [`examples/selective-context-demo.doc.html`](examples/selective-context-demo.doc.html) | Selective-context reading demonstration. |
| [`examples/`](examples/) | All examples plus their emitter scripts. See `examples/README.md`. |
| [`build-doc.mjs`](build-doc.mjs) | Generalized builder: load sections from JSON or a directory of fragments and emit a conformant doc.html. |

---

## Verify a file

Two reference readers ship with the bundle. Either should PASS on any conforming document:

```bash
node verify.mjs <file>
```

```bash
python verify.py <file>
```

Both readers implement the full Validation Matrix (§10): shape detection, manifest parsing, per-section witness recompute (SHA-256 hex over the raw, untrimmed inner span as UTF-8), char-count check, and non-vacuity.

---

## Two claims — only one is made here

The slogan "HTML is all you need" splits into two claims. This format makes only the first:

- **Claim A** — the document is all-HTML inheritable memory (read, address, verify, hydrate selectively; no server, no JS). **This is what v0.3 specifies.**
- **Claim B** — the live loop is all-HTML (write + model-call + append in a bare browser). **Out of scope.** The *read* loop is all-HTML and server-free; the *run* leg — model call, key, disk write — is a platform action a scriptless `file://` page cannot perform. That leg is delegated to mature, general infrastructure (an OS mail path, a stateless model-completion command) — a shim over existing tools, **not a bespoke doc.html server.** The format owns the verb's *result* (a witnessed, appended section), not its *execution*.

---

## License

Public domain. Use, fork, copy, change, ship.
