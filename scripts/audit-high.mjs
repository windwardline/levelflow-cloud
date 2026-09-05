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
import { spawnSync } from "node:child_process";

const ATTEMPTS = Number(process.env.AUDIT_ATTEMPTS ?? 3);
const BACKOFF_MS = Number(process.env.AUDIT_BACKOFF_MS ?? 4000);
// npm's own audit timeout is about five minutes, so an unbounded retry loop
// outlasts CI's patience for the gate it is protecting: three attempts at the
// default would take a quarter of an hour to say "the endpoint is down". Each
// attempt gets its own fetch timeout, and the whole gate gets a deadline.
const FETCH_TIMEOUT_MS = Number(process.env.AUDIT_FETCH_TIMEOUT_MS ?? 45000);
const DEADLINE_MS = Number(process.env.AUDIT_DEADLINE_MS ?? 240000);
const startedAt = Date.now();

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
    ["audit", "--audit-level=high", `--fetch-timeout=${FETCH_TIMEOUT_MS}`, "--fetch-retries=0"],
    { encoding: "utf8", env: childEnv() },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { code: result.status ?? 1, output };
}

let last = { code: 1, output: "" };
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  last = runAudit();
  if (last.code === 0) {
    process.stdout.write(last.output);
    process.exit(0);
  }
  if (!isEndpointFailure(last.output)) {
    // A real finding. Print it and fail, unretried — retrying a vulnerability
    // would only delay the same answer.
    process.stdout.write(last.output);
    process.exit(last.code);
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
