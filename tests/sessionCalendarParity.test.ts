import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { marketAvailability } from "../src/lib/marketHours.ts";
import { getSessionContext } from "../supabase/functions/trade-analyzer/sessions.ts";
import { SECURITY_OPTIONS } from "../src/lib/symbolMap.ts";

// 1e (2026-08-09): two independent calendars for one fact, on opposite sides
// of the Deno boundary, with nothing binding them — and they had drifted:
// metals were client-open inside the maintenance hour the analyzer blocks,
// the complex hard-closed at an unprovenance'd 16:30 the client called open,
// forex reopened five minutes apart, and agriculture/livestock fell through
// to FX hours server-side. This file is the missing derivation test the
// weekly-close parity block in tests/marketHours.test.ts already models:
// neither side can import the other, so both are executed here against the
// same instants and pinned to each other.
//
// The law: for every roster symbol, at every session boundary, a HARD
// closure on one side is a hard closure on the other. Low-edge gates
// (ctx.lowEdge) are measurement policy — replay-derived hour filters the
// client deliberately does not mirror — and penalties are quality words,
// not closures; both are excluded, and that exclusion is the deliberate
// asymmetry, stated here rather than discovered.
describe("session-calendar parity across the Deno boundary (1e)", () => {
  // The same known EDT week tests/marketHours.test.ts reasons over:
  // Mon 2026-06-08 .. Sun 2026-06-14, offset UTC-4 throughout.
  const easternInstant = (
    day: number,
    hour: number,
    minute: number,
  ): Date => new Date(Date.UTC(2026, 5, day, hour + 4, minute));

  // Every boundary either calendar declares, each probed on both sides of
  // its edge. Weekday numbers are calendar days of June 2026: 8=Mon .. 12=Fri,
  // 13=Sat, 14=Sun.
  const INSTANTS: Date[] = [
    // Sunday preopen and opens: forex 17:05, complex 18:00, grains 20:00.
    easternInstant(14, 17, 4),
    easternInstant(14, 17, 5),
    easternInstant(14, 17, 59),
    easternInstant(14, 18, 0),
    easternInstant(14, 19, 59),
    easternInstant(14, 20, 0),
    // A plain weekday midmorning (open everywhere, low-edge aside).
    easternInstant(9, 9, 30),
    // Grain close and reopen, Tuesday.
    easternInstant(9, 14, 19),
    easternInstant(9, 14, 20),
    easternInstant(9, 19, 59),
    easternInstant(9, 20, 0),
    // FX rollover pause and the complex maintenance hour, Tuesday.
    easternInstant(9, 16, 58),
    easternInstant(9, 16, 59),
    easternInstant(9, 17, 4),
    easternInstant(9, 17, 5),
    easternInstant(9, 17, 30),
    easternInstant(9, 17, 59),
    easternInstant(9, 18, 0),
    // Friday: grain close, the complex's thin half hour, and the 17:00 close.
    easternInstant(12, 14, 19),
    easternInstant(12, 14, 20),
    easternInstant(12, 16, 29),
    easternInstant(12, 16, 30),
    easternInstant(12, 16, 59),
    easternInstant(12, 17, 0),
    easternInstant(12, 21, 0),
    // Deep weekend.
    easternInstant(13, 12, 0),
  ];

  it("agrees on every hard closure, for every roster symbol, at every boundary", () => {
    for (const option of SECURITY_OPTIONS) {
      for (const instant of INSTANTS) {
        const server = getSessionContext(option.symbol, instant);
        if (server.lowEdge) {
          continue;
        }
        const client = marketAvailability(
          option.assetType,
          option.symbol,
          instant,
        );
        assert.equal(
          client.open,
          !server.block,
          `${option.symbol} at ${instant.toISOString()}: client ${
            client.open ? "open" : "closed"
          }, server ${server.block ? `blocked (${server.label})` : "open"}`,
        );
      }
    }
  });

  it("keeps the deliberate asymmetries deliberate", () => {
    // The Friday 16:30-17:00 half hour is a PENALTY on the server, never a
    // block — the venue trades it (E8's own table closes the complex at
    // 16:00 CT), and the client shows it open.
    const thinFriday = easternInstant(12, 16, 45);
    const es = getSessionContext("ESUSD", thinFriday);
    assert.equal(es.block, false);
    assert.equal(es.penalty, 10);
    assert.equal(marketAvailability("Futures", "ESUSD", thinFriday).open, true);

    // Low-edge gates block server-side on replay evidence and stay
    // invisible to the client's calendar — measurement policy, not hours.
    const lowEdge = new Date(Date.UTC(2026, 5, 9, 13, 0));
    const btc = getSessionContext("BTCUSD", lowEdge);
    assert.equal(btc.block, true);
    assert.equal(btc.lowEdge, true);
    assert.equal(marketAvailability("Crypto", "BTCUSD", lowEdge).open, true);
  });
});
