import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  decideRun,
  nextSlotAfter,
  parseCalendarSlots,
  PLISTS,
  previousSlotAtOrBefore,
  RUN_GATE_SKIP_EXIT,
  runGateCli,
  writeRunMarker,
} from "../scripts/fmpRunGate.ts";
import { tempState } from "./fixtures/fmpTestState.ts";
import { scratchDir } from "./support/scratchDir.ts";

// The slots in the plists are local wall-clock times; launchd runs this
// machine in New York. Set before any local-time arithmetic below.
process.env.TZ = "America/New_York";

/**
 * Every boot fires both FMP jobs, because both plists set RunAtLoad and a
 * machine that was off at 07:00 must still catch up. Six boots between 09-12
 * and 09-16 each fired them — and a boot three hours after a clean run buys
 * the same overlap the next scheduled slot will buy again.
 *
 * ONE RULE: skip only when the last clean run finished at or after the most
 * recent scheduled slot. Every boot until the next slot is then covered, and a
 * slot run is skipped only as the duplicate of a clean run that finished after
 * that slot. The first rule measured a fixed 12h or 24h from the clean run to
 * the next slot; on the spring-forward night the gap between slots is 11h or
 * 23h, and that rule skipped the slot itself (2027-03-14T00:20Z and
 * 2027-03-13T12:00Z, executed 2026-09-16).
 */

const bankSlots = parseCalendarSlots(readFileSync(PLISTS["minute-bank"], "utf8"));
const topupSlots = parseCalendarSlots(readFileSync(PLISTS["cache-topup"], "utf8"));
const DIR = "/stores/minute-bank";

const bank = (now: string, lastClean: string | null) =>
  decideRun({
    dir: DIR,
    job: "minute-bank",
    marker: lastClean === null ? null : { atMs: Date.parse(lastClean), dir: DIR },
    nowMs: Date.parse(now),
    slots: bankSlots,
  }).action;
const topup = (now: string, lastClean: string | null) =>
  decideRun({
    job: "cache-topup",
    marker: lastClean === null ? null : { atMs: Date.parse(lastClean) },
    nowMs: Date.parse(now),
    slots: topupSlots,
  }).action;

describe("the slots are read from the tracked plists", () => {
  it("parses an array of intervals and a single interval", () => {
    assert.deepEqual(bankSlots, [{ hour: 7, minute: 20 }, { hour: 19, minute: 20 }]);
    assert.deepEqual(topupSlots, [{ hour: 7, minute: 0 }]);
  });

  it("returns null rather than an empty schedule for anything it cannot read", () => {
    assert.equal(parseCalendarSlots("garbage"), null);
    assert.equal(
      parseCalendarSlots("<key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer></dict>"),
      null,
    );
    assert.equal(
      parseCalendarSlots(
        "<key>StartCalendarInterval</key><dict><key>Hour</key><integer>25</integer><key>Minute</key><integer>0</integer></dict>",
      ),
      null,
    );
  });

  it("finds the next slot in local time across a DST change", () => {
    assert.equal(
      new Date(nextSlotAfter(Date.parse("2026-11-01T12:00:00Z"), bankSlots!)).toISOString(),
      "2026-11-01T12:20:00.000Z",
    );
    assert.equal(
      new Date(nextSlotAfter(Date.parse("2026-09-16T12:54:59Z"), bankSlots!)).toISOString(),
      "2026-09-16T23:20:00.000Z",
    );
  });
});

describe("the gate decides from the last clean run and the most recent slot", () => {
  it("replays 2026-09-16 from the logs", () => {
    // Minute bank: boot, boot, boot, slot.
    assert.equal(bank("2026-09-16T03:39:42Z", "2026-09-15T23:20:09Z"), "skip");
    assert.equal(bank("2026-09-16T12:54:59Z", "2026-09-15T23:20:09Z"), "run");
    assert.equal(bank("2026-09-16T21:36:34Z", "2026-09-16T12:55:07Z"), "skip");
    assert.equal(bank("2026-09-16T23:20:06Z", "2026-09-16T12:55:07Z"), "run");
    // Top-up: boot, boot, boot.
    assert.equal(topup("2026-09-16T03:39:43Z", "2026-09-15T11:02:39Z"), "skip");
    assert.equal(topup("2026-09-16T12:54:59Z", "2026-09-15T11:02:39Z"), "run");
    assert.equal(topup("2026-09-16T21:36:34Z", "2026-09-16T12:56:18Z"), "skip");
  });

  it("runs a boot when no clean run followed the most recent slot", () => {
    // 07:30 EDT: the 07:20 slot (11:20Z) has passed, and the last clean run
    // (00:00Z) came before it, so nothing covers this boot. It runs, however
    // recent the clean run looks.
    assert.equal(bank("2026-09-17T11:30:00Z", "2026-09-17T00:00:00Z"), "run");
  });

  it("runs a slot and skips only its duplicate", () => {
    assert.equal(bank("2026-09-17T11:20:05Z", "2026-09-16T23:20:10Z"), "run");
    assert.equal(bank("2026-09-17T11:20:40Z", "2026-09-17T11:20:10Z"), "skip");
  });

  it("runs every slot across both DST changes", () => {
    assert.equal(bank("2026-11-01T12:20:05Z", "2026-10-31T23:20:10Z"), "run");
    assert.equal(bank("2026-11-02T00:20:05Z", "2026-11-01T12:20:10Z"), "run");
    assert.equal(bank("2027-03-14T23:20:05Z", "2027-03-14T12:20:10Z"), "run");
  });

  it("runs the slot on the spring-forward night, when slots sit 11h and 23h apart", () => {
    // 2027-03-13 19:20 EST is 2027-03-14T00:20Z; the next slot, 07:20 EDT, is
    // 11:20Z, eleven hours later. A clean run 50 minutes before the slot
    // finished before it, so the slot must run; a boot after it is covered.
    assert.equal(bank("2027-03-14T00:20:05Z", "2027-03-13T23:30:00Z"), "run");
    assert.equal(bank("2027-03-14T03:00:00Z", "2027-03-14T00:20:40Z"), "skip");
    assert.equal(bank("2027-03-14T11:20:05Z", "2027-03-14T00:20:40Z"), "run");
    // The top-up's 07:00 EST slot on 03-13 is 12:00Z; 07:00 EDT on 03-14 is
    // 11:00Z, twenty-three hours later.
    assert.equal(topup("2027-03-13T12:00:05Z", "2027-03-13T11:30:00Z"), "run");
    assert.equal(topup("2027-03-14T02:00:00Z", "2027-03-13T12:01:00Z"), "skip");
    assert.equal(topup("2027-03-14T11:00:05Z", "2027-03-13T12:01:00Z"), "run");
    // And the fall-back night, when the bank's slots sit 13h apart.
    assert.equal(bank("2026-11-01T12:20:05Z", "2026-10-31T23:25:00Z"), "run");
    assert.equal(bank("2026-11-01T05:00:00Z", "2026-10-31T23:25:00Z"), "skip");
  });

  it("finds the most recent slot at or before now, in local time", () => {
    assert.equal(
      new Date(previousSlotAtOrBefore(Date.parse("2027-03-14T00:20:05Z"), bankSlots!)).toISOString(),
      "2027-03-14T00:20:00.000Z",
    );
    assert.equal(
      new Date(previousSlotAtOrBefore(Date.parse("2027-03-14T00:20:00Z"), bankSlots!)).toISOString(),
      "2027-03-14T00:20:00.000Z",
    );
    assert.equal(
      new Date(previousSlotAtOrBefore(Date.parse("2027-03-14T11:19:59Z"), bankSlots!)).toISOString(),
      "2027-03-14T00:20:00.000Z",
    );
  });

  it("runs on a marker from the future, from another store, or with no readable slots", () => {
    assert.equal(bank("2026-09-16T03:39:42Z", "2026-09-16T05:00:00Z"), "run");
    assert.equal(
      decideRun({
        dir: DIR,
        job: "minute-bank",
        marker: { atMs: Date.parse("2026-09-15T23:20:09Z"), dir: "/elsewhere" },
        nowMs: Date.parse("2026-09-16T03:39:42Z"),
        slots: bankSlots,
      }).action,
      "run",
    );
    assert.equal(
      decideRun({
        dir: DIR,
        job: "minute-bank",
        marker: { atMs: Date.parse("2026-09-15T23:20:09Z"), dir: DIR },
        nowMs: Date.parse("2026-09-16T03:39:42Z"),
        slots: null,
      }).action,
      "run",
    );
    assert.equal(bank("2026-09-16T03:39:42Z", null), "run");
  });
});

describe("the CLI skips with 75 and runs on everything else", () => {
  const repoCopy = () => {
    const root = scratchDir("run-gate-repo-");
    mkdirSync(join(root, "scripts", "ops"), { recursive: true });
    for (const path of Object.values(PLISTS)) copyFileSync(path, join(root, path));
    return root;
  };

  it("returns 75 with its decision line only on a skip", () => {
    const state = tempState();
    mkdirSync(state.canonicalBankDir, { recursive: true });
    const lines: string[] = [];
    const deps = { now: () => Date.parse("2026-09-16T03:39:42Z"), print: (line: string) => lines.push(line), repoRoot: repoCopy(), state: () => state };
    const argv = ["--job", "minute-bank", "--dir", state.canonicalBankDir];
    assert.equal(runGateCli(argv, deps), 0);
    assert.match(lines.at(-1)!, /^runGate: run job=minute-bank now=2026-09-16T03:39:42\.000Z local=2026-09-15 23:39 lastClean=none /);
    writeRunMarker(state.runsDir, "minute-bank", {
      atMs: Date.parse("2026-09-15T23:20:09Z"),
      dir: realpathSync(state.canonicalBankDir),
    });
    assert.equal(runGateCli(argv, deps), RUN_GATE_SKIP_EXIT);
    assert.equal(RUN_GATE_SKIP_EXIT, 75);
    assert.match(lines.at(-1)!, /^runGate: skip job=minute-bank .* lastClean=2026-09-15T23:20:09\.000Z nextSlot=2026-09-16T11:20:00\.000Z reason=/);
  });

  it("runs on any internal error", () => {
    const lines: string[] = [];
    const state = tempState();
    const deps = { now: () => Date.parse("2026-09-16T03:39:42Z"), print: (line: string) => lines.push(line), repoRoot: repoCopy(), state: () => state };
    assert.equal(runGateCli(["--job", "nightly"], deps), 0);
    assert.match(lines.at(-1)!, /^runGate: run .*reason=gateError: /);
    assert.equal(runGateCli(["--job", "minute-bank", "--dir", "/does/not/exist"], deps), 0);
    assert.equal(runGateCli(["--job"], deps), 0);
    assert.equal(runGateCli(["--job", "cache-topup"], { ...deps, repoRoot: scratchDir("no-plists-") }), 0);
    // A state root that cannot be resolved is one more thing the gate cannot
    // read: the job runs, and a marker it cannot place is a failure.
    const unresolvable = {
      ...deps,
      state: () => {
        throw new Error("LEVELFLOW_CHECKOUT names /gone, which does not exist");
      },
    };
    assert.equal(runGateCli(["--job", "cache-topup"], unresolvable), 0);
    assert.match(lines.at(-1)!, /^runGate: run job=cache-topup .*reason=gateError: LEVELFLOW_CHECKOUT names \/gone/);
    assert.equal(runGateCli(["--job", "cache-topup", "--record-clean"], unresolvable), 1);
    assert.match(lines.at(-1)!, /^runGate: record-clean failed job=cache-topup: LEVELFLOW_CHECKOUT names \/gone/);
  });

  it("records a clean top-up atomically, and refuses to for any other job", () => {
    const state = tempState();
    const lines: string[] = [];
    const deps = { now: () => Date.parse("2026-09-16T12:56:18Z"), print: (line: string) => lines.push(line), repoRoot: repoCopy(), state: () => state };
    assert.equal(runGateCli(["--job", "cache-topup", "--record-clean"], deps), 0);
    assert.deepEqual(readdirSync(state.runsDir), ["cache-topup.json"]);
    assert.equal(
      (JSON.parse(readFileSync(join(state.runsDir, "cache-topup.json"), "utf8")) as { atMs: number }).atMs,
      Date.parse("2026-09-16T12:56:18Z"),
    );
    assert.equal(runGateCli(["--job", "minute-bank", "--record-clean"], deps), 1);
    assert.match(readFileSync("scripts/fmpRunGate.ts", "utf8"), /writeJsonAtomic\(/);
  });
});
