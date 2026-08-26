#!/usr/bin/env python3
"""verify_wiki.py — wiki-layer verifier for the doc.html wiki shape (doc-pin v1).

The wiki shape: a root doc.html whose body carries shelf entries
``<a href="leaf.doc.html" data-doc-pin="…">``, each pinning the ordered
witnessed section content of one leaf document. The doc-pin rule (v1):

    doc_pin = sha256( ":".join(leaf manifest data-witness values, manifest order) )

lowercase hex in, lowercase hex out, joined by one ASCII colon.

Architecture — the wiki layer owns ONLY the genuinely new cross-document
operation; document acceptance is DELEGATED to the shipped Core reader
(verify.py), never re-implemented. A wiki-layer tool that copies pieces of
reader law inevitably lags a clause (this draft's first cut lagged V29 —
caught in council review); the shipped reader is the one document judge.

WHAT THIS TOOL CLAIMS — and what it does not. It verifies the shelf AS
SERIALIZED. It certifies three things and no more: that carrier-shaped
entries occur in the root's source bytes, that each named leaf verifies
under the shipped Core reader, and that each recomputed doc-pin equals the
entry's claim. It does NOT check whether an HTML reader presents those
carriers as live links. Shelf discovery here is a scan over serialized
bytes, and HTML's own tokenizer can disagree with it — custom elements,
non-local raw-text openers, anchor-shaped text sitting inside a quoted
attribute value. So a passing run EMITS the exact list it checked, href and
full pin, one line per certified entry; the consumer compares that emitted
list against the shelf the page actually renders. That comparison is the
final step of the check, and it belongs to the reader.

TWO MASKS FOR TWO JOBS (wiki-lockstep trial, plans/wiki-lockstep/CONTRACT.md).
W-A (law): manifest-witness extraction (`manifest_witnesses`) uses the Core
reader's OWN §12 mask — comments plus <script>/<style> raw-text content,
`_core_inert_mask`, ported VERBATIM from verify.py's `_build_inert_mask`
(RP-3: earliest-opening construct wins and consumes through its own close) —
plus the Core's exact discovery grammar (`_discovery_open_re`, §6.2's OPEN
set, no `\b`, no IGNORECASE) and the Core's masked `</nav>`-close idiom
(R4b). This is not a browser model either, but it is the SAME mask and the
SAME grammar the shipped Core reader already used to accept the leaf, so the
witness list extracted here cannot diverge from what Core certified over the
same bytes.
W-B (policy): shelf-entry discovery (the root's own `<a data-doc-pin>` scan,
plus the `<base href>` check) keeps its OWN, deliberately WIDER five-
container mask (`_inert_masks`) — script/style/textarea/title/template plus
comments, because textarea/title are RCDATA to a browser and un-masking them
would certify carriers a browser renders as text. This is discovery HYGIENE,
not a browser model, and is disclosed as incomplete. What changed is the
MECHANICS, brought to the same RP-3 ground as the Core mask: the same
left-to-right earliest-opener walk (raw text wins over comments; an unclosed
construct claims nothing and the scan resumes past its own opener), exact
ASCII tag names bounded by §6.2's OPEN set (no `\b`), ASCII-only,
length-preserving case handling (bytes-mode IGNORECASE / `bytes.lower()`),
and quote-aware tag-end capture (R6) so a quoted '>' inside the opening
tag's own attributes cannot end it early.
Whether an HTML reader presents these carriers as live links is outside
this companion's claim. No additional document grammar is specified here.

What this tool checks, per run:
  R0 core-reader        : the resolved Core reader path is printed, so the
                          receipt names the authority that judged.
  R0 reader-file-sha256 : the SHA-256 of the file at the resolved reader
                          path, sampled once before the first invocation —
                          file stability during the run is not checked.
                          Printed as a fact for comparison against the
                          published seals. Not an authenticity proof: a
                          receipt cannot authenticate itself — whoever could
                          swap the reader could edit this tool; the recursion
                          ends outside, at the published digest.
  R1 root-verifies      : the root PASSes the shipped Core reader (delegated).
  R2 base-neutral       : the root carries no <base href> — a base changes
                          where every shelf href points, so the pin and the
                          serialized link could name different files;
                          refused, fail closed.
  E0 shelf-grammar      : every shelf href must fit the portable shelf-link
                          grammar ('/'-joined [A-Za-z0-9._-] segments, no
                          dot-segments) — deliberately narrower than HTML URL
                          semantics: character references, percent-escapes,
                          queries, fragments, and backslashes could all make
                          the verifier and a URL consumer resolve different
                          files, so they are refused, never decoded (fail
                          closed). Refusal, not protection.
  E1 leaf-exists        : every data-doc-pin href resolves to a real file,
                          and every path segment matches a real directory
                          entry with BYTE-EXACT spelling — checked against
                          os.listdir, not the OS's own resolution, so a
                          case-insensitive filesystem cannot certify a root
                          that a case-sensitive host would serve broken.
  E2 leaf-verifies      : the leaf PASSes the shipped Core reader (delegated).
  E3 pin-matches       : the recomputed doc-pin equals the entry's claim.
  emission              : on a clean run, the VERIFIED SHELF block lists the
                          exact (href, pin) pairs certified, so the claim can
                          be compared with the presented page.

The tokenizer below (the post-#134 character walk, converged with the Core
readers) is used ONLY to extract shelf entries and manifest witness values —
extraction, not judgment. The §6.4 law (V24/V25) is still enforced on shelf
entries carrying data-doc-pin, because Core has no shelf concept.

Locating the Core reader: an explicit --core <path> BINDS — that exact path
is used, or the run is refused; DOC_HTML_CORE_READER binds the same way.
Only when neither names a reader do the fallbacks apply: verify.py beside
this file, else verify.py in the working directory. None found -> refuse to
run (fail closed). A named-but-missing reader is never silently substituted.

The pin binds witnessed section content, in order — nothing else. Section
ids, manifest gloss, and page chrome are unbound surfaces: a leaf whose
sections were merely renamed reproduces the same pin. Stated in-band in the
specification note this tool ships with.

Usage:
    python verify_wiki.py <root wiki.doc.html> [--core <verify.py>]
    python verify_wiki.py --selftest [--core <verify.py>]

Exit 0 PASS, 1 FAIL. Stdlib only.
"""
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

# Windows consoles may use a legacy codepage that cannot encode every
# character the Core reader's echoed output can contain — degrade politely
# rather than crash mid-report.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(errors='replace')

# ─── §6.4 ATTR_SEP + ASCII fold — Core's verify.py, ported VERBATIM (W1/W2) ──
# The frozen 25-codepoint JS-`\s` list (`_JS_WS`) and the full-Unicode
# `.lower()` name fold this constant and function replace both LAGGED the
# Core reader's own two 2026-08-22 Operator rulings by two recensions
# (R8, R12) — see plans/wiki-lockstep/CONTRACT.md classes W1/W2. HTML5's five
# ASCII whitespace bytes are the separator ground everywhere in THIS reader
# now, one predicate, not several. Identical, member for member, to verify.py's
# `_ATTR_SEP` / `_ascii_lower` / `_ASCII_FOLD`.
_ATTR_SEP = frozenset('\t\n\x0c\r ')
_ASCII_FOLD = {c: c + 0x20 for c in range(0x41, 0x5B)}


def _ascii_lower(s: str) -> str:
    return s.translate(_ASCII_FOLD)


# ─── Attribute tokenizer — quote-aware (§6.4), extraction only ────────────────────────────────────
# Core's `_attrs`, ported VERBATIM (W2). NOT a regex: an unanchored restart
# regex re-opens the attr-restart forgery class (x:data-witness impersonating
# the carrier). *dup_names* is carried from the Core signature but unused by
# every call site in this file (kept so the function stays byte-for-byte
# portable, not re-abridged).
def _attrs(tag_inner: bytes, dup_names: list = None) -> dict:
    """Character-level attribute walk. A name runs to the first ATTR_SEP
    byte, '=', or quote, so a name containing ':' or '.' is ONE name and can
    never restart the scan mid-name to impersonate a real carrier. Names fold
    ASCII-only (R12 — NOT `str.lower()`); a valueless attribute records None.
    Last occurrence wins, matching the Core readers."""
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
        name = _ascii_lower(s[name_start:i])
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


# ─── W-A mask: Core's §12 mask, ported VERBATIM (W5) ──────────────────────────────
# `_core_inert_mask` is verify.py's `_build_inert_mask`, unchanged in every
# particular: two containers (script/style), RP-3's earliest-opener walk.
# Used ONLY by `manifest_witnesses` below, on the LEAF — the path that must
# reproduce exactly what the Core reader's §9.1 gate already certified over
# the same bytes (W-A: law).
_COMMENT_OPEN = b'<!--'
_COMMENT_CLOSE = b'-->'
_CORE_RAWTEXT_OPEN_RE = re.compile(rb'<(script|style)(?=[\t\n\x0c\r />])[^>]*>',
                                   re.IGNORECASE)


def _core_inert_mask(html: bytes) -> list:
    """RP-3 walk: at each position, the EARLIEST-opening of {next `<!--`,
    next <script>/<style> open} claims its span and consumes through its OWN
    close; an unclosed construct claims nothing and the scan resumes just
    past its opener. Ported verbatim from verify.py's `_build_inert_mask`."""
    spans = []
    lowered = html.lower()      # ASCII-only and length-preserving on bytes
    pos = 0
    n = len(html)
    while pos < n:
        c_start = html.find(_COMMENT_OPEN, pos)
        m = _CORE_RAWTEXT_OPEN_RE.search(html, pos)
        r_start = m.start() if m else -1
        if c_start < 0 and r_start < 0:
            break
        if r_start < 0 or (0 <= c_start < r_start):
            c_end = html.find(_COMMENT_CLOSE, c_start + len(_COMMENT_OPEN))
            if c_end < 0:
                pos = c_start + len(_COMMENT_OPEN)
                continue
            spans.append((c_start, c_end + len(_COMMENT_CLOSE)))
            pos = c_end + len(_COMMENT_CLOSE)
        else:
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


# ─── W-B mask: shelf-discovery — wiki's OWN policy, RP-3 mechanics (W6) ──────
# Five-container set kept (script|style|textarea|title|template — textarea
# and title are RCDATA to a browser and un-masking them would certify
# carriers a browser renders as text); mechanics rebuilt on the same RP-3
# ground as `_core_inert_mask` above: earliest-opener walk, exact ASCII tag
# names bounded by §6.2's OPEN set (no `\b` — R11/R12b(b)), and quote-aware
# tag-end capture (R6) so a quoted '>' inside the opening tag's own
# attributes cannot end it early (an extension `_core_inert_mask`'s open-tag
# scan does not need, because this five-name set is wiki's own surface).
_SHELF_RAWTEXT_OPEN_RE = re.compile(
    rb'<(script|style|textarea|title|template)(?=[\t\n\x0c\r />])'
    rb'(?:"[^"]*"|\'[^\']*\'|[^<>\'"])*>',
    re.IGNORECASE)


def _inert_masks(html: bytes) -> list:
    """W-B: root shelf-discovery mask (`<a data-doc-pin>` scan, `<base>`
    detection). Same RP-3 walk as `_core_inert_mask`, wider container set."""
    spans = []
    lowered = html.lower()
    pos = 0
    n = len(html)
    while pos < n:
        c_start = html.find(_COMMENT_OPEN, pos)
        m = _SHELF_RAWTEXT_OPEN_RE.search(html, pos)
        r_start = m.start() if m else -1
        if c_start < 0 and r_start < 0:
            break
        if r_start < 0 or (0 <= c_start < r_start):
            c_end = html.find(_COMMENT_CLOSE, c_start + len(_COMMENT_OPEN))
            if c_end < 0:
                pos = c_start + len(_COMMENT_OPEN)
                continue
            spans.append((c_start, c_end + len(_COMMENT_CLOSE)))
            pos = c_end + len(_COMMENT_CLOSE)
        else:
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


def _masked(pos: int, masks) -> bool:
    for s, e in masks:
        if s <= pos < e:
            return True
        if s > pos:
            break
    return False


# ─── §6.4 refusal (V24/V25) — shelf entries only; Core owns unit tags ────────
class NonCanonical(Exception):
    pass


def _refuse_noncanonical_attrs(tag_inner: bytes, context: str) -> None:
    """V24 (double-quoting) / V25 (no duplicate names) on a shelf entry's
    opening tag. Core enforces this law on witnessed-unit tags; the shelf
    entry is the wiki layer's own carrier surface, so it gets the same law."""
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
                f"on {context} (V25)")
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
                    f"'{name.decode('ascii', 'replace')}' on {context} (V24)")
            i = j
        else:
            i = j  # valueless attribute — V24 governs valued attributes only


# ─── Extraction: manifest witnesses, shelf entries, <base> detection ─────────
# W3: Core's `_discovery_open_re`, ported VERBATIM. `_DISCOVERY_NEXT` is
# §6.2's ruled OPEN set (no 0x0B VT — the second 2026-08-22 ruling); the
# tag name is compared byte for byte (no IGNORECASE — R11/R14: `<NAV
# id="manifest">` is NOT the manifest, `<A href=...>` is NOT a link); the
# attribute blob is captured quote-aware (R6), so a quoted '>' inside an
# attribute value can never end the tag early.
_DISCOVERY_NEXT = rb'[\t\n\x0c\r />]'   # §6.2's ruled OPEN set, verbatim


def _discovery_open_re(tag: str):
    return re.compile(
        rb'<' + tag.encode('ascii') + rb'(?=' + _DISCOVERY_NEXT + rb')'
        rb'((?:"[^"]*"|\'[^\']*\'|[^<>\'"])*)>')


_NAV_OPEN_RE = _discovery_open_re('nav')
_A_TAG_RE = _discovery_open_re('a')
# <base> is the ONE discovery carrier whose referent is the BROWSER, not the
# ruled format: R2 exists because an HTML reader re-aims every rendered shelf
# href against <base href>, and a browser's tag-name match is ASCII
# case-insensitive — <BASE> IS a base to the hazard R2 refuses. So the tag
# NAME folds ASCII case here, enumerated letter by letter (no IGNORECASE
# flag), while the §6.2 OPEN-set lookahead and the quote-aware tag end stay
# exactly as `_discovery_open_re` builds them. <nav>/<a> above stay
# case-sensitive: their referent IS the ruled format (R11/R14). 2026-08-26,
# from Codex's PR #10 finding, confirmed by Elenchos and Mnemon; sort each
# check by what it answers to before porting its grammar.
_BASE_TAG_RE = re.compile(
    rb'<[Bb][Aa][Ss][Ee](?=' + _DISCOVERY_NEXT + rb')'
    rb'((?:"[^"]*"|\'[^\']*\'|[^<>\'"])*)>')
_HEX64_RE = re.compile(r'^[0-9a-f]{64}$')

# Portable shelf-link grammar — the only href shape the wiki layer will
# certify. One or more '/'-joined segments, each [A-Za-z0-9._-]+ and not
# entirely dots. Everything outside this (character references '&',
# percent-escapes '%', queries '?', fragments '#', backslashes, empty or
# dot-only segments, leading/trailing '/') is refused, never decoded — a
# refusal, not a protection: the grammar narrows what the tool will certify to
# shapes whose resolution is unambiguous, and anything else is a FAIL.
_SHELF_SEGMENT_RE = re.compile(r'^[A-Za-z0-9._-]+$')


def _shelf_href_conforms(href: str) -> bool:
    if not href:
        return False
    for seg in href.split('/'):
        if not _SHELF_SEGMENT_RE.match(seg):
            return False
        if not seg.strip('.'):  # '.' / '..' / any all-dots segment
            return False
    return True


def _exact_case_resolve(base: Path, href: str):
    """Walk the href's segments against real directory entries, requiring
    BYTE-EXACT spelling at every level.

    Path.is_file() asks the OS, and on a case-insensitive filesystem
    (Windows, default macOS) the OS happily opens 'A.DOC.HTML' when the
    directory holds 'a.doc.html'. A PASS produced there would certify a root
    that a case-sensitive host serves broken. So the spelling is checked
    against os.listdir, level by level, and never against the OS's own
    resolution. Returns (ok, path_or_None, detail); detail names the actual
    directory spelling when one differs only by case."""
    cur = base
    for seg in href.split('/'):
        try:
            names = os.listdir(cur)
        except OSError as e:
            return False, None, f'directory not readable: {cur} ({e.strerror})'
        if seg not in names:
            near = sorted(n for n in names if n.lower() == seg.lower())
            if near:
                return False, None, (
                    f"path segment '{seg}' is not spelled that way on disk — "
                    f"the directory spells it '{near[0]}'; refused (a "
                    'case-insensitive filesystem must not certify a root a '
                    'case-sensitive host would serve broken)')
            return False, None, f"no directory entry spelled '{seg}'"
        cur = cur / seg
    return True, cur, ''


def manifest_witnesses(html: bytes, masks):
    """Ordered manifest data-witness values from <nav id="manifest"> fragment
    links. Extraction only — called AFTER the Core reader has accepted the
    document, so the values are already law-checked. None if no manifest.

    W-A (law): *masks* is expected to be `_core_inert_mask(html)` — the
    Core's OWN §12 mask — so the `<nav>`/`<a>` discovery below, and the
    `</nav>`-close search, see EXACTLY what the Core reader's §9.1 gate
    already certified over the same bytes (W3, W4, W5, ported verbatim)."""
    for m in _NAV_OPEN_RE.finditer(html):
        if _masked(m.start(), masks):
            continue
        if _attrs(m.group(1)).get('id') != 'manifest':
            continue
        nav_start = m.end()
        # W4 / R4b (ported verbatim from verify.py's `_verify_manifest_first`):
        # the first `</nav>` at or after nav_start that is NOT itself inside a
        # masked (§12) region. A `</nav>` written inside an HTML comment
        # INSIDE the manifest (e.g. a commented-out usage example) is not the
        # manifest's real close and must not truncate the witness list.
        search_pos = nav_start
        nav_end = -1
        while True:
            candidate = html.find(b'</nav>', search_pos)
            if candidate < 0:
                break
            if _masked(candidate, masks):
                search_pos = candidate + 1
                continue
            nav_end = candidate
            break
        if nav_end < 0:
            # W4-note: the wiki layer never re-judges the document — the leaf
            # was already Core-ACCEPTED, so an unterminated manifest cannot
            # legally reach here on the law path. If it nonetheless does,
            # return the same "no manifest witnesses" outcome as before —
            # never invent a document verdict that belongs to the Core.
            return None
        ws = []
        for am in _A_TAG_RE.finditer(html, nav_start, nav_end):
            # §12 masked regions are invisible here too — an <a> written
            # inside a comment inside nav#manifest is not a live manifest
            # entry, mirroring verify.py's `_verify_manifest_first`.
            if _masked(am.start(), masks):
                continue
            a = _attrs(am.group(1))
            href = a.get('href') or ''
            dw = a.get('data-witness')
            if href.startswith('#') and dw:
                ws.append(dw)
        return ws
    return None


def has_base_href(html: bytes, masks) -> bool:
    """True if the document carries a live <base> with an href — which changes
    where every relative shelf href points (fail-closed trigger, R2). W-B:
    *masks* is the wiki's own five-container mask (`_inert_masks`)."""
    for m in _BASE_TAG_RE.finditer(html):
        if _masked(m.start(), masks):
            continue
        if 'href' in _attrs(m.group(1)):
            return True
    return False


# ─── Delegated document acceptance: the shipped Core reader ──────────────────
def find_core_reader(explicit=None) -> Path:
    """An explicit --core path BINDS: it is used exactly or the run is
    refused. DOC_HTML_CORE_READER binds the same way. Only when neither
    names a reader do the fallbacks apply (verify.py beside this file, then
    the working directory). A named-but-missing reader is never silently
    substituted — the receipt must name the authority that actually judged."""
    if explicit:
        p = Path(explicit)
        if not p.is_file():
            raise FileNotFoundError(
                f'--core names a Core reader that does not exist: {p} — '
                'refused; a named reader is never silently substituted')
        return p.resolve()
    env = os.environ.get('DOC_HTML_CORE_READER')
    if env:
        p = Path(env)
        if not p.is_file():
            raise FileNotFoundError(
                f'DOC_HTML_CORE_READER names a Core reader that does not '
                f'exist: {p} — refused; a named reader is never silently '
                'substituted')
        return p.resolve()
    for c in (Path(__file__).resolve().parent / 'verify.py',
              Path.cwd() / 'verify.py'):
        if c.is_file():
            return c.resolve()
    raise FileNotFoundError(
        'no shipped Core reader (verify.py) found — pass --core <path> or set '
        'DOC_HTML_CORE_READER; the wiki layer refuses to judge documents itself')


def core_accepts(core: Path, doc: Path):
    """Run the shipped Core reader on doc. Returns (verdict, tail_lines)
    where verdict is 'pass' (Core exited 0), 'refused' (Core executed and
    printed a refusal), or 'error' (Core could not execute). Refusal and
    execution failure are different evidence; both fail closed."""
    try:
        r = subprocess.run([sys.executable, str(core), str(doc)],
                           capture_output=True, text=True, encoding='utf-8',
                           errors='replace')
    except OSError as e:
        return 'error', [str(e)]
    if r.returncode == 0:
        return 'pass', []
    out_tail = [l for l in (r.stdout or '').strip().splitlines() if l][-3:]
    if out_tail:
        return 'refused', out_tail
    err_tail = [l for l in (r.stderr or '').strip().splitlines() if l][-3:]
    return 'error', err_tail


# ─── The doc-pin (v1) ───────────────────────────────────────────────────────
def doc_pin(witnesses) -> str:
    return hashlib.sha256(":".join(witnesses).encode('ascii')).hexdigest()


# ─── Wiki walk: root + every data-doc-pin entry ─────────────────────────────
def verify_wiki(root_path: Path, core: Path) -> int:
    html = root_path.read_bytes()
    masks = _inert_masks(html)
    failures = 0

    print(f'R0 core-reader        : {core}')
    print('R0 reader-file-sha256 : '
          + hashlib.sha256(core.read_bytes()).hexdigest()
          + '  (digest sampled from the resolved reader path before '
            'invocation; file stability during the run not checked)')
    verdict, tail = core_accepts(core, root_path)
    note = {'pass': 'Core reader verdict',
            'refused': 'Core reader refused',
            'error': 'Core reader could not execute'}[verdict]
    print(f'R1 root-verifies      : {"PASS" if verdict == "pass" else "FAIL"}  '
          f'({root_path.name}, {note})')
    if verdict != 'pass':
        for l in tail:
            print('   core: ' + l)
        failures += 1

    if has_base_href(html, masks):
        print('R2 base-neutral       : FAIL  root carries <base href> — shelf '
              'hrefs no longer resolve against the root\'s own location; the '
              'pin and the browser-facing link could name different files. '
              'Refused (fail closed).')
        print()
        print('WIKI: FAIL (base-resolution refusal)')
        return 1
    print('R2 base-neutral       : PASS  (no <base href>)')

    entries = []
    for am in _A_TAG_RE.finditer(html):
        if _masked(am.start(), masks):
            continue
        a = _attrs(am.group(1))
        if 'data-doc-pin' not in a:
            continue
        try:
            _refuse_noncanonical_attrs(am.group(1), 'a shelf entry (data-doc-pin)')
        except NonCanonical as e:
            print(f'E0 shelf              : FAIL  NON-CANONICAL — {e}')
            failures += 1
            continue
        entries.append((a.get('href') or '', a['data-doc-pin']))
    if not entries and not failures:
        print('E0 shelf              : FAIL  (no data-doc-pin entries found)')
        return 1
    print(f'E0 shelf              : {len(entries)} doc-pin entr'
          f'{"y" if len(entries) == 1 else "ies"}')

    certified = []
    for href, claimed in entries:
        label = href or '(no href)'
        if not _shelf_href_conforms(href):
            print(f'E0 shelf              : FAIL  {label} (href outside the '
                  'portable shelf-link grammar — character references, '
                  'percent-escapes, queries, fragments, and dot-segments are '
                  'refused, fail closed)')
            failures += 1
            continue
        if claimed is None or not _HEX64_RE.match(claimed):
            print(f'E0 shelf              : FAIL  {label} '
                  '(data-doc-pin is not 64-hex)')
            failures += 1
            continue
        ok, leaf, detail = _exact_case_resolve(root_path.parent, href)
        if not ok:
            print(f'E1 leaf-exists        : FAIL  {label} ({detail})')
            failures += 1
            continue
        if not leaf.is_file():
            print(f'E1 leaf-exists        : FAIL  {label} (file not found)')
            failures += 1
            continue
        verdict, tail = core_accepts(core, leaf)
        if verdict != 'pass':
            for l in tail:
                print('   core: ' + l)
            note = ('Core reader refused' if verdict == 'refused'
                    else 'Core reader could not execute')
            print(f'E2 leaf-verifies      : FAIL  {label} ({note})')
            failures += 1
            continue
        leaf_html = leaf.read_bytes()
        # W-A: the Core's own §12 mask, not the wiki's wider W-B mask — the
        # witness list must reproduce exactly what the Core reader's §9.1
        # gate already certified over these same bytes.
        ws = manifest_witnesses(leaf_html, _core_inert_mask(leaf_html))
        if not ws:
            print(f'E2 leaf-verifies      : FAIL  {label} '
                  '(no manifest witnesses to pin)')
            failures += 1
            continue
        actual = doc_pin(ws)
        if actual != claimed:
            print(f'E3 pin-matches        : FAIL  {label} '
                  f'claimed={claimed[:12]}… recomputed={actual[:12]}…')
            failures += 1
        else:
            print(f'E1-E3                 : PASS  {label} '
                  f'({len(ws)} sections, pin {actual[:12]}…)')
            certified.append((href, actual))

    print()
    if failures:
        print(f'WIKI: FAIL ({failures} failing check(s))')
        return 1
    # See-what-is-signed: the certificate hands back the object it verified,
    # in full, so the reader can compare it with the page they actually read.
    print('VERIFIED SHELF (what this run actually checked - compare it with '
          'the page you read):')
    for href, pin in certified:
        print(f'  {href}  {pin}')
    print('NOT CHECKED: whether an HTML reader presents these carriers as '
          'live links.')
    print(f'WIKI: PASS ({len(certified)} serialized shelf carrier(s) '
          'verified; documents judged by the shipped Core reader; '
          'presentation not checked)')
    return 0


# ─── Selftest: prove each tooth on built, CORE-CONFORMANT fixtures ───────────
def _mk_leaf(dirpath: Path, name: str, sections, decoy_true_digest=False,
             dup_witness=False, extra_unlisted=None):
    """sections: [(id, inner_text)] -> minimal Core-conformant leaf; returns
    ordered manifest witnesses. decoy_true_digest: the #132 attr-restart
    forgery. dup_witness: duplicated carrier (V25). extra_unlisted: (id, text)
    of a valid witnessed section present in the BODY but absent from the
    manifest (the V29 order-bijection gap this draft's first cut missed)."""
    ws = []
    body, nav = [], []
    for sid, text in sections:
        inner = f'<p>{text}</p>'.encode()
        true_w = hashlib.sha256(inner).hexdigest()
        cc = len(inner.decode())
        if decoy_true_digest:
            w = '0' * 64
            carrier = f'data-witness="{w}" x:data-witness="{true_w}"'
        elif dup_witness:
            w = '0' * 64
            carrier = f'data-witness="{w}" data-witness="{true_w}"'
        else:
            w = true_w
            carrier = f'data-witness="{w}"'
        ws.append(w)
        nav.append(f'<a href="#{sid}" {carrier} data-char-count="{cc}">{sid}</a>')
        body.append(f'<section id="{sid}" {carrier} data-char-count="{cc}">'
                    + inner.decode() + '</section>')
    if extra_unlisted:
        sid, text = extra_unlisted
        inner = f'<p>{text}</p>'.encode()
        w = hashlib.sha256(inner).hexdigest()
        body.append(f'<section id="{sid}" data-witness="{w}" '
                    f'data-char-count="{len(inner.decode())}">'
                    + inner.decode() + '</section>')
    doc = ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">'
           '<title>doc.html</title></head>\n<body>\n<nav id="manifest">\n'
           + '\n'.join(nav) + '\n</nav>\n' + '\n'.join(body) + '\n</body></html>\n')
    (dirpath / name).write_bytes(doc.encode('utf-8'))  # bytes: no newline translation
    return ws


def _mk_root(dirpath: Path, entries, raw_entries=None, base_href=None):
    lines = [f'<a href="{h}" data-doc-pin="{f}">{h}</a>' for h, f in entries]
    lines += raw_entries or []
    inner = ('<h2>shelf</h2>\n' + '\n'.join(lines) + '\n').encode()
    w = hashlib.sha256(inner).hexdigest()
    cc = len(inner.decode())
    base = f'<base href="{base_href}">' if base_href else ''
    doc = ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">'
           + base + '<title>doc.html</title></head>\n<body>\n<nav id="manifest">\n'
           f'<a href="#shelf" data-witness="{w}" data-char-count="{cc}">shelf</a>\n'
           '</nav>\n'
           f'<section id="shelf" data-witness="{w}" data-char-count="{cc}">'
           + inner.decode() + '</section>\n</body></html>\n')
    (dirpath / 'wiki.doc.html').write_bytes(doc.encode('utf-8'))  # bytes: no newline translation


def selftest(core: Path) -> int:
    import contextlib
    import io
    import tempfile

    def run(root):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = verify_wiki(root, core)
        return code, buf.getvalue()

    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        ws_a = _mk_leaf(d, 'a.doc.html', [('a1', 'alpha'), ('a2', 'beta')])
        ws_b = _mk_leaf(d, 'b.doc.html', [('b1', 'gamma')])
        _mk_root(d, [('a.doc.html', doc_pin(ws_a)), ('b.doc.html', doc_pin(ws_b))])
        root = d / 'wiki.doc.html'

        checks = []

        code, out = run(root)
        checks.append(('T1 clean wiki PASSes', code == 0 and 'WIKI: PASS' in out))

        # T2 tampered leaf body -> Core refuses -> E2 FAIL
        orig = (d / 'a.doc.html').read_bytes()
        (d / 'a.doc.html').write_bytes(orig.replace(b'alpha', b'ALPHA'))
        code, out = run(root)
        checks.append(('T2 tampered leaf section FAILs (Core refusal)',
                       code == 1 and 'E2 leaf-verifies      : FAIL' in out))
        (d / 'a.doc.html').write_bytes(orig)

        # T3 re-witnessed leaf (passes Core alone) -> E3 pin FAIL
        _mk_leaf(d, 'a.doc.html', [('a1', 'alpha FORGED'), ('a2', 'beta')])
        code, out = run(root)
        checks.append(('T3 re-witnessed leaf FAILs at the pin',
                       code == 1 and 'E3 pin-matches        : FAIL' in out))
        (d / 'a.doc.html').write_bytes(orig)

        # T4 missing leaf file -> E1 FAIL
        (d / 'b.doc.html').rename(d / 'b.doc.html.gone')
        code, out = run(root)
        checks.append(('T4 missing leaf FAILs', code == 1 and 'E1 leaf-exists        : FAIL' in out))
        (d / 'b.doc.html.gone').rename(d / 'b.doc.html')

        # T5 forged pin attribute on a clean leaf -> E3 FAIL
        root_bytes = root.read_bytes()
        _mk_root(d, [('a.doc.html', '0' * 64), ('b.doc.html', doc_pin(ws_b))])
        code, out = run(root)
        checks.append(('T5 forged pin attribute FAILs',
                       code == 1 and 'E3 pin-matches        : FAIL' in out))
        root.write_bytes(root_bytes)

        # T7 attr-restart forgery on the WITNESS carrier -> Core refuses (the
        # real carrier is 64 zeros; carrier disagreement) -> E2 FAIL
        true_a = [hashlib.sha256(b'<p>alpha</p>').hexdigest(),
                  hashlib.sha256(b'<p>beta</p>').hexdigest()]
        _mk_leaf(d, 'a.doc.html', [('a1', 'alpha'), ('a2', 'beta')],
                 decoy_true_digest=True)
        _mk_root(d, [('a.doc.html', doc_pin(true_a)), ('b.doc.html', doc_pin(ws_b))])
        code, out = run(root)
        checks.append(('T7 attr-restart forgery (x:data-witness decoy) FAILs',
                       code == 1 and 'E2 leaf-verifies      : FAIL' in out))
        (d / 'a.doc.html').write_bytes(orig)
        root.write_bytes(root_bytes)

        # T8 attr-restart forgery on the FOLD carrier (the wiki layer's own
        # tokenizer surface) -> real data-doc-pin (zeros) wins -> E3 FAIL
        _mk_root(d, [('b.doc.html', doc_pin(ws_b))],
                 raw_entries=[f'<a href="a.doc.html" data-doc-pin="{"0" * 64}" '
                              f'x:data-doc-pin="{doc_pin(ws_a)}">a</a>'])
        code, out = run(root)
        checks.append(('T8 attr-restart forgery (x:data-doc-pin decoy) FAILs',
                       code == 1 and 'E3 pin-matches        : FAIL' in out))
        root.write_bytes(root_bytes)

        # T9 duplicated data-witness attribute -> Core refuses (V25) -> E2 FAIL
        _mk_leaf(d, 'a.doc.html', [('a1', 'alpha'), ('a2', 'beta')],
                 dup_witness=True)
        code, out = run(root)
        checks.append(('T9 duplicate carrier attribute FAILs (V25 via Core)',
                       code == 1 and 'E2 leaf-verifies      : FAIL' in out))
        (d / 'a.doc.html').write_bytes(orig)

        # T10 root with <base href> -> refused, fail closed (the pin and the
        # browser-facing link could name different files)
        _mk_root(d, [('a.doc.html', doc_pin(ws_a)), ('b.doc.html', doc_pin(ws_b))],
                 base_href='other/')
        code, out = run(root)
        checks.append(('T10 <base href> on the root is refused (fail closed)',
                       code == 1 and 'R2 base-neutral       : FAIL' in out))
        root.write_bytes(root_bytes)

        # T10b case-variant <BASE href> -> refused all the same. R2's referent
        # is the browser, whose tag-name match is ASCII case-insensitive; the
        # Codex PR #10 finding was this exact shape slipping through a
        # case-sensitive port of the discovery grammar.
        _mk_root(d, [('a.doc.html', doc_pin(ws_a)), ('b.doc.html', doc_pin(ws_b))],
                 base_href='other/')
        root.write_bytes(root.read_bytes().replace(b'<base ', b'<BASE ', 1))
        code, out = run(root)
        checks.append(('T10b case-variant <BASE href> is refused (fail closed)',
                       code == 1 and 'R2 base-neutral       : FAIL' in out))
        root.write_bytes(root_bytes)

        # T11 valid witnessed section in the BODY, absent from the manifest ->
        # Core refuses (V29 order-bijection) -> E2 FAIL. The clause this
        # draft's own partial reader missed — delegation closes the class.
        _mk_leaf(d, 'a.doc.html', [('a1', 'alpha'), ('a2', 'beta')],
                 extra_unlisted=('smuggled', 'not in the manifest'))
        code, out = run(root)
        checks.append(('T11 unlisted witnessed section FAILs (V29 via Core)',
                       code == 1 and 'E2 leaf-verifies      : FAIL' in out))
        (d / 'a.doc.html').write_bytes(orig)

        # T12 an explicit --core naming a missing file refuses — the named
        # reader is never silently substituted by a fallback
        try:
            find_core_reader(str(d / 'no-such-verify.py'))
            t12 = False
        except FileNotFoundError:
            t12 = True
        checks.append(('T12 missing --core reader refuses (no fallthrough)', t12))

        # T13 DOC_HTML_CORE_READER naming a missing file refuses likewise
        prev = os.environ.get('DOC_HTML_CORE_READER')
        os.environ['DOC_HTML_CORE_READER'] = str(d / 'no-such-verify.py')
        try:
            find_core_reader(None)
            t13 = False
        except FileNotFoundError:
            t13 = True
        finally:
            if prev is None:
                os.environ.pop('DOC_HTML_CORE_READER', None)
            else:
                os.environ['DOC_HTML_CORE_READER'] = prev
        checks.append(('T13 missing env-named reader refuses (no fallthrough)', t13))

        # T14 entity-bearing href — the verifier would resolve a&amp;b.doc.html
        # literally while a browser decodes it to a&b.doc.html; refused by the
        # portable shelf-link grammar, never decoded (fail closed)
        _mk_root(d, [('b.doc.html', doc_pin(ws_b))],
                 raw_entries=[f'<a href="a&amp;b.doc.html" '
                              f'data-doc-pin="{doc_pin(ws_a)}">x</a>'])
        code, out = run(root)
        checks.append(('T14 entity-bearing href is refused (grammar, fail closed)',
                       code == 1 and 'E0 shelf              : FAIL  a&amp;b.doc.html '
                       '(href outside the portable shelf-link grammar' in out))
        root.write_bytes(root_bytes)

        # T15 shelf entry inside <textarea> — raw text in a browser, not a
        # live link; masked out of discovery, so the root presents no shelf
        _mk_root(d, [], raw_entries=[
            f'<textarea><a href="a.doc.html" '
            f'data-doc-pin="{doc_pin(ws_a)}">x</a></textarea>'])
        code, out = run(root)
        checks.append(('T15 entry inside <textarea> is not a shelf surface',
                       code == 1 and 'no data-doc-pin entries found' in out))
        root.write_bytes(root_bytes)

        # T16 percent-encoded href — a%62.doc.html is a.doc.html to a URL
        # consumer; refused by the grammar, never decoded
        _mk_root(d, [('b.doc.html', doc_pin(ws_b))],
                 raw_entries=[f'<a href="a%62.doc.html" '
                              f'data-doc-pin="{doc_pin(ws_a)}">x</a>'])
        code, out = run(root)
        checks.append(('T16 percent-encoded href is refused (grammar, fail closed)',
                       code == 1 and 'E0 shelf              : FAIL  a%62.doc.html '
                       '(href outside the portable shelf-link grammar' in out))
        root.write_bytes(root_bytes)

        # T17 query and fragment hrefs — both name the same file with extra
        # URL machinery the grammar refuses
        _mk_root(d, [('b.doc.html', doc_pin(ws_b))],
                 raw_entries=[
                     f'<a href="a.doc.html?x=1" '
                     f'data-doc-pin="{doc_pin(ws_a)}">x</a>',
                     f'<a href="a.doc.html#frag" '
                     f'data-doc-pin="{doc_pin(ws_a)}">x</a>'])
        code, out = run(root)
        checks.append(('T17 query/fragment hrefs are refused (grammar, fail closed)',
                       code == 1
                       and 'FAIL  a.doc.html?x=1 (href outside the portable' in out
                       and 'FAIL  a.doc.html#frag (href outside the portable' in out))
        root.write_bytes(root_bytes)

        # T18 dot-segment href — ../a.doc.html escapes the root's directory;
        # refused by the grammar (no dot-segments)
        _mk_root(d, [('b.doc.html', doc_pin(ws_b))],
                 raw_entries=[f'<a href="../a.doc.html" '
                              f'data-doc-pin="{doc_pin(ws_a)}">x</a>'])
        code, out = run(root)
        checks.append(('T18 dot-segment href is refused (grammar, fail closed)',
                       code == 1
                       and 'FAIL  ../a.doc.html (href outside the portable' in out))
        root.write_bytes(root_bytes)

        # T19 exact-case — the leaf on disk is 'a.doc.html'; the shelf spells
        # it 'A.doc.html'. A case-insensitive filesystem would open it and
        # certify a root a case-sensitive host serves broken, so the segment
        # spelling is checked against the directory listing and refused.
        _mk_root(d, [('A.doc.html', doc_pin(ws_a)), ('b.doc.html', doc_pin(ws_b))])
        code, out = run(root)
        checks.append(('T19 mis-cased href is refused (exact directory spelling)',
                       code == 1
                       and 'E1 leaf-exists        : FAIL  A.doc.html' in out
                       and "the directory spells it 'a.doc.html'" in out))
        root.write_bytes(root_bytes)

        # T20 emission-exact — a passing run hands back the object it
        # verified: every checked (href, full pin) pair, plus the boundary
        # line, plus a verdict that says what was actually checked.
        code, out = run(root)
        checks.append((
            'T20 passing run emits the VERIFIED SHELF it checked',
            code == 0
            and ('VERIFIED SHELF (what this run actually checked - compare it '
                 'with the page you read):') in out
            and f'  a.doc.html  {doc_pin(ws_a)}' in out
            and f'  b.doc.html  {doc_pin(ws_b)}' in out
            and ('NOT CHECKED: whether an HTML reader presents these carriers '
                 'as live links.') in out
            and 'WIKI: PASS (2 serialized shelf carrier(s) verified' in out))

        # T21 emission-omits-unchecked — an anchor-shaped decoy inside an HTML
        # comment is masked out of discovery, so it is never checked; the
        # emission must list only what was.
        _mk_root(d, [('b.doc.html', doc_pin(ws_b))],
                 raw_entries=[f'<!-- <a href="a.doc.html" '
                              f'data-doc-pin="{doc_pin(ws_a)}">decoy</a> -->'])
        code, out = run(root)
        checks.append((
            'T21 emission lists only the entries actually checked',
            code == 0
            and 'WIKI: PASS (1 serialized shelf carrier(s) verified' in out
            and f'  b.doc.html  {doc_pin(ws_b)}' in out
            and doc_pin(ws_a) not in out
            and 'a.doc.html' not in out.split('VERIFIED SHELF')[1]))
        root.write_bytes(root_bytes)

        # T22 reader-digest — the receipt states the digest sampled from the
        # resolved reader path before invocation, recomputable against the
        # published seal (a fact the receipt states, not an authenticity it
        # can prove; file stability during the run is not checked).
        code, out = run(root)
        checks.append((
            "T22 receipt states the sampled reader-file sha256",
            code == 0
            and ('R0 reader-file-sha256 : '
                 + hashlib.sha256(core.read_bytes()).hexdigest()
                 + '  (digest sampled from the resolved reader path before '
                   'invocation; file stability during the run not checked)')
                in out))

        # T6 clean again after every restoration
        code, out = run(root)
        checks.append(('T6 restored wiki PASSes', code == 0))

    print(f'core reader           : {core}')
    ok = all(passed for _, passed in checks)
    for name, passed in checks:
        print(f'{"PASS" if passed else "FAIL"}  {name}')
    print()
    print('SELFTEST: ' + ('PASS' if ok else 'FAIL'))
    return 0 if ok else 1


# ─── Entry point ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    args = sys.argv[1:]
    explicit_core = None
    if '--core' in args:
        i = args.index('--core')
        explicit_core = args[i + 1]
        del args[i:i + 2]
    if not args:
        print(f'Usage: python {sys.argv[0]} <root wiki.doc.html> | --selftest '
              '[--core <verify.py>]', file=sys.stderr)
        sys.exit(1)
    try:
        core_path = find_core_reader(explicit_core)
    except FileNotFoundError as e:
        print(f'FAIL: {e}', file=sys.stderr)
        sys.exit(1)
    if args[0] == '--selftest':
        sys.exit(selftest(core_path))
    sys.exit(verify_wiki(Path(args[0]), core_path))
