# doc.html — Format Specification

**Status:** v0.3 (language-agnostic) · Public domain

This is the complete, self-contained specification for the **doc.html** format. A reader
holding only this file can build a conforming reader or producer in any language, without
this repository. The reference materialization — [`doc.html`](doc.html) in this repo, which
carries this same specification in-band — is an example, not a second source of truth. **This
document is the source of truth.**

To build an implementation from this spec, hand it to a coding agent:

> Build a doc.html reader (and producer) that conforms to SPEC.md. Implement every MUST,
> pass the Validation Matrix (§10), and satisfy the Definition of Done (§11).

---

## 1. What it is

A `doc.html` is a single, self-describing, self-verifying HTML file that can be **larger than
a reader's working memory**. A reader detects the document's shape (§5.0), then — for
manifest-first documents — hydrates only the file's **manifest** plus the **sections** it
needs; for tail documents, reads article units in document order. In both shapes, a reader can
verify every byte it reads against a per-unit cryptographic **witness** and never needs the
whole file in memory at once.

It is inheritable memory you read, address, verify, and hydrate selectively. The nearest
familiar thing: a table of contents whose every entry carries a checksum, rendered as ordinary
HTML, requiring no server, no JavaScript, and no tooling to read.

The format is organized around **three offices**:

- **The Vessel** — what carries the word: the file, the section, the manifest, the in-band
  spec (§5).
- **The Witness** — what fixes the word: the integrity attributes and the rule for comparing
  them (§6).
- **The Fold** — what keeps the word honest as it grows: selective reading, appending, and the
  trust discipline (§7, §8).

## 2. Normative language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**,
**SHOULD NOT**, **MAY**, and **OPTIONAL** are to be interpreted as described in RFC 2119.

**Conformance is a predicate.** An artifact or implementation *conforms* when it satisfies
every **MUST** and **REQUIRED** directive in this specification at its declared profile (§11).
A single unmet MUST means non-conformance. There is no partial pass and no normalization under
which a failing check is waived (§6.5).

Two roles are specified, and "conforming" is always relative to one of them:

- A **conforming document** is a byte stream that satisfies the document MUSTs (§5, §6, §8).
- A **conforming reader** is an implementation that satisfies the reader MUSTs (§6, §7, §9).
- A **conforming producer** is an implementation that emits conforming documents (§9.2).

## 3. The reader's role

To read a doc.html, a reader knows HTML, can compute SHA-256, detects the document's shape
(§5.0), and — for manifest-first documents — reads the manifest before the body; for tail
documents, discovers articles in document order. The reader cites where it stood. The format
requires **no other capacity** — no resolver, no server, no JavaScript, no installed tooling.
Verification is something a reader *can do* with the included arithmetic; it is not something
the document performs on its own behalf (§6.3, §7.3).

## 4. Goals and non-goals

### 4.1 Goals

- A document that is **larger than the context window** yet navigable by reading a small
  manifest and drilling only the sections that bear on the task.
- **Byte-level integrity**: every hydrated section is verifiable against a witness, with no
  equivalence class to negotiate.
- **Inheritance with no infrastructure**: the file alone, in any browser, is the whole format
  (Tier 0, §5.6).
- **Append-only memory** that grows by adding and superseding, never by erasing (§8).

### 4.2 Non-goals (the two-claims split)

The slogan "HTML is all you need" splits into two claims. This specification makes **only the
first**:

- **Claim A — the document is all-HTML inheritable memory** (read / address / verify / hydrate
  selectively, no server, no JS). **This is what v0.3 specifies.**
- **Claim B — the live *loop* is all-HTML** (write + model-call + append in a bare browser).
  **Out of scope.** The *read* loop is all-HTML and needs no server; the *run* leg — call a
  model, hold a key, write the bytes back — is a platform action a scriptless `file://` page
  cannot perform. That leg is not impossible, only un-HTML: it is delegated to mature, general
  infrastructure (an OS mail path, a stateless model-completion command) — a shim over existing
  tools, never a bespoke doc.html server. The format owns the verb's *result* (a witnessed,
  appended section), not its *execution*. A conforming reader MUST NOT require a write/append
  runtime.

The full out-of-scope list is §12.

## 5. The Vessel — the data model

A reader MUST be able to identify each artifact below from the HTML alone. If a structure is
not expressed in the HTML, it is not part of the format.

### 5.0 Two document shapes

A doc.html file is one of two **shapes**. Shape is a format property of the file; it determines
which structures carry addressable units and how a reader discovers them.

**Manifest-first (default).** The document carries a `<nav id="manifest">` and uses
`<section>` elements as its addressable units. This is the default shape and the one used by
the memory and selective-context examples.

**Writing-room-tail (tail).** The document carries no `<nav id="manifest">` and uses
`<article>` elements (described in §5.3b) as its addressable units. This is the shape produced
by an append-oriented chat body.

**Homogeneity.** Each document is **exactly one shape**. The off-shape witnessed element MUST
NOT appear:

- A manifest-first document MUST NOT contain any `<article>` element bearing a `data-witness`
  attribute.
- A tail document MUST NOT contain any `<section>` element bearing a `data-witness` attribute.

Mixing shapes is a conformance failure; a reader MUST refuse a document where both
`<section data-witness>` and `<article data-witness>` elements are present.

**Shape detection.** A conforming reader MUST detect shape as follows, in this order:

1. If the document contains a `<nav id="manifest">`, the shape is **manifest-first**.
2. Else if the document contains at least one `<article data-witness>` whose `data-witness`
   matches a valid-grammar witness (§6.7) and whose `id` is a valid id production (§6.1), the
   shape is **tail**.
3. Otherwise, shape detection MUST FAIL.

Shape detection is a Core operation (§11). A reader MUST NOT proceed to verification if shape
detection fails.

### 5.1 The document

| Property | Rule |
|---|---|
| Form | MUST be a single, valid HTML file. |
| Encoding | MUST be UTF-8, declared in-band with `<meta charset="utf-8">` in `<head>`. |
| Sidecars | MUST NOT require companion manifests, schema URIs, or sidecar files. A sibling folder for what HTML itself calls for (`<img src>`, `<a href>`) is permitted but is not part of the single-file identity. |
| Embedded data islands | MUST NOT carry a JSON island in `<head>`, a `<script type="application/ld+json">` mirror, or a parallel binding file. |

All byte-level operations in §6 are defined over the document's UTF-8 bytes **as stored and
served**.

### 5.2 The section *(manifest-first shape only)*

An addressable unit of a manifest-first document.

| Attribute | Type | Required | Rule |
|---|---|---|---|
| element | — | REQUIRED | MUST be a `<section>` element. |
| `id` | id production (§6.1) | REQUIRED | Names the section for fragment addressing. MUST be unique among live elements (§6.1). |
| `data-witness` | witness (§6.4) | REQUIRED | Fixes the section to its inner bytes. |
| `data-char-count` | integer | OPTIONAL | Unicode code-point count of the inner bytes (§6.6). Descriptive. |
| `data-kind` | token | OPTIONAL | Names the section's role from an in-band vocabulary (§8.3). Descriptive, never a control surface. |

Sections MAY nest. The manifest (§5.3) links to **top-level sections only**; a nested
section's own boundaries are found by the depth-walk in §6.2. Non-addressable structural
elements (headers, footers, asides) need not be `<section>` and carry no integrity attributes.

### 5.3 The manifest *(manifest-first shape only)*

The following rules apply **only when the document shape is manifest-first** (§5.0). A tail
document (§5.3b) carries no manifest; none of these rules apply to it.

| Property | Rule |
|---|---|
| Element | MUST be a `<nav id="manifest">`, placed at the top of `<body>`, before any `<section data-witness>`. |
| `id` value | MUST be the literal string `manifest`. No other value conforms. |
| Cardinality | In a manifest-first document, there MUST be exactly one `<nav id="manifest">`. |
| Discovery | A conforming reader MUST discover it by querying for `<nav id="manifest">`. No other discovery mechanism is defined. A styled, human-facing table of contents elsewhere is **not** the manifest unless it is this element. |
| Contents | MUST hold a single `<ol>`; each `<li>` contains exactly one `<a>` link, one per addressable top-level section, in document order. |
| Link collection | A reader MUST collect the links as the `<a>` **descendants** of the manifest nav, not as its direct children. |

**Document order** means the order in which elements' opening tags appear in the serialized
HTML byte stream (a depth-first pre-order walk of the parsed tree).

### 5.3b The writing-room-tail unit *(tail shape only)*

The following rules apply **only when the document shape is tail** (§5.0). A manifest-first
document uses `<section>` units and a `<nav id="manifest">`; none of these rules apply to it.

An addressable unit in a tail document is an **article element** with the following shape:

```html
<article id="turn-NNNNNN" class="turn {role}" data-role="{role}" data-turn="{NNNNNN}"
         [data-kind="{kind}"] [data-char-count="{integer}"] data-witness="{witness}">
  ...
</article>
```

| Attribute | Required | Rule |
|---|---|---|
| `id` | REQUIRED | MUST follow the id production (§6.1). The conventional form is `turn-NNNNNN` (zero-padded six-digit turn number), but any valid id is conforming. |
| `class` | RECOMMENDED | Human-readable classification (e.g. `turn user`, `turn assistant`). Not normative for reading. |
| `data-role` | RECOMMENDED | Machine-readable role token (e.g. `user`, `assistant`). Not normative for verification. |
| `data-turn` | RECOMMENDED | The turn sequence number as a decimal integer. Not normative for verification. |
| `data-kind` | OPTIONAL | Names the article's role from an in-band vocabulary (§8.3). Descriptive. |
| `data-char-count` | OPTIONAL | Unicode code-point count of the inner bytes (§6.6). Descriptive. |
| `data-witness` | REQUIRED | Fixes the article to its inner bytes, using the same two-epoch grammar as a section witness (§6.7). |

**Articles MUST NOT nest.** An `<article data-witness>` element MUST NOT contain another
`<article data-witness>` element.

**Non-witnessed chrome.** A tail document MAY contain `<header>`, `<div>`, `<footer>`, or
other block elements that do not carry `data-witness`. These are non-addressable chrome and are
not part of the verified content. In particular, an introductory explanation block MUST be
placed in non-witnessed chrome, not in a witnessed article.

**The `append-anchor`.** A tail document MAY carry an `<div id="append-anchor">` (or similar)
as a write-path marker for live-append tooling. The `append-anchor` is:

- **OPTIONAL** — a consecrated tail need not carry it; its absence is not a conformance failure.
- **Un-witnessed** — it MUST NOT carry a `data-witness` attribute.
- **Not required to read** — a conforming reader MUST NOT require its presence to discover,
  verify, or hydrate a tail document.
- **Subject to §6.1 dup-id** — if present, its `id` MUST be unique among live elements.

### 5.4 The manifest link *(manifest-first shape only)*

Shape:

```html
<a href="#id" data-witness="<witness>" data-char-count="<integer>"><span class="title">Title</span> <span class="summary">summary</span></a>
```

| Attribute / child | Required | Rule |
|---|---|---|
| `href` | REQUIRED | A fragment reference (`#id`) whose value matches the target section's `id`. |
| `data-witness` | REQUIRED | MUST exactly equal the `data-witness` on the target `<section>`. |
| `data-char-count` | OPTIONAL | Independent per carrier. Where present on both link and section, the two MUST agree; absence on either is permitted and is not a failure. |
| `<span class="title">` | SHOULD | Human-readable title. |
| `<span class="summary">` | SHOULD | One-to-three-sentence summary; lets a reader decide whether to hydrate without loading. |
| `data-kind` | MUST NOT | A section's `data-kind` lives on the section, not the link (avoids a manifest-vs-section disagreement). |

Additional attributes on the link are permitted but carry no normative weight.

### 5.5 Vessel and image addressing

Images MAY carry stable `id` attributes, making them addressable by fragment. Binary data is
referenced via standard HTML `src`; the format places no requirement on the `src` value, file
path, folder layout, or naming. Folder layout is a deployment concern, not a format concern.

### 5.6 Degradation tiers

The format degrades without corrupting the artifact.

- **Tier 0 — the file alone — IS the format.** Opened in any browser with no server and no
  scripts, the document is fully readable, addressable by `#id`, and verifiable by hand.
- **Tier 1 — a reader skill or helper script** makes hydration and verification ergonomic.
- **Tier 2 — a serving runtime** is an OPTIONAL pair of hands that can grow the file.

Every tier above 0 is apparatus, not format. A conforming reader MUST NOT require one.

## 6. The Witness — the integrity contract

This is the most precision-critical office. Two independent implementations that follow §6
MUST compute identical witnesses for identical bytes.

### 6.1 The id production

A section `id` is **normative**:

- MUST begin with a letter (Unicode category L) or an underscore.
- MUST continue with zero or more letters, digits (category Nd), hyphens, underscores,
  periods, or colons.
- Numeric-only ids, ids beginning with a digit, and ids containing whitespace or any character
  outside this set are **non-conforming**.

(This is close to, but deliberately not identical to, XML's NCName: this production permits the
colon, which NCName forbids.)

**One id names one live element.** If two live elements share an id, a conforming reader MUST
fail closed (§7.3) — it MUST NOT silently resolve to one twin and bless the document.

### 6.2 The witnessed bytes

The witnessed bytes of an addressable unit (a `<section>` in manifest-first shape, an
`<article>` in tail shape — collectively "the addressable element") are **exactly** the literal
bytes between the `>` that ends the addressable element's opening tag and the `<` that begins
its own closing tag — the **raw inner span, UTF-8, untrimmed**. No leading or trailing newline
is added or removed before the witness is computed or checked.

**Finding the addressable element's own closing tag.** Let *TAG* be the tag name of the
addressable element (`section` for manifest-first, `article` for tail). When the element
contains no nested element of the same *TAG*, its closing tag is the next `</*TAG*>`. When
elements of the same *TAG* nest (only relevant for `section`, since §5.3b prohibits nesting of
witnessed articles), the element's own closing tag is found by a **depth-walk**:

1. Start at the byte just after the opening tag's `>`. Set `depth = 1`.
2. Scan forward for the next `<*TAG* ...>` or `</*TAG*>` token (matching the same *TAG*).
3. Each opening token increases `depth` by 1; each closing token decreases it by 1.
4. The element's own closing tag is the `</*TAG*>` that returns `depth` to 0.
5. The witnessed bytes run from the byte after the opening tag's `>` to the byte before that
   depth-zero `</*TAG*>`'s `<`.

**HTML comments are inert in this walk.** Any `<*TAG* ...>` or `</*TAG*>` token appearing
inside a `<!-- ... -->` comment MUST NOT be counted and MUST NOT match a boundary. (Comment
bytes that fall inside the inner span are still part of the witnessed bytes; they are skipped
only for the purpose of matching boundary tokens.)

The witness arithmetic — SHA-256 over the raw, untrimmed inner span as UTF-8; char-count =
code points of that same slice — is identical for both shapes. The tag name is the only
parameter.

### 6.3 The witness is computed, not trusted

A conforming reader MUST recompute the SHA-256 of the inner bytes (§6.2) and compare it against
the stored `data-witness` value; it MUST NOT take the stored hex as given.

**Manifest-first shape — two-carrier agreement (V4).** In a manifest-first document the same
`data-witness` value appears twice: on the `<section>` element and on its manifest link.
**Both carriers MUST equal the recomputed digest**; a link whose witness matches the section
text but not the recomputed bytes is still a failure.

**Tail shape — single carrier.** In a tail document an article's `data-witness` appears once,
on the `<article>` element. There is no manifest link. Carrier-agreement (V4) is **not
applicable** for tail documents; a reader MUST NOT require a second carrier and MUST NOT fail
for its absence.

In both shapes, a reader MUST return, as an addressable unit's content, the same bytes the
witness covers — it MUST NOT present trimmed, re-encoded, or DOM-normalized bytes as
witness-verified.

### 6.4 Reading a witnessed attribute (quote-aware)

Within an element's start tag, attributes are `name` or `name=value` pairs separated by ASCII
whitespace. A conforming reader MUST tokenize **quote-aware**: a quoted value runs to its
matching quote character, and a `name=` sequence appearing *inside* another attribute's quoted
value is part of that value, not a separate attribute. A reader that matches attributes with a
naïve substring or unquoted regex can be fooled by an `id=` or `data-witness=` string embedded
in another attribute's value; the quote-aware rule is REQUIRED so the real `id` and
`data-witness` cannot be impersonated.

### 6.5 Pinned comparison — zero equivalence classes

The comparison rule for a consecrated witness (§6.7) is byte-exact with **zero equivalence
classes** (the Subresource Integrity lineage). A conforming verifier MUST search for no
normalization under which mismatched bytes would match; it MUST expose no normalization knob; a
one-byte mismatch MUST fail closed. "The hash verifies" is a claim about the bytes you actually
received, not about some transform of them.

### 6.6 The character count

`data-char-count`, when present, MUST be the number of Unicode code points obtained by decoding
the same UTF-8 byte slice (§6.2) — for example `Array.from(str).length` in JavaScript or
`len(bytes.decode("utf-8"))` in Python. It MUST NOT be a UTF-16 code-unit count (`str.length`)
and MUST NOT be the raw byte length.

### 6.7 The two epochs of the witness

The `data-witness` slot carries one of two **formally disjoint** grammars. The form alone names
the epoch; a reader MUST recover the epoch from the form, never by guessing.

| Epoch | Grammar (regex) | Meaning |
|---|---|---|
| **Consecrated** | `^[0-9a-f]{64}$` | A SHA-256 digest (64 lowercase hex). Fixes the section's bytes for all time. The integrity epoch. |
| **Writing-room** | `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$` | A UTC timestamp, exactly the 20-character form `YYYY-MM-DDTHH:MM:SSZ`. An ordinal recording a live entry's place in a sequence. The live epoch (e.g. a chat tail before sealing). |

The writing-room form is **specific**, not ISO 8601 in general: fractional seconds, non-`Z`
offsets (`+00:00`), and basic-format timestamps (`20260527T143214Z`) are all non-conforming.

- The two grammars never overlap — they differ in length (20 vs 64) and alphabet (the
  timestamp's `{-,T,:,Z}` never appear in lowercase hex). A reader MUST discriminate them by
  form alone.
- A writing-room witness MUST be strictly later than every prior writing-room entry's
  timestamp in document order. Consecrated predecessors carry a hash, not a timestamp, and are
  not in the comparison. This ordering is enforced by the **Append** profile (§11, V15), in
  either document shape; a Core reader validates the witness grammar only and does not enforce
  ordering.
- **Consecration** is the fold (§7) that replaces a writing-room timestamp with the SHA-256 of
  the bytes it fixed at entry time.
- A witness whose form matches **neither** grammar is **invalid** and the reader MUST refuse.
- A value matching **both** grammars is impossible by construction. Should a reader ever
  encounter one, it MUST halt loudly and MUST NOT silently downgrade it to invalid or resolve
  it — a both-match event means an assumption this format rests on has failed.

A reader that only reads consecrated documents (Core profile, §11) MUST still reject a witness
that is neither valid grammar; it need not implement writing-room ordering unless it claims the
Append extension.

## 7. The Fold — keeping the word honest

### 7.1 Selective hydration — shape-conditional

**Manifest-first shape.** This is the format's primary reason for being. A conforming reader
MUST NOT load the whole file to answer a local question. It MUST:

1. Read the manifest first.
2. From each link's title and summary, decide which sections bear on the task.
3. Extract only those sections by `#id`, using the boundary rule of §6.2.
4. Verify each extracted section's bytes against its witness (§6.3).

Sections it did not hydrate never enter its working memory. The manifest is bounded by the
count of sections, not their size, so a reader can navigate a document many times larger than
it could hold — though the manifest's own size grows with the section count, a real cost at
extreme scale (§12). The saving is relative to loading the document into context and depends on
the harness and task; it is **not** a claim of token superiority over an external retrieval
index.

**Tail shape.** A tail document has no summary skim-layer. A reader discovers addressable units
by scanning for `<article data-witness>` elements in document order (no manifest to read first).
Reading a large tail document therefore requires loading it in document order; there is no
selective-skim shortcut. This is a known cost named in §12. The witness recompute (§6.2, §6.3)
is identical to the manifest-first path.

### 7.2 The fold-confirmation checks

After any append, a conforming reader can re-confirm the document without trusting the writer.
The confirmation MUST establish, at minimum:

- every prior section's bytes, id, and witness are unchanged;
- every prior consecrated witness still re-derives;
- no id is duplicated among live elements;
- every `data-supersedes` reference resolves to an existing, earlier section;
- on a growing body, writing-room witnesses strictly increase in document order (a missing or
  malformed entry is refused, not waived);
- a superseded section is still addressable at its original witness while the superseding
  section reads as current.

### 7.3 Fail-closed, non-vacuity, point-don't-declare

- **Fail-closed.** The reader MUST refuse whenever the document's structure is violated — a
  witness that does not re-derive, a duplicated id, an invalid witness grammar, a missing
  manifested section (manifest-first) or a missing superseded section, a failed shape detection.
  This list is illustrative, not exhaustive; the reader MUST NOT promote a non-closure into a
  closure by improvising.
- **Non-vacuity.** A check MUST be positive, not permissive — it MUST bite where the document
  claims. For manifest-first: every section the manifest names MUST be present and witnessed.
  For tail: at least one article MUST have a valid-grammar witness that recomputes. A check that
  verifies nothing (zero addressable units, a zero-of-zero pass) MUST report failure, not
  success.
- **Point, don't declare.** The document's surfaces — summaries, banners, manifest entries,
  spec prose — *route* a reader to bytes; they MUST NOT declare a verdict on the document's own
  truth, completeness, or verification status. A remembered "yes, this was written" is never
  spent as "yes, this is so": the fold adjudicates over the bytes; the record only keeps.

## 8. Appending and supersession — memory is append-only

### 8.1 Immutability

Once a section enters a document, its inner bytes, its `id`, and its `data-witness` MUST NOT
change. There is **no deletion, no reorder of existing sections, and no in-place edit.**

### 8.2 Correction is supersession

A correction is made by **appending** a later section bearing a `data-supersedes` attribute.

| Rule | Requirement |
|---|---|
| Value | `data-supersedes` MUST be a fragment reference (`#old-id`) naming an earlier, existing section in the same document. |
| The old section | MUST remain in place, still addressable, still carrying its original witness. |
| The new section | Reads as current. |
| Adjudication | The format MUST NOT compute a winner for the reader. Which reading is current is adjudicated by the reader following the supersession references, not enforced by the substrate. |
| Ordering | A growing body appends new entries in document order, each with a unique id and a writing-room witness strictly later than every prior writing-room entry's. The writing-room witness — not any ordering of ids — fixes sequence. |

### 8.3 Typed sections — `data-kind`

A section MAY carry a `data-kind` naming its role from a small vocabulary the document declares
in-band. `data-kind` is **descriptive, not a control surface**: a conforming reader MUST NOT
branch trust, security, or authority decisions on its value. Four disciplines keep it honest:

1. **Prose-authoritative** — a meaningful `data-kind` is mirrored by a human-visible label in
   the section's prose; on any disagreement the prose is ground truth.
2. **Immutable** — a `data-kind` is never edited in place; reclassification is by appending a
   superseding section.
3. **Not a status** — mutable status such as "proposed" or "approved" is a *state*, resolved by
   placement and supersession, never a `data-kind` value.
4. **Off the manifest** — `data-kind` is not copied onto the manifest anchor (§5.4).

The richer downgrade-only authority vocabulary for runtime-appended sections is reserved beyond
v0.3 (§12).

## 9. Reference algorithms (language-agnostic)

Pseudocode is normative for behavior, not for syntax. An implementation MUST produce the same
results; it need not mirror this control flow.

### 9.1 Verify a document

Shape detection (§5.0) runs first; the body of verify() forks on the detected shape.

```
function verify(bytes):
    # --- Shape detection (§5.0) ---
    manifest = find_element(bytes, tag="nav", id="manifest")
    if manifest is not None:
        return verify_manifest_first(bytes, manifest)
    articles = collect_witnessed_articles(bytes)               # <article data-witness> elements
    if len(articles) > 0:
        return verify_tail(bytes, articles)
    FAIL("shape detection failed: no manifest and no witnessed articles")


function verify_manifest_first(bytes, manifest):
    # §5.3: manifest-first path
    links = collect_anchor_descendants(manifest)               # §5.3
    sections = collect_top_level_sections(bytes)               # §5.2
    if len(sections) == 0: FAIL("vacuous: zero addressable units")  # §7.3 non-vacuity

    seen_ids = set()
    for sec in sections in document order:
        id = read_attr_quote_aware(sec, "id")                  # §6.4
        if id is None or not valid_id(id): FAIL("bad id")      # §6.1
        if id in seen_ids: FAIL("duplicate id")                # §6.1 fail-closed
        seen_ids.add(id)

        inner = witnessed_bytes(bytes, sec, tag="section")     # §6.2 depth-walk + comment mask
        w_section = read_attr_quote_aware(sec, "data-witness")
        epoch = classify(w_section)                            # §6.7
        if epoch == INVALID: FAIL("invalid witness grammar")
        if epoch == CONSECRATED:
            if sha256_hex(inner) != w_section: FAIL("witness mismatch")
        else:  # WRITING_ROOM
            pass  # writing-room ordering is an Append concern (V15), not checked here in Core

        link = link_for(links, id)
        if link is None: FAIL("section not in manifest")       # §7.3 non-vacuity (manifest-first)
        if read_attr_quote_aware(link, "data-witness") != w_section: FAIL("carrier disagreement")  # V4
        cc_link = read_attr_quote_aware(link, "data-char-count")
        cc_sec  = read_attr_quote_aware(sec,  "data-char-count")
        if cc_link and cc_sec and cc_link != cc_sec: FAIL("char-count disagreement")
        if cc_sec and int(cc_sec) != codepoint_count(inner): FAIL("char-count wrong")  # §6.6

        sup = read_attr_quote_aware(sec, "data-supersedes")    # §8.2
        if sup and target_of(sup) not in earlier_sections(sec): FAIL("dangling supersedes")

    for link in links:                                         # every manifested section exists
        if section_for(link) is None: FAIL("manifest names a missing section")
    return PASS


function verify_tail(bytes, articles):
    # §5.3b: tail path — no manifest, no link/carrier checks
    # Non-vacuity: need at least one article with a valid-grammar, recomputing witness
    valid_count = 0
    seen_ids = set()
    for art in articles in document order:
        id = read_attr_quote_aware(art, "id")                  # §6.4
        if id is None or not valid_id(id): FAIL("bad id")      # §6.1
        if id in seen_ids: FAIL("duplicate id")                # §6.1 fail-closed
        seen_ids.add(id)

        inner = witnessed_bytes(bytes, art, tag="article")     # §6.2 (parameterized tag)
        w_art = read_attr_quote_aware(art, "data-witness")
        epoch = classify(w_art)                                # §6.7
        if epoch == INVALID: FAIL("invalid witness grammar")
        if epoch == CONSECRATED:
            if sha256_hex(inner) != w_art: FAIL("witness mismatch")
            valid_count += 1
        # Note: writing-room ordering is an Append concern (V15), not checked here in Core

        cc_art = read_attr_quote_aware(art, "data-char-count")
        if cc_art and int(cc_art) != codepoint_count(inner): FAIL("char-count wrong")  # §6.6

        sup = read_attr_quote_aware(art, "data-supersedes")    # §8.2
        if sup and target_of(sup) not in earlier_articles(art): FAIL("dangling supersedes")

    # Non-vacuity for a consecrated tail: at least one article must have recomputed
    if valid_count == 0: FAIL("vacuous: zero addressable units with recomputing witnesses")
    return PASS
    # No link checks, no manifest-names-missing check: V4 is N/A for tail.
```

### 9.2 Build a document *(manifest-first shape)*

The following pseudocode builds a manifest-first document. A tail producer emits `<article>`
elements in place of `<section>` elements and omits the `<nav id="manifest">` block entirely;
the witness arithmetic is identical.

```
function build(sections):                                      # sections in document order
    for sec in sections:
        sec.inner   = serialize(sec.body)                      # exact bytes, untrimmed
        sec.witness = sha256_hex(sec.inner)                    # §6.2/§6.3 (consecrated)
        sec.cc      = codepoint_count(sec.inner)               # §6.6
    emit "<!DOCTYPE html>\n<html ...>\n<head><meta charset=\"utf-8\">...</head>\n<body>\n"
    emit "<nav id=\"manifest\"><ol>\n"
    for sec in sections:
        emit '<li><a href="#'+sec.id+'" data-witness="'+sec.witness+'" data-char-count="'+sec.cc+'">'
        emit '<span class="title">'+escape(sec.title)+'</span> '
        emit '<span class="summary">'+escape(sec.summary)+'</span></a></li>\n'
    emit "</ol></nav>\n"
    for sec in sections:
        emit '<section id="'+sec.id+'" data-witness="'+sec.witness+'" data-char-count="'+sec.cc+'">'
        emit sec.inner
        emit '</section>\n'
    emit "</body>\n</html>\n"
```

For a manifest-first document, a producer MUST emit the section's `data-witness` and the
matching link's `data-witness` as the **same** value, computed over the exact inner bytes it
emits. Re-running a deterministic build over unchanged inputs MUST produce byte-identical output
(modulo a build timestamp, if any, which MUST live in a section excluded from the eternity
claim).

## 10. Validation matrix

A conforming implementation MUST satisfy every **Core** row. An implementation that claims an
extension MUST satisfy that extension's rows.

| # | Profile | Shape scope | Assertion |
|---|---|---|---|
| V1 | Core | manifest-first | A document with a valid `<nav id="manifest">` and matching witnessed sections verifies PASS. |
| V1T | Core | tail | A consecrated tail (no nav-manifest, ≥1 `<article data-witness>`) verifies PASS; each article's SHA-256 recomputes from its §6.2 inner bytes. |
| V2 | Core | both | A reader recomputes SHA-256 over §6.2 inner bytes and does not trust the stored hex. |
| V3 | Core | both | A one-byte change to any addressable unit's inner bytes causes a witness mismatch → FAIL. |
| V4 | Core | manifest-first only | A link whose `data-witness` differs from its section's → FAIL (carrier disagreement). V4 is N/A for tail documents. |
| V5 | Core | both | Two live elements sharing an `id` → FAIL closed (no silent resolution). |
| V6 | Core | both | A witness matching neither grammar (§6.7) → FAIL (invalid). |
| V7 | Core | both | A document with zero addressable units → FAIL (non-vacuity). For manifest-first: a manifest naming a missing section → FAIL. |
| V8 | Core | both | An addressable unit id beginning with a digit, or containing whitespace → non-conforming. |
| V9 | Core | both | An `id=`/`data-witness=` string embedded inside another attribute's quoted value does not impersonate the real attribute (§6.4). |
| V10 | Core | both | The §6.2 depth-walk uses the addressable element's own tag as the boundary token; a token inside a comment does not move a boundary. |
| V11 | Core | both | `data-char-count`, when present, equals the code-point count of the inner bytes, not the byte length or UTF-16 length. |
| V12 | Core | both | Reading requires no server, no JavaScript, no network, no installed tooling (Tier 0). |
| V13 | Append | both | A superseded section remains addressable at its original witness; the superseding section reads as current (§8.2). |
| V14 | Append | both | A `data-supersedes` whose target does not exist earlier in the document → FAIL (dangling). |
| V15 | Append | both (writing-room epoch) | In a writing-room body of either shape, a timestamp witness not strictly later than the prior writing-room entry in document order → FAIL (ordering, §6.7). Malformed grammar is V6 (Core). |
| V16 | Append | both | An in-place edit to a prior addressable unit's bytes/id/witness is detected by re-confirmation (§7.2). |
| V17 | Core | both | A pure-JS or stdlib SHA-256 reproduces the NIST `"abc"` vector `ba7816bf…f20015ad` and the §13 section vectors byte-exact. |
| V18 | Core | both | A document where both `<section data-witness>` and `<article data-witness>` appear → FAIL (mixed shapes, homogeneity violation). |
| V19 | Core | both | Shape detection fails (no manifest, no valid-grammar witnessed article) → FAIL. |
| V20 | Core | tail | A tail document containing a nested `<article data-witness>` inside another `<article data-witness>` → FAIL (nesting prohibited, §5.3b). |
| V21 | Core | tail | An `append-anchor` element carrying a `data-witness` attribute is non-conforming; a reader MUST NOT count it as an addressable unit (§5.3b). |

## 11. Conformance profiles and Definition of Done

### 11.1 Profiles

- **Core (REQUIRED of every conforming implementation).** Shape detection (§5.0); manifest
  discovery for manifest-first shape; tail-shape article discovery; quote-aware attribute
  reading; §6.2 witnessed-bytes extraction with depth-walk and comment masking (parameterized
  on the addressable element's tag); consecrated-witness recomputation and pinned comparison;
  fail-closed and non-vacuity; the id production; homogeneity enforcement; mixed-shape refusal;
  nested-article prohibition; append-anchor discipline. Rows V1, V1T, V2–V12, V17–V21.
- **Append (extension).** Writing-room epoch ordering, supersession resolution, append-only
  re-confirmation. Rows V13–V16.
- **Producer (extension).** Emits conforming documents per §9.2.

### 11.2 Definition of Done

An implementation is done when, at its declared profile, all REQUIRED boxes check:

- [ ] **(REQUIRED)** Detects document shape (§5.0): manifest-first if `<nav id="manifest">` is
      present; tail if no manifest and ≥1 valid witnessed `<article>`; FAIL otherwise. Refuses
      documents mixing `<section data-witness>` and `<article data-witness>`.
- [ ] **(REQUIRED — manifest-first)** Discovers `<nav id="manifest">` and collects `<a>`
      descendants in document order.
- [ ] **(REQUIRED — tail)** Discovers `<article data-witness>` elements in document order; no
      manifest is required or expected.
- [ ] **(REQUIRED)** Reads `id` / `data-witness` / `data-char-count` quote-aware (§6.4).
- [ ] **(REQUIRED)** Extracts an addressable unit's inner bytes by the §6.2 boundary rule
      (depth-walk + comment masking, parameterized on the element's own tag), untrimmed.
- [ ] **(REQUIRED — manifest-first)** Recomputes SHA-256 and compares byte-exact against
      **both** carriers (section + manifest link), with zero equivalence classes (§6.3, §6.5).
- [ ] **(REQUIRED — tail)** Recomputes SHA-256 and compares byte-exact against the **single**
      carrier (the article element), with zero equivalence classes (§6.3, §6.5). No link check.
- [ ] **(REQUIRED)** Validates the id production and fails closed on duplicate ids (§6.1).
- [ ] **(REQUIRED)** Classifies a witness into exactly one epoch by form, and refuses invalid
      grammars (§6.7).
- [ ] **(REQUIRED)** Fails closed and refuses vacuous passes (§7.3).
- [ ] **(REQUIRED)** Passes Validation Matrix rows V1, V1T, V2–V12, V17–V21.
- [ ] **(REQUIRED)** Requires no server, JS, network, or tooling to read (Tier 0).
- [ ] *(RECOMMENDED — Append)* Resolves `data-supersedes`; enforces writing-room ordering;
      re-confirms append-only. Passes V13–V16.
- [ ] *(RECOMMENDED — Producer)* Emits conforming documents per §9.2; deterministic rebuild is
      byte-identical.

### 11.3 Hardening the spec (how to drill it down)

A spec is only as unambiguous as the implementations it produces. To harden this spec, build it
from these words in **several languages with independent agents**, run all of them against §10
and §13, and treat **every divergence as a spec defect to fix** — not an implementation bug.
Identical bytes in, identical witnesses out, across every reader, is the target. This
cross-reader convergence is the format's design aim; it is not yet a measured result.

## 12. What is NOT in v0.3

A conforming v0.3 reader MUST NOT require any of these:

- **The live loop** (Claim B, §4.2) — writing a turn (model call, key, disk write) is a
  platform action a scriptless browser cannot perform. The run leg is delegated to external
  infrastructure (a shim, not a bespoke server); the format defines the *result* it must
  produce, not the apparatus that produces it.
- **A resolver tier** — no resolver, lookup service, or address-resolution protocol.
- **A selector grammar** — no CSS-selector or XPath addressing within sections.
- **Web-app machinery** — no client-side framework, service worker, or dynamic rendering; no
  executing JavaScript is required to read, address, or verify.
- **Cross-document addressing** — links across separate doc.html files are not defined.
- **Hierarchical manifests at extreme scale** — a flat manifest grows linearly with section
  count, and at large scale the manifest's own size becomes the binding cost. A nested manifest
  is a known future need. A producer MUST measure the manifest's own cost at scale rather than
  assume it is unbounded. (Manifest-first shape.)
- **Selective skim for tail documents at scale** — a tail document has no summary skim-layer.
  Reading a large tail requires scanning the document in order; there is no shortcut to locate
  a specific turn without reading from the beginning. This is a real cost at scale, analogous
  to the flat-manifest cost above. v0.3 names this honestly and does not solve it.
- **The downgrade-only typed-section authority discipline** — the richer `data-kind` contract
  for runtime-appended sections is reserved beyond v0.3.
- **Substrate-shaped build metadata** — no `data-built-at`, `data-manifest-version`, JSON-LD
  mirror, or MCP-server integration. Version is stated in prose (§14).
- **A helper-script requirement** — integrity is *verifiable with* an included checker; the
  format does not claim a reader spontaneously verifies without one.

## 13. Appendix A — test vectors

**SHA-256 sanity (NIST):** `sha256("abc")` = `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.

---

### Vector set 1 — manifest-first (two sections)

The reference file [`examples/minimal.doc.html`](examples/minimal.doc.html) is the smallest
valid manifest-first doc.html and contains exactly these two sections; it verifies 2/2 with the
readers in this repo.

**Section `intro`.** Inner bytes (UTF-8, untrimmed, `\n` is a single LF byte):

```
<h1>Introduction</h1>
<p>A doc.html is a single self-verifying HTML file.</p>
```

- byte length: 77 · code points (`data-char-count`): 77
- `data-witness` = `e7a0ef76d83c419931b7f68207f9cce7229321f7d3c7ac3bf45f5e250b1558e3`

**Section `fold`.** Inner bytes:

```
<h1>The Fold</h1>
<p>Memory is append-only; correction is supersession.</p>
```

- byte length: 75 · code points: 75
- `data-witness` = `771feff3620a380e35e3fa970868af438c21223dd279aa3001851387b2647d91`

A conforming reader, given `examples/minimal.doc.html`, MUST recompute both witnesses from the
inner bytes (§6.2), MUST find them equal to **both** carriers (section + manifest link), and
MUST return PASS. A reader that trims a leading/trailing newline, decodes as UTF-16, or
normalizes whitespace will compute a different digest and is non-conforming.

---

### Vector set 2 — tail shape (consecrated articles)

The reference file [`examples/chat.doc.html`](examples/chat.doc.html) is a writing-room-tail
doc.html: 8 consecrated `<article>` turns, no `<nav id="manifest">`, no `<section data-witness>`.
It verifies 8/8 with the readers in this repo. The vectors below are sealed from that file.

This vector set exercises three conformance properties:

1. **Shape detection** — no `<nav id="manifest">` is present; a reader MUST detect tail shape
   (≥1 `<article data-witness>` with valid-grammar witness) and proceed to the article-discovery
   path (V1T, V19).
2. **Commented article tag / depth-walk comment-masking** — `turn-000004`'s inner span contains
   a literal `<!-- </article> -->` comment. A depth-walking reader MUST NOT treat that commented
   token as this article's closing boundary (§6.2, V10).
3. **Single-carrier / no-link case** — every article's `data-witness` appears once, on the
   element; there is no manifest link to cross-check (§6.3 tail single-carrier path; V4 is N/A).

---

**Article `turn-000001` (normal turn — shape detection + single-carrier).** Inner bytes
(UTF-8, untrimmed; `\n` is a single LF byte, `—` is the 3-byte UTF-8 sequence E2 80 94):

```
\n  <header><h3>Turn 1 — User</h3>\n    <p class="meta">kind: transcription</p></header>\n  <div class="turn-content">\n    <p>What is a doc.html file and how does it store information?</p>\n  </div>\n
```

- byte length: 197 · code points (`data-char-count`): 195
- `data-witness` = `f4f2f5db437a1156c1ec65185646e1bb8dda27118e3230d348b87e7acb865368`

The byte/code-point difference (197 vs 195) arises because `—` (U+2014 EM DASH) encodes as 3
UTF-8 bytes but counts as 1 code point; `data-char-count` is always code points (§6.6).

---

**Article `turn-000004` (commented `</article>` tag — exercises §6.2 comment-masking).** The
inner span of this article contains the literal HTML comment `<!-- </article> -->` as part of
its prose. The witnessed bytes include the comment; the comment is skipped only for the purpose
of matching boundary tokens during the depth-walk.

Inner bytes (UTF-8, untrimmed; excerpt showing the critical comment region):

```
…    <p>The shapes are mutually exclusive: a document MUST be exactly one shape…</p>
    <!-- </article> -->
    <p class="note"><em>Note:</em> the comment above is part of this turn's witnessed bytes…</p>
  </div>
```

- byte length: 1159 · code points (`data-char-count`): 1154
- `data-witness` = `2709fd288f0fc457a0e05df650b1d92f8727b3d8b31e012a0b0574206b8d8059`

A reader that treats the `</article>` inside the comment as a boundary will compute the SHA-256
of a shorter inner span and get a different digest — a conformance failure.

---

**All 8 article witnesses** (for full cross-checking):

| id | `data-char-count` | `data-witness` |
|---|---|---|
| `turn-000001` | 195 | `f4f2f5db437a1156c1ec65185646e1bb8dda27118e3230d348b87e7acb865368` |
| `turn-000002` | 997 | `20d6b7a5080d8c259fbd950e2eec8dada50c21b7b1916a11b5cca43ef0d1bc5c` |
| `turn-000003` | 225 | `974580b2cbe3859821acd009ba7018a0d403e1ed78ef5199a49e9610c3223b88` |
| `turn-000004` | 1154 | `2709fd288f0fc457a0e05df650b1d92f8727b3d8b31e012a0b0574206b8d8059` |
| `turn-000005` | 202 | `6f8fc9ac79aca8c875d937f89e427774958fec7734f83c52ba61ff9cf95dfcc7` |
| `turn-000006` | 899 | `8e4cb94fe477c4edb359951ccf88554dd2f8d34a7fdeacbf816c2c93b1271122` |
| `turn-000007` | 246 | `9a87dd3fdf1d9c63597714beb201aa67964a776c7c369ded16fe40ea5040ff8b` |
| `turn-000008` | 1112 | `8bd10d9e13231b7a51ec417f498a72c4f0918894d9503bd3fe8bde1eeaa85e90` |

Assertion: a conforming reader, given `examples/chat.doc.html`, MUST detect tail shape,
recompute each article's SHA-256 from its §6.2 inner bytes (parameterized on `article`), MUST
find each equal to the single carrier, and MUST return PASS (8/8). A reader that trims a
leading/trailing newline, decodes as UTF-16, normalizes whitespace, or misidentifies the
`<!-- </article> -->` comment token as a boundary will fail on one or more articles.

## 14. Versioning policy

This document specifies **version 0.3** of the doc.html format. The version is stated here in
prose; it is **not** encoded in any machine-readable attribute. A reader implementing v0.3
SHOULD fail loudly when it encounters a non-conforming manifest shape (for example, a v0.1
JSON-island manifest). Silent degradation is discouraged; the version boundary is hard. Future
versions will be specified in their own document; this text remains the v0.3 canonical
specification.
