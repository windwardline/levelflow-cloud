import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * The dependency audit must tell two failures apart.
 *
 * `npm audit` exits 1 when the tree has a vulnerability AND when npm's advisory
 * endpoint does not answer. On 2026-09-03/04 that endpoint was intermittently
 * unavailable for hours, and three separate runs — a local gate, a CI build and
 * a production deploy — reported the audit gate failing on a clean tree, each
 * needing a human-initiated re-run to prove it.
 *
 * The runner retries an endpoint failure and never retries a finding, and it
 * FAILS CLOSED either way: a scan that examined nothing must not report the
 * result of one that ran and passed. These tests drive it with a stub `npm` on
 * PATH, because the real endpoint's behaviour is exactly what cannot be relied
 * on to reproduce.
 */

const RUNNER = new URL("../scripts/audit-high.mjs", import.meta.url).pathname;

function withStubNpm(body: string, run: (dir: string) => ReturnType<typeof spawnSync>) {
  const dir = mkdtempSync(join(tmpdir(), "audit-high-"));
  try {
    mkdirSync(join(dir, "bin"), { recursive: true });
    const stub = join(dir, "bin", "npm");
    writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${join(dir, "calls.txt")}"\n${body}\n`);
    chmodSync(stub, 0o755);
    return { dir, result: run(dir) };
  } finally {
    // the caller reads calls.txt before this runs, so removal is deferred
  }
}

function calls(dir: string): string[] {
  try {
    return readFileSync(join(dir, "calls.txt"), "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function runWith(dir: string, extraEnv: Record<string, string> = {}) {
  return spawnSync("node", [RUNNER], {
    encoding: "utf8",
    env: {
      ...process.env,
      AUDIT_ATTEMPTS: "3",
      AUDIT_BACKOFF_MS: "1",
      AUDIT_DEADLINE_MS: "20000",
      PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}`,
      ...extraEnv,
    },
  });
}

describe("the audit gate tells an outage from a vulnerability", () => {
  it("passes a clean tree, once", () => {
    const { dir, result } = withStubNpm('echo "found 0 vulnerabilities"\nexit 0', (d) => runWith(d));
    try {
      assert.equal(result.status, 0, String(result.stderr));
      assert.equal(calls(dir).length, 1, "a clean audit must not be run twice");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("fails a real finding IMMEDIATELY — retrying a vulnerability only delays the same answer", () => {
    const { dir, result } = withStubNpm(
      'echo "1 high severity vulnerability"\nexit 1',
      (d) => runWith(d),
    );
    try {
      assert.equal(result.status, 1);
      assert.equal(calls(dir).length, 1, "a finding must not be retried");
      assert.doesNotMatch(String(result.stderr), /REFUSING/, "a finding is not an outage and must not be reported as one");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("retries an endpoint outage, then FAILS CLOSED naming the cause", () => {
    const { dir, result } = withStubNpm(
      'echo "npm error audit endpoint returned an error" 1>&2\nexit 1',
      (d) => runWith(d),
    );
    try {
      assert.equal(result.status, 1, "an unaudited tree must never pass");
      assert.equal(calls(dir).length, 3, "the endpoint failure must be retried to the attempt limit");
      assert.match(String(result.stderr), /REFUSING/);
      assert.match(String(result.stderr), /NOT audited/, "the message must say the tree was not audited, not that it is vulnerable");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("recovers when a later attempt reaches the endpoint", () => {
    // The whole point: a transient outage costs a few seconds, not a red gate
    // and a human re-run.
    const { dir, result } = withStubNpm(
      `n=$(cat "$(dirname "$0")/../count" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "$(dirname "$0")/../count"\n` +
        'if [ "$n" -lt 3 ]; then echo "npm error audit endpoint returned an error" 1>&2; exit 1; fi\n' +
        'echo "found 0 vulnerabilities"\nexit 0',
      (d) => runWith(d),
    );
    try {
      assert.equal(result.status, 0, `a recovered endpoint must pass: ${String(result.stderr)}`);
      assert.equal(calls(dir).length, 3);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("strips the parent npm's configuration, which the child rejects outright", () => {
    // npm exports npm_config_* to its children and the child npm refuses some
    // of it (EALLOWSCRIPTS on a project-scoped install) — a third failure that
    // is neither an outage nor a vulnerability, and the first version hit it.
    const { dir, result } = withStubNpm(
      'if [ -n "$npm_config_allow_scripts" ]; then echo "leaked npm_config_allow_scripts" 1>&2; exit 9; fi\n' +
        'echo "found 0 vulnerabilities"\nexit 0',
      (d) => runWith(d, { npm_config_allow_scripts: "true" }),
    );
    try {
      assert.equal(result.status, 0, String(result.stderr));
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
