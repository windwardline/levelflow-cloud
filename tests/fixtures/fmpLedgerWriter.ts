// A child process for tests/fmpState.test.ts: appends N usage-shaped records
// through the REAL appendRecord, so the concurrency test measures the write
// path production uses rather than a copy of it.
//
//   node ./node_modules/.bin/tsx tests/fixtures/fmpLedgerWriter.ts <dir> <n> <consumer> <atMs>
import { appendRecord } from "../../scripts/fmpState.ts";

const [dir, count, consumer, atMs] = process.argv.slice(2);
for (let i = 0; i < Number(count); i += 1) {
  appendRecord(dir, Number(atMs), {
    atMs: Number(atMs),
    bytes: 1000,
    consumer,
    i,
    pad: "x".repeat(80),
  });
}
