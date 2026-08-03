# doc.html — Format Specification

**Status:** v0.4 (language-agnostic) · Public domain

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
  selectively, no server, no JS). **This is what v0.4 specifies.**
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
| `href` | REQUIRED | A fragment reference (`#id`) whose value matches the target section's `id`. |
| `data-witness` | REQUIRED | MUST exactly equal the `data-witness` on the target `<section>`. |
| `data-char-count` | OPTIONAL | Independent per carrier. Where present on both link and section, the two MUST agree; absence on either is permitted and is not a failure. |
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

### 6.2 The witnessed bytes

The witnessed bytes of an addressable unit (a `<section>` in manifest-first shape, an
`<article>` in tail shape — collectively "the addressable element") are **exactly** the literal
bytes between the `>` that ends the addressable element's opening tag and the `<` that begins
its own closing tag — the **raw inner span, UTF-8, untrimmed**. No leading or trailing newline
is added or removed before the witness is computed or checked.

**The boundary-token grammar (normative, exact).** Let *TAG* be the tag name of the addressable
element (`section` for manifest-first, `article` for tail). A byte sequence is an **open token**
for *TAG* if and only if it is the literal bytes `<` followed by *TAG* (case-sensitive, lowercase)
followed by exactly one of: ASCII whitespace, `/`, or `>` — and no other byte. This is an
**exact tag-name match**, not a prefix match: the open-token test MUST NOT match on a shared
prefix followed by any other byte. `<section-foo>` is therefore **not** a `<section>` open token
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

Within an element's start tag, attributes are `name` or `name=value` pairs separated by ASCII
whitespace. A conforming reader MUST tokenize **quote-aware**: a quoted value runs to its
matching quote character, and a `name=` sequence appearing *inside* another attribute's quoted
value is part of that value, not a separate attribute. A reader that matches attributes with a
naïve substring or unquoted regex can be fooled by an `id=` or `data-witness=` string embedded
in another attribute's value; the quote-aware rule is REQUIRED so the real `id` and
`data-witness` cannot be impersonated.

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
quoting or not — the tag is NON-CANONICAL and a conforming reader MUST refuse with a required
byte offset (§6.2) pointing at the second (duplicate) occurrence. A reader MUST NOT silently
prefer the first occurrence, the last occurrence, or any other resolution rule; a duplicated
attribute name is itself the refusal condition, independent of whether the two values agree.

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
    # --- §6.1 global dup-id, over EVERY live element, before shape dispatch ---
    # Walks every opening tag in the document (outside inert regions, §12) — not only
    # addressable-unit opening tags — because §6.1's uniqueness rule is a property of the
    # whole document's id space (top-level sections/articles, nested sections, manifest
    # link targets, id-bearing <img> elements under §5.5, anything else carrying id=).
    check_global_dup_ids(bytes)                                # §6.1 fail-closed, whole-doc scope

    # --- Shape detection (§5.0) ---
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
    links = collect_anchor_descendants(manifest)               # §5.3
    sections = collect_top_level_sections(bytes)               # §5.2
    if len(sections) == 0: FAIL("vacuous: zero addressable units")  # §7.3 non-vacuity

    # --- Order-bijection (V29) ---
    # The manifest's link order and the body's top-level section document-order MUST name
    # the identical id sequence — same id-set, same order. A manifest that lists the same
    # sections in a different order than they appear in the body is refused; this is
    # distinct from V7 (a manifest naming a MISSING section) and from V5 (dup-id).
    manifest_id_seq = [read_attr_quote_aware(l, "href")[1:] for l in links]  # strip leading '#'
    body_id_seq     = [read_attr_quote_aware(sec, "id") for sec in sections]
    if manifest_id_seq != body_id_seq: FAIL("order-bijection: manifest order != body order")  # V29

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
        if cc_link and cc_sec and cc_link != cc_sec: FAIL("char-count disagreement")
        if cc_sec and int(cc_sec) != codepoint_count(inner): FAIL("char-count wrong")  # §6.6

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
    for sec in collect_all_sections(bytes):                    # includes nested, any depth
        id = read_attr_quote_aware(sec, "id")
        if id in seen_ids: continue                            # already verified above (top-level)
        w = read_attr_quote_aware(sec, "data-witness")
        if w is None: continue                                 # non-witnessed structural nesting
        seen_ids.add(id)                                        # dup-id already enforced globally
        inner = witnessed_bytes(bytes, sec, tag="section")
        epoch = classify(w)
        if epoch == INVALID: FAIL("invalid witness grammar")
        if epoch == CONSECRATED:
            if sha256_hex(inner) != w: FAIL("witness mismatch (nested section)")
        cc = read_attr_quote_aware(sec, "data-char-count")
        if cc and int(cc) != codepoint_count(inner): FAIL("char-count wrong (nested section)")  # §6.6

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
    seen = set()
    for tag in collect_all_opening_tags(bytes):                # quote-aware attrs, §6.4
        id = read_attr_quote_aware(tag, "id")
        if id is None: continue
        if id in seen: FAIL("duplicate id")                    # §6.1 fail-closed, whole-doc scope
        seen.add(id)
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
| V22 | Core | both | A close tag carrying interior whitespace (e.g. `</section >`) is not a canonical close token (§6.2) → FAIL `NON-CANONICAL` with a required byte offset, never reported as "unterminated". |
| V23 | Core | both | A tag sharing an addressable element's tag name as a prefix but not matching the exact-tag-name open-token grammar (e.g. `<section-foo>`) is not a boundary token of any kind (§6.2) and MUST NOT be treated as an open or close token by either the depth-walk or the unit-discovery scan. |
| V24 | Core | both | A witnessed-unit opening tag carrying a single-quoted or unquoted attribute value → FAIL `NON-CANONICAL` with a required byte offset (§6.4). |
| V25 | Core | both | A witnessed-unit opening tag carrying a duplicated attribute name → FAIL `NON-CANONICAL` with a required byte offset pointing at the duplicate occurrence (§6.4), regardless of whether the two values agree. |
| V26 | Core | both | A witnessed span containing, outside an inert region, a content element whose tag name is `section` or `article` followed by `-`, `.`, or `:` → FAIL `NON-CANONICAL` with a required byte offset (§6.4a); this case is distinct from V23 and is not caught by the boundary-token grammar or a closing-tag count guard. |
| V27 | Core | both | Shape detection (§5.0) is satisfiable by a single quote-aware byte-scan for `<nav id="manifest">` or a valid-grammar `<article data-witness>` opening tag, without constructing a DOM tree or invoking an HTML parser. |
| V28 | Producer | both | A conforming Producer emits only the canonical serialization named in §9.2a (lowercase tags, zero-interior-whitespace close tags, double-quoted attributes, no duplicated attribute names, no unmasked section-/article-prefixed content element inside a witnessed span); a Producer emitting any other construct is non-conforming at the Producer profile. |
| V29 | Core | manifest-first only | The manifest's link order and the body's top-level section document-order MUST name the identical id sequence (§9.1 order-bijection) → a manifest that lists the same id-set in a different order than the body → FAIL. Distinct from V7 (a manifest naming a section absent from the body) and V5 (dup-id): this row catches a same-id-set, wrong-order manifest. |
| V30 | Core | both | The §6.1 dup-id check (§9.1 `check_global_dup_ids`) walks **every** opening tag in the document, not only addressable-unit opening tags — a duplicate `id` between a top-level section/article and a nested section, a manifest-anchor target, or an `id`-bearing `<img>` (§5.5) → FAIL closed, same as two top-level sections sharing an id (V5). |
| V31 | Core | manifest-first only | A **nested** `<section data-witness>` (not reachable from the manifest's top-level link list, but present inside another witnessed unit's span) has its own witness recomputed and compared, exactly as a top-level section's is — a nested section's `data-witness` is never decorative. Closes the divergence between a manifest-driven reader and an isolation-mode checker that recomputes every section it finds regardless of nesting depth (§9.1 nested-recompute clause). |
| V32 | Producer | tail → manifest-first | The fold is total and fail-closed: a tail containing a grammar-invalid witness, a duplicate id, a self/forward/dangling `data-supersedes`, or zero addressable units folds to **nothing** — zero bytes written, non-zero exit (§8.4). |

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
  addressable-unit ids); manifest order-bijection; nested witnessed-section recompute. A Core
  reader classifies a tail article's witness by grammar and recomputes only the consecrated
  epoch; it is not required to enforce writing-room ordering — that is the Append seam named
  explicitly in §5.3b. Rows V1, V1T, V2–V12, V17–V31. Core is **unchanged** by v0.4 — v0.4
  adds no Core conformance requirement. A Core reader reading a folded record sees an
  ordinary manifest-first document and verifies it under the unchanged rules; no
  folded-record inference is ever made from link-text shape.
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
- [ ] **(REQUIRED)** Validates the id production and fails closed on duplicate ids (§6.1).
- [ ] **(REQUIRED)** Classifies a witness into exactly one epoch by form, and refuses invalid
      grammars (§6.7).
- [ ] **(REQUIRED)** Fails closed and refuses vacuous passes (§7.3).
- [ ] **(REQUIRED)** Passes Validation Matrix rows V1, V1T, V2–V12, V17–V27.
- [ ] **(REQUIRED)** Requires no server, JS, network, or tooling to read (Tier 0).
- [ ] *(RECOMMENDED — Append)* Resolves `data-supersedes`; enforces writing-room ordering;
      re-confirms append-only. Passes V13–V16.
- [ ] *(RECOMMENDED — Producer)* Emits conforming documents per §9.2, restricted to the single
      canonical serialization of §9.2a; deterministic rebuild is byte-identical. Passes V28.
- [ ] *(RECOMMENDED — Producer)* A producer that folds performs the fold motion (§8.4) totally
      and fail-closed. Passes V32.

### 11.3 Hardening the spec (how to drill it down)

A spec is only as unambiguous as the implementations it produces. To harden this spec, build it
from these words in **several languages with independent agents**, run all of them against §10
and §13, and treat **every divergence as a spec defect to fix** — not an implementation bug.
Identical bytes in, identical witnesses out, across every reader, is the target. An **initial
cross-reader convergence has been observed** — independent readers, including one built blind from
this specification, agree byte-for-byte on clean, corrupted, and CRLF-variant fixtures — but the
full multi-corner battery (nested boundaries, comment masking, raw-text and multibyte edges) is
the standing target, not yet a closed result.

## 12. What is NOT in v0.4

> **Note — the inert-region definition (not an exclusion).** §6.2 and §6.4a both refer to an
> "inert region." An **inert region** is, for the purposes of the boundary-token grammar (§6.2)
> and the content-profile prohibition (§6.4a), exactly the union of: (a) the bytes between a
> `<!--` and its matching `-->`, i.e. an HTML comment; and (b) the raw-text content bytes of a
> `<script>` or `<style>` element — the bytes between that element's own opening `>` and its own
> `</script>`/`</style>` closing tag, which HTML defines as CDATA/raw text a browser never parses
> as markup. A boundary token or a prohibited content-element tag name that occurs inside an
> inert region MUST NOT be counted, MUST NOT match a boundary, and MUST NOT trigger the §6.4a
> content-profile refusal — it is prose or script/style data to a browser, and a conforming
> reader treats it identically. Bytes inside an inert region that also fall inside a witnessed
> span remain part of that span's witnessed bytes; only *boundary-token and content-profile
> matching* skip them, never the witness arithmetic itself (§6.2). This note defines a term used
> normatively above; it is listed in §12 for proximity to the other structural notes, not because
> inert-region masking is out of scope — it is a Core MUST (§6.2, §6.4a, §11.1).

A conforming v0.4 reader MUST NOT require any of these:

- **The live loop** (Claim B, §4.2) — writing a turn (model call, key, disk write) is a
  platform action a scriptless browser cannot perform. The run leg is delegated to external
  infrastructure (a shim, not a bespoke server); the format defines the *result* it must
  produce, not the apparatus that produces it.
- **A resolver tier** — no resolver, lookup service, or address-resolution protocol.
- **A selector grammar** — no CSS-selector or XPath addressing within sections.
- **Web-app machinery** — no client-side framework, service worker, or dynamic rendering; no
  executing JavaScript is required to read, address, or verify.
- **Cross-document addressing** — v0.4 Core defines no addressing across separate doc.html
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

## 14. Versioning policy

This document specifies **version 0.4** of the doc.html format. v0.4 is additive over v0.3:
it defines the fold motion (§8.4), the gist link-text form and the §5.4 disclosure, the
recency-window reading posture (§7.1), and matrix row V32 (Producer). Every v0.3-conforming
document remains v0.4-conforming, and — stronger — **v0.4 adds no Core conformance
requirement at all**: a v0.3 reader and a v0.4 reader verify the same documents to the same
verdicts; a span-less plain-text-link manifest (already conforming under v0.3 §5.4, where
title/summary spans are SHOULD-level) is read under the unchanged rules and is never
mistaken for a folded record by its link-text shape. The version boundary remains hard and
stated in prose.

The version is stated here in
prose; it is **not** encoded in any machine-readable attribute. A reader implementing v0.4
SHOULD fail loudly when it encounters a non-conforming manifest shape (for example, a v0.1
JSON-island manifest). Silent degradation is discouraged. Future
versions will be specified in their own document; this text remains the canonical
specification.
