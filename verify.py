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
_CONSECRATED_RE = re.compile(r'^[0-9a-f]{64}$')
_WRITING_ROOM_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')

# Epoch sentinels
_CONSECRATED  = "consecrated"
_WRITING_ROOM = "writing-room"
_INVALID      = "invalid"


def _classify_witness(value: str) -> str:
    """Return _CONSECRATED, _WRITING_ROOM, or _INVALID based on form alone."""
    is_sha = bool(_CONSECRATED_RE.match(value))
    is_ts  = bool(_WRITING_ROOM_RE.match(value))
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
# JS `\s` — the character class verify.mjs's tokenizer skips. verify.mjs reads
# the document as a UTF-8 STRING, so its separators are Unicode whitespace
# characters, not ASCII bytes. A byte-level model swallows a U+2028 separator's
# bytes into the attribute NAME, loses the carrier, and falsely refuses a record
# both sealed readers accept (round-seven-c fleet, T17).
_JS_WS = frozenset('\t\n\x0b\x0c\r \xa0\u1680'
                   + ''.join(chr(c) for c in range(0x2000, 0x200b))
                   + '\u2028\u2029\u202f\u205f\u3000\ufeff')


def _attrs(tag_inner: bytes) -> dict:
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
    """
    s = tag_inner.decode('utf-8', 'replace')
    attrs = {}
    n = len(s)
    i = 0
    while i < n:
        while i < n and s[i] in _JS_WS:
            i += 1
        if i >= n:
            break
        name_start = i
        while i < n and s[i] not in _JS_WS and s[i] not in ('=', '"', "'"):
            i += 1
        if i == name_start:
            i += 1
            continue
        name = s[name_start:i].lower()
        j = i
        while j < n and s[j] in _JS_WS:
            j += 1
        if j < n and s[j] == '=':
            j += 1
            while j < n and s[j] in _JS_WS:
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
                while j < n and s[j] not in _JS_WS:
                    j += 1
                attrs[name] = s[val_start:j]
            i = j
        else:
            attrs[name] = None
            i = j
    return attrs


# ─── Comment masking (§6.2) ──────────────────────────────────────────────────
_COMMENT_RE = re.compile(rb'<!--.*?-->', re.DOTALL)


def _in_mask(pos: int, masks: list) -> bool:
    for start, end in masks:
        if start <= pos < end:
            return True
        if start > pos:
            break
    return False


# ─── Inert regions (§12) — comments + raw-text <script>/<style> content ──────
_RAWTEXT_RE = re.compile(rb'<(script|style)\b[^>]*>.*?</\1>', re.IGNORECASE | re.DOTALL)


def _build_inert_mask(html: bytes) -> list:
    """Union of comment spans and raw-text (<script>/<style>) content spans (§12),
    sorted by start offset. Used for boundary-token matching (§6.2), unit
    discovery (§9.1), the count guard, shape detection, the content-profile
    prohibition (§6.4a), and the dup-id scan (§6.1).

    Comment bytes are neutralized (blanked to spaces, length-preserving) BEFORE
    the raw-text scan so a `<script>`/`<style>` — or a `</style>`/`</script>` —
    that appears only as text INSIDE a comment cannot be mistaken for a real
    raw-text element. Otherwise the non-greedy raw-text regex, once anchored at a
    comment's `<style>` mention, would consume through to the next REAL
    `</style>`, spawning a bogus span that masks every byte of legitimate markup
    in between (and starving the real element of its own span). Same-length
    blanking preserves every byte offset, so the spans below are valid offsets
    into the original document."""
    comment_spans = [(m.start(), m.end()) for m in _COMMENT_RE.finditer(html)]
    scan = _COMMENT_RE.sub(lambda m: b' ' * (m.end() - m.start()), html)
    spans = list(comment_spans)
    for m in _RAWTEXT_RE.finditer(scan):
        # Only the raw-text CONTENT (between the opening '>' and the closing tag's '<')
        # is inert per §12; the element's own open/close tags are ordinary markup.
        open_end = scan.index(b'>', m.start()) + 1
        close_start = m.end() - len(b'</' + m.group(1) + b'>')
        if open_end < close_start:
            spans.append((open_end, close_start))
    spans.sort()
    return spans


# ─── §6.1 whole-document dup-id scan (V5/V30) ────────────────────────────────
# A "live element" is ANY element carrying an id= attribute — top-level
# section/article units, nested sections, manifest <a> link targets, and any
# id-bearing <img> (§5.5) or other element. §6.1's uniqueness rule is a
# property of the whole document's id space, not a per-tag-name rule, so this
# scan walks every opening tag in the document (outside inert regions), not
# only addressable-unit opening tags.
_ANY_OPEN_TAG_RE = re.compile(rb'<([a-zA-Z][\w-]*)((?:\s+[^<>]*)?)>')


def _find_global_dup_id(html: bytes, masks: list) -> str:
    """Return the first id value seen twice across every opening tag in the
    document (quote-aware, inert-region-masked), or None if all ids are
    unique. Document order (first-to-second occurrence)."""
    seen = set()
    for m in _ANY_OPEN_TAG_RE.finditer(html):
        if _in_mask(m.start(), masks):
            continue
        a = _attrs(m.group(2))
        id_val = a.get('id')
        if id_val is None:
            continue
        if id_val in seen:
            return id_val
        seen.add(id_val)
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
    """
    seen = set()
    n = len(tag_inner)
    i = 0
    while i < n:
        while i < n and tag_inner[i:i + 1].isspace():
            i += 1
        if i >= n:
            break
        name_start = i
        while (i < n and not tag_inner[i:i + 1].isspace()
               and tag_inner[i:i + 1] not in (b'=', b'"', b"'")):
            i += 1
        if i == name_start:
            i += 1
            continue
        name = tag_inner[name_start:i].lower()
        if name in seen:
            raise NonCanonical(
                f"duplicate attribute name '{name.decode('ascii', 'replace')}' "
                "on a witnessed-unit opening tag (§6.4, V25)",
                tag_inner_start + name_start)
        seen.add(name)
        j = i
        while j < n and tag_inner[j:j + 1].isspace():
            j += 1
        if j < n and tag_inner[j:j + 1] == b'=':
            j += 1
            while j < n and tag_inner[j:j + 1].isspace():
                j += 1
            if j < n and tag_inner[j:j + 1] == b'"':
                j += 1
                while j < n and tag_inner[j:j + 1] != b'"':
                    j += 1
                if j < n:
                    j += 1
            else:
                form = ('single-quoted' if j < n and tag_inner[j:j + 1] == b"'"
                        else 'unquoted')
                raise NonCanonical(
                    f"{form} value for attribute "
                    f"'{name.decode('ascii', 'replace')}' "
                    "on a witnessed-unit opening tag (§6.4, V24)",
                    tag_inner_start + min(j, n - 1 if n else 0))
            i = j
        else:
            i = j  # valueless attribute — V24 governs valued attributes only


# ─── §6.2 boundary-token grammar (normative, exact) ──────────────────────────
# A boundary-adjacent scan: find every '<' + TAG occurrence (open-ish) and every
# '</' + TAG occurrence (close-ish), case-sensitive lowercase per §6.2, and
# classify each as: exact open token, exact close token, NON-CANONICAL close
# (interior whitespace before '>'), or ordinary content (e.g. <section-foo>,
# which is not a boundary of any kind).
def _boundary_scan_re(tag: str):
    tag_b = tag.encode()
    # Group 1: open-ish '<TAG' immediately followed by captured next byte.
    # Group 2: close-ish '</TAG' followed by everything up to (and including) '>'.
    return re.compile(
        rb'<' + tag_b + rb'(?P<open_next>.)'
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
        if nxt in (b' ', b'\t', b'\n', b'\r', b'\f', b'\v', b'/', b'>'):
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
_VALID_ID_RE = re.compile(r'^[A-Za-z_][\w\-.:]*$')


def _valid_id(id_str: str) -> bool:
    return bool(_VALID_ID_RE.match(id_str))


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
        inner_attrs_match = re.match(rb'<article\s*([^>]*)>', opener_bytes)
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

        # §6.6 char-count (optional). Read via .get() and test for None:
        # the §6.4 tokenizer records a VALUELESS attribute as None (Node
        # parity), so a presence test alone would hand None to int().
        cc_str = a.get('data-char-count')
        if cc_str is not None:
            try:
                claimed_cc = int(cc_str)
            except ValueError:
                claimed_cc = None
            if claimed_cc is not None:
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


# ─── Manifest-first path (§5.3 / §9.1 verify_manifest_first) ─────────────────
_NAV_OPEN_RE     = re.compile(rb'<nav\b([^>]*)>', re.IGNORECASE)
_A_TAG_RE        = re.compile(rb'<a\b([^>]*)>', re.IGNORECASE)
_HREF_RE         = re.compile(rb'href="([^"]*)"')
_DW_RE           = re.compile(rb'data-witness="([^"]*)"')
_CC_RE           = re.compile(rb'data-char-count="([^"]*)"')


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
            nav_end_idx = html.find(b'</nav>', nav_start)
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
        a = _attrs(m.group(1))
        # `or ''` / `is not None`, not a .get() default: a VALUELESS attribute
        # is recorded as None by the §6.4 tokenizer (Node parity), and the
        # default only fires when the key is absent entirely.
        href = a.get('href') or ''
        dw   = a.get('data-witness') or ''
        if not href.startswith('#') or not dw:
            continue
        sid = href[1:]
        cc = None
        cc_str = a.get('data-char-count')
        if cc_str is not None:
            try:
                cc = int(cc_str)
            except ValueError:
                pass
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
            tag_match = re.match(rb'<section\s*([^>]*)>', html[open_start:open_end])
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

        sec_cc_str = section_attrs.get('data-char-count')
        sec_cc = None
        if sec_cc_str is not None:
            try:
                sec_cc = int(sec_cc_str)
            except ValueError:
                pass

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
        nid = a.get('id')
        if nid is None or nid in seen_ids:
            continue
        # Same absent/valueless split as the article walk above: absent means
        # non-witnessed structural nesting, valueless is a witness verify.mjs
        # refuses as invalid grammar.
        if 'data-witness' not in a:
            continue  # non-witnessed structural nesting — not addressable
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

        ncc_str = a.get('data-char-count')
        if ncc_str is not None:
            try:
                ncc = int(ncc_str)
                nactual_cc = len(ninner.decode('utf-8', errors='strict'))
                if ncc != nactual_cc:
                    print(f"FAIL nested section id={nid}: "
                          f"char-count claimed={ncc} actual={nactual_cc}")
                    nested_mismatch += 1
                    continue
            except ValueError:
                pass

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
    # One mask set for the whole reader: the inert regions of §12 — HTML
    # comments AND <script>/<style> raw-text content. Boundary-token matching
    # (§6.2), unit discovery (§9.1), the count guard, shape detection, the
    # content-profile check (§6.4a), and the dup-id scan (§6.1) all mask the
    # same regions, because a token or id-shaped substring inside a comment or
    # raw-text block is never real markup to a browser (§12) and MUST NOT match
    # a boundary or be counted anywhere.
    inert_masks = _build_inert_mask(html)

    # §6.1/§9.1 whole-document dup-id check — runs BEFORE shape dispatch, over
    # every live element's id (not only addressable-unit ids; V5/V30). Uses
    # inert_masks (comments + <script>/<style> raw-text content, §12) so a
    # literal id-shaped substring inside JS/CSS text is not mistaken for a
    # real element's id.
    dup_id = _find_global_dup_id(html, inert_masks)
    if dup_id is not None:
        print(f"FAIL: duplicate id: {dup_id}")
        return 1

    # Shape detection (§5.0)
    # 1. manifest-first if <nav id="manifest"> is present
    nav_found = False
    nav_re = re.compile(rb'<nav\b([^>]*)>', re.IGNORECASE)
    for m in nav_re.finditer(html):
        if _in_mask(m.start(), inert_masks):
            continue
        a = _attrs(m.group(1))
        if a.get('id') == 'manifest':
            nav_found = True
            break

    # 2. tail if ≥1 <article data-witness> with valid-grammar witness
    tail_found = False
    article_re = re.compile(rb'<article\b([^>]*)>', re.IGNORECASE)
    for m in article_re.finditer(html):
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
    print("FAIL: shape detection failed — "
          "no <nav id=\"manifest\"> and no witnessed <article> with valid grammar")
    return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <file>", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
