import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { describe, it } from "node:test";

import { noKeychainBin } from "./support/noKeychain.ts";
import { durableScratchDir, scratchDir } from "./support/scratchDir.ts";

/**
 * The launchd wrappers, EXECUTED — not matched as text.
 *
 * Each test runs a byte-identical copy of the real wrapper (and the lock
 * helper it sources) from a scratch tree shaped like `wl-repo-script`'s
 * extraction, with `LEVELFLOW_CHECKOUT` naming a scratch checkout. The tree's
 * `node_modules/.bin/tsx` is a stub that logs its arguments and plays the gate,
 * the driver and the marker writer, so a test states what each step printed
 * and returned and reads what the wrapper did with it. `security` is a stub
 * that answers with a fake key, and behind it on PATH sits the suite's
 * refusing stub (tests/support/noKeychain.ts): if ours were lost, the real
 * keychain still could not answer.
 *
 * The store is the one thing outside the temporary roots
 * (`durableScratchDir`), because the wrappers refuse a temp-rooted store
 * before the keychain. That refusal is a barrier against a real driver; here
 * the driver is always the stub, so no test can reach the provider.
 *
 * The exit code is the whole contract: launchd records it, and
 * `ops/agent-exit-status.sh` reads it. A top-up that stands down green on a
 * 402 (09-07T11:00:05Z did) or on a whole-output grep that matched a
 * tolerated warning is a failure nobody will see.
 */

const BREAKER_LINE_2026_09_07 =
  "fmpCircuitOpen: FMP circuit open for 62.4h — HTTP 402 Restricted Endpoint: " +
  "This endpoint is not available under your current subscription please visit " +
  "our subscription page to upgrade your plan at https://financialmodelingprep.com/. " +
  "Next probe in 0.3h. The trailing-30-day window drains by time only, so " +
  "re-running cannot shorten it.";

const TSX_STUB = `#!/bin/bash
printf '%s\\n' "tsx $*" >> "$STUB_LOG"
case "$*" in
  *fmpRunGate.ts*--record-clean*) exit "\${STUB_RECORD_RC:-0}" ;;
  *fmpRunGate.ts*)
    if [ -n "\${STUB_GATE_OUT:-}" ]; then printf '%s\\n' "$STUB_GATE_OUT"; fi
    exit "\${STUB_GATE_RC:-0}"
    ;;
  *)
    cat "$STUB_DRIVER_OUT"
    exit "\${STUB_DRIVER_RC:-0}"
    ;;
esac
`;

const SECURITY_STUB = `#!/bin/bash
printf '%s\\n' "security" >> "$STUB_LOG"
echo stub-key
`;

function sandbox(wrapper: string) {
  const root = scratchDir("ops-wrapper-");
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  const ops = join(repo, "scripts", "ops");
  mkdirSync(ops, { recursive: true });
  mkdirSync(join(repo, "node_modules", ".bin"), { recursive: true });
  mkdirSync(bin);
  const script = join(ops, basename(wrapper));
  copyFileSync(wrapper, script);
  copyFileSync("scripts/ops/bank-lock.sh", join(ops, "bank-lock.sh"));
  assert.equal(readFileSync(script, "utf8"), readFileSync(wrapper, "utf8"), "the copy is the real wrapper");
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  writeFileSync(tsx, TSX_STUB);
  writeFileSync(join(bin, "security"), SECURITY_STUB);
  chmodSync(tsx, 0o755);
  chmodSync(join(bin, "security"), 0o755);
  // One level inside its own directory, so the bank's `<bank>.lock` sibling
  // lands inside it too and goes when it goes.
  const store = join(durableScratchDir("ops-wrapper-store-"), "store");
  mkdirSync(store);
  const PATH = `${bin}:${noKeychainBin()}:/usr/bin:/bin`;
  const resolved = spawnSync("/bin/bash", ["-c", "command -v security"], {
    encoding: "utf8",
    env: { PATH },
  }).stdout.trim();
  assert.equal(resolved, join(bin, "security"), "the Keychain stub must shadow the real security binary");
  return { PATH, repo, root, script, store };
}

type Step = { out?: string; rc?: number };

function run(wrapper: string, steps: { gate?: Step; driver?: Step; record?: Step }) {
  const box = sandbox(wrapper);
  const log = join(box.root, "calls.log");
  const driverOut = join(box.root, "driver.out");
  writeFileSync(log, "");
  writeFileSync(driverOut, steps.driver?.out ?? "");
  const result = spawnSync("/bin/bash", [box.script], {
    encoding: "utf8",
    env: {
      LEVELFLOW_BANK_DIR: box.store,
      LEVELFLOW_BANK_LOCK_TIMEOUT: "5",
      LEVELFLOW_CACHE_DIR: box.store,
      LEVELFLOW_CHECKOUT: box.repo,
      PATH: box.PATH,
      STUB_DRIVER_OUT: driverOut,
      STUB_DRIVER_RC: String(steps.driver?.rc ?? 0),
      STUB_GATE_OUT: steps.gate?.out ?? "runGate: run job=test reason=noCleanRun",
      STUB_GATE_RC: String(steps.gate?.rc ?? 0),
      STUB_LOG: log,
      STUB_RECORD_RC: String(steps.record?.rc ?? 0),
    },
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { calls, code: result.status, output: `${result.stdout}${result.stderr}`, repo: box.repo, store: box.store };
}

const TOPUP = "scripts/ops/daily-cache-topup.sh";
const BANK = "scripts/ops/bank-minute-bars-daily.sh";
const SKIP_LINE = "runGate: skip job=cache-topup now=2026-09-16T03:39:43.000Z reason=cleanRunCoversNextSlot";
const driverCalls = (calls: string[]) =>
  calls.filter((call) => call.includes("replay-sweep.ts") || call.includes("bank-minute-bars.ts"));

describe("the nightly top-up wrapper, executed", () => {
  it("skips on the gate's 75 and its skip line, before the Keychain or the driver", () => {
    const result = run(TOPUP, { gate: { out: SKIP_LINE, rc: 75 } });
    assert.equal(result.code, 0);
    assert.deepEqual(result.calls, [`tsx ${result.repo}/scripts/fmpRunGate.ts --job cache-topup`]);
    assert.match(result.output, /skipped by the run gate/);
  });

  it("runs when 75 arrives without the skip line, and when the gate fails", () => {
    for (const gate of [{ out: "something else", rc: 75 }, { out: "TypeError: boom", rc: 1 }]) {
      const result = run(TOPUP, { gate });
      assert.equal(driverCalls(result.calls).length, 1, JSON.stringify(gate));
      assert.ok(result.calls.includes("security"));
    }
  });

  it("records the clean run after the driver succeeds, as the top-up class", () => {
    const result = run(TOPUP, { driver: { out: "EURUSD\twarm", rc: 0 } });
    assert.equal(result.code, 0);
    const driver = result.calls.findIndex((call) => call.includes("replay-sweep.ts"));
    const record = result.calls.findIndex((call) => call.includes("--record-clean"));
    assert.ok(driver >= 0 && record > driver, result.calls.join("\n"));
    assert.match(result.calls[driver], /--warm-only --spend-class topup --byte-budget 256mb/);
    assert.match(result.calls[driver], new RegExp(`--cache-dir ${result.store} `), "the sweep is handed the named cache");
  });

  it("still exits 0 when the marker cannot be written, and says so", () => {
    const result = run(TOPUP, { driver: { rc: 0 }, record: { rc: 1 } });
    assert.equal(result.code, 0);
    assert.match(result.output, /run marker not written \(exit 1\)/);
  });

  it("stands down green on a bandwidth wall alone, and records nothing", () => {
    const result = run(TOPUP, { driver: { out: "fmpStandDown: kind=bandwidth source=provider\nError: ...", rc: 1 } });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /STOOD DOWN: FMP bandwidth allowance exhausted/);
    assert.equal(result.calls.some((call) => call.includes("--record-clean")), false);
  });

  for (
    const token of [
      "fmpStandDown: kind=entitlement source=provider",
      "fmpStandDown: kind=suspended source=provider",
      "fmpStandDown: kind=invalidKey source=provider",
      "fmpStandDown: kind=unclassified source=provider",
      "fmpStandDown: kind=dailyCeiling source=governor",
      "fmpStandDown: kind=runBudget source=governor",
      "fmpStandDown: kind=ledgerWriteFailed source=governor",
      "fmpStandDown: kind=ledgerMissing source=governor",
      "fmpStandDown: kind=bandwidth source=breaker",
    ]
  ) {
    const green = token === "fmpStandDown: kind=bandwidth source=breaker";
    it(`${green ? "stands down" : "goes red"} on ${token}`, () => {
      const result = run(TOPUP, { driver: { out: `${token}\nError: refused`, rc: 1 } });
      assert.equal(result.code, green ? 0 : 1, result.output);
    });
  }

  for (
    const [name, out] of [
      ["the 09-07T11:00:05Z breaker refusal, which carries no terminal token", BREAKER_LINE_2026_09_07],
      ["a provider 429 with no token", "Error: FMP request failed (429) for /stable/historical-chart/5min"],
      [
        "a tolerated treasury bandwidth warning followed by an unrelated TypeError",
        'treasury top-up failed — bar survey continues without it: FMP request failed (status 429) for /stable/treasury-rates: {"Error Message": "Bandwidth Limit Reach . Please upgrade your plan"}\nTypeError: Cannot read properties of undefined',
      ],
      [
        "a deferred COT entitlement beside a bandwidth stand-down",
        "fmpDeferredRefusal: kind=entitlement source=cot\nfmpStandDown: kind=bandwidth source=provider",
      ],
      [
        "a deferred clock warning followed by an unrelated TypeError",
        "treasury refusal deferred to end of survey — bars still warm, run exits red after the table: cacheClockMismatch: treasury-rates\nTypeError: boom",
      ],
      [
        "two terminal tokens",
        "fmpStandDown: kind=bandwidth source=provider\ncacheStandDown: kind=clockMismatch",
      ],
      [
        "an integrity token beside a bandwidth stand-down",
        "treasuryChunkHole: a zero-row week\nfmpStandDown: kind=bandwidth source=provider",
      ],
      [
        "a bookkeeping failure beside a bandwidth stand-down",
        "fmpBookkeepingFailed: replay-sweep usage record: EACCES\nfmpStandDown: kind=bandwidth source=provider",
      ],
    ] as const
  ) {
    it(`goes red on ${name}`, () => {
      const result = run(TOPUP, { driver: { out, rc: 1 } });
      assert.equal(result.code, 1, result.output);
    });
  }

  // The driver exits 0 when a bookkeeping failure happens on a path that warns
  // and continues (a COT refusal no wall explains, a tolerated treasury
  // warning) and nothing later throws. Reproduced 2026-09-16: the must-stay-red
  // guard sat below the exit-0 branch, so this printed "top-up complete" and
  // recorded a clean marker over spend the ledger never saw.
  for (
    const token of [
      "fmpBookkeepingFailed: replay-sweep refusal usage: ENOSPC: no space left on device",
      "fmpDeferredRefusal: kind=entitlement source=cot",
    ]
  ) {
    it(`goes red and records no marker on a driver exit 0 carrying ${token.split(":")[0]}`, () => {
      const result = run(TOPUP, { driver: { out: `COT fetch failed for E6: status 500\n${token}`, rc: 0 } });
      assert.equal(result.code, 1, result.output);
      assert.equal(result.calls.some((call) => call.includes("--record-clean")), false, result.calls.join("\n"));
      assert.doesNotMatch(result.output, /top-up complete/);
      assert.match(result.output, /must-stay-red refusal/);
    });
  }

  it("stands down green on a terminal store-clock refusal", () => {
    const result = run(TOPUP, {
      driver: { out: "cacheClockMismatch: EURUSD-15min-max\ncacheStandDown: kind=clockMismatch\nError: cacheClockMismatch", rc: 1 },
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /docs\/cache-rebuild-r0\.md/);
  });
});

describe("the minute-bank wrapper, executed", () => {
  it("skips on the gate's 75 and its skip line without running the bank", () => {
    const result = run(BANK, {
      gate: { out: "runGate: skip job=minute-bank now=2026-09-16T03:39:42.000Z reason=cleanRunCoversNextSlot", rc: 75 },
    });
    assert.equal(result.code, 0);
    assert.equal(driverCalls(result.calls).length, 0);
    assert.equal(result.calls.includes("security"), false);
  });

  it("runs the bank when 75 arrives without the skip line, and when the gate fails", () => {
    for (const gate of [{ out: "something else", rc: 75 }, { out: "TypeError: boom", rc: 1 }]) {
      const result = run(BANK, { gate });
      assert.equal(driverCalls(result.calls).length, 1, JSON.stringify(gate));
    }
  });

  it("gates and runs the bank on the named store", () => {
    const result = run(BANK, {});
    assert.equal(result.code, 0, result.output);
    assert.equal(result.calls[0], `tsx ${result.repo}/scripts/fmpRunGate.ts --job minute-bank --dir ${result.store}`);
    assert.deepEqual(driverCalls(result.calls), [`tsx ${result.repo}/scripts/bank-minute-bars.ts --dir ${result.store}`]);
    assert.equal(existsSync(`${result.store}.lock`), false, "the bank run left its lock behind");
  });

  it("exits red when the bank does", () => {
    const result = run(BANK, { driver: { rc: 1 } });
    assert.equal(result.code, 1);
  });
});
