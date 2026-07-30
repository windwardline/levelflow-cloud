import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

// The gate's contract is structural: the flag exists, App consults it
// before rendering sign-in, and the static twin mirrors the composition.
describe("construction soft gate", () => {
  it("keeps the gate flag and bypass in one flippable module", () => {
    const gate = readFileSync("src/lib/parkingGate.ts", "utf8");
    assert.match(gate, /export const PARKING_GATE = (true|false);/);
    assert.match(gate, /sessionStorage/);
    assert.match(gate, /has\("enter"\)/);
  });

  it("App shows the parking view to signed-out visitors unless bypassed", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    assert.match(app, /PARKING_GATE && !parkingBypassActive\(\)/);
    assert.match(app, /<ParkingScreen/);
  });

  it("keeps the static twin CSP-safe and reusable", () => {
    const twin = readFileSync("public/construction.html", "utf8");
    assert.doesNotMatch(twin, /<style|style=/);
    assert.match(twin, /class="parking"/);
    assert.match(twin, /legal\.css/);
    const css = readFileSync("public/legal/legal.css", "utf8");
    assert.match(css, /body\.parking \{/);
  });
});
