import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

// The gate's contract is structural: the flag exists, App consults it
// before rendering sign-in, and the static twin mirrors the composition.
describe("construction soft gate", () => {
  it("keeps the gate flag and bypass in one flippable module", () => {
    const gate = readFileSync("src/lib/parkingGate.ts", "utf8");
    // Q2-M2: pinned to the operative value (false, since §17l's launch), not
    // an (true|false) alternation — that regex would accept a re-park
    // silently. A future deliberate re-park updates this guard alongside
    // the flag, the same way any other source-pin does.
    assert.match(gate, /export const PARKING_GATE = false;/);
    assert.match(gate, /sessionStorage/);
    assert.match(gate, /has\("enter"\)/);
  });

  // Q2-M2: renamed from "App shows the parking view to signed-out visitors
  // unless bypassed" — false since §17l opened the gate; this only proves
  // the branch is still wired, not that it currently renders for anyone.
  it("keeps App's parking-view branch wired for whenever the gate reopens", () => {
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

  // Fix wave 2B, FIX 2 (completeness-audit-2 Finding 5), from when
  // PARKING_GATE was true and the parking view was every signed-out
  // visitor's actual public face — before that fix it offered no path at
  // all to Terms/Privacy/Risk disclaimer, and the fix was an in-body
  // <LegalLinks /> row, since this page had no footer to put one in.
  //
  // Spec §17i gave it a footer — the app's own, in the frame, always visible —
  // and with it the single-home rule: the trio lives in that footer's link row
  // and the in-body row is DELETED on both the React screen and its static twin.
  // The claim is unchanged (a signed-out visitor can reach all three documents);
  // only its one home moved, so this inverts rather than drops.
  it("ParkingScreen reaches the legal trio through the framed footer, with no in-body row", () => {
    const screen = readFileSync(
      "src/components/auth/ParkingScreen.tsx",
      "utf8",
    );
    // The import and the element, not the bare word: this screen's own comment
    // documents the removal, and prose is not a second link row.
    assert.doesNotMatch(screen, /import \{[^}]*LegalLinks/);
    assert.doesNotMatch(screen, /<LegalLinks/);
    assert.match(screen, /import \{ AppFooter \} from "\.\.\/AppFooter";/);
    // The footer's own link row is where the trio comes from, and it reads the
    // single source LegalLinks.tsx exports (tests/appFooter.test.ts pins that).
    assert.match(screen, /<AppFooter\s+donate=\{\{ href: "\/\?donate" \}\}/);
    assert.match(
      readFileSync("src/components/AppFooter.tsx", "utf8"),
      /<LegalLinks \/>/,
    );
  });

  it("the static twin links to all three legal pages, quietly, from its own footer row", () => {
    const twin = readFileSync("public/construction.html", "utf8");
    const footer = twin.match(/<footer>[\s\S]*?<\/footer>/)?.[0] ?? "";
    assert.ok(footer.length > 0, "expected the twin's footer");
    const legalLinksBlock = footer.match(
      /<nav class="legal-links"[\s\S]*?<\/nav>/,
    )?.[0] ?? "";
    assert.ok(legalLinksBlock.length > 0, "expected a nav.legal-links block");
    assert.match(legalLinksBlock, /href="\/legal\/risk-disclaimer\.html"/);
    assert.match(legalLinksBlock, /href="\/legal\/privacy\.html"/);
    assert.match(legalLinksBlock, /href="\/legal\/terms\.html"/);
    // One row, in the footer: the body carries the mark, the eyebrow, the
    // wordmark, the rule and one line, and nothing else (§17j).
    assert.equal((twin.match(/class="legal-links"/g) ?? []).length, 1);
    const main = twin.match(/<main>[\s\S]*?<\/main>/)?.[0] ?? "";
    assert.doesNotMatch(main, /legal-links/);

    const css = readFileSync("public/legal/legal.css", "utf8");
    assert.match(css, /\.legal-links a \{[^}]*color: var\(--color-ink-muted\)/s);
  });
});

// Spec §17j (owner ruling, 2026-08-01): "The parking layout is a saved, reusable
// standard — mark, eyebrow, wordmark, accent rule, one body line, THE footer in
// the frame — and its copy must fit ANY future pause, not the occasion that built
// it." The canonical line is quoted in the ruling; the guard exists because a
// saved standard is exactly the thing a later occasion rewrites occasion-specific
// copy back into, and the two files have to say it identically.
describe("§17j — the parking page's canonical line", () => {
  const CANONICAL =
    "The desk is closed while we work on it. Sign-in resumes the moment it reopens.";
  // The line wraps across source lines in both files, so both sides collapse.
  const collapse = (value: string) => value.replace(/\s+/g, " ");

  for (
    const file of [
      "src/components/auth/ParkingScreen.tsx",
      "public/construction.html",
    ]
  ) {
    it(`${file} carries it verbatim, and none of the retired occasion copy`, () => {
      const source = collapse(readFileSync(file, "utf8"));
      assert.ok(source.includes(CANONICAL), `${file} must carry the §17j line`);
      // The 2026-07 rebuild's own wording: it named this occasion's work and
      // promised the pause would end with it, which is what §17j retires.
      assert.doesNotMatch(source, /Levelflow is being rebuilt/);
      assert.doesNotMatch(source, /Sign-in is paused while the work lands/);
      assert.doesNotMatch(source, /a new engine and a new face/);
      // §17f: no duration promised, and the eyebrow still says what the state is.
      assert.doesNotMatch(source, /\b(?:soon|shortly|weeks?|days?)\b/i);
      assert.match(source, /Under construction/);
    });
  }

  it("says it once per file, in the body's one line", () => {
    for (
      const file of [
        "src/components/auth/ParkingScreen.tsx",
        "public/construction.html",
      ]
    ) {
      const source = collapse(readFileSync(file, "utf8"));
      assert.equal(
        source.split(CANONICAL).length - 1,
        1,
        `${file} must carry the line exactly once`,
      );
    }
  });
});
