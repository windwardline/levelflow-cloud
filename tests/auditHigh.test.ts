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

/**
 * An advisory with no patched release cannot be fixed by upgrading, so without
 * an exception path this gate stays red until upstream ships — and every push
 * and deploy with it. On 2026-11-17 GHSA-fc5q-39xc-vjpf (picomatch, every
 * release through 4.0.7) did exactly that. The exception path is the one the
 * fleet already sanctions for the OSV gate: an `osv-scanner.toml` entry with a
 * reason and an `ignoreUntil`. One policy file governs both scanners, so an
 * acceptance expires in both on the same day.
 */
describe("the audit gate honours the expiring osv-scanner.toml policy", () => {
  // The real shape of `npm audit --json`: one root advisory (a `via` object)
  // fanned out through its dependents (`via` strings).
  const auditJson = (ghsa: string, severity = "high") =>
    JSON.stringify({
      vulnerabilities: {
        picomatch: {
          name: "picomatch",
          severity,
          via: [{ source: 1, name: "picomatch", severity, url: `https://github.com/advisories/${ghsa}`, range: "<=4.0.7" }],
        },
        vite: { name: "vite", severity, via: ["picomatch"] },
      },
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: severity === "high" ? 2 : 0, critical: severity === "critical" ? 2 : 0, total: 2 } },
    });

  function withPolicyAndAudit(policy: string | null, audit: string, today = "2026-11-18") {
    const { dir, result } = withStubNpm(`cat "$(dirname "$0")/../audit.json"\nexit 1`, (d) => {
      writeFileSync(join(d, "audit.json"), audit);
      if (policy !== null) writeFileSync(join(d, "osv-scanner.toml"), policy);
      return runWith(d, { AUDIT_POLICY_PATH: join(d, "osv-scanner.toml"), AUDIT_TODAY: today });
    });
    return { dir, result };
  }

  const entry = (id: string, until: string, reason = "No patched release; dev tooling only.") =>
    `[[IgnoredVulns]]\nid = "${id}"\nignoreUntil = ${until}\nreason = "${reason}"\n`;

  const cases: Array<[string, string | null, string, string, number, RegExp]> = [
    ["passes when every root advisory is accepted and unexpired", entry("GHSA-fc5q-39xc-vjpf", "2026-12-17"), auditJson("GHSA-fc5q-39xc-vjpf"), "2026-11-18", 0, /accepted GHSA-fc5q-39xc-vjpf until 2026-12-17/],
    ["fails an advisory the policy does not name", entry("GHSA-aaaa-bbbb-cccc", "2026-12-17"), auditJson("GHSA-fc5q-39xc-vjpf"), "2026-11-18", 1, /not accepted: GHSA-fc5q-39xc-vjpf/],
    ["fails once the acceptance has expired, on the expiry day itself", entry("GHSA-fc5q-39xc-vjpf", "2026-12-17"), auditJson("GHSA-fc5q-39xc-vjpf"), "2026-12-17", 1, /not accepted: GHSA-fc5q-39xc-vjpf/],
    ["fails when there is no policy file", null, auditJson("GHSA-fc5q-39xc-vjpf"), "2026-11-18", 1, /not accepted: GHSA-fc5q-39xc-vjpf/],
    ["fails closed on an entry without a reason", `[[IgnoredVulns]]\nid = "GHSA-fc5q-39xc-vjpf"\nignoreUntil = 2026-12-17\n`, auditJson("GHSA-fc5q-39xc-vjpf"), "2026-11-18", 1, /policy.*reason/i],
    ["fails closed on an impossible date", entry("GHSA-fc5q-39xc-vjpf", "2026-02-30"), auditJson("GHSA-fc5q-39xc-vjpf"), "2026-11-18", 1, /policy.*ignoreUntil/i],
    ["fails closed when findings are counted but no root advisory is found", entry("GHSA-fc5q-39xc-vjpf", "2026-12-17"), JSON.stringify({ vulnerabilities: { vite: { severity: "high", via: ["picomatch"] } }, metadata: { vulnerabilities: { high: 1, critical: 0 } } }), "2026-11-18", 1, /no root advisory/i],
    ["fails closed on output that is not an audit report", entry("GHSA-fc5q-39xc-vjpf", "2026-12-17"), "not json", "2026-11-18", 1, /could not be read/i],
  ];

  for (const [name, policy, audit, today, status, message] of cases) {
    it(name, () => {
      const { dir, result } = withPolicyAndAudit(policy, audit, today);
      try {
        assert.equal(result.status, status, `${String(result.stdout)}\n${String(result.stderr)}`);
        assert.match(`${String(result.stdout)}${String(result.stderr)}`, message);
        assert.equal(calls(dir).length, 1, "a finding is read once, never retried");
        assert.match(calls(dir)[0] ?? "", /--json/, "the gate must read the machine-readable report");
      } finally {
        rmSync(dir, { force: true, recursive: true });
      }
    });
  }
});

describe("the audit report is read from stdout alone", () => {
  it("parses the report when npm also writes warnings to stderr", () => {
    // Measured 2026-11-17: npm warns about allowScripts on stderr beside the
    // JSON on stdout, and a combined read could not parse the report.
    const audit = JSON.stringify({
      vulnerabilities: { picomatch: { severity: "high", via: [{ source: 1, name: "picomatch", severity: "high", url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf" }] } },
      metadata: { vulnerabilities: { high: 1, critical: 0 } },
    });
    const { dir, result } = withStubNpm(
      `echo "npm warn install-scripts allow-scripts setting is being ignored" 1>&2\ncat "$(dirname "$0")/../audit.json"\nexit 1`,
      (d) => {
        writeFileSync(join(d, "audit.json"), audit);
        writeFileSync(join(d, "osv-scanner.toml"), `[[IgnoredVulns]]\nid = "GHSA-fc5q-39xc-vjpf"\nignoreUntil = 2026-12-17\nreason = "No patched release."\n`);
        return runWith(d, { AUDIT_POLICY_PATH: join(d, "osv-scanner.toml"), AUDIT_TODAY: "2026-11-18" });
      },
    );
    try {
      assert.equal(result.status, 0, `${String(result.stdout)}\n${String(result.stderr)}`);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
