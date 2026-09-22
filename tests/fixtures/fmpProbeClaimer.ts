// A child process for tests/fmpCircuit.test.ts. It asks the shared breaker for
// a decision, prints "ready", waits for the go file so every sibling holds the
// same pre-claim decision, then claims the probe through the real gate.
// Prints its outcome last: won, lost, refused or noprobe.
//
//   node ./node_modules/.bin/tsx tests/fixtures/fmpProbeClaimer.ts '<state json>' <go file>
import { existsSync } from "node:fs";

import { ProbeLostError } from "../../scripts/fmpByteBudget.ts";
import { createProbeGate, mayCall } from "../../scripts/fmpCircuit.ts";
import type { FmpStatePaths } from "../../scripts/fmpState.ts";

const state = JSON.parse(process.argv[2]) as FmpStatePaths;
const goFile = process.argv[3];
const decision = mayCall(Date.now(), { requiredPaths: [] }, state);
console.log("ready");
const pause = new Int32Array(new SharedArrayBuffer(4));
const deadline = Date.now() + 30_000;
while (!existsSync(goFile) && Date.now() < deadline) Atomics.wait(pause, 0, 0, 5);
if (!decision.allowed) {
  console.log("refused");
} else if (!decision.probe) {
  console.log("noprobe");
} else {
  const gate = createProbeGate(decision, { consumer: "adhoc", now: Date.now }, state);
  try {
    gate.beforeRequest();
    console.log("won");
  } catch (error) {
    if (!(error instanceof ProbeLostError)) throw error;
    console.log("lost");
  }
}
