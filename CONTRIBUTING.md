# Contributing

Short version: **this repository is a generated mirror, and most of its files are sealed by a
hash that you will break without noticing.** This page is the list of things that break
silently. Read it before your first edit to a `.doc.html`.

---

## 1. This repository is generated

Every release rebuilds this whole tree from a private upstream repository and replaces the
tracked files wholesale. A commit made directly here — yours or anyone's — does not travel
back upstream and will be gone at the next release.

So: **open an issue rather than a pull request.** Describe the problem, quote the bytes, and
name the file. A patch is welcome inside the issue as a diff or a paste; it gets applied
upstream, reviewed there, and ships out in the next release. Nothing is lost — it just does
not travel through this repository's git history.

The same rule explains a few oddities you may notice: history here starts at the first public
release, there is no branch structure, and file mode and timestamp churn between releases is
the assembler, not an author.

---

## 2. Verify before you report

Everything below is checkable in under a minute, with what is already in the bundle. Run this
first — a failure here is a real bug and worth an issue; a pass means the bundle is intact and
the problem is elsewhere.

Any single document, on both reference readers:

```bash
node   tools/verify.mjs documents/wiki.doc.html
python tools/verify.py  documents/wiki.doc.html
```

The whole collection — the shelf, every pinned leaf, and every pin:

```bash
python tools/verify_wiki.py  documents/wiki.doc.html
node   tools/verify_wiki.mjs documents/wiki.doc.html
```

Both must print `WIKI: PASS` and exit 0. The collection verifiers delegate every per-document
verdict to the two readers above and own only the shelf layer, so a wiki failure is either a
pin mismatch or a document failure — the output says which.

The same checks run in CI on every push; see [`.github/workflows/verify.yml`](.github/workflows/verify.yml).

---

## 3. The four reference readers are byte-sealed

`tools/verify.mjs`, `tools/verify.py`, `tools/verify_wiki.mjs`, and `tools/verify_wiki.py` are
sealed: **their exact bytes are the contract**, published and hash-pinned, so that two people
running "the reader" are demonstrably running the same instrument. Do not edit them — not the
code, not a comment, not whitespace. A genuine reader bug is an issue, and the repair travels
as a new seal, as a pair, with both languages re-checked against each other.

One visible consequence: their `Usage:` header comments predate the move into `tools/` and say
`python verify.py <file>` where the path is now `tools/verify.py`. **The stale comments are
deliberate.** Correcting them would break the seal for a path string; the header recension
travels with the next re-seal instead. Use the commands in section 2.

A second consequence is behavioural: **always pass the file explicitly.** Run with no argument,
`node tools/verify.mjs` falls back to a default document beside itself — `tools/doc.html` — which
this layout does not have, and it exits on an unhandled `ENOENT` stack trace rather than a usage
message. (`python tools/verify.py` prints its usage line instead; the two differ, and neither is
edited to agree with the other.) The default is a seal artifact of an older flat tree, not an
invitation, and it will not be tidied ahead of the next re-seal.

---

## 4. Witness law: every witness lives in two places

A witnessed section carries `data-witness` (SHA-256 over the section's raw inner bytes — UTF-8,
LF, untrimmed) and `data-char-count` on **two carriers**: the `<section>` tag itself, and that
section's entry in the document's `<nav id="manifest">`. Both must agree, and both must match
the bytes.

So **any byte change inside a witnessed span is a rebuild, not an edit** — including fixing a
typo, retargeting a link, or reflowing a paragraph. The sequence is: change the bytes, recompute
the section's witness and character count, write the new values into *both* carriers, then run
both readers over the file and require 0 mismatches, exit 0.

This is also why `.editorconfig` turns trailing-whitespace trimming **off** for `*.html`. A
tidy-on-save editor that strips one trailing space from a witnessed line has just invalidated
that section's hash.

---

## 5. Pin law: editing a pinned page cascades

`documents/wiki.doc.html` is a shelf. Each entry pins its leaf with `data-doc-pin` — SHA-256
over that leaf's manifest `data-witness` values, in manifest order, joined by a single ASCII
colon. The pin binds the shelf to the leaf's contents across files.

So editing any pinned page is a three-step cascade, in order:

1. Rebuild the leaf's own witnesses (section 4) and pass both readers on it.
2. Recompute the leaf's `data-doc-pin` and write it into the shelf entry in
   `documents/wiki.doc.html`.
3. The shelf is itself a witnessed document — rebuild *its* witnesses too, and pass both
   readers on it.

Then `verify_wiki` must PASS in both languages. The rule and its self-check are written out
in [`documents/the-wiki-shape.doc.html`](documents/the-wiki-shape.doc.html); a shelf href must
also be a plain relative path of `/`-joined `[A-Za-z0-9._-]` segments, with no `.` or `..` —
a wiki certifies only files beside or below itself, never above.

---

## 6. Two specification files, one specification

[`SPEC.md`](SPEC.md) is **normative**. [`SPEC.doc.html`](SPEC.doc.html) is the
specification carried in the format's own body, so that the format's own reader can navigate
and verify it (currently the v0.4 text in-band; the re-fold to the current text ships separately).

They are kept consistent by hand. **A change to one is a change to both** — and the
`SPEC.doc.html` half is a witnessed-document change, so it follows section 4. A pull-worthy
report of a spec defect should say which sentence, in `SPEC.md` terms; both copies move
together. That hand-lockstep is now **checked rather than trusted**: the release battery
runs a lab-side equality gate — not part of this bundle — that reduces both carriers to
their normative text, aligns them by heading, and refuses the release if any section's
words diverge.

---

## 7. One essay is fidelity-sealed

[`documents/essays/the-wiki-that-witnesses-itself.doc.html`](documents/essays/the-wiki-that-witnesses-itself.doc.html)
is carried byte-exact from its source and is never edited here — not for typos, not for
formatting, not for a link. If something in it is wrong, say so in an issue; the correction
happens at the source and arrives as a whole new copy.

That seal makes it the one shipped document that is **exempt from the makers' current practice.**
The other documents in this bundle each carry a short in-band self-description — what a doc.html
is, how to read the manifest, how the witnesses are computed — and an about line naming author,
build date, and licence. This essay predates that practice and does not carry either. The
exemption is deliberate and recorded here rather than repaired: retrofitting the page would mean
breaking a fidelity seal to improve a document, and the seal outranks the improvement.

---

## 8. Everything else

Plain files — `README.md`, `CHANGELOG.md`, this page, `examples/README.md`, `.editorconfig`,
the CI workflow — are cheap to change and carry no witness. All shipped text files are UTF-8
with LF endings and a final newline; `.editorconfig` states the rest.

The format is public domain (CC0 1.0). So is anything you contribute to it.
