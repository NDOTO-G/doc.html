#!/usr/bin/env node
// build-selective-context-example.mjs — emits examples/selective-context-demo.doc.html,
// a CONFORMANT doc.html v0.3 document demonstrating selective-context (beyond-the-window)
// access on a large synthetic corpus: the Zephyr Stream API Reference (fictional).
// It is a worked example for the v0.3 publication showing why manifest-first hydration
// matters: 200 sections make loading the whole file visibly wasteful.
// Verify with:  node verify.mjs examples/selective-context-demo.doc.html

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "selective-context-demo.doc.html");

const esc = (s) => s
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const cc = (s) => Array.from(s).length;

// Each section's `inner` is emitted EXACTLY between the opening tag's > and
// </section> — no added newline — so the witness covers precisely these bytes.

// ── Corpus generation ────────────────────────────────────────────────────────
// Zephyr Stream API — a fictional real-time data streaming platform.
// Sections: overview note, then resources, methods, error codes, config keys,
// glossary terms, and type definitions — enough for 200 total.

function apiSection(id, title, summary, inner) {
  return { id, title, summary, inner };
}

// ── 1. Preamble ──────────────────────────────────────────────────────────────
const preamble = apiSection(
  "about-this-document",
  "About this document — read the manifest, not the file",
  "Why this body is large on purpose: 200 sections, many thousands of characters — loading all of it is wasteful. Read the manifest, drill by #id, load only what you need. Scaling note included.",
  `<h1>About this document</h1>
<p>This file is a <strong>doc.html v0.3</strong> document. The format itself is the only dependency: no framework, no build system beyond a single Node script, no server required to read it.</p>
<p>It holds the <em>Zephyr Stream API Reference</em> — a fictional real-time data-streaming platform used here as a synthetic corpus. The corpus was chosen deliberately large: it contains <strong>SECTION_COUNT sections</strong> totalling <strong>TOTAL_CHARS characters</strong> of section content. Loading all of it into a context window at once is wasteful when a reader needs only two or three sections at a time.</p>
<p>That wastefulness is the point. The <strong>manifest</strong> (the <code>&lt;nav id="manifest"&gt;</code> element below) lists every section with its title, summary, SHA-256 witness hash, and character count. A reader that consults the manifest first can identify exactly which sections are relevant, fetch only those by <code>#id</code>, and verify each one&#39;s integrity against its witness — never loading the rest.</p>
<p><strong>Known scaling limit:</strong> this manifest is flat — one entry per section. At 200 sections it is already hundreds of lines. A hierarchical manifest (chapter → section → subsection) would compress the navigation surface dramatically and is the obvious next step. That is future work; it is noted here honestly so readers can plan around it.</p>
<p>The format spec lives at <a href="#format-spec-pointer">format-spec-pointer</a>. The witness law: SHA-256 over the raw UTF-8 inner bytes of each section; char-count is Unicode code points (<code>Array.from(inner).length</code>). Both are checkable offline with no network access.</p>`
);

// ── 2. Resource sections (endpoints) ─────────────────────────────────────────
const RESOURCES = [
  ["streams",        "Streams resource",         "Create, list, get, and delete named streams. A stream is the top-level container for an ordered log of events.",
   ["POST /streams", "GET /streams", "GET /streams/{stream_id}", "DELETE /streams/{stream_id}"]],
  ["producers",      "Producers resource",        "Register and manage producers. A producer holds credentials and rate-limit state for a publishing client.",
   ["POST /streams/{stream_id}/producers", "GET /streams/{stream_id}/producers", "DELETE /streams/{stream_id}/producers/{producer_id}"]],
  ["consumers",      "Consumers resource",        "Manage consumer registrations and offset checkpoints. Consumers track their own read position independently.",
   ["POST /streams/{stream_id}/consumers", "GET /streams/{stream_id}/consumers/{consumer_id}", "PATCH /streams/{stream_id}/consumers/{consumer_id}", "DELETE /streams/{stream_id}/consumers/{consumer_id}"]],
  ["events",         "Events resource",           "Append events to a stream and read slices of the event log. Events are immutable once written.",
   ["POST /streams/{stream_id}/events", "GET /streams/{stream_id}/events"]],
  ["checkpoints",    "Checkpoints resource",      "Explicitly set or read a consumer&#39;s acknowledged offset without consuming new events.",
   ["PUT /streams/{stream_id}/consumers/{consumer_id}/checkpoint", "GET /streams/{stream_id}/consumers/{consumer_id}/checkpoint"]],
  ["schemas",        "Schemas resource",          "Register Avro or JSON Schema definitions and associate them with a stream for producer-side validation.",
   ["POST /schemas", "GET /schemas", "GET /schemas/{schema_id}", "DELETE /schemas/{schema_id}"]],
  ["acls",           "Access-control lists (ACL)", "Grant or revoke per-stream, per-operation permissions for principals (users or service accounts).",
   ["PUT /streams/{stream_id}/acl", "GET /streams/{stream_id}/acl", "DELETE /streams/{stream_id}/acl/{principal_id}"]],
  ["metrics",        "Metrics resource",          "Pull per-stream throughput, lag, and error counters. Metrics are sampled at 10-second granularity.",
   ["GET /streams/{stream_id}/metrics", "GET /streams/{stream_id}/metrics/lag"]],
  ["replicas",       "Replicas resource",         "Inspect and trigger manual rebalance of the partition replica assignment for a stream.",
   ["GET /streams/{stream_id}/replicas", "POST /streams/{stream_id}/replicas/rebalance"]],
  ["snapshots",      "Snapshots resource",        "Create point-in-time snapshots of a stream&#39;s current head offset for use in backup or migration.",
   ["POST /streams/{stream_id}/snapshots", "GET /streams/{stream_id}/snapshots", "DELETE /streams/{stream_id}/snapshots/{snapshot_id}"]],
];

function resourceSection([slug, title, summary, endpoints]) {
  const rows = endpoints.map(ep => `<li><code>${ep}</code></li>`).join("\n");
  return apiSection(
    `resource-${slug}`,
    title,
    summary,
    `<h1>${title}</h1>
<p>${summary}</p>
<h2>Endpoints</h2>
<ul>
${rows}
</ul>
<p>See the individual method sections below for request/response shapes, query parameters, and error codes.</p>`
  );
}

const resourceSections = RESOURCES.map(resourceSection);

// ── 3. Method sections ────────────────────────────────────────────────────────
// 50 synthetic method descriptions
const METHODS = [
  ["create-stream",        "POST /streams",              "Create a new named stream",
   "Creates a new stream. The stream name must be unique within the account and match <code>[a-z][a-z0-9-]{0,62}</code>. Returns the stream object with its assigned <code>stream_id</code>.",
   [["name","string","required","Unique stream name."],["partition_count","integer","optional (default 1)","Number of partitions. Range 1–64."],["retention_ms","integer","optional (default 86400000)","Log retention in milliseconds."],["schema_id","string","optional","Associate a registered schema for producer-side validation."]],
   "201 Created with the stream object; 409 Conflict if name exists; 422 Unprocessable if name is invalid."],
  ["list-streams",         "GET /streams",               "List all streams in the account",
   "Returns a paginated list of stream objects ordered by creation time (newest first). Use <code>cursor</code> for pagination.",
   [["cursor","string","optional","Opaque pagination cursor from a previous response."],["limit","integer","optional (default 20, max 100)","Page size."]],
   "200 OK with <code>{ items: Stream[], next_cursor: string|null }</code>."],
  ["get-stream",           "GET /streams/{stream_id}",   "Get a single stream by ID",
   "Returns the full stream object for the given <code>stream_id</code>.",
   [["stream_id","string","path","The stream&#39;s unique identifier."]],
   "200 OK with the stream object; 404 Not Found if the stream does not exist."],
  ["delete-stream",        "DELETE /streams/{stream_id}","Delete a stream and all its data",
   "Permanently deletes a stream and all retained events. This operation is irreversible. All active producers and consumers will receive a <code>STREAM_DELETED</code> error on their next request.",
   [["stream_id","string","path","The stream to delete."]],
   "204 No Content on success; 404 if not found; 409 Conflict if a snapshot is pending."],
  ["create-producer",      "POST /streams/{stream_id}/producers", "Register a producer",
   "Creates a producer credential bound to the given stream. Returns a <code>producer_secret</code> in the response body — this is the only time the secret is visible; store it immediately.",
   [["stream_id","string","path","Stream to publish to."],["label","string","optional","Human-readable label for this producer."],["rate_limit_rps","integer","optional (default account limit)","Per-producer events-per-second ceiling."]],
   "201 Created with the producer object including <code>producer_secret</code>; 404 if stream not found."],
  ["list-producers",       "GET /streams/{stream_id}/producers", "List producers on a stream",
   "Returns all registered producers for the stream. Secrets are never returned after creation.",
   [["stream_id","string","path","Stream ID."]],
   "200 OK with an array of producer objects (no secrets)."],
  ["delete-producer",      "DELETE /streams/{stream_id}/producers/{producer_id}", "Revoke a producer credential",
   "Immediately revokes the producer credential. Any in-flight publish attempts using this credential will fail with <code>CREDENTIAL_REVOKED</code>.",
   [["stream_id","string","path","Stream ID."],["producer_id","string","path","Producer to revoke."]],
   "204 No Content; 404 if producer or stream not found."],
  ["create-consumer",      "POST /streams/{stream_id}/consumers", "Register a consumer",
   "Creates a consumer registration that tracks an independent offset into the stream. The initial offset defaults to <code>earliest</code> (head of the log at creation time).",
   [["stream_id","string","path","Stream to consume from."],["label","string","optional","Human-readable label."],["initial_offset","string","optional (default earliest)","<code>earliest</code> or <code>latest</code> or an explicit offset integer."]],
   "201 Created with the consumer object."],
  ["get-consumer",         "GET /streams/{stream_id}/consumers/{consumer_id}", "Get consumer state",
   "Returns the consumer object including its current acknowledged offset and lag (events behind the stream head).",
   [["stream_id","string","path","Stream ID."],["consumer_id","string","path","Consumer ID."]],
   "200 OK with the consumer object including <code>offset</code> and <code>lag</code>."],
  ["patch-consumer",       "PATCH /streams/{stream_id}/consumers/{consumer_id}", "Update consumer metadata",
   "Update the consumer&#39;s label or rate-limit settings. Offset cannot be changed via PATCH; use the checkpoint endpoint.",
   [["stream_id","string","path","Stream ID."],["consumer_id","string","path","Consumer ID."],["label","string","optional","New label."],["rate_limit_rps","integer","optional","New per-consumer read rate limit."]],
   "200 OK with updated consumer object; 409 if the consumer is in a locked state."],
  ["delete-consumer",      "DELETE /streams/{stream_id}/consumers/{consumer_id}", "Delete a consumer registration",
   "Removes the consumer and its tracked offset. The stream data is unaffected.",
   [["stream_id","string","path","Stream ID."],["consumer_id","string","path","Consumer ID."]],
   "204 No Content; 404 if not found."],
  ["append-events",        "POST /streams/{stream_id}/events", "Append events to a stream",
   "Publishes one or more events in a single atomic batch. The batch size is limited to 1,000 events or 4 MB of payload, whichever is smaller. Events within a batch are assigned contiguous offsets.",
   [["stream_id","string","path","Stream to publish to."],["events","array","body (required)","Array of event objects. Each must have <code>data</code> (base64 or JSON) and optionally <code>key</code>, <code>headers</code>."],["idempotency_key","string","header optional","If provided, duplicate requests with the same key within 60 s are deduplicated."]],
   "202 Accepted with <code>{ first_offset: integer, count: integer }</code>; 400 on validation failure; 413 if batch too large."],
  ["read-events",          "GET /streams/{stream_id}/events", "Read a slice of the event log",
   "Returns up to <code>limit</code> events starting at <code>from_offset</code>. If <code>from_offset</code> is not supplied, the consumer&#39;s current offset is used (requires <code>consumer_id</code>).",
   [["stream_id","string","path","Stream to read from."],["consumer_id","string","query optional","Consumer whose offset to use and advance."],["from_offset","integer","query optional","Explicit starting offset (overrides consumer offset)."],["limit","integer","query optional (default 100, max 1000)","Maximum events to return."],["wait_ms","integer","query optional (default 0, max 30000)","Long-poll timeout if no new events are available."]],
   "200 OK with <code>{ events: Event[], next_offset: integer, lag: integer }</code>."],
  ["set-checkpoint",       "PUT /streams/{stream_id}/consumers/{consumer_id}/checkpoint", "Advance consumer offset",
   "Explicitly advances the consumer&#39;s acknowledged offset without reading new events. Useful for resetting or fast-forwarding.",
   [["stream_id","string","path","Stream ID."],["consumer_id","string","path","Consumer ID."],["offset","integer","body (required)","New offset. Must be ≥ 0 and ≤ stream head offset."]],
   "200 OK with the updated consumer object; 409 if offset is out of range."],
  ["get-checkpoint",       "GET /streams/{stream_id}/consumers/{consumer_id}/checkpoint", "Read consumer checkpoint",
   "Returns only the consumer&#39;s current offset, lag, and last-acknowledged timestamp without the full consumer object.",
   [["stream_id","string","path","Stream ID."],["consumer_id","string","path","Consumer ID."]],
   "200 OK with <code>{ offset: integer, lag: integer, acknowledged_at: string }</code>."],
  ["register-schema",      "POST /schemas",              "Register a schema",
   "Registers a new Avro or JSON Schema definition. Returns a <code>schema_id</code> that can be associated with a stream.",
   [["type","string","body (required)","<code>avro</code> or <code>json-schema</code>."],["definition","string","body (required)","The schema definition as a JSON string."],["label","string","optional","Human-readable label."]],
   "201 Created with the schema object; 422 if the schema definition is invalid."],
  ["list-schemas",         "GET /schemas",               "List all registered schemas",
   "Returns all schemas registered in the account.",
   [["cursor","string","optional","Pagination cursor."],["limit","integer","optional (default 20)","Page size."]],
   "200 OK with <code>{ items: Schema[], next_cursor: string|null }</code>."],
  ["get-schema",           "GET /schemas/{schema_id}",   "Get a schema by ID",
   "Returns the full schema object including its definition.",
   [["schema_id","string","path","Schema ID."]],
   "200 OK with the schema object; 404 if not found."],
  ["delete-schema",        "DELETE /schemas/{schema_id}","Delete a schema",
   "Deletes the schema definition. Fails if any stream currently references this schema.",
   [["schema_id","string","path","Schema to delete."]],
   "204 No Content; 409 Conflict if the schema is in use."],
  ["set-acl",              "PUT /streams/{stream_id}/acl", "Set ACL entry for a principal",
   "Grants or updates permissions for a principal on the given stream. Supported operations: <code>read</code>, <code>write</code>, <code>admin</code>.",
   [["stream_id","string","path","Stream ID."],["principal_id","string","body (required)","User or service-account ID."],["operations","array","body (required)","Array of permitted operations."]],
   "200 OK with the updated ACL entry; 403 if the caller lacks admin on the stream."],
  ["get-acl",              "GET /streams/{stream_id}/acl", "List ACL entries for a stream",
   "Returns all principal-to-permission mappings for the stream.",
   [["stream_id","string","path","Stream ID."]],
   "200 OK with an array of ACL entries."],
  ["delete-acl-entry",     "DELETE /streams/{stream_id}/acl/{principal_id}", "Remove an ACL entry",
   "Revokes all permissions for the principal on the stream. The principal loses all access immediately.",
   [["stream_id","string","path","Stream ID."],["principal_id","string","path","Principal to remove."]],
   "204 No Content; 404 if the entry does not exist."],
  ["get-metrics",          "GET /streams/{stream_id}/metrics", "Get stream throughput metrics",
   "Returns a time-series of ingest rate, consume rate, and error rate, sampled at 10-second intervals. The window covers the last hour by default.",
   [["stream_id","string","path","Stream ID."],["window_s","integer","optional (default 3600)","Look-back window in seconds (max 86400)."],["resolution_s","integer","optional (default 10)","Sample interval. Must be a multiple of 10."]],
   "200 OK with <code>{ samples: MetricSample[] }</code>."],
  ["get-lag-metrics",      "GET /streams/{stream_id}/metrics/lag", "Get per-consumer lag metrics",
   "Returns the current lag (events behind head) for every consumer registered on the stream.",
   [["stream_id","string","path","Stream ID."]],
   "200 OK with an array of <code>{ consumer_id, lag, last_read_at }</code>."],
  ["get-replicas",         "GET /streams/{stream_id}/replicas", "Inspect replica assignment",
   "Returns the current partition-to-broker assignment for the stream, including replica health status.",
   [["stream_id","string","path","Stream ID."]],
   "200 OK with an array of <code>PartitionReplica</code> objects."],
  ["rebalance-replicas",   "POST /streams/{stream_id}/replicas/rebalance", "Trigger replica rebalance",
   "Initiates a background rebalance of partition replicas across brokers. Returns immediately; poll <code>GET /streams/{stream_id}/replicas</code> to observe progress.",
   [["stream_id","string","path","Stream ID."]],
   "202 Accepted with <code>{ rebalance_id: string }</code>; 409 if a rebalance is already in progress."],
  ["create-snapshot",      "POST /streams/{stream_id}/snapshots", "Create a stream snapshot",
   "Records the current head offset as a named snapshot. Snapshots do not preserve event data; they record a position for migration or backup bookmarking.",
   [["stream_id","string","path","Stream ID."],["label","string","optional","Human-readable label."]],
   "201 Created with the snapshot object."],
  ["list-snapshots",       "GET /streams/{stream_id}/snapshots", "List snapshots for a stream",
   "Returns all snapshots for the stream, ordered by creation time.",
   [["stream_id","string","path","Stream ID."]],
   "200 OK with an array of snapshot objects."],
  ["delete-snapshot",      "DELETE /streams/{stream_id}/snapshots/{snapshot_id}", "Delete a snapshot",
   "Removes the snapshot record. Stream data is unaffected.",
   [["stream_id","string","path","Stream ID."],["snapshot_id","string","path","Snapshot to delete."]],
   "204 No Content; 404 if not found."],
];

function methodSection([slug, endpoint, title, desc, params, returns]) {
  const paramRows = params.map(([n, t, req, d]) =>
    `<tr><td><code>${n}</code></td><td>${t}</td><td>${req}</td><td>${d}</td></tr>`
  ).join("\n");
  return apiSection(
    `method-${slug}`,
    `${endpoint} — ${title}`,
    `${desc.replace(/<[^>]+>/g, "").substring(0, 140)}`,
    `<h1><code>${endpoint}</code> — ${title}</h1>
<p>${desc}</p>
<h2>Parameters</h2>
<table>
<thead><tr><th>Name</th><th>Type</th><th>Required/Location</th><th>Description</th></tr></thead>
<tbody>
${paramRows}
</tbody>
</table>
<h2>Returns</h2>
<p>${returns}</p>`
  );
}

const methodSections = METHODS.map(methodSection);

// ── 4. Error code sections ────────────────────────────────────────────────────
const ERRORS = [
  ["STREAM_NOT_FOUND",       "404",  "The requested stream does not exist or has been deleted."],
  ["PRODUCER_NOT_FOUND",     "404",  "The producer ID does not exist on this stream."],
  ["CONSUMER_NOT_FOUND",     "404",  "The consumer ID does not exist on this stream."],
  ["SCHEMA_NOT_FOUND",       "404",  "The schema ID does not exist in this account."],
  ["SNAPSHOT_NOT_FOUND",     "404",  "The snapshot ID does not exist on this stream."],
  ["STREAM_NAME_CONFLICT",   "409",  "A stream with this name already exists in the account."],
  ["SCHEMA_IN_USE",          "409",  "The schema is referenced by one or more streams and cannot be deleted."],
  ["REBALANCE_IN_PROGRESS",  "409",  "A replica rebalance is already running for this stream. Wait for it to complete before triggering another."],
  ["SNAPSHOT_PENDING",       "409",  "A snapshot operation is in progress; stream deletion is blocked until it completes or is cancelled."],
  ["STREAM_DELETED",         "410",  "The stream was deleted after the operation was initiated. Abort all producers and consumers bound to it."],
  ["CREDENTIAL_REVOKED",     "401",  "The producer credential has been revoked. Re-register a new producer."],
  ["BATCH_TOO_LARGE",        "413",  "The event batch exceeds the 1,000-event or 4 MB limit. Split it into smaller batches."],
  ["OFFSET_OUT_OF_RANGE",    "409",  "The requested offset is below the earliest retained offset or above the current head. Adjust and retry."],
  ["VALIDATION_FAILED",      "422",  "The event payload failed schema validation. The response body contains per-field error details."],
  ["RATE_LIMIT_EXCEEDED",    "429",  "The producer or consumer has exceeded its configured rate limit. Back off and retry after the <code>Retry-After</code> header value."],
  ["STREAM_NAME_INVALID",    "422",  "The stream name does not match <code>[a-z][a-z0-9-]{0,62}</code>."],
  ["SCHEMA_INVALID",         "422",  "The schema definition is syntactically or semantically invalid. See response body for details."],
  ["PARTITION_COUNT_INVALID","422",  "Partition count must be between 1 and 64."],
  ["ACL_FORBIDDEN",          "403",  "The caller does not have admin permission on this stream and cannot modify its ACL."],
  ["CONSUMER_LOCKED",        "409",  "The consumer is in a locked state (e.g., mid-rebalance) and cannot be modified. Retry after a short delay."],
  ["IDEMPOTENCY_CONFLICT",   "409",  "The idempotency key was used by a different request body within the deduplication window. Use a new key or omit it."],
  ["INTERNAL_ERROR",         "500",  "An unexpected internal error occurred. The error is logged with a <code>request_id</code> for support escalation."],
  ["SERVICE_UNAVAILABLE",    "503",  "The service is temporarily unavailable (e.g., during rolling upgrade). Retry with exponential backoff."],
  ["INSUFFICIENT_CAPACITY",  "507",  "The account has reached its retained-bytes quota. Reduce retention or delete streams before appending."],
];

function errorSection([code, status, desc]) {
  return apiSection(
    `error-${code.toLowerCase().replace(/_/g, "-")}`,
    `Error: ${code} (HTTP ${status})`,
    `${desc.replace(/<[^>]+>/g, "").substring(0, 140)}`,
    `<h1>Error code: <code>${code}</code></h1>
<p><strong>HTTP status:</strong> ${status}</p>
<p>${desc}</p>
<p>All errors are returned as <code>application/json</code> with the shape:</p>
<pre><code>{ "error": "${code}", "message": "&lt;human-readable string&gt;", "request_id": "&lt;uuid&gt;" }</code></pre>`
  );
}

const errorSections = ERRORS.map(errorSection);

// ── 5. Configuration key sections ─────────────────────────────────────────────
const CONFIG_KEYS = [
  ["retention-ms",              "retention_ms",             "integer",  "86400000", "Log retention window in milliseconds. Events older than this may be evicted. Minimum 60000 (1 minute); maximum 2592000000 (30 days)."],
  ["partition-count",           "partition_count",          "integer",  "1",        "Number of partitions for a stream. Set at creation; immutable thereafter. Higher partition counts increase parallelism but consume more broker resources."],
  ["max-batch-size-events",     "max_batch_size_events",    "integer",  "1000",     "Maximum number of events in a single append batch. Account-level setting; cannot be raised above 1000."],
  ["max-batch-size-bytes",      "max_batch_size_bytes",     "integer",  "4194304",  "Maximum total payload bytes in a single append batch (4 MB). Requests exceeding this receive BATCH_TOO_LARGE."],
  ["consumer-long-poll-max-ms", "consumer_long_poll_max_ms","integer",  "30000",    "Maximum long-poll wait time for event reads. Clients may request up to this value via <code>wait_ms</code>."],
  ["idempotency-window-s",      "idempotency_window_s",     "integer",  "60",       "Duration in seconds for which an idempotency key deduplicate duplicate append requests."],
  ["metrics-resolution-min-s",  "metrics_resolution_min_s", "integer",  "10",       "Minimum sampling resolution for metric queries. Must be a multiple of this value."],
  ["rebalance-timeout-s",       "rebalance_timeout_s",      "integer",  "120",      "Maximum time allowed for a replica rebalance before it is aborted and the stream is left in its pre-rebalance state."],
  ["snapshot-ttl-days",         "snapshot_ttl_days",        "integer",  "30",       "Days after which unclaimed snapshots are automatically purged. Set to 0 to disable automatic purge."],
  ["acl-default-deny",          "acl_default_deny",         "boolean",  "true",     "When true, principals not listed in a stream&#39;s ACL have no access. When false, all authenticated principals have read access by default."],
  ["schema-validation-mode",    "schema_validation_mode",   "string",   "strict",   "Validation behavior when a producer publishes an event against a stream with an associated schema. <code>strict</code>: reject invalid events. <code>warn</code>: admit but annotate. <code>off</code>: disable validation."],
  ["rate-limit-default-rps",    "rate_limit_default_rps",   "integer",  "1000",     "Default per-producer and per-consumer rate limit in requests per second. Can be overridden per-producer/consumer at registration time."],
];

function configSection([slug, key, type, defaultVal, desc]) {
  return apiSection(
    `config-${slug}`,
    `Config: ${key}`,
    `${key} (${type}, default ${defaultVal}) — ${desc.replace(/<[^>]+>/g, "").substring(0, 100)}`,
    `<h1>Configuration key: <code>${key}</code></h1>
<table>
<thead><tr><th>Property</th><th>Value</th></tr></thead>
<tbody>
<tr><td>Type</td><td>${type}</td></tr>
<tr><td>Default</td><td><code>${defaultVal}</code></td></tr>
</tbody>
</table>
<p>${desc}</p>`
  );
}

const configSections = CONFIG_KEYS.map(configSection);

// ── 6. Glossary sections ──────────────────────────────────────────────────────
const GLOSSARY = [
  ["stream",        "Stream",         "The top-level container for an ordered, append-only sequence of events. A stream has a name, a partition count, a retention policy, and optionally an associated schema. Streams are identified by their <code>stream_id</code>."],
  ["event",         "Event",          "The atomic unit of data in Zephyr. An event consists of a <code>data</code> payload (base64 binary or JSON), an optional <code>key</code> used for partition routing, optional <code>headers</code> (arbitrary string key-value pairs), and a server-assigned <code>offset</code>."],
  ["offset",        "Offset",         "A monotonically increasing integer that identifies an event&#39;s position within its stream. Offsets start at 0. They are assigned by the server at append time and never reused, even after event eviction."],
  ["partition",     "Partition",      "A subdivision of a stream that allows parallel produce and consume. Events with the same <code>key</code> are routed to the same partition (consistent hashing). Consumers may be pinned to a partition or consume from all partitions."],
  ["producer",      "Producer",       "A registered credential and rate-limit context for a publishing client. Each producer holds a <code>producer_secret</code> used to authenticate append requests. Producers are bound to a single stream."],
  ["consumer",      "Consumer",       "A registered read context that tracks an independent offset into a stream. Multiple consumers can read the same stream at different offsets without interfering with each other."],
  ["lag",           "Lag",            "The number of events between a consumer&#39;s current acknowledged offset and the stream&#39;s head (latest) offset. A lag of 0 means the consumer is caught up. High lag indicates the consumer is falling behind the ingest rate."],
  ["checkpoint",    "Checkpoint",     "An explicit record of the last offset a consumer has successfully processed. Checkpointing is the mechanism by which at-least-once delivery is implemented: a consumer that restarts from its last checkpoint will re-read events between the checkpoint and the crash point."],
  ["schema",        "Schema",         "An Avro or JSON Schema definition registered in the account and optionally associated with a stream. When a schema is associated, producer-side validation rejects events that do not conform."],
  ["idempotency-key", "Idempotency key", "An optional string header (<code>Idempotency-Key</code>) on append requests. Within the <code>idempotency_window_s</code>, duplicate requests with the same key and the same request body are deduplicated — only the first is applied."],
  ["acl",           "Access-control list (ACL)", "A set of principal-to-operation grants on a stream. Zephyr uses a default-deny model by default: only explicitly granted principals can perform the listed operations. Supported operations: <code>read</code>, <code>write</code>, <code>admin</code>."],
  ["principal",     "Principal",      "An entity (user or service account) that authenticates to Zephyr and is subject to ACL checks. Principals are identified by their <code>principal_id</code>."],
  ["broker",        "Broker",         "A Zephyr server node that holds partition replicas, handles ingest, and serves consume requests. Clients do not address brokers directly; the API gateway routes to the correct broker."],
  ["replica",       "Replica",        "A copy of a partition held by a broker. Each partition has a leader replica (handles reads and writes) and zero or more follower replicas (replicate from the leader for durability)."],
  ["rebalance",     "Rebalance",      "The process of redistributing partition leadership across brokers, typically triggered by adding capacity or recovering from a broker failure. During rebalance, affected partitions experience a brief leadership transfer."],
  ["snapshot",      "Snapshot",       "A named record of a stream&#39;s head offset at a point in time. Snapshots do not freeze or copy event data; they provide a stable position reference for migration, backup, or diff operations."],
  ["retention",     "Retention",      "The policy that governs how long events are kept in a stream before being eligible for eviction. Configured via <code>retention_ms</code>. Note: eviction is best-effort — events may persist slightly longer than the retention window under high load."],
  ["head",          "Head",           "The latest offset in a stream — the position one past the last written event. Reading from the head with <code>wait_ms &gt; 0</code> long-polls for new events."],
  ["long-poll",     "Long-poll",      "A read strategy where the server holds an open connection for up to <code>wait_ms</code> milliseconds, returning as soon as new events are available (or at timeout). Long-polling reduces unnecessary polling under low-throughput conditions."],
  ["at-least-once", "At-least-once delivery", "The delivery guarantee Zephyr offers: every event written to a stream will be delivered to a consumer at least once. Consumers must be idempotent or use a deduplication layer, because a crash before checkpointing causes re-delivery of events since the last checkpoint."],
  ["exactly-once",  "Exactly-once delivery (not supported)", "Zephyr does not natively provide exactly-once delivery. Producers can avoid duplicate ingest using idempotency keys, but consumer-side exactly-once requires an external transaction coordinator."],
  ["throughput",    "Throughput",     "The rate of data flowing through a stream, measured in events per second or bytes per second. Throughput is bounded by the rate limit of the producing credential and the broker&#39;s partition capacity."],
  ["cursor",        "Cursor",         "An opaque string returned in paginated list responses as <code>next_cursor</code>. Pass it back as the <code>cursor</code> query parameter to retrieve the next page. Cursors are valid for 10 minutes after issuance."],
  ["request-id",    "Request ID",     "A UUID returned in all API responses as the <code>X-Request-Id</code> header and included in error response bodies as <code>request_id</code>. Include it in support escalations to enable log correlation."],
  ["account",       "Account",        "The top-level organizational unit in Zephyr. All streams, schemas, and principals belong to an account. Quotas (retained bytes, stream count, schema count) are enforced at the account level."],
];

function glossarySection([slug, term, def]) {
  return apiSection(
    `glossary-${slug}`,
    `Glossary: ${term}`,
    `Definition of &quot;${term}&quot; in the Zephyr Stream API.`,
    `<h1>Glossary: ${term}</h1>
<p>${def}</p>`
  );
}

const glossarySections = GLOSSARY.map(glossarySection);

// ── 7. Type-definition sections ───────────────────────────────────────────────
const TYPES = [
  ["Stream", "The Stream object", "Top-level stream container returned by create, get, and list endpoints.",
   [["stream_id","string","Unique identifier, e.g. <code>stm_01hxyz</code>."],
    ["name","string","The stream&#39;s human-readable name."],
    ["partition_count","integer","Number of partitions."],
    ["retention_ms","integer","Retention window in milliseconds."],
    ["schema_id","string|null","Associated schema ID, or null if none."],
    ["created_at","string","UTC timestamp of creation (format: <code>YYYY-MM-DDTHH:mm:ssZ</code>)."],
    ["head_offset","integer","The current head offset (one past the last event)."],
    ["status","string","<code>active</code>, <code>deleting</code>, or <code>error</code>."]]],
  ["Producer", "The Producer object", "Registered producer credential bound to a stream.",
   [["producer_id","string","Unique identifier."],
    ["stream_id","string","Stream this producer is bound to."],
    ["label","string|null","Human-readable label."],
    ["rate_limit_rps","integer","Per-producer rate limit in requests per second."],
    ["created_at","string","UTC creation timestamp."],
    ["producer_secret","string","Only present in the 201 response from POST /producers. Never returned again."]]],
  ["Consumer", "The Consumer object", "Consumer registration tracking an offset into a stream.",
   [["consumer_id","string","Unique identifier."],
    ["stream_id","string","Stream this consumer reads from."],
    ["label","string|null","Human-readable label."],
    ["offset","integer","Current acknowledged offset."],
    ["lag","integer","Events between this offset and the stream head."],
    ["rate_limit_rps","integer","Per-consumer read rate limit."],
    ["last_read_at","string|null","UTC timestamp of last read operation, or null if never read."],
    ["created_at","string","UTC creation timestamp."]]],
  ["Event", "The Event object", "Atomic data unit returned by GET /events.",
   [["offset","integer","Server-assigned position within the stream."],
    ["partition","integer","Partition this event was written to."],
    ["key","string|null","Partition routing key, or null if unkeyed."],
    ["data","string","Base64-encoded binary payload or JSON string, depending on producer encoding."],
    ["headers","object","Arbitrary string key-value pairs set by the producer."],
    ["written_at","string","UTC timestamp when the event was committed."]]],
  ["Schema", "The Schema object", "Registered schema definition.",
   [["schema_id","string","Unique identifier."],
    ["type","string","<code>avro</code> or <code>json-schema</code>."],
    ["label","string|null","Human-readable label."],
    ["definition","string","The schema definition as a JSON-encoded string."],
    ["created_at","string","UTC creation timestamp."]]],
  ["AclEntry", "The AclEntry object", "Principal-to-operations mapping on a stream.",
   [["principal_id","string","The granted principal."],
    ["operations","array of string","List of permitted operations: <code>read</code>, <code>write</code>, <code>admin</code>."],
    ["granted_at","string","UTC timestamp when the grant was last modified."]]],
  ["MetricSample", "The MetricSample object", "Single time-series sample from GET /metrics.",
   [["ts","string","UTC timestamp of the sample start."],
    ["ingest_rps","number","Events appended per second during this interval."],
    ["consume_rps","number","Events read per second during this interval."],
    ["error_rate","number","Fraction of requests that returned an error during this interval (0.0–1.0)."]]],
  ["PartitionReplica", "The PartitionReplica object", "Per-partition replica assignment from GET /replicas.",
   [["partition","integer","Partition index (0-based)."],
    ["leader_broker","string","Broker hostname holding the leader replica."],
    ["follower_brokers","array of string","Broker hostnames holding follower replicas."],
    ["status","string","<code>healthy</code>, <code>under-replicated</code>, or <code>offline</code>."]]],
  ["Snapshot", "The Snapshot object", "Point-in-time offset record.",
   [["snapshot_id","string","Unique identifier."],
    ["stream_id","string","Stream this snapshot was taken from."],
    ["head_offset","integer","Head offset at snapshot creation time."],
    ["label","string|null","Human-readable label."],
    ["created_at","string","UTC creation timestamp."],
    ["expires_at","string|null","UTC timestamp after which the snapshot may be auto-purged, or null if indefinite."]]],
  ["ErrorResponse", "The ErrorResponse object", "Returned by all endpoints on error.",
   [["error","string","Machine-readable error code (see error-code sections)."],
    ["message","string","Human-readable description of the error."],
    ["request_id","string","UUID for log correlation and support escalation."],
    ["details","object|null","Optional structured detail, e.g. per-field validation failures."]]],
];

function typeSection([slug, title, summary, fields]) {
  const rows = fields.map(([n, t, d]) =>
    `<tr><td><code>${n}</code></td><td>${t}</td><td>${d}</td></tr>`
  ).join("\n");
  return apiSection(
    `type-${slug.toLowerCase()}`,
    `Type: ${title}`,
    summary,
    `<h1>Type: <code>${slug}</code></h1>
<p>${summary}</p>
<table>
<thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`
  );
}

const typeSections = TYPES.map(typeSection);

// ── 8. Authentication and guide sections ──────────────────────────────────────
const GUIDES = [
  ["authentication",     "Authentication",             "How to authenticate requests to the Zephyr API.",
   `<h1>Authentication</h1>
<p>All Zephyr API requests require authentication. Two credential types are supported:</p>
<h2>API keys (account-level)</h2>
<p>Account-level API keys are generated in the Zephyr dashboard. Pass the key in the <code>Authorization</code> header:</p>
<pre><code>Authorization: Bearer zph_live_&lt;key&gt;</code></pre>
<p>Account-level keys have access to all resources in the account and are subject to the account&#39;s ACL configuration.</p>
<h2>Producer secrets (stream-level)</h2>
<p>Producer secrets are issued by <code>POST /streams/{stream_id}/producers</code> and are valid only for appending events to the bound stream. Pass the secret the same way:</p>
<pre><code>Authorization: Bearer zph_prod_&lt;secret&gt;</code></pre>
<p>Producer secrets cannot list streams, manage consumers, or modify ACLs.</p>`],
  ["pagination",         "Pagination",                 "How list endpoints paginate results with opaque cursors.",
   `<h1>Pagination</h1>
<p>All list endpoints (<code>GET /streams</code>, <code>GET /schemas</code>, etc.) return paginated results. Pagination uses opaque cursor tokens, not page numbers.</p>
<h2>Request</h2>
<p>Supply <code>?limit=N</code> to control page size (default 20, max 100). On subsequent pages, supply <code>?cursor=&lt;next_cursor&gt;</code> from the previous response.</p>
<h2>Response</h2>
<pre><code>{
  "items": [...],
  "next_cursor": "c_01hxyz..." // null when no more pages
}</code></pre>
<p>A <code>null</code> <code>next_cursor</code> means you have seen all results. Cursors are valid for 10 minutes; a stale cursor returns a 400 error. Re-fetch from the beginning in that case.</p>`],
  ["rate-limiting",      "Rate limiting",              "How per-producer and per-consumer rate limits are enforced, and how to handle RATE_LIMIT_EXCEEDED.",
   `<h1>Rate limiting</h1>
<p>Zephyr enforces rate limits at the producer and consumer level. The default is <code>rate_limit_default_rps</code> (1,000 req/s), overridable at registration time.</p>
<h2>Response headers</h2>
<p>Every response includes:</p>
<ul>
<li><code>X-RateLimit-Limit</code> — the current limit in requests per second.</li>
<li><code>X-RateLimit-Remaining</code> — requests remaining in the current second.</li>
<li><code>Retry-After</code> — seconds until the limit resets (present only on 429 responses).</li>
</ul>
<h2>Handling 429</h2>
<p>When you receive <code>RATE_LIMIT_EXCEEDED</code>, wait for the <code>Retry-After</code> interval, then retry with exponential backoff (initial interval 1 s, multiplier 2, jitter ±10 %).</p>`],
  ["idempotency",        "Idempotent appends",         "How to use the Idempotency-Key header to prevent duplicate event ingestion.",
   `<h1>Idempotent appends</h1>
<p>To prevent duplicate events caused by network retries, supply an <code>Idempotency-Key</code> header on <code>POST /streams/{stream_id}/events</code>:</p>
<pre><code>Idempotency-Key: &lt;your-uuid&gt;</code></pre>
<p>Within the <code>idempotency_window_s</code> (default 60 s), any second request with the same key <em>and the same request body</em> returns the original response without writing a duplicate. If the body differs, you receive <code>IDEMPOTENCY_CONFLICT</code> (409).</p>
<p>Choose keys that are tied to the logical operation, not a random UUID per HTTP call. UUIDs derived from a business transaction ID are a good pattern.</p>`],
  ["long-polling",       "Long-polling for new events","How to use wait_ms to block on the read endpoint until new events arrive.",
   `<h1>Long-polling for new events</h1>
<p>Rather than polling <code>GET /streams/{stream_id}/events</code> in a tight loop, set <code>wait_ms</code> to have the server hold the connection open until new events are available:</p>
<pre><code>GET /streams/{stream_id}/events?consumer_id=&lt;id&gt;&amp;wait_ms=5000</code></pre>
<p>The server returns as soon as at least one new event is available, or after <code>wait_ms</code> milliseconds (whichever comes first). On timeout, it returns an empty <code>items</code> array — resume polling immediately.</p>
<p>Maximum <code>wait_ms</code> is capped at <code>consumer_long_poll_max_ms</code> (default 30,000). Set your HTTP client timeout to at least <code>wait_ms + 5000</code> to avoid premature client-side timeouts.</p>`],
  ["at-least-once",      "At-least-once delivery pattern", "How to implement reliable at-least-once consumption using checkpoints.",
   `<h1>At-least-once delivery pattern</h1>
<p>Zephyr guarantees at-least-once delivery. To ensure no events are lost on consumer failure:</p>
<ol>
<li>Read a batch of events.</li>
<li>Process each event (apply to your downstream system).</li>
<li>Only after successful processing, advance the checkpoint via <code>PUT /checkpoint</code>.</li>
<li>If the consumer restarts before step 3, it will re-read and re-process events since the last checkpoint.</li>
</ol>
<p>Your downstream processing must be idempotent, or you must deduplicate by event offset. Storing the last-seen offset in your database — updated atomically with the event application — is the standard pattern.</p>`],
  ["schema-validation",  "Schema validation workflow",  "How to register a schema, associate it with a stream, and interpret validation errors.",
   `<h1>Schema validation workflow</h1>
<p>Schema validation enforces that producers publish conformant events, catching integration errors early.</p>
<h2>Steps</h2>
<ol>
<li>Register your Avro or JSON Schema via <code>POST /schemas</code>. Record the returned <code>schema_id</code>.</li>
<li>Create a stream with <code>"schema_id": "&lt;id&gt;"</code>, or update an existing stream&#39;s schema association.</li>
<li>Configure <code>schema_validation_mode</code>: <code>strict</code> (default) rejects invalid events; <code>warn</code> admits them with an annotation in the event header.</li>
</ol>
<h2>Validation errors</h2>
<p>On a <code>VALIDATION_FAILED</code> (422) response, the <code>details</code> field contains an array of per-field error objects:</p>
<pre><code>{ "field": "/data/price", "error": "Expected number, got string" }</code></pre>`],
  ["acl-workflow",       "ACL management workflow",    "How to configure stream permissions for multiple principals.",
   `<h1>ACL management workflow</h1>
<p>By default (<code>acl_default_deny: true</code>), only principals explicitly granted access can read or write a stream.</p>
<h2>Granting access</h2>
<pre><code>PUT /streams/{stream_id}/acl
{ "principal_id": "usr_alice", "operations": ["read", "write"] }</code></pre>
<h2>Granting admin</h2>
<p>The <code>admin</code> operation is required to modify the ACL itself. Grant it only to trusted principals. The account owner always has implicit admin on all streams.</p>
<h2>Revoking access</h2>
<pre><code>DELETE /streams/{stream_id}/acl/usr_alice</code></pre>
<p>Revocation is immediate. In-flight requests from the principal complete normally; all subsequent requests fail with 403.</p>`],
  ["migration",          "Stream migration using snapshots", "How to migrate a stream to a new account or region using snapshots and offset bookmarks.",
   `<h1>Stream migration using snapshots</h1>
<p>Snapshots provide a stable offset bookmark useful for coordinating a migration without stopping producers.</p>
<h2>Procedure</h2>
<ol>
<li>Create a snapshot on the source stream: <code>POST /streams/{source_id}/snapshots</code>. Record <code>head_offset</code>.</li>
<li>Create the destination stream with the same configuration.</li>
<li>Replay events from the source from offset 0 to <code>head_offset</code> into the destination.</li>
<li>Cut over producers to the destination stream.</li>
<li>Drain any remaining events from source (above <code>head_offset</code>) into the destination.</li>
<li>Delete the source stream once all consumers confirm they have caught up on the destination.</li>
</ol>
<p>Migration tooling that automates this procedure is available as a separate CLI (not covered in this reference).</p>`],
  ["error-handling",     "Error handling best practices", "General guidance on parsing errors, retrying safely, and escalating to support.",
   `<h1>Error handling best practices</h1>
<h2>Parse the error code, not the message</h2>
<p>The <code>error</code> field is the machine-readable code; the <code>message</code> is for humans and may change. Build retry logic against error codes, not message strings.</p>
<h2>Retryable vs non-retryable</h2>
<ul>
<li><strong>Retryable (with backoff):</strong> 429, 500, 503, 504.</li>
<li><strong>Not retryable without change:</strong> 400, 401, 403, 404, 409, 410, 413, 422.</li>
</ul>
<h2>Escalating to support</h2>
<p>For unexpected 500 errors, include the <code>request_id</code> from the error body when contacting support. This enables log correlation on the Zephyr side.</p>`],
  ["metrics-walkthrough","Reading metrics effectively",  "How to use the metrics endpoints to detect consumer lag and throughput regressions.",
   `<h1>Reading metrics effectively</h1>
<h2>Throughput monitoring</h2>
<p>Poll <code>GET /streams/{stream_id}/metrics?window_s=300</code> every minute to track the last 5-minute ingest and consume rates. Alert when <code>ingest_rps</code> drops below your expected baseline (producer health) or when <code>consume_rps</code> drops significantly below <code>ingest_rps</code> (consumer falling behind).</p>
<h2>Lag monitoring</h2>
<p><code>GET /streams/{stream_id}/metrics/lag</code> returns instantaneous lag per consumer. Integrate this into your SLO dashboard. A sustained lag increase indicates the consumer cannot keep up — scale horizontally or reduce processing time per event.</p>
<h2>Error rate</h2>
<p>The <code>error_rate</code> field in each <code>MetricSample</code> covers all error classes. A spike typically indicates a client-side misconfiguration (schema validation failures, rate limit bursts) rather than platform instability.</p>`],
  ["versioning",         "API versioning policy",      "How Zephyr versions its API and what changes are considered breaking.",
   `<h1>API versioning policy</h1>
<p>The current API version is <strong>v1</strong>. The version appears in the base URL: <code>https://api.zephyrstream.io/v1/</code>.</p>
<h2>Non-breaking changes (no notice required)</h2>
<ul>
<li>Adding new optional request fields.</li>
<li>Adding new response fields.</li>
<li>Adding new error codes.</li>
<li>Adding new endpoints.</li>
</ul>
<h2>Breaking changes (90-day deprecation notice)</h2>
<ul>
<li>Removing or renaming existing fields.</li>
<li>Changing field types.</li>
<li>Removing endpoints.</li>
<li>Changing error code semantics.</li>
</ul>
<p>Breaking changes are introduced in a new API version (e.g. <code>/v2/</code>) and the prior version is supported for 12 months.</p>`],
  ["quotas",             "Account quotas and limits",   "Default per-account quotas for streams, schemas, retained bytes, and partition counts.",
   `<h1>Account quotas and limits</h1>
<table>
<thead><tr><th>Quota</th><th>Default limit</th><th>Notes</th></tr></thead>
<tbody>
<tr><td>Streams per account</td><td>100</td><td>Contact support to raise.</td></tr>
<tr><td>Partitions per stream</td><td>64</td><td>Set at creation; immutable.</td></tr>
<tr><td>Schemas per account</td><td>500</td><td></td></tr>
<tr><td>Retained bytes per account</td><td>100 GB</td><td>Across all streams combined.</td></tr>
<tr><td>Producers per stream</td><td>50</td><td></td></tr>
<tr><td>Consumers per stream</td><td>200</td><td></td></tr>
<tr><td>Events per append batch</td><td>1,000</td><td>Hard limit; not raisable.</td></tr>
<tr><td>Batch payload size</td><td>4 MB</td><td>Hard limit; not raisable.</td></tr>
</tbody>
</table>
<p>Exceeding a quota returns <code>INSUFFICIENT_CAPACITY</code> (507). Quotas are evaluated per account, not per stream, except where noted.</p>`],
  ["sdks",               "Client SDKs",                "Officially supported client libraries for the Zephyr Stream API.",
   `<h1>Client SDKs</h1>
<p>Zephyr provides officially maintained client libraries for the following languages. All SDK packages are published under the <code>@zephyrstream</code> namespace.</p>
<table>
<thead><tr><th>Language</th><th>Package</th><th>Minimum version</th></tr></thead>
<tbody>
<tr><td>Node.js</td><td><code>@zephyrstream/node</code></td><td>Node 18</td></tr>
<tr><td>Python</td><td><code>zephyrstream</code></td><td>Python 3.9</td></tr>
<tr><td>Go</td><td><code>github.com/zephyrstream/go-client</code></td><td>Go 1.21</td></tr>
<tr><td>Java</td><td><code>io.zephyrstream:client</code></td><td>JDK 11</td></tr>
<tr><td>Rust</td><td><code>zephyrstream</code> (crates.io)</td><td>Rust 1.70</td></tr>
</tbody>
</table>
<p>All SDKs expose the same conceptual interface: a <code>ZephyrClient</code> that wraps authentication, pagination, retries, and rate-limit backoff. Community-maintained libraries for other languages are listed in the project registry (not covered here).</p>`],
  ["openapi",            "OpenAPI specification",      "Where to find the machine-readable API description and how to generate client code from it.",
   `<h1>OpenAPI specification</h1>
<p>The Zephyr API is described by a machine-readable <strong>OpenAPI 3.1</strong> specification available at:</p>
<pre><code>https://api.zephyrstream.io/v1/openapi.json</code></pre>
<p>The spec includes all endpoints, request/response schemas, error codes, and security schemes.</p>
<h2>Generating client code</h2>
<p>Use <a href="#sdks">official SDKs</a> when available. For unsupported languages, generate from the spec with <code>openapi-generator-cli</code>:</p>
<pre><code>npx openapi-generator-cli generate \
  -i https://api.zephyrstream.io/v1/openapi.json \
  -g &lt;language&gt; \
  -o ./zephyr-client</code></pre>
<p>The generated client will not include Zephyr-specific retry or rate-limit logic — add that layer manually or use an official SDK.</p>`],
  ["changelog",          "API changelog (fictional)",   "A representative changelog showing the history of v1 API changes.",
   `<h1>API changelog</h1>
<h2>v1.4.0 (2025-11-01)</h2>
<ul>
<li>Added <code>wait_ms</code> long-poll parameter to <code>GET /events</code>.</li>
<li>Added per-consumer rate limiting (<code>rate_limit_rps</code> on consumer registration).</li>
<li>Added <code>GET /streams/{stream_id}/metrics/lag</code> endpoint.</li>
</ul>
<h2>v1.3.0 (2025-07-15)</h2>
<ul>
<li>Added schema validation support (<code>POST /schemas</code> and <code>schema_id</code> on stream creation).</li>
<li>Added <code>schema_validation_mode</code> configuration key.</li>
<li>Fixed: <code>next_cursor</code> was incorrectly null on the penultimate page for streams with exactly <code>limit</code> items.</li>
</ul>
<h2>v1.2.0 (2025-04-02)</h2>
<ul>
<li>Added ACL management endpoints (<code>PUT</code>/<code>GET</code>/<code>DELETE /acl</code>).</li>
<li>Added <code>acl_default_deny</code> configuration key.</li>
</ul>
<h2>v1.1.0 (2025-01-10)</h2>
<ul>
<li>Added snapshot endpoints.</li>
<li>Added replica inspection and rebalance trigger.</li>
</ul>
<h2>v1.0.0 (2024-09-01)</h2>
<ul>
<li>Initial release: streams, producers, consumers, events, checkpoints, metrics.</li>
</ul>`],
  ["support",            "Support and SLAs",           "How to contact support, escalation paths, and the published uptime SLAs for the Zephyr API.",
   `<h1>Support and SLAs</h1>
<h2>Contacting support</h2>
<p>Open a ticket at <code>support.zephyrstream.io</code>. For urgent incidents, use the in-dashboard &quot;P1 Escalation&quot; button to reach an on-call engineer.</p>
<p>Always include: account ID, stream ID (if relevant), affected time window, and the <code>request_id</code> from any error responses.</p>
<h2>Published SLAs (fictional)</h2>
<table>
<thead><tr><th>Tier</th><th>API uptime</th><th>P1 response time</th></tr></thead>
<tbody>
<tr><td>Developer</td><td>99.5 %</td><td>Next business day</td></tr>
<tr><td>Standard</td><td>99.9 %</td><td>4 hours</td></tr>
<tr><td>Enterprise</td><td>99.99 %</td><td>30 minutes</td></tr>
</tbody>
</table>
<p>SLA credits are applied as account balance. Consult your service agreement for credit calculation details.</p>`],
];

function guideSection([slug, title, summary, inner]) {
  return apiSection(`guide-${slug}`, title, summary, inner);
}

const guideSections = GUIDES.map(guideSection);

// ── 9. Additional config keys ─────────────────────────────────────────────────
const CONFIG_KEYS_2 = [
  ["consumer-initial-offset", "consumer_initial_offset", "string", "earliest",
   "Default starting offset for newly registered consumers when <code>initial_offset</code> is not specified. <code>earliest</code> = start from the oldest retained event; <code>latest</code> = start from the current head."],
  ["max-consumers-per-stream","max_consumers_per_stream","integer","200",
   "Maximum number of consumer registrations per stream. Exceeding this limit returns a 429 error. Raise at the account level via support."],
  ["max-producers-per-stream","max_producers_per_stream","integer","50",
   "Maximum number of producer registrations per stream."],
  ["max-streams-per-account","max_streams_per_account","integer","100",
   "Maximum number of streams an account may hold simultaneously. Contact support to request an increase."],
  ["snapshot-auto-purge-enabled","snapshot_auto_purge_enabled","boolean","true",
   "When true, snapshots older than <code>snapshot_ttl_days</code> are automatically purged. Set to false to retain snapshots indefinitely (subject to account quota)."],
  ["metrics-window-max-s","metrics_window_max_s","integer","86400",
   "Maximum look-back window clients may request from the metrics endpoint. Default is 24 hours; contact support to extend."],
  ["event-data-encoding","event_data_encoding","string","base64",
   "Default encoding for the <code>data</code> field of events returned by <code>GET /events</code>. <code>base64</code> or <code>json</code>. Individual consumers may override per-request via an <code>Accept-Encoding</code> hint."],
  ["tls-min-version","tls_min_version","string","TLS1.2",
   "Minimum TLS version accepted by the API gateway. <code>TLS1.2</code> or <code>TLS1.3</code>. Enterprise accounts default to <code>TLS1.3</code>."],
  ["audit-log-enabled","audit_log_enabled","boolean","false",
   "When enabled, all control-plane operations (stream creation/deletion, ACL changes, schema registration) are written to the account&#39;s audit log, accessible via the dashboard."],
  ["cors-allowed-origins","cors_allowed_origins","array of string","[]",
   "Explicit list of origins permitted in CORS preflight responses. An empty list disables CORS headers. Wildcards are not supported; enumerate each origin explicitly."],
];

function configSection2([slug, key, type, defaultVal, desc]) {
  return apiSection(
    `config-${slug}`,
    `Config: ${key}`,
    `${key} (${type}, default ${defaultVal}) — ${desc.replace(/<[^>]+>/g, "").substring(0, 100)}`,
    `<h1>Configuration key: <code>${key}</code></h1>
<table>
<thead><tr><th>Property</th><th>Value</th></tr></thead>
<tbody>
<tr><td>Type</td><td>${type}</td></tr>
<tr><td>Default</td><td><code>${defaultVal}</code></td></tr>
</tbody>
</table>
<p>${desc}</p>`
  );
}

const configSections2 = CONFIG_KEYS_2.map(configSection2);

// ── 10. Additional glossary terms ─────────────────────────────────────────────
const GLOSSARY_2 = [
  ["base64",     "Base64 encoding",         "The default encoding for event <code>data</code> payloads. Binary data is base64-encoded when appended and returned base64-encoded on read, unless the consumer requests JSON encoding."],
  ["header",     "Event header",            "Arbitrary string key-value metadata attached to an individual event by the producer. Headers are not indexed and not searchable; they are carried opaquely alongside the event payload."],
  ["leader",     "Leader replica",          "The broker replica that handles all reads and writes for a partition. Each partition has exactly one leader at any time; followers replicate from it."],
  ["follower",   "Follower replica",        "A replica that copies events from the partition leader for durability. Followers do not serve client requests; they become eligible for leader election if the current leader fails."],
  ["election",   "Leader election",         "The process by which a follower replica is promoted to leader when the current leader is unavailable. During election, the affected partition is briefly unavailable; producers receive 503 and should retry."],
  ["gateway",    "API gateway",             "The public entry point for all Zephyr client requests. The gateway handles TLS termination, authentication, rate limiting, and routes requests to the correct broker. Clients always address the gateway, never individual brokers."],
  ["ttl",        "Time-to-live (TTL)",      "The duration after which a resource is eligible for automatic purge. Used for snapshots (<code>snapshot_ttl_days</code>) and idempotency keys (<code>idempotency_window_s</code>)."],
  ["quota",      "Quota",                   "An account-level limit on resource consumption: stream count, schema count, retained bytes, producers per stream, consumers per stream. Exceeding a quota returns 429 or 507 depending on the resource type."],
  ["tenant",     "Tenant",                  "A synonym for account in Zephyr&#39;s multi-tenant architecture. Each account is isolated: its streams, schemas, principals, and data are not visible to other accounts."],
  ["partition-key","Partition key",         "The <code>key</code> field of an event, used to route the event to a deterministic partition via consistent hashing. Events with the same key always land on the same partition, preserving ordering relative to other events with that key."],
  ["ordering",   "Event ordering",          "Within a single partition, events are strictly ordered by offset. Across partitions, there is no ordering guarantee. Consumers that require total order should use a single-partition stream or impose ordering via their event model."],
  ["durability", "Durability",              "Zephyr replicates each event to at least two broker nodes before acknowledging a successful append. The replication factor is configurable (enterprise tier only); the default is 2."],
  ["replication-factor","Replication factor", "The number of broker copies maintained for each partition. Higher replication factors increase durability at the cost of write latency. Default is 2 (leader + 1 follower)."],
  ["ack",        "Acknowledgement (ack)",   "Confirmation from the Zephyr API that an append batch has been durably written to the required number of replicas. A 202 response guarantees the data will not be lost under normal broker-failure conditions."],
];

function glossarySection2([slug, term, def]) {
  return apiSection(
    `glossary-${slug}`,
    `Glossary: ${term}`,
    `Definition of &quot;${term}&quot; in the Zephyr Stream API.`,
    `<h1>Glossary: ${term}</h1>
<p>${def}</p>`
  );
}

const glossarySections2 = GLOSSARY_2.map(glossarySection2);

// ── 11. Assemble all sections (preamble is placeholder; will be patched below) ─
const SECTIONS_DRAFT = [
  preamble,
  ...resourceSections,
  ...methodSections,
  ...errorSections,
  ...configSections,
  ...configSections2,
  ...glossarySections,
  ...glossarySections2,
  ...typeSections,
  ...guideSections,
];

// Compute witness on draft preamble inner (we need counts first)
// We will patch the preamble's inner with the real section count + total chars,
// then recompute its witness.

const draftRecords = SECTIONS_DRAFT.map((s) => {
  const inner = s.inner;
  return { ...s, hash: sha256(inner), chars: cc(inner) };
});

const totalChars = draftRecords.reduce((n, r) => n + r.chars, 0);
const sectionCount = draftRecords.length;

// Patch preamble inner with real numbers
const patchedPreambleInner = preamble.inner
  .replace("SECTION_COUNT sections", `${sectionCount} sections`)
  .replace("TOTAL_CHARS characters", `${totalChars.toLocaleString()} characters`);

const records = draftRecords.map((r, i) => {
  if (i === 0) {
    return { ...r, inner: patchedPreambleInner, hash: sha256(patchedPreambleInner), chars: cc(patchedPreambleInner) };
  }
  return r;
});

// Recompute total after preamble patch
const finalTotalChars = records.reduce((n, r) => n + r.chars, 0);

const BUILD_DATE = "2026-06-15";

const manifestLinks = records
  .map((r) => `    <li><a href="#${r.id}" data-witness="${r.hash}" data-char-count="${r.chars}"><span class="title">${esc(r.title)}</span> <span class="summary">${esc(r.summary)}</span></a></li>`)
  .join("\n");

const body = records
  .map((r) => `<section id="${r.id}" data-witness="${r.hash}" data-char-count="${r.chars}">${r.inner}</section>`)
  .join("\n\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zephyr Stream API Reference — Selective-Context Demo (doc.html v0.3)</title>
<style>
  :root { --fg:#1a1a1a; --bg:#fafaf7; --muted:#666; --accent:#2a4d6e; --rule:#ddd; --code-bg:#f0ede5; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8e8e3; --bg:#1a1a1a; --muted:#999; --accent:#8ab4d4; --rule:#333; --code-bg:#252523; } }
  body { font: 16px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; color: var(--fg); background: var(--bg); }
  h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 0.6rem; }
  h2 { font-size: 1.3rem; }
  p, ul { margin: 0.8rem 0; }
  pre { background: var(--code-bg); padding: 0.8rem 1rem; border-radius: 4px; overflow-x: auto; }
  a { color: var(--accent); text-decoration: none; border-bottom: 1px solid currentColor; }
  code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 3px; font: 0.92em "SF Mono", Consolas, monospace; }
  table { border-collapse: collapse; width: 100%; margin: 0.8rem 0; }
  th, td { border: 1px solid var(--rule); padding: 0.4rem 0.6rem; text-align: left; }
  th { background: var(--code-bg); }
  section { margin: 2.5rem 0; padding: 1.5rem; background: var(--code-bg); border-radius: 8px; }
  header { margin-bottom: 1rem; }
  .header-meta { color: var(--muted); font-size: 0.9em; }
  #manifest { background: var(--code-bg); padding: 1.5rem; border-radius: 8px; margin: 2rem 0; }
  #manifest ol { list-style: decimal; padding-left: 1.5rem; }
  #manifest li { margin: 0.8rem 0; }
  #manifest .title { font-weight: 600; }
  #manifest .summary { display: block; color: var(--muted); font-size: 0.92em; }
</style>
</head>
<body>

<header>
  <h1 style="border:none;">Zephyr Stream API Reference</h1>
  <p class="header-meta">doc.html v0.3 &middot; ${BUILD_DATE} &middot; ${records.length} sections &middot; ${finalTotalChars.toLocaleString()} chars &middot; self-verifying (node verify.mjs &lt;this file&gt;)</p>
  <p>Fictional reference corpus for the doc.html v0.3 selective-context demonstration. Read the manifest below; drill to any section by its <code>#id</code>.</p>
</header>

<nav id="manifest" aria-label="Document manifest">
  <ol>
${manifestLinks}
  </ol>
</nav>

${body}

</body>
</html>
`;

fs.writeFileSync(OUT, html, { encoding: "utf8" });
console.log(`Wrote ${OUT}`);
console.log(`  ${records.length} sections, ${finalTotalChars.toLocaleString()} chars of section content`);
