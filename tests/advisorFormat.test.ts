import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRelativeTime } from "../src/components/workspace/advisorFormat.ts";

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
