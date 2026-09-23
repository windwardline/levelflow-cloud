import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SECURITY_OPTIONS } from "../src/lib/symbolMap.ts";
import { getSessionContext } from "../supabase/functions/trade-analyzer/sessions.ts";

describe("trade analyzer session context", () => {
  it("keeps crypto available outside the measured low-edge window", () => {
    const session = getSessionContext(
      "BTCUSD",
      new Date("2026-06-14T08:00:00.000Z"),
    );

    assert.equal(session.block, false);
    assert.equal(session.marketKind, "crypto");
    assert.equal(session.label, "Continuous digital asset session");
  });

  it("blocks crypto and futures during the measured low-edge UTC window", () => {
    const crypto = getSessionContext(
      "BTCUSD",
      new Date("2026-06-14T12:00:00.000Z"),
    );
    assert.equal(crypto.block, true);
    assert.equal(crypto.label, "Crypto low-edge window");

    // Tuesday 13:00 UTC = 09:00 ET: inside the futures low-edge window,
    // outside maintenance and weekend closures.
    const futures = getSessionContext(
      "ESUSD",
      new Date("2026-06-16T13:00:00.000Z"),
    );
    assert.equal(futures.block, true);
    assert.equal(futures.label, "Futures low-edge window");

    // Metals share the futures-style session but are NOT hour-gated.
    const metals = getSessionContext(
      "XAUUSD",
      new Date("2026-06-16T13:00:00.000Z"),
    );
    assert.equal(metals.block, false);
  });

  it("blocks cash indices during the measured low-edge UTC window", () => {
    // Round 12: 12:00-18:00 UTC measured negative on both splits for the
    // index class; the gate closes the worst window for individual reviews.
    const blocked = getSessionContext(
      "SP",
      new Date("2026-06-15T13:30:00.000Z"),
    );
    assert.equal(blocked.block, true);
    assert.equal(blocked.marketKind, "indices");
    assert.equal(blocked.label, "Index low-edge window");

    const open = getSessionContext(
      "SP",
      new Date("2026-06-15T09:30:00.000Z"),
    );
    assert.equal(open.block, false);
  });

  it("blocks energies during their measured low-edge hours", () => {
    // Round 15: hours {3,4,12,15,19,21} UTC negative on both splits at
    // full history; excluding them lifts both splits from ~0.04R to ~0.08R.
    const blocked = getSessionContext(
      "WTI",
      new Date("2026-06-15T03:30:00.000Z"),
    );
    assert.equal(blocked.block, true);
    assert.equal(blocked.marketKind, "energies");
    assert.equal(blocked.label, "Energy low-edge hour");

    const open = getSessionContext(
      "WTI",
      new Date("2026-06-15T08:30:00.000Z"),
    );
    assert.equal(open.block, false);
  });

  it("blocks forex during the New York rollover pause", () => {
    const session = getSessionContext(
      "EURUSD",
      new Date("2026-06-15T21:00:00.000Z"),
    );

    assert.equal(session.block, true);
    assert.equal(session.marketKind, "forex");
    assert.equal(session.label, "FX rollover pause");
  });

  // I7: spot FX settles for the week at 17:00 ET Friday, and the client's own
  // calendar has always said so (src/lib/marketHours.ts, closeMinuteOfDay
  // 17 * 60). The server's `weekend` term did not start until Saturday, so
  // Friday 17:00-24:00 ET generated forex setups on a closed market — seven
  // hours in which every other class hard-blocks from 16:30 ET. Those setups
  // could only ever expire unfilled (getSetupExpiryTime lands their window
  // inside the weekend), so users got untradeable levels and the replay harness
  // folded a guaranteed-unfilled bucket into every measured fill rate.
  it("closes forex for the week at the Friday New York close, not at Saturday", () => {
    // Friday 2026-06-19. 16:45 ET (20:45 UTC) is still open, at the late-Friday
    // penalty the measured record earned it.
    const lateFriday = getSessionContext(
      "EURUSD",
      new Date("2026-06-19T20:45:00.000Z"),
    );
    assert.equal(lateFriday.block, false);
    assert.equal(lateFriday.label, "Late Friday FX session");
    assert.equal(lateFriday.penalty, 10);

    // 17:00 ET (21:00 UTC) is the close itself.
    const atTheClose = getSessionContext(
      "EURUSD",
      new Date("2026-06-19T21:00:00.000Z"),
    );
    assert.equal(atTheClose.block, true);
    assert.equal(atTheClose.label, "FX weekend closure");
    assert.equal(atTheClose.penalty, 100);
    assert.equal(atTheClose.lowEdge, undefined);

    // And every hour after it, through the old blind spot.
    for (const hour of ["22:00", "23:00", "03:00"]) {
      const day = hour === "03:00" ? "20" : "19";
      const closed = getSessionContext(
        "EURUSD",
        new Date(`2026-06-${day}T${hour}:00.000Z`),
      );
      assert.equal(closed.block, true, `expected forex closed at ${day} ${hour}Z`);
      assert.equal(closed.label, "FX weekend closure");
    }

    // Sunday's reopen is untouched: 17:05 ET Sunday (21:05 UTC).
    const sundayClosed = getSessionContext(
      "EURUSD",
      new Date("2026-06-21T20:00:00.000Z"),
    );
    assert.equal(sundayClosed.block, true);
    const sundayOpen = getSessionContext(
      "EURUSD",
      new Date("2026-06-21T21:10:00.000Z"),
    );
    assert.equal(sundayOpen.block, false);
  });

  it("uses futures maintenance rules for futures-style markets", () => {
    const session = getSessionContext(
      "ESUSD",
      new Date("2026-06-15T21:30:00.000Z"),
    );

    assert.equal(session.block, true);
    assert.equal(session.marketKind, "futures");
    assert.equal(session.label, "Futures maintenance window");

    const indexSession = getSessionContext(
      "SP",
      new Date("2026-06-15T21:30:00.000Z"),
    );
    const energySession = getSessionContext(
      "WTI",
      new Date("2026-06-15T21:30:00.000Z"),
    );

    assert.equal(indexSession.block, true);
    assert.equal(indexSession.marketKind, "indices");
    assert.equal(indexSession.label, "Index maintenance window");
    assert.equal(energySession.block, true);
    assert.equal(energySession.marketKind, "energies");
    assert.equal(energySession.label, "Energy maintenance window");
  });

  it("uses dedicated spot metals session rules", () => {
    const session = getSessionContext(
      "XAUUSD",
      new Date("2026-06-15T21:30:00.000Z"),
    );

    assert.equal(session.block, true);
    assert.equal(session.marketKind, "metals");
    assert.equal(session.label, "Spot metals maintenance window");
  });

  it("marks measurement-only gates lowEdge; hard closures stay unmarked", () => {
    const cryptoLowEdge = getSessionContext(
      "BTCUSD",
      new Date("2026-06-15T13:00:00.000Z"),
    );
    assert.equal(cryptoLowEdge.block, true);
    assert.equal(cryptoLowEdge.lowEdge, true);

    const futuresLowEdge = getSessionContext(
      "ESUSD",
      new Date("2026-06-15T13:00:00.000Z"),
    );
    assert.equal(futuresLowEdge.block, true);
    assert.equal(futuresLowEdge.lowEdge, true);

    const energiesLowEdge = getSessionContext(
      "WTI",
      new Date("2026-06-15T15:30:00.000Z"),
    );
    assert.equal(energiesLowEdge.block, true);
    assert.equal(energiesLowEdge.lowEdge, true);

    // A weekend closure is a hard closure — never bypassed by measurement.
    const weekendClosure = getSessionContext(
      "ESUSD",
      new Date("2026-06-13T13:00:00.000Z"),
    );
    assert.equal(weekendClosure.block, true);
    assert.equal(weekendClosure.lowEdge, undefined);

    const metalsMaintenance = getSessionContext(
      "XAUUSD",
      new Date("2026-06-15T21:30:00.000Z"),
    );
    assert.equal(metalsMaintenance.block, true);
    assert.equal(metalsMaintenance.lowEdge, undefined);
  });
});

// The low-edge hours were set on the r4/r12/r15/r22 corpora (2026-07-28..30),
// which read FMP's New York bar stamps as UTC: every low-edge hour in them sat
// 4-5 DST-variable hours out of register
// (docs/research/evaluator-repair-map-2026-08-09.md, cluster A), and nothing
// has re-derived them since. A refusal that says the hours were measured cites
// evidence that does not exist, so the reason may state the window and nothing
// more. Unconditional: the copy is wrong whether or not the desk is parked.
describe("a low-edge refusal states its window and claims no measurement", () => {
  const CLAIM = /measured|replay|split|history|results|negative|weak/i;
  const WINDOW = /from (\d{2}):00 to (\d{2}):00 UTC\.$/;
  const HOUR_MS = 3_600_000;

  // Every roster symbol, every hour of one EDT week and one EST week, on the
  // half hour: the gates are whole UTC hours, and the New York closures that
  // run ahead of them move with DST.
  function lowEdgeContexts() {
    const found: { at: Date; kind: string; reason: string; symbol: string }[] = [];
    for (const option of SECURITY_OPTIONS) {
      for (const monday of [Date.UTC(2026, 5, 8), Date.UTC(2026, 0, 12)]) {
        for (let hour = 0; hour < 7 * 24; hour += 1) {
          const at = new Date(monday + hour * HOUR_MS + 30 * 60_000);
          const session = getSessionContext(option.symbol, at);
          if (!session.lowEdge) continue;
          assert.equal(session.block, true, `${option.symbol} ${at.toISOString()}`);
          found.push({
            at,
            kind: session.marketKind,
            reason: session.reason ?? "",
            symbol: option.symbol,
          });
        }
      }
    }
    return found;
  }

  it("says nothing about a measurement, for every low-edge refusal the roster reaches", () => {
    const found = lowEdgeContexts();
    // NON-VACUITY: a population that reached no gate would pass having read
    // nothing. Every class with a low-edge site must be in it.
    assert.deepEqual(
      [...new Set(found.map(({ kind }) => kind))].sort(),
      ["crypto", "energies", "futures", "indices"],
    );
    for (const { at, reason, symbol } of found) {
      assert.doesNotMatch(reason, CLAIM, `${symbol} ${at.toISOString()}: ${reason}`);
    }
  });

  it("names the window it enforces: the gate holds inside it and lifts at its edges", () => {
    for (const { at, reason, symbol } of lowEdgeContexts()) {
      const where = `${symbol} ${at.toISOString()}: ${reason}`;
      const window = WINDOW.exec(reason);
      assert.ok(window, where);
      const start = Number(window[1]);
      const end = Number(window[2]);
      const span = (end - start + 24) % 24;
      const into = (at.getUTCHours() - start + 24) % 24;
      assert.ok(into < span, `${where} — the hour is outside the stated window`);
      const startOf = at.getTime() - into * HOUR_MS;
      for (let step = 0; step < span; step += 1) {
        assert.equal(
          getSessionContext(symbol, new Date(startOf + step * HOUR_MS)).lowEdge,
          true,
          `${where} — the gate lifts inside the stated window`,
        );
      }
      for (const edge of [startOf - HOUR_MS, startOf + span * HOUR_MS]) {
        assert.notEqual(
          getSessionContext(symbol, new Date(edge)).lowEdge,
          true,
          `${where} — the gate outlasts the stated window at ${new Date(edge).toISOString()}`,
        );
      }
    }
  });

  it("holds at every lowEdge site in the source, reached or not", () => {
    const source = readFileSync(
      new URL("../supabase/functions/trade-analyzer/sessions.ts", import.meta.url),
      "utf8",
    );
    const sites = (source.match(/lowEdge: true,/g) ?? []).length;
    const reasons = [
      ...source.matchAll(/lowEdge: true,[\s\S]*?reason:\s*([\s\S]*?),\n\s*\};/g),
    ].map((match) => match[1]);
    assert.ok(sites >= 3, `only ${sites} lowEdge sites found — the scan broke`);
    assert.equal(reasons.length, sites, "a lowEdge site's reason was not read");
    // The words an operator reads are the literal parts; an interpolation is
    // code (a helper's name), and the executed test above reads its output.
    for (const reason of reasons) {
      assert.doesNotMatch(reason.replace(/\$\{[^}]*\}/g, ""), CLAIM, reason);
    }
  });
});
