#!/usr/bin/env python3
"""verify.py — bundle-local Core reader for doc.html v0.3.

Self-contained: no imports from the repo tree (classify_grammar is inlined).
Handles both manifest-first and writing-room-tail shapes (§5.0).

Usage:
    python verify.py <file>

Exit code 0 = PASS, nonzero = FAIL.
"""
import hashlib
import re
import sys
from pathlib import Path

# ─── Witness grammar (§6.7, classify_grammar inlined) ────────────────────────
# Two disjoint regular languages; length and alphabet arguments guarantee
# no string matches both (Disjointness Theorem, witness_proof.py).
#
# R8 follow-up (post-round-4-validation item 1, grep sweep): `_WRITING_ROOM_RE`
# used `\d`, which in Python STR-mode regex (this pattern is `r'...'`, not
# `rb'...'`) is UNICODE-AWARE by default — it matches any Unicode decimal
# digit (category Nd), not only ASCII 0-9: `re.match(r'\d', '１')` (fullwidth
# U+FF11) is True. verify.mjs's `WRITING_ROOM_RE` was already written with
# the explicit ASCII class `[0-9]`. Confirmed empirically: a witness value
# shaped like a timestamp but spelled in fullwidth digits classified as
# WRITING_ROOM (a live epoch, not recomputed) on verify.py and as INVALID
# (refused) on verify.mjs — the exact same class of engine/language-versioned
# character class R1 already revoked for the id production and R3 already
# excluded from the count grammar, found here on a third digit-bearing
# grammar. Fixed the same way: the explicit ASCII digit class, no `\d`.
#
# R9 — full-string match, not bare `^...$` + `.match(`: Python's `$` also
# matches immediately BEFORE a trailing newline (`re.match`, not `re.search`
# or `re.fullmatch`), so `data-witness="2026-01-01T00:00:00Z\n"` wrongly
# satisfied `_WRITING_ROOM_RE.match(...)` here while verify.mjs's un-flagged
# `$` (true end of string, no /m) correctly refused it — same class of
# parity trap as R1's id production and SPEC.md §9.1's `valid_id`/
# `parse_count` amendment (round 7). Fixed identically: no `^...$` in the
# pattern, and `.fullmatch(...)` (not `.match(...)`) at the call site below.
_CONSECRATED_RE = re.compile(r'[0-9a-f]{64}')
_WRITING_ROOM_RE = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z')

# Epoch sentinels
_CONSECRATED  = "consecrated"
_WRITING_ROOM = "writing-room"
_INVALID      = "invalid"


def _classify_witness(value: str) -> str:
    """Return _CONSECRATED, _WRITING_ROOM, or _INVALID based on form alone."""
    is_sha = bool(_CONSECRATED_RE.fullmatch(value))
    is_ts  = bool(_WRITING_ROOM_RE.fullmatch(value))
    if is_sha and is_ts:
        # Unreachable under Disjointness Theorem.
        raise AssertionError(
            f"Theorem violated: {value!r} matches both grammars"
        )
    if is_sha:
        return _CONSECRATED
    if is_ts:
        return _WRITING_ROOM
    return _INVALID


# ─── Attribute parser — quote-aware (§6.4) ───────────────────────────────────
# Whitespace around '=' is normal HTML and MUST be read (the PR #2 lesson,
# tests/test_verify_py_canonical.py). Reading stays double-quote-only here;
# non-canonical quoting on a witnessed-unit opening tag is refused separately
# by _refuse_noncanonical_attrs (§6.4, V24/V25) rather than silently ignored.
# ─── §6.4 ATTRIBUTE-SEPARATOR set (R8, RULED by the Operator 2026-08-22) ─────
# The set that separates one attribute from the next inside a start tag. It is
# HTML5's five whitespace codepoints and nothing else:
#
#     U+0009 TAB, U+000A LF, U+000C FF, U+000D CR, U+0020 SPACE
#
# R8's first pass froze this set as the JS engine's `\s` — 25 codepoints — so
# that neither reader borrowed a live, unpinned engine table. That freeze closed
# the cross-READER skew but left a reader-vs-BROWSER gap: the WHATWG tokenizer's
# before-attribute-name state treats only TAB/LF/FF/SPACE as whitespace (CR is
# folded to LF by input-stream normalization before the tokenizer ever sees it),
# so the other twenty codepoints of the JS class — NBSP, the
# General-Punctuation space run, LINE/PARAGRAPH SEPARATOR, IDEOGRAPHIC SPACE,
# the BOM, and VT (U+000B, which JS `\s` matches and HTML5 does NOT) — each
# BEGIN the following attribute NAME in a browser. A reader accepting them as
# separators verifies bytes a browser reads differently, and what is verified
# must be what is read (the V4 Discernment). RULED 2026-08-22: narrowed to
# HTML5's five. A codepoint outside this set, sitting inside a tag where a
# separator was intended, is NOT a separator — it is absorbed into the adjacent
# attribute NAME, exactly as a browser absorbs it.
#
# The constant is named for what it holds. It is no longer JS `\s` and must
# never again be spelled as though it were.
#
# NOTE the relationship with §6.2's boundary-token OPEN set
# (`_BOUNDARY_NEXT` / `_classify_boundary_token`, below). It rested on SIX bytes
# — the five here plus 0x0B VT — until the SECOND Operator ruling of 2026-08-22
# dropped VT from it too, for the identical reason it is absent here: a browser's
# tag-name state APPENDS VT to the tag NAME, so `<section\x0b…>` yields no
# `<section>` element at all. The two sets answer different questions at
# different positions — what may FOLLOW a tag name (§6.2) versus what SEPARATES
# two attributes (§6.4) — but their whitespace ground is now ONE ground, HTML5's
# five, and the earlier inversion is closed.
_ATTR_SEP = frozenset('\t\n\x0c\r ')

# §6.4 ATTRIBUTE-NAME case fold (R12 — public issue #7). Exactly the 26
# codepoints U+0041–U+005A map to U+0061–U+007A; EVERY other codepoint is left
# alone. This is not `str.lower()` and must never again be spelled as one.
#
# `str.lower()` / `String.prototype.toLowerCase()` are full-Unicode folds whose
# mapping table is the ENGINE's Unicode version — Python 3.11 carries UCD 14,
# Node 22 carries UCD 16 — and this specification pins no Unicode version. The
# consequence was not hypothetical: `<div Ᲊ="1" ᲊ="2">` (U+1C89 / U+1C8A, a case
# pair added in Unicode 16) was rc=0 on the sealed Python reader and rc=1 on the
# sealed Node reader, over the same bytes — a live cross-reader split, the exact
# disease the one-grammar recension was cut to remove, in the one organ it did
# not reach. Independently, HTML5 ASCII-lowercases attribute names, so
# `<div K="1" k="2">` (U+212A KELVIN SIGN) is TWO attributes to a browser and
# was one duplicate to both sealed readers: what is verified must be what is
# read (the V4 Discernment), the same ground as both 2026-08-22 rulings.
#
# The fold is also LENGTH-PRESERVING by construction, which the engine folds are
# not (U+0130 folds to TWO codepoints) — see `_build_inert_mask`'s ASCII-only
# raw-text scan and verify.mjs's `asciiLower` for why that property is
# load-bearing and not incidental. Identical, member for member, to verify.mjs's
# `asciiLower`.
_ASCII_FOLD = {c: c + 0x20 for c in range(0x41, 0x5B)}


def _ascii_lower(s: str) -> str:
    return s.translate(_ASCII_FOLD)


def _attrs(tag_inner: bytes, dup_names: list = None) -> dict:
    """Quote-aware attribute tokenizer (§6.4) — the reader's single value scan.

    Behavioural port of verify.mjs:47 `parseTagAttrs`, and structurally the same
    left-to-right walk as `_refuse_noncanonical_attrs` below. Input is
    UTF-8-decoded (invalid sequences become U+FFFD, exactly what verify.mjs's
    utf8 read yields). A name runs to the first JS-whitespace, '=', or quote, so
    a name containing ':' or '.' is ONE name and can never restart the scan
    mid-name to impersonate a real carrier — §6.4's impersonation rule, which
    the previous unanchored regex did not hold. Names fold to lowercase;
    double-, single- and unquoted values are all READ (§6.4's V24 refusal of
    non-canonical quoting on a witnessed-unit opening tag is the separate
    document-level law enforced by `_refuse_noncanonical_attrs`); a valueless
    attribute records None. Last occurrence wins, matching the Node reader.

    If *dup_names* (a list) is given, every attribute name that this SAME
    tokenization sees more than once is appended to it, in document order, the
    first time each repeat is seen (§6.4/§9.1 R6c — the whole-document walk's
    own duplicate-attribute-name refusal, `_find_global_id_fault`). Detecting
    duplicates from inside this exact tokenizer — rather than a second,
    separately-written scan — guarantees the walk's dup-name check and its
    last-wins VALUE resolution can never disagree about where one attribute
    name ends and the next begins. Omitted (the default), this costs nothing:
    every other call site is unaffected.
    """
    s = tag_inner.decode('utf-8', 'replace')
    attrs = {}
    n = len(s)
    i = 0
    while i < n:
        while i < n and s[i] in _ATTR_SEP:
            i += 1
        if i >= n:
            break
        name_start = i
        while i < n and s[i] not in _ATTR_SEP and s[i] not in ('=', '"', "'"):
            i += 1
        if i == name_start:
            i += 1
            continue
        name = _ascii_lower(s[name_start:i])   # §6.4 ASCII fold (R12/V45)
        if dup_names is not None and name in attrs:
            dup_names.append(name)
        j = i
        while j < n and s[j] in _ATTR_SEP:
            j += 1
        if j < n and s[j] == '=':
            j += 1
            while j < n and s[j] in _ATTR_SEP:
                j += 1
            if j < n and s[j] in ('"', "'"):
                quote = s[j]
                j += 1
                val_start = j
                while j < n and s[j] != quote:
                    j += 1
                attrs[name] = s[val_start:j]
                if j < n:
                    j += 1
            else:
                val_start = j
                while j < n and s[j] not in _ATTR_SEP:
                    j += 1
                attrs[name] = s[val_start:j]
            i = j
        else:
            attrs[name] = None
            i = j
    return attrs


# ─── Comment masking (§6.2) ──────────────────────────────────────────────────
_COMMENT_OPEN = b'<!--'
_COMMENT_CLOSE = b'-->'


def _in_mask(pos: int, masks: list) -> bool:
    for start, end in masks:
        if start <= pos < end:
            return True
        if start > pos:
            break
    return False


# ─── Inert regions (§12) — comments + raw-text <script>/<style> content ──────
# RP-3 RULED (Operator, 2026-08-23) — RAW TEXT WINS OVER COMMENTS, LIKE A
# BROWSER. The two masking constructs are located against the RAW bytes and
# interleaved in DOCUMENT ORDER: at each point the EARLIEST-OPENING construct
# claims its span and consumes through ITS OWN close. Consequences, both of
# them the browser's behaviour:
#
#   * A `<!--` inside an OPEN raw-text span is CONTENT. `<style><!-- </style>
#     --> <img id="bad id"> </style>` closes the style element at the FIRST
#     `</style>` — exactly where the HTML5 RAWTEXT state closes it, `<!--`
#     being ordinary CSS text there — so the `<img>` is LIVE markup and its
#     off-grammar id is refused. That document verified CLEAN on ALL FOUR
#     readers before this ruling (recorded as RP-3 in the recension contract),
#     because both readers blanked comments BEFORE scanning for raw text.
#   * A `</style>`/`</script>` inside a comment that itself started OUTSIDE raw
#     text stays masked, and a `<style>`/`<script>` merely MENTIONED inside such
#     a comment opens nothing — the comment opened first, so it consumes
#     through its own `-->` and the reader never sees the tag inside it. That
#     is the property the old comments-first layering existed to guarantee, and
#     document order keeps it without the layering.
#
# When a construct has no close (an unterminated `<!--`, a `<style>` with no
# `</style>`), it claims NO span: the scan resumes just past its opener and
# looks for the next construct. Both readers do this identically.
#
# R12b(b) — the tag name is bounded by §6.2's OPEN set, not by `\b`. `\b` is a
# word-boundary assertion and therefore holds before `-`, so `<style-x>`
# satisfied `<style\b`; the close search then made every byte up to the next
# `</style>` inert. Measured on the sealed pair: `<style-x>` …
# `<img id="bad id">` … `</style>` verified CLEAN on ALL FOUR readers — the
# very `\b` defect R11 outlawed in the three discovery scans, still standing in
# §12's scan, and NOT a cross-reader split, so no lockstep comparison could
# ever have caught it. A browser has no `<style-x>` raw-text element: what is
# verified must be what is read (the V4 Discernment).
#
# The lookahead is §6.2's OPEN set verbatim — byte for byte the class R11's
# `_DISCOVERY_NEXT` carries and R14 now makes §6.2's own boundary scan consult.
# IGNORECASE is RETAINED: a BYTES-mode IGNORECASE folds ASCII only (fold-site
# audit, site 7), which is exactly what HTML5 does to a tag name. The close-tag
# search uses `bytes.lower()`, which is ASCII-only AND length-preserving on a
# bytes object — R12a's non-length-preserving-fold defect cannot arise here.
#
# R12b(a) — the scan resumes AFTER the located close tag, not after the opening
# tag, so a `<script>` written inside a `<style>` element's CONTENT is never a
# second raw-text element. §12 defines the inert region as the bytes between
# that element's own opening `>` and its own close tag, which is this.
_RAWTEXT_OPEN_RE = re.compile(rb'<(script|style)(?=[\t\n\x0c\r />])[^>]*>',
                              re.IGNORECASE)


def _build_inert_mask(html: bytes) -> list:
    """Union of comment spans and raw-text (<script>/<style>) content spans (§12),
    in document order. Used for boundary-token matching (§6.2), unit discovery
    (§9.1), the count guard, shape detection, the content-profile prohibition
    (§6.4a), and the dup-id scan (§6.1).

    ONE left-to-right walk over the RAW bytes (RP-3). At each position the two
    candidate constructs — the next `<!--` and the next raw-text opening tag —
    are located, and the one that OPENS FIRST claims its span and consumes
    through its own close. A comment span covers its own delimiters; a raw-text
    span covers only the element's CONTENT, its own open/close tags being
    ordinary markup. Spans never overlap and are produced in ascending order.
    """
    spans: list = []
    lowered = html.lower()      # ASCII-only and length-preserving on bytes
    pos = 0
    n = len(html)
    while pos < n:
        c_start = html.find(_COMMENT_OPEN, pos)
        m = _RAWTEXT_OPEN_RE.search(html, pos)
        r_start = m.start() if m else -1
        if c_start < 0 and r_start < 0:
            break
        if r_start < 0 or (0 <= c_start < r_start):
            # The comment opens first — it consumes through its own `-->`.
            c_end = html.find(_COMMENT_CLOSE, c_start + len(_COMMENT_OPEN))
            if c_end < 0:
                pos = c_start + len(_COMMENT_OPEN)
                continue
            spans.append((c_start, c_end + len(_COMMENT_CLOSE)))
            pos = c_end + len(_COMMENT_CLOSE)
        else:
            # The raw-text element opens first — it consumes through its own
            # close tag, and every `<!--` in between is CONTENT.
            open_end = m.end()
            close_tag = b'</' + m.group(1).lower() + b'>'
            close_idx = lowered.find(close_tag, open_end)
            if close_idx < 0:
                pos = open_end
                continue
            if open_end < close_idx:
                spans.append((open_end, close_idx))
            pos = close_idx + len(close_tag)
    spans.sort()
    return spans


# ─── §6.1 whole-document id scan: production + uniqueness (V5/V30/V33) ───────
# A "live element" is ANY element carrying an id= attribute — top-level
# section/article units, nested sections (witnessed or not), manifest <a> link
# targets, and any id-bearing <img> (§5.5), append-anchor, or other element.
# §6.1's rules are properties of the whole document's id space, not per-tag-name
# rules, so this scan walks every opening tag in the document (outside inert
# regions), not only addressable-unit opening tags.
#
# BOTH §6.1 laws are enforced here, in one pass, in document order: the id
# PRODUCTION (V33 — the scope clause binds every live element, not only the
# elements an addressing path happens to reach) and UNIQUENESS (V30). Because
# this walk runs before shape dispatch, an off-grammar id anywhere in the
# document — a manifest-first body section, a nested structural section, an
# <img>, an append-anchor — is refused with the same verdict at the same point
# in the output on both readers, whatever shape the document turns out to be.
#
# QUOTE-AWARE tag-end scan (round-eight-a fleet, BLOCKER B): the attrs blob
# (group 2) is a repetition of THREE alternatives — a double-quoted span, a
# single-quoted span, or a single byte that is none of `< > ' "`. A literal
# `>` INSIDE a quoted value (`id="ok>evil"`) is consumed by the quoted
# alternative and can never end the match early; only a real, unquoted `>`
# closes the tag. The previous `[^<>]*` capture could not tell a quoted `>`
# from the tag's own terminator and truncated the tag there, handing the
# tokenizer `id="ok` — a shared fail-open both readers accepted as PASS.
#
# NO SEPARATOR REQUIREMENT and NO `\s` anywhere in this pattern (round-eight-a
# fleet, BLOCKER A): the previous pattern required a literal `\s+` between the
# tag name and the attrs blob, and Python's BYTES-mode `\s` is ASCII-only while
# JS's STRING-mode `\s` also matches U+00A0 NBSP and other Unicode space
# characters — a cross-reader divergence (`<span\xa0id="bad id">` PASSED on
# verify.py, FAILED on verify.mjs). Requiring an explicit ASCII separator here
# does not fix that divergence — it would make BOTH readers silently DROP the
# malformed tag instead (neither would even see its `id`), which is worse, not
# safer. The catch-all alternative `[^<>'"]` already contains every ASCII
# whitespace byte (space, tab, LF, FF, CR) AND NBSP AND any other non-special
# byte, with no whitespace-vs-not decision made here at all: the blob is
# captured whole and handed to `_attrs` below, whose OWN separator handling
# (`_ATTR_SEP`, §6.4) is the enumerated set pinned identically in both readers
# (see the comment at `_ATTR_SEP`'s definition) — so the real
# whitespace-recognition decision is made exactly ONCE, in code already proven
# cross-reader-identical, not re-decided here in a second, differently-behaved
# class. Since the 2026-08-22 ruling that set is HTML5's five, so NBSP here is
# absorbed into the attribute NAME rather than treated as a separator — on both
# readers alike, which is what this comment's `<span\xa0id="bad id">` example
# now does (the tag parses, its only "attribute" is named `\xa0id`, and no `id`
# carrier is visible to the walk — identically on py and mjs).
_ANY_OPEN_TAG_RE = re.compile(
    rb'<([a-zA-Z][\w-]*)'
    rb'((?:"[^"]*"|\'[^\']*\'|[^<>\'"])*)'
    rb'>'
)

# ─── §6.1 BLOCKER (round-eight-b): the unterminated-quote hole in the outer
# tag regex ITSELF (post-R6 review) ───────────────────────────────────────────
# _ANY_OPEN_TAG_RE has no fallback when a quote opens with no reachable close.
# `<b id="bad id>` (or the single-quote twin) makes the anchored match at that
# tag's own '<' FAIL: the quoted-span alternative needs a matching close quote
# and finds none it can pair with all the way to a legal '>', the catch-all
# alternative categorically excludes the bare quote byte, and no other
# alternative can consume it either. Under a document-wide `finditer` (the
# prior implementation), a failed match at one position is simply INVISIBLE —
# the engine silently retries at the next byte and resyncs at whatever tag
# DOES parse later in the document. `<b id="bad id>` was therefore never seen
# by this scan at all: both readers PASSED it, and V30's dup-id defense rode
# the identical hole (an id repeated only inside an invisible tag's own
# invisible attribute can never collide with anything).
#
# THE FIX replaces the blind `finditer` with an EXPLICIT walk over every
# candidate tag-start position — a '<' immediately followed by an ASCII letter
# (`_TAG_START_RE`; `<!--`, `<!DOCTYPE`, `</...>`, and `<?...` never qualify,
# since none of them has a letter immediately after '<') — and, at each one
# outside an inert region, attempts _ANY_OPEN_TAG_RE ANCHORED exactly there
# (`.match(html, start)`, not `.search`). A candidate that matches is handled
# exactly as before (production, then uniqueness) and the walk resumes at the
# match's own end. A candidate that does NOT match needs one more question
# answered before it can be refused: WHY did it fail?
#
# Plain body text can ALSO start with '<letter' with no fallback in sight —
# `a<b` in prose, `<b` immediately followed by another real tag with nothing
# in between — and that failure carries NO quote at all; it was invisible
# before this fix and MUST stay invisible now (refusing it would turn ordinary
# prose into a false-positive FAIL, which is not what BLOCKER 1 is about). The
# discriminator: consume the tag name, then as much plain (non-`< > ' "`)
# content as the quote-FREE catch-all alone would consume
# (`_TAG_NAME_ONLY_RE` + `_ATTR_PLAIN_RE`). If the byte immediately after that
# is a quote, an attribute value was OPENED and never reachably closed — THAT
# is BLOCKER 1's fault, refused at the byte offset of the tag's own '<'
# (0-based, raw file bytes — identical arithmetic to `_in_mask`/byte-offset use
# elsewhere in this reader, since `html` is already `bytes`). If it is
# anything else ('<', or end of file — a bare '>' cannot occur here: reaching
# '>' via the quote-free scan alone would have meant _ANY_OPEN_TAG_RE's own
# catch-all alternative could reach it too, so the anchored match would have
# already succeeded, contradicting that this branch is even reached), no quote
# was ever opened — this "<letter" was never a real tag attempt, and the walk
# simply resumes one byte later, exactly as invisible as it always was.
_TAG_START_RE = re.compile(rb'<[a-zA-Z]')
_TAG_NAME_ONLY_RE = re.compile(rb'<[a-zA-Z][\w-]*')
_ATTR_PLAIN_RE = re.compile(rb"[^<>'\"]*")


def _find_global_id_fault(html: bytes, masks: list):
    """Return (kind, value) for the FIRST §6.1 id fault in document order —
    kind is 'production' (off-grammar id), 'duplicate' (id seen twice),
    'dup-attr' (an opening tag carries the same attribute NAME twice; value is
    (name, byte offset of that tag's own '<')), or 'malformed' (an unterminated
    attribute quote made a tag unparseable; value is the byte offset of that
    tag's own '<') — or None if every live element's id is well-formed and
    unique and every candidate tag parses cleanly and without a duplicated
    attribute name.

    Order matters and is deterministic: each element is tested for the
    production before it is entered into the uniqueness set, so an id that is
    both off-grammar and repeated is reported as a production fault at its
    FIRST occurrence, identically on both readers. A malformed tag is likewise
    reported at its own document-order position, ahead of any production or
    duplicate fault found on a LATER tag (fail-closed on the earliest problem).

    R6c (post-R6/R6-refinement review): a tag carrying the SAME attribute name
    twice — `<img id="ok" id="bad id">`, `<div id="ok" id="append-anchor">`,
    two `class=` on one tag — is resolved by `_attrs`'s tokenizer to a single
    (last-wins) value with no trace that a second occurrence ever existed, so
    the off-grammar or duplicate id inside it was never seen: BOTH readers
    PASSED such a tag identically. `<section>`/`<article>` unit openers were
    incidentally protected by the SEPARATE downstream V25 refusal
    (`_refuse_noncanonical_attrs`), but that check never runs on `<img>`, an
    append-anchor, or any other non-unit live element. THE FIX: `_attrs` is
    asked, via its optional `dup_names` parameter, to report every repeated
    name it sees while tokenizing THIS SAME tag — so the dup-name check can
    never disagree with `_attrs` about where one attribute name ends and the
    next begins — and a duplicate found on ANY opening tag the walk visits
    (id-bearing or not, matching V37's identical breadth) is refused BEFORE
    that tag's `id` is ever read, at the tag's own '<' (consistent with V37's
    offset rule; not the offset of the duplicate occurrence, which is what the
    pre-existing, unit-opener-only V25 refusal reports).

    A VALUELESS `id` attribute (`<div id>`) records None from the §6.4
    tokenizer — but it is PRESENT (`'id' in a`), and F4 (post-round-4-
    validation) resolves it the same way §5.4 resolves a valueless
    `data-witness`: presence-with-no-value coalesces to the empty string and
    is held to the production exactly as `id=""` is, both returning
    ('production', ''). Only an id attribute that was never written at all
    (`'id' not in a`) is invisible to this walk, as it always was."""
    seen = set()
    pos = 0
    n = len(html)
    while pos < n:
        sm = _TAG_START_RE.search(html, pos)
        if not sm:
            break
        start = sm.start()
        if _in_mask(start, masks):
            pos = start + 1
            continue
        m = _ANY_OPEN_TAG_RE.match(html, start)
        if m:
            dup_names = []
            a = _attrs(m.group(2), dup_names)
            if dup_names:
                return ('dup-attr', (dup_names[0], start))
            if 'id' in a:
                # A VALUELESS `id` (`<div id>`) tokenizes to None here — same
                # as `id=""` after the `or ''` coalesce, and different from an
                # id attribute that was never written at all (`'id' not in
                # a`, which is not tested here and stays invisible to this
                # walk, exactly as before). F4: a valueless id IS an id
                # attribute, just an empty one — it is not skipped, it is
                # held to the same production as `id=""`.
                id_val = a.get('id') or ''
                if not _valid_id(id_val):
                    return ('production', id_val)
                if id_val in seen:
                    return ('duplicate', id_val)
                seen.add(id_val)
            pos = m.end()
            continue
        # The anchored match failed. Discriminate an unterminated attribute
        # quote (refuse) from ordinary text that merely LOOKS like a tag start
        # (stay invisible, as always) — see the BLOCKER comment above.
        name_m = _TAG_NAME_ONLY_RE.match(html, start)
        plain_m = _ATTR_PLAIN_RE.match(html, name_m.end())
        plain_end = plain_m.end()
        if plain_end < n and html[plain_end:plain_end + 1] in (b'"', b"'"):
            return ('malformed', start)
        pos = start + 1
    return None


# ─── NON-CANONICAL refusal (§6.2, §6.4a) ─────────────────────────────────────
class NonCanonical(Exception):
    """Raised when a document violates the boundary-token grammar or the
    content-profile prohibition. Carries a required byte offset (§6.2)."""
    def __init__(self, message: str, byte_offset: int):
        super().__init__(message)
        self.byte_offset = byte_offset

    def __str__(self):
        return f"NON-CANONICAL: {super().__str__()} (byte offset {self.byte_offset})"


# ─── §6.4 canonical-serialization refusal (V24 quoting, V25 duplicates) ──────
def _refuse_noncanonical_attrs(tag_inner: bytes, tag_inner_start: int) -> None:
    """Refuse a non-canonical witnessed-unit opening tag (§6.4).

    Quote-aware READING (the §6.4 tokenization rule) keeps an embedded
    ``id=`` from impersonating the real attribute; this is the separate
    document-level law: on the opening tag of an addressable element every
    valued attribute MUST use the double-quote form — single-quoted or
    unquoted values are NON-CANONICAL (V24) — and no attribute name may
    appear twice (V25). Both refusals carry a required byte offset.
    ``tag_inner_start`` is the byte offset of ``tag_inner`` in the document.

    R8 follow-up (post-round-4-validation item 1): this function used to scan
    *tag_inner* as raw BYTES, one byte at a time, via ``bytes.isspace()`` —
    Python's C-locale byte-whitespace test (6 ASCII bytes: TAB LF VT FF CR
    SPACE), unable in principle to recognize a MULTI-byte UTF-8 separator
    (NBSP, U+FEFF, any of the General-Punctuation spaces) as a single unit at
    all — while verify.mjs's sibling `refuseNonCanonicalAttrs` scanned the
    ALREADY-DECODED string with the running engine's own `/\\s/`. Two
    DIFFERENT unpinned separator predicates on two supposedly-identical
    functions — exactly what R8 exists to close. THE FIX: decode once (UTF-8,
    `errors='replace'`, matching how `_attrs` already reads every other
    attribute blob in this reader) and scan the resulting STRING using
    `_ATTR_SEP`, the SAME enumerated separator set `_attrs` uses (HTML5's
    five since the 2026-08-22 ruling) — one
    separator predicate, shared by every tokenizer in this reader, not two.
    Byte offsets (required by NON-CANONICAL, §6.2) are recovered from char
    indices via `_byte_off`, re-encoding the decoded prefix — tag_inner is a
    single opening tag's attribute blob, never large enough for this to
    matter. A side effect, not a new behavior: the duplicate-name error
    message now shows the attribute name's REAL Unicode characters (as
    verify.mjs's message always has) instead of `ascii`-decoding it back to
    U+FFFD replacement characters for any non-ASCII byte — the OLD
    byte-mode message was itself an unpinned, ASCII-only rendering choice.
    """
    s = tag_inner.decode('utf-8', 'replace')
    n = len(s)

    def _byte_off(char_idx: int) -> int:
        return tag_inner_start + len(s[:char_idx].encode('utf-8'))

    seen = set()
    i = 0
    while i < n:
        while i < n and s[i] in _ATTR_SEP:
            i += 1
        if i >= n:
            break
        name_start = i
        while i < n and s[i] not in _ATTR_SEP and s[i] not in ('=', '"', "'"):
            i += 1
        if i == name_start:
            i += 1
            continue
        name = _ascii_lower(s[name_start:i])   # §6.4 ASCII fold (R12/V45)
        if name in seen:
            raise NonCanonical(
                f"duplicate attribute name '{name}' "
                "on a witnessed-unit opening tag (§6.4, V25)",
                _byte_off(name_start))
        seen.add(name)
        j = i
        while j < n and s[j] in _ATTR_SEP:
            j += 1
        if j < n and s[j] == '=':
            j += 1
            while j < n and s[j] in _ATTR_SEP:
                j += 1
            if j < n and s[j] == '"':
                j += 1
                while j < n and s[j] != '"':
                    j += 1
                if j < n:
                    j += 1
            else:
                form = 'single-quoted' if j < n and s[j] == "'" else 'unquoted'
                raise NonCanonical(
                    f"{form} value for attribute "
                    f"'{name}' "
                    "on a witnessed-unit opening tag (§6.4, V24)",
                    _byte_off(min(j, n - 1 if n else 0)))
            i = j
        else:
            i = j  # valueless attribute — V24 governs valued attributes only


# ─── §6.2 boundary-token grammar (normative, exact) ──────────────────────────
# §6.2 BOUNDARY-TOKEN OPEN set (RULED by the Operator, 2026-08-22 — the second
# ruling of that sitting). A byte sequence is an open token for TAG iff it is
# `<` + TAG followed by exactly one of these bytes. The whitespace members are
# HTML5's five — 0x09 TAB, 0x0A LF, 0x0C FF, 0x0D CR, 0x20 SPACE — plus `/` and
# `>`. 0x0B VT was a member until the ruling and is NOT one now: a browser's
# tag-name state appends VT to the tag NAME, so `<section\x0bid="x">` opens an
# element named `section\x0b` and NO `<section>` element is ever produced. A
# reader that called it an open token was reading bytes a browser reads
# differently — what is verified must be what is read (the V4 Discernment) — so
# under the ruling the element is invisible to this reader exactly as it is
# invisible to a browser. Identical, member for member, to verify.mjs's
# `WS_SLASH_GT`, and resting on the same five bytes as §6.4's `_ATTR_SEP`.
_BOUNDARY_NEXT = frozenset((b' ', b'\t', b'\n', b'\r', b'\f', b'/', b'>'))
# A boundary-adjacent scan: find every '<' + TAG occurrence (open-ish) and every
# '</' + TAG occurrence (close-ish), case-sensitive lowercase per §6.2, and
# classify each as: exact open token, exact close token, NON-CANONICAL close
# (interior whitespace before '>'), or ordinary content (e.g. <section-foo>,
# which is not a boundary of any kind).
def _boundary_scan_re(tag: str):
    tag_b = tag.encode()
    # Group 1: open-ish '<TAG' immediately followed by captured next byte.
    # Group 2: close-ish '</TAG' followed by everything up to (and including) '>'.
    #
    # R14 — the capture is `[\s\S]`, NOT `.`. A Python BYTES `.` without
    # re.DOTALL matches every byte EXCEPT 0x0A LF, so `<section\nid="x">`
    # produced no open-ish match at all and LF — a member of `_BOUNDARY_NEXT`
    # above, and the byte every code formatter writes after a long tag name —
    # was silently not a boundary. verify.mjs's `.` was worse still (JS `.`
    # excludes LF, CR, U+2028 and U+2029), so the two readers disagreed about
    # CR: `<article\rid=…>` was rc=0 on the sealed Python reader and rc=1 on
    # the sealed Node reader, over the same bytes. The enumerated OPEN set was
    # never consulted for bytes the wildcard could not produce.
    #
    # `[\s\S]` is a class unioned with its own complement and is therefore
    # EVERY byte, in both engines, with no flag and no engine-defined table:
    # the decision about which of those bytes is a boundary is made in exactly
    # ONE place, `_BOUNDARY_NEXT` / `_classify_boundary_token`, per R8's
    # one-place-only corollary. This is deliberately NOT spelled as a class
    # built from the OPEN set: capturing any byte and then TESTING it keeps
    # `<section-foo>` classified as ('content', None) with the same advance
    # arithmetic it has always had. The close-ish alternative's `[^>]*` already
    # admits every byte and is untouched. Identical, construction for
    # construction, to verify.mjs's `boundaryScanRe`.
    return re.compile(
        rb'<' + tag_b + rb'(?P<open_next>[\s\S])'
        rb'|</' + tag_b + rb'(?P<close_tail>[^>]*)>',
    )


def _classify_boundary_token(m, tag_b: bytes):
    """Given a match from the boundary scan regex, return one of:
    ('open', end) — exact open token, valid boundary
    ('close', end) — exact close token, valid boundary
    ('noncanonical', start) — close-tag-shaped but with interior whitespace/bytes
    ('content', None) — not a boundary token at all (e.g. <section-foo>)
    """
    if m.group('open_next') is not None:
        nxt = m.group('open_next')
        if nxt in _BOUNDARY_NEXT:
            return ('open', m.end('open_next'))
        return ('content', None)
    else:
        tail = m.group('close_tail')
        if tail == b'':
            return ('close', m.end())
        # Close-tag-shaped (</TAG...>) but with interior bytes — NON-CANONICAL,
        # UNLESS this is actually a different, longer tag name that happens to
        # share TAG as a prefix (e.g. </section-foo>) — that is ordinary content,
        # not a near-miss close token, and MUST NOT be reported as NON-CANONICAL
        # under §6.2 (it is not a boundary token of any kind).
        first = tail[:1]
        # NOT `_BOUNDARY_NEXT`, and deliberately still SIX bytes wide (0x0B
        # VT included). This set does not decide what a boundary IS; it
        # decides whether a close-tag-SHAPED token that is not canonical is a
        # near-miss worth refusing as NON-CANONICAL or a longer tag name that
        # is ordinary content. Keeping VT here keeps `</section\x0b>` a
        # refusal rather than a silent skip — the fail-closed direction — and
        # it is byte-identical on both trial readers AND on the sealed dev
        # pair. The 2026-08-22 VT ruling names the OPEN set; this position is
        # recorded in SPEC.md §6.2 as its own residual, not folded in silently.
        if first and first not in (b' ', b'\t', b'\n', b'\r', b'\f', b'\v', b'>'):
            return ('content', None)
        return ('noncanonical', m.start())


# ─── §6.2 generalized depth-walk (exact-token grammar) ───────────────────────
def _extract_inner(html: bytes, opener_end: int, tag: str, inert_masks: list,
                   elem_id: str) -> tuple:
    """Return (inner_bytes, close_start, closes_consumed) for the addressable
    element whose opening tag ends at *opener_end*. *tag* is 'section' or
    'article' (lowercase). *closes_consumed* is the number of exact close
    tokens the depth-walk stepped through to reach depth 0 (always >= 1) — fed
    to the independent count guard as its expectation.

    Raises RuntimeError if no candidate close token is found at all (genuinely
    unterminated). Raises NonCanonical if an off-grammar boundary-adjacent token
    is encountered before a valid close resolves the depth-walk to 0.
    """
    tag_b = tag.encode()
    scan_re = _boundary_scan_re(tag)
    depth = 1
    pos = opener_end
    closes_consumed = 0
    while depth > 0:
        m = scan_re.search(html, pos)
        if not m:
            raise RuntimeError(f"unterminated <{tag} id={elem_id}>")
        if _in_mask(m.start(), inert_masks):
            pos = m.end()
            continue
        kind, val = _classify_boundary_token(m, tag_b)
        if kind == 'content':
            pos = m.end()
            continue
        if kind == 'noncanonical':
            raise NonCanonical(
                f"close tag for <{tag}> carries interior whitespace/bytes "
                f"(id={elem_id})",
                val,
            )
        if kind == 'open':
            depth += 1
        else:  # 'close'
            depth -= 1
            closes_consumed += 1
            if depth == 0:
                return html[opener_end:m.start()], m.start(), closes_consumed
        pos = m.end()
    raise RuntimeError(f"unterminated <{tag} id={elem_id}> (loop exit)")


# ─── Closing-tag count guard (independent second tally) ─────────────────────
def _count_guard(html: bytes, opener_end: int, scope_end: int, tag: str,
                  inert_masks: list, elem_id: str, depth_walk_closes: int) -> None:
    """An independent second tally, NOT a depth-walk rewrite. Counts every exact
    close-token literal `</TAG>` OUTSIDE an inert region (§12) in the window
    [opener_end, scope_end) — *scope_end* is the position of the next top-level
    sibling's opening tag (or EOF if this is the last unit), i.e. the window a
    correct, non-smuggling document would confine this unit's own closer and any
    legally-nested same-tag closers to. That literal count is compared against
    *depth_walk_closes* — the number of close tokens the depth-walk itself
    consumed to reach depth 0 (1 for the unit's own closer, plus one per
    same-tag nested witnessed unit legally opened within the span — the
    depth-walk's own expectation per V2; zero when no nesting, so a legal
    nested witnessed section is not itself a surplus).

    Both this tally and the depth-walk mask the SAME inert regions (§6.2/§12:
    comments AND <script>/<style> raw-text), so a close-token literal that is
    genuinely inert — e.g. inside a witnessed unit's own <style> — is skipped
    by both and is never a boundary; the unit's witness hash covers those bytes
    directly, so nothing is smuggled past it. The guard's remaining power is the
    surplus/deficit it raises for a NON-inert lookalike the depth-walk resolved
    differently — the canonical case being a close-token literal inside a quoted
    ATTRIBUTE value (attributes are not an inert region, so neither mask skips
    them): the depth-walk stops early at it (short span), while the real closer
    later in the window makes the literal tally exceed what the walk consumed →
    surplus → refused NON-CANONICAL. Any surplus OR deficit is refused.
    """
    close_re = re.compile(rb'</' + tag.encode() + rb'>')

    raw_closes = 0
    for cm in close_re.finditer(html, opener_end, scope_end):
        abs_pos = cm.start()
        if _in_mask(abs_pos, inert_masks):
            continue
        raw_closes += 1

    if raw_closes != depth_walk_closes:
        kind = "surplus" if raw_closes > depth_walk_closes else "deficit"
        raise NonCanonical(
            f"closing-tag count guard: <{tag} id={elem_id}> expected "
            f"{depth_walk_closes} close token(s) (the depth-walk's own "
            f"consumption), found {raw_closes} raw close-token literal(s) in "
            f"scope ({kind})",
            opener_end,
        )


# ─── §6.4a content-profile prohibition (distinct from the boundary grammar) ─
def _content_profile_check(inner: bytes, inner_start: int, inert_masks: list) -> None:
    """A witnessed span MUST NOT contain, outside an inert region, a content
    element whose tag name is exactly 'section' or exactly 'article' followed
    immediately by '-', '.', or ':' (§6.4a / V26)."""
    prohibited_re = re.compile(rb'<(?:section|article)[-.:]')
    for m in prohibited_re.finditer(inner):
        abs_pos = inner_start + m.start()
        if _in_mask(abs_pos, inert_masks):
            continue
        raise NonCanonical(
            "content-profile prohibition (§6.4a): witnessed span contains an "
            "unmasked section-/article-prefixed content element",
            abs_pos,
        )


# ─── Shared helpers ───────────────────────────────────────────────────────────
# §6.1 id production — ONE definition, called from every path that holds an id
# to the grammar: the whole-document live-element walk (_find_global_id_fault),
# the tail path's <article id>, the manifest link's fragment, and the
# nested-recompute loop. The production is a property of the format, not of a
# shape or a call site, so it MUST NOT be re-inlined anywhere.
#
#     id    := start cont*
#     start := [A-Za-z_]
#     cont  := [A-Za-z0-9_.:-]
#
# ASCII, spelled byte-exact — NOT Unicode general categories. A stranger with a
# text editor and SHA-256 must be able to evaluate the production without a
# versioned Unicode table (V6), and §9.2a's byte-scanner must reach the same
# answer as this reader. `\w` is deliberately not used: Python's `\w` is
# Unicode-aware while JavaScript's is ASCII-only even under /u, so a
# `\w`-spelled production could never be identical across the two readers.
#
# `re.fullmatch`, NOT `re.match` with a trailing `$`: Python's `$` also matches
# immediately BEFORE a trailing newline, so `re.match(r'^...$', 'abc\n')`
# succeeds while verify.mjs's un-flagged `$` (end of input, no /m) refuses it.
# fullmatch has no such hole, so the two readers agree byte for byte.
_ID_PRODUCTION_RE = re.compile(r'[A-Za-z_][A-Za-z0-9_.:-]*')


def _valid_id(id_str) -> bool:
    """True iff *id_str* is a string matching the §6.1 ASCII id production."""
    return isinstance(id_str, str) and _ID_PRODUCTION_RE.fullmatch(id_str) is not None


# §6.6 count-value grammar — ONE definition, called from every path that turns
# a `data-char-count` attribute STRING into a number (tail article, manifest
# link, top-level section attribute, nested section attribute).
#
#     count := "0" | [1-9][0-9]*
#
# No sign, no leading zeros, no separators, no surrounding whitespace, no hex,
# no underscores, no fullwidth digits, no junk suffix. Anything else is a
# refusal — never a best-effort parse (`int('120abc')` does not raise for the
# reason people expect, and `parseInt('120abc', 10)` cheerfully returns 120)
# and never a silent skip. `fullmatch` for the same trailing-newline reason as
# the id production above.
_COUNT_PRODUCTION_RE = re.compile(r'0|[1-9][0-9]*')


def _parse_count(raw):
    """Return the decimal value of a `data-char-count` STRING, or None after
    printing the refusal verdict when the string is off-grammar. Callers return
    1 on None; the verdict string lives here and nowhere else."""
    if not isinstance(raw, str) or _COUNT_PRODUCTION_RE.fullmatch(raw) is None:
        print(f"FAIL: invalid char-count grammar: "
              f"{raw if isinstance(raw, str) else ''}")
        return None
    return int(raw)


def _witnessed_bytes(html: bytes, opener_end: int, opener_starts: list, tag: str,
                      inert_masks: list, elem_id: str) -> bytes:
    """Full §6.2/§6.4a witnessed-bytes pipeline: depth-walk, count guard,
    content-profile check.

    *opener_starts* is the full sorted list of every same-*tag* opener's start
    offset in the whole document (document order), used to derive the count
    guard's scope: the next opener at or after this unit's OWN depth-walk close
    position — i.e. the next SIBLING opener, skipping any opener nested inside
    this unit (a nested opener's start position is always < this unit's close
    position, so it is excluded by construction). Falls back to len(html) if no
    such opener exists (this is the last sibling in the document).

    Returns the inner bytes on success; raises NonCanonical or RuntimeError on
    failure.
    """
    inner, close_start, closes_consumed = _extract_inner(
        html, opener_end, tag, inert_masks, elem_id)
    scope_end = len(html)
    for s in opener_starts:
        if s >= close_start:
            scope_end = s
            break
    _count_guard(html, opener_end, scope_end, tag, inert_masks, elem_id, closes_consumed)
    _content_profile_check(inner, opener_end, inert_masks)
    return inner


# ─── Tail path (§5.3b / §9.1 verify_tail) ───────────────────────────────────
def _verify_tail(html: bytes, inert_masks: list) -> int:
    """Verify a writing-room-tail document.  Returns 0 on PASS, 1 on FAIL.

    Epoch scoping (this packet — P0.4): a tail body may hold a mix of
    CONSECRATED and WRITING_ROOM witnesses. `valid_count` tallies recomputing
    consecrated articles (the non-vacuity register — §7.3); `ordinal_count`
    tallies grammar-valid writing-room articles that otherwise verify (§6.6
    char-count, id production). A tail with >=1 consecrated recompute is a
    scoped PASS reporting BOTH counts: "PASS (verified=m, ordinal=k)". A tail
    with ZERO consecrated witnesses but >=1 valid writing-room witness is
    never a bare PASS — it is the distinct ORDINAL-ONLY verdict (§6.7/§7.3):
    the ordinal register (sequence) was checked, but no byte was ever
    recomputed, so "0 recomputed bytes verified" must not be spelled PASS.
    """
    article_scan_re = _boundary_scan_re('article')
    tag_b = b'article'
    seen_ids: set = set()
    ok = 0
    mismatch = 0
    missing = 0
    valid_count = 0    # non-vacuity counter — recomputing CONSECRATED articles
    ordinal_count = 0  # grammar-valid WRITING_ROOM articles that otherwise verify

    # Locate top-level <article ...> OPENING tags via the exact-token grammar —
    # the outer unit-discovery scan MUST use the identical boundary-token rule
    # as the depth-walk (§6.2), not a looser prefix/word-boundary match.
    openers = []
    pos = 0
    while True:
        m = article_scan_re.search(html, pos)
        if not m:
            break
        if _in_mask(m.start(), inert_masks):
            pos = m.end()
            continue
        kind, val = _classify_boundary_token(m, tag_b)
        if kind == 'open':
            # Re-locate the full opening tag (<article ...>) ending at val's '>'.
            tag_end = html.index(b'>', val)
            openers.append((m.start(), tag_end + 1))
        elif kind == 'noncanonical':
            print(f"FAIL: NON-CANONICAL — off-grammar boundary token for <article> "
                  f"at byte offset {val}")
            return 1
        pos = m.end()

    opener_starts = [o[0] for o in openers]

    for idx, (open_start, open_end) in enumerate(openers):
        opener_bytes = html[open_start:open_end]
        # R8 RULING (Operator, 2026-08-22) — NO `\s` at the tag-name/attrs
        # join. This pattern used to spell the join `\s*`, and that is a
        # SEPARATOR decision made outside the one pinned separator predicate:
        # Python's BYTES-mode `\s` is the six ASCII whitespace bytes (VT
        # included) while verify.mjs's STRING-mode `\s` was the 25-codepoint
        # Unicode class. While `_ATTR_SEP` still held all 25 the two agreed by
        # accident — whatever one regex left behind, the other reader's tokenizer
        # skipped anyway. Narrowing `_ATTR_SEP` to HTML5's five breaks that
        # accident: `<article \xa0id="x">` would leave py the blob
        # `\xa0id=...` (name mangled, no `id` visible) and mjs the blob
        # `id=...` (id visible) — a live cross-reader divergence, confirmed by
        # probe before this line was changed. The fix is the shape
        # `_ANY_OPEN_TAG_RE` (the whole-document id walk) already carries and
        # R8/BLOCKER A already ruled correct: capture the blob whole, make no
        # whitespace decision here at all, and let `_attrs`/`_refuse_noncanonical_
        # attrs` — the single pinned `_ATTR_SEP` predicate, identical in both
        # readers — decide what a separator is. Group 1 now begins at the §6.2
        # boundary byte itself; the byte-offset arithmetic below is unchanged
        # (`.start(1)` moves earlier by exactly what the tokenizer then skips).
        inner_attrs_match = re.match(rb'<article([^>]*)>', opener_bytes)
        # §6.4 V24/V25 — in tail shape the top-level <article> openers are
        # what unit-discovery addresses; serialization must be canonical.
        if inner_attrs_match:
            try:
                _refuse_noncanonical_attrs(
                    inner_attrs_match.group(1),
                    open_start + inner_attrs_match.start(1))
            except NonCanonical as e:
                print(f"FAIL: {e}")
                return 1
        a = _attrs(inner_attrs_match.group(1)) if inner_attrs_match else {}
        # ABSENT and VALUELESS are different, and the difference is a verdict.
        # Absent -> this is not a witnessed article; skip it. Present but
        # valueless (`<article data-witness>`) -> a witness that cannot be
        # classified: verify.mjs runs its grammar regexes over the null and
        # reports invalid witness grammar, so parity REFUSES here rather than
        # skipping. The §6.4 tokenizer records a valueless attribute as None
        # (Node parity), which is why a presence test alone is not enough.
        if 'data-witness' not in a:
            continue
        dw_val = a['data-witness']
        epoch = _INVALID if dw_val is None else _classify_witness(dw_val)
        if epoch == _INVALID:
            print(f"FAIL: invalid witness grammar on <article id={a.get('id', '?')}>")
            mismatch += 1
            continue

        id_val = a.get('id')
        if not id_val:
            print("FAIL: <article data-witness> with no id")
            mismatch += 1
            continue
        if not _valid_id(id_val):
            print(f"FAIL: invalid id production: {id_val}")
            mismatch += 1
            continue
        if id_val in seen_ids:
            print(f"FAIL: duplicate id: {id_val}")
            return 1
        seen_ids.add(id_val)

        try:
            inner = _witnessed_bytes(html, open_end, opener_starts, 'article',
                                      inert_masks, id_val)
        except NonCanonical as e:
            print(f"FAIL: {e}")
            return 1
        except RuntimeError as e:
            print(f"FAIL: {e}")
            missing += 1
            continue

        if epoch == _CONSECRATED:
            actual = hashlib.sha256(inner).hexdigest()
            if actual != a['data-witness']:
                print(f"FAIL article id={id_val}: "
                      f"claimed={a['data-witness']} actual={actual}")
                mismatch += 1
                continue
            valid_count += 1
        # writing-room ordering is Append (V15), not checked in Core.

        # §6.6 char-count (optional). R10 (public issue #5): the gate is
        # attribute PRESENCE, not value-presence. The §6.4 tokenizer records a
        # VALUELESS attribute (`data-char-count`, no `=`) as None, which an
        # `is not None` gate cannot tell apart from "never written" — so the
        # count check was SKIPPED on exactly the byte-shape §6.4 defines as
        # present-with-the-empty-value. `in` distinguishes the two; the falsy
        # coalesce then supplies the VALUE the grammar is tested against. Same
        # two-step discipline R1a applies to a valueless `id` and §5.4 to a
        # valueless `data-witness`. A PRESENT value is held to the §6.6 count
        # grammar — off-grammar is a refusal, not a best-effort parse, not a skip.
        if 'data-char-count' in a:
            claimed_cc = _parse_count(a['data-char-count'] or '')
            if claimed_cc is None:
                return 1
            actual_cc = len(inner.decode('utf-8', errors='strict'))
            if actual_cc != claimed_cc:
                print(f"FAIL article id={id_val}: "
                      f"char-count claimed={claimed_cc} actual={actual_cc}")
                mismatch += 1
                continue

        if epoch == _WRITING_ROOM:
            ordinal_count += 1

        ok += 1

    # Non-vacuity (§7.3): zero addressable units with ANY grammar-valid
    # witness (consecrated or writing-room) is the ordinary vacuous FAIL.
    if valid_count == 0 and ordinal_count == 0:
        print("FAIL: vacuous — zero addressable units with recomputing or "
              "grammar-valid witnesses")
        return 1

    total = ok + mismatch + missing

    # ORDINAL-ONLY (this packet, P0.4): zero consecrated witnesses recomputed,
    # but at least one grammar-valid writing-room witness present. The ordinal
    # register (sequence) was exercised; zero bytes were ever recomputed. An
    # all-timestamp tail is therefore NEVER PASS — it is this distinct,
    # named refusal-adjacent verdict, not a bare non-vacuity FAIL and not PASS.
    if valid_count == 0 and ordinal_count > 0:
        print(f"articles: {total}")
        print()
        print(f"ORDINAL-ONLY: 0 consecrated witnesses recomputed; "
              f"{ordinal_count} writing-room (ordinal) witness(es) grammar-valid "
              f"(mismatches: {mismatch}, missing: {missing})")
        return 1

    print(f"articles: {total}")
    print()
    if ordinal_count > 0:
        # Mixed-epoch scope (this packet): the tail carries BOTH consecrated
        # and writing-room witnesses. A conforming reader states the PASS
        # scope explicitly — verified (recomputed, consecrated) vs ordinal
        # (grammar-valid, writing-room) — rather than folding the two
        # registers into one undifferentiated count.
        print(f"PASS (verified={valid_count}, ordinal={ordinal_count}) "
              f"articles: {total} (mismatches: {mismatch}, missing: {missing})")
    else:
        print(f"verified {ok}/{total} articles (mismatches: {mismatch}, missing: {missing})")
    if mismatch > 0 or missing > 0:
        return 1
    return 0


# ─── §5.0/§5.3 DISCOVERY scans (R11 — public issue #6) ───────────────────────
# The three scans that FIND an element by name — `<nav id="manifest">` (§5.0
# shape detection and §5.3 manifest location), `<article …>` (§5.0 shape
# detection and the tail path's own detection), and `<a …>` inside the manifest
# (§5.3's link gate) — are ONE grammar with the whole-document walk's, not
# three looser ones. Until R11 each was spelled `<TAG\b([^>]*)>` with
# `re.IGNORECASE`, which is wrong three ways at once:
#
#   * `[^>]*` cannot tell a `>` INSIDE a quoted attribute value from the tag's
#     own terminator — R6's BLOCKER B, on three scans R6 did not reach. Live
#     consequence: `<a title="x>y" href="#intro" data-witness="…">` inside the
#     manifest was truncated at the in-quote `>`, the tokenizer saw no `href`
#     at all, and a CONFORMING document was refused `manifest link href is not
#     a fragment`. Attribute ORDER decided whether a document verified.
#   * `\b` is a word-boundary assertion, so it holds before `-`: `<a-widget>`
#     satisfied `<a\b` and was collected as a manifest anchor, and
#     `<nav-widget id="manifest">` satisfied `<nav\b` and WAS ACCEPTED AS THE
#     MANIFEST. §6.2's boundary set answers exactly this question.
#   * `re.IGNORECASE` folded the tag NAME, while §6.2's boundary-token grammar
#     — and §6.4's own cross-reference to it — hold tag names CASE-SENSITIVE.
#     `<NAV id="manifest">` was the manifest; `<A href="#x" …>` was a link.
#
# The replacement asserts §6.2's OPEN set as a LOOKAHEAD (asserted, never
# consumed, so group 1 stays exactly the attribute blob the tokenizer already
# receives and every byte offset is unchanged), then captures the attribute
# blob with R6's quote-aware alternation. No `\s`, no `\b`, no IGNORECASE: the
# whitespace decision belongs to `_ATTR_SEP` alone (§6.4's one-place-only
# corollary), and the tag name is compared byte for byte.
_DISCOVERY_NEXT = rb'[\t\n\x0c\r />]'   # §6.2's ruled OPEN set, verbatim


def _discovery_open_re(tag: str):
    return re.compile(
        rb'<' + tag.encode('ascii') + rb'(?=' + _DISCOVERY_NEXT + rb')'
        rb'((?:"[^"]*"|\'[^\']*\'|[^<>\'"])*)>')


_NAV_DISCOVERY_RE     = _discovery_open_re('nav')
_ARTICLE_DISCOVERY_RE = _discovery_open_re('article')
_A_DISCOVERY_RE       = _discovery_open_re('a')

# ─── Manifest-first path (§5.3 / §9.1 verify_manifest_first) ─────────────────
_NAV_OPEN_RE     = _NAV_DISCOVERY_RE
_A_TAG_RE        = _A_DISCOVERY_RE
# _HREF_RE / _DW_RE / _CC_RE removed (post-round-4-validation cleanup): zero
# call sites — href, data-witness, and data-char-count are all read via the
# quote-aware `_attrs` tokenizer everywhere in this reader, not by these
# standalone regexes; they were dead code. No mjs twin ever existed for any
# of the three.


def _verify_manifest_first(html: bytes, inert_masks: list) -> int:
    """Verify a manifest-first document.  Returns 0 on PASS, 1 on FAIL."""
    # Locate <nav id="manifest">
    nav_inner = b""
    nav_found = False
    for m in _NAV_OPEN_RE.finditer(html):
        if _in_mask(m.start(), inert_masks):
            continue
        a = _attrs(m.group(1))
        if a.get('id') == 'manifest':
            nav_start = m.end()
            # R4b: find the first `</nav>` at or after nav_start that is NOT
            # itself inside an inert region (§12) — the same `_in_mask` test
            # already used to locate the `<nav id="manifest">` opener above.
            # A `</nav>` written inside an HTML comment INSIDE the manifest
            # (e.g. a commented-out usage example) is not the manifest's
            # real close and must not truncate it.
            search_pos = nav_start
            nav_end_idx = -1
            while True:
                candidate = html.find(b'</nav>', search_pos)
                if candidate < 0:
                    break
                if _in_mask(candidate, inert_masks):
                    search_pos = candidate + 1
                    continue
                nav_end_idx = candidate
                break
            if nav_end_idx < 0:
                print("FAIL: <nav id=\"manifest\"> is unterminated")
                return 1
            nav_inner = html[nav_start:nav_end_idx]
            nav_found = True
            break

    if not nav_found:
        print("FAIL: no <nav id=\"manifest\"> found")
        return 1

    # Collect manifest links
    sections = []
    for m in _A_TAG_RE.finditer(nav_inner):
        # §12 inert regions (comments etc.) are invisible to every check —
        # mirrors the adjacent nav-locating scan's mask idiom above. An <a>
        # written inside an HTML comment inside nav#manifest is not a live
        # manifest entry (a commented-out example, say); skip it rather than
        # refusing the document over dead markup. m.start() is relative to
        # nav_inner, so the mask lookup needs the ABSOLUTE offset (nav_start
        # + m.start()) — inert_masks is built over the whole document.
        if _in_mask(nav_start + m.start(), inert_masks):
            continue
        a = _attrs(m.group(1))
        # `or ''` / `is not None`, not a .get() default: a VALUELESS attribute
        # is recorded as None by the §6.4 tokenizer (Node parity), and the
        # default only fires when the key is absent entirely.
        href = a.get('href') or ''
        dw   = a.get('data-witness') or ''
        # §5.4 already REQUIRES `href="#id"` and `data-witness` on a manifest
        # entry. A malformed entry was previously a silent `continue` — the
        # entry simply vanished from the list, and with it the unit it was
        # supposed to address, so a document could shed a section from the
        # verified set by malforming its own link. That is a refusal, not a
        # drop. The gate is `<a>` inside `<nav id="manifest">`; anchors
        # elsewhere in the document are untouched by this rule.
        if not href.startswith('#'):
            print(f"FAIL: manifest link href is not a fragment: {href}")
            return 1
        if not dw:
            print(f"FAIL: manifest link missing data-witness: {href}")
            return 1
        sid = href[1:]
        # §6.1 id production — the manifest link's fragment IS the addressable
        # unit's id, so it is held to the same production every other live
        # element's id is held to. Reachable here for a fragment that names no
        # element at all (`href="#"`), which the whole-document walk cannot see.
        if not _valid_id(sid):
            print(f"FAIL: invalid id production: {sid}")
            return 1
        cc = None
        # R10 — presence, not value-presence: a valueless `data-char-count` on
        # a manifest link is present with the empty value (§6.4/§6.6, V43).
        if 'data-char-count' in a:
            cc = _parse_count(a['data-char-count'] or '')
            if cc is None:
                return 1
        sections.append({'id': sid, 'witness': dw, 'manifest_cc': cc})

    if not sections:
        print("FAIL: <nav id=\"manifest\"> has no <a> entries")
        return 1

    print(f"sections: {len(sections)}")
    print()

    ok = 0
    mismatch = 0
    missing = 0
    seen_ids: set = set()

    # Locate ALL <section ...> OPENING tags (any nesting depth) via the
    # exact-token grammar (§6.2) — the outer unit-discovery scan MUST use the
    # identical boundary-token rule as the depth-walk, not a looser prefix
    # match. A bogus '<section-foo>' unit is never matched here. Nesting depth
    # AND each opener's own immediate PARENT's close position are tracked
    # alongside, via a single bracket-matching stack pass — depth separates
    # top-level (order-bijection, V29) from nested (nested-recompute, V31);
    # parent_close bounds a nested unit's count-guard scope so it never
    # extends past its own parent's closing tag (a nested unit's "next
    # sibling" for count-guard purposes is either the next same-depth opener
    # or its own parent's close, whichever comes first).
    section_scan_re = _boundary_scan_re('section')
    tag_b = b'section'
    openers = []  # [open_start, open_end, attrs, depth, parent_close]
    stack = []  # indices into `openers` for currently-open ancestors, innermost last
    own_close = {}  # opener index -> this opener's own close-token start position
    pos = 0
    depth = 0
    while True:
        m = section_scan_re.search(html, pos)
        if not m:
            break
        if _in_mask(m.start(), inert_masks):
            pos = m.end()
            continue
        kind, val = _classify_boundary_token(m, tag_b)
        if kind == 'open':
            tag_end = html.index(b'>', val)
            open_start, open_end = m.start(), tag_end + 1
            # R8 RULING (Operator, 2026-08-22) — NO `\s` at the tag-name/attrs
            # join. This pattern used to spell the join `\s*`, and that is a
            # SEPARATOR decision made outside the one pinned separator predicate:
            # Python's BYTES-mode `\s` is the six ASCII whitespace bytes (VT
            # included) while verify.mjs's STRING-mode `\s` was the 25-codepoint
            # Unicode class. While `_ATTR_SEP` still held all 25 the two agreed by
            # accident — whatever one regex left behind, the other reader's tokenizer
            # skipped anyway. Narrowing `_ATTR_SEP` to HTML5's five breaks that
            # accident: `<article \xa0id="x">` would leave py the blob
            # `\xa0id=...` (name mangled, no `id` visible) and mjs the blob
            # `id=...` (id visible) — a live cross-reader divergence, confirmed by
            # probe before this line was changed. The fix is the shape
            # `_ANY_OPEN_TAG_RE` (the whole-document id walk) already carries and
            # R8/BLOCKER A already ruled correct: capture the blob whole, make no
            # whitespace decision here at all, and let `_attrs`/`_refuse_noncanonical_
            # attrs` — the single pinned `_ATTR_SEP` predicate, identical in both
            # readers — decide what a separator is. Group 1 now begins at the §6.2
            # boundary byte itself; the byte-offset arithmetic below is unchanged
            # (`.start(1)` moves earlier by exactly what the tokenizer then skips).
            tag_match = re.match(rb'<section([^>]*)>', html[open_start:open_end])
            # §6.4 V24/V25 — every <section> (any depth) is a witnessed unit
            # in v0.3; its opening tag must be canonically serialized.
            if tag_match:
                try:
                    _refuse_noncanonical_attrs(
                        tag_match.group(1),
                        open_start + tag_match.start(1))
                except NonCanonical as e:
                    print(f"FAIL: {e}")
                    return 1
            a = _attrs(tag_match.group(1)) if tag_match else {}
            openers.append([open_start, open_end, a, depth, None])
            stack.append(len(openers) - 1)
            depth += 1
        elif kind == 'noncanonical':
            print(f"FAIL: NON-CANONICAL — off-grammar boundary token for <section> "
                  f"at byte offset {val}")
            return 1
        else:  # 'close'
            depth = max(0, depth - 1)
            if stack:
                closed_idx = stack.pop()
                own_close[closed_idx] = m.start()
        pos = m.end()

    # Second pass: each opener's parent_close (slot 4) = its immediate
    # enclosing opener's OWN close position (from own_close, above) — or None
    # if the opener is top-level. A depth-ordered ancestor stack over the
    # already-document-order `openers` list derives "immediate enclosing
    # opener" directly from the recorded depth values (cheap: len(openers)
    # iterations, no re-scan of the document).
    _ancestor_stack = []
    for i, o in enumerate(openers):
        while _ancestor_stack and openers[_ancestor_stack[-1]][3] >= o[3]:
            _ancestor_stack.pop()
        parent_idx = _ancestor_stack[-1] if _ancestor_stack else None
        o[4] = own_close.get(parent_idx) if parent_idx is not None else None
        _ancestor_stack.append(i)

    opener_starts = [o[0] for o in openers]

    # V29 order-bijection: the manifest's link order and the body's top-level
    # section document-order MUST name the identical id sequence.
    toplevel_openers = [o for o in openers if o[3] == 0]
    manifest_id_seq = [s['id'] for s in sections]
    body_id_seq = [o[2].get('id') for o in toplevel_openers]
    if manifest_id_seq != body_id_seq:
        print("FAIL: order-bijection — manifest order "
              f"{manifest_id_seq} != body order {body_id_seq}")
        return 1

    for s in sections:
        sid = s['id']
        # Find the matching TOP-LEVEL <section> opener whose id matches sid.
        match = None
        for open_start, open_end, a, opener_depth, parent_close in toplevel_openers:
            if a.get('id') == sid:
                match = (open_start, open_end, a)
                break

        if not match:
            print(f"MISSING in body: {sid}")
            missing += 1
            continue

        open_start, open_end, section_attrs = match

        if sid in seen_ids:
            print(f"FAIL: duplicate id: {sid}")
            return 1
        seen_ids.add(sid)

        try:
            inner = _witnessed_bytes(html, open_end, opener_starts, 'section',
                                      inert_masks, sid)
        except NonCanonical as e:
            print(f"FAIL: {e}")
            return 1
        except RuntimeError as e:
            print(f"FAIL: {e}")
            missing += 1
            continue

        actual = hashlib.sha256(inner).hexdigest()

        # V4 two-carrier agreement (§6.3): BOTH the section's own data-witness
        # and the manifest link's data-witness MUST equal the recomputed
        # digest. Checking only "manifest witness == recomputed" (as before)
        # misses the case where the SECTION's own carrier disagrees with a
        # correct manifest link (the carrier-mismatch fixture: a section
        # stamped with 64 zeros while the link carries the true hash) — a
        # reader that only checks the manifest carrier accepts that document.
        sec_dw = section_attrs.get('data-witness')
        if sec_dw is None:
            print(f"FAIL section id={sid}: section element carries no data-witness")
            mismatch += 1
            continue
        if sec_dw != actual:
            print(f"FAIL section id={sid}: section data-witness={sec_dw} actual={actual} "
                  f"(carrier disagreement: section)")
            mismatch += 1
            continue
        if s['witness'] != actual:
            print(f"FAIL section id={sid}: claimed={s['witness']} actual={actual} "
                  f"(carrier disagreement: link)")
            mismatch += 1
            continue
        if sec_dw != s['witness']:
            print(f"FAIL section id={sid}: section data-witness={sec_dw} != "
                  f"link data-witness={s['witness']} (carrier disagreement: link vs section)")
            mismatch += 1
            continue

        # §6.6 char-count
        actual_cc = len(inner.decode('utf-8', errors='strict'))
        bad_cc = False

        if s['manifest_cc'] is not None and s['manifest_cc'] != actual_cc:
            print(f"FAIL {sid}: char-count manifest={s['manifest_cc']} actual={actual_cc}")
            mismatch += 1
            bad_cc = True

        sec_cc = None
        # R10 — presence, not value-presence (V43).
        if 'data-char-count' in section_attrs:
            sec_cc = _parse_count(section_attrs['data-char-count'] or '')
            if sec_cc is None:
                return 1

        if sec_cc is not None and sec_cc != actual_cc:
            print(f"FAIL {sid}: char-count section-attr={sec_cc} actual={actual_cc}")
            mismatch += 1
            bad_cc = True

        if (s['manifest_cc'] is not None and sec_cc is not None
                and s['manifest_cc'] != sec_cc):
            print(f"FAIL {sid}: char-count manifest={s['manifest_cc']} "
                  f"vs section-attr={sec_cc} (diverge)")
            mismatch += 1
            bad_cc = True

        if not bad_cc:
            ok += 1

    # V31 nested witnessed-section recompute (verify-all, charter decision #2).
    # A nested <section data-witness> — not reachable from the manifest's
    # top-level link list, but present inside another witnessed unit's span —
    # is ALSO an addressable unit under §5.2 and MUST have its own witness
    # recomputed, exactly as a top-level section's is (§7.2 fold-confirmation:
    # "every prior consecrated witness still re-derives" carries no nesting-
    # depth carve-out). This closes the divergence with
    # trials/scripts/verify_sections.py's isolation-mode checker, which
    # recomputes every section it finds regardless of nesting depth.
    nested_ok = 0
    nested_mismatch = 0
    for open_start, open_end, a, opener_depth, parent_close in openers:
        if opener_depth == 0:
            continue  # top-level — already verified above
        # Same absent/valueless split as the article walk above: absent means
        # non-witnessed structural nesting, valueless is a witness verify.mjs
        # refuses as invalid grammar. This test comes FIRST: whether the unit is
        # addressable at all is decided by the WITNESS, not by the id — so a
        # witnessed unit missing its id is a verdict, not a skip.
        if 'data-witness' not in a:
            continue  # non-witnessed structural nesting — not addressable
        nid = a.get('id')
        # §5.2 REQUIRES an id on an addressable unit, and a nested <section>
        # carrying data-witness IS one. Refuse rather than skip. This also
        # retires the latent `seen_ids.add(None)` — under the old ordering an
        # id-less witnessed nested section fell through to the dup guard, so
        # the FIRST one was silently skipped and every later one was skipped
        # again as a "duplicate" of None. An all-zeros witness on such a
        # section is now refused, never passed.
        if not nid:
            print("FAIL: nested <section data-witness> with no id")
            return 1
        if not _valid_id(nid):
            print(f"FAIL: invalid id production: {nid}")
            return 1
        if nid in seen_ids:
            continue
        ndw = a['data-witness']
        seen_ids.add(nid)  # dup-id already enforced globally (§9.1)

        # A nested unit's count-guard scope MUST NOT extend past its own
        # immediate parent's closing tag (§6.2) — the shared _witnessed_bytes
        # helper's scope-end derivation assumes *opener_starts* bounds a
        # TOP-LEVEL unit's sibling window; for a nested unit that same
        # derivation would otherwise fall through to len(html) when there is
        # no later opener at all, wrongly counting the parent's own closer as
        # a surplus. parent_close (recorded during the opener scan) is
        # injected as an extra scope-end candidate so the nested unit's own
        # window stops there when no shallower sibling opener exists first.
        nested_opener_starts = opener_starts
        if parent_close is not None:
            nested_opener_starts = sorted(opener_starts + [parent_close])

        try:
            ninner = _witnessed_bytes(html, open_end, nested_opener_starts, 'section',
                                       inert_masks, nid)
        except NonCanonical as e:
            print(f"FAIL: {e}")
            return 1
        except RuntimeError as e:
            print(f"FAIL: {e}")
            nested_mismatch += 1
            continue

        n_epoch = _INVALID if ndw is None else _classify_witness(ndw)
        if n_epoch == _INVALID:
            print(f"FAIL: invalid witness grammar on nested <section id={nid}>")
            nested_mismatch += 1
            continue
        if n_epoch == _CONSECRATED:
            n_actual = hashlib.sha256(ninner).hexdigest()
            if n_actual != ndw:
                print(f"FAIL nested section id={nid}: claimed={ndw} actual={n_actual}")
                nested_mismatch += 1
                continue

        # R10 — presence, not value-presence (V43).
        if 'data-char-count' in a:
            ncc = _parse_count(a['data-char-count'] or '')
            if ncc is None:
                return 1
            nactual_cc = len(ninner.decode('utf-8', errors='strict'))
            if ncc != nactual_cc:
                print(f"FAIL nested section id={nid}: "
                      f"char-count claimed={ncc} actual={nactual_cc}")
                nested_mismatch += 1
                continue

        nested_ok += 1

    if nested_ok or nested_mismatch:
        print(f"nested sections recomputed: {nested_ok} ok, {nested_mismatch} mismatch")

    print(f"verified {ok}/{len(sections)} sections "
          f"(mismatches: {mismatch}, missing: {missing})")
    if mismatch > 0 or missing > 0 or nested_mismatch > 0:
        return 1
    return 0


# ─── Entry point ─────────────────────────────────────────────────────────────
def main(file_path: str) -> int:
    html = Path(file_path).read_bytes()

    # ─── R7: whole-document UTF-8 well-formedness — the FIRST check, before any
    # other, including the id scan ─────────────────────────────────────────────
    # Pre-existing on the sealed baseline: invalid UTF-8 anywhere in the
    # document diverges the two readers. verify.py either PASSes silently
    # (an off-grammar byte outside any `errors='strict'` decode site is never
    # even looked at) or raises an unhandled UnicodeDecodeError — a Python
    # traceback, not a "FAIL: ..." verdict — depending on WHERE the bad byte
    # falls; verify.mjs reads the file via `fs.readFileSync(path, "utf8")`,
    # which never throws and instead silently substitutes U+FFFD per invalid
    # byte, so it reports whatever downstream mismatch that substitution
    # happens to cause rather than the real defect. Two different failure
    # shapes for the identical input is a divergence R5 (same-reason parity)
    # forbids, so this trial closes it as a new fail-closed rule (R7): both
    # readers validate the ENTIRE raw file is well-formed UTF-8 before doing
    # anything else with it — no shape detection, no id scan, no masking.
    #
    # `bytes.decode('utf-8', 'strict')` raises UnicodeDecodeError whose
    # `.start` is the byte offset of the first byte of the ill-formed
    # subsequence (CPython's decoder follows the Unicode Standard's Table 3-7
    # "well-formed UTF-8 byte sequences" restricted-second-byte table, which is
    # exactly what rules out overlong encodings, encoded surrogates
    # (U+D800..U+DFFF), and codepoints above U+10FFFF — not merely "is this
    # byte in 0x00-0xFF", which would accept all three). verify.mjs's twin
    # (`firstInvalidUtf8Offset`) is a hand-written scanner over the same table,
    # proven to agree with this on every probe case in the fixture battery
    # (truncated multibyte at EOF, overlong, surrogate, stray continuation
    # byte, invalid lead byte) — see that function's own comment for the table.
    #
    # A UTF-8 BOM (`EF BB BF`) at offset 0 is NOT rejected here: it is a
    # legal, well-formed UTF-8 encoding of U+FEFF, so `errors='strict'` does
    # not raise on it, and empirically neither reader's behavior on a
    # BOM-prefixed document differs from the same document without one (the
    # BOM sits in the prelude before any witnessed span or checked construct,
    # so it is inert to every downstream check on both readers) — no
    # divergence exists to close, so this rule adds none.
    try:
        html.decode('utf-8', 'strict')
    except UnicodeDecodeError as e:
        print(f"FAIL: invalid UTF-8 at byte offset {e.start}")
        return 1

    # One mask set for the whole reader: the inert regions of §12 — HTML
    # comments AND <script>/<style> raw-text content. Boundary-token matching
    # (§6.2), unit discovery (§9.1), the count guard, shape detection, the
    # content-profile check (§6.4a), and the dup-id scan (§6.1) all mask the
    # same regions, because a token or id-shaped substring inside a comment or
    # raw-text block is never real markup to a browser (§12) and MUST NOT match
    # a boundary or be counted anywhere.
    inert_masks = _build_inert_mask(html)

    # §6.1/§9.1 whole-document id check — runs BEFORE shape dispatch, over
    # every live element's id (not only addressable-unit ids; V5/V30/V33): the
    # id PRODUCTION and then uniqueness, in document order. Uses inert_masks
    # (comments + <script>/<style> raw-text content, §12) so a literal
    # id-shaped substring inside JS/CSS text is not mistaken for a real
    # element's id.
    id_fault = _find_global_id_fault(html, inert_masks)
    if id_fault is not None:
        kind, val = id_fault
        if kind == 'production':
            print(f"FAIL: invalid id production: {val}")
        elif kind == 'duplicate':
            print(f"FAIL: duplicate id: {val}")
        elif kind == 'dup-attr':  # R6c: duplicate attribute NAME on any tag
            name, offset = val
            print(f"FAIL: duplicate attribute name '{name}' in tag at byte offset {offset}")
        else:  # 'malformed' — BLOCKER 1: unterminated attribute quote
            print(f"FAIL: unterminated attribute quote in tag at byte offset {val}")
        return 1

    # Shape detection (§5.0)
    # 1. manifest-first if <nav id="manifest"> is present
    nav_found = False
    # R11 — the §5.0 discovery grammar: exact ASCII tag name bounded by §6.2's
    # OPEN set, quote-aware to the tag's own '>' (see `_discovery_open_re`).
    for m in _NAV_DISCOVERY_RE.finditer(html):
        if _in_mask(m.start(), inert_masks):
            continue
        a = _attrs(m.group(1))
        if a.get('id') == 'manifest':
            nav_found = True
            break

    # 2. tail if ≥1 <article data-witness> with valid-grammar witness
    tail_found = False
    # R11 — the same §5.0 discovery grammar as the nav scan above.
    for m in _ARTICLE_DISCOVERY_RE.finditer(html):
        if _in_mask(m.start(), inert_masks):
            continue
        a = _attrs(m.group(1))
        # None, not absence: a valueless `data-witness` carries no witness, so
        # it cannot make this document a tail (§5.0 shape detection).
        dw_val = a.get('data-witness')
        if dw_val is None:
            continue
        epoch = _classify_witness(dw_val)
        if epoch != _INVALID:
            tail_found = True
            break

    # V18 — mixed-shape refusal, reachable even when a manifest is present.
    if nav_found and tail_found:
        print("FAIL: mixed shapes — both <nav id=\"manifest\"> and a witnessed "
              "<article data-witness> are present (homogeneity violation)")
        return 1

    if nav_found:
        return _verify_manifest_first(html, inert_masks)
    if tail_found:
        return _verify_tail(html, inert_masks)

    # 3. neither
    # RP-2 RULED (Operator, 2026-08-23) — ONE canonical shape-detection
    # sentence, byte-identical on both readers. THIS phrasing is the canonical
    # one; verify.mjs used to spell the same finding `… and no witnessed
    # <article> elements with valid-grammar witness` (the fourth of the five
    # pre-existing verdict-WORDING drifts SPEC.md §13 disclosed) and now emits
    # these bytes. Nothing on this line moved — that is the point of the choice.
    print("FAIL: shape detection failed — "
          "no <nav id=\"manifest\"> and no witnessed <article> with valid grammar")
    return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <file>", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
