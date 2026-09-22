import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { ProbeLostError } from "../scripts/fmpByteBudget.ts";
import {
  classifyRefusal,
  closeCircuit,
  COOL_OFF_MS,
  createProbeGate,
  type FetchLike,
  isBandwidthRefusal,
  isCircuitRefusal,
  mayCall,
  openCircuit,
  readBreaker,
  recoveryClause,
  REFUSAL_KINDS,
  refusalSeverity,
} from "../scripts/fmpCircuit.ts";
import { maySpend } from "../scripts/fmpGovernor.ts";
import { appendRecord, utcDay } from "../scripts/fmpState.ts";
import { BODIES, INVALID_KEY_BODY_PREFIX, tempState } from "./fixtures/fmpTestState.ts";

/**
 * One shared breaker, because six consumers were each finding the same wall.
 *
 * Since 2026-09-16 it is an append-only event log rather than one JSON marker.
 * The marker was rewritten whole by whoever wrote last, so a close could erase
 * a newer refusal and a claim could re-open a breaker another process had just
 * closed. In the log, open versus closed is decided by EVIDENCE TIME — the
 * newest refusal against the newest answer — whatever order the lines landed
 * in, and each scope (the account, or one endpoint) is its own key.
 */

const MIN1 = "/stable/historical-chart/1min";
const CAL = "/stable/economic-calendar";
const EOD = "/stable/historical-price-eod/full";
const M15 = "/stable/historical-chart/15min";
const HOUR = 3_600_000;

function breakerLines(dir: string): Array<Record<string, unknown>> {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .flatMap((name) =>
      readFileSync(join(dir, name), "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    );
}

describe("each refusal is classified by the provider's own words", () => {
  it("names the four walls from verbatim bodies", () => {
    assert.equal(classifyRefusal(BODIES.bandwidth), "bandwidth");
    assert.equal(classifyRefusal(BODIES.restricted), "entitlement");
    assert.equal(classifyRefusal(BODIES.suspended), "suspended");
    // A stored PREFIX of the 401 body; the whole body was never captured.
    assert.equal(classifyRefusal(BODIES.invalidKeyStoredPrefix), "invalidKey");
    assert.equal(classifyRefusal(INVALID_KEY_BODY_PREFIX), "invalidKey");
  });

  it("tests entitlement before bandwidth, so a widened pattern cannot swallow a 402 again", () => {
    // Synthetic on purpose: no captured body carries both phrases. The order
    // is the guard, and only a body with both can observe it.
    assert.equal(
      classifyRefusal("Restricted Endpoint: not available. Bandwidth Limit Reach . Please upgrade your plan"),
      "entitlement",
    );
    assert.equal(classifyRefusal("Account suspended. Bandwidth Limit Reach"), "suspended");
  });

  it("claims no wall it has not seen", () => {
    for (
      const body of [
        "403 Forbidden",
        "Your account has been suspended",
        "HTTP 429",
        "Too Many Requests",
        "",
      ]
    ) {
      assert.equal(classifyRefusal(body), null, JSON.stringify(body));
    }
    assert.equal(isBandwidthRefusal("HTTP 429"), false);
  });

  it("trips the shared breaker for the walls no retry clears, and not for a rejected key", () => {
    assert.equal(isCircuitRefusal(BODIES.bandwidth), true);
    assert.equal(isCircuitRefusal(BODIES.restricted), true);
    assert.equal(isCircuitRefusal(BODIES.suspended), true);
    // The key is this machine's to fix, and another consumer holding a good
    // copy must not be refused because one consumer holds a stale one.
    assert.equal(isCircuitRefusal(BODIES.invalidKeyStoredPrefix), false);
    assert.equal(isCircuitRefusal("HTTP 429"), false);
  });

  it("gives each wall its own remedy", () => {
    assert.match(recoveryClause("bandwidth"), /drains by time only/);
    assert.match(recoveryClause("entitlement"), /subscription/i);
    assert.doesNotMatch(recoveryClause("entitlement"), /drains by time/);
    assert.match(recoveryClause("suspended"), /owner/);
    assert.doesNotMatch(recoveryClause("suspended"), /drains by time/);
    assert.match(recoveryClause("invalidKey"), /fmp-api-key/);
    assert.doesNotMatch(recoveryClause("invalidKey"), /drains by time/);
  });

  it("refuses to open the breaker on a rejected key", () => {
    const state = tempState();
    assert.throws(() =>
      openCircuit({
        atMs: Date.parse("2026-08-18T14:02:26Z"),
        consumer: "adhoc",
        endpointPath: CAL,
        kind: "invalidKey",
        reason: BODIES.invalidKeyStoredPrefix,
      }, state)
    );
  });

  // No writer can put that line in the log, so only a hand edit can. Read
  // through, it would open the account, and as the newest refusal it would
  // rename a bandwidth stand-down, which the top-up takes green, as a red one.
  it("reads a hand-written rejected-key line in the log as no refusal", () => {
    const at = Date.parse("2026-09-16T12:00:00Z");
    const line = (atMs: number) => ({
      at: atMs,
      consumer: "adhoc",
      endpointPath: CAL,
      key: "account",
      kind: "invalidKey",
      reason: BODIES.invalidKeyStoredPrefix,
      t: "refused",
    });
    const alone = tempState();
    appendRecord(alone.breakerDir, at, line(at));
    const read = readBreaker(at + 1, alone);
    assert.ok(read.ok);
    assert.deepEqual(read.entries, []);
    assert.equal(read.skippedLines, 0, "a readable line is not an unreadable one");
    assert.deepEqual(mayCall(at + 1, { requiredPaths: [] }, alone), { allowed: true, probe: false });

    const beside = tempState();
    openCircuit({ atMs: at, consumer: "topup", endpointPath: CAL, kind: "bandwidth", reason: BODIES.bandwidth }, beside);
    appendRecord(beside.breakerDir, at + 1, line(at + 1));
    const decision = mayCall(at + 2, { requiredPaths: [] }, beside);
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.kind, "bandwidth");
  });
});

describe("an open breaker refuses inside the cool-off and says what it knows", () => {
  const at = Date.parse("2026-08-31T13:00:00Z");

  it("allows everything while nothing is open", () => {
    const decision = mayCall(at, { requiredPaths: [EOD] }, tempState());
    assert.deepEqual(decision, { allowed: true, probe: false });
  });

  it("refuses inside the cool-off, with the stable head token", () => {
    const state = tempState();
    openCircuit({ atMs: at, consumer: "bank", endpointPath: MIN1, kind: "bandwidth", reason: BODIES.bandwidth }, state);
    const decision = mayCall(at + 60_000, { requiredPaths: [] }, state);
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.kind, "bandwidth");
    assert.match(decision.reason, /^fmpCircuitOpen: /);
    assert.match(decision.reason, /Next probe in 6\.0h/);
    assert.match(decision.reason, /drains by time only/);
  });

  it("grants one probe once the cool-off elapses, naming what it covers", () => {
    const state = tempState();
    openCircuit({ atMs: at, consumer: "bank", endpointPath: MIN1, kind: "bandwidth", reason: BODIES.bandwidth }, state);
    const decision = mayCall(at + COOL_OFF_MS, { requiredPaths: [] }, state);
    assert.deepEqual(decision, { allowed: true, keys: ["account"], probe: true });
  });

  it("keeps the first opening and advances the last refusal across re-arms", () => {
    const state = tempState();
    openCircuit({ atMs: at, consumer: "bank", endpointPath: MIN1, kind: "bandwidth", reason: BODIES.bandwidth }, state);
    openCircuit({ atMs: at + 6 * HOUR, consumer: "bank", endpointPath: MIN1, kind: "bandwidth", reason: BODIES.bandwidth }, state);
    const read = readBreaker(at + 6 * HOUR + 1, state);
    assert.ok(read.ok);
    const entry = read.entries.find((candidate) => candidate.key === "account");
    assert.equal(entry?.openedAt, at);
    assert.equal(entry?.lastRefusedAt, at + 6 * HOUR);
    assert.equal(mayCall(at + 6 * HOUR + 60_000, { requiredPaths: [] }, state).allowed, false);
  });
});

describe("a refusal is scoped to what it refused", () => {
  it("keeps the bank's 1-minute gap and the top-up's calendar gap as two keys", () => {
    // 2026-09-05 and 09-08: a top-up calendar 402 at 11:00Z refused the bank
    // at 11:20Z with "Next probe in 5.7h". An entitlement gap is a fact about
    // one endpoint; a consumer that does not call it must not be refused by it.
    const state = tempState();
    const t0 = Date.parse("2026-09-05T11:00:03Z");
    for (let i = 0; i < 3; i += 1) {
      openCircuit({ atMs: t0 + i * 60_000, consumer: "bank", endpointPath: MIN1, kind: "entitlement", reason: BODIES.restricted }, state);
      openCircuit({ atMs: t0 + i * 60_000 + 1_000, consumer: "topup", endpointPath: CAL, kind: "entitlement", reason: BODIES.restricted }, state);
    }
    const now = t0 + 10 * 60_000;
    const read = readBreaker(now, state);
    assert.ok(read.ok);
    assert.deepEqual(
      read.entries.filter((entry) => entry.open).map((entry) => entry.key).sort(),
      [CAL, MIN1],
    );
    const calendar = mayCall(now, { requiredPaths: [CAL] }, state);
    assert.equal(calendar.allowed, false);
    if (!calendar.allowed) assert.match(calendar.reason, new RegExp(`on ${CAL}`));
    const minute = mayCall(now, { requiredPaths: [MIN1] }, state);
    assert.equal(minute.allowed, false);
    if (!minute.allowed) assert.match(minute.reason, new RegExp(`on ${MIN1}`));
    assert.deepEqual(mayCall(now, { requiredPaths: [EOD, M15] }, state), { allowed: true, probe: false });
  });

  it("names the most severe kind across every blocking entry", () => {
    const state = tempState();
    const t0 = Date.parse("2026-09-05T11:00:00Z");
    openCircuit({ atMs: t0, consumer: "topup", endpointPath: CAL, kind: "entitlement", reason: BODIES.restricted }, state);
    openCircuit({ atMs: t0 + 7 * HOUR, consumer: "adhoc", endpointPath: EOD, kind: "bandwidth", reason: BODIES.bandwidth }, state);
    const decision = mayCall(t0 + 7 * HOUR + 60_000, { requiredPaths: [CAL] }, state);
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.kind, "entitlement");
    assert.match(decision.reason, /^fmpCircuitOpen: /);
  });

  // Severity only picks which open entry names a blocked run: the account's
  // against an endpoint's entitlement, since the account holds one kind at a
  // time, its newest. What the order must guarantee is that bandwidth, the one
  // kind the nightly top-up stands down green on, names a run only when nothing
  // else blocks it. The table is total over the kinds, so no kind ranks by
  // omission, as a rejected key did at 0 (review round 3, finding 3).
  it("ranks bandwidth below every other kind, an unclassified refusal included", () => {
    const floor = refusalSeverity("bandwidth");
    for (const kind of [...REFUSAL_KINDS, null]) {
      assert.ok(Number.isFinite(refusalSeverity(kind)), `${String(kind)} has no rank`);
      if (kind !== "bandwidth") assert.ok(refusalSeverity(kind) > floor, `${String(kind)} ranks at or below bandwidth`);
    }
    // A log line from another build can name a kind this one does not know.
    assert.equal(refusalSeverity("rateLimit" as never), refusalSeverity(null));
  });
});

describe("open or closed is decided by evidence time, not by append order", () => {
  it("keeps a newer refusal open when an older answer is appended after it", () => {
    const state = tempState();
    const t1 = Date.parse("2026-09-10T10:00:00Z");
    const t2 = t1 + 5_000;
    openCircuit({ atMs: t2, consumer: "topup", endpointPath: M15, kind: "bandwidth", reason: BODIES.bandwidth }, state);
    closeCircuit({ consumer: "bank", endpointPath: MIN1, evidenceAtMs: t1 }, state);
    assert.equal(mayCall(t2 + 1_000, { requiredPaths: [] }, state).allowed, false);
  });

  it("reads an older refusal appended after a newer answer as closed", () => {
    const state = tempState();
    const t1 = Date.parse("2026-09-10T10:00:00Z");
    const t2 = t1 + 5_000;
    closeCircuit({ consumer: "bank", endpointPath: MIN1, evidenceAtMs: t2 }, state);
    openCircuit({ atMs: t1, consumer: "topup", endpointPath: M15, kind: "bandwidth", reason: BODIES.bandwidth }, state);
    assert.deepEqual(mayCall(t2 + 1_000, { requiredPaths: [] }, state), { allowed: true, probe: false });
  });

  it("closes an endpoint's entitlement only on an answer from that endpoint", () => {
    const state = tempState();
    const t0 = Date.parse("2026-09-10T10:00:00Z");
    openCircuit({ atMs: t0, consumer: "topup", endpointPath: CAL, kind: "entitlement", reason: BODIES.restricted }, state);
    closeCircuit({ consumer: "topup", endpointPath: M15, evidenceAtMs: t0 + 1_000 }, state);
    assert.equal(mayCall(t0 + 2_000, { requiredPaths: [CAL] }, state).allowed, false);
    closeCircuit({ consumer: "topup", endpointPath: CAL, evidenceAtMs: t0 + 3_000 }, state);
    assert.equal(mayCall(t0 + 4_000, { requiredPaths: [CAL] }, state).allowed, true);
  });
});

describe("one probe per cool-off, claimed at the first request", () => {
  const t0 = Date.parse("2026-09-10T00:00:00Z");
  const now = t0 + COOL_OFF_MS + 1_000;
  const opened = () => {
    const state = tempState();
    openCircuit({ atMs: t0, consumer: "bank", endpointPath: MIN1, kind: "bandwidth", reason: BODIES.bandwidth }, state);
    return state;
  };

  it("lets the first claimant win and makes the second release and stand down", () => {
    const state = opened();
    const decision = mayCall(now, { requiredPaths: [] }, state);
    assert.equal(decision.allowed && decision.probe, true);
    const first = createProbeGate(decision, { consumer: "topup", now: () => now }, state);
    const second = createProbeGate(decision, { consumer: "adhoc", now: () => now }, state);
    first.beforeRequest();
    assert.throws(() => second.beforeRequest(), ProbeLostError);
    const lines = breakerLines(state.breakerDir);
    const claims = lines.filter((line) => line.t === "claim");
    const releases = lines.filter((line) => line.t === "release");
    assert.equal(claims.length, 2);
    assert.deepEqual(releases.map((line) => line.id), [claims[1].id]);
    const read = readBreaker(now, state);
    assert.ok(read.ok);
    assert.equal(read.entries[0].probeWinnerId, claims[0].id, "equal instants resolve by file order");
  });

  it("lets a late claimant through once another consumer's probe closed the entry", () => {
    // The first consumer claimed, was answered and closed the breaker; the
    // second held the same pre-claim decision. A closed entry is nothing to
    // stand down for, whoever won its probe.
    const state = opened();
    const decision = mayCall(now, { requiredPaths: [] }, state);
    const first = createProbeGate(decision, { consumer: "topup", now: () => now }, state);
    first.beforeRequest();
    first.answered();
    closeCircuit({ consumer: "topup", endpointPath: M15, evidenceAtMs: now + 500 }, state);
    const late = createProbeGate(decision, { consumer: "adhoc", now: () => now + 1_000 }, state);
    assert.doesNotThrow(() => late.beforeRequest());
    const releases = breakerLines(state.breakerDir).filter((line) => line.t === "release");
    assert.deepEqual(releases, []);
  });

  it("releases the claim when no answer came, so the next consumer may probe", () => {
    const state = opened();
    const decision = mayCall(now, { requiredPaths: [] }, state);
    const gate = createProbeGate(decision, { consumer: "topup", now: () => now }, state);
    gate.beforeRequest();
    gate.noAnswer();
    const again = maySpend({ atMs: now + 1_000, consumer: "adhoc", label: "test", requiredPaths: [], state });
    assert.equal(again.allowed, true);
    assert.equal(again.allowed && again.probe, true);
  });

  it("keeps the claim once the provider answered, so the cool-off re-arms", () => {
    const state = opened();
    const decision = mayCall(now, { requiredPaths: [] }, state);
    const gate = createProbeGate(decision, { consumer: "topup", now: () => now }, state);
    gate.beforeRequest();
    gate.answered();
    gate.noAnswer();
    const again = maySpend({ atMs: now + 1_000, consumer: "adhoc", label: "test", requiredPaths: [], state });
    assert.equal(again.allowed, false);
  });

  it("claims through the wrapped fetch and releases on a transport failure", async () => {
    const state = opened();
    const decision = mayCall(now, { requiredPaths: [] }, state);
    const gate = createProbeGate(decision, { consumer: "topup", now: () => now }, state);
    const stub: FetchLike = () => Promise.reject(new TypeError("fetch failed"));
    const failing = gate.wrapFetch(stub);
    await assert.rejects(failing("https://example.invalid/"), TypeError);
    const lines = breakerLines(state.breakerDir);
    assert.deepEqual(lines.map((line) => line.t), ["refused", "claim", "release"]);
  });

  it("is a pass-through when no probe was granted", () => {
    const state = tempState();
    const decision = mayCall(now, { requiredPaths: [] }, state);
    const gate = createProbeGate(decision, { consumer: "topup", now: () => now }, state);
    const f = () => Promise.resolve(new Response("[]"));
    assert.equal(gate.wrapFetch(f), f);
  });

  it("gives exactly one of six processes holding the same decision the probe", async () => {
    // Every child reads its decision first and claims only once all six hold
    // one, so the claims genuinely race; the winner is the first in file order.
    const state = tempState();
    openCircuit({ atMs: Date.now() - 7 * HOUR, consumer: "bank", endpointPath: MIN1, kind: "bandwidth", reason: BODIES.bandwidth }, state);
    const goFile = join(state.runsDir, "..", "go");
    let ready = 0;
    const words = await Promise.all(
      Array.from({ length: 6 }, () =>
        new Promise<string>((resolve, reject) => {
          let out = "";
          const child = spawn(process.execPath, [
            "./node_modules/.bin/tsx",
            "tests/fixtures/fmpProbeClaimer.ts",
            JSON.stringify(state),
            goFile,
          ]);
          child.stdout.on("data", (chunk) => {
            const before = out.includes("ready");
            out += String(chunk);
            if (!before && out.includes("ready")) {
              ready += 1;
              if (ready === 6) {
                mkdirSync(join(state.runsDir, ".."), { recursive: true });
                writeFileSync(goFile, "go");
              }
            }
          });
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0 ? resolve(out.replace("ready", "").trim()) : reject(new Error(`claimer exited ${code}`)));
        })),
    );
    assert.deepEqual(words.filter((word) => word === "won").length, 1, words.join(","));
    assert.equal(words.filter((word) => word === "lost").length, 5, words.join(","));
  });
});

describe("the pre-2026-09-16 marker is read as history and never written", () => {
  it("reads an open legacy marker as an account refusal that a later answer closes", () => {
    const t0 = Date.parse("2026-09-04T20:38:00Z");
    const legacy = JSON.stringify({ lastProbeAt: t0 + HOUR, openedAt: t0, reason: BODIES.bandwidth });
    const state = tempState({ legacyCircuit: legacy });
    const decision = mayCall(t0 + 2 * HOUR, { requiredPaths: [] }, state);
    assert.equal(decision.allowed, false);
    closeCircuit({ consumer: "bank", endpointPath: MIN1, evidenceAtMs: t0 + 3 * HOUR }, state);
    assert.deepEqual(mayCall(t0 + 3 * HOUR + 1, { requiredPaths: [] }, state), { allowed: true, probe: false });
    assert.equal(readFileSync(state.legacyCircuitPath, "utf8"), legacy);
  });

  // The marker predates the rule that a rejected key never opens the shared
  // breaker, and 2026-08-18 stored that body 805 times. Read through as it
  // stood, it opened the account for every top-up and ad-hoc run.
  it("reads a legacy marker holding a rejected key as no refusal", () => {
    const t0 = Date.parse("2026-08-18T12:00:00Z");
    for (const reason of [BODIES.invalidKeyStoredPrefix, `HTTP 401 ${INVALID_KEY_BODY_PREFIX}`]) {
      const state = tempState({ legacyCircuit: JSON.stringify({ lastProbeAt: null, openedAt: t0, reason }) });
      const read = readBreaker(t0 + HOUR, state);
      assert.ok(read.ok);
      assert.deepEqual(read.entries, [], reason);
      assert.equal(read.legacyUnreadable, false);
      assert.deepEqual(mayCall(t0 + HOUR, { requiredPaths: [] }, state), { allowed: true, probe: false });
      assert.equal(maySpend({ atMs: t0 + HOUR, consumer: "topup", label: "test", requiredPaths: [], state }).allowed, true);
    }
    // Only the rejected key is dropped: the same marker on the bandwidth wall still opens it.
    const bandwidth = tempState({ legacyCircuit: JSON.stringify({ lastProbeAt: null, openedAt: t0, reason: BODIES.bandwidth }) });
    const decision = mayCall(t0 + HOUR, { requiredPaths: [] }, bandwidth);
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.kind, "bandwidth");
  });

  it("ignores a torn legacy marker without throwing, and names it", () => {
    const state = tempState({ legacyCircuit: '{"openedAt": 17' });
    const read = readBreaker(Date.now(), state);
    assert.ok(read.ok);
    assert.equal(read.legacyUnreadable, true);
    const lines: string[] = [];
    assert.deepEqual(
      mayCall(Date.now(), { emit: (line) => lines.push(line), requiredPaths: [] }, state),
      { allowed: true, probe: false },
    );
    assert.deepEqual(lines.filter((line) => line.startsWith(`fmpStateUnreadable: legacy breaker ${state.legacyCircuitPath}: `)).length, 1, lines.join("\n"));
    assert.equal(readFileSync(state.legacyCircuitPath, "utf8"), '{"openedAt": 17');
  });

  it("reads a legacy marker that exists and cannot be read as unreadable, not absent", () => {
    const state = tempState();
    mkdirSync(state.legacyCircuitPath, { recursive: true });
    const read = readBreaker(Date.now(), state);
    assert.ok(read.ok);
    assert.equal(read.legacyUnreadable, true, "EISDIR is not ENOENT");
    const absent = readBreaker(Date.now(), tempState());
    assert.ok(absent.ok);
    assert.equal(absent.legacyUnreadable, false);
  });
});

describe("an unreadable breaker refuses rather than reading as closed", () => {
  it("refuses an ad-hoc spender when a day file cannot be read", () => {
    const state = tempState();
    const at = Date.parse("2026-09-16T12:00:00Z");
    mkdirSync(join(state.breakerDir, `${utcDay(at)}.jsonl`), { recursive: true });
    const decision = maySpend({ atMs: at, consumer: "adhoc", label: "test", requiredPaths: [], state });
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.kind, "ledgerUnreadable");
  });

  it("skips a malformed line rather than failing the whole log, and says how many", () => {
    const state = tempState();
    const at = Date.parse("2026-09-16T12:00:00Z");
    appendRecord(state.breakerDir, at, { t: "refused" });
    const read = readBreaker(at, state);
    assert.ok(read.ok);
    assert.equal(read.skippedLines, 1);
    const lines: string[] = [];
    mayCall(at, { emit: (line) => lines.push(line), requiredPaths: [] }, state);
    assert.deepEqual(lines, [`fmpStateUnreadable: breaker log ${state.breakerDir}: 1 unreadable line(s) skipped; the events they carried are not counted`]);
  });
});
