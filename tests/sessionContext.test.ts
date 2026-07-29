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

  it("blocks forex during the New York rollover pause", () => {
    const session = getSessionContext(
      "EURUSD",
      new Date("2026-06-15T21:00:00.000Z"),
    );

    assert.equal(session.block, true);
    assert.equal(session.marketKind, "forex");
    assert.equal(session.label, "FX rollover pause");
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
});
