# doc.html

**AI knowledge that remains a document.**

doc.html is a public-domain, web-native format for portable AI knowledge, memory, agents, and conversation. A document carries its own visible map, stable section addresses, and integrity witnesses — so an AI can navigate knowledge larger than its context window while the same file stays a normal HTML page any human can open in a browser.

**Human-readable. Agent-navigable. Integrity-witnessed. Public domain.**

**Status:** v0.3.2 · first public release 2026-07-07 · updated 2026-07-13

A `doc.html` is **one self-describing document**. Multiple documents link into **collections** — wikis, knowledge bases, memory archives, agent workspaces. Nothing here requires a proprietary reader, an external retrieval index, a JavaScript runtime, or a server: the file alone is the whole format.

---

## The problem

AI knowledge keeps disappearing into applications. Prompts live in one tool. Memory lives in another. Sources become hidden chunks. Conversations vanish inside session history. Agent instructions scatter across files, frameworks, and vendors.

doc.html keeps the operative knowledge in an artifact you can open, inspect, edit, version, archive, email, host, and give to another model.

**The application may be temporary. The document can remain.**

---

## What the record shows

Tested, sealed, and traced — every number below links to a sealed probe via [`EVIDENCE.md`](EVIDENCE.md):

| | |
|---|---|
| **72.5 MB · 17,631 sections** | navigated selectively, manifest-then-drill, without loading the body ([§1](EVIDENCE.md#1-scale--reading-past-the-context-window)) |
| **480/480** | navigation turns OK in the sealed at-scale run ([§1](EVIDENCE.md#1-scale--reading-past-the-context-window)) |
| **120/120** | proof-of-read canaries recovered — the model provably read the bytes, not its training data; strict composite gate 116/120 ([§3c](EVIDENCE.md#3c-proof-of-read-at-xl-scale-share)) |
| **240/240** | self-citations verified byte-for-byte against sealed content ([§3c](EVIDENCE.md#3c-proof-of-read-at-xl-scale-share)) |
| **3 model families** | Claude, GPT, and Kimi read the same artifact in the sealed at-scale run, 40 graded cells each ([§3c](EVIDENCE.md#3c-proof-of-read-at-xl-scale-share)) |
| **3 reader languages** | JavaScript, Python, and a PowerShell stranger-proxy reader written blind from the spec ([§5](EVIDENCE.md#5-what-is-not-yet-demonstrated)) |
| **−52.9% tokens, +1.19 quality** | vs loading the document whole, on the baseline corpus ([§2a](EVIDENCE.md#2a-token-and-quality-savings-on-a-759-kb-corpus)) |
| **0 proprietary services** | required by the format for reading and verifying — the file plus standard computation; no server, no JavaScript ([§4](EVIDENCE.md#4-integrity--read-and-verify-with-no-server-no-javascript)) |

The negative results are retained in the same document ([§5](EVIDENCE.md#5-what-is-not-yet-demonstrated)–[§6](EVIDENCE.md#6-the-rag-comparison-recall-up-tokens-down-is-wrong)): selective hydration costs *more* tokens than vector RAG (it trades tokens for recall with no external retrieval index), small documents are cheaper read whole, and deep hierarchical live selection is an open research problem. The record includes what did not work — and says so in the same voice as what did.

---

## The mechanism

**The document can be larger than the reader.**

1. **Orient** — read the manifest.
2. **Select** — choose the relevant sections.
3. **Hydrate** — load only the selected material.
4. **Verify** — check the address, witness, and citation.

Don't make the model read everything. Give it a map.

---

## What it can carry

**A wiki.** Multiple `doc.html` files form a linked collection: every page stays a normal web page while carrying agent-readable navigation, stable addresses, and integrity witnesses. A familiar AI wiki has been rebuilt this way in the lab record (the `llm-wiki` probe, on the lab branch); a public browsable showcase lands with the website phase. This is not one enormous file — it is a wiki: a linked collection of self-describing documents.

**Memory that belongs to you.** Project decisions, facts, corrections, and provenance in a file you can open, edit, archive, version, and give to another model — [`examples/memory.doc.html`](examples/memory.doc.html). Corrections supersede without erasing: current knowledge, history intact.

**An agent's inheritance.** Instructions, procedures, memory, references, and unfinished work traveling together as one inspectable document. [`agents.html`](agents.html) is the dogfooded *repository-memory* case of this — the narrower, running-today cousin of full agent inheritance, which is the broader architecture. The document carries the agent's inheritance, never its runtime: the model can change; the knowledge remains.

**A conversation** *(experimental frontier)*. Turns as durable, witnessed sections a later reader can inherit — [`examples/chat.doc.html`](examples/chat.doc.html). Close the interface; keep the conversation.

---

## Try it in sixty seconds

1. Open [`examples/memory.doc.html`](examples/memory.doc.html) — a portable memory document.
2. Give the file to any AI with: *“Read this document using the orientation it provides. Tell me what sections are available, then answer my question using only the relevant sections.”*
3. Ask a question whose answer lives in one section.
4. Check which section it chose — and verify the bytes yourself:

```bash
node verify.mjs examples/memory.doc.html
```

Smallest possible document: [`examples/minimal.doc.html`](examples/minimal.doc.html). A conversation as a durable document: [`examples/chat.doc.html`](examples/chat.doc.html). Selective reading demonstrated: [`examples/selective-context-demo.doc.html`](examples/selective-context-demo.doc.html).

---

## This repo runs on its own format

[`agents.html`](agents.html) is this repository's live memory organ — a conformant doc.html with an always-load steer section, a manifest, and witnessed hydrate-on-demand sections. Tell any agent to read `agents.html` first; it hydrates selectively through the manifest and can verify every byte it reads. The reading skill at [`.agents/skills/doc-html-reader/`](.agents/skills/doc-html-reader/) is the efficient path — but no skill is required: the file teaches its own reading protocol in-band.

Memory stored this way belongs to the user: open it, edit it, archive it, put it in Git, give it to another model. Corrections supersede earlier knowledge without deleting history — the record grows by inscription, not erasure.

---

## Build one from scratch

Hand the spec to any coding agent:

```
Read SPEC.md and build a conformant doc.html for the content in [your source].
Implement every MUST, pass the Validation Matrix (§10), and satisfy the
Definition of Done (§11). The format requires no server, no JavaScript, and
no tooling to read — the file alone is the whole format.
```

The agent needs only `SPEC.md`. No other context is required. The specification has already been implemented blind once: a PowerShell stranger-proxy reader — written from the spec alone under an instruction-enforced blindness protocol — converged byte-for-byte with the reference readers on the clean, corrupted, and CRLF base fixtures. The extended battery and a true-stranger implementation are the next proof, not yet run.

---

## Reference and examples

| Path | What it is |
|---|---|
| [`SPEC.md`](SPEC.md) | The complete, self-contained format specification. **This is normative.** |
| [`MISSION.md`](MISSION.md) | Why the format exists — the two testimonies (human and AI) it answers to. |
| [`VOWS.md`](VOWS.md) | The ten public promises: what the format will never do, what it will always do, and how each is kept. |
| [`EVIDENCE.md`](EVIDENCE.md) | Every headline number traced to a sealed probe — including the negative results. |
| [`agents.html`](agents.html) | This repository's own memory organ — the live meta-example. |
| [`.agents/skills/doc-html-reader/`](.agents/skills/doc-html-reader/) | The agent reading skill: manifest-first selective hydration + opt-in `--verify`. |
| [`examples/minimal.doc.html`](examples/minimal.doc.html) | Smallest conforming document: one section, one manifest entry. |
| [`examples/memory.doc.html`](examples/memory.doc.html) | Portable memory: multi-section, manifest-first, supersession-aware. |
| [`examples/chat.doc.html`](examples/chat.doc.html) | A conversation as a durable, witnessed document. |
| [`examples/selective-context-demo.doc.html`](examples/selective-context-demo.doc.html) | Selective-context reading demonstration. |
| [`examples/`](examples/) | All examples plus their emitter scripts. See `examples/README.md`. |
| [`build-doc.mjs`](build-doc.mjs) | Generalized builder: load sections from JSON or a directory of fragments and emit a conformant doc.html. |

---

## Verify a file

Two reference readers ship with the bundle. Either should PASS on any conforming document:

```bash
node verify.mjs <file>
```

```bash
python verify.py <file>
```

Both implement the full Validation Matrix (§10): shape detection, manifest parsing, per-section witness recompute (SHA-256 over the raw inner span), char-count check, and non-vacuity. Integrity witnesses prove content consistency — the bytes you read are the bytes the document promised. They do not prove factual truth; that distinction is stated once here so the rest of the document doesn't have to whisper.

---

## Two claims — only one is made here

The slogan "HTML is all you need" splits into two claims. This format makes only the first:

- **Claim A** — the document is all-HTML inheritable memory (read, address, verify, hydrate selectively; no server, no JS). **This is what v0.3 specifies, and it is demonstrated at 72.5 MB scale.**
- **Claim B** — the live loop is all-HTML (write + model-call + append in a bare browser). **Out of scope.** The *read* loop is all-HTML and server-free; the *run* leg — model call, key, disk write — is a platform action a scriptless `file://` page cannot perform. That leg is delegated to mature, general infrastructure — a shim over existing tools, **not a bespoke doc.html server.** The format owns the verb's *result* (a witnessed, appended section), not its *execution*.

---

## License

Public domain (CC0 1.0). No permission. No platform fee. No owner.

Use it. Change it. Teach it. Ship it. A format for durable inheritance should not belong to one company.
