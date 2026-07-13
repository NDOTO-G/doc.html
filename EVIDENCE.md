# doc.html v0.3 — Publication Evidence

> **Type:** Public evidence document — readable by a skeptic checking against sealed receipts
> **Date:** 2026-06-15
> **Source:** Transcribed from PUBLICATION_EVIDENCE_LEDGER.md (2026-06-14)
> **Status:** Publication copy — every headline number traces to a sealed probe

---

## The thesis, split

The slogan "HTML is all you need" hides two claims. The record separates them cleanly before
any capability claim is made.

**Claim A — the proven, published thesis:** A doc.html file is all-HTML inheritable,
selectively-readable memory. A model can read it, address sections by id, verify integrity,
and selectively hydrate sub-sections from a corpus that exceeds the context window — with no
server, no JavaScript, and no external index required.

**Claim B — not claimed: the live *loop* is not all-HTML.** Writing a turn — call a model,
hold a key, append the bytes — cannot be completed in a bare browser: a scriptless `file://`
page cannot write to disk (HTTP `PUT` was amputated from browsers). But the precise shape of
the limit matters. The *read* loop is all-HTML and server-free. The *run* leg is not
impossible, only un-HTML: it is delegated to mature, general infrastructure — an OS mail path,
a stateless model-completion command — a shim over existing tools, **not a bespoke doc.html
server.** The format owns the verb's *result* (a witnessed, appended section), not its
*execution*. This publication makes no capability claim about the run leg beyond that scoping,
and it should not be inferred from Claim A.

---

## 1. Scale — reading past the context window

**A single integrity-witnessed HTML file can hold a corpus several times larger than a model's
context window, and an LLM reads it manifest-then-drill without loading the whole file.**

`tracer-memory-at-scale` demonstrated this at 74 MB / 17,627 sections (~3x a typical context
window): the model navigated by manifest, and the manifest-only arm answered correctly with
zero body hydration. `apparatus-memori` [sealed, pre-registered] confirmed the same architecture
at 72.5 MB / 17,631 sections across 480 navigation turns, all OK.

**Navigation latency at this scale is bounded but not instant.** [SHARE (QUALIFIED)]

Per-turn navigation in `apparatus-memori` ran 8–34 seconds typical. The worst-case tail was
209 seconds (one Kimi turn over a flat 72 MB manifest). Plan for that tail; do not imply
instant response.

---

## 2. Cost — selective hydration vs. loading the document

The comparisons in this section are against **in-context loading** of the document: placing
the whole file in context and querying it. They are **not** comparisons against a vector RAG
index (see the RAG note in Section 6 below).

### 2a. Token and quality savings on a 759 KB corpus

The v0.2 baseline run (63 graded trials, 759 KB corpus) found:

- **−52.9% effective tokens** vs naive in-context loading
- **−65.5% bytes** transferred
- **+1.19 quality improvement** (mean 3.29 → 4.48 on a 5-point scale)

The adversarial "read everything" condition: **−78.0% tokens** (mean across the three
seeds; the best seed reached −91.6%), quality 5/4/4 vs naive 1/1/1.
The unanswerable-question condition: **−76.0% tokens** (mean across seeds), quality 5 on
all three seeds vs naive 5/3/3.

The skill arm had **0 failures**; naive had 6. 100% of skill-arm responses passed (≥3);
13/21 were perfect (quality 5).

### 2b. Savings grow with the overflow they prevent

`tracer-memory-at-scale` [sealed]: at L-tier scale, the selective arm saved **−680,018
tokens median** vs in-context loading on overflow questions (374k effective tokens vs
1.054M). XL-tier scoping cut −223k tokens median.

### 2c. Savings are task- and size-dependent [SHARE (QUALIFIED)]

`tracer-torah-scaleup` [sealed, 120 cells, 1 MB verse-structured corpus]:

- At 750 KB: −52.9% tokens
- At 1 MB: −16.9% tokens (savings compress on uniformly-structured text)
- Ambiguous questions: −63%; adversarial "read all": −86%
- A ~35k effective-token skill floor dominates on short tasks, eroding the saving

**The saving is real but task- and size-dependent.** Measure the target harness and
document type; do not apply the headline 52.9% figure universally.

Additionally: on the `pi-mono` harness, `tracer-pi-cross-harness` found the saving
**inverted to +135.7% (Claude) / +169.8% (GPT-mini)** because that harness surfaces the
manifest for free in the first read chunk. Root cause is tool-result formatting, not the
doc.html format. The win depends on the harness not handing the model the whole head for
free; measure your target harness.

### 2d. When the document is small, selective hydration costs *more* — measured [SHARE (QUALIFIED)]

`tracer-11` ran a ~3 KB document across three arms — **naive** (one whole-file read),
**skill** (selective via reader scripts), and **html-alone** (selective via inline HTML
parsing). Measured directly from the run's own `summary.csv` (median across the error-free
`claude-sdk` cells, n=17 per arm):

- **Bytes actually loaded:** naive 3,149 → skill 1,457 (**−53.7%**) → html-alone 572
  (**−81.8%**). Selective hydration loads far less of the document, exactly as designed.
- **Effective input tokens:** naive 33,221 → skill 53,265 (**+60.3%**). The token cost
  *inverts* — the selective arms are more expensive.

Both numbers are real and they point in opposite directions. The reason: at 3 KB the whole
document is already cheaper than the **harness floor** — the system prompt, the tool
schemas, and the extra turns selective reading requires. Loading fewer bytes does not pay
for itself until the document is large enough that loading all of it would itself dominate
the cost. This is the §2c floor in one probe's own numbers, from a second cause (small
*document*, distinct from §2c's harness-formatting inversion): **selective hydration is an
economy of scale — it wins only once the document is too big to cheaply read whole.** It is
the right tool for the 72 MB body, not the 3 KB note. Pick it by document size, not by
default.

---

## 3. Recall fidelity — the strongest leg

### 3a. Selective recall is reliable

v0.2 baseline: skill arm 100% pass (≥3), 13/21 perfect, 0 failures vs naive 71.4% / 6
failures.

`tracer-pi-cross-harness` [sealed, 178 cells]: hydration precision **1.00 (Claude) /
0.98 (GPT-mini)**; median quality 5.0 across harnesses and models.

### 3b. The format teaches selective reading without instruction

`tracer-pi-cross-harness` sub-probe D (no system prompt at all): 5.0 median quality,
80% citation-correct; the model discovered the manifest by exploration.

`tracer-11` [33 cells]: the HTML-alone arm reached for HTML structure 100% of the time
unprompted; mean score 1.000 vs naive 0.955; 32/33 perfect.

### 3c. Proof-of-read at XL scale [SHARE]

`apparatus-memori` [sealed, pre-registered, 72.5 MB, 480 turns]:

- Fabricated-perturbation canary: **120/120**
- Latin gloss: **120/120**
- Strict folio reference: **116/120 (96.7%)**
- Self-citations verified byte-for-byte: **240/240**
- Authority grade: **118/120**

These were pre-registered tests designed to prove the model actually read the section, not
parametric-recalled it. The canary and gloss results mean a model cannot pass these tests
without hydrating the actual bytes. The run executed 40 graded cells each on Claude
(sonnet), GPT (codex, GPT-5.4-mini), and Kimi (k2.5) subjects, with committed per-vendor
trial rows — the same artifact read across three model families (a tool-surface asymmetry
between harnesses is disclosed in the probe's SUMMARY).

### 3d. Three-body fold at L tier [SHARE (QUALIFIED)]

`trinity-discipline` [sealed, blind cross-model, L tier = 44 MB] folded the three bodies —
the document, the memory body, and the chat (writing-room) body — end-to-end:

- L1/L2 mechanical: 9/9 PASS
- L3 blind — hydration discipline: 18/18
- Source-vs-memory distinction: 9/9
- Authority adjudication: 9/9
- Harness-handoff: 5/5 (a fresh harness rediscovered doc + memory bodies by following
  cross-body hrefs)
- Keystone E2E: PASS; `moderate-benefit` band

**This result is at L tier (44 MB). XL three-body has not been run and is deferred.**

### 3e. Fold catches real grounding failures [SHARE]

`apparatus-criticus` [sealed]: 0/40 waves-through vs human/translator-validated gold
(95% upper bound 8.8%). The fold caught 8/206 attested-citation failures, including one
hallucinated id. Writer survivability: 0.9944.

### 3f. Known limitation: training-data override risk

`tracer-drift-defense` [sealed, 81 cells]: on a stale-summary fixture, 2/6 cells
silently corrected to the training-data value — the model trusted its prior over the
document. An inheriting agent's memory is not authoritative if its training data conflicts.
This is a known limitation of memory-as-doc, not a hidden failure.

---

## 4. Integrity — read and verify with no server, no JavaScript

**The verify path is pure arithmetic, not self-defending automation.** [SHARE (QUALIFIED)]

The read path (find a section by id, read its bytes) is a browser primitive. The verify
path (re-derive the SHA-256 witness) is pure arithmetic runnable in any language. The
`browser-verifier` probe demonstrates a pure-JS SHA-256 that reproduces the NIST `"abc"`
vector and real witnesses byte-exact; a 28-check gate discriminates one-byte tamper,
vacuous pass, duplicate-id forgery, and 6 parser-differential fixtures, all fail-closed.
No `crypto.subtle`, no platform API. One scope caveat from that probe: a `file://` page is
restricted by browser policy from fetching its own bytes, so an in-browser verifier reads the
section content the reader supplies (or a served copy) rather than self-reading the file off
disk; the arithmetic is unaffected, but the read path it operates on is not the file:// page
reading itself.

**However:** `tracer-drift-defense` [sealed]: models spontaneously verified hashes 0/27
(0%). When prompted, 59% were accurate. Only with a deterministic helper script did they
reach 27/27 (100%). Integrity is a documentary property, not a spontaneous model behavior.
Describe it as **"verifiable with the included checker,"** not self-defending.

**Append/fold motion proven [SHARE]:** `fold-test` F0–F7 15/15 green; append-only,
monotonic timestamps, and atomic write all proven without external compute. `live-loop-chat`
proved a two-epoch cycle and the verify-before-append 409 gate, and re-derived
`genesis-1-1 75e7f666…`. Note: `live-loop-chat` ran against a stub; a real model was
never called in that loop (see Section 5).

---

## 5. What is not yet demonstrated

These claims were either not tested or were tested and refuted. They are not part of this
publication.

**Chat long-context savings — architected, unmeasured.** The claim that long chats stay
cheap because you send only manifest + recent turns is architecturally motivated but
`live-loop-chat` ran stub-only; a real model was never called end-to-end. No
token-per-turn measurement over a growing transcript exists. Do not present this as
demonstrated.

**Manifest scales arbitrarily — false.** `doc-html-as-memory` [sealed]: at 619 sections,
a flat thin-mirror manifest hit 74k tokens against a 12k budget — 6x over, failed at
staging. Flat manifests are navigable but slow at XL (209 s/turn worst case). A
hierarchical manifest was subsequently designed and measured across two sealed runs
(`bounded-return`; artifacts on the lab `dev` branch). **Run-01 (seal-05)** supplied the
deterministic existence proof: in the scripted (D4) leg the hierarchy held a flat working
surface — peak ~2,612 tokens across 64× document growth, cumulative ~7.9k, 72/72 recall —
and an oracle navigated it perfectly (72/72); but naive live selection failed the
pre-registered 0.80 floor (0.361, failing closed: refusals, zero fabrications), and the
run's context envelope was left undischarged. **Run-02** discharged that debt: a
multi-round envelope sealed *before* any subject call was met at every tier across 1,344
live cells (peaks 4,343–5,715, all under caps) — while its own pre-registered completion
gate failed (85.98% vs 90%, driven by absent-class tasks exhausting a zero-slack route
cap) and live selection improved but still missed the floor (0.50 vs 0.80, zero wrong
answers: every miss a refusal or budget exhaustion). Net, in both records' own words:
the capacity walls hold and the structure bounds the working surface; deep *live*
selection is the open research problem — and it fails conservatively, declining rather
than fabricating.

**Cross-reader convergence — base fixtures only; the formal trial is not yet run.** An
initial convergence *has* been observed — `reader-convergence` [sealed, pre-registered]: a
reader written blind from this specification alone (a PowerShell stranger-proxy) agrees
byte-for-byte with the reference Python / Node readers on the clean, corrupted, and CRLF
**base fixtures**. But this is short of the full "independently implementable" proof on two
counts: the reader's independence was instruction-enforced / self-attested (a stranger-proxy,
not a true stranger), and the **formal** convergence trial against a shared, language-neutral
vector set (charter P3.2/P3.3) — the extended battery of nested boundaries, comment masking,
and raw-text / multibyte edges — was never run; those conformance vectors do not yet exist.
Substantiated on the base fixtures, not yet complete.

**The crossover threshold — unmeasured.** At what document size and harness configuration
does selective hydration beat naive in-context loading? At ≤1 MB on some harnesses, naive
wins on tokens. At L+ selective wins decisively. The breakeven is unmeasured. Tracer #5
(sizing-threshold) was planned and not run.

---

## 6. The RAG comparison: recall up, tokens down is wrong

`tracer-rag-comparison` [sealed, 7.8 MB, 86+6 cells]:

Selective hydration spent **20–50x MORE tokens than vanilla vector RAG** (skill arm
421k–969k effective tokens vs RAG-k8 19k–21k effective tokens).

Selective hydration **did win on evidence recall**: 0.875 vs 0.25 for RAG.

The honest frame: doc.html **trades tokens for recall + no external index.** It is not
token-cheaper than RAG. "Cheaper than RAG" is refuted and must not be claimed.

Additionally: `tracer-rag-comparison` auto-summary diagnostics confirmed that hand-authored
manifest summaries do substantial work for token efficiency. Structure carries quality, but
the efficiency win is not attributable to raw HTML structure alone; authored summaries are
load-bearing.

---

## 7. Provenance and how to reproduce

Every headline number in this document traces to a sealed probe receipt or SUMMARY file.
Figures were re-read from those receipts in the 2026-06-14 fan-out pass; they were **not
re-executed** in that pass. Verify any headline against its cited file before using it in
further publications.

| Claim / number | Sealed receipt / directory |
|---|---|
| −52.9% eff-tokens, +1.19 quality, 0 failures (v0.2 baseline) | v0.2 baseline run sealed receipt (internal) |
| 74 MB / 17,627 sections / zero body hydration / −680,018 median tokens | `tracer-memory-at-scale` (#4-5) [sealed, 184 cells] |
| −52.9% → −16.9% savings vs document size | `tracer-torah-scaleup` (#2a) [sealed, 120 cells] |
| Precision 1.00/0.98; format teaches w/ no prompt (80% citation) | `tracer-pi-cross-harness` (#3a-d) [sealed, 178 cells] |
| HTML-alone 1.000 vs naive 0.955; 100% unprompted structure reach | `tracer-11` [graded, 33 cells] |
| −53.7%/−81.8% bytes loaded but +60.3% tokens at 3 KB (floor inversion) | `tracer-11/runs/*/summary.csv` [claude-sdk, n=17/arm error-free] |
| 0% spontaneous verify / 100% w/ script | `tracer-drift-defense` (#6) [sealed, 81 cells] |
| Better recall (0.875 vs 0.25) / 20–50x more tokens vs RAG | `tracer-rag-comparison` (#9) [sealed, 86+6 cells] |
| 74k-token manifest overflow at 619 sections | `doc-html-as-memory` (#10) [sealed, 18 cells] |
| Proof-of-read 120/120 / self-cite 240/240 / navigation 480/480 | `apparatus-memori` [sealed, pre-registered, 480 turns] |
| 28-check gate; NIST abc vector; byte-exact witness | `browser-verifier` [sealed] |
| F0–F7 15/15 append-only proven | `fold-test` [sealed, mechanical] |
| Three-body E2E PASS at L tier (44 MB) | `trinity-discipline` [sealed, blind, L tier] |
| 0/40 waves-through; 8/206 failures caught; survivability 0.9944 | `apparatus-criticus` [sealed] |

**Corpus availability:** The ~72 MB XL three-body corpus is gitignored
and not shipped with the repository. Probe scripts and format-spec are version-controlled;
the large corpora are not.

**Reproducibility note:** Mechanical probes (fold-test, browser-verifier) are fully
re-runnable from the probe scripts. Graded LLM probes (apparatus-memori, tracer-pi-cross-
harness, etc.) require API keys and will produce statistically similar but not
bit-identical results on a fresh run due to model sampling. Sealed grades in the receipts
are the reference.
