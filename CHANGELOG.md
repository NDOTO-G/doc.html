# Changelog

What changed in each release of this bundle, newest first.

The format itself is versioned inside [`SPEC.md`](SPEC.md); this file tracks the released
bundle — the specification, the readers, the documents, and the layout they sit in. Dates are
the dates of the public tags — the maker's local calendar date at the moment the tag was cut, so
an entry here can read one day apart from the UTC date GitHub displays for the same tag. Style
follows [Keep a Changelog](https://keepachangelog.com/);
a version bump that moves or renames a shipped path is called out as breaking, because a moved
path breaks every link that pointed at it.

---

## v0.7.1 — 2026-08-26

**The wiki companions join the ruled grammar.** `tools/verify_wiki.py` and `verify_wiki.mjs`
are replaced by the repaired pair from the maker's repository. The Core readers, `SPEC.md`, and
every document are byte-unchanged from v0.7.0; the shipped shelf verifies identically before and
after (9 carriers, both languages, byte-identical output).

**Why.** The v0.6.0 and v0.7.0 CHANGELOGs disclosed that the wiki companions still carried v0.4
manifest semantics — by v0.7.0 they lagged the Core pair by two recensions. The lag was real and
live: the companions' own discovery grammar (full-Unicode case-insensitive scans, word-boundary
tag matches, quote-unaware tag ends, a raw `</nav>` byte-find, a 25-codepoint separator set, and
comments-over-raw-text mask precedence) could locate a different manifest, extract a different
witness list, or hide a different set of shelf carriers than the Core reader certifies over the
same accepted bytes — the same two-readers-two-grammars disease the Core recensions were cut
for, one layer up. The repair ports the Core's ruled primitives: witness extraction (which feeds
the doc-pin) now reproduces the Core's §12 view verbatim, and shelf discovery keeps its
disclosed five-container hygiene rebuilt on the ruled mechanics (left-to-right earliest-opener
walk, exact ASCII tag names, ASCII-only folding, quote-aware tag ends).

**Found in review, fixed before release — twice.** First, the repair briefly introduced a
boundary defect in the JS companion (an index-guarded scan that a regex match could straddle
where Python's is hard-bounded); adversarial review caught it as a live py/mjs split on a
Core-accepted leaf, and the shipped pair carries the slice-bounded fix with a fixture pinning
the shape. Second, the port briefly applied the Core's case-sensitive discovery grammar to
`<base>` detection, so a case-variant `<BASE href>` slipped past the base-neutrality refusal
(R2) on both languages — caught by Codex's automated review on this release's open PR, and
confirmed by adversarial review before merge. The shipped pair matches the `<base>` tag name
ASCII-case-insensitively — R2 exists for the browser's sake, and a browser's tag-name match is
case-insensitive — while `<nav>`/`<a>` discovery stays exactly case-sensitive (their referent
is the ruled format). A fixture pins the case-variant shape.

**Boundary (call-out).** Against the previously shipped companions this narrows two shapes (a
case-mismatched decoy manifest can no longer supply the pin's witness list; separator bytes
outside HTML5's five no longer split attributes in shelf discovery) and loosens five (quoted `>`
no longer truncates manifest anchors or hides carriers; a commented-out `</nav>` no longer
truncates the witness list; carriers after unclosed or custom-element raw-text openers are no
longer silently invisible). No shipped document's verdict moves; every change is fixtured and
declared in the maker's repository. The `<base href>` refusal's reach is unchanged from the
previously shipped companions: every ASCII casing of `<base>` is refused, as before (the
case-variant slip described above lived only in this release's pre-merge candidate and never
shipped).

The maker-side gate (`wiki_lockstep`) now certifies the pair: rc agreement and byte-identical
verdicts across both languages, a cross-check of witness extraction against the Core reader's
own grammar, and the shipped-shelf non-movement check.

---

## v0.7.0 — 2026-08-24

**The second one-grammar recension: format v0.5 → v0.6.** Both reference readers and `SPEC.md`
are replaced by the bytes sealed as `seal-readers-20260824` in the maker's repository. No shipped
path moves; every HTML document in this bundle verifies unchanged (17/17, both readers, exit 0,
zero cross-reader splits).

**Why.** The review round of the previous release filed issues #5–#8, and the recension cut to
answer them found three further defects no issue had named — all instances of the same disease
v0.5 was cut for, in organs it did not reach. All are closed here:

- **#7 closed — the one tracked engine-defined operation is removed.** Attribute-NAME folding is
  ASCII `A–Z` only in both readers; no engine `lower()`/`toLowerCase()` remains anywhere on a
  verdict path. The Unicode-16 cross-reader split disclosed in v0.6.0 is gone.
- **#6 closed** — the discovery scans (manifest, articles, links) run under the quote-aware,
  exact-ASCII-tag-name grammar: a conforming manifest link with `>` inside a quoted attribute is
  no longer falsely refused; `<a-widget>` is no longer swept in by a word-boundary match;
  `<NAV id="manifest">` is no longer accepted against the spec's case-sensitive rule.
- **#5 closed** — a valueless `data-char-count` is present-with-empty-value and is refused,
  identically to `data-char-count=""`, on all four carriers.
- **#8 closed** — the spec's root-materialization paragraph is layout-neutral in the maker's own
  text, so this mirror no longer adapts it (the re-fold that makes a current-text `SPEC.doc.html`
  shippable is still owed, below).
- **Found by the recension's own review:** the raw-text close-tag search folded with the engine
  (index-shifting splits both directions, including a false refusal of honest Turkish prose); the
  raw-text scan resumed past an unclosed opener (a fail-open one reader had and the other
  didn't); and the byte after a tag name was captured by each engine's `.`, whose newline
  exclusions differ — **a Prettier-formatted conforming document was refused by both v0.5
  readers** and now verifies.
- **Ruled at the sitting:** raw text wins over comments, like a browser (`<style><!-- </style>`
  ends the raw text; the fail-open shape that hid an invalid id from both readers now refuses);
  and the tail verdict's `articles:` denominator counts **witnessed** articles in both readers —
  the two readers no longer PASS the same document while disagreeing about how many units it
  contains.

**Boundary (call-out).** v0.6 narrows at the margins: valueless `data-char-count`, uppercase
`<NAV>` manifests, `<nav-*>`/`<a-*>` custom-element shapes in discovery positions, and
comment-in-raw-text concealment are now refused; Prettier/CRLF-formatted tag boundaries and
quoted-`>` manifest links are now accepted. No document in this bundle is affected; every verdict
the maker's gate corpus exercises that moved in either direction is declared, fixture-pinned, and
gate-verified in the maker's repository (`DEV_BASELINE.tsv`, 30 rows over 129 fixtures; corpus
narrowing pin 0).

**Known-stale, carried forward from v0.6.0:** `SPEC.doc.html` still carries v0.4 prose in-band
(verifies clean under the new readers); `documents/evidence.doc.html`'s provenance index still
names `seal-readers-20260722-r2`; the wiki companions `tools/verify_wiki.py` / `verify_wiki.mjs`
still carry v0.4 manifest semantics and now lag the Core pair by two recensions — no shipped leaf
is affected, and the companions' lockstep fix remains owed.

Decision record: `RECKONING_THE_SAME_DISEASE_IN_DEEPER_ORGANS.md` in the maker's repository,
sealed as tag `seal-readers-20260824` with pins
`verify.py = 9d2224835c19b251ace65e0b2f69e2b20560f3c2be6b911bcaa7f563a8edd652` and
`verify.mjs = e51e3455369bee51ba2f932cf612cddf2368ba9420fe49228cef85e40e9226cc`.
Finding credited: the Codex review on PR #4 (issues #5, #6, #7, #8) and Elenchos (the live
Unicode-16 split in #7; the three defects no issue named). The issues close with this merge.

---

## v0.6.0 — 2026-08-23

**The one-grammar recension: format v0.4 → v0.5.** Both reference readers and `SPEC.md` are
replaced by the bytes sealed as `seal-readers-20260822` in the maker's repository. No shipped
path moves; every HTML document in this bundle verifies unchanged (17/17, both readers, exit 0,
zero cross-reader splits). The mirror's `SPEC.md` differs from the seal's text in
layout/pointer prose only — the maker's repository-internal pointers are replaced by
layout-neutral wording and the root-materialization paragraph names this bundle's files;
every normative row, production, and verdict string is the seal's.

**Why.** Adversarial validation of a community-reported defect (issues #1 and #2, PR #3) found
the real disease: the two readers evaluated their engines' own character classes (`\w`, `\s`,
`\d`, `bytes.isspace()`) and non-full-string anchors, so there existed documents one reader
verified and the other refused — over the same bytes. v0.5 removes the engine-defined classes
from the grammar: ids are an explicit ASCII production, counts an explicit grammar, attribute
separators are HTML5's five whitespace bytes, every match is full-string, and previously silent
skips (nameless nested witnessed sections, malformed manifest links, unclosed manifests,
duplicate attributes, ill-formed UTF-8) are now identical refusals on both readers. **One
engine-defined operation remains and is tracked:** attribute-NAME case-folding still uses the
runtime's Unicode lowercase (`.lower()` / `.toLowerCase()`) where the spec says ASCII — on
non-ASCII attribute names the two readers can disagree when their Unicode tables differ (found
in review of this release; no shipped document has such a name). See the open issues.

**Boundary (call-out).** v0.5 narrows what the readers accept at the margins: non-ASCII ids and
exotic separator codepoints that the old readers (inconsistently) tolerated are refused. No
document in this bundle, and no document known to the maker's 360-document corpus, is affected;
every verdict the maker's gate corpus exercises that moved in either direction is declared,
fixture-pinned, and gate-verified in the maker's repository (`DEV_BASELINE.tsv`, 71 rows).

**Known-stale, disclosed:** `SPEC.doc.html` still carries v0.4 prose in-band (it verifies clean
under the new readers — the witness law is unchanged for its content); its re-fold to v0.5 text
ships in a follow-up. `documents/evidence.doc.html`'s provenance index still names the
superseded `seal-readers-20260722-r2` as current (a witnessed, shelf-pinned document — an owed
rebuild, not a one-line edit). The wiki companions `tools/verify_wiki.py` / `verify_wiki.mjs`
still carry v0.4 manifest semantics (a raw `</nav>` search and an unmasked `<a>` scan — the two
behaviours the Core pair moved in v0.5; and the older 25-codepoint separator set): no shipped
leaf has a comment inside its manifest, so the shipped shelf is unaffected, but a leaf that does
would be read differently by the two pairs until the companions are brought into lockstep in a
follow-up.

Decision record: `RECKONING_ONE_GRAMMAR_FOR_TWO_READERS.md` in the maker's repository, sealed as
tag `seal-readers-20260822` with pins
`verify.py = ed7aa071e38c5d77d0d097d3feff1cf4448c4e930aaf3138935a52aaed3dc198` and
`verify.mjs = 359954d3f19c020a358a5de6946957e14bc3a9200697f2ad3baed7f58ba71561`.
Finding credited: issues #1/#2 and PR #3, superseded by this recension (the issues close with
its merge). Four further reader/spec defects found in review of this release are filed as issues #5,
#6, #7, #8 for the next recension, credited to their finders (the Codex review; Elenchos for
the Unicode-16 split in #7).

---

## v0.5.0 — 2026-08-02

The repository is reorganized around **use**: how the format works, how to write one, how to
verify one, and what is where.

**BREAKING — the tree was reorganized.** Nothing about the format changed, but almost every
path did. Every deep link into the old flat layout breaks: bookmarks, forks, scripts, and any
document that referenced a shipped file by path must be repointed. The reference table in
[`README.md`](README.md) is the new map.

### Changed

- The wiki and everything it pins now live under `documents/` and move as one unit: the shelf
  `documents/wiki.doc.html`, the shape specification, the record, the design essays under
  `documents/essays/`, and `MISSION.md` / `VOWS.md` as residents of the wiki's home.
- The founding research corpus joins the wiki shelf as its ninth pinned leaf,
  `documents/doc.html` — now linked, pinned, and labelled: it is the founding record, and it is
  historical where it disagrees with `SPEC.md`. `SPEC.md` remains the normative text.
- The readers, the builder, and the agent reading skill moved under `tools/`:
  `tools/verify.mjs`, `tools/verify.py`, `tools/verify_wiki.mjs`, `tools/verify_wiki.py`,
  `tools/build-doc.mjs`, `tools/agent-skill/doc-html-reader/`.
- `README.md` now teaches the format rather than reporting on it: what it is, using one in
  sixty seconds, what you can build, writing one, verifying one, and a table of every shipped
  path.
- `documents/VOWS.md` — the vow statements are unchanged, verbatim; they are the covenant and
  they do not move when the tree does. What was maintained is the exposition around them: every
  path each vow cites now points into this tree, and the framing says plainly that these are
  promises the makers keep as they build, not obligations laid on anyone who adopts the format.
  `SPEC.md` remains the whole of what a conforming document owes.

### Added

- `SPEC.doc.html` — the specification carried in the format's own body, at the root beside
  `SPEC.md`. Same specification, navigable by manifest and verifiable by witness. The two
  carriers are now compared section by section before every release, so "same specification" is
  a checked fact rather than a promise.
- An in-band self-description and an about line in every shipped document: a short passage
  saying what a doc.html is and how to read and check it, and a line naming the maker, the
  license, and the build date. This is the makers' own practice under
  [`documents/VOWS.md`](documents/VOWS.md) — a document should say what it is, and say who is
  answerable for it — applied to this bundle, not asked of anyone else's. One document is
  exempt: `documents/essays/the-wiki-that-witnesses-itself.doc.html` is byte-sealed for
  fidelity and predates the practice; the exemption is recorded in
  [`CONTRIBUTING.md`](CONTRIBUTING.md) rather than quietly edited away.
- `CHANGELOG.md` (this file) and `CONTRIBUTING.md` — the latter is the short list of things
  that break silently if you edit a witnessed document without knowing the rules.
- `.editorconfig`, and a positive-only CI workflow that verifies every shipped document on
  both readers and the whole collection on both collection verifiers.
- A rendered home: the bundle now ships `.nojekyll` and points at the GitHub Pages view, so
  "double-click it and read" is also true of the first link a stranger clicks. On github.com
  itself these files display as source; the README now says so instead of letting the first
  click break the promise.
- `documents/README.md` — a Markdown doorway for the directory GitHub cannot render the
  wiki into, with the reading order and a pointer to the shelf.
- The founding corpus's eighteen historical research sections are now labelled
  "Historical (founding research)" in the manifest itself, so the quarantine travels with
  every selection a manifest-first reader can make — not only with a linear read. The maker's
  name in the corpus's about line is corrected to its proper spelling (Georges); the vows
  file's verbatim quote of that line follows the corrected bytes.

### Removed

- The conformance harness and the negative fixtures no longer ship. They did not stop running:
  they became a release gate, with each half run where it means something. The harness — the
  specification's own vectors, both readers over every conforming exhibit, and every forged
  fixture asserted-failing — runs against a checkout of the exact commit being released. The
  readers then sweep the staged bundle with the copies about to ship, and a link sweep resolves
  every relative link in that same bundle. So what you download is battery-checked without
  carrying the battery.
- `examples/` now carries conforming documents only; the must-refuse exhibits left with the
  harness that asserted on them.
- `EVIDENCE.md` — the record is `documents/evidence.doc.html`, pinned to the wiki shelf.

---

## v0.4.3 — 2026-07-25

- Added `the-wiki-shape.doc.html`: the collection shape specified as a conformant document —
  the parts, the doc-pin rule with its self-check, the reading mechanism, and the limits.
- Added `verify_wiki.mjs` and `verify_wiki.py`: two collection verifiers that delegate every
  per-document verdict to the Core readers and own only the shelf layer. A clean run prints the
  exact shelf it checked, href and pin, so you can compare it against the page you see.
- Renamed `data-doc-fold` to `data-doc-pin` on the wiki root; the rule and every value are
  unchanged, and the supersession is disclosed on the page itself.
- Added a sixth design essay, on building a wiki that carries its own verification story.

## v0.4.2 — 2026-07-24

- Added `wiki.doc.html`: the first public multi-document collection — a conformant root whose
  shelf links six separate documents and pins each with a cross-file witness computed over that
  document's own manifest.
- Added `essays/`: five design essays, each a separate pinned page rather than a section.
- `evidence.doc.html` and the README now point at the wiki.

## v0.4.1 — 2026-07-23

- Added `evidence.doc.html`: the record — what was measured, what held, and what did not — as a
  conforming document instead of a markdown file, with a section of the prior art that shaped
  the design. `EVIDENCE.md` became a pointer to it.
- README reworked format-first: it now shows the manifest and section grammar directly.

## v0.4.0 — 2026-07-22

- The specification advances to v0.4, completing the conversation shape the v0.3 text defined:
  the fold motion, epoch-scoped verdicts for a sealed head plus a live writing-room tail, and
  the gist disclosure. Core is unchanged — everything v0.3 promised, v0.4 still promises.
- Both reference readers were re-sealed as a pair after a reader-security repair: a forged
  witness placed in a decoy attribute could pass the Python reader while the JavaScript reader
  refused it. The divergent tokenizer was deleted rather than patched.
- Added example exhibits for the new shape, including the mixed-epoch document.
- The conformance harness began shipping with its negative battery (withdrawn in v0.5.0).

## v0.3.2 — 2026-07-13

- README rewritten around what the format can carry, with a sixty-second path for trying one.
- `EVIDENCE.md` restated the results — including the negative and null ones — in one voice.
- "self-verifying" became "integrity-witnessed" in that release's own prose (the README and
  the evidence record): a witness proves that bytes are unchanged, not that their content is
  true. The older phrase still appears inside historical and witnessed documents, whose bytes
  are not rewritten for vocabulary.

## v0.3.1 — 2026-07-12

- Added `agents.html`: this repository's own memory organ, itself a conformant document — a
  worked example of doc.html as an agent's durable, selectively-hydrated memory at real size.
- Added the `doc-html-reader` agent skill: manifest-first navigation instead of whole-file reads.
- Fixed `examples/memory.doc.html`: `data-supersedes` now uses the required fragment form
  (`#id`) per SPEC §8.2.

## v0.3.0 — 2026-07-07

- First public release. The integrity-witnessed single-file HTML format: a manifest of
  witnessed sections a reader addresses by id and checks byte-for-byte with SHA-256, hydrating
  only what it needs — no server, no JavaScript, no tooling to read.
- Shipped `SPEC.md`, the two reference readers, the builder, the first conforming examples, the
  mission and the vows, and CC0 1.0.
