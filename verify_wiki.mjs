#!/usr/bin/env node
// verify_wiki.mjs — wiki-layer verifier for the doc.html wiki shape (doc-pin v1).
//
// Independent implementation of the same check as verify_wiki.py:
//
//   doc_pin = sha256( leaf manifest data-witness values, manifest order,
//                      joined by one ASCII colon )   // lowercase hex
//
// Architecture — the wiki layer owns ONLY the genuinely new cross-document
// operation; document acceptance is DELEGATED to the shipped Core reader
// (verify.mjs), never re-implemented. A wiki-layer tool that copies pieces
// of reader law inevitably lags a clause (this draft's first cut lagged
// V29 — caught in council review); the shipped reader is the one document
// judge.
//
// WHAT THIS TOOL CLAIMS — and what it does not. It verifies the shelf AS
// SERIALIZED. It certifies three things and no more: that carrier-shaped
// entries occur in the root's source bytes, that each named leaf verifies
// under the shipped Core reader, and that each recomputed doc-pin equals
// the entry's claim. It does NOT check whether an HTML reader presents
// those carriers as live links. Shelf discovery here is a scan over
// serialized bytes, and HTML's own tokenizer can disagree with it — custom
// elements, non-local raw-text openers, anchor-shaped text sitting inside a
// quoted attribute value. So a passing run EMITS the exact list it checked,
// href and full pin, one line per certified entry; the consumer compares
// that emitted list against the shelf the page actually renders. That
// comparison is the final step of the check, and it belongs to the reader.
//
// The masking of comments and of five raw-text/inert containers below is
// discovery HYGIENE, not a browser model, and is disclosed as incomplete.
// Whether an HTML reader presents these carriers as live links is outside
// this companion's claim. No additional document grammar is specified here.
//
// Checks per run:
//   R0 core-reader   : the resolved Core reader path is printed, so the
//                      receipt names the authority that judged
//   R0 reader-file-sha256 : the SHA-256 of the file at the resolved reader
//                      path, sampled once before the first invocation — file
//                      stability during the run is not checked. Printed as a
//                      fact for comparison against the published seals. Not
//                      an authenticity proof: a receipt cannot authenticate
//                      itself — whoever could swap the reader could edit this
//                      tool; the recursion ends outside, at the published
//                      digest
//   R1 root-verifies : the root PASSes the shipped Core reader (delegated)
//   R2 base-neutral  : the root carries no <base href> — refused, fail closed
//   E0 shelf-grammar : every shelf href must fit the portable shelf-link
//                      grammar ('/'-joined [A-Za-z0-9._-] segments, no
//                      dot-segments) — deliberately narrower than HTML URL
//                      semantics: character references, percent-escapes,
//                      queries, fragments, and backslashes could all make
//                      the verifier and a URL consumer resolve different
//                      files, so they are refused, never decoded (fail
//                      closed). Refusal, not protection.
//   E1 leaf-exists   : every data-doc-pin href resolves to a real file, and
//                      every path segment matches a real directory entry
//                      with BYTE-EXACT spelling — checked against
//                      readdirSync, not the OS's own resolution, so a
//                      case-insensitive filesystem cannot certify a root
//                      that a case-sensitive host would serve broken
//   E2 leaf-verifies : the leaf PASSes the shipped Core reader (delegated)
//   E3 pin-matches  : recomputed doc-pin equals the entry's claim
//   emission        : on a clean run, the VERIFIED SHELF block lists the
//                      exact (href, pin) pairs certified, so the claim can
//                      be compared with the presented page
//
// The tokenizer below (Core's parseTagAttrs, verbatim) is used ONLY to
// extract shelf entries and manifest witness values — extraction, not
// judgment. The §6.4 law (V24/V25) is still enforced on shelf entries
// carrying data-doc-pin, because Core has no shelf concept.
//
// Locating the Core reader: an explicit --core <path> BINDS — that exact
// path is used, or the run is refused; DOC_HTML_CORE_READER binds the same
// way. Only when neither names a reader do the fallbacks apply: verify.mjs
// beside this file, else verify.mjs in the working directory. None found ->
// refuse to run (fail closed). A named-but-missing reader is never silently
// substituted.
//
// Usage:
//   node verify_wiki.mjs <root wiki.doc.html> [--core <verify.mjs>]
//   node verify_wiki.mjs --selftest [--core <verify.mjs>]
//
// Exit 0 PASS, 1 FAIL. Node built-ins only.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync, renameSync, readdirSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sha256 = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;

// Portable shelf-link grammar — the only href shape the wiki layer will
// certify. One or more '/'-joined segments, each [A-Za-z0-9._-]+ and not
// entirely dots. Everything outside this (character references '&',
// percent-escapes '%', queries '?', fragments '#', backslashes, empty or
// dot-only segments, leading/trailing '/') is refused, never decoded — a
// refusal, not a protection: the grammar narrows what the tool will certify
// to shapes whose resolution is unambiguous, and anything else is a FAIL.
const SHELF_SEGMENT = /^[A-Za-z0-9._-]+$/;
function shelfHrefConforms(href) {
  if (!href) return false;
  for (const seg of href.split('/')) {
    if (!SHELF_SEGMENT.test(seg)) return false;
    if (/^\.+$/.test(seg)) return false; // '.' / '..' / any all-dots segment
  }
  return true;
}

// Walk the href's segments against real directory entries, requiring
// BYTE-EXACT spelling at every level.
//
// existsSync() asks the OS, and on a case-insensitive filesystem (Windows,
// default macOS) the OS happily opens 'A.DOC.HTML' when the directory holds
// 'a.doc.html'. A PASS produced there would certify a root that a
// case-sensitive host serves broken. So the spelling is checked against
// readdirSync, level by level, and never against the OS's own resolution.
// Returns { ok, path, detail }; detail names the actual directory spelling
// when one differs only by case.
function exactCaseResolve(base, href) {
  let cur = base;
  for (const seg of href.split('/')) {
    let names;
    try {
      names = readdirSync(cur);
    } catch (e) {
      return { ok: false, path: null, detail: `directory not readable: ${cur} (${e.code || e.message})` };
    }
    if (!names.includes(seg)) {
      const near = names.filter((n) => n.toLowerCase() === seg.toLowerCase()).sort();
      if (near.length) {
        return { ok: false, path: null,
          detail: `path segment '${seg}' is not spelled that way on disk — the directory spells it `
            + `'${near[0]}'; refused (a case-insensitive filesystem must not certify a root a `
            + 'case-sensitive host would serve broken)' };
      }
      return { ok: false, path: null, detail: `no directory entry spelled '${seg}'` };
    }
    cur = join(cur, seg);
  }
  return { ok: true, path: cur, detail: '' };
}

// ─── Inert regions: comments + raw-text/inert container content ──────────────
// script/style are raw-text; textarea/title are raw-text/RCDATA; template is
// inert. Discovery HYGIENE, disclosed as incomplete: masking these five names
// keeps the commonest inert text out of the carrier scan, but it is not HTML's
// tokenizer and does not make the scan browser-equivalent. What the run
// certifies is the serialized shelf; the emitted VERIFIED SHELF block is how a
// consumer compares that against the shelf a reader presents.
function inertMasks(html) {
  const spans = [];
  const commentRe = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = commentRe.exec(html)) !== null) spans.push([m.index, m.index + m[0].length]);
  const blanked = html.replace(commentRe, (c) => ' '.repeat(c.length));
  const rawRe = /<(script|style|textarea|title|template)\b[^>]*>[\s\S]*?<\/\1>/gi;
  while ((m = rawRe.exec(blanked)) !== null) {
    const openEnd = blanked.indexOf('>', m.index) + 1;
    const closeStart = m.index + m[0].length - (`</${m[1]}>`).length;
    if (openEnd < closeStart) spans.push([openEnd, closeStart]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  return spans;
}
const masked = (pos, masks) => {
  for (const [s, e] of masks) {
    if (s <= pos && pos < e) return true;
    if (s > pos) break;
  }
  return false;
};

// ─── Attribute tokenizer (Core's parseTagAttrs, verbatim) — extraction only ──
function attrs(tagInner) {
  const out = {};
  const n = tagInner.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(tagInner[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && !/\s/.test(tagInner[i]) && tagInner[i] !== '=' && tagInner[i] !== '"' && tagInner[i] !== "'") i++;
    if (i === nameStart) { i++; continue; }
    const name = tagInner.slice(nameStart, i).toLowerCase();
    let j = i;
    while (j < n && /\s/.test(tagInner[j])) j++;
    if (j < n && tagInner[j] === '=') {
      j++;
      while (j < n && /\s/.test(tagInner[j])) j++;
      if (j < n && (tagInner[j] === '"' || tagInner[j] === "'")) {
        const quote = tagInner[j];
        j++;
        const valStart = j;
        while (j < n && tagInner[j] !== quote) j++;
        out[name] = tagInner.slice(valStart, j);
        if (j < n) j++;
      } else {
        const valStart = j;
        while (j < n && !/\s/.test(tagInner[j])) j++;
        out[name] = tagInner.slice(valStart, j);
      }
      i = j;
    } else {
      out[name] = null;
      i = j;
    }
  }
  return out;
}

// ─── §6.4 refusal (V24/V25) — shelf entries only; Core owns unit tags ────────
class NonCanonical extends Error {}

function refuseNonCanonicalAttrs(tagInner, context) {
  const seen = new Set();
  const n = tagInner.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(tagInner[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && !/\s/.test(tagInner[i]) && tagInner[i] !== '=' && tagInner[i] !== '"' && tagInner[i] !== "'") i++;
    if (i === nameStart) { i++; continue; }
    const name = tagInner.slice(nameStart, i).toLowerCase();
    if (seen.has(name)) {
      throw new NonCanonical(`duplicate attribute name '${name}' on ${context} (V25)`);
    }
    seen.add(name);
    let j = i;
    while (j < n && /\s/.test(tagInner[j])) j++;
    if (j < n && tagInner[j] === '=') {
      j++;
      while (j < n && /\s/.test(tagInner[j])) j++;
      if (j < n && tagInner[j] === '"') {
        j++;
        while (j < n && tagInner[j] !== '"') j++;
        if (j < n) j++;
      } else {
        const form = j < n && tagInner[j] === "'" ? 'single-quoted' : 'unquoted';
        throw new NonCanonical(`${form} value for attribute '${name}' on ${context} (V24)`);
      }
      i = j;
    } else {
      i = j; // valueless attribute — V24 governs valued attributes only
    }
  }
}

// ─── Extraction: manifest witnesses, <base> detection ────────────────────────
function manifestWitnesses(html, masks) {
  const navRe = /<nav\b([^>]*)>/gi;
  let m;
  while ((m = navRe.exec(html)) !== null) {
    if (masked(m.index, masks)) continue;
    if (attrs(m[1]).id !== 'manifest') continue;
    const navEnd = html.indexOf('</nav>', m.index + m[0].length);
    if (navEnd < 0) return null;
    const navInner = html.slice(m.index + m[0].length, navEnd);
    const ws = [];
    const aRe = /<a\b([^>]*)>/gi;
    let am;
    while ((am = aRe.exec(navInner)) !== null) {
      const a = attrs(am[1]);
      const href = a.href ?? '';
      const dw = a['data-witness'];
      if (href.startsWith('#') && dw) ws.push(dw);
    }
    return ws;
  }
  return null;
}

function hasBaseHref(html, masks) {
  const baseRe = /<base\b([^>]*)>/gi;
  let m;
  while ((m = baseRe.exec(html)) !== null) {
    if (masked(m.index, masks)) continue;
    if ('href' in attrs(m[1])) return true;
  }
  return false;
}

// ─── Delegated document acceptance: the shipped Core reader ──────────────────
// An explicit --core path BINDS: it is used exactly or the run is refused.
// DOC_HTML_CORE_READER binds the same way. Only when neither names a reader
// do the fallbacks apply. A named-but-missing reader is never silently
// substituted — the receipt must name the authority that actually judged.
function findCoreReader(explicit) {
  const here = dirname(fileURLToPath(import.meta.url));
  const bind = (p, who) => {
    const c = resolve(p);
    if (existsSync(c) && statSync(c).isFile()) return c;
    throw new Error(`${who} names a Core reader that does not exist: ${c} — `
      + 'refused; a named reader is never silently substituted');
  };
  if (explicit) return bind(explicit, '--core');
  if (process.env.DOC_HTML_CORE_READER) return bind(process.env.DOC_HTML_CORE_READER, 'DOC_HTML_CORE_READER');
  for (const c of [join(here, 'verify.mjs'), resolve('verify.mjs')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  throw new Error('no shipped Core reader (verify.mjs) found — pass --core <path> or set '
    + 'DOC_HTML_CORE_READER; the wiki layer refuses to judge documents itself');
}

// Returns { verdict, tail }: verdict 'pass' (Core exited 0), 'refused'
// (Core executed and printed a refusal), or 'error' (Core could not
// execute). Refusal and execution failure are different evidence; both
// fail closed.
function coreAccepts(core, doc) {
  const r = spawnSync(process.execPath, [core, doc], { encoding: 'utf8' });
  if (r.error || r.status === null) {
    return { verdict: 'error', tail: [String(r.error || 'spawn failed')] };
  }
  if (r.status === 0) return { verdict: 'pass', tail: [] };
  const outLines = (r.stdout || '').trim().split('\n').filter(Boolean);
  if (outLines.length) return { verdict: 'refused', tail: outLines.slice(-3) };
  const errLines = (r.stderr || '').trim().split('\n').filter(Boolean);
  return { verdict: 'error', tail: errLines.slice(-3) };
}

// ─── The doc-pin (v1) ───────────────────────────────────────────────────────
const docPin = (witnesses) => createHash('sha256').update(witnesses.join(':'), 'ascii').digest('hex');

// ─── Wiki walk ───────────────────────────────────────────────────────────────
function verifyWiki(rootPath, core, out = console.log) {
  const html = readFileSync(rootPath, 'utf8');
  const masks = inertMasks(html);
  let failures = 0;

  out(`R0 core-reader        : ${core}`);
  out('R0 reader-file-sha256 : '
      + createHash('sha256').update(readFileSync(core)).digest('hex')
      + '  (digest sampled from the resolved reader path before invocation;'
      + ' file stability during the run not checked)');
  const root = coreAccepts(core, rootPath);
  const rootNote = { pass: 'Core reader verdict', refused: 'Core reader refused', error: 'Core reader could not execute' }[root.verdict];
  out(`R1 root-verifies      : ${root.verdict === 'pass' ? 'PASS' : 'FAIL'}  (${basename(rootPath)}, ${rootNote})`);
  if (root.verdict !== 'pass') {
    for (const l of root.tail) out('   core: ' + l);
    failures += 1;
  }

  if (hasBaseHref(html, masks)) {
    out("R2 base-neutral       : FAIL  root carries <base href> — shelf hrefs no longer resolve "
      + "against the root's own location; the pin and the browser-facing link could name "
      + 'different files. Refused (fail closed).');
    out('');
    out('WIKI: FAIL (base-resolution refusal)');
    return 1;
  }
  out('R2 base-neutral       : PASS  (no <base href>)');

  const entries = [];
  const aRe = /<a\b([^>]*)>/gi;
  let am;
  while ((am = aRe.exec(html)) !== null) {
    if (masked(am.index, masks)) continue;
    const a = attrs(am[1]);
    if (!('data-doc-pin' in a)) continue;
    try {
      refuseNonCanonicalAttrs(am[1], 'a shelf entry (data-doc-pin)');
    } catch (e) {
      if (!(e instanceof NonCanonical)) throw e;
      out(`E0 shelf              : FAIL  NON-CANONICAL — ${e.message}`);
      failures += 1;
      continue;
    }
    entries.push({ href: a.href ?? '', pin: a['data-doc-pin'] });
  }
  if (entries.length === 0 && failures === 0) {
    out('E0 shelf              : FAIL  (no data-doc-pin entries found)');
    return 1;
  }
  out(`E0 shelf              : ${entries.length} doc-pin entr${entries.length === 1 ? 'y' : 'ies'}`);

  const certified = [];
  for (const { href, pin } of entries) {
    const label = href || '(no href)';
    if (!shelfHrefConforms(href)) {
      out(`E0 shelf              : FAIL  ${label} (href outside the portable shelf-link grammar — character references, percent-escapes, queries, fragments, and dot-segments are refused, fail closed)`);
      failures += 1; continue;
    }
    if (pin === null || !HEX64.test(pin)) {
      out(`E0 shelf              : FAIL  ${label} (data-doc-pin is not 64-hex)`);
      failures += 1; continue;
    }
    const walked = exactCaseResolve(dirname(rootPath), href);
    if (!walked.ok) {
      out(`E1 leaf-exists        : FAIL  ${label} (${walked.detail})`);
      failures += 1; continue;
    }
    const leaf = resolve(walked.path);
    if (!existsSync(leaf) || !statSync(leaf).isFile()) {
      out(`E1 leaf-exists        : FAIL  ${label} (file not found)`);
      failures += 1; continue;
    }
    const res = coreAccepts(core, leaf);
    if (res.verdict !== 'pass') {
      for (const l of res.tail) out('   core: ' + l);
      const leafNote = res.verdict === 'refused' ? 'Core reader refused' : 'Core reader could not execute';
      out(`E2 leaf-verifies      : FAIL  ${label} (${leafNote})`);
      failures += 1; continue;
    }
    const leafHtml = readFileSync(leaf, 'utf8');
    const ws = manifestWitnesses(leafHtml, inertMasks(leafHtml));
    if (!ws || ws.length === 0) {
      out(`E2 leaf-verifies      : FAIL  ${label} (no manifest witnesses to pin)`);
      failures += 1; continue;
    }
    const actual = docPin(ws);
    if (actual !== pin) {
      out(`E3 pin-matches        : FAIL  ${label} claimed=${pin.slice(0, 12)}… recomputed=${actual.slice(0, 12)}…`);
      failures += 1;
    } else {
      out(`E1-E3                 : PASS  ${label} (${ws.length} sections, pin ${actual.slice(0, 12)}…)`);
      certified.push([href, actual]);
    }
  }

  out('');
  if (failures) { out(`WIKI: FAIL (${failures} failing check(s))`); return 1; }
  // See-what-is-signed: the certificate hands back the object it verified,
  // in full, so the reader can compare it with the page they actually read.
  out('VERIFIED SHELF (what this run actually checked - compare it with the page you read):');
  for (const [href, pin] of certified) out(`  ${href}  ${pin}`);
  out('NOT CHECKED: whether an HTML reader presents these carriers as live links.');
  out(`WIKI: PASS (${certified.length} serialized shelf carrier(s) verified; documents judged by the shipped Core reader; presentation not checked)`);
  return 0;
}

// ─── Selftest: prove each tooth on built, CORE-CONFORMANT fixtures ───────────
function mkLeaf(dir, name, secs, { decoyTrueDigest = false, dupWitness = false, extraUnlisted = null } = {}) {
  const ws = [];
  const nav = [];
  const body = [];
  for (const [sid, text] of secs) {
    const inner = `<p>${text}</p>`;
    const trueW = sha256(inner);
    const cc = Array.from(inner).length;
    let w;
    let carrier;
    if (decoyTrueDigest) {
      w = '0'.repeat(64);
      carrier = `data-witness="${w}" x:data-witness="${trueW}"`;
    } else if (dupWitness) {
      w = '0'.repeat(64);
      carrier = `data-witness="${w}" data-witness="${trueW}"`;
    } else {
      w = trueW;
      carrier = `data-witness="${w}"`;
    }
    ws.push(w);
    nav.push(`<a href="#${sid}" ${carrier} data-char-count="${cc}">${sid}</a>`);
    body.push(`<section id="${sid}" ${carrier} data-char-count="${cc}">${inner}</section>`);
  }
  if (extraUnlisted) {
    const [sid, text] = extraUnlisted;
    const inner = `<p>${text}</p>`;
    const w = sha256(inner);
    body.push(`<section id="${sid}" data-witness="${w}" data-char-count="${Array.from(inner).length}">${inner}</section>`);
  }
  const doc = '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>doc.html</title></head>\n<body>\n'
    + '<nav id="manifest">\n' + nav.join('\n') + '\n</nav>\n' + body.join('\n') + '\n</body></html>\n';
  writeFileSync(join(dir, name), doc, 'utf8');
  return ws;
}
function mkRoot(dir, entries, rawEntries = [], baseHref = null) {
  const lines = entries.map(([h, f]) => `<a href="${h}" data-doc-pin="${f}">${h}</a>`).concat(rawEntries);
  const inner = '<h2>shelf</h2>\n' + lines.join('\n') + '\n';
  const w = sha256(inner);
  const cc = Array.from(inner).length;
  const base = baseHref ? `<base href="${baseHref}">` : '';
  const doc = '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' + base + '<title>doc.html</title></head>\n<body>\n'
    + `<nav id="manifest">\n<a href="#shelf" data-witness="${w}" data-char-count="${cc}">shelf</a>\n</nav>\n`
    + `<section id="shelf" data-witness="${w}" data-char-count="${cc}">${inner}</section>\n</body></html>\n`;
  writeFileSync(join(dir, 'wiki.doc.html'), doc, 'utf8');
}

function selftest(core) {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-selftest-'));
  const checks = [];
  const run = (root) => {
    const lines = [];
    const code = verifyWiki(root, core, (l) => lines.push(l));
    return { code, out: lines.join('\n') };
  };
  try {
    const wsA = mkLeaf(dir, 'a.doc.html', [['a1', 'alpha'], ['a2', 'beta']]);
    const wsB = mkLeaf(dir, 'b.doc.html', [['b1', 'gamma']]);
    mkRoot(dir, [['a.doc.html', docPin(wsA)], ['b.doc.html', docPin(wsB)]]);
    const root = join(dir, 'wiki.doc.html');

    let r = run(root);
    checks.push(['T1 clean wiki PASSes', r.code === 0 && r.out.includes('WIKI: PASS')]);

    const orig = readFileSync(join(dir, 'a.doc.html'), 'utf8');
    writeFileSync(join(dir, 'a.doc.html'), orig.replace('alpha', 'ALPHA'), 'utf8');
    r = run(root);
    checks.push(['T2 tampered leaf section FAILs (Core refusal)',
      r.code === 1 && r.out.includes('E2 leaf-verifies      : FAIL')]);
    writeFileSync(join(dir, 'a.doc.html'), orig, 'utf8');

    mkLeaf(dir, 'a.doc.html', [['a1', 'alpha FORGED'], ['a2', 'beta']]);
    r = run(root);
    checks.push(['T3 re-witnessed leaf FAILs at the pin',
      r.code === 1 && r.out.includes('E3 pin-matches        : FAIL')]);
    writeFileSync(join(dir, 'a.doc.html'), orig, 'utf8');

    renameSync(join(dir, 'b.doc.html'), join(dir, 'b.doc.html.gone'));
    r = run(root);
    checks.push(['T4 missing leaf FAILs', r.code === 1 && r.out.includes('E1 leaf-exists        : FAIL')]);
    renameSync(join(dir, 'b.doc.html.gone'), join(dir, 'b.doc.html'));

    const rootBytes = readFileSync(root, 'utf8');
    mkRoot(dir, [['a.doc.html', '0'.repeat(64)], ['b.doc.html', docPin(wsB)]]);
    r = run(root);
    checks.push(['T5 forged pin attribute FAILs', r.code === 1 && r.out.includes('E3 pin-matches        : FAIL')]);
    writeFileSync(root, rootBytes, 'utf8');

    // T7 attr-restart forgery on the WITNESS carrier -> Core refuses -> E2 FAIL
    const trueA = [sha256('<p>alpha</p>'), sha256('<p>beta</p>')];
    mkLeaf(dir, 'a.doc.html', [['a1', 'alpha'], ['a2', 'beta']], { decoyTrueDigest: true });
    mkRoot(dir, [['a.doc.html', docPin(trueA)], ['b.doc.html', docPin(wsB)]]);
    r = run(root);
    checks.push(['T7 attr-restart forgery (x:data-witness decoy) FAILs',
      r.code === 1 && r.out.includes('E2 leaf-verifies      : FAIL')]);
    writeFileSync(join(dir, 'a.doc.html'), orig, 'utf8');
    writeFileSync(root, rootBytes, 'utf8');

    // T8 attr-restart forgery on the FOLD carrier (wiki layer's own surface) -> E3 FAIL
    mkRoot(dir, [['b.doc.html', docPin(wsB)]],
      [`<a href="a.doc.html" data-doc-pin="${'0'.repeat(64)}" x:data-doc-pin="${docPin(wsA)}">a</a>`]);
    r = run(root);
    checks.push(['T8 attr-restart forgery (x:data-doc-pin decoy) FAILs',
      r.code === 1 && r.out.includes('E3 pin-matches        : FAIL')]);
    writeFileSync(root, rootBytes, 'utf8');

    // T9 duplicated data-witness attribute -> Core refuses (V25) -> E2 FAIL
    mkLeaf(dir, 'a.doc.html', [['a1', 'alpha'], ['a2', 'beta']], { dupWitness: true });
    r = run(root);
    checks.push(['T9 duplicate carrier attribute FAILs (V25 via Core)',
      r.code === 1 && r.out.includes('E2 leaf-verifies      : FAIL')]);
    writeFileSync(join(dir, 'a.doc.html'), orig, 'utf8');

    // T10 root with <base href> -> refused, fail closed
    mkRoot(dir, [['a.doc.html', docPin(wsA)], ['b.doc.html', docPin(wsB)]], [], 'other/');
    r = run(root);
    checks.push(['T10 <base href> on the root is refused (fail closed)',
      r.code === 1 && r.out.includes('R2 base-neutral       : FAIL')]);
    writeFileSync(root, rootBytes, 'utf8');

    // T11 valid witnessed section absent from the manifest -> Core refuses (V29) -> E2 FAIL
    mkLeaf(dir, 'a.doc.html', [['a1', 'alpha'], ['a2', 'beta']], { extraUnlisted: ['smuggled', 'not in the manifest'] });
    r = run(root);
    checks.push(['T11 unlisted witnessed section FAILs (V29 via Core)',
      r.code === 1 && r.out.includes('E2 leaf-verifies      : FAIL')]);
    writeFileSync(join(dir, 'a.doc.html'), orig, 'utf8');

    // T12 an explicit --core naming a missing file refuses — the named
    // reader is never silently substituted by a fallback
    let t12 = false;
    try { findCoreReader(join(dir, 'no-such-verify.mjs')); } catch { t12 = true; }
    checks.push(['T12 missing --core reader refuses (no fallthrough)', t12]);

    // T13 DOC_HTML_CORE_READER naming a missing file refuses likewise
    const prev = process.env.DOC_HTML_CORE_READER;
    process.env.DOC_HTML_CORE_READER = join(dir, 'no-such-verify.mjs');
    let t13 = false;
    try { findCoreReader(null); } catch { t13 = true; }
    if (prev === undefined) delete process.env.DOC_HTML_CORE_READER;
    else process.env.DOC_HTML_CORE_READER = prev;
    checks.push(['T13 missing env-named reader refuses (no fallthrough)', t13]);

    // T14 entity-bearing href — the verifier would resolve a&amp;b.doc.html
    // literally while a browser decodes it to a&b.doc.html; refused by the
    // portable shelf-link grammar, never decoded (fail closed)
    mkRoot(dir, [['b.doc.html', docPin(wsB)]],
      [`<a href="a&amp;b.doc.html" data-doc-pin="${docPin(wsA)}">x</a>`]);
    r = run(root);
    checks.push(['T14 entity-bearing href is refused (grammar, fail closed)',
      r.code === 1 && r.out.includes('E0 shelf              : FAIL  a&amp;b.doc.html '
        + '(href outside the portable shelf-link grammar')]);
    writeFileSync(root, rootBytes, 'utf8');

    // T15 shelf entry inside <textarea> — raw text in a browser, not a
    // live link; masked out of discovery, so the root presents no shelf
    mkRoot(dir, [],
      [`<textarea><a href="a.doc.html" data-doc-pin="${docPin(wsA)}">x</a></textarea>`]);
    r = run(root);
    checks.push(['T15 entry inside <textarea> is not a shelf surface',
      r.code === 1 && r.out.includes('no data-doc-pin entries found')]);
    writeFileSync(root, rootBytes, 'utf8');

    // T16 percent-encoded href — a%62.doc.html is a.doc.html to a URL
    // consumer; refused by the grammar, never decoded
    mkRoot(dir, [['b.doc.html', docPin(wsB)]],
      [`<a href="a%62.doc.html" data-doc-pin="${docPin(wsA)}">x</a>`]);
    r = run(root);
    checks.push(['T16 percent-encoded href is refused (grammar, fail closed)',
      r.code === 1 && r.out.includes('E0 shelf              : FAIL  a%62.doc.html '
        + '(href outside the portable shelf-link grammar')]);
    writeFileSync(root, rootBytes, 'utf8');

    // T17 query and fragment hrefs — both name the same file with extra
    // URL machinery the grammar refuses
    mkRoot(dir, [['b.doc.html', docPin(wsB)]],
      [`<a href="a.doc.html?x=1" data-doc-pin="${docPin(wsA)}">x</a>`,
       `<a href="a.doc.html#frag" data-doc-pin="${docPin(wsA)}">x</a>`]);
    r = run(root);
    checks.push(['T17 query/fragment hrefs are refused (grammar, fail closed)',
      r.code === 1
        && r.out.includes('FAIL  a.doc.html?x=1 (href outside the portable')
        && r.out.includes('FAIL  a.doc.html#frag (href outside the portable')]);
    writeFileSync(root, rootBytes, 'utf8');

    // T18 dot-segment href — ../a.doc.html escapes the root's directory;
    // refused by the grammar (no dot-segments)
    mkRoot(dir, [['b.doc.html', docPin(wsB)]],
      [`<a href="../a.doc.html" data-doc-pin="${docPin(wsA)}">x</a>`]);
    r = run(root);
    checks.push(['T18 dot-segment href is refused (grammar, fail closed)',
      r.code === 1 && r.out.includes('FAIL  ../a.doc.html (href outside the portable')]);
    writeFileSync(root, rootBytes, 'utf8');

    // T19 exact-case — the leaf on disk is 'a.doc.html'; the shelf spells it
    // 'A.doc.html'. A case-insensitive filesystem would open it and certify a
    // root a case-sensitive host serves broken, so the segment spelling is
    // checked against the directory listing and refused.
    mkRoot(dir, [['A.doc.html', docPin(wsA)], ['b.doc.html', docPin(wsB)]]);
    r = run(root);
    checks.push(['T19 mis-cased href is refused (exact directory spelling)',
      r.code === 1
        && r.out.includes('E1 leaf-exists        : FAIL  A.doc.html')
        && r.out.includes("the directory spells it 'a.doc.html'")]);
    writeFileSync(root, rootBytes, 'utf8');

    // T20 emission-exact — a passing run hands back the object it verified:
    // every checked (href, full pin) pair, plus the boundary line, plus a
    // verdict that says what was actually checked.
    r = run(root);
    checks.push(['T20 passing run emits the VERIFIED SHELF it checked',
      r.code === 0
        && r.out.includes('VERIFIED SHELF (what this run actually checked - compare it with the page you read):')
        && r.out.includes(`  a.doc.html  ${docPin(wsA)}`)
        && r.out.includes(`  b.doc.html  ${docPin(wsB)}`)
        && r.out.includes('NOT CHECKED: whether an HTML reader presents these carriers as live links.')
        && r.out.includes('WIKI: PASS (2 serialized shelf carrier(s) verified')]);

    // T21 emission-omits-unchecked — an anchor-shaped decoy inside an HTML
    // comment is masked out of discovery, so it is never checked; the
    // emission must list only what was.
    mkRoot(dir, [['b.doc.html', docPin(wsB)]],
      [`<!-- <a href="a.doc.html" data-doc-pin="${docPin(wsA)}">decoy</a> -->`]);
    r = run(root);
    checks.push(['T21 emission lists only the entries actually checked',
      r.code === 0
        && r.out.includes('WIKI: PASS (1 serialized shelf carrier(s) verified')
        && r.out.includes(`  b.doc.html  ${docPin(wsB)}`)
        && !r.out.includes(docPin(wsA))
        && !r.out.split('VERIFIED SHELF')[1].includes('a.doc.html')]);
    writeFileSync(root, rootBytes, 'utf8');

    // T22 reader-digest — the receipt states the digest sampled from the
    // resolved reader path before invocation, recomputable against the
    // published seal (a fact the receipt states, not an authenticity it
    // can prove; file stability during the run is not checked).
    r = run(root);
    checks.push(['T22 receipt states the sampled reader-file sha256',
      r.code === 0
        && r.out.includes('R0 reader-file-sha256 : '
          + createHash('sha256').update(readFileSync(core)).digest('hex')
          + '  (digest sampled from the resolved reader path before invocation;'
          + ' file stability during the run not checked)')]);

    r = run(root);
    checks.push(['T6 restored wiki PASSes', r.code === 0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`core reader           : ${core}`);
  const ok = checks.every(([, p]) => p);
  for (const [name, p] of checks) console.log(`${p ? 'PASS' : 'FAIL'}  ${name}`);
  console.log('');
  console.log('SELFTEST: ' + (ok ? 'PASS' : 'FAIL'));
  return ok ? 0 : 1;
}

// ─── Entry point ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let explicitCore = null;
const ci = argv.indexOf('--core');
if (ci >= 0) {
  explicitCore = argv[ci + 1];
  argv.splice(ci, 2);
}
if (argv.length === 0) {
  console.error(`Usage: node ${basename(process.argv[1])} <root wiki.doc.html> | --selftest [--core <verify.mjs>]`);
  process.exit(1);
}
let corePath;
try {
  corePath = findCoreReader(explicitCore);
} catch (e) {
  console.error(`FAIL: ${e.message}`);
  process.exit(1);
}
process.exit(argv[0] === '--selftest' ? selftest(corePath) : verifyWiki(resolve(argv[0]), corePath));
