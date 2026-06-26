import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MarketDataPoint } from "../src/lib/marketData";
import { findBestVolatilityWindow } from "../src/lib/volatilityWindows";

describe("volatility timing windows", () => {
  it("recommends the recurring two-hour window with strongest realized movement", () => {
    const points = buildHourlyPoints();
    const window = findBestVolatilityWindow(points, "America/New_York");

    assert.equal(window?.startHourUtc, 13);
    assert.equal(window?.endHourUtc, 15);
    assert.equal(window?.sessionLabel, "Europe");
    assert.equal(window?.averageMovePct > window?.baselineMovePct!, true);
    assert.equal(window?.sampleCount, 20);
  });

  it("formats the recommendation in the user's selected local time zone", () => {
    const points = buildHourlyPoints();
    const eastern = findBestVolatilityWindow(points, "America/New_York");
    const pacific = findBestVolatilityWindow(points, "America/Los_Angeles");

    assert.notEqual(eastern?.localWindowLabel, pacific?.localWindowLabel);
    assert.match(eastern?.localWindowLabel ?? "", /EST|EDT/);
    assert.match(pacific?.localWindowLabel ?? "", /PST|PDT/);
    assert.equal(eastern?.utcWindowLabel, pacific?.utcWindowLabel);
  });

  it("uses the current date offset when showing daylight or standard time", () => {
    const points = buildHourlyPoints();
    const winter = findBestVolatilityWindow(
      points,
      "America/New_York",
      new Date("2026-01-15T12:00:00Z"),
    );
    const summer = findBestVolatilityWindow(
      points,
      "America/New_York",
      new Date("2026-06-15T12:00:00Z"),
    );

    assert.match(winter?.localWindowLabel ?? "", /EST/);
    assert.match(summer?.localWindowLabel ?? "", /EDT/);
  });

  it("waits for enough real intraday samples", () => {
    const points = buildHourlyPoints().slice(0, 12);

    assert.equal(findBestVolatilityWindow(points, "America/New_York"), null);
  });
});

function buildHourlyPoints(): MarketDataPoint[] {
  const points: MarketDataPoint[] = [];
  const start = Date.UTC(2026, 0, 5, 0, 0, 0);

  for (let day = 0; day < 10; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const close = 100 + day * 0.1;
      const range = hour === 13 || hour === 14 ? 2.6 : 0.7;
      points.push({
        close,
        high: close + range / 2,
        low: close - range / 2,
        open: close,
        time: Math.trunc((start + (day * 24 + hour) * 60 * 60 * 1000) / 1000),
        value: close,
        volume: 1000,
      });
    }
  }

  return points;
}
