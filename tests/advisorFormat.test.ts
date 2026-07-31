import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCopyValue,
  formatRelativeTime,
} from "../src/components/workspace/advisorFormat.ts";

// Clipboard payload for the per-value ladder copy (spec §7). formatNumber
// (display) defers to the runtime's locale via `toLocaleString(undefined,
// ...)` — under de-DE that both groups thousands AND swaps the decimal to
// a comma, so a copied price silently corrupts on paste into a broker's
// price field. formatCopyValue pins "en-US" with grouping off instead, so
// the payload is a deterministic plain number no matter the viewer's
// machine locale.
describe("formatCopyValue", () => {
  it("never groups thousands, unlike the display formatter", () => {
    assert.equal(formatCopyValue(117240), "117240");
    assert.equal(formatCopyValue(65432.1), "65432.1");
    assert.equal(formatCopyValue(1234567.89), "1234567.89");
  });

  it("keeps a plain decimal for values under 1000, including sub-1 forex quotes", () => {
    assert.equal(formatCopyValue(2384.2), "2384.2");
    // Forex quotes sub-1 with five decimals (e.g. EUR/GBP-style pairs) —
    // the decimal point must survive exactly, not just the grouping.
    assert.equal(formatCopyValue(0.75489), "0.75489");
  });

  it("never contains a grouping separator, for any value the ladder can show", () => {
    for (const value of [999, 1000, 0.75489, 2384.2, 65432.1, 117240, 1234567.89]) {
      assert.doesNotMatch(formatCopyValue(value), /,/);
    }
  });

  it("always uses a period decimal point, independent of machine locale", () => {
    // toLocaleString(undefined, ...) — formatNumber's approach — would
    // render a comma decimal under de-DE et al. Pinning "en-US" explicitly
    // is what guarantees a period here regardless of the runtime locale.
    for (const value of [0.75489, 117240.5, 65432.1]) {
      const payload = formatCopyValue(value);
      assert.match(payload, /^\d+\.\d+$/, `${value} -> "${payload}"`);
    }
  });

  it("round-trips through Number() back to the exact original value", () => {
    for (
      const value of [0.75489, 2384.2, 117240, 65432.1, 1.0884, 0.5, 999999.99999]
    ) {
      assert.equal(Number(formatCopyValue(value)), value);
    }
  });

  it("caps at 5 fraction digits, matching the display formatter's own precision", () => {
    assert.equal(formatCopyValue(1.234567), "1.23457");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");

  it("reports very recent updates in plain language, not a raw duration", () => {
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T11:59:40.000Z").toISOString(), now),
      "Just now",
    );
  });

  it("uses singular minute/hour/day near the boundary", () => {
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T11:59:00.000Z").toISOString(), now),
      "1 minute ago",
    );
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T11:00:00.000Z").toISOString(), now),
      "1 hour ago",
    );
    assert.equal(
      formatRelativeTime(new Date("2026-07-29T12:00:00.000Z").toISOString(), now),
      "1 day ago",
    );
  });

  it("pluralizes minutes, hours, and days", () => {
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T11:55:00.000Z").toISOString(), now),
      "5 minutes ago",
    );
    assert.equal(
      formatRelativeTime(new Date("2026-07-30T09:00:00.000Z").toISOString(), now),
      "3 hours ago",
    );
    assert.equal(
      formatRelativeTime(new Date("2026-07-27T12:00:00.000Z").toISOString(), now),
      "3 days ago",
    );
  });

  it("falls back to an absolute date once the gap stops being legible as a relative phrase", () => {
    const value = new Date("2026-07-01T12:00:00.000Z").toISOString();
    const result = formatRelativeTime(value, now);
    assert.doesNotMatch(result, /ago$/);
  });

  it("treats an invalid or missing timestamp as awaiting refresh", () => {
    assert.equal(formatRelativeTime("not-a-date", now), "Awaiting refresh");
  });
});
