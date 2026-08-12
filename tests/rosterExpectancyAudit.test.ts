import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shardPathsFromArgv } from "../scripts/roster-expectancy-audit.ts";

// WIF-4 (readiness audit, 2026-08-11): run with no shard paths, the audit
// read zero rows, called every market "unmeasurable", and wrote an artifact
// that looked like a finished run. An instrument that examined nothing must
// refuse to report — the no-silent-failure standard, applied to the one
// script whose output is quoted as a roster verdict.
describe("roster-expectancy-audit argv", () => {
  it("collects the positional shard paths and drops flag pairs", () => {
    assert.deepEqual(
      shardPathsFromArgv(["a.jsonl", "--out", "x.json", "b.jsonl"]),
      ["a.jsonl", "b.jsonl"],
    );
  });

  it("refuses a run with no shard paths instead of reporting on zero rows", () => {
    assert.throws(
      () => shardPathsFromArgv(["--out", "x.json"]),
      /no shard paths/,
    );
  });
});
