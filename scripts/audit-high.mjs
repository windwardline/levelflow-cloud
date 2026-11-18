#!/usr/bin/env node
// The dependency audit, run so that "the database was unreachable" and "this
// tree has a high-severity vulnerability" are different outcomes with different
// causes — while still FAILING CLOSED on both, because a scan that examined
// nothing must never report the result of one that ran and passed.
//
// WHY THIS EXISTS. On 2026-09-03/04 npm's advisory endpoint was intermittently
// unavailable for hours. `npm audit` exits 1 on an endpoint error exactly as it
// does on a finding, so three separate runs — a local gate, a CI build and a
// production deploy — reported the audit gate as failing when the tree was
// clean, and each needed a human-initiated re-run to prove it. The signature is
// unambiguous and machine-readable: "audit endpoint returned an error",
// alongside a network timeout or a 5xx from
// registry.npmjs.org/-/npm/v1/security/advisories/bulk.
//
// A retry is not a softening. The gate still fails if the endpoint never
// answers; it simply stops reporting a provider outage as a vulnerability, and
// it says which of the two happened in the words a reader needs.
//
// AN ADVISORY WITH NO PATCHED RELEASE. Upgrading cannot clear one, so without
// an exception path this gate stays red until upstream ships, and every push
// and deploy with it: GHSA-fc5q-39xc-vjpf (picomatch, every release through
// 4.0.7) did that on 2026-11-17. The exception path is the one the fleet
// already sanctions for the OSV gate, osv-scanner.toml: an entry with an id, a
// reason and an ignoreUntil. One file governs both scanners, so an acceptance
// expires in both on the same day. The gate passes a finding only when every
// root advisory behind it has a complete, unexpired entry; anything it cannot
// read fails closed.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ATTEMPTS = Number(process.env.AUDIT_ATTEMPTS ?? 3);
const BACKOFF_MS = Number(process.env.AUDIT_BACKOFF_MS ?? 4000);
// npm's own audit timeout is about five minutes, so an unbounded retry loop
// outlasts CI's patience for the gate it is protecting: three attempts at the
// default would take a quarter of an hour to say "the endpoint is down". Each
// attempt gets its own fetch timeout, and the whole gate gets a deadline.
const FETCH_TIMEOUT_MS = Number(process.env.AUDIT_FETCH_TIMEOUT_MS ?? 45000);
const DEADLINE_MS = Number(process.env.AUDIT_DEADLINE_MS ?? 240000);
const startedAt = Date.now();
const POLICY_PATH = process.env.AUDIT_POLICY_PATH ?? "osv-scanner.toml";
// Overridable so the expiry boundary can be tested; never set in CI.
const TODAY = process.env.AUDIT_TODAY ?? new Date().toISOString().slice(0, 10);
const GATING = new Set(["high", "critical"]);

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * The accepted advisories, id -> ignoreUntil. Line-based like the fleet
 * checker's reader: every [[IgnoredVulns]] block must carry an id, a nonblank
 * reason and a real calendar date, or the whole policy is refused.
 */
function readPolicy(path) {
  if (!existsSync(path)) return new Map();
  const blocks = [];
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (line === "[[IgnoredVulns]]") { blocks.push({}); continue; }
    if (line.startsWith("[")) { blocks.push(null); continue; }
    const block = blocks.at(-1);
    if (!block) continue;
    const match = /^(id|ignoreUntil|reason)\s*=\s*(.*)$/.exec(line);
    if (match) block[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  const accepted = new Map();
  for (const block of blocks.filter(Boolean)) {
    if (!block.id) throw new Error("policy: an [[IgnoredVulns]] entry has no id");
    if (!block.reason) throw new Error(`policy: ${block.id} has no reason`);
    if (!isCalendarDate(block.ignoreUntil ?? "")) {
      throw new Error(`policy: ${block.id} has no valid ignoreUntil date (${block.ignoreUntil ?? "missing"})`);
    }
    accepted.set(block.id, block.ignoreUntil);
  }
  return accepted;
}

/** The root advisories at high or critical: the via objects, not the fan-out. */
function rootAdvisories(report) {
  const roots = new Set();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln?.via ?? []) {
      if (via && typeof via === "object" && GATING.has(via.severity)) {
        roots.add(/GHSA-[\w-]+/.exec(String(via.url ?? ""))?.[0] ?? `unidentified advisory ${via.source ?? "?"} (${via.name ?? "?"})`);
      }
    }
  }
  return roots;
}

/** Decide a finding against the policy. Returns the exit code. */
function judgeFinding(output) {
  let report;
  try {
    report = JSON.parse(output);
    if (!report || typeof report.vulnerabilities !== "object") throw new Error("no vulnerabilities object");
  } catch (error) {
    process.stdout.write(output);
    process.stderr.write(`\naudit-high: the audit report could not be read (${error.message}); failing closed.\n`);
    return 1;
  }
  const counted = Number(report.metadata?.vulnerabilities?.high ?? 0) + Number(report.metadata?.vulnerabilities?.critical ?? 0);
  const roots = rootAdvisories(report);
  if (roots.size === 0) {
    process.stderr.write(`audit-high: ${counted} high/critical finding(s) counted but no root advisory found; failing closed.\n`);
    return 1;
  }
  let accepted;
  try {
    accepted = readPolicy(POLICY_PATH);
  } catch (error) {
    process.stderr.write(`audit-high: ${error.message} in ${POLICY_PATH}; failing closed.\n`);
    return 1;
  }
  const open = [...roots].filter((id) => !(accepted.has(id) && TODAY < accepted.get(id)));
  for (const id of roots) {
    if (!open.includes(id)) process.stdout.write(`audit-high: accepted ${id} until ${accepted.get(id)} (${POLICY_PATH})\n`);
  }
  if (open.length > 0) {
    process.stderr.write(
      `audit-high: ${counted} high/critical finding(s) from ${roots.size} root advisory(ies); not accepted: ${open.join(", ")}\n`,
    );
    return 1;
  }
  process.stdout.write(`audit-high: ${counted} high/critical finding(s), all from ${roots.size} accepted advisory(ies).\n`);
  return 0;
}

/** The endpoint failed, as distinct from the tree failing. Both exit 1 from npm. */
function isEndpointFailure(output) {
  return /audit endpoint returned an error/i.test(output) ||
    /audit .*(network timeout|ENOTFOUND|ECONNRESET|EAI_AGAIN)/i.test(output) ||
    /audit \d{3} (Service Unavailable|Bad Gateway|Gateway Time-?out|Internal Server Error)/i.test(output);
}

/**
 * The npm that runs THIS script exports its own configuration as npm_config_*,
 * and the child npm rejects some of it outright — `--allow-scripts is not
 * allowed in project-scoped installs` (EALLOWSCRIPTS), which would make the
 * gate fail for a third reason that is neither an outage nor a vulnerability.
 * The child gets a clean environment and reads the project's own .npmrc.
 */
function childEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("npm_config_") && key !== "npm_command" && key !== "npm_execpath") {
      env[key] = value;
    }
  }
  return env;
}

function runAudit() {
  const result = spawnSync(
    "npm",
    ["audit", "--json", "--audit-level=high", `--fetch-timeout=${FETCH_TIMEOUT_MS}`, "--fetch-retries=0"],
    { encoding: "utf8", env: childEnv() },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { code: result.status ?? 1, output, stdout: result.stdout ?? "" };
}

let last = { code: 1, output: "", stdout: "" };
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  last = runAudit();
  if (last.code === 0) {
    process.stdout.write(last.output);
    process.exit(0);
  }
  if (!isEndpointFailure(last.output)) {
    // A real finding, judged once against the policy and never retried —
    // retrying a vulnerability would only delay the same answer.
    process.exit(judgeFinding(last.stdout));
  }
  if (Date.now() - startedAt > DEADLINE_MS) {
    process.stderr.write(
      `audit-high: giving up after ${Math.round((Date.now() - startedAt) / 1000)}s — the gate must not outlast ` +
        `the run it protects\n`,
    );
    break;
  }
  if (attempt < ATTEMPTS) {
    const wait = BACKOFF_MS * attempt;
    process.stderr.write(
      `audit-high: the advisory endpoint did not answer (attempt ${attempt} of ${ATTEMPTS}); retrying in ${wait}ms\n`,
    );
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
  }
}

process.stdout.write(last.output);
process.stderr.write(
  `\naudit-high: REFUSING. npm's advisory endpoint did not answer in ${ATTEMPTS} attempts, so this tree was ` +
    `NOT audited — that is a different failure from a vulnerability, and it fails closed for the same reason ` +
    `either way: a scan that examined nothing must not report the result of one that ran and passed.\n`,
);
process.exit(1);
