# Vows

Vows are the makers' promises. They bind the people who build this format — what we will never do and what we will always do as we write the specification, the readers, and the documents in this bundle. Each vow defends a specific failure mode — a way we could betray the [mission](MISSION.md) — and names the mechanism by which the promise is kept.

**They are not a conformance contract.** Adopting doc.html obliges you to nothing but the specification: [`../SPEC.md`](../SPEC.md) is the normative text, and its MUST clauses are the whole of what a conforming document, reader, or producer owes. Nothing below adds a requirement to that list. What the vows add is accountability on our side — each is followed by how it is kept here, so the promise can be checked instead of believed.

A vow that cannot be kept is a wish. A vow without a defense mechanism is a slogan. The ones below are written to be kept and to be checkable.

**There will be no more than twelve.** Vows are rare and weighty; the cap is itself a discipline. We have ten now and two open slots. Adding a vow is a deliberate act, dated, traceable in commit history. Removing one is mourned the same way. If a candidate vow does not survive the test of *would the format be meaningfully worse without it*, it does not get a slot.

---

## V1 — The artifact is one document

A `doc.html` is a single file. The format does not specify sidecar files, companion manifests, fragment shards, or required external resources. Everything the format promises is contained in the one document.

- **Why:** in the one there can be the infinite. A single HTML file can carry a manifest pointing to arbitrarily many sections, nested depths, and links onward — the content is unbounded, but the artifact is one. Splitting the file creates points of breakage, distribution friction, and partial inheritance. The format that promises to outlive its maker cannot also require the maker to keep the other files alive.
- **How defended:** the format spec ([`../SPEC.md`](../SPEC.md)) lists no companion files. The manifest lives in a `<nav id="manifest">` at the top of `<body>`; the witnessed sections live beside it; nothing else is required. Any future addition that wants to live outside the file must either earn a new vow that reverses this one, or be classified as a *convenience* (like the bundled verifiers and builder) that does not bind the format. *V1 binds identity; what an inheritor must receive to render the document fully — the **vessel** — is named in the V1 discernment receipt (held in the project record) and bound by [V3](#v3--the-substrate-is-html).*

## V2 — The document is the spec

A `doc.html` carries its own format definition. A reader who has the file and nothing else — no published standard, no schema URL, no companion documentation — can understand both its content and how the format works.

- **Why:** portability is the only path to inheritance across systems we do not control. A format that depends on an external authority is a format that ends when the authority does.
- **How defended:** a `doc.html` carries its own short in-band self-description — what the format is, how to read the manifest, how a witness is computed — sized to the document rather than reproducing the specification inside it. The full definition stands alone as [`../SPEC.md`](../SPEC.md), and ships carried in the format's own body as [`../SPEC.doc.html`](../SPEC.doc.html). The founding corpus [`doc.html`](doc.html) beside this file carries the v0.3 definition in-band; it is historical wherever it disagrees with the specification.

## V3 — The substrate is HTML

A `doc.html` is HTML, and only HTML. The format adds no custom syntax, no transpilers, no extensions on top of the HTML the web platform already defines. Whatever HTML can express as a structured, navigable document fits inside a section; the **vessel** (named in the V1 discernment receipt) holds what HTML calls for from outside the file. Nothing more is permitted; nothing less is required.

- **Why:** the format that promises to outlive its maker survives only because its substrate already does. HTML is the most universal document substrate humans have built — present in every browser, every parser, every text editor, every agent runtime, every diff tool. Form-flexible (rendered, parsed, raw, transmitted) and context-flexible (web, offline, archived, embedded). A vessel floats; the water carries it. HTML is the water.
- **How defended:** the format spec names HTML as the only carrier. `<script>` execution, `<iframe>` to live applications, and runtime-required behaviors are out by [V6](#v6--no-tool-is-required-to-consume); external dependencies the doc's meaning depends on weaken inheritance by exactly that fetch, and authoring discipline prefers inline → vessel-resident → external in that order. The full operational test — what may sit in a section, what the vessel must underwrite, the substitution principle ("a section is substitutable for any HTML primitive iff every reference is inline or vessel-resident") — lives in the V3 discernment receipt (held in the project record).

## V4 — The manifest does not lie about the body

Every manifest entry's `data-witness` — a SHA-256 digest over the raw inner bytes of the section it names — matches the section as it stands in the body. If the manifest claims a section, that section exists; if the entry's text promises content, the content is actually there.

- **Why:** selective disclosure rests entirely on this. If the manifest can lie, the selectivity is bait and the format is adversarial.
- **How defended:** [`../tools/verify.mjs`](../tools/verify.mjs) and [`../tools/verify.py`](../tools/verify.py) re-hash every section against its witness, at build time and at any later moment. Any reader can re-run them — or re-derive the check from the in-band spec with no tool at all.

## V5 — The human can read it without the manifest

A `doc.html` is a normal HTML document. Open it in any browser, scroll, read. The manifest is additive, never substitutive. No content lives only in the machine layer; nothing important is hidden from humans.

- **Why:** a format that hides content from humans while feeding only machines is an adversarial format. We do not build those.
- **How defended:** the manifest is itself ordinary HTML — a `<nav>` of links the browser renders as a table of contents; the body stands on its own beneath it. Remove the manifest and a normal, complete HTML page remains.

## V6 — No tool is required to consume

Reading a `doc.html` requires nothing beyond the file. No CLI, no service, no MCP server, no sidecar file, no `.well-known` endpoint. Any agent that knows HTML can read it.

- **Why:** every required tool is a future failure point and an exclusion. A format meant to be inherited cannot demand infrastructure that future readers may not have.
- **How defended:** the artifact is self-sufficient. The bundled verifiers ([`../tools/verify.mjs`](../tools/verify.mjs), [`../tools/verify.py`](../tools/verify.py)) and builder ([`../tools/build-doc.mjs`](../tools/build-doc.mjs)) are conveniences for authors and auditors, never requirements for reading.

## V7 — The maker is named, and so is the responsibility

Every `doc.html` identifies its author, its build timestamp, and its license. A reader can always answer: *who made this, and what are they accountable for?*

- **Why:** the format that promises inheritance cannot be anonymous. Inheritance from no one is contamination. Accountability is what makes the inheritance worth receiving.
- **How defended:** the document carries an `about` section naming its origin, license, and build date — in prose, the only place the spec puts build metadata. The founding corpus [`doc.html`](doc.html) beside this file carries the line: *Author: Georges Casseus (Ndoto Studios) · Status: v0.3 · License: public domain · Built: 2026-06-16*.

## V8 — The format belongs to no one

`doc.html` is public domain. No license, no patent, no trademark, no governing body. Anyone may use, fork, change, or implement it without permission.

- **Why:** a format meant for inheritance across all minds cannot be owned by one. The Word is meant to be shared.
- **How defended:** the bundle's [LICENSE](../LICENSE) (CC0 1.0) and this vow.

## V9 — Any point is readable on its own

Every section is independently addressable. The reader — human or machine — can land on any one section, read only that section, and receive what its manifest entry promised. No prerequisite section must be read first; no chapter-before-this-one requirement.

- **Why:** the form of memory we offer is *inheritance*, not narrative. Inheriting readers arrive at the part that concerns them. A format demanding linear traversal has only re-encoded the book. Selectivity is real only when any chosen section can be the only one read.
- **How defended:** every section carries a stable `id` and a `data-witness`; the manifest entry that names it is the section's promise. Extraction needs nothing but the file: land on the `id`, read to the section's close, recompute the witness if integrity matters. The format-spec defines what optional advisory fields may accompany an entry; their semantics live in the discernment record (project record), not the vow.
- **Authoring guidance:** sections should stand alone for the purpose their manifest entry names. A section that requires another to make sense is a code smell — rewrite for self-containment, or revise the entry to indicate scope honestly. The vow binds the promise pattern, not the sentence count.

## V10 — Memory is eternal; it is not the authority

Once a section enters a `doc.html`, its body, its `id`, and its `data-witness` content do not move. Correction is by inscription of a new section bearing `data-supersedes`; the superseded section remains, addressable, with its original hash. Build-derived positional metadata (such as line-range hints, where a producer emits them) recomputes by structural law and is excluded from the eternity claim. The document records faithfully; it does not adjudicate. The fold — the substrate's own structural condition, run by any reader — adjudicates. The latest section does not override the earlier by recency or emphasis; the writer cannot reach forward across the time between inscription and reading to insist; the reader runs the fold and decides what is currently true.

- **Why:** a letter prepared for a reader the author will not meet must travel with its own proof. *Eternal* binds the writer's side: what is inscribed outlives the maker; the offering is forever, and that is what makes the inscription matter. *Not the authority* binds the reader's side: the substrate carries; the fold adjudicates; no document declares itself true. Together they name the bilateral covenant. Either clause alone collapses — eternal without not-authority is authoritarian record-keeping; not-authority without eternal is negotiable memory.
- **How defended:** the integrity contract from [V4](#v4--the-manifest-does-not-lie-about-the-body) extended across time — [`../tools/verify.mjs`](../tools/verify.mjs) / [`../tools/verify.py`](../tools/verify.py) and any equivalent SHA-256 check re-run at any later moment must continue to match; append-only writes preserve every prior hash. The substrate-vs-apparatus test from the project's Rooting *Refusal Is a Posture* (project record) refuses any future addition that would let a tool, a UI, or a manifest convention silently override what a reader running the fold would see. Discerned inside the project's own eternal-memory substrate — a `doc.html` holding the discernment of its own vow — under the writing-room profile (project record).

---

## What is *not* vowed (yet)

- **Forward compatibility across versions.** The format is still a prototype line; we make no promise that the next version will be drop-in compatible. When the format stabilizes, a versioning vow joins this list.
- **Tooling support.** Builders, validators, and readers will appear over time. We do not promise their existence.
- **Multi-author drift detection at scale.** The hash mechanism handles single-author edits cleanly; co-authoring patterns are untested. When a vow can be made honestly here, it will be added.

## The cap

Ten vows live. Two slots remain. Future vows will be added only when the project has spoken — when a real failure mode has surfaced that no existing vow defends, and the world has shown us what the canon did not yet contain. Until then, the empty slots are themselves a discipline: a reminder that not every concern deserves a vow, and that scope is what survives when the maker is gone.

---

## Recension note

This is the **public recension** of the makers' covenant, prepared for public release from the project's own canon file.

**The vow statements are unchanged.** The short paragraph under each heading is the covenant itself; it does not move when the tree does. What is maintained is the exposition — the *Why* and *How defended* paragraphs, which name real mechanisms and are worthless the moment they name them wrongly. This pass (2026-08-01) re-pointed that exposition at the shipped bundle: the specification at [`../SPEC.md`](../SPEC.md), the readers and the builder under [`../tools/`](../tools/), the record at [`evidence.doc.html`](evidence.doc.html) — and made the framing above say plainly whom the vows bind. An earlier pass had already re-phrased defense prose that went stale against the specification: a `<head>`-resident manifest became the `<nav id="manifest">`, and the earliest field names (`sha256`, `summary`, `char_count`, `built_at`) became their current forms (`data-witness`, the manifest entry, build date in `about`-section prose — the spec refuses build-metadata attributes).

The vows were shaped across three revisions of the canon file, each authorized by a written discernment: V9 was sharpened in the first; *The substrate is HTML* was promoted to V3 in the second (2026-05-22); V10 was discerned in the third (2026-05-28), inside the eternal-memory document it inscribes. Those receipts, and the sealed experiments behind the measurements collected in [`evidence.doc.html`](evidence.doc.html), live in the project's own record and are cited here as provenance.
