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
_ATTR_RE = re.compile(rb'(\w[\w-]*)="([^"]*)"')


def _attrs(tag_inner: bytes) -> dict:
    return {m.group(1).decode(): m.group(2).decode()
            for m in _ATTR_RE.finditer(tag_inner)}


# ─── Comment masking (§6.2) ──────────────────────────────────────────────────
_COMMENT_RE = re.compile(rb'<!--.*?-->', re.DOTALL)


def _build_comment_mask(html: bytes) -> list:
    return [(m.start(), m.end()) for m in _COMMENT_RE.finditer(html)]


def _in_mask(pos: int, masks: list) -> bool:
    for start, end in masks:
        if start <= pos < end:
            return True
        if start > pos:
            break
    return False


# ─── §6.2 generalized depth-walk ─────────────────────────────────────────────
def _extract_inner(html: bytes, opener_end: int, tag: str, masks: list,
                   elem_id: str) -> bytes:
    """Return the raw inner bytes for the addressable element whose opening tag
    ends at *opener_end*.  *tag* is 'section' or 'article' (lowercase).

    Raises RuntimeError if the element is unterminated.
    """
    tag_b = tag.encode()
    close_open_re = re.compile(
        rb'<' + tag_b + rb'\b|</' + tag_b + rb'>',
        re.IGNORECASE,
    )
    depth = 1
    pos = opener_end
    while depth > 0:
        m = close_open_re.search(html, pos)
        if not m:
            raise RuntimeError(f"unterminated <{tag} id={elem_id}>")
        if _in_mask(m.start(), masks):
            pos = m.end()
            continue
        if m.group(0).lower().startswith(b'<' + tag_b):
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                return html[opener_end:m.start()]
        pos = m.end()
    raise RuntimeError(f"unterminated <{tag} id={elem_id}> (loop exit)")


# ─── Shared helpers ───────────────────────────────────────────────────────────
_VALID_ID_RE = re.compile(r'^[A-Za-z_][\w\-.:]*$')


def _valid_id(id_str: str) -> bool:
    return bool(_VALID_ID_RE.match(id_str))


# ─── Tail path (§5.3b / §9.1 verify_tail) ───────────────────────────────────
def _verify_tail(html: bytes, masks: list) -> int:
    """Verify a writing-room-tail document.  Returns 0 on PASS, 1 on FAIL."""
    article_open_re = re.compile(rb'<article\b([^>]*)>', re.IGNORECASE)
    seen_ids: set = set()
    ok = 0
    mismatch = 0
    missing = 0
    valid_count = 0  # non-vacuity counter

    for opener in article_open_re.finditer(html):
        if _in_mask(opener.start(), masks):
            continue
        a = _attrs(opener.group(1))
        if 'data-witness' not in a:
            continue
        epoch = _classify_witness(a['data-witness'])
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
            inner = _extract_inner(html, opener.end(), 'article', masks, id_val)
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

        # §6.6 char-count (optional)
        if 'data-char-count' in a:
            try:
                claimed_cc = int(a['data-char-count'])
            except ValueError:
                claimed_cc = None
            if claimed_cc is not None:
                actual_cc = len(inner.decode('utf-8', errors='strict'))
                if actual_cc != claimed_cc:
                    print(f"FAIL article id={id_val}: "
                          f"char-count claimed={claimed_cc} actual={actual_cc}")
                    mismatch += 1
                    continue

        ok += 1

    # Non-vacuity (§7.3)
    if valid_count == 0:
        print("FAIL: vacuous — zero consecrated articles with recomputing witnesses")
        return 1

    total = ok + mismatch + missing
    print(f"articles: {total}")
    print()
    print(f"verified {ok}/{total} articles (mismatches: {mismatch}, missing: {missing})")
    if mismatch > 0 or missing > 0:
        return 1
    return 0


# ─── Manifest-first path (§5.3 / §9.1 verify_manifest_first) ─────────────────
_SECTION_OPEN_RE = re.compile(rb'<section\b([^>]*)>', re.IGNORECASE)
_NAV_OPEN_RE     = re.compile(rb'<nav\b([^>]*)>', re.IGNORECASE)
_A_TAG_RE        = re.compile(rb'<a\b([^>]*)>', re.IGNORECASE)
_HREF_RE         = re.compile(rb'href="([^"]*)"')
_DW_RE           = re.compile(rb'data-witness="([^"]*)"')
_CC_RE           = re.compile(rb'data-char-count="([^"]*)"')


def _verify_manifest_first(html: bytes, masks: list) -> int:
    """Verify a manifest-first document.  Returns 0 on PASS, 1 on FAIL."""
    # Locate <nav id="manifest">
    nav_inner = b""
    nav_found = False
    for m in _NAV_OPEN_RE.finditer(html):
        if _in_mask(m.start(), masks):
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
        href = a.get('href', '')
        dw   = a.get('data-witness', '')
        if not href.startswith('#') or not dw:
            continue
        sid = href[1:]
        cc = None
        if 'data-char-count' in a:
            try:
                cc = int(a['data-char-count'])
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

    for s in sections:
        sid = s['id']
        # Find the matching <section> in the body
        opener_match = None
        for m in _SECTION_OPEN_RE.finditer(html):
            if _in_mask(m.start(), masks):
                continue
            a = _attrs(m.group(1))
            if a.get('id') == sid:
                opener_match = m
                break

        if not opener_match:
            print(f"MISSING in body: {sid}")
            missing += 1
            continue

        if sid in seen_ids:
            print(f"FAIL: duplicate id: {sid}")
            return 1
        seen_ids.add(sid)

        try:
            inner = _extract_inner(html, opener_match.end(), 'section', masks, sid)
        except RuntimeError as e:
            print(f"FAIL: {e}")
            missing += 1
            continue

        actual = hashlib.sha256(inner).hexdigest()
        if actual != s['witness']:
            print(f"FAIL section id={sid}: claimed={s['witness']} actual={actual}")
            mismatch += 1
            continue

        # §6.6 char-count
        section_attrs = _attrs(opener_match.group(1))
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

    print(f"verified {ok}/{len(sections)} sections "
          f"(mismatches: {mismatch}, missing: {missing})")
    if mismatch > 0 or missing > 0:
        return 1
    return 0


# ─── Entry point ─────────────────────────────────────────────────────────────
def main(file_path: str) -> int:
    html = Path(file_path).read_bytes()
    masks = _build_comment_mask(html)

    # Shape detection (§5.0)
    # 1. manifest-first if <nav id="manifest"> is present
    nav_re = re.compile(rb'<nav\b([^>]*)>', re.IGNORECASE)
    for m in nav_re.finditer(html):
        if _in_mask(m.start(), masks):
            continue
        a = _attrs(m.group(1))
        if a.get('id') == 'manifest':
            return _verify_manifest_first(html, masks)

    # 2. tail if ≥1 <article data-witness> with valid-grammar witness
    article_re = re.compile(rb'<article\b([^>]*)>', re.IGNORECASE)
    for m in article_re.finditer(html):
        if _in_mask(m.start(), masks):
            continue
        a = _attrs(m.group(1))
        if 'data-witness' not in a:
            continue
        epoch = _classify_witness(a['data-witness'])
        if epoch != _INVALID:
            return _verify_tail(html, masks)

    # 3. neither
    print("FAIL: shape detection failed — "
          "no <nav id=\"manifest\"> and no witnessed <article> with valid grammar")
    return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <file>", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
