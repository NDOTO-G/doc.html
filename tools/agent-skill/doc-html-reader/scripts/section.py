#!/usr/bin/env python3
"""Extract a single <section id="..."> element from a doc.html file.

Reads the whole file from disk (cheap, local IO), finds the matching
section element, and prints only its inner HTML to stdout. The model
only sees stdout — the other sections never enter context.

Usage:
    section.py <path-to-doc.html> <section-id>
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

# Force UTF-8 stdout so the script works on Windows consoles (cp1252 default).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


# Find any <section ...> opening tag. We only use this to locate tag
# starts; attribute lookup is then handled by parse_tag_attrs so quoted
# attribute values cannot leak into the match.
_SECTION_OPEN_RE = re.compile(r"<section\b([^>]*)>", re.IGNORECASE)
# Cheaper version that just locates the start, used during depth walking.
_SECTION_TAG_START_RE = re.compile(r"<section\b", re.IGNORECASE)


def parse_tag_attrs(tag_inner: str) -> dict[str, str | None]:
    """Parse the attributes of an HTML opening tag.

    `tag_inner` is the content between the tag name and the closing `>`
    (without the leading `<section`/`<script` or the trailing `>`).
    Quoted attribute values are respected, so an `id =` substring inside
    a `class="..."` value cannot be mistaken for a real `id` attribute.

    Returns a dict of lower-cased attribute name to value. Boolean
    attributes (no `=`) map to None.
    """
    attrs: dict[str, str | None] = {}
    n = len(tag_inner)
    i = 0
    while i < n:
        # Skip whitespace between attributes.
        while i < n and tag_inner[i].isspace():
            i += 1
        if i >= n:
            break
        # Read attribute name (anything that isn't whitespace, =, or quote).
        name_start = i
        while i < n and not tag_inner[i].isspace() and tag_inner[i] not in "=\"'":
            i += 1
        if i == name_start:
            # Malformed (e.g. stray quote). Skip one char and continue.
            i += 1
            continue
        name = tag_inner[name_start:i].lower()
        # Optional whitespace before `=`.
        j = i
        while j < n and tag_inner[j].isspace():
            j += 1
        if j < n and tag_inner[j] == "=":
            j += 1
            # Optional whitespace after `=`.
            while j < n and tag_inner[j].isspace():
                j += 1
            if j < n and tag_inner[j] in "\"'":
                # Quoted value.
                quote = tag_inner[j]
                j += 1
                val_start = j
                while j < n and tag_inner[j] != quote:
                    j += 1
                attrs[name] = tag_inner[val_start:j]
                if j < n:
                    j += 1  # consume closing quote
            else:
                # Unquoted value.
                val_start = j
                while j < n and not tag_inner[j].isspace():
                    j += 1
                attrs[name] = tag_inner[val_start:j]
            i = j
        else:
            attrs[name] = None  # boolean attribute
            i = j
    return attrs


def find_section(html: str, section_id: str) -> str | None:
    """Return the inner HTML of <section id="section_id"> or None.

    Handles nested <section> elements correctly by tracking depth.
    Section ids are matched exactly against the parsed `id` attribute —
    text inside quoted attribute values (e.g. `class="id = 'real'"`)
    cannot pose as the real id. Attribute order does not matter, single
    or double quotes are accepted, and whitespace around `=` is allowed.
    """
    # Walk <section> opening tags and check each one's parsed id attribute.
    for m in _SECTION_OPEN_RE.finditer(html):
        attrs = parse_tag_attrs(m.group(1))
        if attrs.get("id") != section_id:
            continue
        open_end = m.end()
        depth = 1
        cursor = open_end
        while depth > 0:
            next_open_m = _SECTION_TAG_START_RE.search(html, cursor)
            next_close = html.find("</section>", cursor)
            if next_close < 0:
                return None  # malformed: no closing tag
            next_open = next_open_m.start() if next_open_m else -1
            if next_open >= 0 and next_open < next_close:
                depth += 1
                cursor = next_open_m.end()
            else:
                depth -= 1
                if depth == 0:
                    inner = html[open_end:next_close]
                    # Trim a single leading/trailing newline if present
                    # (cosmetic — matches how build.mjs framed sections).
                    if inner.startswith("\n"):
                        inner = inner[1:]
                    if inner.endswith("\n"):
                        inner = inner[:-1]
                    return inner
                cursor = next_close + len("</section>")
        # If the loop exits without returning, the document is malformed
        # for this opener — try the next matching opener.
    return None


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: section.py <path-to-doc.html> <section-id>", file=sys.stderr)
        return 2
    path = Path(argv[1])
    section_id = argv[2]
    if not path.is_file():
        print(f"file not found: {path}", file=sys.stderr)
        return 1
    try:
        html = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        html = path.read_text(encoding="utf-8", errors="replace")

    inner = find_section(html, section_id)
    if inner is None:
        print(
            f"section id={section_id!r} not found in {path.name}; "
            f"run manifest.py first to see available ids",
            file=sys.stderr,
        )
        return 1

    sys.stdout.write(inner)
    if not inner.endswith("\n"):
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
