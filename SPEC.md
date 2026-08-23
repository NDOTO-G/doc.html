# doc.html — Format Specification

**Status:** v0.5 (language-agnostic) · Public domain

This is the complete, self-contained specification for the **doc.html** format. A reader
holding only this file can build a conforming reader or producer in any language, without
this repository. Two materializations accompany it and neither is a second source of truth:
[`SPEC.doc.html`](SPEC.doc.html) at the root carries this specification in the format's own
body, and [`documents/doc.html`](documents/doc.html) is the founding corpus — historical
wherever it disagrees with this file. **This document is the source of truth.**

To build an implementation from this spec, hand it to a coding agent:

> Build a doc.html reader (and producer) that conforms to SPEC.md. Implement every MUST,
> pass the Validation Matrix (§10), and satisfy the Definition of Done (§11).

---

## 1. What it is

A `doc.html` is a single, self-describing, self-verifying HTML file that can be **larger than
a reader's working memory**. A reader detects the document's shape (§5.0), then — for
manifest-first documents — hydrates only the file's **manifest** plus the **sections** it
needs; for tail documents, reads article units in document order. In both shapes, a reader reads
each unit against its per-unit **witness** and never needs the whole file in memory at once: a
**consecrated** unit's bytes are verified byte-for-byte against its cryptographic (SHA-256)
witness, while a live **writing-room** unit carries a UTC-timestamp witness that records its place
in sequence but does not byte-verify until consecration (§6.7).

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
  selectively, no server, no JS). **This is what v0.5 specifies.**
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

**Shape detection is a byte-scan, not a DOM query** (§10 row V27). Both tests above MUST be satisfiable by a
single forward pass over the document's UTF-8 bytes, using the same quote-aware attribute
tokenizer as §6.4 and the same boundary-token grammar as §6.2: test 1 is satisfied by locating an
opening tag whose exact tag name is `nav` and whose quote-aware `id` attribute value is the
literal string `manifest` (§5.3); test 2 is satisfied by locating an opening tag whose exact tag
name is `article` and which carries a quote-aware `data-witness` attribute matching a valid-grammar
witness (§6.7) and a quote-aware `id` attribute matching the id production (§6.1). A reader MUST
NOT require a full HTML parse or a constructed DOM tree to perform shape detection; the byte-scan
that locates the `<nav id="manifest">` or `<article data-witness>` opening tag is the same
class of operation as the boundary-token matching in §6.2 — an exact-tag-name, quote-aware token
scan, never a substring search.

**The two shapes can be two epochs of one lifecycle.** For a document that folds (the
conversation-record lifecycle this section's tail shape was built for), the tail is the
**live epoch** and the manifest-first record is the **record epoch**: the fold (§8.4) is
the one-way, whole-document transition between them. Neither shape *requires* the
lifecycle: a tail MAY live and end as a tail (nothing obliges it to fold), and a document
that has never lived as a tail (e.g. a memory body maintained manifest-first from birth)
simply has no tail epoch. Shape detection (above) is unchanged: a reader detects the shape
the file has *now*, never the shape it once had or might later take.

### 5.1 The document

| Property | Rule |
|---|---|
| Form | MUST be a single, valid HTML file. |
| Encoding | MUST be UTF-8, declared in-band with `<meta charset="utf-8">` in `<head>`. |
| Sidecars | MUST NOT require companion manifests, schema URIs, or sidecar files. A sibling folder for what HTML itself calls for (`<img src>`, `<a href>`) is permitted but is not part of the single-file identity. |
| Embedded data islands | MUST NOT carry a JSON island in `<head>`, a `<script type="application/ld+json">` mirror, or a parallel binding file. |

All byte-level operations in §6 are defined over the document's UTF-8 bytes **as stored and
served**.

**Whole-document UTF-8 well-formedness (normative, pinned here before §9.1 names the
check).** The document MUST be well-formed UTF-8, in its entirety, as stored bytes — no
overlong encoding, no encoded UTF-16 surrogate (U+D800–U+DFFF), no codepoint above U+10FFFF, no
truncated multibyte sequence, no stray continuation byte, no invalid lead byte. A conforming
reader MUST validate this **before any other check** — before shape detection (§5.0), before the
whole-document `id` scan (§6.1, §9.1 `check_global_dup_ids`), before any inert-region masking
(§12) — over the whole file, not scoped to witnessed spans or comments: well-formedness is a
property of the file's bytes, not of where those bytes happen to fall relative to a boundary
token or a mask. A document containing an ill-formed UTF-8 sequence anywhere MUST be refused with
verdict `invalid UTF-8 at byte offset <N>`, where `N` is the zero-based offset of the **first
byte of the first ill-formed subsequence** — always the lead byte, never a later continuation
byte. A reader MUST NOT substitute (U+FFFD) for the bad bytes and continue, and MUST NOT decode
leniently and report whatever downstream hash or count mismatch the substitution happens to
cause: an unreadable byte is a refusal at the point of unreadability, not a defect left for some
later check to notice or not. A UTF-8 BOM (`EF BB BF`) at byte offset 0 is a legal, well-formed
encoding of U+FEFF and is not itself a defect; it is inert to every check this specification
defines.

This closes a pre-existing cross-reader divergence, not one introduced by this recension:
independent readers built from earlier revisions of this text disagreed on ill-formed UTF-8 — one
raising an unhandled decode exception at whichever internal call site first touched the bad
bytes, never producing a verdict string at all; another silently substituting U+FFFD and
reporting whatever downstream byte-count or hash mismatch that substitution happened to cause,
never naming the real defect — the identical input producing different failure shapes by reader
and by byte position, which §11.3's rule that every cross-reader divergence is a spec defect to
fix does not permit standing. This is a **Core** conformance requirement and a v0.5 boundary; it
is named among this version's Core changes in §14.

### 5.2 The section *(manifest-first shape only)*

An addressable unit of a manifest-first document.

| Attribute | Type | Required | Rule |
|---|---|---|---|
| element | — | REQUIRED | MUST be a `<section>` element. |
| `id` | ASCII id production (§6.1) | REQUIRED | Names the section for fragment addressing. REQUIRED on every `<section data-witness>`, nested or top-level (§6.1; row V34). The value MUST match the ASCII production (§6.1; row V33) and MUST be unique among live elements (§6.1; rows V5, V30). |
| `data-witness` | witness (§6.4) | REQUIRED | Fixes the section to its inner bytes. |
| `data-char-count` | count grammar (§6.6) | OPTIONAL | Unicode code-point count of the inner bytes (§6.6). Descriptive. When present, the attribute *string* MUST match the §6.6 count grammar (row V35). |
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
| Link collection | A reader MUST collect the links as the `<a>` **descendants** of the manifest nav, not as its direct children. An `<a>` that lies inside a §12 inert region (an HTML comment, most concretely) is **not** a manifest link and MUST NOT be collected — a commented-out example anchor inside `nav#manifest` is dead markup, not a third entry (R4a). |
| Extent | The manifest's extent runs from its opening `<nav id="manifest">` tag to the first `</nav>` close token found at or after that point that is **not itself inside a §12 inert region** — the identical masking test §12 already applies to boundary-token and manifest-link-collection scanning, extended here to the manifest's own close (R4b). A `</nav>` written inside an HTML comment that itself lies inside `nav#manifest` (e.g. a commented-out usage example naming the literal bytes `</nav>`) is not the manifest's real close and MUST NOT truncate it; a reader MUST NOT stop at the raw byte position of the first `</nav>` substring without first checking whether that occurrence is masked. A conforming document for which no unmasked `</nav>` exists at all is non-conforming: `FAIL: <nav id="manifest"> is unterminated`. |

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

**The Core/Append profile seam, named explicitly.** A `data-witness` on a tail article (like a
section witness) may be either epoch (§6.7). A **Core**-profile reader MUST classify the witness
by grammar and, for a consecrated (SHA-256) witness, recompute and compare it (§6.3); a Core
reader is under no obligation to validate a writing-room (timestamp) witness beyond its grammar —
in particular it MUST NOT enforce strictly-increasing document order. Enforcing that ordering,
resolving `data-supersedes`, and re-confirming append-only growth (§7.2) are **Append**-profile
(§11.1) obligations layered on top of Core, not Core obligations themselves. A tail document
composed entirely of writing-room witnesses is therefore fully readable and addressable by a
Core-only reader (which reports the distinct state named in §11.1's Append seam, never a bare
PASS on zero recomputed bytes); a reader that additionally enforces ordering and supersession is
claiming the Append extension. This is the same Core/Append boundary §11.1 states in the
profile roster below, restated here at its point of first relevance.

### 5.4 The manifest link *(manifest-first shape only)*

Shape:

```html
<a href="#id" data-witness="<witness>" data-char-count="<integer>"><span class="title">Title</span> <span class="summary">summary</span></a>
```

| Attribute / child | Required | Rule |
|---|---|---|
| `href` | REQUIRED | A fragment reference (`#id`) whose value matches the target section's `id`, and whose id part matches the §6.1 ASCII production (rows V33, V36). A link whose `href` is absent or does not begin with `#` is non-conforming and is **refused**, never dropped from the entry list (row V36). |
| `data-witness` | REQUIRED | MUST exactly equal the `data-witness` on the target `<section>`. A link carrying no `data-witness` is non-conforming and is **refused**, never dropped from the entry list (row V36). An attribute written valueless (`data-witness` with no `=`) or with an empty value (`data-witness=""`) is PRESENT for a presence test but its VALUE is the empty string — this rule requires a non-empty value, so both spellings count as MISSING and are refused identically to a wholly absent attribute (§9.1's falsy gate, not an `is None` gate). |
| `data-char-count` | OPTIONAL | Independent per carrier; when present, the attribute string MUST match the §6.6 count grammar (row V35). Where present on both link and section, the two MUST agree; absence on either is permitted and is not a failure. |
| `<span class="title">` | SHOULD | Human-readable title. |
| `<span class="summary">` | SHOULD | One-to-three-sentence summary; lets a reader decide whether to hydrate without loading. |
| `data-kind` | MUST NOT | A section's `data-kind` lives on the section, not the link (avoids a manifest-vs-section disagreement). |

Additional attributes on the link are permitted but carry no normative weight.

**Two conforming link-text forms.** The `<span class="title">`/`<span class="summary">`
children above are SHOULD-level. A **folded record** (§8.4) instead carries the unit's
**gist** as the link's plain text content — a human-readable routing line minted at
append time or derived from the unit's inner text. The format bounds neither its length
nor its form (the reference tooling's own *minted* defaults are single short lines — a
documented tool bound, §8.4, never a conformance surface; an authored gist may be any
text its carrier encodes). Both forms are conforming; in both, the
link text exists to let a reader decide whether to hydrate without loading (§7.1).

**The disclosure.** The manifest's link text is **authored routing**; positive authority
about content begins after hydrating and verifying the witnessed record. This sentence is
normative prose, not mechanism: nothing in Core verification certifies that link text
corresponds to the unit it routes to — the correspondence is a producer discipline (the
reference tooling derives gists from unit content and lints divergence; §8.4), and a
reader's trust in it is trust in the producer, not in a checked property of the file. Link
text remains subject to §7.3's existing law, unchanged: "point, don't declare" already
forbids every routing surface — manifest entries included — from declaring a verdict on
the document's own truth, completeness, or verification status. This disclosure adds
nothing to that law, and no v0.3 document's conformance changes.

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

A section `id` is **normative**, and the production is **ASCII, byte-exact**:

```
id    := start cont*
start := [A-Za-z_]
cont  := [A-Za-z0-9_.:-]
```

- MUST begin with an ASCII letter (`A`–`Z`, `a`–`z`) or an underscore.
- MUST continue with zero or more ASCII letters, ASCII digits (`0`–`9`), hyphens, underscores,
  periods, or colons.
- Numeric-only ids, ids beginning with a digit, ids containing whitespace, and ids containing
  any byte outside this set — **including any non-ASCII byte** — are **non-conforming**.

(This is close to, but deliberately not identical to, XML's NCName: this production permits the
colon, which NCName forbids. It is also narrower than NCName in the other direction — NCName
admits non-ASCII name characters and this production does not; the ground for that narrowing is
stated next.)

**The ground: a production a reader can evaluate (normative).** The production above is stated in
ASCII bytes and nothing else, so that a reader holding only this file, a text editor, and SHA-256
can decide any id by inspection — the capacity §3 says the format requires and no more, the Tier 0
property of §5.6, and the assertion of row V12. The prior formulation of this production — "a
letter (Unicode category L)", "digits (category Nd)" — is **not evaluable on those terms**:
category membership is a property of a *versioned* Unicode table that this specification does not
carry, does not pin, and cannot derive from the document's bytes, so two readers built
independently from this text alone could lawfully disagree about whether the same document
conforms. That is precisely the verifier-chosen equivalence class §6.5 forbids at the witness,
arriving instead through the address; and it is the same cost §9.2a refuses when it keeps a
conforming reader a byte-scanner rather than dragging a full HTML parser into the trust base. A
table is a parser by another name.

Accordingly, this production **REVOKES** the permission the prior text granted to non-ASCII
letters. An id such as `émile`, conforming under v0.4, is **non-conforming** under this version:
a conforming reader MUST refuse the document that carries it, naming the production. This is a
**Core** conformance change with a version boundary, and it is stated as such in §14 — it is not
a clarification and it is not additive. This specification pins **no** Unicode version for ids,
and after this recension it needs none.

**One id names one live element.** If two live elements share an id, a conforming reader MUST
fail closed (§7.3) — it MUST NOT silently resolve to one twin and bless the document.

**Scope of "live element" (normative, pinned here before §9.1 names the check).** The
uniqueness rule is not scoped to witnessed units alone. A **live element** is any element in the
document's rendered surface that carries an `id` attribute — this includes, without limitation:
top-level `<section data-witness>` or `<article data-witness>` units, **nested** `<section>`
elements (witnessed or not — §5.2 permits section nesting, and a nested element's `id` still
occupies the same document-wide id space a fragment reference `#id` resolves against), manifest
`<a href="#id">` link targets, and any `id`-bearing `<img>` or other addressable element under
§5.5 (Vessel and image addressing — images MAY carry stable `id` attributes, making them
addressable by fragment on the same terms as a section). The rule is a **property of the whole
document's id space**, not a per-tag-name or per-witnessed-unit rule: a `<section id="x">` and an
`<img id="x">` collide exactly as two `<section id="x">` elements would, because both attempt to
name the *same* live element for fragment addressing (§6.1's opening sentence: "one id names one
live element" — it does not say "one id names one section"). A conforming reader's dup-id check
(§9.1) MUST therefore walk every opening tag in the document (outside inert regions, §12), not
only the addressable-unit opening tags its shape-specific unit-discovery scan visits.

**The production binds that same scope.** The ASCII production above is a rule about the
document's id space, not about addressable units alone: **every** live element in the scope just
named — top-level unit, nested `<section>` (witnessed or not), manifest-link target, `id`-bearing
`<img>` under §5.5, an `append-anchor` under §5.3b — carries an `id` that MUST match it, and a
conforming reader's production check runs over the same whole-document walk its dup-id check runs
over (§9.1 `check_global_dup_ids`; row V33). A reader that validates the production only on the
addressing paths it happens to traverse enforces a narrower rule than this section states.

**A valueless `id` is an empty id, not an absent one.** An `id` attribute written with no value
at all (`<div id>`, no `=`) is, like any valueless attribute (§6.4), PRESENT — the whole-document
walk sees it, distinct from an element carrying no `id` attribute whatsoever, which the walk does
not visit at all. Its VALUE coalesces to the empty string, the identical byte-shape `id=""`
already produces, and the production above refuses both alike (the production's `start` symbol
requires at least one ASCII letter or underscore; the empty string satisfies neither). A reader
that skips a valueless `id` — treating "no value" as if it were "no attribute" — enforces a
narrower rule than this section states; the distinction is a documented design decision of
this recension (its R1a amendment), not an incidental reader behaviour.

**A witnessed nested section carries an id (normative, pinned here before §9.1 names the
check).** A nested `<section>` carrying `data-witness` is an addressable unit: its `id` is
REQUIRED (§5.2) and subject to the production above. A witnessed nested section **without** an
`id` is non-conforming, and a conforming reader MUST refuse it — it MUST NOT be skipped, dropped
from the unit count, or absorbed by a duplicate guard, and a `data-witness` that would otherwise
recompute correctly does **not** rescue it: the refusal is on the missing address, not on the
arithmetic (row V34). A `<section>` **without** `data-witness` is structural: it is not
recomputed and — except for the id production and the dup-id rule above, which bind every live
element that carries an `id` — is not checked. §9.1's nested loop states the order in which a
reader applies these (witness presence, then `id` presence, then the production, then the
already-verified skip); that order is normative for behavior, and mis-ordering it is how an
unverified witnessed unit slips past a reader.

### 6.2 The witnessed bytes

The witnessed bytes of an addressable unit (a `<section>` in manifest-first shape, an
`<article>` in tail shape — collectively "the addressable element") are **exactly** the literal
bytes between the `>` that ends the addressable element's opening tag and the `<` that begins
its own closing tag — the **raw inner span, UTF-8, untrimmed**. No leading or trailing newline
is added or removed before the witness is computed or checked.

**The boundary-token grammar (normative, exact).** Let *TAG* be the tag name of the addressable
element (`section` for manifest-first, `article` for tail). A byte sequence is an **open token**
for *TAG* if and only if it is the literal bytes `<` followed by *TAG* (case-sensitive, lowercase)
followed by exactly one of the **five ASCII whitespace bytes** — `0x09` TAB, `0x0A` LF,
`0x0C` FF, `0x0D` CR, `0x20` SPACE — or `/` (`0x2F`), or `>` (`0x3E`) — and no other byte. This
enumerated byte set (seven named bytes, not a class named "whitespace" and left to an engine to
define) is pinned identically in both readers (`_BOUNDARY_NEXT`/`_classify_boundary_token` in
verify.py, `WS_SLASH_GT`/`classifyBoundaryToken` in verify.mjs, §9.1).

**Ruled 2026-08-22 (Operator sitting): `0x0B` VT is REMOVED from this set.** The set carried six
whitespace bytes until that ruling, VT among them. VT is not HTML5 whitespace anywhere, and the
position this grammar governs is precisely the one where that matters: a browser's tag-name state
**appends** VT to the tag NAME, so `<section\x0bid="x">` opens an element named `section\x0b`
and a `<section>` element is never produced at all. A reader that treated VT as a boundary was
calling that byte sequence an open token and reading bytes a browser reads differently — **what
is verified must be what is read** (the governing principle), the identical ground on which the same
sitting narrowed §6.4's attribute-separator set to HTML5's five. **Stated plainly, this is what
the ruling does:** VT folds into the tag name, `<section\x0b…>` is not an open token, and the
element therefore **does not exist to the reader** — not "exists but carries no `id`", which is
what both readers did before the ruling. It does not exist to a browser either, and that is the
point. The two sets — this one and §6.4's — now rest on the **same** HTML5 five; the brief
inversion between them, disclosed here on 2026-08-22 before the second ruling closed it, is gone.

The remaining ground for pinning the set by enumeration is unchanged: the boundary-token grammar
operates on raw bytes at the tag-name/next-byte join, where HTML5 itself only ever permits an
ASCII whitespace character (or `/`, or `>`) to follow a tag name before its first attribute, so a
non-ASCII separator here is not a browser-legal construct and this grammar does not admit one.

**Residual, disclosed and NOT ruled — the close-tag near-miss discriminator.** The NON-CANONICAL
rule below asks a *different* question at a different position: given a byte sequence shaped like
`</TAG…>`, is it a near-miss close tag (refuse it, `NON-CANONICAL`) or a longer tag name sharing
*TAG* as a prefix (ordinary content, no boundary at all)? Both readers decide that with a
**six**-byte set that still admits `0x0B` VT, so `</section\x0b>` is refused as `NON-CANONICAL`
rather than passed over as content — whereas a browser reads `section\x0b` as an end-tag NAME and
ignores the tag entirely. The 2026-08-22 sitting ruled the OPEN set; this position was not before
it. It is left as written deliberately: keeping VT here keeps the byte sequence a **refusal**
rather than a silent skip, which is the fail-closed direction, and it is measured byte-identical
on both reference readers **and** on the sealed `dev` pair (`FAIL: NON-CANONICAL — off-grammar
boundary token for <section> at byte offset N`, rc=1, all four). Recorded for a future sitting,
not relied upon.

This is an **exact tag-name match**, not a prefix match: the open-token test MUST NOT
match on a shared prefix followed by any other byte. `<section-foo>` is therefore **not** a `<section>` open token
— the byte immediately after `section` is `-`, which is none of `{whitespace, /, >}` — and a
reader MUST NOT treat it as a boundary of any kind (it is ordinary content, subject to the
content-profile prohibition below). A byte sequence is a **close token** for *TAG* if and only if
it is the literal bytes `</` followed by *TAG* followed by `>` with **zero interior whitespace or
other bytes** — i.e. exactly `</section>` or exactly `</article>`. This is the **canonical**
closing-tag serialization; it is the only serialization the depth-walk below recognizes as a
close token.

**Finding the addressable element's own closing tag.** When the element contains no nested
element of the same *TAG*, its closing tag is the next close token for *TAG*. When elements of
the same *TAG* nest (only relevant for `section`, since §5.3b prohibits nesting of witnessed
articles), the element's own closing tag is found by a **depth-walk**:

1. Start at the byte just after the opening tag's `>`. Set `depth = 1`.
2. Scan forward for the next open token or close token for *TAG*, per the boundary-token grammar
   above.
3. Each open token increases `depth` by 1; each close token decreases it by 1.
4. The element's own closing tag is the close token that returns `depth` to 0.
5. The witnessed bytes run from the byte after the opening tag's `>` to the byte before that
   depth-zero close token's `<`.

The depth-walk and the unit-discovery scan that locates a witnessed unit by `id` (§7.1) MUST use
the identical boundary-token grammar — a reader MUST NOT apply the exact-tag-name rule in one
scan and a looser (e.g. prefix or word-boundary) match in the other. Both are byte-token scans;
neither requires an HTML tokenizer or parser in the trust base.

**HTML comments and raw-text elements are inert in this walk.** Any open token or close token for
*TAG* appearing inside a `<!-- ... -->` comment, or inside the raw-text content of a `<script>` or
`<style>` element, MUST NOT be counted and MUST NOT match a boundary. (Comment and raw-text bytes
that fall inside the inner span are still part of the witnessed bytes; they are skipped only for
the purpose of matching boundary tokens.) §12 states the general inert-region definition this rule
instantiates.

**The NON-CANONICAL verdict.** A boundary-adjacent token that is legal, browser-parsed HTML but
does not match the exact grammar above — most notably a close tag carrying interior whitespace,
such as `</section >` (a space before `>`; §10 row V22), or a custom-element tag name sharing
*TAG* as a prefix, such as `<section-foo>` appearing where a boundary was expected (§10 row V23)
— is **not** a boundary token and MUST NOT be reported as "unterminated" or any variant implying
the element has no closing tag. Instead, a conforming reader MUST refuse the document with the
distinct verdict **`NON-CANONICAL`**, and that refusal MUST carry a **required byte offset**: the
zero-based byte position, within the document's UTF-8 byte stream, of the first byte of the
off-grammar token that triggered the refusal. `NON-CANONICAL` is a refusal outcome under
fail-closed (§7.3), not a pass with caveats and not a new equivalence class — §6.5's
zero-equivalence-classes rule for comparison is unaffected; `NON-CANONICAL` names why the reader
stopped, it does not relax what counts as a match.

The witness arithmetic — SHA-256 over the raw, untrimmed inner span as UTF-8; char-count =
code points of that same slice — is identical for both shapes. The tag name is the only
parameter.

### 6.3 The witness is computed, not trusted

For a **consecrated** witness (§6.7), a conforming reader MUST recompute the SHA-256 of the inner
bytes (§6.2) and compare it against the stored `data-witness` digest; it MUST NOT take the stored
hex as given. A **writing-room** witness (§6.7) carries a UTC timestamp, not a digest: it is
validated by grammar — and, under the Append profile (§11, V15), by strictly-increasing document
order — and MUST NOT be hash-recomputed. Recomputing it, or failing a live document merely for its
non-recompute, is itself non-conforming.

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

Within an element's start tag, attributes are `name` or `name=value` pairs separated by a
**separator byte from the enumerated set below** — not "ASCII whitespace" left to an engine's own
`\s` (or any other unpinned character class) to define. The **separator set** is exactly these
**five codepoints — HTML5's whitespace, and nothing else** (R8, ruled 2026-08-22; identical on
both readers — `_ATTR_SEP` in verify.py, `ATTR_SEP` in verify.mjs):

| Codepoint | Name |
|---|---|
| `U+0009` | TAB |
| `U+000A` | LF |
| `U+000C` | FF |
| `U+000D` | CR |
| `U+0020` | SPACE |

**This set is exactly what an HTML5 parser accepts here — that is the point of it.** The WHATWG
tokenizer's before-attribute-name state treats exactly four codepoints as whitespace — TAB
(`U+0009`), LF (`U+000A`), FF (`U+000C`), SPACE (`U+0020`) — plus CR (`U+000D`), which
input-stream normalization folds into LF before the tokenizer ever sees it. Those five are the
set above, and they are HTML5's whole accounting.

**Ruled 2026-08-22 (Operator sitting): narrowed to HTML5's five; a codepoint outside this set,
appearing within a tag where a separator was intended, is not a separator.** The set this
specification carried until that ruling was 25 codepoints — the JS engine's `\s`, frozen by
enumeration (R8) so that neither reader borrowed a live, unpinned engine table. That freeze was
correct as far as it went: it closed the cross-*reader* skew. It did not close the
reader-vs-*browser* gap, and the ruling closes that. The other twenty codepoints of the JS class —
`U+000B` VT, `U+00A0` NBSP, `U+1680` OGHAM SPACE MARK, `U+2000`–`U+200A`, `U+2028`/`U+2029`,
`U+202F`, `U+205F`, `U+3000`, `U+FEFF` — are not whitespace to a browser's tokenizer at all: each
one instead *begins* the following attribute NAME. A reader that accepted them as separators was
reading a tag differently from every browser that would render the same bytes, and **what is
verified must be what is read** (the governing principle). The ruling resolves that in favour of the
tokenizer the document will actually meet.

**What this means for a tag containing a non-member, stated plainly.** Nothing is refused *for
being* a non-member; the non-member is simply not a boundary, so the attribute-name production
below runs straight through it. In `<b data-x="y"⟨U+2028⟩id="intro">` the tag carries exactly two
attributes, `data-x` and one literally named `⟨U+2028⟩id` — there is **no `id` attribute on that
element at all**, to either reference reader or to a browser. Whatever that hidden `id` would have
triggered had it been visible — the §6.1 production check, the whole-document uniqueness check —
is not triggered, because the carrier does not exist. The same holds for `<section
id="intro"⟨U+FEFF⟩data-witness="…">`: the section carries **no `data-witness`**, its name having
been absorbed, and a witnessed-unit opener that carries no witness is refused on that ground (the
verdict names the missing witness, not the codepoint). Both outcomes are byte-identical on both
reference readers, and both are what a browser reads. The direction of the change is worth naming
honestly: for the `id` case the ruling is a **loosening** — a document whose only defect hid
behind a non-member separator now verifies, because there is no longer a defect for any reader to
see — and this is the intended consequence of aligning with the tokenizer rather than a
concession.

The **corollary rule about where the separator decision is made** follows from the same ruling and
is normative: a conforming reader MUST NOT make a whitespace decision anywhere else in its tag
handling — no `\s`-class skip between the tag name and the first attribute, no engine-defined trim
of an attribute blob. The set above is consulted in exactly one place, the production below. A
reader that skips a whitespace *run* at the tag-name/attribute join with a second, differently
defined class will disagree with itself (and with the other reader) about where the first
attribute name begins the moment that run contains a non-member.

No other codepoint is a separator under this production — in particular `U+000B` VT, `U+00A0`
NBSP, `U+2028` LINE SEPARATOR, `U+FEFF` BOM, `U+180E` MONGOLIAN VOWEL SEPARATOR, `U+200B` ZERO
WIDTH SPACE, and `U+2060` WORD JOINER are **not** members, and a byte sequence using one of them
where a separator was intended is absorbed into the adjacent attribute NAME (or content), not
recognized as a boundary (fixtures `r8-ruled-sep-u2028.doc.html` and its ASCII-space control
`r8-ruled-sep-space-control.doc.html` pin the two directions against each other;
`r6-sep-nbsp.doc.html`, `r6-sep-nbsp-mid-attrs.doc.html`, `r6-sep-u2028.doc.html` and
`r8-noncanonical-sep-ufeff.doc.html` are the same rule read on four other inputs).

**§6.2's boundary-token OPEN set is a different set answering a different question — and it now
rests on the same five bytes.** §6.2 governs which byte may FOLLOW a tag name for the sequence to
count as an open token; this section governs which codepoint SEPARATES one attribute from the
next. They are distinct productions at distinct positions, and §6.2's admits `/` and `>` besides.
Until 2026-08-22 §6.2's set also admitted `0x0B` VT, which this set never did — an inversion
disclosed here for the few hours it existed. The **second ruling of the same sitting** removed VT
from §6.2 on the identical ground (a browser's tag-name state appends VT to the tag NAME, so
`<section\x0b…>` yields no `<section>` element), and the whitespace ground of the two sets is now
one ground: HTML5's five. Measured consequence, byte-identical on both reference readers:
`<section\x0bid="x">` is **not an open token**, so the element is not found at all — where before
the ruling it was found and read as carrying an attribute named `\x0bid` and therefore no `id`.
§6.2 records one remaining residual of its own, at the close-tag near-miss discriminator; it is
disclosed there, not here.

**The attribute-name production.** An attribute NAME runs from the first byte that is not a
member of the separator set above to the first byte that is either a member of the separator set,
`=`, `"`, or `'` — whichever comes first. This is exactly what both readers' tokenizers do
(`_attrs` in verify.py, `parseTagAttrs` in verify.mjs), and it is what makes a separator's
non-membership consequential: a codepoint that is not in the set does not end the name scan, so
it is silently absorbed into the name rather than recognized as a boundary.

**Attribute names are case-folded (normative — distinct from tag names, §6.2).** Once an
attribute NAME has been scanned by the production above, a conforming reader MUST fold it to
lowercase using ASCII case-folding (`.lower()` in Python, `.toLowerCase()` in JS) before that
name is used for ANY comparison — duplicate-name detection (§10 rows V25/V37/R6c) and value
lookup alike (`ID` and `id` are the same carrier: `<img ID="a">` and `<img id="a">` name the
identical attribute to the reading side). This is the attribute-NAME rule; it is unrelated to
and does not loosen §6.2's tag-name open/close-token grammar, which stays **case-sensitive**
(`<section>` and `<Section>` are different byte sequences to the boundary-token walk; only tag
NAMES are matched that way, never folded). A duplicate-attribute-name verdict (R6c) names the
already-folded form: `duplicate attribute name '<name>' in tag at byte offset <N>` reports
`<name>` lowercase regardless of which of the colliding occurrences' original casing triggered
it.

A conforming reader MUST tokenize **quote-aware**: a quoted value runs to its
matching quote character, and a `name=` sequence appearing *inside* another attribute's quoted
value is part of that value, not a separate attribute. A reader that matches attributes with a
naïve substring or unquoted regex can be fooled by an `id=` or `data-witness=` string embedded
in another attribute's value; the quote-aware rule is REQUIRED so the real `id` and
`data-witness` cannot be impersonated.

**Presence is not the same test as a non-empty value.** An attribute written with no value at
all — `data-witness`, with no `=` — is **PRESENT**: the tokenizer records it (as `None`/`null`,
distinct from the attribute never having been written), and a presence test (`'data-witness' in
attrs`) is satisfied. Its **VALUE**, however, is the empty string. These are different tests
with different outcomes on the same byte-shape, and this specification uses both, in different
places, on purpose:

- **Presence-gated rules that additionally require a non-empty value** — the manifest link's
  REQUIRED `data-witness` (§5.4, R4), REQUIRED `id` (§5.2, §5.3b) — refuse a valueless attribute
  exactly as they refuse a wholly absent one. The falsy-coalescing gate (`attrs.get(name) or ''`,
  then test for empty) does this uniformly: valueless and `name=""` both coalesce to the empty
  string and both are **REFUSED**.
- **Shape detection (§5.0) is a pure presence-and-classify test, not a presence-and-refuse
  test.** Test 2 (tail shape) asks whether at least one `<article data-witness>` exists whose
  `data-witness` **matches a valid-grammar witness** (§6.7). A valueless `data-witness` carries
  no value to classify, so it trivially fails that match — the article does not count toward
  tail-shape qualification, and the reader moves on to the next `<article>` (both readers
  implement this as a `continue`, not a branch into §6.7's invalid-witness-grammar refusal). This
  is a **skip**, not a refusal: the byte-shape is not itself non-conforming, it simply supplies no
  witness for this test. If no qualifying `<article data-witness>` remains after the scan, shape
  detection as a whole FAILS (§5.0) — but that is shape detection exhausting its candidates, not
  this one attribute being refused.

`id=""` is a third, distinct byte-shape from both: a non-empty-presence test and a non-empty-value
test both see it, and the §6.1 id production is what refuses it.

**Double-quoted attribute values are REQUIRED on witnessed-unit opening tags** (§10 row V24). On
the opening tag of an addressable element (`<section>` in manifest-first shape, `<article>` in
tail shape), every attribute that carries a value (`id`, `data-witness`, `data-char-count`,
`data-kind`, `data-supersedes`, and any other `name=value` pair) MUST use the double-quote form
(`name="value"`). Single-quoted (`name='value'`) and unquoted (`name=value`) attribute values on
a witnessed-unit opening tag are **NON-CANONICAL**; a conforming reader MUST refuse such a
document with the `NON-CANONICAL` verdict and a required byte offset (§6.2), not silently accept
an alternate quoting as equivalent. This closes the single canonical serialization the
Producer-profile (§9.2a) commits to emitting.

**Duplicate-attribute refusal** (§10 row V25). If the same attribute name appears more than once
on a single opening tag of an addressable element — whether both occurrences use the same
quoting or not — the tag is non-conforming, independent of whether the two values agree, and a
reader MUST NOT silently prefer the first occurrence, the last occurrence, or any other
resolution rule. **In practice this is observed as V37's verdict, not V25's own wording**: the
whole-document opening-tag walk described two paragraphs below visits every opening tag
(addressable-unit openers included) and runs before shape dispatch, so it refuses a duplicated
attribute name — `duplicate attribute name '<name>' in tag at byte offset <N>`, at the tag's own
`<` — before the shape-specific unit-discovery code that carries V25's distinct `NON-CANONICAL …
(§6.4, V25)` wording is ever reached for that tag. Row V25 is retained for the underlying rule
(a duplicated attribute name on an addressable-unit opener is non-conforming) but is unreachable
as an independently-observable verdict; see the row's own note in §10 and V37's R6c amendment.

**The whole-document opening-tag walk is quote-aware, anchored, and refuses an unparseable tag
(normative; pinned here before §9.1 names the check).** §6.1's dup-id check and its ASCII-production
check (§9.1 `check_global_dup_ids`) both walk **every** opening tag in the document, not only the
addressable-unit opening tags this section's double-quote and no-duplicate-attribute rules bind.
That walk MUST locate each candidate tag by its own `<` and parse it **anchored exactly there** —
not by a document-wide search that silently resynchronizes at whatever later tag happens to parse
when a candidate fails. The separator between a tag's name and its attributes is **not** a
whitespace class; it is decided entirely by exclusion: the attributes span is a repetition of a
double-quoted span, a single-quoted span, or any single byte that is none of `< > ' "`, and
whitespace — ASCII or otherwise — falls into that same catch-all branch identically to any other
ordinary byte, with the actual whitespace-vs-not decision deferred entirely to the attribute
tokenizer this section already specifies. A tag name followed directly by `>` or `/` with no
attributes at all is a valid, zero-length match of that same span.

An opening tag whose attribute quote is **unterminated** — a `"` or `'` that opens and is never
reachably closed before the walk would otherwise have to accept a bare `<` or `>` byte as
ordinary tag content — is **unparseable**, and a conforming reader MUST refuse the document
rather than silently skip the tag or resynchronize past it: verdict `unterminated attribute quote
in tag at byte offset <N>`, where `N` is the zero-based byte offset of the malformed tag's own
`<`. This is distinct from `NON-CANONICAL` (§6.2, above): `NON-CANONICAL` names a tag that parses
cleanly but does not match the canonical grammar; this verdict names a tag the reader cannot
parse at all, and it applies regardless of which attribute on the tag carries the unterminated
quote — `id`, `data-witness`, or any other. Ordinary text that merely begins with `<` followed by
a letter, with no quote ever opened before the next `<` or end of file — `a<b` in prose, one tag
immediately followed by another with nothing between them — is not a candidate this rule reaches:
it was never a well-formed opening tag to begin with, and refusing it would turn ordinary prose
into a false-positive FAIL, which this rule does not do.

**The walk also refuses a duplicated attribute name on any opening tag it visits, not only
addressable-unit openers (row V37).** A duplicated attribute name resolves, in the quote-aware
tokenizer this section already specifies, to a single last-wins value with no trace a second
occurrence ever existed — the same "unparseable-by-one-reading" defect the double-quote and
no-duplicate-attribute rules above refuse on a witnessed-unit opening tag (§10 rows V24/V25), but
here extended to every opening tag this walk's `id` check already visits (`<img>`, an
append-anchor, a nested `<section>`, or any other live element), before that tag's `id` is ever
read: verdict `duplicate attribute name '<name>' in tag at byte offset <N>`, `N` = the offset of
that tag's own `<`, `<name>` case-folded exactly as this section's tokenizer already folds
attribute names for value resolution.

### 6.4a The content-profile prohibition (distinct from the boundary-token grammar)

The boundary-token grammar of §6.2 governs what counts as an *open* or *close* token when
walking the byte stream to find an addressable element's own closing tag. It is a **separate**
rule from the one stated here, which governs what content is permitted to appear, unmasked,
*inside* an already-delimited witnessed span.

**The rule** (§10 row V26). A witnessed span (the inner bytes of a `<section>` or `<article>`
addressable element, as delimited by §6.2) MUST NOT contain, outside an inert region (§12), any
content element whose tag name is exactly `section` or exactly `article` **followed immediately
by** one of the three characters `-`, `.`, or `:` (for example `<section-foo>`, `<article.x>`,
`<section:widget>`). Such an element, when it appears unmasked inside a witnessed span, is
refused with the `NON-CANONICAL` verdict and a required byte offset (§6.2) pointing at the first
byte of its opening tag.

**Why this is a distinct rule.** This prohibition is caught by **neither** the boundary-token
grammar of §6.2 **nor** the closing-tag count guard a Core reader implements over that grammar:

- The boundary-token grammar (§6.2) governs matching an *open*/*close* token to walk depth; an
  element such as `<section-foo>` is correctly recognized as *not* a `<section>` open token (the
  byte after `section` is `-`, not whitespace/`/`/`>`) and is therefore, correctly, never treated
  as a boundary at all — it is ordinary content to that rule, and the boundary-token grammar has
  nothing further to say about it.
- The count guard tallies close-token literals against the depth-walk's own expectation; an
  element like `<section-foo>...</section-foo>` (or a self-closing `<section-foo/>`) introduces
  no `<section>`-exact open or close token at all, so it changes neither side of the count-guard's
  tally and passes the count guard undetected.

Because both existing checks are silent on it, this content-profile prohibition MUST be enforced
as its own, explicit rule — a reader that implements only the boundary-token grammar and the
count guard has **not** yet enforced §6.4a and is not conforming with respect to it.

**Comment-masking exemption.** An occurrence of a prohibited tag name inside a `<!-- ... -->`
comment, or inside the raw-text content of a `<script>` or `<style>` element, is an inert region
(§12) and is exempt from this prohibition — it is prose/data bytes, not a content element, to a
browser and to a conforming reader alike.

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
and MUST NOT be the raw byte length. That is the attribute's **value**; the paragraph below fixes
its **spelling**.

**The count grammar (normative).** `data-char-count` is carried as an attribute *string*.
Wherever the attribute appears — on a `<section>` (§5.2), on an `<article>` (§5.3b), or on a
manifest link (§5.4) — that string MUST match, byte-exact:

```
count := "0" | [1-9][0-9]*
```

ASCII decimal digits and nothing else: no sign (`+120`, `-0`), no leading zeros (`0120`), no
separators (`1_20`, `1,20`), no leading or trailing whitespace (`" 120"`, `"120 "`), no radix
prefix or alternate radix (`0x78`), no non-ASCII digits (the fullwidth `１２０` is not this
grammar), and no trailing junk (`120abc`). The attribute's value is the decimal number the
matched string denotes.

**Presence is presence.** The check bites whenever the attribute is *present*, not whenever it is
non-empty: `data-char-count=""` is a present attribute whose string is the empty string, the
empty string does not match the grammar, and the document is therefore non-conforming. Absence of
the attribute remains OPTIONAL and is unaffected (§5.2, §5.3b, §5.4).

A `data-char-count` string outside this grammar is non-conforming, and a conforming reader MUST
refuse it (§7.3 fail-closed), naming the grammar. It MUST NOT best-effort parse a prefix (`120abc`
is not `120`), MUST NOT accept a locale-, radix-, or width-variant spelling, and MUST NOT treat an
unreadable count as an absent one: a count a reader cannot read is a **refusal**, not a skipped
check (row V35; §9.1's `parse_count`). This is the same discipline §6.5 pins for the witness,
applied to the descriptive carrier — a document that says something a reader cannot evaluate has
not said nothing.

All four carriers of `data-char-count` — the manifest link (§5.4), the top-level `<section>`
(§5.2), a nested `<section>` (§5.2), and a tail `<article>` (§5.3b) — are parsed under this same
grammar, by the same `parse_count` (§9.1): a manifest link's own count is grammar-checked
directly at the point it is read, not only transitively via its equality against a section's
count when the section also carries one.

### 6.7 The two epochs of the witness

The `data-witness` slot carries one of two **formally disjoint** grammars. The form alone names
the epoch; a reader MUST recover the epoch from the form, never by guessing.

| Epoch | Grammar (regex) | Meaning |
|---|---|---|
| **Consecrated** | `\A[0-9a-f]{64}\z` | A SHA-256 digest (64 lowercase hex). Fixes the section's bytes for all time. The integrity epoch. |
| **Writing-room** | `\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\z` | A UTC timestamp, exactly the 20-character form `YYYY-MM-DDTHH:MM:SSZ`. An ordinal recording a live entry's place in a sequence. The live epoch (e.g. a chat tail before sealing). |

The writing-room form is **specific**, not ISO 8601 in general: fractional seconds, non-`Z`
offsets (`+00:00`), and basic-format timestamps (`20260527T143214Z`) are all non-conforming.

**Full-string match (R9), same discipline as §9.1's `valid_id`.** `\A`/`\z` above are absolute
string boundaries, not line boundaries; §9.1's `valid_id` comment states, once, why a bare
`^…$` is not a safe spelling of that in every engine (Python `re.match`, .NET, PowerShell all
let `$` match immediately before a trailing newline) and what each engine's true full-string
form is — the identical requirement governs both witness grammars above, not only the id
production.

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

**A tail whose articles carry a mix of these two epochs, or carry writing-room witnesses
exclusively, requires a verdict that names which register was actually checked — see §7.3a (the
`ORDINAL-ONLY` verdict and the scoped `PASS (verified=m, ordinal=k)` form). In particular: a tail
with zero consecrated witnesses MUST NOT be reported as a bare `PASS`, no matter how many
writing-room witnesses are grammar-valid and correctly ordered.**

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
the harness and task.

**Tail shape.** A tail document has no summary skim-layer. A reader discovers addressable units
by scanning for `<article data-witness>` elements in document order (no manifest to read first).
Reading a large tail document therefore requires loading it in document order; there is no
selective-skim shortcut. This is a known cost named in §12, and the fold (§8.4) is its remedy: folding the tail mints
the summary skim-layer the tail lacks. The witness recompute (§6.2, §6.3) is identical to the
manifest-first path.

**The recency window (folded records; Append profile, RECOMMENDED).** The default reading
posture for a folded record is: (1) read the manifest's gist column in full — it is bounded by
turn count, not turn size; (2) hydrate the last *N* **candidate-current** units in full (the
recency window), where a unit is candidate-current iff no later unit's `data-supersedes`
names it (§8.2) — a **routing computation over an un-witnessed edge** (see "Currency is
routing, not testimony", below), which is why the constraint that follows is part of the
posture, not an afterthought; (3) hydrate anything older on demand by `#id`, verifying each
hydrated unit's witness. **The safe-reader rule:** because the edge is un-witnessed, a
reader adopting this posture MUST NOT let it silently *exclude* a witnessed unit from what
the reader (or the model behind it) is told exists. Supersession-guided routing may choose
what is hydrated *first*; where an edge nominates a head over a superseded unit, the reader
either (a) verifies a supersession statement carried in the units' **sealed content**, or
(b) presents the nominated head with its currency marked **uncertified** and the superseded
unit still addressable in the skim, or (c) refuses to choose. An edge that quietly removes
a witnessed turn from model-visible context has been given the authority of testimony, and
it has none. Current-head computation over `data-supersedes` chains is §8.2's **existing**
law — the reader, not the substrate, computes the winner, and superseded bytes remain
addressable and citable *as history*; this posture adds no new conformance requirement on
top of it. The window size *N* is a reader/harness choice, not a format constant; the whole
discipline is RECOMMENDED reading posture, not a Core conformance requirement. No
token-economy claim attaches to it (the existing §7.1 disclaimer governs).

**Currency is routing, not testimony.** `data-supersedes` lives on the unit's opening tag,
outside every witnessed span. A retargeted edge — one valid turn pointed at another valid
turn — changes the current-head mapping while every checker stays green (reproduced
firsthand on the live record, 2026-07-16). The current-head computation is therefore an
**un-witnessed routing result**: a reader MAY use it to choose what to hydrate; under
this posture a reader MUST
NOT present a unit as the current word on the edge's authority alone — the witnessed ground
is the hydrated units themselves and whatever supersession statements their sealed content
carries. v0.4 **discloses** this boundary rather than moving it; witnessing the edge
in-span (so a retarget breaks a SHA-256) is a named candidate for a future version, since
it changes the append grammar (§4 item 8).

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

### 7.3a The ORDINAL-ONLY verdict

A tail document (§5.3b) MAY hold a mix of the two witness epochs (§6.7) across its articles: some
consecrated (SHA-256, byte-recomputed), some writing-room (UTC timestamp, ordinal-only). A
conforming reader's verdict MUST name which register it actually checked:

- **Zero consecrated witnesses, at least one grammar-valid writing-room witness.** This is a tail
  where every article is still live — nothing has ever been consecrated. The ordinal register
  (sequence, grammar; and, under the Append profile, strict increase) is fully checkable and MUST
  be checked, but **zero bytes have ever been recomputed**. A conforming reader MUST NOT report a
  bare `PASS` for this case — doing so would fold the ordinal register into the byte-integrity
  register the format's PASS verdict has always meant. Instead the reader MUST report the distinct
  verdict **`ORDINAL-ONLY`**: the sequence was verified; no content byte was. This is a refusal
  outcome for the purposes of an automated gate (a caller checking for `PASS` alone MUST treat
  `ORDINAL-ONLY` as not-PASS), reported with its own name rather than folded into the ordinary
  non-vacuity `FAIL` (§7.3) — the two are distinguishable causes: non-vacuity fires when there is
  no grammar-valid witness of *either* epoch at all (a genuinely empty or all-invalid tail);
  `ORDINAL-ONLY` fires when the ordinal register is non-empty and fully valid but the identity
  register (consecrated bytes) is empty.
- **At least one consecrated witness AND at least one writing-room witness (mixed epoch).** The
  reader recomputes the consecrated articles (identity register) and grammar/order-checks the
  writing-room articles (ordinal register), and — when both registers hold — reports the **scoped**
  verdict `PASS (verified=m, ordinal=k)`, where `m` is the count of recomputed consecrated articles
  and `k` is the count of valid writing-room articles. The two counts are asserted **separately**;
  a reader MUST NOT collapse them into one undifferentiated "verified N" count, because a caller
  reading only that blended number cannot tell how many of the N were byte-recomputed versus
  merely sequence-checked.
- **All consecrated (or zero writing-room present).** Ordinary `PASS`/`FAIL` reporting applies
  unchanged (§6.3, §9.1) — this is the pre-existing case with no ordinal-register component to
  name.

`ORDINAL-ONLY` and the `PASS (verified=m, ordinal=k)` scoped form are Core-reportable: a Core
reader classifies each witness by grammar alone (§6.7) and already knows, without claiming the
Append extension, which of its recomputed-consecrated or grammar-valid-writing-room registers is
non-empty. An Append-profile reader additionally enforces writing-room strict-increase (V15) as
part of what counts as "valid" in the writing-room count above; a writing-room witness that fails
strict-increase does not count toward `k` on an Append-profile reader.

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
branch trust, security, or authority decisions on its value. A document that uses `data-kind`
SHOULD declare its vocabulary in-band — in non-witnessed chrome or its `format-spec` section — so
every kind a reader meets is resolvable; an undeclared kind is descriptive only. Four disciplines
keep it honest:

1. **Prose-authoritative** — a meaningful `data-kind` is mirrored by a human-visible label in
   the section's prose; on any disagreement the prose is ground truth.
2. **Immutable** — a `data-kind` is never edited in place; reclassification is by appending a
   superseding section.
3. **Not a status** — mutable status such as "proposed" or "approved" is a *state*, resolved by
   placement and supersession, never a `data-kind` value.
4. **Off the manifest** — `data-kind` is not copied onto the manifest anchor (§5.4).

The richer downgrade-only authority vocabulary for runtime-appended sections is reserved beyond
v0.3 (§12).

### 8.4 The fold motion

The **fold** is the whole-document consecration motion: it transforms a writing-room tail
(§5.3b) into an ordinary manifest-first record. After the fold, every rule of §5, §6, and §7
applies to the record unchanged — the folded record is not a third shape.

| Rule | Requirement |
|---|---|
| Totality | The fold MUST fold **every witnessed unit** or refuse and write **nothing**. A witnessed `<article>` that does not satisfy the unit grammar below (missing `data-turn`, non-conforming id) is a **refusal, never a silent skip** — a fold that quietly drops a witnessed turn has forged the record's completeness. Every check — witness grammar (a grammar-invalid witness is refused, never skipped), unit grammar, duplicate ids, supersession soundness (no self-supersession; no forward target; no dangling target) — runs **before any byte is written**; the write is atomic and last. |
| Unit grammar | A foldable unit is a witnessed `<article data-turn>` whose id has the canonical form **`turn-NNNNNN`** (the literal prefix `turn-` followed by exactly six decimal digits). This grammar is normative for folded-record units, and an id outside it is a fold refusal. |
| Unit projection | Each `<article data-turn>` becomes a `<section>` carrying the **same id, same inner bytes**, and a consecrated witness (§6.7) recomputed from those bytes. **Every attribute on the unit's opening tag** — id, role/kind/turn attributes, `class` (§5.3b), `data-supersedes`, `data-gist`, and any other authored `name="value"` pair §6.4 admits — survives **byte-verbatim** on the section's opening tag: this surface crosses no escaping boundary, and the reference fold re-serializes the original opening-tag bytes rather than rebuilding them from a parse. The exceptions are exactly the two integrity carriers the fold itself mints: `data-witness` is **recomputed** at consecration (§6.7), never carried, and the `data-char-count` carrier (§6.6) is **refreshed from the projected bytes** wherever it is emitted. **Supersession edges live on the record's units, never in the manifest**. |
| The gist | Each manifest link's text is the unit's **gist** — authored routing under the §5.4 disclosure. Where the tail unit carries `data-gist`, the fold preserves the authored attribute bytes on the section (the projection row above) and carries the carrier's **decoded text** into the manifest link text — **equality of the decoded value, at any authored length, each surface serialized correctly for its own context**. The source is a double-quoted attribute value and the destination a text node; the two contexts share no single raw serialization (an attribute's `&#38;` and a text node's `&amp;` are the same decoded text in lawfully different bytes, and a raw `<` the attribute grammar admits must be escaped in the text node or it becomes markup), so the promise that CAN hold — and MUST — is decoded-text equality, never byte equality. **The decoded value is what the host language's parsing yields for each surface** — full HTML character-reference decoding, as the destination context's own grammar defines "the same text" (so `&copy;` decodes to `©`, not to a literal `&copy;`); this pins no table in this SPEC and imports nothing into Core verification — it names the host grammar both surfaces already live in. (gist-v1's deliberately restricted five-entity decode is untouched: it governs a different surface — the unit's inner text feeding a *minted* line — and is tool documentation, §8.4.) Where the unit carries no gist, the fold mints the link text as an authored line derived from the unit's inner text (how the reference tooling derives it is tool documentation — the note below). In both cases the gist routes and does not testify (§5.4); in neither case does Core verification certify the text against the unit's content. |
| Chrome | Un-witnessed top-level `<section>` chrome MUST be re-tagged to a non-section container at fold time, so that in the folded record **every top-level `<section>` is witnessed and manifested** — the flat order-bijection (§10 row V29) then holds with no exemptions. |

**Tooling note (informative — the discipline lives in the tools).** The reference gate and
fold carry the forcing fixtures for the covenant's one fold row (totality, V32), and
enforce, as their own documented law rather than as covenant: require-and-compare of the
`data-witness` and `data-char-count` carriers on every manifest entry they check; a single
gist normalization-and-truncation law at every path where the tools themselves **mint**
text — the append gate's own emission (which refuses an oversize supplied gist with a
clear error, never silently rewriting an author's line) and the fold's default-derived
link text — while an authored carrier's decoded text is carried unchanged into the link
text, context-correctly re-escaped (the gist row above), with
derive/verify tolerant of authored length; and a **derive-and-compare lint** at fold and
check time that recomputes each unit's gist from its witnessed inner bytes under the
default generator and reports any divergence from the carried text — a diagnostic that
makes drift and tampering *visible*, never a conformance verdict, because an authored gist
that diverges from the derivation is conforming routing under §5.4. The tools speak a
**pinned verdict register** — `PASS` / `WARN` / `LINT` (qualified non-success), beyond
the existing hard `FAIL` —
each verdict forced by at least one fixture, so that "reported" has one
machine-reproducible meaning across implementations. The default generator
— `gist-v1`, a six-step byte-level extraction — is specified in the reference gate's
documentation together with its measurements and its does-not-earn list; a future generator
is a new documented tool version, and no generator version is ever a property of the
document. The governing rule: *helpers may exist; they are not the format* —
and a checker that prints "verified" over a surface it did not check is a defect.

## 9. Reference algorithms (language-agnostic)

Pseudocode is normative for behavior, not for syntax. An implementation MUST produce the same
results; it need not mirror this control flow.

### 9.1 Verify a document

Shape detection (§5.0) runs first; the body of verify() forks on the detected shape.

```
function verify(bytes):
    # --- §5.1 whole-document UTF-8 well-formedness — the FIRST check, before everything else ---
    # No substitution, no lenient decode: an ill-formed byte is a refusal at the point of
    # unreadability, not a symptom some downstream hash or count mismatch may or may not surface.
    offset = first_invalid_utf8_offset(bytes)
    if offset is not None: FAIL("invalid UTF-8 at byte offset " + offset)  # §5.1, V38

    # --- §6.1 global dup-id, over EVERY live element, before shape dispatch ---
    # Walks every opening tag in the document (outside inert regions, §12) — not only
    # addressable-unit opening tags — because §6.1's uniqueness rule is a property of the
    # whole document's id space (top-level sections/articles, nested sections, manifest
    # link targets, id-bearing <img> elements under §5.5, anything else carrying id=).
    check_global_dup_ids(bytes)                                # §6.1 fail-closed, whole-doc scope

    # --- Shape detection (§5.0) ---
    # R4b: find_element's own close-tag step, for tag="nav", locates the first
    # `</nav>` at or after the opener's own `>` that is NOT itself inside an
    # inert region (§12) — the identical masking test §12 already applies to
    # boundary-token scanning and manifest-link collection (R4a), extended
    # here to the manifest's own extent (§5.3 "Extent"). A `</nav>` written
    # inside an HTML comment WITHIN nav#manifest (a commented-out usage
    # example naming the literal bytes `</nav>`) is not the manifest's real
    # close and MUST NOT truncate it — a masked candidate is skipped and the
    # search resumes past it, not accepted as-is. If no unmasked `</nav>`
    # exists anywhere at or after the opener, the manifest is unterminated:
    # FAIL("<nav id=\"manifest\"> is unterminated").
    manifest = find_element(bytes, tag="nav", id="manifest")
    articles = collect_witnessed_articles(bytes)               # <article data-witness> elements
    if manifest is not None and len(articles) > 0:
        FAIL("mixed shapes: both <nav id=\"manifest\"> and witnessed <article> present")  # V18
    if manifest is not None:
        return verify_manifest_first(bytes, manifest)
    if len(articles) > 0:
        return verify_tail(bytes, articles)
    FAIL("shape detection failed: no manifest and no witnessed articles")


function verify_manifest_first(bytes, manifest):
    # §5.3: manifest-first path
    # R4a: collect_anchor_descendants masks §12 inert regions (outside inert
    # regions, §12) exactly as check_global_dup_ids and the boundary-token
    # scans above do — an <a> whose opening tag lies inside an HTML comment
    # (or <script>/<style> raw-text) within <nav id="manifest"> is not a live
    # manifest entry and MUST NOT be added to `links`.
    links = collect_anchor_descendants(manifest)               # §5.3, masked (§12, R4a)
    sections = collect_top_level_sections(bytes)               # §5.2
    if len(sections) == 0: FAIL("vacuous: zero addressable units")  # §7.3 non-vacuity

    # --- Manifest link well-formedness (V36; §5.4) — a verdict, never a skip ---
    # §5.4 makes href REQUIRED as a fragment reference (#id) and data-witness REQUIRED on
    # every manifest link. A link missing either is a refusal, not an entry a reader may
    # drop and continue past: silently dropping it lets a document hide a section from the
    # order-bijection below and from the manifest-names-a-missing-section check, by
    # malforming its own entry. The entry-list gate is exactly the <a> descendants of
    # <nav id="manifest"> (§5.3); an <a> anywhere else in the document is not a manifest
    # link and this rule does not reach it.
    # An absent href is, for this check and its message, the empty string. The data-witness
    # gate is a FALSY test, not an `is None` test: an attribute written with no value at all
    # (`data-witness`, no `=`) is read as None by the §6.4 tokenizer and coalesces to `""`
    # here — the SAME missing-data-witness refusal a wholly absent attribute gets. An
    # attribute can be PRESENT (it satisfies a presence test) while its VALUE is the empty
    # string, and any rule requiring a non-empty value — this one included — refuses that
    # value exactly as it refuses a truly absent attribute; `data-witness=""` and a valueless
    # `data-witness` are therefore both MISSING for this rule, not two different outcomes.
    for l in links:
        href = read_attr_quote_aware(l, "href") or ""
        if not href.startswith("#"):
            FAIL("manifest link href is not a fragment: " + href)          # V36
        if not (read_attr_quote_aware(l, "data-witness") or ""):
            FAIL("manifest link missing data-witness: " + href)            # V36
        if not valid_id(href[1:]):
            FAIL("invalid id production: " + href[1:])                     # V33 — covers href="#"
        cc_link = read_attr_quote_aware(l, "data-char-count")
        if cc_link is not None: parse_count(cc_link)   # §6.6 — the manifest link's OWN count,
                                                        # the 4th parse_count call site (§9.1);
                                                        # grammar-checked here, at the point the
                                                        # link is read, not only transitively via
                                                        # its later equality against a section's
                                                        # count when the section also carries one

    # --- Order-bijection (V29) ---
    # The manifest's link order and the body's top-level section document-order MUST name
    # the identical id sequence — same id-set, same order. A manifest that lists the same
    # sections in a different order than they appear in the body is refused; this is
    # distinct from V7 (a manifest naming a MISSING section) and from V5 (dup-id).
    # The '#'-strip below is total only because the well-formedness loop above already
    # refused every link whose href is absent or not '#'-prefixed (V36) — that loop runs
    # first for this reason, and a reader that reorders them reintroduces the skip it closed.
    manifest_id_seq = [read_attr_quote_aware(l, "href")[1:] for l in links]  # strip leading '#'
    body_id_seq     = [read_attr_quote_aware(sec, "id") for sec in sections]
    if manifest_id_seq != body_id_seq: FAIL("order-bijection: manifest order != body order")  # V29

    seen_ids = set()
    for sec in sections in document order:
        id = read_attr_quote_aware(sec, "id")                  # §6.4
        if id is None: FAIL("bad id")                          # §5.2 id REQUIRED
        if not valid_id(id): FAIL("invalid id production: " + id)   # §6.1/V33 — already refused
                                                               # by check_global_dup_ids; restated
                                                               # here for locality, same verdict
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
        w_link = read_attr_quote_aware(link, "data-witness")
        # V4 two-carrier agreement: BOTH the section's own carrier and the link's carrier
        # MUST equal the recomputed digest — a section whose own data-witness disagrees
        # with a correct manifest-link witness (or vice versa) is a carrier-mismatch FAIL,
        # not just a link-vs-section string comparison.
        if epoch == CONSECRATED and sha256_hex(inner) != w_section: FAIL("carrier disagreement: section")  # V4
        if w_link != w_section: FAIL("carrier disagreement: link vs section")                              # V4
        if epoch == CONSECRATED and w_link != sha256_hex(inner): FAIL("carrier disagreement: link")        # V4
        cc_link = read_attr_quote_aware(link, "data-char-count")
        cc_sec  = read_attr_quote_aware(sec,  "data-char-count")
        # Item 4.2 (post-round-4-validation): the link's OWN count is compared to the
        # ACTUAL codepoint count independently of whether the section carries a count
        # attribute at all — this branch is NOT conditioned on cc_sec's presence. A
        # section with no data-char-count of its own, whose manifest link's count is
        # simply wrong, is refused here, not silently passed for "having nothing to
        # compare against." (Both readers implement this branch; the pseudocode above
        # this comment previously showed only the cc_link-vs-cc_sec agreement check
        # and the cc_sec-vs-actual check, which together do NOT cover this case when
        # cc_sec is absent.)
        if cc_link is not None and parse_count(cc_link) != codepoint_count(inner):
            FAIL(f"char-count manifest={parse_count(cc_link)} actual={codepoint_count(inner)}")
            # verify.py: `FAIL {sid}: char-count manifest=<M> actual=<A>`
            # verify.mjs: `MISMATCH {sid}: char-count manifest=<M> actual=<A>`
            # The FAIL/MISMATCH spelling difference is the SAME pre-existing,
            # out-of-scope wording drift R5 and §13's "Residual, disclosed" note
            # already name — not introduced by this pseudocode addition.
        if cc_link and cc_sec and cc_link != cc_sec: FAIL("char-count disagreement")
        if cc_sec is not None and parse_count(cc_sec) != codepoint_count(inner):
            FAIL("char-count wrong")                           # §6.6 (grammar checked in parse_count)

        sup = read_attr_quote_aware(sec, "data-supersedes")    # §8.2
        if sup and not sup.startswith("#"): FAIL("supersedes not a fragment reference (#old-id)")  # §8.2 Value
        if sup and target_of(sup) not in earlier_sections(sec): FAIL("dangling supersedes")

    for link in links:                                         # every manifested section exists
        if section_for(link) is None: FAIL("manifest names a missing section")

    # --- Nested witnessed-section recompute (verify-all, charter decision #2) ---
    # A nested <section data-witness> (one not reachable from the manifest's top-level
    # link list, but present inside another witnessed unit's span) is ALSO an addressable
    # unit under §5.2 and MUST have its own witness recomputed — the fold-confirmation
    # contract (§7.2: "every prior consecrated witness still re-derives") does not carve
    # out nesting depth. A reader that recomputes only manifest-listed (top-level)
    # sections and treats a nested section's data-witness as decorative diverges from
    # an isolation-mode checker, which recomputes every section it finds regardless
    # of nesting depth.
    # The order of the four gates below is normative for behavior (§6.1, witnessed-nested pin):
    # witness presence FIRST, so a structural (un-witnessed) nested section is dismissed before
    # any id obligation attaches to it; then id PRESENCE, so an id-less witnessed section is
    # refused (V34) rather than absorbed; then the id PRODUCTION (V33); only then the
    # already-verified skip. This ordering is a repair: under the previous ordering an id-less
    # witnessed section put `None` into `seen_ids`, and every *later* id-less witnessed section
    # was then silently skipped by the dup guard — a witnessed unit going unverified, which is
    # exactly the outcome §7.3's fail-closed rule exists to prevent.
    for sec in collect_all_sections(bytes):                    # includes nested, any depth
        w = read_attr_quote_aware(sec, "data-witness")
        if w is None: continue                                 # non-witnessed structural nesting
        id = read_attr_quote_aware(sec, "id")
        if id is None:
            FAIL("nested <section data-witness> with no id")    # §5.2/§6.1, V34 — a correct
                                                               # witness does not rescue it
        if not valid_id(id): FAIL("invalid id production: " + id)   # §6.1, V33
        if id in seen_ids: continue                            # already verified above (top-level)
        seen_ids.add(id)                                        # dup-id already enforced globally
        inner = witnessed_bytes(bytes, sec, tag="section")
        epoch = classify(w)
        if epoch == INVALID: FAIL("invalid witness grammar")
        if epoch == CONSECRATED:
            if sha256_hex(inner) != w: FAIL("witness mismatch (nested section)")
        cc = read_attr_quote_aware(sec, "data-char-count")
        if cc is not None and parse_count(cc) != codepoint_count(inner):
            FAIL("char-count wrong (nested section)")          # §6.6

    return PASS


function verify_tail(bytes, articles):
    # §5.3b: tail path — no manifest, no link/carrier checks
    # Non-vacuity: need at least one article with a valid-grammar, recomputing witness
    valid_count = 0
    seen_ids = set()
    for art in articles in document order:
        id = read_attr_quote_aware(art, "id")                  # §6.4
        if id is None: FAIL("bad id")                          # §5.3b id REQUIRED
        if not valid_id(id): FAIL("invalid id production: " + id)   # §6.1/V33 — already refused
                                                               # by check_global_dup_ids; restated
                                                               # here for locality, same verdict
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
        if cc_art is not None and parse_count(cc_art) != codepoint_count(inner):
            FAIL("char-count wrong")                           # §6.6 (grammar checked in parse_count)

        sup = read_attr_quote_aware(art, "data-supersedes")    # §8.2
        if sup and not sup.startswith("#"): FAIL("supersedes not a fragment reference (#old-id)")  # §8.2 Value
        if sup and target_of(sup) not in earlier_articles(art): FAIL("dangling supersedes")

    # Non-vacuity for a consecrated tail: at least one article must have recomputed
    if valid_count == 0: FAIL("vacuous: zero addressable units with recomputing witnesses")
    return PASS
    # No link checks, no manifest-names-missing check: V4 is N/A for tail.


function check_global_dup_ids(bytes):
    # §6.1 scope-of-"live element" — walks EVERY opening tag in the document (outside
    # inert regions, §12: HTML comments and <script>/<style> raw-text content), not only
    # addressable-unit opening tags. Any id= value seen twice is a fail-closed refusal,
    # regardless of the two elements' tag names (a <section id="x"> and an <img id="x">
    # collide exactly as two <section id="x"> elements would).
    #
    # collect_all_opening_tags (§6.4) walks by CANDIDATE tag-start position — a `<` immediately
    # followed by an ASCII letter, outside an inert region — and parses each candidate ANCHORED
    # exactly there, quote-aware, with the tag/attrs separator decided by exclusion (any byte
    # that is none of `< > ' "`), not a whitespace class. A candidate whose attribute quote opens
    # and is never reachably closed is unparseable and MUST be refused at the offset of its own
    # `<` (V37) — it MUST NOT be silently skipped, and the walk MUST NOT resynchronize past it to
    # whatever later tag happens to parse: doing so would make the unparseable tag, and any id or
    # duplicate hiding inside its unreadable attributes, invisible to this walk. A candidate with
    # no quote ever opened before the next `<` or end of file is ordinary text, not a tag, and is
    # left exactly as invisible as it always was (§6.4) — this is what keeps `a<b` in prose from
    # becoming a false-positive refusal.
    #
    # read_attr_quote_aware, and the same tag's dup-attribute-name check (R6c, not shown as a
    # separate step here — see §6.4's own prose), both read through the identical tokenizer,
    # which case-folds every attribute NAME to lowercase (§6.4) before it is used for value
    # lookup or duplicate-name comparison. "id" and "ID" are the same attribute to this walk.
    #
    # This walk also enforces the §6.1 ASCII id PRODUCTION (V33). The production and the
    # uniqueness rule share one scope — every id-bearing element in the rendered surface —
    # so one walk discharges both. An implementation MAY split them into two walks; it MUST
    # NOT narrow either to the addressable-unit ids its shape-specific discovery scan visits,
    # which would leave a nested section's, an <img>'s, or an append-anchor's id unchecked.
    seen = set()
    for tag in collect_all_opening_tags(bytes):                # anchored, quote-aware, §6.4; V37
        id = read_attr_quote_aware(tag, "id")
        if id is None: continue
        if not valid_id(id): FAIL("invalid id production: " + id)  # §6.1, V33, whole-doc scope
        if id in seen: FAIL("duplicate id")                    # §6.1 fail-closed, whole-doc scope
        seen.add(id)


function valid_id(s):
    # §6.1, byte-exact ASCII. No Unicode table is consulted, at any version.
    # FULL-STRING MATCH (normative, not a notational nicety). `\A` and `\z` here mean
    # absolute start-of-string and end-of-string — never a line boundary. A bare `^…$`
    # is NOT a safe spelling of that for every engine: in .NET, in PowerShell, and in
    # Python's `re.match`/`re.search` (though not `re.fullmatch`), `$` also matches
    # immediately before a trailing newline, so an id string carrying a trailing `\n`
    # (e.g. `"intro\n"`) would wrongly satisfy this production under those engines'
    # default `$` — the exact parity trap this recension's R1 closed in the reference
    # readers by using Python's `re.fullmatch` rather than a bare `match`/`$` pattern.
    # An implementer MUST use whatever spelling their own engine's TRUE full-string
    # match takes: Python `re.fullmatch(pattern, s)`, a JavaScript `^…$` pattern with
    # no `m` flag (JS's bare `$` without `m` is already a true end-of-string — no
    # trailing-newline exception — so `^…$` is safe there without change), or .NET's
    # `\A…\z` verbatim. The same discipline applies to parse_count below.
    return matches(s, /\A[A-Za-z_][A-Za-z0-9_.:-]*\z/)


function parse_count(s):
    # §6.6 count grammar — the lexical grammar of the data-char-count attribute STRING,
    # defined once here and used at every site that reads a count. `s` is the attribute's
    # value whenever the attribute is present, INCLUDING the empty string ("presence is
    # presence", §6.6): callers gate on presence (`is not None`), never on truthiness.
    # A value outside the grammar is a refusal — never a best-effort parse of a prefix,
    # never a silently skipped check.
    #     count := "0" | [1-9][0-9]*
    # Full-string match — see valid_id's comment above: `\A`/`\z` are absolute string
    # boundaries, not line boundaries; use your engine's true full-string form.
    if not matches(s, /\A(0|[1-9][0-9]*)\z/):
        FAIL("invalid char-count grammar: " + s)               # §6.6, V35
    return decimal_value(s)
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

### 9.2a The Producer profile — RESTRICT PRODUCERS to one canonical serialization (§10 row V28)

A conforming **Producer** (§11.1) MUST emit every witnessed-unit boundary and every
witnessed-unit opening-tag attribute in **exactly one** serialization — the canonical form a
Core reader's boundary-token grammar (§6.2) and attribute rules (§6.4) recognize without
qualification. This is a deliberate policy choice: the alternative — widening a reader into a
general HTML tokenizer so it can accept every legal-but-non-canonical spelling a browser would
render — would drag a full parser into the trust base and forfeit the property that a conforming
reader can be, and remain, a byte-scanner (§3, §6.5's zero-equivalence-classes lineage). Canonical
producers plus a fail-closed, non-canonical-refusing reader keeps "identical bytes imply identical
witnesses" provable without that cost.

A conforming Producer MUST emit, for every addressable element (`<section>` or `<article>`):

1. **Lowercase tag names.** `<section`, `</section>`, `<article`, `</article>` — never
   `<SECTION>`, `<Article>`, or any mixed case.
2. **Canonical closing tags with zero interior whitespace.** Exactly `</section>` or exactly
   `</article>` — never `</section >`, `</ section>`, or any variant carrying interior
   whitespace.
3. **Double-quoted attribute values on every witnessed-unit opening tag** (§6.4) — never
   single-quoted or unquoted.
4. **No duplicated attribute name** on a witnessed-unit opening tag (§6.4).
5. **No content element whose tag name is `section` or `article` followed by `-`, `.`, or `:`**
   anywhere inside a witnessed span, unless comment-masked (§6.4a, §12).
6. **ASCII ids.** Every `id` the Producer emits MUST match the §6.1 ASCII production
   (`start := [A-Za-z_]`, `cont := [A-Za-z0-9_.:-]`). A Producer MUST NOT mint an id from
   unsanitized title, heading, or gist text: a non-ASCII letter that a browser renders and a
   URL fragment resolves is nonetheless outside the production, and a document carrying it is
   one a conforming reader MUST refuse (row V33). *(This item's scope is deliberately wider
   than this list's opening sentence: it binds every `id` the Producer writes anywhere in the
   document — nested `<section>` elements, manifest-link targets, `id`-bearing `<img>`
   elements (§5.5), an `append-anchor` (§5.3b) — matching §6.1's live-element scope, not only
   witnessed-unit opening tags. It sits in this list because the byte-scanner rationale above
   is the reason for it: a producer that emits only ids a byte-scanner can decide is what
   keeps a reader from needing a Unicode table to check an address.)*

A Producer that emits any construct outside this profile has emitted a NON-CANONICAL document
(§6.2); it is not conforming at the Producer profile even if the resulting bytes happen to be
legal, browser-renderable HTML. The Producer profile is additive to, and does not relax, every
other Producer MUST already stated in this section.

## 10. Validation matrix

A conforming implementation MUST satisfy every **Core** row. An implementation that claims an
extension MUST satisfy that extension's rows.

| # | Profile | Shape scope | Assertion |
|---|---|---|---|
| V1 | Core | manifest-first | A document with a valid `<nav id="manifest">` and matching witnessed sections verifies PASS. |
| V1T | Core | tail | A consecrated tail (no nav-manifest, ≥1 `<article data-witness>`) verifies PASS; each article's SHA-256 recomputes from its §6.2 inner bytes. |
| V2 | Core | both | A reader recomputes SHA-256 over §6.2 inner bytes and does not trust the stored hex. |
| V3 | Core | both | A one-byte change to any addressable unit's inner bytes causes a witness mismatch → FAIL. |
| V4 | Core | manifest-first only | Two-carrier agreement (§6.3): the section's own `data-witness` and the manifest link's `data-witness` MUST **both** equal the recomputed digest — a section carrying a stale or zeroed `data-witness` while the link carries the true hash (or vice versa) → FAIL (carrier disagreement), even though a link-vs-section string comparison alone would not catch a case where the link agrees with a wrong section value that itself doesn't recompute. V4 is N/A for tail documents. |
| V5 | Core | both | Two live elements sharing an `id` → FAIL closed (no silent resolution). |
| V6 | Core | both | A witness matching neither grammar (§6.7) → FAIL (invalid). |
| V7 | Core | both | A document with zero addressable units → FAIL (non-vacuity). For manifest-first: a manifest naming a missing section → FAIL. |
| V8 | Core | both | An addressable unit id beginning with a digit, or containing whitespace → non-conforming. |
| V9 | Core | both | An `id=`/`data-witness=` string embedded inside another attribute's quoted value does not impersonate the real attribute (§6.4). |
| V10 | Core | both | The §6.2 depth-walk uses the addressable element's own tag as the boundary token; a token inside a comment does not move a boundary. **Amended 2026-08-22 (Operator ruling):** the open-token grammar's byte set is `0x09` TAB, `0x0A` LF, `0x0C` FF, `0x0D` CR, `0x20` SPACE, `/`, `>` — HTML5's five whitespace bytes plus the two structural bytes, and **not** `0x0B` VT, which was a member until that ruling. A byte sequence `<TAG⟨0x0B⟩…>` is therefore not an open token and the element is not discovered at all, matching a browser's tag-name state, which appends VT to the tag NAME and never produces the element (§6.2; pinned by `r8-ruled-vt-tag-name.doc.html` and its one-byte control). |
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
| V22 | Core | both | A close tag carrying interior whitespace (e.g. `</section >`) is not a canonical close token (§6.2) → FAIL `NON-CANONICAL` with a required byte offset, never reported as "unterminated". |
| V23 | Core | both | A tag sharing an addressable element's tag name as a prefix but not matching the exact-tag-name open-token grammar (e.g. `<section-foo>`) is not a boundary token of any kind (§6.2) and MUST NOT be treated as an open or close token by either the depth-walk or the unit-discovery scan. |
| V24 | Core | both | A witnessed-unit opening tag carrying a single-quoted or unquoted attribute value → FAIL `NON-CANONICAL` with a required byte offset (§6.4). |
| V25 | Core | both | **Unreachable as its own observable behavior post-R6c.** A witnessed-unit opening tag carrying a duplicated attribute name is still non-conforming (§6.4), but the whole-document `id` walk (§6.4, §9.1 `check_global_dup_ids`) now visits **every** opening tag, `<section>`/`<article>` unit openers included, and runs entirely **before** shape dispatch — so it refuses the duplicated name first, under V37's verdict and offset rule (`duplicate attribute name '<name>' in tag at byte offset <N>`, `N` = the tag's own `<`), before the shape-specific unit-discovery code that carries V25's own `NON-CANONICAL … (§6.4, V25)` wording (pointing at the *duplicate occurrence*, not the tag's `<`) is ever reached for that tag. The refusal itself is unchanged — nonzero exit, a named byte offset — only which check reports it, and in what words, moved to V37. This row's number is retained (referenced elsewhere in this repository) but its distinct wording/offset combination is no longer produced by either reader; see V37's R6c amendment for the wording actually observable today. |
| V26 | Core | both | A witnessed span containing, outside an inert region, a content element whose tag name is `section` or `article` followed by `-`, `.`, or `:` → FAIL `NON-CANONICAL` with a required byte offset (§6.4a); this case is distinct from V23 and is not caught by the boundary-token grammar or a closing-tag count guard. |
| V27 | Core | both | Shape detection (§5.0) is satisfiable by a single quote-aware byte-scan for `<nav id="manifest">` or a valid-grammar `<article data-witness>` opening tag, without constructing a DOM tree or invoking an HTML parser. |
| V28 | Producer | both | A conforming Producer emits only the canonical serialization named in §9.2a (lowercase tags, zero-interior-whitespace close tags, double-quoted attributes, no duplicated attribute names, no unmasked section-/article-prefixed content element inside a witnessed span); a Producer emitting any other construct is non-conforming at the Producer profile. |
| V29 | Core | manifest-first only | The manifest's link order and the body's top-level section document-order MUST name the identical id sequence (§9.1 order-bijection) → a manifest that lists the same id-set in a different order than the body → FAIL. Distinct from V7 (a manifest naming a section absent from the body) and V5 (dup-id): this row catches a same-id-set, wrong-order manifest. |
| V30 | Core | both | The §6.1 dup-id check (§9.1 `check_global_dup_ids`) walks **every** opening tag in the document, not only addressable-unit opening tags — a duplicate `id` between a top-level section/article and a nested section, a manifest-anchor target, or an `id`-bearing `<img>` (§5.5) → FAIL closed, same as two top-level sections sharing an id (V5). |
| V31 | Core | manifest-first only | A **nested** `<section data-witness>` (not reachable from the manifest's top-level link list, but present inside another witnessed unit's span) has its own witness recomputed and compared, exactly as a top-level section's is — a nested section's `data-witness` is never decorative. Closes the divergence between a manifest-driven reader and an isolation-mode checker that recomputes every section it finds regardless of nesting depth (§9.1 nested-recompute clause). |
| V32 | Producer | tail → manifest-first | The fold is total and fail-closed: a tail containing a grammar-invalid witness, a duplicate id, a self/forward/dangling `data-supersedes`, or zero addressable units folds to **nothing** — zero bytes written, non-zero exit (§8.4). |
| V33 | Core | both | Any **live element** (§6.1 scope: top-level unit, nested `<section>`, manifest-link target, `id`-bearing `<img>`, `append-anchor`) whose `id` does not match the §6.1 ASCII production → FAIL naming `invalid id production` — including an `id` whose only defect is a non-ASCII letter (`émile`), which conformed under v0.4 (§6.1 ground; the v0.5 boundary, §14), and including both `id=""` and a valueless `id` (`<div id>`, no `=`), which are the identical empty-string byte-shape for this test (§6.1's valueless-is-empty paragraph, R1a). Widens V8, which states the same refusal for a leading digit or whitespace and only on addressable units. |
| V34 | Core | manifest-first only | A nested `<section>` carrying `data-witness` but no `id` → FAIL naming `nested <section data-witness> with no id`, never skipped and never absorbed by the already-verified guard — and a `data-witness` that recomputes correctly does not rescue it, because the refusal is on the missing address (§6.1 witnessed-nested pin; §9.1 nested loop ordering). |
| V35 | Core | both | A **present** `data-char-count` whose attribute string does not match the §6.6 count grammar (`0` or `[1-9][0-9]*`) — `120abc`, `0x78`, `１２０`, `1_20`, `+120`, `" 120"`, `"120 "`, `0120`, `-0`, or the empty string `""` — → FAIL naming `invalid char-count grammar`, never a best-effort parse of a prefix and never a skipped check (§6.6; §9.1 `parse_count`). |
| V36 | Core | manifest-first only | A manifest link (an `<a>` descendant of `<nav id="manifest">`, §5.3) whose `href` is not a `#`-prefixed fragment, or which carries no `data-witness`, → FAIL — never dropped from the entry list (§5.4; §9.1 manifest link well-formedness). An `<a>` outside the manifest nav is not a manifest link and is unaffected. |
| V37 | Core | both | An opening tag encountered by the whole-document `id` walk (§6.4, §9.1 `check_global_dup_ids`) whose attribute quote opens and is never reachably closed → FAIL naming `unterminated attribute quote in tag at byte offset <N>`, `N` = the offset of that tag's own `<` — never silently skipped and never resynchronized past. Ordinary text merely resembling a tag start, with no quote ever opened, is unaffected. **R6c amendment:** the same walk, before reading a visited tag's `id`, also refuses that tag if its own tokenizer sees any attribute name twice (any name, not only `id`) → FAIL naming `duplicate attribute name '<name>' in tag at byte offset <N>`, same offset rule — extending V24/V25's no-duplicate-attribute-name rule from addressable-unit openers to every opening tag the walk visits. |
| V38 | Core | both | The document's raw bytes are not well-formed UTF-8 → FAIL naming `invalid UTF-8 at byte offset <N>`, `N` = the offset of the first byte of the first ill-formed subsequence, checked **before** every other rule in this specification — before shape detection, before the id walk, before masking (§5.1). No substitution, no lenient decode. |
| V39 | Core | both | **Definitional pin, not a new refusal.** An attribute preceded by any of the **five** enumerated separator codepoints of §6.4 — `U+0009` TAB, `U+000A` LF, `U+000C` FF, `U+000D` CR, `U+0020` SPACE, HTML5's whitespace and nothing else (**ruled 2026-08-22**; the set was 25 codepoints, the JS engine's `\s`, until that sitting) — is recognized as a distinct attribute exactly as it would be preceded by an ASCII space. The companion fact is the operative half: **a codepoint outside the set is not a separator** and is absorbed into the adjacent attribute NAME rather than recognized as a boundary, so the attribute it appeared to introduce does not exist on that element for any reader — exactly as it does not exist for a browser. Both directions are pinned against each other by `r8-ruled-sep-u2028.doc.html` (U+2028 between `data-x` and a colliding `id`: the `id` is invisible, document verifies 2/2) and its one-codepoint-different control `r8-ruled-sep-space-control.doc.html` (ASCII space instead: the `id` is visible and collides, `FAIL: duplicate id: intro`). `r6-sep-nbsp.doc.html`, `r6-sep-nbsp-mid-attrs.doc.html`, `r6-sep-u2028.doc.html` and `r8-noncanonical-sep-ufeff.doc.html` read the same rule on four further inputs. |
| V40 | Core | manifest-first only | An `<a>` inside a §12 inert region (an HTML comment, most concretely) within `<nav id="manifest">` is not a manifest link and MUST NOT be collected (§5.3, §12, R4a) — a pure loosening, not a narrowing (§14): the sealed `dev` baseline collected it as a live entry and could refuse an otherwise-conforming document over dead markup. Verified by the positive fixture `pass-manifest-commented-anchor.doc.html` (one live, conforming entry beside two commented-out anchors that would each independently violate V36 if live) → `PASS`, `verified 1/1 sections`, byte-identical on both readers; the mask does not over-reach, checked by `r4-live-anchor-beside-comment.doc.html` (the same commented anchors plus one genuinely live malformed anchor) → still `FAIL: manifest link href is not a fragment: example.html`, rc=1, on both readers; and the order-bijection loosening this row exists for is verified directly by `r4a-loosen-commented-duplicate.doc.html` (a commented-out duplicate `<a href="#x">` beside two live `<a href="#x">` entries) → sealed `dev` baseline `FAIL: order-bijection…`, v0.5 `PASS`, byte-identical on both readers. |
| V41 | Core | manifest-first only | The manifest's extent (§5.3 "Extent") runs to the first `</nav>` close token found **outside** a §12 inert region, not to the first raw `</nav>`-shaped byte sequence wherever it falls (§5.3, §12, R4b) — **this moves verdicts in both directions, not only toward PASS** (§14). On `pass-manifest-comment-contains-nav-close.doc.html` (two witnessed sections, with an HTML comment between the manifest's two `<li>` entries containing the literal text `</nav>`, every real entry preceding it) the sealed `dev` baseline truncated at the in-comment `</nav>` and refused the document, misleadingly, as an order-bijection failure — the loosening: dev `FAIL` → v0.5 `PASS`, `verified 2/2 sections`, byte-identical on both readers. On `r4b-manifest-unterminated.doc.html` (a manifest whose ONLY `</nav>`-shaped bytes are inside a comment, no real close anywhere) the sealed `dev` baseline's SAME unmasked truncation happens to land past every real manifest entry, so `dev` verifies it CLEAN — the narrowing: dev `rc=0` on both sealed readers → v0.5 `FAIL: <nav id="manifest"> is unterminated`, rc=1, byte-identical on both readers. A third fixture, `r4b-nav-close-absent.doc.html` (a wholly-absent `</nav>`, no comment involved, followed by a witnessed `<article>`), closes a real `dev`-mjs fail-open — the sealed `dev` mjs baseline fell through to the tail path and could PASS a document the sealed `dev` py baseline correctly refused as mixed-shapes — both v0.5 readers now agree with `dev` py: `FAIL: mixed shapes …`, rc=1 (V18 is evaluated before the manifest path, so the unterminated verdict is unreachable on an article-bearing document). A fourth fixture, `r4b-nav-close-absent-no-article.doc.html` (the same absent close with no witnessed `<article>` anywhere), is where the unterminated verdict itself is exercised: v0.5 `FAIL: <nav id="manifest"> is unterminated`, rc=1, byte-identical on both readers; sealed `dev` py emitted the same verdict, while sealed `dev` mjs — having no unterminated verdict — reported `FAIL: shape detection failed …` (the missing-verdict divergence, closed). |
| V42 | Core | both | A `data-witness` value that is not a **full-string** match of either witness grammar (§6.7) — most concretely, a value that is otherwise the correct 64-hex or `YYYY-MM-DDTHH:MM:SSZ` form but carries a trailing newline — → FAIL (invalid witness grammar), on both readers, byte-identically (R9). This closes a parity trap the round-7 R1 amendment already named in the abstract (§9.1's `valid_id` comment) but had not yet been found live in the witness grammar itself: `verify.py`'s pre-fix `_classify_witness` matched each witness regex with a bare `^…$` pattern via Python's `.match()`, under which `$` matches immediately before a trailing newline, so `"…Z\n"` was wrongly classified `writing-room` and `"<64-hex>\n"` was wrongly classified `consecrated` — while `verify.mjs`'s `classifyWitness` already used a true full-string `.test()` (JS's un-flagged `$` has no such exception) and refused both. The fix ports R1's own remedy: both `verify.py` regexes now carry no `^…$` anchors at all and are evaluated with `re.fullmatch`, matching `_ID_PRODUCTION_RE`/`_COUNT_PRODUCTION_RE`'s existing pattern. |

## 11. Conformance profiles and Definition of Done

### 11.1 Profiles

- **Core (REQUIRED of every conforming implementation).** Shape detection (§5.0) as a byte-scan;
  manifest discovery for manifest-first shape; tail-shape article discovery; quote-aware attribute
  reading with double-quote and no-duplicate-attribute enforcement on witnessed-unit opening tags
  (§6.4); §6.2 witnessed-bytes extraction with the exact-tag-name boundary-token grammar, the
  depth-walk, and comment/raw-text masking (parameterized on the addressable element's tag),
  refusing off-grammar boundaries as `NON-CANONICAL` with a required byte offset rather than
  "unterminated"; the §6.4a content-profile prohibition (distinct from the boundary-token
  grammar); consecrated-witness recomputation and pinned comparison; fail-closed and non-vacuity;
  the id production; homogeneity enforcement; mixed-shape refusal; nested-article prohibition;
  append-anchor discipline; whole-document dup-id scope (every live element's `id`, not only
  addressable-unit ids); the ASCII id production over that same whole-document scope; the
  required `id` on a witnessed nested `<section>`; the §6.6 count grammar on a present
  `data-char-count`; manifest-link well-formedness (`#`-fragment `href` and `data-witness`, as a
  refusal rather than a dropped entry); §12 inert-region masking of manifest-link collection and
  of the manifest's own `</nav>` close, so a comment inside `nav#manifest` can neither smuggle in
  a dead entry nor truncate the manifest's extent (§5.3, V40, V41); manifest order-bijection;
  nested witnessed-section recompute; an anchored, quote-aware whole-document opening-tag walk
  that refuses (rather than skips or resynchronizes past) a tag whose attribute quote is
  unterminated (§6.4); whole-document UTF-8 well-formedness, checked before every other rule
  (§5.1); the attribute-tokenizer separator set, enumerated rather than borrowed from an engine's
  own whitespace class (§6.4, V39); a witness value that is not a **full-string** match of
  either witness grammar (§6.7), the same discipline the id production already holds itself to
  (V42). A Core reader classifies a tail article's witness by grammar
  and recomputes only the consecrated epoch; it is not required to enforce writing-room ordering —
  that is the Append seam named explicitly in §5.3b. Rows V1, V1T, V2–V12, V17–V31, V33–V42. v0.4
  added no Core conformance requirement; **v0.5 does** — rows V33–V42 are the one-grammar
  recension, a Core change with the version boundary §14 states. A
  Core reader reading a folded record sees an ordinary manifest-first document and verifies it
  under the unchanged rules; no folded-record inference is ever made from link-text shape.
- **Append (extension).** Writing-room epoch ordering, supersession resolution, append-only
  re-confirmation. Layered on top of Core (§5.3b); a reader claiming Append MUST also satisfy
  every Core row. Rows V13–V16. Also: the recency-window reading posture (§7.1) and
  candidate-head presentation over `data-supersedes` chains under the §7.1 safe-reader rule —
  RECOMMENDED.
- **Producer (extension).** Emits conforming documents per §9.2, restricted to the single
  canonical serialization named in §9.2a. Row V28. Also: the fold motion (§8.4, row V32): a
  producer that folds MUST fold totally and fail-closed, emit the manifest by independent
  enumeration of the body, and emit the single canonical serialization of §9.2a.

### 11.2 Definition of Done

An implementation is done when, at its declared profile, all REQUIRED boxes check:

- [ ] **(REQUIRED)** Detects document shape (§5.0): manifest-first if `<nav id="manifest">` is
      present; tail if no manifest and ≥1 valid witnessed `<article>`; FAIL otherwise. Refuses
      documents mixing `<section data-witness>` and `<article data-witness>`.
- [ ] **(REQUIRED — manifest-first)** Discovers `<nav id="manifest">` and collects `<a>`
      descendants in document order.
- [ ] **(REQUIRED — tail)** Discovers `<article data-witness>` elements in document order; no
      manifest is required or expected.
- [ ] **(REQUIRED)** Reads `id` / `data-witness` / `data-char-count` quote-aware (§6.4); refuses a
      witnessed-unit opening tag carrying a single-quoted/unquoted value or a duplicated
      attribute name as `NON-CANONICAL` with a required byte offset.
- [ ] **(REQUIRED)** Extracts an addressable unit's inner bytes by the §6.2 boundary rule (the
      exact-tag-name boundary-token grammar, depth-walk, and comment/raw-text masking,
      parameterized on the element's own tag), untrimmed; refuses an off-grammar boundary (a
      whitespace-carrying close tag, a tag-name-prefix collision such as `<section-foo>`) as
      `NON-CANONICAL` with a required byte offset, never as "unterminated".
- [ ] **(REQUIRED)** Enforces the §6.4a content-profile prohibition — a witnessed span containing
      an unmasked `section`-/`article`-prefixed content element (`-`, `.`, or `:` suffix) fails
      `NON-CANONICAL`, as a rule distinct from the boundary-token grammar and any count guard.
- [ ] **(REQUIRED — manifest-first)** Recomputes SHA-256 and compares byte-exact against
      **both** carriers (section + manifest link), with zero equivalence classes (§6.3, §6.5).
- [ ] **(REQUIRED — tail)** Recomputes SHA-256 and compares byte-exact against the **single**
      carrier (the article element), with zero equivalence classes (§6.3, §6.5). No link check.
- [ ] **(REQUIRED)** Validates the §6.1 **ASCII** id production over **every live element's**
      `id` — not only addressable-unit ids — and fails closed on duplicate ids (§6.1). Consults
      no Unicode table at any version. Passes V33.
- [ ] **(REQUIRED — manifest-first)** Refuses a nested `<section>` that carries `data-witness`
      and no `id`, in that gate order (witness presence, then `id` presence, then the production,
      then the already-verified skip), never skipping it and never letting a correct witness
      rescue it (§6.1, §9.1). Passes V34.
- [ ] **(REQUIRED)** Refuses a **present** `data-char-count` whose string is outside the §6.6
      count grammar (`0` or `[1-9][0-9]*`) — including the empty string — naming the grammar,
      never best-effort parsing a prefix and never treating an unreadable count as an absent one
      (§6.6, §9.1 `parse_count`). Passes V35.
- [ ] **(REQUIRED — manifest-first)** Refuses a manifest link whose `href` is not a `#`-prefixed
      fragment or which carries no `data-witness`, rather than dropping the entry and continuing
      (§5.4, §9.1). Passes V36.
- [ ] **(REQUIRED — manifest-first)** Masks §12 inert regions when collecting manifest links and
      when locating the manifest's own close: an `<a>` inside a comment within `nav#manifest` is
      not collected as a manifest link (V40), and the manifest's extent runs to the first `</nav>`
      found **outside** an inert region, refusing `<nav id="manifest"> is unterminated` only when
      no unmasked close exists anywhere (V41). Passes V40, V41.
- [ ] **(REQUIRED)** Walks every opening tag for the §6.1 checks anchored at each candidate's own
      `<`, quote-aware, with the tag/attrs separator decided by exclusion (`< > ' "`), not a
      whitespace class; refuses — never skips, never resynchronizes past — a tag whose attribute
      quote is unterminated, naming the offset of that tag's own `<` (§6.4). Passes V37.
- [ ] **(REQUIRED)** Validates that the document's raw bytes are well-formed UTF-8 **before any
      other check**, refusing with the offset of the first ill-formed byte; never substitutes
      U+FFFD and never decodes leniently (§5.1). Passes V38.
- [ ] **(REQUIRED)** Tokenizes the attribute separator against the enumerated **five**-
      codepoint set of §6.4 — TAB, LF, FF, CR, SPACE, HTML5's whitespace — not an
      engine-defined whitespace class. §6.2's boundary-token open set rests on the same five
      whitespace bytes since the second 2026-08-22 ruling (it additionally admits `/` and `>`,
      which are not separators). A codepoint in the set is a
      separator; a codepoint outside it is absorbed into the adjacent attribute name, so the
      attribute it looked like it introduced does not exist. The reader makes this decision
      in exactly ONE place — no second whitespace class may skip a run at the
      tag-name/attribute join. Passes V39.
- [ ] **(REQUIRED)** Classifies a witness into exactly one epoch by form, and refuses invalid
      grammars (§6.7), evaluated as a **full-string** match — a value that is otherwise
      grammar-shaped but carries a trailing newline (or any other byte outside the grammar) is
      `invalid`, not silently accepted by an engine whose `$` matches before a trailing newline
      (§6.7 R9 note; same discipline as the id production, §6.1). Passes V42.
- [ ] **(REQUIRED)** Fails closed and refuses vacuous passes (§7.3).
- [ ] **(REQUIRED)** Passes Validation Matrix rows V1, V1T, V2–V12, V17–V27, V33–V42.
- [ ] **(REQUIRED)** Requires no server, JS, network, or tooling to read (Tier 0).
- [ ] *(RECOMMENDED — Append)* Resolves `data-supersedes`; enforces writing-room ordering;
      re-confirms append-only. Passes V13–V16.
- [ ] *(RECOMMENDED — Producer)* Emits conforming documents per §9.2, restricted to the single
      canonical serialization of §9.2a; deterministic rebuild is byte-identical. Passes V28.
- [ ] *(RECOMMENDED — Producer)* A producer that folds performs the fold motion (§8.4) totally
      and fail-closed. Passes V32.

> `TODO(recension)` — the roll-up row box above omits **V29, V30, V31**: three **Core** rows added
> by an earlier recension (they are in §10, and in §11.1's Core roster) that were never entered
> into any Definition-of-Done box. The one-grammar recension records the gap rather than closing
> it silently: closing it is a one-line edit to that row list, but it is outside this recension's
> contract and MUST be ruled before this checklist is used as a standalone conformance gate.
> Until then, §11.1's roster — not this checklist — is the authoritative Core row list.

### 11.3 Hardening the spec (how to drill it down)

A spec is only as unambiguous as the implementations it produces. To harden this spec, build it
from these words in **several languages with independent agents**, run all of them against §10
and §13, and treat **every divergence as a spec defect to fix** — not an implementation bug.
Identical bytes in, identical witnesses out, across every reader, is the target. An **initial
cross-reader convergence has been observed** — independent readers, including one built blind from
this specification, agree byte-for-byte on clean, corrupted, and CRLF-variant fixtures — but the
full multi-corner battery (nested boundaries, comment masking, raw-text and multibyte edges) is
the standing target, not yet a closed result.

## 12. What is NOT in v0.5

> **Note — the inert-region definition (not an exclusion).** §6.2 and §6.4a both refer to an
> "inert region." An **inert region** is, for the purposes of the boundary-token grammar (§6.2),
> the content-profile prohibition (§6.4a), and **manifest-link collection** (§5.3, R4a), exactly
> the union of: (a) the bytes between a `<!--` and its matching `-->`, i.e. an HTML comment; and
> (b) the raw-text content bytes of a `<script>` or `<style>` element — the bytes between that
> element's own opening `>` and its own `</script>`/`</style>` closing tag, which HTML defines as
> CDATA/raw text a browser never parses as markup. A boundary token or a prohibited
> content-element tag name that occurs inside an inert region MUST NOT be counted, MUST NOT match
> a boundary, and MUST NOT trigger the §6.4a content-profile refusal — it is prose or script/style
> data to a browser, and a conforming reader treats it identically. An `<a>` element whose opening
> tag occurs inside an inert region is, on the same ground, not a live manifest entry — a
> commented-out example anchor inside `nav#manifest` MUST NOT be collected by §5.3's link-
> collection rule (R4a). Bytes inside an inert region that also fall inside a witnessed span
> remain part of that span's witnessed bytes; only *boundary-token, content-profile, and
> manifest-link matching* skip them, never the witness arithmetic itself (§6.2). This note defines
> a term used normatively above; it is listed in §12 for proximity to the other structural notes,
> not because inert-region masking is out of scope — it is a Core MUST, certified by name in §10:
> the boundary-token grammar (§6.2, row V10), the content-profile prohibition (§6.4a, row V26),
> and manifest-link collection together with the manifest's own extent (§5.3, rows V40–V41, R4a/
> R4b) — not a bare reference to the §11.1 profile roster, which lists Core's scope but does not
> itself certify any one row.

A conforming v0.5 reader MUST NOT require any of these:

- **The live loop** (Claim B, §4.2) — writing a turn (model call, key, disk write) is a
  platform action a scriptless browser cannot perform. The run leg is delegated to external
  infrastructure (a shim, not a bespoke server); the format defines the *result* it must
  produce, not the apparatus that produces it.
- **A resolver tier** — no resolver, lookup service, or address-resolution protocol.
- **A selector grammar** — no CSS-selector or XPath addressing within sections.
- **Web-app machinery** — no client-side framework, service worker, or dynamic rendering; no
  executing JavaScript is required to read, address, or verify.
- **Cross-document addressing** — v0.5 Core defines no addressing across separate doc.html
  files, and no Core reader is required to follow one. It is defined instead by a published
  extension outside Core: documents may be gathered on a **shelf** (`wiki.doc.html`) whose
  entries pin leaf documents by relative href plus a `data-doc-pin` — a SHA-256 over the
  leaf's own manifest witness values in manifest order — checked by the shipped `verify_wiki`
  tools and specified in `the-wiki-shape.doc.html`; the extension adds no Core conformance
  requirement, and a document that never joins a shelf is unaffected by it.
- **A binding commitment over the *set* of sections** — each witness binds one unit's bytes;
  v0.3 has no Merkle root or signed tree head binding the *collection*. An adversary who controls
  the file can drop or reorder whole sections (in a tail document, or by removing both a section
  and its manifest entry) and every remaining witness still verifies. The witness is
  *tamper-evident per unit* — not a set-membership proof against a root — and thus not
  *tamper-resistant over the whole*. Two facts bound this precisely:
    - *An optional root can be added without disturbing v0.3.* A Merkle root over the ordered set of
      unit witnesses, carried in-band as a legible attribute with per-unit inclusion proofs, closes
      drop/reorder detection at O(log n) per unit **without changing per-unit verification** — a
      rootless document needs nothing beyond the witness it already checks. Such a layer is a
      candidate for a future version; v0.3 does not require or define it.
    - *But the external anchor is a permanent boundary, not a temporary gap.* Even a perfectly
      rooted document cannot detect a **split-view** — two internally-consistent forks, each with
      its own valid root — from its own bytes: no verifier that accepts every well-formed,
      self-consistent document can also reject one member of such a pair. Completeness, currency,
      and fork-detection therefore rest on an anchor **outside** the file — a git commit, a
      published root, a gossip of observers. This is Certificate Transparency's ceiling relocated
      into one file: *integrity is not currency*, and detection of deletion rests on something the
      file cannot contain.
- **Hierarchical manifests at extreme scale** — a flat manifest grows linearly with section
  count, and at large scale the manifest's own size becomes the binding cost. A nested manifest —
  one whose entries are themselves sub-indices — can be **projected derivably** from the flat
  append-only order, but v0.3's manifest is a *flat bijection* (§5.3: it links top-level sections
  one-to-one, and a reader rejects witness-less sub-indices), which does not admit it. Hierarchical
  addressing is a candidate for a future version. A producer MUST measure the manifest's own cost
  at scale rather than assume it is unbounded. (Manifest-first shape.) A folded record (§8.4)
  inherits the flat manifest's linear-scan cost at scale — a record of thousands of turns reads
  its gist column in one long pass, and this version deliberately does not introduce a
  hierarchical manifest to remedy that (the exclusion stands).
- **Selective skim for *unfolded* tail documents** — a live tail has no summary skim-layer;
  reading a large tail requires scanning it in order. v0.4 provides the remedy at the epoch
  boundary: the fold (§8.4) mints a gist manifest, and the folded record reads with
  the recency-window posture (§7.1). The cost statement stands for any tail **not yet
  folded** — the live epoch pays it by design, because the live epoch optimizes for
  append-simplicity, not skim.
- **The un-witnessed control plane, disclosed as a class.** Manifest link text (gists,
  titles, summaries), `data-supersedes` edges, and ordering chrome live outside every
  witnessed span. Core verification proves the sealed units' bytes; it certifies nothing
  about these routing surfaces, and the format declines to add per-surface in-band
  integrity declarations for them — any such declaration would itself be editor-controlled
  bytes, promising defense it cannot deliver. Where cross-boundary trust in routing
  surfaces is required, it comes from custody, version history, or a publisher's signature
  — out-of-band, where it has always lived.
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

---

### Vector set 3 — NON-CANONICAL boundary and content-profile refusals

This vector set names the text/rows for the R3/R4 honest-input vectors and the §6.4/§6.4a
attribute and content-profile rules introduced by this specification revision. It states the
**assertion each vector MUST satisfy**; the fixture *files* that exercise these assertions land
in a later implementation packet (P0.2/P0.4), not here.

| Vector | Boundary/rule under test | Input shape (illustrative) | Required verdict |
|---|---|---|---|
| **R3 — whitespace-in-end-tag** | §6.2 canonical close token | A `<section id="x" data-witness="…">…</section >` where the closing tag carries one interior space before `>` | `NON-CANONICAL`, with a required byte offset at the first byte of `</section >`. MUST NOT be reported as "unterminated": the depth-walk never reaches `depth = 0` under the exact-token grammar, and the reader distinguishes "no canonical close token found" from "this off-grammar token is present but not canonical." |
| **R4 — custom-element name-prefix (bare boundary case)** | §6.2 exact-tag-name open token | A top-level `<section-foo id="y">…</section-foo>` sibling adjacent to (not nested inside) a witnessed `<section id="x" data-witness="…">…</section>` | The bare `<section-foo>` open/close pair is correctly recognized as *not* a `<section>` open/close token (§6.2) — it does not perturb the depth-walk finding `<section id="x">`'s own close, and on its own is not, by the boundary-token grammar alone, a NON-CANONICAL trigger. (Contrast the *inside-span* case, next row: the same tag name, unmasked *inside* a witnessed span, is refused — a different rule, §6.4a, catches that shape; the boundary-token grammar alone does not.) |
| **§6.4 double-quote requirement** | §6.4 attribute grammar | A witnessed-unit opening tag `<section id='x' data-witness="…">` (single-quoted `id`) or `<section id=x data-witness="…">` (unquoted `id`) | `NON-CANONICAL`, with a required byte offset at the first byte of the non-double-quoted attribute value. |
| **§6.4 duplicate-attribute refusal** | §6.4 attribute grammar | A witnessed-unit opening tag `<section id="x" data-witness="…" id="x">` (repeated `id`) | `NON-CANONICAL`, with a required byte offset at the first byte of the second (duplicate) `id="x"` occurrence — regardless of whether the two values agree. |
| **§6.4a content-profile prohibition (V26)** | §6.4a — distinct from the boundary-token grammar | A `<section id="x" data-witness="…">` whose inner span contains an unmasked `<section-foo>` or `<article.x>` content element | `NON-CANONICAL`, with a required byte offset at the first byte of the prohibited element's opening tag. This vector MUST be verified to reproduce the assertion that **neither** the boundary-token grammar (§6.2 — `<section-foo>` is correctly not a boundary token) **nor** a closing-tag count guard (the prohibited element contributes no `<section>`-exact open/close token to any tally) independently catches it; only the explicit §6.4a rule does. |
| **§6.4a comment-masking exemption** | §6.4a exemption | A `<section id="x" data-witness="…">` whose inner span contains `<!-- <section-foo> -->` (the prohibited tag name inside a comment) | PASS — the occurrence is inside an inert region (§12) and is exempt from §6.4a; the witness recomputes normally over the untrimmed inner bytes including the comment text. |

A conforming implementation's fixture battery MUST include, at minimum, one document exercising
each row above, and each MUST assert the verdict column exactly — a `NON-CANONICAL` row that
instead reports "unterminated," a bare parse error, or a silent PASS is a conformance failure of
the implementation, not an ambiguity in this vector set.

---

### Vector set 4 — epoch-scoped tail verdicts (ORDINAL-ONLY, mixed-epoch, out-of-order, invalid grammar)

This vector set names the required verdicts for the §7.3a epoch-scoping rules and the negative
witness-grammar cases. Each row stands on its own: a conforming implementation MUST be able to
construct a document exercising it, and MUST assert the stated verdict. The negative battery
that forces these refusals in practice — deliberately malformed and forged documents — is
maintained and run as a release gate outside the shipped tree; it is a quality bar on an
implementation, never a substitute for the rows below.

| Vector | Rule under test | Input shape (illustrative) | Required verdict |
|---|---|---|---|
| **All-timestamp tail** | §7.3a ORDINAL-ONLY | A tail whose every `<article data-witness>` carries a grammar-valid writing-room (timestamp) witness and none carries a consecrated (SHA-256) witness | `ORDINAL-ONLY` on every reader (Core and Append) — never a bare `PASS`, even though every writing-room witness is grammar-valid (and, under Append, strictly increasing). |
| **Mixed-epoch tail** | §7.3a scoped PASS | A tail whose earlier articles are consecrated and later articles are writing-room (e.g. 2 consecrated + 2 writing-room) | `PASS (verified=2, ordinal=2)` — the two counts asserted separately, never blended into one number. |
| **Out-of-order writing-room** | §6.7/V15, Append profile only | Two writing-room articles where the second's timestamp is NOT strictly later than the first's | A Core reader (grammar-only) reports its ordinary epoch-scoped verdict (e.g. `ORDINAL-ONLY` if all-writing-room) — Core does not enforce ordering. An Append-profile reader (§11.1) MUST refuse, naming the ordering violation (V15) explicitly; it MUST NOT silently accept the mis-ordered pair. |
| **Invalid witness grammar** | §6.7, V6 | A `data-witness` value matching neither the consecrated (64-hex) nor the writing-room (20-char timestamp) grammar | `FAIL`, both readers naming the same reason (a substring identifying "invalid witness grammar") — no silent drop of the offending article, no downgrade to a different verdict. |
| **Placeholder witness grammar** | §6.7, V6 (a construction case of the row above) | A `data-witness` value that is the literal, un-filled template string `YYYY-MM-DDTHH:MM:SSZ` (the placeholder text itself, never substituted with real digits — it fails the writing-room grammar because `Y`/`M`/`D`/`H`/`S` are not the digits `\d` the grammar requires) | `FAIL`, with the **same named reason** as the invalid-witness-grammar row — a template leftover is an ordinary invalid-grammar refusal, not a special-cased silent pass or a distinct verdict. |
| **Both-match impossibility** | §6.7 | (Unreachable by construction — no string can match both the 20-char timestamp grammar and the 64-char hex grammar: the two are formally disjoint in length and alphabet, §6.7) | An implementation MUST halt loudly (an uncaught assertion failure) if this branch is ever reached — it MUST NOT silently downgrade the value to `INVALID` or otherwise resolve it. Reaching this branch is a canon emergency, not a recoverable case. |

A conforming implementation's fixture battery MUST include, at minimum, one document exercising
each row above (except the unreachable both-match row, which is asserted at the classifier level,
not via a document fixture), and each MUST assert the verdict column exactly.

### Vector set 5 — the folded record (fold motion, §8.4; row V32)

A minimal two-turn writing-room tail (one supersession edge; turn 1 carries an **authored**
`data-gist`, turn 2 carries none and receives the minted default) and the **byte-exact record
the reference fold emits** — byte-exact *as a vector*, not as a conformance claim on every
fold, since minted link text is tool documentation, not spec law. Bytes generated by the
reference fold tooling, deterministic, zero live calls.

**The tail (input):**

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>vector set 5 — two-turn tail</title></head><body>
<section id="conversation-log">
<article id="turn-000001" class="turn operator" data-role="operator" data-turn="1" data-gist="the operator&#39;s authored routing line" data-witness="87f7d663ebd0c92ca55afe94a61956f019bf71defb7e07761cdd7e56e55dbe4f" data-char-count="67">
  <div class="turn-content"><p>What does the fold mint?</p></div>
</article>
<article id="turn-000002" class="turn assistant" data-role="assistant" data-turn="2" data-supersedes="#turn-000001" data-witness="eaa737d84f16ca6377987b04153731ad0181d537a908d473168de439ca836521" data-char-count="111">
  <div class="turn-content"><p>Correction: the fold mints the gist manifest &amp; the record epoch.</p></div>
</article>
</section>
</body></html>
```

**The folded record (reference fold output; sha256
`a1d3214322d9cd13b39ae7d66bcf1e589bc9266eeb132c45ec5999e54d298c40`):**

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>vector set 5 — two-turn tail</title></head><body>
<nav id="manifest" aria-label="Document manifest">
  <ol>
    <li><a href="#turn-000001" data-witness="87f7d663ebd0c92ca55afe94a61956f019bf71defb7e07761cdd7e56e55dbe4f" data-char-count="67">the operator&#x27;s authored routing line</a></li>
    <li><a href="#turn-000002" data-witness="eaa737d84f16ca6377987b04153731ad0181d537a908d473168de439ca836521" data-char-count="111">Correction: the fold mints the gist manifest &amp; the record epoch.</a></li>
  </ol>
</nav>

<div id="conversation-log">
  <h2>Conversation log</h2>
  <p><em>Consecrated record: homogeneous, non-nesting <code>&lt;section class="turn"&gt;</code> units, read in document order. This container is itself un-witnessed chrome (a &lt;div&gt;, never a &lt;section&gt;, carries no data-witness slot); only the turns inside it are witnessed.</em></p>

<section id="turn-000001" class="turn operator" data-role="operator" data-turn="1" data-gist="the operator&#39;s authored routing line" data-witness="87f7d663ebd0c92ca55afe94a61956f019bf71defb7e07761cdd7e56e55dbe4f" data-char-count="67">
  <div class="turn-content"><p>What does the fold mint?</p></div>
</section>

<section id="turn-000002" class="turn assistant" data-role="assistant" data-turn="2" data-supersedes="#turn-000001" data-witness="eaa737d84f16ca6377987b04153731ad0181d537a908d473168de439ca836521" data-char-count="111">
  <div class="turn-content"><p>Correction: the fold mints the gist manifest &amp; the record epoch.</p></div>
</section>

</div>


</body></html>
```

Note the decoded-text law (§8.4 gist row) visible in the bytes: turn 1's authored carrier
`the operator&#39;s authored routing line` (attribute context) surfaces in the manifest as
`the operator&#x27;s authored routing line` (text-node context) — lawfully **different bytes,
one decoded value**. Every opening-tag attribute survives byte-verbatim on the section
(projection row); the two integrity carriers are minted (`data-witness` recomputed — here
identical, since the tail was already consecrated — and `data-char-count` refreshed).

**Three companion vectors — the verdicts that teach the disclosed boundary (§12, the
un-witnessed control plane).** Each mutation of the folded record above is stated with its
intended verdict; none is a refusal set:

1. **One gist character mutated in the manifest alone** (e.g. `the operator&#x27;s` →
   `The operator&#x27;s`) → **conforming under Core** — link text is authored routing; the
   mutation is invisible to §5/§6 verification. The reference gate's derive-and-compare lint
   reports the divergence (`LINT`, cause `gist-drift`/`gist-twin-mismatch`).
2. **The coordinated mutation** — `data-gist` and its manifest twin changed together, no
   witnessed byte touched → **conforming under Core** for the same reason; the reference lint
   reports it (this exact vector passed all four checkers under r3's attribute-wins law,
   reproduced firsthand 2026-07-16 — it is the standing regression for derive-and-compare in
   the maintainers' tool batteries).
3. **The `data-supersedes` edge retargeted** to another valid turn → **conforming under
   Core**, documented as un-certified routing — currency is disclosed at §7.1.

A folded record's carried gists are authored routing (§5.4) and conform as they stand; a later
re-fold under the reference gate's default generator is optional housekeeping, never an
obligation of this specification.

---

### Vector set 6 — the one-grammar refusals (§6.1, §6.6, §5.4, §6.4, §5.1, §5.3, §12, §6.7; rows V33–V42)

This vector set names the required verdicts for the eight Core rules v0.5 adds (§14), plus R4a's
loosening and R4b's dual loosening/narrowing (§14), verified below in both directions. It states
the **input shape** and the **verdict substring** each vector MUST produce, so that a reader
holding only this file can build the fixtures and reproduce the battery. Every verdict below is
REQUIRED **byte-identical across independent readers**, with a non-zero exit status; a reader that
produces the right refusal under a different reason string has not satisfied the row. The fixture
*files* exercising these rows are maintained in the maker's fixture battery, run as a release
gate outside the shipped tree; nothing in this set depends on those files existing, and every
row is reconstructible from its input-shape cell.

Unless a row says otherwise, the input is an otherwise-valid manifest-first document (§13 Vector
set 1's two-section shape) with exactly one defect introduced, every witness recomputing.

| Vector | Rule under test | Input shape (illustrative) | Required verdict |
|---|---|---|---|
| **id with a space** | §6.1 production, V33 | A top-level `<section id="bad id" data-witness="…">` with the manifest link `href="#bad id"` | `FAIL`, substring `invalid id production`, non-zero exit. Not "bad id", not a parse error, not a skipped unit. |
| **non-ASCII id** | §6.1 ASCII narrowing, V33 | A top-level `<section id="émile" data-witness="…">` with `href="#émile"`; the witness recomputes and the document is otherwise flawless | `FAIL`, substring `invalid id production`. **This is the v0.5 boundary vector:** the same bytes are conforming under v0.4 and refused under v0.5 (§14). The identical refusal is required when the non-ASCII `id` sits on a non-unit live element — a nested `<section>`, an `id`-bearing `<img>` (§5.5), or an `append-anchor` — because the production runs over the same whole-document walk as the dup-id check (§6.1, §9.1 `check_global_dup_ids`). |
| **witnessed nested section, no id — bogus witness** | §6.1 witnessed-nested pin, V34 | Inside a valid top-level section, a nested `<section data-witness="0000…0000">` (64 hex, does not recompute) carrying **no** `id` | `FAIL`, substring `nested <section data-witness> with no id`. The id refusal is reached *before* the witness arithmetic; the all-zeros witness is refused, never passed and never skipped. |
| **witnessed nested section, no id — correct witness** | §6.1 witnessed-nested pin, V34 (the narrowing) | The same document, but the nested `<section>`'s `data-witness` is the true SHA-256 of its own inner bytes | `FAIL`, substring `nested <section data-witness> with no id` — **identical to the row above**. This row is the whole point of V34: correct arithmetic does not rescue a missing address, and a reader that passes this document has narrowed the rule to a hash check. |
| **structural nested section** | §6.1 structural carve-out | Inside a valid top-level section, a nested `<section>` carrying **no** `data-witness` — one variant with a valid `id`, one with no `id` at all | `PASS` for both. A `<section>` without `data-witness` is structural: it is not recomputed, and no `id` obligation attaches to it. (An `id` it *does* carry remains subject to the production and to dup-id.) |
| **three-deep valid nesting** | §6.1 + §9.1 nested recompute (V31) under the new gate order | A valid top-level witnessed `<section>` containing a witnessed nested `<section>` containing a third witnessed `<section>`, every `id` ASCII-valid and every witness recomputing | `PASS`, with every nested unit actually recomputed (V31) — the reordered gates must not cause a valid nested unit to be skipped. |
| **malformed count strings** | §6.6 count grammar, V35 | One document per value, `data-char-count` set to each of: `120abc`, `0x78`, `１２０` (fullwidth digits), `1_20`, `+120`, `" 120"` (leading space), `"120 "` (trailing space), `0120`, `-0`, and `""` (present, empty) — on a section whose count would otherwise be correct | `FAIL`, substring `invalid char-count grammar`, for **every** value including the empty string. No best-effort parse (`120abc` is not `120`), no radix guess, no skipped check on an unreadable value. |
| **grammar-conforming counts** | §6.6 count grammar, V35 (positive) | `data-char-count="120"` on a section whose inner bytes are 120 code points; and `data-char-count="0"` on a section whose inner span is empty | `PASS` for both. `0` is in the grammar; a zero count is a count, not an absence. |
| **manifest link, href not a fragment** | §5.4 / V36 | A manifest `<a href="intro" data-witness="…">` — a real, correct witness, but no leading `#` | `FAIL`, substring `manifest link href is not a fragment`. The entry MUST NOT be silently dropped from the link list; dropping it would let the document evade the order-bijection (V29) and the manifest-names-a-missing-section check (V7). |
| **manifest link, no data-witness** | §5.4 / V36 | A manifest `<a href="#intro">` with the `data-witness` attribute removed, target section intact | `FAIL`, substring `manifest link missing data-witness`. Again never dropped. |
| **manifest link, empty fragment** | §5.4 + §6.1 / V36 → V33 | A manifest `<a href="#" data-witness="…">` | `FAIL`, substring `invalid id production` — the empty fragment is the empty id, and the empty string is not in the §6.1 production. This row pins *which* of the two rules fires. |
| **anchor outside the manifest** | §5.4 scope bound | A valid document carrying `<a href="notes.html">` (no `#`, no `data-witness`) in body prose, **outside** `<nav id="manifest">` | `PASS`. The V36 gate is exactly the `<a>` descendants of `<nav id="manifest">` (§5.3); ordinary hyperlinks are not manifest links and this recension does not widen the rule to reach them. |
| **unterminated double-quote on `id`** | §6.4 anchored walk, V37 | A top-level `<section id="bad id data-witness="…">` (the closing `"` after `bad id` is missing, so the quote opened by `id="` is never reachably closed) | `FAIL`, substring `unterminated attribute quote in tag at byte offset`, `N` = the byte offset of that `<section`'s own `<`. Not a parse error, not a silently skipped tag, not a resync to a later tag. |
| **unterminated single-quote on `id`** | §6.4 anchored walk, V37 | The single-quote twin: `<section id='bad id data-witness="…">` | `FAIL`, identical substring and offset rule as the double-quote row — the quote character does not change the verdict. |
| **unterminated quote on a non-`id` attribute** | §6.4 anchored walk, V37 | A top-level `<section id="ok" data-witness="deadbeef…>` (the `data-witness` value's closing quote is missing) | `FAIL`, substring `unterminated attribute quote in tag at byte offset`. The whole tag is unparseable regardless of which attribute carries the defect — the refusal does not depend on the broken attribute being `id`. |
| **invalid UTF-8 in witnessed content** | §5.1, V38 | A valid manifest-first document with one raw invalid byte (e.g. a bare `0xFF`) spliced into a `<section data-witness>`'s inner content | `FAIL`, substring `invalid UTF-8 at byte offset`, `N` = the offset of that byte, checked before the id scan or any witness recompute is attempted. |
| **invalid UTF-8 in an attribute value** | §5.1, V38 | The same defect spliced into a quoted attribute value (e.g. inside `data-kind="…"`) | `FAIL`, substring `invalid UTF-8 at byte offset`, `N` = the offset of that byte — the gate fires before the quote-aware attribute tokenizer (§6.4) ever runs over the tag. |
| **invalid UTF-8 inside a comment** | §5.1, V38 | The same defect spliced into an HTML comment's bytes | `FAIL`, substring `invalid UTF-8 at byte offset`. UTF-8 well-formedness is a whole-file property, not scoped by §12's inert-region mask, which governs boundary-token matching, not byte validity. |
| **overlong encoding** | §5.1, V38 | A 2-byte overlong encoding of NUL (`C0 80`) spliced into otherwise-valid content | `FAIL`, substring `invalid UTF-8 at byte offset`, `N` = the offset of the `C0` lead byte. |
| **encoded UTF-16 surrogate** | §5.1, V38 | An encoded U+D800 (`ED A0 80`) spliced into otherwise-valid content | `FAIL`, substring `invalid UTF-8 at byte offset`, `N` = the offset of the `ED` lead byte. |
| **truncated multibyte at EOF** | §5.1, V38 | A document whose file ends mid-sequence — a lead byte (e.g. `E2`) with no continuation bytes following it, at end of file | `FAIL`, substring `invalid UTF-8 at byte offset`, `N` = the offset of that lead byte. |
| **`a<b` prose, no quote** | §6.4 anchored walk, V37 (the discriminator) | A valid document whose body prose contains `a<b` and `c<d`, with no quote character anywhere before the next `<` or end of file | `PASS`. `<b`/`<d` are candidate tag starts by the letter-after-`<` rule, but neither opens a quote, so neither is a tag at all — left exactly as invisible as before this recension, never refused. |
| **valid multibyte document** | §5.1 well-formed baseline, V38 (positive) | A valid manifest-first document whose content mixes CJK characters, an emoji outside the BMP, and Latin-1 Supplement letters — all well-formed UTF-8 | `PASS`, byte-identical output to the same document verified without the §5.1 gate — the well-formedness check adds no refusal to a document that was already well-formed. |
| **U+2028 is NOT an attribute separator** | §6.4 enumerated separator set, V39 (ruled 2026-08-22) | A live `<b data-x="y"⟨U+2028⟩id="intro">` outside every witnessed span, whose `id` value collides with a real `<section id="intro">` | `PASS`, `verified 2/2 sections`, byte-identical on both readers — U+2028 is not one of HTML5's five, so it is absorbed into the attribute NAME (`⟨U+2028⟩id`), the `<b>` carries no `id` any reader or browser can see, and the collision the control refuses is invisible (`r8-ruled-sep-u2028.doc.html`). Sealed `dev` baseline: `FAIL: duplicate id: intro` on both readers — this row is a loosening, and the Reckoning names it. |
| **ASCII SPACE IS an attribute separator (the control)** | §6.4 enumerated separator set, V39 (the discriminator) | The byte-for-byte same document with the U+2028 replaced by `U+0020` SPACE | `FAIL`, substring `duplicate id: intro`, byte-identical on both readers (`r8-ruled-sep-space-control.doc.html`). The pair exists so V39 cannot be satisfied vacuously: one codepoint decides the verdict. |
| **`0x0B` VT is NOT a §6.2 boundary byte** | §6.2 boundary-token open set, V10 (ruled 2026-08-22) | A tail document with two witnessed `<article>` units, the FIRST joined to its attributes by a single `0x0B` VT byte instead of a space — `<article⟨0x0B⟩id="t-one" data-witness="…">` | `PASS`, `verified 1/1 articles`, byte-identical on both readers (`r8-ruled-vt-tag-name.doc.html`). VT is not one of §6.2's five whitespace bytes, so `<article⟨0x0B⟩` is **not an open token**: the unit is not found at all, its bytes are ordinary body content, and only the OTHER article is addressable — which is exactly what a browser does with the same bytes (it reads `article⟨0x0B⟩` as the tag NAME and produces no `<article>` element). Sealed `dev` baseline: `verified 2/2 articles`, rc=0 on both readers — same rc, moved output; the Reckoning names it. |
| **ASCII SPACE IS a §6.2 boundary byte (the control)** | §6.2 boundary-token open set, V10 (the discriminator) | The byte-for-byte same document with the `0x0B` replaced by `U+0020` SPACE (one byte, at offset 163) | `PASS`, `verified 2/2 articles`, byte-identical on both readers and on the sealed `dev` pair (`r8-ruled-vt-tag-name-control.doc.html`). The pair exists so the ruling cannot be satisfied vacuously: one byte decides how many units the document has. |
| **manifest, commented-out anchor beside live entries** | §5.3 link-collection masking, V40 (positive, R4a) | A manifest containing one live, conforming `<a href="#intro" data-witness="…">` plus two commented-out anchors that would each independently violate V36 if they were live (a non-fragment `href`; a missing `data-witness`) | `PASS`, `verified 1/1 sections`, byte-identical on both readers — the commented anchors are never collected (`pass-manifest-commented-anchor.doc.html`). |
| **manifest, commented-out anchor beside a live malformed one** | §5.3 link-collection masking, V40 (the mask must not over-reach) | The same commented anchors, plus one genuinely live `<a href="example.html" data-witness="…">` (no `#`) alongside the live conforming entry | `FAIL`, substring `manifest link href is not a fragment: example.html` — the mask hides the dead comment, not a live malformed entry (`r4-live-anchor-beside-comment.doc.html`). |
| **manifest, `</nav>` inside a comment, real entries precede it** | §5.3 extent masking, V41 (loosening) | A manifest containing two witnessed sections, with an HTML comment between the manifest's two `<li>` entries containing the literal text `</nav>` | `PASS`, `verified 2/2 sections`, byte-identical on both readers — the comment-embedded `</nav>` is not the manifest's real close (`pass-manifest-comment-contains-nav-close.doc.html`). Sealed `dev` baseline: `FAIL: order-bijection…` on this same input — this row is the loosening direction. |
| **manifest, no unmasked `</nav>` anywhere** | §5.3 extent masking, V41 (narrowing) | A manifest whose ONLY `</nav>`-shaped bytes are inside a comment, with no real close anywhere in the document | `FAIL`, substring `<nav id="manifest"> is unterminated`, byte-identical on both readers (`r4b-manifest-unterminated.doc.html`). Sealed `dev` baseline: `PASS`, `rc=0`, on both sealed readers — the same unmasked truncation happens to land past every real entry, so `dev` verifies the truncated document clean; this row is the narrowing direction. |
| **manifest, `</nav>` wholly absent, article present** | §5.3 extent masking, V18, V41 (mjs fail-open closed) | A manifest-first document whose `<nav id="manifest">` has no `</nav>` anywhere — no comment involved — followed by a witnessed `<article>` | `FAIL`, substring `mixed shapes`, byte-identical on both readers (`r4b-nav-close-absent.doc.html`) — V18 runs before the manifest path, so the unterminated verdict is unreachable on this shape. Sealed `dev` mjs baseline: fell through to the tail path and could `PASS` this same input; sealed `dev` py baseline already refused it as mixed-shapes. |
| **manifest, `</nav>` wholly absent, no article** | §5.3 extent masking, V41 | The same absent close with no witnessed `<article>` anywhere | `FAIL`, substring `<nav id="manifest"> is unterminated`, byte-identical on both readers (`r4b-nav-close-absent-no-article.doc.html`). Sealed `dev` py: same verdict; sealed `dev` mjs — which had no unterminated verdict — reported `FAIL: shape detection failed …` instead. |
| **nested consecrated witness with a trailing newline** | §6.7 full-string match, V42 | Inside a valid top-level witnessed `<section>`, a nested `<section data-witness="…">` whose witness is the TRUE SHA-256 of its own inner bytes with one trailing `\n` appended (65 bytes, not 64) | `FAIL`, substring `invalid witness grammar on nested` — the trailing newline makes the value a non-match of the consecrated grammar under a full-string reading, and the reader MUST NOT accept it as consecrated-but-mismatched (`r9-witness-consecrated-trailing-newline.doc.html`). |

A conforming implementation's fixture battery MUST include, at minimum, one document exercising
each row above, and each MUST assert the verdict column exactly — including the `PASS` rows,
which exist to bound the four new refusals so they do not spread past their stated scope.

**Residual, disclosed.** Same-reason parity is REQUIRED for the verdicts in *this* set. It is not
yet uniform across the pre-existing refusals: the reference readers still spell some older
mismatch verdicts differently from one another (a `FAIL section id=` form against a `MISMATCH`
form). That drift predates this recension, is untouched by it, and is a standing conformance
defect under §11.3's rule that every cross-reader divergence is a spec defect to fix. A second
instance of the same pre-existing class was surfaced (not introduced) while validating V39: the
order-bijection refusal (V29, `_verify_manifest_first`'s manifest-order-vs-body-order check,
untouched by this recension) renders its two id-sequence lists differently on each reader —
Python's `f"{list}"` produces `['intro', 'fold']` (repr, quoted, comma-space), verify.mjs's
template literal produces `[intro,fold]` (bare join) — reachable by, among other inputs, a
U+200B-swallowed section `id` (R8). Both readers agree on exit code, on the verdict prefix, and
on the underlying fact; they disagree on list-rendering style. This is not a V39 defect (the
separator recognition itself is proven byte-identical, R8) and is not fixed here; it is named so
it is not mistaken for a new divergence this recension introduced. A THIRD instance was surfaced
(again not introduced) by R8's follow-up sweep, which additionally unified the canonical-quoting
check's own separator predicate (`_refuse_noncanonical_attrs`/`refuseNonCanonicalAttrs`, previously
`bytes.isspace()` vs the engine `/\s/` — now both `_ATTR_SEP`/`ATTR_SEP`) and fixed a THIRD unpinned,
engine/language-versioned class found by the same grep sweep: `verify.py`'s `_WRITING_ROOM_RE`
(§6.7) used Python's Unicode-aware `\d` where its OWN stated grammar above (and verify.mjs's
already-correct `WRITING_ROOM_RE`) both use `[0-9]` — a witness value shaped like a timestamp but
spelled in fullwidth digits was silently admitted as a valid writing-room epoch on verify.py and
correctly refused at shape detection on verify.mjs. Fixing it made both readers reach the SAME
"shape detection failed" refusal for the first time on this input, which exposed that its two
phrasings ALSO differ (`"…<article> with valid grammar"` vs `"…<article> elements with
valid-grammar witness"`) — a fourth instance of this same residual class, disclosed here, not
fixed. None of these wording drifts were introduced by any fix in this recension; each was
surfaced by a fix that, for the first time, drove both readers down a shared pre-existing code
path on an input neither had been exercised against before.

**Corrected severity.** The paragraph above describes only the TAIL-shape probe for the
fullwidth-digit `_WRITING_ROOM_RE` bug, where a malformed top-level article witness never reaches
the witness classifier through a success path and both readers land on rc=1 regardless — that
framing understates the bug. A **nested** `<section data-witness>` carrying the identical
fullwidth-digit value routes through `_classify_witness`/`classifyWitness` directly, and there the
sealed `dev` baseline genuinely splits: `verify.py` classified it WRITING_ROOM-valid and PASSED
(`verified 1/1 sections`, `rc=0`); `verify.mjs` correctly refused it, `rc=1`. This is a true
PASS/FAIL split on the sealed pair, not a same-rc wording drift, and is fixed by the identical
`[0-9]`-based `_WRITING_ROOM_RE` change named above. Fixture `r8-nested-wr-fullwidth.doc.html`.

**R9's own probes reached two more instances of the same standing class, neither fixed here.**
(1) A tail-shape article whose writing-room witness carries a trailing newline
(`"…Z\n"`) reaches the IDENTICAL "shape detection failed" refusal named above, both before and
after the V42 fix — before, because `verify.py` wrongly classified it grammar-valid and took a
different (ORDINAL-ONLY) path than `verify.mjs`'s correct refusal; after, both readers agree the
document fails shape detection, but the fourth-instance phrasing drift above is what they
disagree on. This is the SAME input class already named, reached by a different route (a
trailing newline rather than a fullwidth digit); the TAIL-shape input itself is not shipped as a
checked fixture, for the identical reason the fullwidth-digit tail-shape probe above was not.
**Corrected severity:** as with the fullwidth-digit case, the tail-shape framing understates this
bug — a **nested** `<section data-witness>` writing-room witness carrying the identical trailing
newline routes through `_classify_witness`/`classifyWitness` directly, where the sealed `dev`
baseline genuinely splits (`verify.py` PASSES, `verified 1/1 sections`, `rc=0`; `verify.mjs`
refuses, `rc=1`) rather than agreeing at rc=1 on a wording drift. This nested shape IS shipped,
as `r9-nested-wr-trailing-newline.doc.html`, under the same `invalid witness grammar on nested`
substring as the fixture in (2) below. (2) The nested-witness refusal path
(`FAIL: invalid witness grammar on nested <section id=…>`, the V42 vector row above) renders its
own element description differently on each reader — `verify.py`'s f-string wraps it in literal
angle brackets, `<section id=n1>`; `verify.mjs`'s template literal does not, `section id=n1` —
a FIFTH instance of the same class, surfaced (not introduced) by V42's own fixture and previously
un-narrated in prose, though the fixture battery already carries one prior fixture exercising this
exact code path (`r2-nested-valueless-witness.doc.html`) under an EXPECT.tsv substring
(`invalid witness grammar on nested`) chosen short enough to sidestep it. The V42 fixture uses
the identical substring for the identical reason.

## 14. Versioning policy

This document specifies **version 0.5** of the doc.html format.

**What v0.4 was.** v0.4 was additive over v0.3: it defined the fold motion (§8.4), the gist
link-text form and the §5.4 disclosure, the recency-window reading posture (§7.1), and matrix
row V32 (Producer). Every v0.3-conforming document remained v0.4-conforming, and — stronger —
v0.4 added **no Core conformance requirement at all**: a v0.3 reader and a v0.4 reader verify the
same documents to the same verdicts.

**What v0.5 is, stated plainly: a Core boundary, not only an addition.** v0.5 adds eight **Core**
conformance requirements — the one-grammar recension:

1. §6.1's id production is **ASCII** (`start := [A-Za-z_]`, `cont := [A-Za-z0-9_.:-]`), enforced
   over every live element (row V33). This **revokes** the permission v0.4 granted to non-ASCII
   letters in ids. It also now REFUSES a valueless `id` (`<div id>`, no `=`) identically to
   `id=""` — a valueless attribute is present-but-empty, not absent (R1a; the earlier recension
   text skipped it, which was itself a defect this version fixes, not a widening beyond what row
   V33 already stated).
2. A nested `<section>` carrying `data-witness` MUST carry an `id` (§6.1, §5.2; row V34).
3. A present `data-char-count` MUST match the §6.6 count grammar (row V35).
4. A manifest link MUST carry a `#`-fragment `href` and a `data-witness`, and a link missing
   either is refused rather than dropped (§5.4; row V36).
5. The whole-document `id` walk (§6.4, §9.1 `check_global_dup_ids`) MUST refuse — never silently
   skip, never resynchronize past — an opening tag whose attribute quote opens and is never
   reachably closed, naming the offset of that tag's own `<` (row V37).
6. **The same whole-document walk MUST also refuse a duplicated attribute NAME on ANY opening tag
   it visits** (`id`-bearing or not — an `<img>`, an append-anchor, a structural nested
   `<section>` — not only `<section>`/`<article>` unit openers), naming
   `duplicate attribute name '<name>' in tag at byte offset <N>` at that tag's own `<` (R6c; row
   V37 amendment). **Honest consequence, disclosed:** `r6c-dup-id-img.doc.html` (a duplicated
   `id` attribute on a plain `<img>`, not a unit opener) **PASSES on the sealed `dev` baseline**
   — the pre-existing V25 refusal only ever ran on `<section>`/`<article>` openers, so a
   duplicated name anywhere else was invisible — and **FAILS on both v0.5 readers**, byte-
   identically, under this rule. This is a genuine narrowing this recension introduces, not a
   restatement of an existing row.
7. The document's raw bytes MUST be well-formed UTF-8, checked before every other rule this
   specification defines; an ill-formed byte anywhere MUST be refused at its offset, never
   substituted (U+FFFD) and never leniently decoded (§5.1; row V38). This item closes a
   pre-existing cross-reader divergence rather than narrowing behavior any reader had previously
   specified as conforming — see §5.1 for the divergence it closes.
8. Both witness grammars (§6.7) MUST be evaluated as a **full-string** match, the same discipline
   the id production already held itself to (row V42; the round-7 R1 amendment named this
   requirement in the abstract for `valid_id`/`parse_count` but had not yet been found live in the
   witness grammar). **Honest consequence, disclosed:** a writing-room witness with a trailing
   newline was accepted as an ordinal by the sealed Python reader and refused by the sealed Node
   reader; both now refuse. This item closes a pre-existing cross-reader divergence — the same
   species as item 7's — rather than narrowing behavior either sealed reader had specified as
   conforming.

**The §6.4 attribute-separator set: ruled 2026-08-22, and NOT one of the eight narrowings.**
§6.4's separator set is a v0.5 *definition* (row V39), not a new refusal, so it is recorded
here rather than in the list above — but its content changed at the Operator sitting and the
change is not neutral, so it is stated plainly. Until that sitting the set was 25 codepoints:
the JS engine's `\s`, frozen by enumeration (R8) so neither reference reader borrowed a live,
unpinned Unicode table. The freeze closed the cross-*reader* skew but left the reader reading a
tag differently from every browser that would render the same bytes: HTML5's
before-attribute-name state treats only TAB/LF/FF/SPACE as whitespace — CR reaching it as LF
through input-stream normalization — and folds every other one of those 25 codepoints into the
*following attribute name*. **Ruled: narrow to HTML5's five.** What is verified must be what is
read.

The ruling's direction is a **loosening**, and it must not be filed as anything else. A
document whose only defect hid behind a non-member separator — `<b data-x="y"⟨U+2028⟩id="…">`
smuggling a duplicate or off-grammar `id` — now verifies, because under the narrowed set no
reader sees an `id` attribute there at all, and neither does a browser: there is no longer a
defect for anyone to catch. Measured against the sealed `dev` pair, `r8-ruled-sep-u2028.doc.html`
moves from `FAIL: duplicate id: intro` (both sealed readers) to `PASS` (both v0.5 readers);
its one-codepoint-different control `r8-ruled-sep-space-control.doc.html` still FAILs on all
four, which is what makes the pair a pin rather than a vacuous PASS. In the other direction,
`r6-sep-u2028.doc.html` and `r8-noncanonical-sep-ufeff.doc.html` move from `PASS` on both
sealed readers to `FAIL` on both v0.5 readers: the separator that used to divide `id` from
`data-witness` no longer does, so the witnessed unit is read as carrying no witness and is
refused on that ground. **The impact on the corpus is zero** — no tracked or shipped document
contains a non-member codepoint inside a tag, so the lockstep gate's narrowed-document pin is
unmoved by this ruling.

**§6.2's boundary-token open set: ruled 2026-08-22 as well, in the same sitting, and also not
one of the eight narrowings.** §6.2's set is a v0.5 definition on the same footing as §6.4's, and
it moved for the same reason. It admitted `0x0B` VT as a byte that may follow a tag name; `0x0B`
is not HTML5 whitespace, and a browser reads `<section\x0b…>` as one long tag NAME and produces
no `<section>` element at all, while the boundary-token walk called it an open token. **Ruled: VT
is removed.** What is verified must be what is read — one position earlier in the tag than the
separator ruling, on the identical argument. The two sets now rest on the same HTML5 five, and
the inversion that briefly held between them is closed.

The direction of THIS ruling is not a single direction, and the measurement says so:

- **The element stops existing.** Before: `<section\x0bid="x">` was an open token whose first
  attribute read as `\x0bid`, so the unit was found and carried no `id`. After: it is not a
  token at all, and no unit is found there. On a manifest-first document whose manifest names
  that section, both readers refused before AND after — `FAIL: order-bijection` either way — so
  the **user-visible rc does not move** on that shape; what moves is the body-order list the
  verdict prints, from `[None, 'fold']` (found, id-less) to `['fold']` (not found). Measured on
  both trial readers; the sealed `dev` pair verifies the same bytes CLEAN, rc=0, because its
  `\s`-based re-parse skipped the VT and read the `id` outright.
- **On a tail document it is a loosening in output, at unchanged rc.** `r8-ruled-vt-tag-name.doc.html`
  — two `<article>` units, the first joined to its attributes by VT — verifies `1/1 articles`
  under the ruling (the VT-joined article is invisible; its bytes are ordinary body text) where
  the sealed `dev` pair verifies `2/2`. Both rc=0. Its one-byte-different control
  `r8-ruled-vt-tag-name-control.doc.html` (ASCII SPACE) verifies `2/2` on all four readers, which
  is what makes the pair a pin rather than a vacuous PASS.
- **Corpus impact: zero.** No tracked or shipped document contains `0x0B` anywhere, so the
  lockstep gate's narrowed-document pin is unmoved by this ruling, exactly as it was unmoved by
  the separator ruling.

One residual of §6.2 is **not** ruled and is disclosed at §6.2 itself: the close-tag near-miss
discriminator, which decides whether `</TAG…>` is a `NON-CANONICAL` near-miss or a longer tag
name, still admits VT, so `</section\x0b>` is refused rather than skipped. That is the
fail-closed direction, it is byte-identical on all four readers (both trial, both sealed `dev`),
and the sitting did not reach it.

v0.5 also makes changes at the manifest's masked edges (R4a, R4b), disclosed here on the same
footing as the eight narrowings above rather than folded silently into "additive." R4a is a
**pure fail-closed loosening**: it turns a FAIL the sealed `dev` baseline produced — on a document
conforming under every other rule this contract states — into a PASS, and moves no verdict the
other direction. **R4b is not purely one-directional**: the same masked-extent rule turns a FAIL
into a PASS on one shape and a PASS into a FAIL on another, depending on where inside the manifest
comment the false `</nav>`-shaped bytes happen to fall relative to the manifest's real entries.

1. **R4a — a commented-out `<a>` inside `nav#manifest` is not collected.** An `<a>` inside a §12
   inert region (an HTML comment, most concretely) within `nav#manifest` is no longer collected as
   a manifest link at all (§5.3, §12, §9.1; row **V40**). A commented-out duplicate `<a href="#x">`
   sitting beside two LIVE `<a href="#x">` entries, which the sealed `dev` baseline refused under
   the order-bijection check (V29) because it counted the commented anchor as a third entry, now
   **PASSES** under v0.5, because the commented anchor is never collected in the first place —
   verified by fixture `r4a-loosen-commented-duplicate.doc.html` (sealed `dev`: `FAIL:
   order-bijection…`; v0.5: `PASS`, byte-identical on both readers).
2. **R4b — a manifest comment containing the literal bytes `</nav>` does not close the manifest —
   but this cuts both ways, not only toward PASS.** The manifest's extent (§5.3 "Extent") now runs
   to the first `</nav>` close token found **outside** a §12 inert region, not to the first raw
   `</nav>`-shaped byte sequence wherever it falls (§5.3, §12, §9.1; row **V41**).
   - **Loosening.** A manifest whose comment happens to contain the literal text `</nav>` — a
     commented-out usage example, say — with every real manifest entry still preceding it, was
     truncated at that in-comment occurrence by the sealed `dev` baseline and refused, misleadingly,
     as an order-bijection failure (an over-refusal on a document with no other defect); it now
     **PASSES** under v0.5. Fixture `pass-manifest-comment-contains-nav-close.doc.html`.
   - **Narrowing.** A manifest whose ONLY `</nav>`-shaped bytes are inside a comment, with no real
     close anywhere, is a document the sealed `dev` baseline's SAME unmasked, unpinned
     `find(b'</nav>')` happens to truncate past every real entry — so `dev` verifies it **CLEAN**,
     `rc=0`, on both sealed readers, truncation and all. v0.5 refuses it: `FAIL: <nav
     id="manifest"> is unterminated`, rc=1. Fixture `r4b-manifest-unterminated.doc.html`. This is a
     genuine PASS→FAIL narrowing this recension introduces at the SAME rule that also loosens the
     case above; it is not counted as an independent ninth item among the eight narrowings, because
     it is the identical masked-extent rule (V41) read on a different input shape, not a separate
     new requirement.
   - **Fail-open closed (mjs only).** A wholly-absent `</nav>` — no comment involved — followed by a
     witnessed `<article>` PASSED on the sealed `dev` mjs baseline via a mis-fallthrough into the
     tail-shape path, on a document the sealed `dev` py baseline already correctly refused as
     mixed-shapes. Both v0.5 readers now agree with `dev` py: `FAIL: mixed shapes …`, rc=1 — V18
     is evaluated before the manifest path, so the unterminated verdict is unreachable on an
     article-bearing document. Fixture `r4b-nav-close-absent.doc.html`. The unterminated verdict
     itself is exercised by `r4b-nav-close-absent-no-article.doc.html` (same absent close, no
     article): both v0.5 readers `FAIL: <nav id="manifest"> is unterminated`, rc=1; sealed `dev`
     py the same; sealed `dev` mjs `FAIL: shape detection failed …` (its missing verdict).

All of R4a's and R4b's shapes above are deliberate and disclosed, not an oversight: zero documents
in the shipped corpus are known to be affected by any of them (no shipped doc.html carries a
commented-out manifest `<a>`, a manifest comment containing the literal bytes `</nav>`, or a
wholly-absent manifest close). Dev-baseline verdicts for every fixture named above are recorded
and gate-verified in the maker's fixture battery, run as a release gate outside the shipped tree.

The honest consequence: **a v0.4-conforming document is not automatically v0.5-conforming.** A
document carrying a non-ASCII `id` (`id="émile"`) or a valueless `id`, a malformed
`data-char-count` string (`0120`, `120abc`, `１２０`, or the present-but-empty
`data-char-count=""`), a witnessed nested `<section>` with no `id`, a manifest link whose `href`
is not a fragment or which carries no `data-witness`, an opening tag with an unterminated
attribute quote, a duplicated attribute name on ANY opening tag (not only a unit opener), or a
byte sequence that is not well-formed UTF-8, **conformed under v0.4 — or was silently accepted or
inconsistently reported by a v0.4 reader — and is non-conforming, refused outright, under v0.5**
— a v0.5 reader MUST refuse where a v0.4 reader passed or diverged. Conversely, a document whose ONLY defect is a malformed `<a>` inside a commented-out region of
`nav#manifest` (R4a), or whose ONLY defect is a manifest comment containing the literal bytes
`</nav>` while every real manifest entry still precedes it (R4b's loosening shape), conformed
neither under v0.4 nor v0.5's own earlier drafts, but now conforms under v0.5 — these are the two
loosening shapes in this recension, and the only direction in which a document's verdict can move
from FAIL to PASS. R4b's narrowing companion (a manifest whose ONLY `</nav>`-shaped bytes are
inside a comment, with no real close at all) and the closed `dev`-mjs fail-open on a wholly-absent
`</nav>` both move the opposite direction, PASS to FAIL, and are counted with this recension's
narrowing behavior above, not with its loosenings. No compatibility shim, no normalization, and no legacy mode is defined
for the eight narrowings: §6.5's zero-equivalence-classes discipline governs the address as it governs the
witness, and a v0.5 reader offering a v0.4 leniency knob is not a conforming v0.5 reader.
Documents whose ids, counts, nested sections, manifest links, opening tags (including their
attribute-name uniqueness), and raw bytes already satisfy the eight rules above, and which carry
no commented-out manifest anchors and no manifest comment containing the literal bytes `</nav>` —
every document the reference tooling has emitted — are unaffected: their v0.4 and v0.5 verdicts
are identical. Nothing else about v0.4 is withdrawn; the
fold motion, the gist form, and the recency-window posture stand unchanged.

The ground for paying that cost is stated at §6.1: a production a reader can evaluate with a text
editor and SHA-256 and nothing else is the property this format sells (§3, §5.6 Tier 0, row V12);
a production resting on a versioned Unicode table is not, and would let two readers built from
this text alone disagree about the same document. v0.5 therefore pins **no** Unicode version for
ids, and needs none.

The version is stated here in
prose; it is **not** encoded in any machine-readable attribute. A reader implementing v0.5
SHOULD fail loudly when it encounters a non-conforming manifest shape (for example, a v0.1
JSON-island manifest). Silent degradation is discouraged. Future
versions will be specified in their own document; this text remains the canonical
specification.
