import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import { deriveFoldSpec, parseFoldSpecArgs } from "../scripts/derive-fold-spec.ts";
import { foldsByClass } from "../scripts/sweepFolds.ts";
import { standingBanner, writeResearchArtifact } from "../scripts/researchArtifact.ts";

/**
 * The per-class fold spec is derived from the warm cache — and the cache is
 * read at a PIN. Until 2026-09-02 the deriver pinned itself to the run day,
 * the same defect the sweep driver carried at five call sites until #545:
 * at a past anchor the run day is pinned in no store, `fetchFull` fires, and
 * the deriver refuses with "cache cold" on a cache that is fully warm at the
 * day the sweep will actually read. R3's supplementary per-class arms are the
 * reason this matters: they run at 2026-08-26, for nothing, only if the spec
 * can be derived at 2026-08-26 too.
 */

const DAY = 86_400_000;

function writeStore(
  dir: string,
  key: string,
  times: number[],
  pinned: Record<string, number>,
): void {
  writeFileSync(
    join(dir, `${key}.rolling.json`),
    JSON.stringify({
      clock: BAR_CLOCK,
      items: times.map((time) => ({ close: 1, high: 1, low: 1, open: 1, time, volume: 1 })),
      pinned,
    }),
  );
}

describe("deriveFoldSpec reads the cache at the anchor it is given", () => {
  it("derives each class's union span from stores pinned at a past anchor", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fold-spec-"));
    const anchor = "2026-08-26";
    const pinAt = Date.UTC(2026, 7, 26);
    // Two forex markets with different starts; one crypto market starting later.
    writeStore(dir, "EURUSD-15min-7000", [Date.UTC(2009, 8, 25), pinAt - DAY, pinAt], { [anchor]: pinAt });
    writeStore(dir, "GBPUSD-15min-7000", [Date.UTC(2011, 0, 3), pinAt], { [anchor]: pinAt });
    writeStore(dir, "BTCUSD-15min-7000", [Date.UTC(2017, 0, 2), pinAt - 2 * DAY, pinAt + DAY], {
      [anchor]: pinAt,
    });
    const spec = await deriveFoldSpec({
      anchor,
      cacheDir: dir,
      days: 7000,
      symbols: ["EURUSD", "GBPUSD", "BTCUSD"],
    });
    assert.deepEqual(spec, {
      // BTCUSD's last bar sits past the pin and is NOT read: a pinned read is
      // truncated at the pin, exactly as the sweep will read it, so the class
      // ends at its last bar AT OR BEFORE the pin.
      crypto: { endMs: pinAt - 2 * DAY, startMs: Date.UTC(2017, 0, 2) },
      forex: { endMs: pinAt, startMs: Date.UTC(2009, 8, 25) },
    });
  });

  it("refuses rather than fetching when the anchor is not pinned", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fold-spec-cold-"));
    writeStore(dir, "EURUSD-15min-7000", [Date.UTC(2009, 8, 25)], { "2026-08-26": Date.UTC(2026, 7, 26) });
    await assert.rejects(
      deriveFoldSpec({ anchor: "2026-09-02", cacheDir: dir, days: 7000, symbols: ["EURUSD"] }),
      /cache cold at anchor 2026-09-02/,
    );
  });

  it("refuses a symbol outside every roster", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fold-spec-roster-"));
    writeStore(dir, "NOPE-15min-7000", [1], { "2026-08-26": 1 });
    await assert.rejects(
      deriveFoldSpec({ anchor: "2026-08-26", cacheDir: dir, days: 7000, symbols: ["NOPE"] }),
      /not in any asset-class roster/,
    );
  });
});

describe("the deriver's arguments", () => {
  it("defaults the anchor to today, so every existing invocation is unchanged", () => {
    const args = parseFoldSpecArgs(["--symbols", "EURUSD", "--out", "x.json"]);
    assert.equal(args.anchor, new Date().toISOString().slice(0, 10));
    assert.equal(args.days, 7000);
  });

  it("takes a past anchor and derives the roster from the engine", () => {
    const args = parseFoldSpecArgs(["--symbols", "roster", "--anchor", "2026-08-26", "--out", "x.json"]);
    assert.equal(args.anchor, "2026-08-26");
    assert.deepEqual(args.symbols, defaultScanSymbols);
  });

  it("refuses a malformed or future anchor — an unmatched pin is a full refetch", () => {
    assert.throws(
      () => parseFoldSpecArgs(["--symbols", "EURUSD", "--anchor", "26-08-2026", "--out", "x.json"]),
      /--anchor must be YYYY-MM-DD/,
    );
    assert.throws(
      () => parseFoldSpecArgs(["--symbols", "EURUSD", "--anchor", "2999-01-01", "--out", "x.json"]),
      /in the future/,
    );
  });

  it("refuses to run with no symbols or no output path", () => {
    assert.throws(() => parseFoldSpecArgs(["--out", "x.json"]), /--symbols/);
    assert.throws(() => parseFoldSpecArgs(["--symbols", "EURUSD"]), /--out/);
  });
});

describe("the spec is a research artifact, and a banner on it is law", () => {
  it("foldsByClass refuses a spec carrying an INVALID banner rather than folding on a ninth class", () => {
    const spec = {
      INVALID: "the cache this was derived from is condemned",
      forex: { endMs: Date.UTC(2026, 7, 26), startMs: Date.UTC(2009, 8, 25) },
    } as unknown as Parameters<typeof foldsByClass>[0];
    assert.throws(() => foldsByClass(spec, 5 * DAY), /foldSpecInvalid/);
  });

  it("a re-derivation carries a standing banner forward instead of retiring it", () => {
    // The shared writer's contract, exercised on this artifact's own shape:
    // the banner survives, the spans are rewritten, and the consumer above
    // then refuses the file until someone retires the banner by hand.
    const dir = mkdtempSync(join(tmpdir(), "fold-spec-banner-"));
    const out = join(dir, "fold-spec.json");
    writeResearchArtifact(out, { INVALID: "condemned", forex: { endMs: 1, startMs: 0 } });
    writeResearchArtifact(out, { forex: { endMs: 2, startMs: 0 } });
    assert.equal(standingBanner(out), "condemned");
  });
});
