#!/usr/bin/env python3
"""Extract the manifest from a manifest-first doc.html file.

Reads the whole file from disk (cheap, local IO), finds the
<nav id="manifest"> block in the document body, and synthesizes a JSON
manifest from its <a href="#..." data-witness="..."> entries. Prints the
JSON to stdout. The model only sees stdout — the rest of the file never
enters context.

This is a CONVENIENCE helper (apparatus-tier, non-normative). The canonical
verifier is trials/scripts/naive_reader.py + trials/scripts/verify_sections.py.

Usage:
    manifest.py [--verify] <path-to-doc.html>

With --verify (opt-in), every manifest entry is additionally checked against
the body: the section's raw inner bytes are re-hashed (SHA-256) and compared
to the claimed witness (and char-count, when claimed). Exit 0 only if all
entries verify. Recomputation never happens spontaneously (0/27 in the
drift-defense tracer) — invoke it.
"""
from __future__ import annotations
import hashlib
import json
import re
import sys
from pathlib import Path

# Force UTF-8 stdout so the script works on Windows consoles (cp1252 default).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Locate <nav ...> opening tags (case-insensitive).
_NAV_OPEN_RE = re.compile(r'<nav\b([^>]*)>', re.IGNORECASE)

# Locate each <a ...>...</a> within the nav block.
_ANCHOR_RE = re.compile(
    r'<a\b([^>]*)>(.*?)</a>',
    re.DOTALL | re.IGNORECASE,
)


def parse_tag_attrs(tag_inner: str) -> dict[str, str | None]:
    """Parse the attributes of an HTML opening tag.

    `tag_inner` is the content between the tag name and the closing `>`
    (without the leading `<a` or the trailing `>`). Quoted attribute
    values are respected, so an `href =` substring inside another
    attribute's value cannot be mistaken for a real `href` attribute.

    Returns a dict of lower-cased attribute name to value. Boolean
    attributes (no `=`) map to None.
    """
    attrs: dict[str, str | None] = {}
    n = len(tag_inner)
    i = 0
    while i < n:
        while i < n and tag_inner[i].isspace():
            i += 1
        if i >= n:
            break
        name_start = i
        while i < n and not tag_inner[i].isspace() and tag_inner[i] not in "=\"'":
            i += 1
        if i == name_start:
            i += 1
            continue
        name = tag_inner[name_start:i].lower()
        j = i
        while j < n and tag_inner[j].isspace():
            j += 1
        if j < n and tag_inner[j] == "=":
            j += 1
            while j < n and tag_inner[j].isspace():
                j += 1
            if j < n and tag_inner[j] in "\"'":
                quote = tag_inner[j]
                j += 1
                val_start = j
                while j < n and tag_inner[j] != quote:
                    j += 1
                attrs[name] = tag_inner[val_start:j]
                if j < n:
                    j += 1
            else:
                val_start = j
                while j < n and not tag_inner[j].isspace():
                    j += 1
                attrs[name] = tag_inner[val_start:j]
            i = j
        else:
            attrs[name] = None
            i = j
    return attrs


def _strip_tags(text: str) -> str:
    """Remove HTML tags from a string; collapse whitespace."""
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', text)).strip()


# Optional title/summary spans inside a manifest anchor (the published
# doc.html convention: <span class="title">…</span> <span class="summary">…</span>).
_TITLE_SPAN_RE = re.compile(
    r'<span\b[^>]*\bclass\s*=\s*["\']title["\'][^>]*>(.*?)</span>',
    re.DOTALL | re.IGNORECASE,
)
_SUMMARY_SPAN_RE = re.compile(
    r'<span\b[^>]*\bclass\s*=\s*["\']summary["\'][^>]*>(.*?)</span>',
    re.DOTALL | re.IGNORECASE,
)


def _find_manifest_nav_body(html: str) -> str | None:
    """Find and return the inner content of <nav id="manifest">...</nav>.

    Uses attribute-tokenizer matching so that id='manifest', id="manifest",
    and id = "manifest" are all accepted. Returns None if not found.
    """
    for nav_m in _NAV_OPEN_RE.finditer(html):
        attrs = parse_tag_attrs(nav_m.group(1))
        if attrs.get("id") == "manifest":
            nav_body_start = nav_m.end()
            nav_end = html.lower().find("</nav>", nav_body_start)
            if nav_end < 0:
                return None
            return html[nav_body_start:nav_end]
    return None


def parse_manifest_nav(html: str) -> list[dict]:
    """Return a list of section entry dicts from <nav id="manifest">.

    Each entry contains at minimum `id` and `sha256`. If the anchor
    carries `data-char-count`, `char_count` (int) is also included.
    A `title` field is populated from the anchor's inner text (tags stripped).

    Returns an empty list if no manifest nav is found.
    Accepts id="manifest", id='manifest', and id = "manifest" (whitespace-tolerant).
    """
    nav_body = _find_manifest_nav_body(html)
    if nav_body is None:
        return []
    entries: list[dict] = []
    for anchor_m in _ANCHOR_RE.finditer(nav_body):
        attrs = parse_tag_attrs(anchor_m.group(1))
        href = attrs.get("href") or ""
        sha256 = attrs.get("data-witness") or attrs.get("data-sha256") or ""
        char_count_raw = attrs.get("data-char-count")
        # Strip leading '#' from href to get the section id.
        section_id = href.lstrip("#")
        if not section_id or not sha256:
            continue
        # sha256 value is bare 64-hex (no 'sha256-' prefix).
        entry: dict = {"id": section_id, "sha256": sha256}
        if char_count_raw is not None:
            try:
                entry["char_count"] = int(char_count_raw)
            except ValueError:
                pass
        inner = anchor_m.group(2)
        # A <span class="summary"> is its own field, never mashed into title.
        sm = _SUMMARY_SPAN_RE.search(inner)
        if sm:
            summary = _strip_tags(sm.group(1))
            if summary:
                entry["summary"] = summary
            inner = inner[:sm.start()] + inner[sm.end():]
        tm = _TITLE_SPAN_RE.search(inner)
        title = _strip_tags(tm.group(1)) if tm else _strip_tags(inner)
        if title:
            entry["title"] = title
        entries.append(entry)
    return entries


# --- opt-in --verify: recompute witnesses over the raw bytes on disk -------

_SECTION_OPEN_B_RE = re.compile(rb'<section\b([^>]*)>', re.IGNORECASE)
_ATTR_B_RE = re.compile(rb'(\w[\w-]*)="([^"]*)"')
_CLOSE_OPEN_B_RE = re.compile(rb'<section\b|</section>', re.IGNORECASE)
_COMMENT_B_RE = re.compile(rb'<!--.*?-->', re.DOTALL)


def _section_inner_bytes(raw: bytes) -> dict[str, bytes]:
    """Map section id -> raw inner byte span, comment-masked, depth-walked.

    Mirrors trials/scripts/naive_reader.py (the canonical verifier): the span
    is everything between the opening tag's '>' and the matching '</section>',
    untouched. First occurrence wins on duplicate ids (duplicates are a
    conformance failure the canonical linters own).
    """
    masks = [(m.start(), m.end()) for m in _COMMENT_B_RE.finditer(raw)]

    def masked(pos: int) -> bool:
        for s, e in masks:
            if s <= pos < e:
                return True
            if s > pos:
                break
        return False

    spans: dict[str, bytes] = {}
    unterminated: list[str] = []
    for opener in _SECTION_OPEN_B_RE.finditer(raw):
        if masked(opener.start()):
            continue
        attrs = {m.group(1).decode(): m.group(2).decode()
                 for m in _ATTR_B_RE.finditer(opener.group(1))}
        sid = attrs.get('id')
        if not sid:
            continue
        start = opener.end()
        depth = 1
        pos = start
        closed = False
        while depth > 0:
            m = _CLOSE_OPEN_B_RE.search(raw, pos)
            if not m:
                # This opener never closes. Skip it and keep resolving the
                # remaining openers — they are independently addressable
                # (naive_reader raises here; a diagnostic tool keeps going).
                break
            if masked(m.start()):
                pos = m.end()
                continue
            if m.group(0).lower().startswith(b'<section'):
                depth += 1
            else:
                depth -= 1
                if depth == 0:
                    spans.setdefault(sid, raw[start:m.start()])
                    closed = True
                    break
            pos = m.end()
        if not closed and sid not in spans:
            unterminated.append(sid)
    if unterminated:
        print(
            "warning: unterminated <section> for id(s): "
            + ", ".join(unterminated)
            + " — these fail verification as malformed, not as tampered",
            file=sys.stderr,
        )
    return spans


def verify_entries(entries: list[dict], raw: bytes) -> int:
    """Annotate each entry with verified: bool; return count of failures."""
    spans = _section_inner_bytes(raw)
    failures = 0
    for entry in entries:
        inner = spans.get(entry["id"])
        ok = inner is not None and hashlib.sha256(inner).hexdigest() == entry["sha256"]
        if ok and "char_count" in entry:
            try:
                ok = len(inner.decode("utf-8")) == entry["char_count"]
            except UnicodeDecodeError:
                ok = False
        entry["verified"] = bool(ok)
        if not ok:
            failures += 1
    return failures


def main(argv: list[str]) -> int:
    args = argv[1:]
    verify = "--verify" in args
    if verify:
        args = [a for a in args if a != "--verify"]
    if len(args) != 1:
        print("usage: manifest.py [--verify] <path-to-doc.html>", file=sys.stderr)
        return 2
    path = Path(args[0])
    if not path.is_file():
        print(f"file not found: {path}", file=sys.stderr)
        return 1
    raw = path.read_bytes()
    html = raw.decode("utf-8", errors="replace")

    sections = parse_manifest_nav(html)
    if not sections:
        print(
            'no <nav id="manifest"> with <a> entries found; '
            "file may not be a manifest-first doc.html",
            file=sys.stderr,
        )
        return 1

    failures = 0
    if verify:
        failures = verify_entries(sections, raw)
        print(
            f"verify: {len(sections) - failures}/{len(sections)} entries match "
            "their recomputed witness",
            file=sys.stderr,
        )

    manifest = {"sections": sections}
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
