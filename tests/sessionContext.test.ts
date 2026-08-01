import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
