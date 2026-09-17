import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  appendRecord,
  createTail,
  pruneDayFiles,
  readRecords,
  RETAIN_DAYS,
  StateReadError,
  utcDay,
  writeJsonAtomic,
} from "../scripts/fmpState.ts";

/**
 * The FMP ledger and breaker are shared by processes that start within a
 * second of each other at every boot. The old ledger read the whole file,
 * added, and rewrote it; measured in scratch with six writers of 500 records
 * each, that kept 93,000 and 109,000 of 3,000,000 bytes. Every writer here
 * appends one framed line instead, and every reader counts only complete
 * lines.
 */

const DAY = 86_400_000;
const AT = Date.parse("2026-09-16T12:00:00Z");
const scratch = () => mkdtempSync(join(tmpdir(), "fmp-state-"));

describe("a record is one framed line, so a torn write costs only itself", () => {
  it("reads a torn fragment followed by a whole record as one record and one skipped line", () => {
    const dir = scratch();
    writeFileSync(join(dir, `${utcDay(AT)}.jsonl`), '\n{"consumer":"a","bytes":1');
    appendRecord(dir, AT, { consumer: "b", bytes: 2 });
    const read = readRecords(dir, utcDay(AT));
    assert.equal(read.records.length, 1);
    assert.equal((read.records[0] as { consumer: string }).consumer, "b");
    assert.equal(read.skippedLines, 1);
  });

  it("never consumes a final segment that has no newline yet", () => {
    const dir = scratch();
    const path = join(dir, `${utcDay(AT)}.jsonl`);
    writeFileSync(path, '\n{"a":1}\n{"b":');
    const whole = readRecords(dir, utcDay(AT));
    assert.equal(whole.records.length, 1);
    assert.equal(whole.skippedLines, 0, "an in-flight segment is not a bad line");

    const tail = createTail(dir);
    const first = tail.read(utcDay(AT));
    assert.deepEqual(first.records, [{ a: 1 }]);
    assert.equal(first.skippedLines, 0);
    writeFileSync(path, '\n{"a":1}\n{"b":2}\n');
    const second = tail.read(utcDay(AT));
    assert.deepEqual(second.records, [{ b: 2 }], "the tail re-reads nothing and misses nothing");
    assert.equal(second.skippedLines, 0);
  });

  it("reads an absent day as empty and an unreadable one as an error, never as zero", () => {
    const dir = scratch();
    assert.deepEqual(readRecords(dir, utcDay(AT)), { records: [], skippedLines: 0 });
    mkdirSync(join(dir, `${utcDay(AT)}.jsonl`));
    assert.throws(() => readRecords(dir, utcDay(AT)), StateReadError);
    assert.throws(() => createTail(dir).read(utcDay(AT)), StateReadError);
  });
});

describe("six writers at once lose nothing", () => {
  it("keeps 3,000 of 3,000 records with exact per-consumer sums", async () => {
    // The fixture calls the real appendRecord. A read-modify-write append
    // loses most of these; a pass under that mutation is a defect in this
    // guard, not a survivor.
    const dir = scratch();
    await Promise.all(
      Array.from({ length: 6 }, (_, k) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(process.execPath, [
            "./node_modules/.bin/tsx",
            "tests/fixtures/fmpLedgerWriter.ts",
            dir,
            "500",
            `c${k}`,
            String(AT),
          ], { stdio: "inherit" });
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`writer c${k} exited ${code}`)));
        })),
    );
    const read = readRecords(dir, utcDay(AT));
    assert.equal(read.skippedLines, 0);
    assert.equal(read.records.length, 3000);
    const sums: Record<string, number> = {};
    for (const record of read.records as Array<{ consumer: string; bytes: number }>) {
      sums[record.consumer] = (sums[record.consumer] ?? 0) + record.bytes;
    }
    assert.deepEqual(sums, {
      c0: 500_000,
      c1: 500_000,
      c2: 500_000,
      c3: 500_000,
      c4: 500_000,
      c5: 500_000,
    });
  });

  it("appends a framed line and rewrites only through the atomic writer", () => {
    const source = readFileSync("scripts/fmpState.ts", "utf8");
    assert.match(source, /appendFileSync\([^;]*"\\n" \+ JSON\.stringify\(/);
    const writes = [...source.matchAll(/writeFileSync\(/g)];
    assert.equal(writes.length, 1, "exactly one whole-file write, the atomic one");
    const fnAt = source.indexOf("export function writeJsonAtomic");
    const fnEnd = source.indexOf("\n}\n", fnAt);
    assert.ok(fnAt >= 0 && writes[0].index! > fnAt && writes[0].index! < fnEnd);
    assert.match(source.slice(fnAt, fnEnd), /renameSync\(/);
  });

  it("writes JSON atomically, leaving no temporary file behind", () => {
    const dir = scratch();
    const path = join(dir, "marker.json");
    writeJsonAtomic(path, { atMs: AT });
    writeJsonAtomic(path, { atMs: AT + 1 });
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { atMs: AT + 1 });
    assert.deepEqual(readdirSync(dir), ["marker.json"]);
  });
});

describe("day files older than the retained window are pruned, and nothing else", () => {
  it("removes only YYYY-MM-DD.jsonl files older than today minus the window", () => {
    const dir = scratch();
    const names = [
      utcDay(AT),
      utcDay(AT - 10 * DAY),
      utcDay(AT - RETAIN_DAYS * DAY),
      utcDay(AT - (RETAIN_DAYS + 1) * DAY),
      utcDay(AT - 60 * DAY),
    ].map((day) => `${day}.jsonl`);
    for (const name of [...names, "ledger.json", "notes.txt", "2026-01-01.json"]) {
      writeFileSync(join(dir, name), "\n");
    }
    pruneDayFiles(dir, AT);
    assert.equal(existsSync(join(dir, names[0])), true, "today is never pruned");
    assert.equal(existsSync(join(dir, names[1])), true);
    assert.equal(existsSync(join(dir, names[2])), true, "the window edge is kept");
    assert.equal(existsSync(join(dir, names[3])), false);
    assert.equal(existsSync(join(dir, names[4])), false);
    for (const other of ["ledger.json", "notes.txt", "2026-01-01.json"]) {
      assert.equal(existsSync(join(dir, other)), true, `${other} is not a day file`);
    }
  });

  it("tolerates a file another process already removed", () => {
    const dir = scratch();
    writeFileSync(join(dir, `${utcDay(AT - 60 * DAY)}.jsonl`), "\n");
    assert.doesNotThrow(() =>
      pruneDayFiles(dir, AT, () => {
        throw Object.assign(new Error("already gone"), { code: "ENOENT" });
      }));
  });
});
