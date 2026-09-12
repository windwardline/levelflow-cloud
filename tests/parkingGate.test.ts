import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

// The gate's contract is structural: the flag exists, App consults it
// before rendering sign-in, and the static twin mirrors the composition.
describe("construction soft gate", () => {
  it("keeps the gate flag and bypass in one flippable module", () => {
    const gate = readFileSync("src/lib/parkingGate.ts", "utf8");
    // Q2-M2: pinned to the operative value, not an (true|false) alternation —
    // that regex would accept a re-park silently. A deliberate re-park updates
    // this guard alongside the flag, the same way any other source-pin does.
    //
    // TRUE since the 2026-08-07 re-park (§17p — §17m is the 2026-08-01
    // post-launch rulings, a different section and a different date). This is
    // the guard doing its
    // job, not an obstacle to it: the pin is the reason a flag this consequential
    // cannot move without someone saying so in a test diff.
    assert.match(
      gate,
      /export const PARKING_GATE = true;/,
      "PARKING_GATE moved. RAISING IT IS STEP ONE OF TWO. App.tsx consults " +
        "this flag inside its `!session` branch, so the flag turns away " +
        "ARRIVALS and does nothing to VISITS already underway: every live " +
        "session keeps the desk open until those sessions are invalidated. " +
        "That second step runs against Supabase, so no test in this repo can " +
        "confirm it happened — this message is the only place the pairing is " +
        "enforced, at the one moment someone is definitely looking. The " +
        "2026-08-07 re-park ran both. Confirm the companion step before " +
        "updating this pin.",
    );
    assert.match(gate, /sessionStorage/);
    assert.match(gate, /has\("enter"\)/);
  });

  it("keeps the gate on the arrivals branch, which is what makes it two steps", () => {
    // THE PREMISE THE MESSAGE ABOVE DEPENDS ON. If the gate ever moved out of
    // the `!session` branch it would turn away live sessions too, the second
    // step would stop being necessary, and the guidance would become WRONG
    // guidance — worse than none, because it would send an operator to run an
    // invalidation the code no longer needs. Pinned so the advice and the code
    // cannot drift apart.
    const app = readFileSync("src/App.tsx", "utf8");
    const signedOut = app.slice(app.indexOf("if (!session) {"));
    const branch = signedOut.slice(0, signedOut.indexOf("\n  }"));
    assert.ok(
      branch.includes("PARKING_GATE && !parkingBypassActive()"),
      "the parking gate is no longer inside the signed-out branch — if it now " +
        "covers live sessions too, the two-step warning on the flag pin is " +
        "stale and must be rewritten, not merely moved",
    );
  });

  // Live again since the 2026-08-07 re-park: with PARKING_GATE true this
  // branch is what every signed-out visitor actually renders, so the
  // assertion is once more a claim about the public face and not only about
  // the wiring surviving.
  it("shows the parking view to signed-out visitors unless bypassed", () => {
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
    // Signed out there is no frame to present a document in, so this screen passes
    // neither §17o tier-2 prop and the trio stays a set of plain links — which now
    // navigate in the SAME tab, the new tab having been the thing §17o removed.
    assert.match(
      readFileSync("src/components/AppFooter.tsx", "utf8"),
      /<LegalLinks current=\{currentDocument\} onOpen=\{onOpenDocument\} \/>/,
    );
    assert.doesNotMatch(screen, /currentDocument|onOpenDocument/);
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

// THE GUARD INVERTED — built 2026-09-12, asked for at docs/HANDOFF.md:1875-1878.
//
// Pinning `PARKING_GATE = true` documents the two-step park. It does nothing
// about the thing that actually makes an unpark dangerous: the record kept a
// list of claims that "ship the moment it moves", and a flag flip is one
// character. The list cannot be enforced by a pin on the flag, because the pin
// only fires when the flag CHANGES and says nothing about what changes with it.
//
// So this asserts the CONDITIONAL: if the gate is open, the mechanisms that
// withhold every condemned claim must still be standing. While the desk is
// parked these assertions are inert by construction and say so. The moment
// someone flips the flag they become live, in the same test run, at the one
// moment a person is definitely looking.
//
// Verified 2026-09-12 before writing this: both claims the record listed are
// already closed. `describeReplayRecord` refuses all six asset types because
// every row carries `superseded` (replayReliability.ts), and GuidePanel's
// replay-record section says Levelflow is not showing a measured record rather
// than restating one. This guard keeps them closed through an unpark.
describe("an unpark may not carry a condemned claim back onto a screen", () => {
  const gateSource = () => readFileSync("src/lib/parkingGate.ts", "utf8");
  const gateIsOpen = () => /export const PARKING_GATE = false;/.test(gateSource());

  it("reads a parseable flag and EMITS which regime the cases below ran in", (t) => {
    // A conditional guard that silently no-ops is indistinguishable from one
    // that passed — three greens look identical whether they asserted or
    // returned early. So this does two things: it closes the
    // silently-unparseable path, and it PRINTS the regime, because a
    // declaration nobody can read is not a declaration.
    assert.ok(
      /export const PARKING_GATE = (true|false);/.test(gateSource()),
      "the gate flag is no longer a plain boolean literal — the conditional " +
        "guards below cannot read it, so they are silently inert. Restore a " +
        "literal or rewrite them.",
    );
    t.diagnostic(
      gateIsOpen()
        ? "PARKING_GATE is FALSE — the two guards below are LIVE and asserted"
        : "PARKING_GATE is TRUE — the two guards below are INERT by design " +
          "and asserted nothing; they arm on the flip",
    );
  });

  // A SENTINEL, NOT NEW COVERAGE, and the record should not read otherwise.
  // `tests/replayReliability.test.ts:27-47` already asserts this for all six
  // asset types on EVERY run, parked or not, with its own non-vacuity count —
  // that test is what actually enforces the refusal and what would have caught
  // the mutation below. This case adds zero enforced coverage today. It earns
  // its place only by being sited where someone flipping the gate will read
  // it, with a message written for that moment.
  //
  // BEHAVIOUR, NOT A STRING. The first version of this asserted
  // /record\.superseded/ against the whole file — and that string occurs
  // TWICE: once as the caveat suffix in formatReplayRecord, once as the
  // refusal in describeReplayRecord. Deleting only the refusal leaves the
  // caveat, and the regex stayed green while the condemned figure reached a
  // screen. My own mutation removed BOTH sites at once, so it proved the
  // regex matched something rather than the load-bearing thing — a guard that
  // passes through the exact mutation it exists to catch.
  //
  // This calls the function. A residue cannot satisfy it.
  it("keeps the superseded-record refusal standing when the gate opens", async () => {
    if (!gateIsOpen()) return; // parked: the surface renders to nobody
    const { describeReplayRecord, REPLAY_RECORD_BY_ASSET_TYPE, MEASURED_POPULATION_BY_ASSET_TYPE } =
      await import("../src/lib/replayReliability.ts");
    let checked = 0;
    for (const assetType of Object.keys(REPLAY_RECORD_BY_ASSET_TYPE) as Array<keyof typeof REPLAY_RECORD_BY_ASSET_TYPE>) {
      const population = MEASURED_POPULATION_BY_ASSET_TYPE[assetType];
      const symbol = population ? [...population][0] : undefined;
      if (!symbol) continue;
      checked += 1;
      assert.equal(
        describeReplayRecord(symbol, assetType),
        null,
        `PARKING_GATE is FALSE and ${assetType} renders a measured record ` +
          `through ${symbol}. Every stored row was measured by the retired ` +
          `pre-repair evaluator and the first repaired baseline measured the ` +
          `accepted stream NEGATIVE in every class. Opening the desk with ` +
          `this refusal removed publishes condemned figures as measured fact.`,
      );
    }
    assert.ok(
      checked >= 6,
      `the guard examined ${checked} asset types; all six carry superseded ` +
        `rows, so examining fewer means the population moved and this guard ` +
        `is reporting on less than it claims`,
    );
  });

  it("keeps the guide withholding the record rather than restating it when the gate opens", () => {
    if (!gateIsOpen()) return; // parked: the surface renders to nobody
    const guide = readFileSync("src/components/workspace/GuidePanel.tsx", "utf8");
    assert.match(
      guide,
      /not showing a measured record right now/,
      "PARKING_GATE is FALSE and the guide's replay-record section no longer " +
        "withholds. Publishing the pre-repair figures with a caveat would " +
        "still be publishing them (copy law: text must not say what is not " +
        "true).",
    );
  });
});
