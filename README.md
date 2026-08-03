# doc.html

**AI knowledge that remains a document.**

doc.html is a public-domain, web-native format for AI knowledge, memory, agents, and conversation. The idea in one sentence: **give the model a map, not a pile.**

**Human-readable. Agent-navigable. Integrity-witnessed. Public domain.**

**Version:** v0.5.0 · updated 2026-08-02 · see [CHANGELOG.md](CHANGELOG.md)

---

## What it is

A doc.html carries its own visible table of contents — the **manifest** — plus stable section addresses and a per-section integrity hash. An agent can therefore navigate a document far larger than its context window, load only the sections it needs, and check the bytes it read. The same file is still a normal HTML page: double-click it and read.

**Reading on GitHub:** github.com displays these files as source, not as pages. Read them rendered at [ndoto-g.github.io/doc.html/documents/wiki.doc.html](https://ndoto-g.github.io/doc.html/documents/wiki.doc.html) — that link opens the wiki shelf — or clone or download the repository and double-click any file. A doc.html needs nothing else.

Your knowledge is otherwise scattered: prompts in one tool, memory in a vendor's database, sources chopped into an index you cannot inspect, conversations locked inside session history, agent instructions spread across files and platforms. Each piece works; none of it is *yours* the way a file is yours. **The application may be temporary. The document can remain.**

**The document can be larger than the reader.** A reader works in four motions:

1. **Orient** — read the manifest.
2. **Select** — choose the relevant sections.
3. **Hydrate** — load only the selected material.
4. **Verify** — check the address, the witness, and the citation.

This is what the map looks like — real grammar, from the smallest shipped example:

```html
<nav id="manifest">
  <a href="#fold" data-witness="771feff36…" data-char-count="75">
    <span class="title">The Fold</span>
    <span class="summary">Append-only memory; correction is supersession.</span>
  </a>
</nav>

<section id="fold" data-witness="771feff36…" data-char-count="75">
  <h1>The Fold</h1>
  <p>Memory is append-only; correction is supersession.</p>
</section>
```

*(Witnesses shortened for display — a real `data-witness` is 64 lowercase hex characters.)*

That is most of the format. The manifest is the map; the section is the payload; `data-witness` is the SHA-256 of the section's exact inner bytes — the proof that the section you hydrate is byte-for-byte the section the map named. (The witness certifies bytes; a manifest summary is authored routing.) An agent reads the manifest first (a few KB even for a huge document), picks sections by id, hydrates only those, and can recompute any hash it cares about with a stock tool. No proprietary reader, no JavaScript, no database, no server.

One doc.html is one self-describing document. Documents link into **collections** — wikis, knowledge bases, memory archives, agent workspaces — where each page stays independently readable, addressable, and verifiable.

**Two claims, and only one is made here.** The *read* loop is all-HTML: address, hydrate, verify, inherit, with nothing but the file, a browser, and SHA-256. The *write* loop — model call, key, disk write — is a platform action a scriptless page cannot perform, and the format does not pretend otherwise: it owns the result of the verb (a witnessed, appended section), not its execution.

---

## Use one in sixty seconds

1. Open [`examples/memory.doc.html`](examples/memory.doc.html) — a portable memory document.
2. Give the file to any AI with: *"Read this document using the orientation it provides. Tell me what sections are available, then answer my question using only the relevant sections."*
3. Ask a question whose answer lives in one section.
4. Check which section it chose — and, if you want, verify the bytes yourself:

```bash
node tools/verify.mjs examples/memory.doc.html
```

Smaller still: [`examples/minimal.doc.html`](examples/minimal.doc.html), one section and one manifest entry — the whole grammar on one screen. Then read [`examples/README.md`](examples/README.md), which puts the exhibits in a reading order.

---

## What you can build

**A wiki.** Not one enormous file — a linked collection of self-describing pages, each a normal web page that also carries agent-readable navigation, stable addresses, and integrity witnesses. The root shelf links every page and pins it with a cross-file witness, so a reader can check that the page it opened is the page the shelf promised. Open [`documents/wiki.doc.html`](documents/wiki.doc.html) and walk it the way you browse: follow a link, read the map, open only the page that answers the question.

**Memory that belongs to you.** Project decisions, facts, corrections, and provenance in a file you can open, edit, diff, archive, version, and hand to a different model next year — [`examples/memory.doc.html`](examples/memory.doc.html). Corrections supersede without erasing: the current answer is current, and the history behind it stays readable.

**An agent's inheritance.** Instructions, procedures, memory, references, and unfinished work travelling together as one inspectable document. [`agents.html`](agents.html) is this repository's own memory organ — the repo runs on it. Its steer core is always read; everything else waits behind the manifest until a task needs it. The document carries the agent's inheritance, never its runtime: the model can change; the knowledge remains.

**A conversation that outlives the app.** Turns as durable, witnessed sections a later reader can inherit — [`examples/chat.doc.html`](examples/chat.doc.html). The specification defines the shape: a sealed, witnessed head plus a writing room for the turn still being written. Close the interface; keep the conversation.

---

## Write one

**By hand.** The minimal grammar is about twenty lines — the sample above is nearly all of it. Write your sections, give each an `id`, list them in the manifest in document order, then compute each `data-witness` as the SHA-256 of the section's raw inner bytes (UTF-8, LF, untrimmed) and each `data-char-count` as its length in code points. Any language with a SHA-256 function can do it.

**With the builder.** [`tools/build-doc.mjs`](tools/build-doc.mjs) takes sections from a JSON file or a directory of HTML fragments and emits a conformant document, witnesses computed for you:

```bash
node tools/build-doc.mjs sections.json out.doc.html
```

**With a coding agent.** Hand it the specification:

```
Read SPEC.md and build a conformant doc.html for the content in [your source].
Implement every MUST, pass the Validation Matrix (§10), and satisfy the
Definition of Done (§11). The format requires no server, no JavaScript, and
no tooling to read — the file alone is the whole format.
```

The agent needs only `SPEC.md`. No other project context is required.

---

## Verify one

Verification is optional for reading — the file is readable without it — but two reference readers ship with the bundle, one in each language. Either should PASS on any conforming document:

```bash
node tools/verify.mjs <file>
```

```bash
python tools/verify.py <file>
```

Both implement the Validation Matrix (§10): shape detection, manifest parsing, per-section witness recompute over the raw inner span, character-count checking, and non-vacuity.

A witness proves **content consistency** — the bytes you just read are the bytes the document promised, unchanged since it was written. It does not prove the content is true, and it does not tell you who wrote it.

To verify a whole collection — the root plus every pinned document — two companion verifiers sit beside the readers. They delegate every per-document verdict to the readers above and own only the collection layer: shelf discovery over the root's serialized bytes, leaf existence, and pin comparison. A clean run prints the exact list of entries it checked.

```bash
python tools/verify_wiki.py documents/wiki.doc.html
```

```bash
node tools/verify_wiki.mjs documents/wiki.doc.html
```

---

## What is where

| Path | What it is |
|---|---|
| [`README.md`](README.md) | This page — the front door. |
| [`SPEC.md`](SPEC.md) | The complete, self-contained format specification. **This is normative.** |
| [`SPEC.doc.html`](SPEC.doc.html) | The same specification carried in the format's own body: a doc.html you can navigate and verify. |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed in each release, and what a version bump moves or breaks. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to work on this repository without breaking a witness. Read before your first edit to a `.doc.html`. |
| [`LICENSE`](LICENSE) | CC0 1.0. |
| [`agents.html`](agents.html) | This repository's own memory organ — the live meta-example. |
| [`documents/wiki.doc.html`](documents/wiki.doc.html) | The wiki root: a shelf that links and pins every page in the collection. |
| [`documents/the-wiki-shape.doc.html`](documents/the-wiki-shape.doc.html) | The collection shape specified — parts, rule, reading mechanism, receipts, and limits — so you can build and verify your own. |
| [`documents/evidence.doc.html`](documents/evidence.doc.html) | The record: what was measured, what held, what did not. |
| [`documents/doc.html`](documents/doc.html) | The founding research corpus, pinned into the wiki as its research leaf. Historical where it disagrees with `SPEC.md`; `SPEC.md` is normative. Download it and open it in a browser — GitHub shows `.doc.html` files as source, not pages (and at roughly 800 KB this one is past previewing anyway). |
| [`documents/essays/`](documents/essays/) | The design essays, each a pinned page of the wiki. |
| [`documents/MISSION.md`](documents/MISSION.md) | Why the format exists — the two testimonies, human and AI, that it answers to. |
| [`documents/VOWS.md`](documents/VOWS.md) | The makers' covenant: the ten promises we keep as we build this format — what we will never do, what we will always do, and how each is kept here. |
| [`examples/`](examples/) | Conforming documents, ordered for a beginner, plus the scripts that emit them. Start at `examples/README.md`. |
| [`tools/verify.mjs`](tools/verify.mjs) · [`tools/verify.py`](tools/verify.py) | The two reference readers for a single document. |
| [`tools/verify_wiki.mjs`](tools/verify_wiki.mjs) · [`tools/verify_wiki.py`](tools/verify_wiki.py) | The two collection verifiers: root, leaves, and pins. |
| [`tools/build-doc.mjs`](tools/build-doc.mjs) | The builder: JSON or a fragment directory in, conformant doc.html out. |
| [`tools/agent-skill/doc-html-reader/`](tools/agent-skill/doc-html-reader/) | An agent reading skill — manifest-first selective hydration with opt-in verification. No skill is required: the format teaches its own reading protocol in-band. |

---

## Going deeper

The design essays are published on the wiki itself — [`documents/wiki.doc.html`](documents/wiki.doc.html) is the shelf, and each essay is a separate document it links and pins. They cover what the format is for, where it comes from, what it refuses to do, and where it is thinner than it looks. The shape they demonstrate is specified in [`documents/the-wiki-shape.doc.html`](documents/the-wiki-shape.doc.html).

Measurements, limits, and null results live in the record: [`documents/evidence.doc.html`](documents/evidence.doc.html).

To implement the format — a reader, a writer, another collection — read [`SPEC.md`](SPEC.md). It is the normative text; everything else here is illustration.

---

## License

Public domain (CC0 1.0). No permission. No platform fee. No owner.

Use it. Change it. Teach it. Ship it. A format for durable inheritance should not belong to one company.
