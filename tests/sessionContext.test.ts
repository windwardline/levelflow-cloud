import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSessionContext } from "../supabase/functions/trade-analyzer/sessions.ts";

describe("trade analyzer session context", () => {
  it("keeps crypto available continuously", () => {
    const session = getSessionContext(
      "BTCUSD",
      new Date("2026-06-14T12:00:00.000Z"),
    );

    assert.equal(session.block, false);
    assert.equal(session.marketKind, "crypto");
    assert.equal(session.label, "Continuous digital asset session");
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

  it("uses futures maintenance rules only for futures", () => {
    const session = getSessionContext(
      "ESUSD",
      new Date("2026-06-15T21:30:00.000Z"),
    );

    assert.equal(session.block, true);
    assert.equal(session.marketKind, "futures");
    assert.equal(session.label, "Futures maintenance window");
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
