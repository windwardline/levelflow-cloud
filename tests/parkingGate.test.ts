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

  // Fix wave 2B, FIX 2 (completeness-audit-2 Finding 5). PARKING_GATE is
  // true, so the parking view is every signed-out visitor's actual public
  // face — before this fix it offered no path at all to Terms/Privacy/Risk
  // disclaimer, unlike AuthScreen (which renders <LegalLinks /> in its card
  // footer). Both the live React screen and its static twin need the fix,
  // since they're required to stay in visual parity (see this file's other
  // assertions above and ParkingScreen.tsx's own header comment).
  it("ParkingScreen reuses the shared LegalLinks component, not a bespoke row", () => {
    const screen = readFileSync(
      "src/components/auth/ParkingScreen.tsx",
      "utf8",
    );
    assert.match(screen, /import \{ LegalLinks \} from "..\/legal\/LegalLinks";/);
    assert.match(screen, /<LegalLinks \/>/);
  });

  it("the static twin links to all three legal pages, quietly (muted, small — not the accent body-link style)", () => {
    const twin = readFileSync("public/construction.html", "utf8");
    const legalLinksBlock = twin.match(
      /<nav class="legal-links"[\s\S]*?<\/nav>/,
    )?.[0] ?? "";
    assert.ok(legalLinksBlock.length > 0, "expected a nav.legal-links block");
    assert.match(legalLinksBlock, /href="\/legal\/risk-disclaimer\.html"/);
    assert.match(legalLinksBlock, /href="\/legal\/privacy\.html"/);
    assert.match(legalLinksBlock, /href="\/legal\/terms\.html"/);

    const css = readFileSync("public/legal/legal.css", "utf8");
    assert.match(css, /\.legal-links a \{[^}]*color: var\(--color-ink-muted\)/s);
  });
});
