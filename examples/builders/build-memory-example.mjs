#!/usr/bin/env node
// build-memory-example.mjs — emits examples/memory.doc.html, a CONFORMANT
// doc.html v0.3 document serving as a MEMORY-AS-DOCUMENT exhibit: a fictional
// AI coding-assistant's project memory for the made-up "Lantern" service.
// Every section is witnessed by a SHA-256 over its raw inner bytes.
// Run from the repo root:  node examples/builders/build-memory-example.mjs
// Verify with:             node tools/verify.mjs examples/memory.doc.html

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This builder lives in examples/builders/; the exhibit it emits sits one level up.
const OUT = path.join(__dirname, "..", "memory.doc.html");

const esc = (s) => s
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const cc = (s) => Array.from(s).length;

// Each section's `inner` is emitted EXACTLY between the opening tag's > and
// </section> — no added newline — so the witness covers precisely these bytes.
const SECTIONS = [
  {
    id: "about",
    title: "About this memory document",
    summary: "How to use this file: read the manifest to find the section you need, fetch only that #id, verify its witness, and never load the whole file into context.",
    inner: `<h1>About this memory document</h1>
<p>This file is a <strong>memory-as-document</strong> exhibit — a worked example in the <code>doc.html</code> v0.3 format showing how an AI coding-assistant might store project knowledge as a witnessed, addressable document rather than a prose blob or a database.</p>
<p>It holds the fictional <strong>Lantern</strong> service's conventions, architecture decisions, preferences, and gotchas. Every fact is a <code>&lt;section&gt;</code> with a <code>data-witness</code> (SHA-256 over its raw inner bytes) and a <code>data-char-count</code>. A reader can verify any single section in isolation: fetch <code>#the-id</code>, recompute the hash over what sits between the opening tag's <code>&gt;</code> and <code>&lt;/section&gt;</code>, and compare.</p>
<p><strong>How to hydrate efficiently:</strong> read the manifest below to find the section you need, load only that anchor (<code>#id</code>), verify the witness, and inject it into your context. You do not need the whole file. This is the point.</p>
<p><strong>Supersession:</strong> this document follows append-and-supersede discipline. When a fact changes, the original section remains (permanently addressable) and a new section carries <code>data-supersedes="#old-id"</code>. Both are readable; the newer one is authoritative. See <code>#datastore</code> and <code>#datastore-revised</code> for a live example.</p>
<p>All content is obviously fictional and illustrative. No real service, person, or decision is described.</p>`,
  },
  {
    id: "project-overview",
    title: "Lantern service — what it is",
    summary: "Lantern is a fictional notification-dispatch service that fans out alerts to multiple channels (email, webhook, SMS) from a single internal API.",
    inner: `<h1>Lantern service — what it is</h1>
<p><strong>Lantern</strong> is a fictional internal notification-dispatch service. Callers POST a structured alert to <code>/dispatch</code>; Lantern fans it out to one or more channels (email via Postmark, webhook, SMS via Fictitious Telecom) and returns a receipt with per-channel delivery status.</p>
<p>It is a single Go binary deployed on two instances behind a load-balancer. There is no persistent HTTP session state; all state lives in the job queue and the delivery log.</p>
<ul>
<li><strong>Owner team:</strong> Platform Reliability (fictional)</li>
<li><strong>Primary consumers:</strong> billing-alerts service, incident-pager, and the weekly-digest cron</li>
<li><strong>SLA target:</strong> &lt;2 s end-to-end for email/webhook; SMS is best-effort with a 30 s ceiling</li>
<li><strong>Repo:</strong> <code>github.example/acme/lantern</code> (fictional)</li>
</ul>`,
  },
  {
    id: "conventions",
    title: "Code conventions",
    summary: "Naming, error-handling, and logging conventions agreed by the Lantern team as of the project's founding.",
    inner: `<h1>Code conventions</h1>
<p>These are the team's standing agreements. New contributors are expected to follow them; deviations need a comment explaining why.</p>
<ul>
<li><strong>Package layout:</strong> <code>cmd/</code> for binaries, <code>internal/</code> for all application code, <code>pkg/</code> for code that other services might vendor. No <code>lib/</code>.</li>
<li><strong>Error wrapping:</strong> use <code>fmt.Errorf("context: %w", err)</code> at every boundary. Never discard an error silently. No sentinel errors exported from <code>internal/</code>.</li>
<li><strong>Logging:</strong> structured JSON via <code>slog</code> (Go 1.21+). Fields: <code>level</code>, <code>ts</code> (RFC 3339 UTC), <code>msg</code>, plus a <code>req_id</code> on every request-scoped log line. No <code>log.Printf</code> in production paths.</li>
<li><strong>Tests:</strong> table-driven, one <code>_test.go</code> per package, no global state. Integration tests live under <code>internal/integration/</code> and require a <code>-tags integration</code> build tag.</li>
<li><strong>No magic init():</strong> side-effecting <code>init()</code> functions are banned. Initialisation is explicit in <code>main()</code>.</li>
</ul>`,
  },
  {
    id: "datastore",
    title: "Job-queue datastore (original)",
    summary: "SUPERSEDED by #datastore-revised. Original decision: SQLite for the job queue, chosen for zero-dependency local dev. Retained for audit trail.",
    inner: `<h1>Job-queue datastore (original decision)</h1>
<p><strong>Note: this section has been superseded by <a href="#datastore-revised">#datastore-revised</a>. It is retained here as an append-only audit record. The current authoritative decision is in the newer section.</strong></p>
<p>We use <strong>SQLite</strong> for the job queue. The schema lives in <code>internal/queue/schema.sql</code>. Jobs are inserted by the HTTP handler, polled by a background worker goroutine, and deleted on successful delivery or moved to a dead-letter table after three retries.</p>
<p>Rationale at the time: zero external dependencies, trivial local dev setup, acceptable throughput for the projected load (&lt;500 jobs/min at peak). The file is placed on a local SSD mount; no replication.</p>
<p>Known limitation noted at decision time: SQLite write serialisation will become a bottleneck if concurrent dispatch volume exceeds ~1000 writes/s. That threshold was believed to be years away.</p>`,
  },
  {
    id: "datastore-revised",
    title: "Job-queue datastore (current)",
    summary: "Supersedes #datastore. Migration from SQLite to PostgreSQL after the billing-alerts spike in Q3. SQLite write serialisation became a real bottleneck at 1,200 jobs/min.",
    inner: `<h1>Job-queue datastore (current decision)</h1>
<p>We migrated the job queue from SQLite to <strong>PostgreSQL 15</strong> (managed instance, <code>pg.lantern.example.internal</code>) following the Q3 billing-alerts spike that hit 1,200 jobs/min and caused SQLite write-serialisation stalls of up to 800 ms.</p>
<p>The schema is unchanged in structure; the migration added <code>SKIP LOCKED</code> on the polling query so that multiple worker goroutines can dequeue concurrently without stepping on each other. Connection pooling via <code>pgxpool</code> (max 20 conns per instance).</p>
<ul>
<li><strong>Migration date:</strong> 2025-11-04 (fictional)</li>
<li><strong>Migrated by:</strong> Priya K. (fictional)</li>
<li><strong>Schema file:</strong> <code>internal/queue/schema.sql</code> (unchanged; migration script at <code>internal/queue/migrate_20251104.sql</code>)</li>
<li><strong>Old SQLite path:</strong> <code>/var/lantern/queue.db</code> — decommissioned and archived</li>
</ul>
<p>The original SQLite decision is preserved in <a href="#datastore">#datastore</a> for audit purposes.</p>`,
    supersedes: "datastore",
  },
  {
    id: "channel-email",
    title: "Email channel — Postmark integration",
    summary: "How Lantern sends email: Postmark transactional API, a single message stream, rate-limited to 50 req/s, with a hard timeout of 4 s per call.",
    inner: `<h1>Email channel — Postmark integration</h1>
<p>Email is dispatched via the <strong>Postmark</strong> transactional API (fictional account). The integration lives in <code>internal/channel/email/postmark.go</code>.</p>
<ul>
<li><strong>Message stream:</strong> <code>lantern-alerts</code> (outbound, transactional)</li>
<li><strong>Rate limit:</strong> 50 requests/s client-side (token bucket in <code>internal/ratelimit/</code>). Postmark's own limit is 100/s; we stay under half to leave headroom for retries.</li>
<li><strong>Timeout:</strong> 4 s hard timeout on the HTTP call. If Postmark does not respond in 4 s the job is marked for retry.</li>
<li><strong>Retries:</strong> up to 3, with exponential backoff (1 s, 3 s, 9 s). After 3 failures the job moves to the dead-letter table and a Slack alert fires to <code>#lantern-oncall</code>.</li>
<li><strong>From address:</strong> <code>lantern@alerts.acme.example</code> — do not change without coordinating with the Postmark account owner (domain SPF/DKIM records).</li>
</ul>`,
  },
  {
    id: "channel-webhook",
    title: "Webhook channel — delivery and verification",
    summary: "Webhook delivery: POST to caller-supplied URL, HMAC-SHA256 signature in X-Lantern-Signature header, 5 s timeout, 3 retries.",
    inner: `<h1>Webhook channel — delivery and verification</h1>
<p>Webhook delivery POSTs the alert payload as JSON to the caller-supplied URL. The integration is in <code>internal/channel/webhook/deliver.go</code>.</p>
<p><strong>Signature:</strong> every request carries an <code>X-Lantern-Signature</code> header — HMAC-SHA256 of the raw request body, keyed with the caller's webhook secret (stored encrypted in the secrets manager). Receivers should verify this before processing.</p>
<p><strong>Timeout:</strong> 5 s. We give webhooks a slightly longer window than email because caller endpoints vary wildly.</p>
<p><strong>Retries:</strong> same 3-attempt exponential backoff as email. A non-2xx response is treated as a failure. A timeout is a failure. A connection refused is a failure and also fires a warning log so oncall can investigate stale webhook URLs.</p>
<p><strong>Gotcha:</strong> redirects are not followed. If a caller's endpoint returns 301/302, delivery will fail. This is intentional — following redirects with a signed body is unsafe because the signature was computed for the original URL's receiver.</p>`,
  },
  {
    id: "local-dev",
    title: "Local development setup",
    summary: "How to run Lantern locally: Docker Compose for Postgres and the Postmark sandbox, make targets for building and testing.",
    inner: `<h1>Local development setup</h1>
<p>Local dev requires Docker (for Postgres) and Go 1.22+. There is no external dependency on real SMS or email services in the local environment.</p>
<pre><code>git clone github.example/acme/lantern   # fictional
cd lantern
docker compose up -d                    # starts postgres on :5432
make dev                                # builds + runs with .env.local
make test                               # unit tests (no -tags integration)
make test-integration                   # requires compose up</code></pre>
<p><strong>Environment variables</strong> for local dev live in <code>.env.local</code> (not committed). Copy <code>.env.example</code> and fill in:</p>
<ul>
<li><code>DATABASE_URL</code> — defaults to <code>postgres://lantern:lantern@localhost:5432/lantern?sslmode=disable</code></li>
<li><code>POSTMARK_SERVER_TOKEN</code> — use the sandbox token from the team 1Password vault (fictional)</li>
<li><code>WEBHOOK_SIGNING_KEY</code> — any 32-byte hex string is fine locally</li>
</ul>
<p>SMS is a no-op stub in local and staging environments; it only activates when <code>ENV=production</code>.</p>`,
  },
  {
    id: "gotcha-postgres-txn",
    title: "Gotcha — Postgres transaction isolation and SKIP LOCKED",
    summary: "Workers must use READ COMMITTED, not the default. SKIP LOCKED + SERIALIZABLE is a deadlock recipe under concurrent load.",
    inner: `<h1>Gotcha — Postgres transaction isolation and SKIP LOCKED</h1>
<p>This bit us in staging (fictional, 2025-11-18). <strong>Do not use SERIALIZABLE isolation on the dequeue transaction.</strong></p>
<p>The polling query uses <code>SELECT ... FOR UPDATE SKIP LOCKED</code>. Under SERIALIZABLE isolation, Postgres can abort the transaction with a serialisation failure even when <code>SKIP LOCKED</code> is active, because the isolation level tracks the <em>read set</em>, not just the locked rows. Under high concurrent load this produced a storm of serialisation errors that looked like a Postgres outage.</p>
<p>The fix: the dequeue transaction must use <code>READ COMMITTED</code> (Go: <code>pgx.TxOptions{IsoLevel: pgx.ReadCommitted}</code>). <code>SKIP LOCKED</code> is safe and correct under READ COMMITTED; each worker grabs a non-overlapping set of rows with no phantom reads possible in this pattern.</p>
<p>The connection pool default is READ COMMITTED, but anyone calling <code>pool.BeginTx</code> with a custom options struct must not inadvertently set a higher isolation level.</p>`,
  },
  {
    id: "preference-no-orm",
    title: "Team preference — no ORM",
    summary: "The Lantern team does not use an ORM. All SQL is hand-written, reviewed in PRs, and lives in .sql files or inline string constants. sqlc for type-safe query binding only.",
    inner: `<h1>Team preference — no ORM</h1>
<p>Lantern does not use an ORM (no GORM, no Ent, no Bun). This is a deliberate team preference, not a gap.</p>
<p><strong>Rationale:</strong> the query surface is small and stable (5 tables, ~15 queries). Hand-written SQL is readable by anyone who can read SQL, debuggable by pasting into <code>psql</code>, and optimisable without fighting a query builder. ORMs earn their keep at scale or when the schema is highly dynamic; neither applies here.</p>
<p><strong>What we do use:</strong> <code>sqlc</code> to generate type-safe Go bindings from the hand-written <code>.sql</code> files in <code>internal/queue/queries/</code>. The generated code is committed; regenerate with <code>make sqlc</code> after editing queries.</p>
<p><strong>Corollary:</strong> do not add an ORM as a dependency. If you find yourself reaching for one, the right move is to add a query to the <code>.sql</code> file and re-run <code>make sqlc</code>.</p>`,
  },
  {
    id: "dead-letter-handling",
    title: "Dead-letter table and alerting",
    summary: "Jobs that exhaust all retries land in the dead_letter table. Oncall is notified via Slack. Manual re-queue procedure documented here.",
    inner: `<h1>Dead-letter table and alerting</h1>
<p>A job that fails all three delivery attempts is moved to the <code>dead_letter</code> table with a <code>failure_reason</code> column recording the last error message and a <code>failed_at</code> timestamp. The job is never deleted automatically.</p>
<p><strong>Oncall alert:</strong> the worker posts to the <code>#lantern-oncall</code> Slack channel (fictional) via an incoming webhook when a job lands in dead-letter. The alert includes the job ID, channel, alert type, and failure reason.</p>
<p><strong>Manual re-queue:</strong> to retry a dead-lettered job, use the admin script:</p>
<pre><code>go run ./cmd/admin requeue --job-id=&lt;uuid&gt;</code></pre>
<p>This copies the job back into the main queue with a fresh attempt counter. Do not modify the <code>dead_letter</code> row directly — the audit trail must be intact.</p>
<p><strong>Bulk re-queue after an outage:</strong> if a downstream channel had an extended outage and many jobs piled up, use <code>--since=&lt;RFC3339&gt;</code> and <code>--channel=email</code> flags to scope the re-queue. Always run in <code>--dry-run</code> first.</p>`,
  },
  {
    id: "versioning",
    title: "API versioning policy",
    summary: "The /dispatch endpoint is unversioned today. The policy for when and how to introduce versioning is recorded here to avoid ad-hoc decisions.",
    inner: `<h1>API versioning policy</h1>
<p>The <code>/dispatch</code> endpoint is currently unversioned. This is intentional: Lantern has one internal consumer cluster and changes are coordinated. We do not yet need a versioned surface.</p>
<p><strong>When to introduce versioning:</strong> when an external team onboards as a consumer (outside the Platform Reliability perimeter), or when a breaking field change is needed. At that point, introduce <code>/v2/dispatch</code> and keep <code>/dispatch</code> (= v1) stable for a deprecation window of at least 90 days.</p>
<p><strong>What counts as breaking:</strong> removing a required request field, changing the type of an existing field, removing a response field that consumers read, changing error codes. Adding optional request fields or adding response fields is non-breaking.</p>
<p><strong>Do not add a version prefix pre-emptively.</strong> It adds ceremony with no current benefit and makes the API harder to curl in local dev. The policy is here so the decision, when it comes, is deliberate rather than improvised.</p>`,
  },
];

const records = SECTIONS.map((s) => {
  const inner = s.inner;
  return { ...s, hash: sha256(inner), chars: cc(inner) };
});

const totalChars = records.reduce((n, r) => n + r.chars, 0);
const BUILD_DATE = "2026-08-01";

const manifestLinks = records
  .map((r) => `    <li><a href="#${r.id}" data-witness="${r.hash}" data-char-count="${r.chars}"><span class="title">${esc(r.title)}</span> <span class="summary">${esc(r.summary)}</span></a></li>`)
  .join("\n");

const body = records
  .map((r) => {
    const supersedesAttr = r.supersedes ? ` data-supersedes="#${r.supersedes}"` : "";
    return `<section id="${r.id}" data-witness="${r.hash}" data-char-count="${r.chars}"${supersedesAttr}>${r.inner}</section>`;
  })
  .join("\n\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lantern Service Memory (doc.html v0.3 exhibit)</title>
<style>
  :root { --fg:#1a1a1a; --bg:#fafaf7; --muted:#666; --accent:#2a4d6e; --rule:#ddd; --code-bg:#f0ede5; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8e8e3; --bg:#1a1a1a; --muted:#999; --accent:#8ab4d4; --rule:#333; --code-bg:#252523; } }
  body { font: 16px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; color: var(--fg); background: var(--bg); }
  h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 0.6rem; }
  h2 { font-size: 1.3rem; }
  p, ul, pre { margin: 0.8rem 0; }
  a { color: var(--accent); text-decoration: none; border-bottom: 1px solid currentColor; }
  code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 3px; font: 0.92em "SF Mono", Consolas, monospace; }
  pre { background: var(--code-bg); padding: 1rem; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  section { margin: 2.5rem 0; padding: 1.5rem; background: var(--code-bg); border-radius: 8px; }
  header { margin-bottom: 1rem; }
  .header-meta { color: var(--muted); font-size: 0.9em; }
  #manifest { background: var(--code-bg); padding: 1.5rem; border-radius: 8px; margin: 2rem 0; }
  #manifest ol { list-style: decimal; padding-left: 1.5rem; }
  #manifest li { margin: 0.8rem 0; }
  #manifest .title { font-weight: 600; }
  #manifest .summary { display: block; color: var(--muted); font-size: 0.92em; }
  .about-file { color: var(--muted); font-size: 0.9em; border-top: 1px solid var(--rule); padding-top: 0.8rem; margin-top: 2.5rem; }
  .about-file h2 { font-size: 1.05rem; color: var(--fg); }
</style>
</head>
<body>

<header>
  <h1 style="border:none;">Lantern Service Memory</h1>
  <p class="header-meta">doc.html v0.3 · ${BUILD_DATE} · ${records.length} sections · ${totalChars.toLocaleString()} chars · self-verifying (node tools/verify.mjs &lt;this file&gt;)</p>
  <p>A memory-as-document exhibit: a fictional AI coding-assistant&#39;s project memory for the made-up Lantern notification-dispatch service, in conformant doc.html v0.3 format.</p>
</header>

<nav id="manifest" aria-label="Document manifest">
  <ol>
${manifestLinks}
  </ol>
</nav>

${body}

<footer class="about-file">
  <h2>About this file</h2>
  <p>This is a <strong>doc.html</strong> — a single, self-describing HTML file. The <code>&lt;nav id="manifest"&gt;</code> at the top of the body lists every section in this document; each entry&#39;s <code>data-witness</code> is the SHA-256 (hex) of that section&#39;s raw inner bytes, so any reader can verify any section with the file alone — no server, no JavaScript, no tooling. The full format definition is <a href="../SPEC.md">SPEC.md</a>, carried in the format&#39;s own body as <a href="../SPEC.doc.html">SPEC.doc.html</a>.</p>
  <p>Author: Georges Casseus (Ndoto Studios) · License: CC0 1.0 (public domain) · Built: ${BUILD_DATE}</p>
</footer>

</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`Wrote ${OUT}`);
console.log(`  ${records.length} sections, ${totalChars.toLocaleString()} chars of section content`);
