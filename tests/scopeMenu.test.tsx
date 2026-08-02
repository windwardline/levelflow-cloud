import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatReopen } from "../src/lib/marketHours";
import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_OPTIONS,
  formatSecurityDisplaySymbol,
  formatSecurityLabel,
  getSecurityOption,
  type SupportedSymbol,
} from "../src/lib/symbolMap";
import {
  buildScopeMenuRows,
  describeScanScope,
  formatScopeCountLine,
  formatScopeMenuAffordance,
  MOBILE_SHEET_BREAKPOINT_PX,
  moveScopeMenuHighlight,
  resolveRowActivation,
  shouldUseSheetLayout,
  showsAffordance,
  type ScanScope,
  type ScopeMenuRow,
} from "../src/components/workspace/ScopeMenu";

// This suite tests ScopeMenu.tsx entirely through its exported pure
// functions (row model, keyboard-highlight reducer, formatters), the same
// approach tests/confidenceUnit.test.tsx uses for ConfidenceUnit.tsx.
// Actually rendering <ScopeMenu> is deliberately not attempted here: it is
// an interactive component driven by real click/keydown handlers, and this
// suite has no jsdom to dispatch those events into (tests/workspaceNav.test.tsx's
// renderToStaticMarkup only produces markup, it doesn't give you a live DOM
// to interact with). The pure functions below are exactly what those
// handlers call, so they pin the same behavior without needing one. (tsx
// now resolves tsconfig.tests.json for tests/ — see
// tests/workspaceNav.test.tsx — so the classic-JSX-transform/stray-React-import
// conflict this comment used to describe no longer exists; it was never the
// reason this file skips rendering, just a second one that used to apply too.)

// Same known week used by tests/marketHours.test.ts (America/New_York,
// comfortably inside EDT) so every scenario below can be reasoned about
// against that file's already-verified boundary table (spec
// 2026-07-30-levelflow-desk-design.md #10b).
const WEDNESDAY_2PM_ET = new Date("2026-06-10T18:00:00.000Z"); // everything open
const SATURDAY_NOON_ET = new Date("2026-06-13T16:00:00.000Z"); // only crypto open

function keyFromScope(scope: ScanScope): string {
  if (scope.kind === "all") {
    return "all";
  }
  if (scope.kind === "group") {
    return `group:${scope.assetType}`;
  }
  return `symbol:${scope.symbol}`;
}

function localClockTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

describe("buildScopeMenuRows", () => {
  it("mirrors AVAILABLE_ASSET_GROUPS exactly: all markets, then each group in order, then its markets in order", () => {
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);

    const expectedKeys = [
      "all",
      ...AVAILABLE_ASSET_GROUPS.flatMap((group) => [
        `group:${group.label}`,
        ...group.options.map((option) => `symbol:${option.symbol}`),
      ]),
    ];
    assert.deepEqual(rows.map((row) => row.key), expectedKeys);

    const expectedLabels = [
      "All markets",
      ...AVAILABLE_ASSET_GROUPS.flatMap((group) => [
        group.label,
        ...group.options.map((option) => option.label),
      ]),
    ];
    assert.deepEqual(rows.map((row) => row.label), expectedLabels);

    // Every row's `scope` must agree with its own `key` - catches a
    // mismatched scope object slipping past the label/key checks above.
    for (const row of rows) {
      assert.equal(keyFromScope(row.scope), row.key, row.key);
    }
  });

  it("gives every group row and every market row exactly one row each, nested markets marked as such", () => {
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    const groupRows = rows.filter((row) => row.scope.kind === "group");
    const symbolRows = rows.filter((row) => row.scope.kind === "symbol");

    assert.equal(groupRows.length, AVAILABLE_ASSET_GROUPS.length);
    assert.equal(
      symbolRows.length,
      AVAILABLE_ASSET_GROUPS.reduce((sum, group) => sum + group.options.length, 0),
    );
    assert.ok(groupRows.every((row) => row.nested === false));
    assert.ok(symbolRows.every((row) => row.nested === true));
    assert.equal(rows[0]?.nested, false);
  });

  it("when everything but crypto is closed, all interactive rows are 'all', crypto's group, and crypto's markets - in that order", () => {
    const rows = buildScopeMenuRows(SATURDAY_NOON_ET);
    const cryptoGroup = AVAILABLE_ASSET_GROUPS.find((group) => group.label === "Crypto");
    assert.ok(cryptoGroup);

    const interactiveKeys = rows.filter((row) => row.interactive).map((row) => row.key);
    assert.deepEqual(interactiveKeys, [
      "all",
      "group:Crypto",
      ...cryptoGroup.options.map((option) => `symbol:${option.symbol}`),
    ]);
  });
});

describe("showsAffordance", () => {
  it("never shows anything on 'All markets', open or closed: scanning it defers to the server's own curated universe, not a client-counted total", () => {
    const [allRow] = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    assert.ok(allRow);
    assert.equal(allRow.scope.kind, "all");
    assert.equal(showsAffordance(allRow), false);
  });

  it("shows 'Scan N' on an open group, nothing on an open market, in the full menu", () => {
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    const groupRow = rows.find((row) => row.key === "group:Forex");
    const marketRow = rows.find((row) => row.key === "symbol:EURUSD");
    assert.ok(groupRow);
    assert.ok(marketRow);
    assert.equal(showsAffordance(groupRow), true);
    assert.equal(showsAffordance(marketRow), false);
  });

  it("shows a closed group's reopen label, whatever the rest of the menu is doing", () => {
    const rows = buildScopeMenuRows(SATURDAY_NOON_ET);
    const openGroup = rows.find((row) => row.key === "group:Crypto");
    const closedGroup = rows.find((row) => row.key === "group:Forex");
    assert.ok(openGroup);
    assert.ok(closedGroup);
    assert.equal(showsAffordance(openGroup), true);
    assert.equal(showsAffordance(closedGroup), true);
  });
});

// Spec §17m.1 deleted the stage's direct-review picker, and with it the whole
// symbolOnly mode this suite used to cover (effectiveRows, the neutered group
// rows, the closed-market-still-selectable rule). Inverted to absence, per the
// §16 both-directions discipline: the menu has ONE shape now — the scan scope —
// and the mode's machinery may not come back as dead code.
describe("the stage picker's symbolOnly mode is gone (§17m.1)", () => {
  const SOURCE = readFileSync(
    "src/components/workspace/ScopeMenu.tsx",
    "utf8",
  );

  it("exports no symbolOnly transform and takes no symbolOnly prop", () => {
    assert.doesNotMatch(SOURCE, /effectiveRows/);
    assert.doesNotMatch(SOURCE, /symbolOnly/);
  });

  it("keeps no heading variant of the trigger — the stage's heading is plain text now", () => {
    assert.doesNotMatch(SOURCE, /variant/);
    assert.doesNotMatch(SOURCE, /scopeTriggerLabel/);
    assert.doesNotMatch(SOURCE, /HEADING_MENU_MIN_WIDTH_PX/);
  });

  it("renders the menu straight off the row model, with every row as built", () => {
    assert.match(SOURCE, /const rows = buildScopeMenuRows\(clock\);/);
    // "All markets" is a real row again for both hosts — no call site drops it.
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    assert.equal(rows[0]?.key, "all");
    assert.equal(resolveRowActivation(rows[0]!)?.kind, "all");
  });
});

// Spec §17m.5: "smaller menu typography; closed-market availability lines must
// not truncate — OPENS 6:00P SUN reads in full even while the row is disabled."
// Two halves, both pinned here: the row yields its LABEL first (structural, so
// no string length can push the line out), and the line's own type is small
// enough that the label still has room to read.
//
// The width arithmetic is not a guess. IBM Plex Mono's advance at these sizes
// was measured in Chromium against the built CSS (docs: wave-9 report):
//   retired  .eyebrow + font-mono, 12px / 0.14em  →  8.88px per character
//   shipped  10.5px / 0.06em                      →  6.93px per character
// A monospace face is the reason a number like that is a fact rather than an
// estimate: every glyph advances identically, so the width of a string is its
// length times that constant.
describe("scope-menu row width — the availability line always fits (§17m.5)", () => {
  const SOURCE = readFileSync(
    "src/components/workspace/ScopeMenu.tsx",
    "utf8",
  );
  // The rail column is 264px wide with a 16px right inset (AdvisorWorkspace's
  // lg:pr-4), and the anchored popup matches its trigger's width.
  const POPUP_WIDTH_PX = 248;
  const MONO_ADVANCE_PX = 6.93;
  // A nested (market) row's fixed cost: pl-6 + pr-2.5 padding, the 14px
  // check/spacer column plus its gap-2, and the gap-2.5 before the line.
  const ROW_FIXED_PX = 24 + 10 + 14 + 8 + 10;
  // Enough of the market name to be worth reading — the point of the ruling.
  const LABEL_FLOOR_PX = 60;

  // Every availability line the real formatters can produce, sampled hour by
  // hour across a full week for every asset class the menu lists: closed-market
  // reopen lines and open-group scan counts alike.
  function everyAffordance(): string[] {
    const seen = new Set<string>();
    const start = Date.UTC(2026, 5, 7);
    for (let hour = 0; hour < 24 * 7; hour += 1) {
      const now = new Date(start + hour * 3_600_000);
      for (const row of buildScopeMenuRows(now)) {
        if (!showsAffordance(row)) {
          continue;
        }
        seen.add(
          formatScopeMenuAffordance(row.availability, row.count ?? 0, now),
        );
      }
    }
    return [...seen];
  }

  it("keeps the longest real availability line inside the popup, with the name still readable", () => {
    const affordances = everyAffordance();
    assert.ok(affordances.length > 0, "expected availability lines to sample");
    const longest = affordances.reduce((worst, line) =>
      line.length > worst.length ? line : worst
    );
    const lineWidth = longest.length * MONO_ADVANCE_PX;
    const labelRoom = POPUP_WIDTH_PX - ROW_FIXED_PX - lineWidth;
    assert.ok(
      labelRoom >= LABEL_FLOOR_PX,
      `"${longest}" (${longest.length} chars, ${
        lineWidth.toFixed(1)
      }px) leaves only ${labelRoom.toFixed(1)}px for the market name`,
    );
    // And the same line under the retired treatment, which is the measurement
    // the ruling was written about: it spent 31px more on one row.
    assert.ok(longest.length * 8.88 > lineWidth);
  });

  it("even the month-day fallback fits — the form no calendar produces yet", () => {
    // formatReopen's beyond-the-week rendering ("Opens 12:00p Dec 25"): 19
    // characters, unreachable until a holiday calendar exists, and the geometry
    // must not be waiting for it to become a defect.
    const longest = "Opens 12:00p Dec 25";
    const labelRoom = POPUP_WIDTH_PX - ROW_FIXED_PX -
      longest.length * MONO_ADVANCE_PX;
    assert.ok(labelRoom > 0, `the fallback line overflows by ${-labelRoom}px`);
  });

  it("pins the line's own type, and the label as the part that yields", () => {
    assert.match(
      SOURCE,
      /className="shrink-0 whitespace-nowrap font-mono text-\[10\.5px\] font-semibold uppercase leading-4 tracking-\[0\.06em\] text-ink-muted"/,
    );
    // Not the .eyebrow kit class any more: at 12px/0.14em this line was a third
    // of the popup. Both directions, so it cannot drift back.
    assert.doesNotMatch(SOURCE, /className="eyebrow shrink-0 font-mono"/);
    assert.match(SOURCE, /<span className="min-w-0 truncate">\{row\.label\}<\/span>/);
  });

  it("pins the row's own smaller type and insets, and keeps the 44px row", () => {
    assert.match(
      SOURCE,
      /"flex min-h-11 cursor-pointer items-center justify-between gap-2\.5 pr-2\.5 text-\[13px\]"/,
    );
    assert.match(SOURCE, /const indent = row\.nested \? "pl-6" : "pl-2\.5";/);
    // The retired, roomier set is gone.
    assert.doesNotMatch(SOURCE, /justify-between gap-3 pr-3 text-sm/);
    assert.doesNotMatch(SOURCE, /"pl-7"/);
  });
});

describe("closed rows: inert, muted, reopen affordance - never the word \"closed\"", () => {
  const rows = buildScopeMenuRows(SATURDAY_NOON_ET);
  const byKey = (key: string) => {
    const row = rows.find((candidate) => candidate.key === key);
    assert.ok(row, key);
    return row;
  };

  it("a closed group row is non-interactive and resolves no activation", () => {
    const forexGroup = byKey("group:Forex");
    assert.equal(forexGroup.interactive, false);
    assert.equal(resolveRowActivation(forexGroup), null);
  });

  it("a market nested under a closed group inherits the group's closed state and is also inert", () => {
    const eurusd = byKey("symbol:EURUSD");
    const forexGroup = byKey("group:Forex");
    assert.equal(eurusd.interactive, false);
    assert.equal(resolveRowActivation(eurusd), null);
    assert.deepEqual(eurusd.availability, forexGroup.availability);
  });

  it("the closed affordance is the reopen label, exactly what marketHours.formatReopen produces, prefixed 'Opens '", () => {
    const forexGroup = byKey("group:Forex");
    assert.equal(forexGroup.availability.open, false);
    if (forexGroup.availability.open) {
      return;
    }
    const affordance = formatScopeMenuAffordance(
      forexGroup.availability,
      forexGroup.count ?? 0,
      SATURDAY_NOON_ET,
    );
    assert.equal(
      affordance,
      `Opens ${formatReopen(forexGroup.availability.opensAt, SATURDAY_NOON_ET)}`,
    );
  });

  it("never spells the word \"closed\" in any row's affordance, group or market, at a time when most of the menu is shut", () => {
    for (const row of rows) {
      const affordance = formatScopeMenuAffordance(
        row.availability,
        row.count ?? 0,
        SATURDAY_NOON_ET,
      );
      assert.doesNotMatch(affordance.toLowerCase(), /closed/);
    }
  });

  it("an open group (crypto) is interactive and shows 'Scan N'", () => {
    const cryptoGroup = byKey("group:Crypto");
    assert.equal(cryptoGroup.interactive, true);
    assert.deepEqual(
      resolveRowActivation(cryptoGroup),
      { assetType: "Crypto", kind: "group" },
    );
    assert.equal(
      formatScopeMenuAffordance(cryptoGroup.availability, cryptoGroup.count ?? 0, SATURDAY_NOON_ET),
      `Scan ${cryptoGroup.count}`,
    );
  });
});

describe("keyboard navigation (moveScopeMenuHighlight) fires the right scope on activation", () => {
  it("steps forward from nothing highlighted onto 'All markets' first", () => {
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    const firstKey = moveScopeMenuHighlight(rows, null, 1);
    assert.equal(firstKey, "all");
  });

  it("stepping down twice from nothing highlighted reaches the first group, and Enter there resolves that group's scope", () => {
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    const first = moveScopeMenuHighlight(rows, null, 1);
    const second = moveScopeMenuHighlight(rows, first, 1);
    assert.equal(second, `group:${AVAILABLE_ASSET_GROUPS[0]?.label}`);

    const row = rows.find((candidate) => candidate.key === second);
    assert.ok(row);
    assert.deepEqual(resolveRowActivation(row), {
      assetType: AVAILABLE_ASSET_GROUPS[0]?.label,
      kind: "group",
    });
  });

  it("stepping down enough times lands on a specific market row, and Enter there resolves exactly that symbol", () => {
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    const firstGroup = AVAILABLE_ASSET_GROUPS[0];
    assert.ok(firstGroup);
    const firstMarket = firstGroup.options[0];
    assert.ok(firstMarket);

    // "all" -> first group -> first group's first market: three steps down.
    let key: string | null = null;
    for (let step = 0; step < 3; step += 1) {
      key = moveScopeMenuHighlight(rows, key, 1);
    }
    assert.equal(key, `symbol:${firstMarket.symbol}`);

    const row = rows.find((candidate) => candidate.key === key);
    assert.ok(row);
    assert.deepEqual(resolveRowActivation(row), {
      kind: "symbol",
      symbol: firstMarket.symbol,
    });
  });

  it("wraps from the last interactive row back to 'all' going down, and back again going up", () => {
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    const interactiveKeys = rows.filter((row) => row.interactive).map((row) => row.key);
    const lastKey = interactiveKeys[interactiveKeys.length - 1] ?? null;

    assert.equal(moveScopeMenuHighlight(rows, lastKey, 1), "all");
    assert.equal(moveScopeMenuHighlight(rows, "all", -1), lastKey);
  });

  it("skips every inert row entirely - on a mostly-closed menu, down from 'all' still reaches crypto's group directly, and down from crypto's last market wraps straight back to 'all'", () => {
    const rows = buildScopeMenuRows(SATURDAY_NOON_ET);
    const cryptoGroup = AVAILABLE_ASSET_GROUPS.find((group) => group.label === "Crypto");
    assert.ok(cryptoGroup);
    const lastCryptoSymbol = cryptoGroup.options[cryptoGroup.options.length - 1];
    assert.ok(lastCryptoSymbol);

    assert.equal(moveScopeMenuHighlight(rows, "all", 1), "group:Crypto");
    assert.equal(
      moveScopeMenuHighlight(rows, `symbol:${lastCryptoSymbol.symbol}`, 1),
      "all",
    );
  });

  it("a key with no interactive rows at all yields no highlight", () => {
    const inertRows: ScopeMenuRow[] = buildScopeMenuRows(SATURDAY_NOON_ET)
      .filter((row) => !row.interactive);
    assert.ok(inertRows.length > 0);
    assert.equal(moveScopeMenuHighlight(inertRows, null, 1), null);
  });
});

describe("describeScanScope", () => {
  it("labels each scope kind", () => {
    assert.equal(describeScanScope({ kind: "all" }), "All markets");
    assert.equal(
      describeScanScope({ assetType: "Forex", kind: "group" }),
      "Forex",
    );
    const symbol: SupportedSymbol = "EURUSD";
    assert.equal(
      describeScanScope({ kind: "symbol", symbol }),
      formatSecurityLabel(symbol),
    );
  });
});

describe("formatScopeCountLine renders server counts verbatim", () => {
  it("interpolates scanned/qualified exactly as given, with the scope label and a machine-locale time", () => {
    const now = new Date("2026-06-10T18:34:00.000Z");
    const line = formatScopeCountLine(
      { assetType: "Metals", kind: "group" },
      { qualified: 3, scanned: 41 },
      now,
    );
    assert.equal(
      line,
      `Metals — 41 scanned · 3 qualify · ${localClockTime(now)}`,
    );
  });

  it("never rounds or reformats the server numbers, including zero and large counts", () => {
    const now = new Date("2026-06-10T09:05:00.000Z");
    const line = formatScopeCountLine(
      { kind: "all" },
      { qualified: 0, scanned: 1234 },
      now,
    );
    assert.equal(
      line,
      `All markets — 1234 scanned · 0 qualify · ${localClockTime(now)}`,
    );
  });

  it("uses the exact market label for a symbol scope", () => {
    const now = new Date("2026-06-10T09:05:00.000Z");
    const symbol: SupportedSymbol = "XAUUSD";
    const line = formatScopeCountLine(
      { kind: "symbol", symbol },
      { qualified: 1, scanned: 1 },
      now,
    );
    assert.equal(
      line,
      `${formatSecurityLabel(symbol)} — 1 scanned · 1 qualify · ${
        localClockTime(now)
      }`,
    );
  });
});

// The stagehead, the merged mobile head and the expanded-chart title all name
// the market in ticker form: the full descriptive label runs far past the stage
// at heading size. Every list, menu and scan row keeps the full label, which is
// what the e2e row-order specs and formatScopeCountLine above are pinned to.
describe("formatSecurityDisplaySymbol (the heading form of a market name)", () => {
  it("keeps only the ticker half of the label, dropping the description", () => {
    assert.equal(formatSecurityDisplaySymbol("EURUSD"), "EUR/USD");
    assert.equal(formatSecurityDisplaySymbol("XAUUSD"), "XAU/USD");
    assert.equal(formatSecurityDisplaySymbol("ESUSD"), "ES");
  });

  it("recovers the display symbol exactly for every listed market, never an empty string", () => {
    for (const option of AVAILABLE_ASSET_OPTIONS) {
      const display = formatSecurityDisplaySymbol(option.symbol);
      assert.ok(display.length > 0, `${option.symbol} produced no display form`);
      assert.equal(option.label.startsWith(display), true);
      assert.doesNotMatch(display, / - /);
    }
  });

  it("falls back to the whole label when an option is not built from a description suffix", () => {
    // getSecurityOption's unknown-symbol fallback sets label === description
    // === the raw symbol, so there is no suffix to strip and the raw symbol is
    // the right answer.
    const unknown = "NOT_A_MARKET";
    assert.equal(getSecurityOption(unknown).label, unknown);
    assert.equal(formatSecurityDisplaySymbol(unknown), unknown);
  });
});

// Spec §16 draws the scope picker with no visible field caption: the rail leads
// with its own eyebrow, and the merged mobile surface pins the trigger in its
// control row.
// Suppressing the caption must not cost any element its accessible name, and
// no aria-labelledby may point at an element that is not rendered.
describe("ScopeMenu labelling with the caption suppressed (source-pinned — see header comment)", () => {
  const SOURCE = readFileSync(
    "src/components/workspace/ScopeMenu.tsx",
    "utf8",
  );

  // Fix round 2 (final review, Important 3): the trigger took a bare
  // aria-label={label} whenever the caption was suppressed — and aria-label
  // REPLACES element content in the name computation, so the selected market
  // (which lives in that content) dropped out of the accessible name of the
  // stage's primary control: "Market, collapsed, button", with no way to hear
  // which market is on the stage. The caption is now always rendered and only
  // visually hidden, so the labelledby chain stays valid in both modes and
  // always announces caption + current value.
  it("names the trigger off the caption AND the value in both modes — never a bare aria-label", () => {
    const trigger = SOURCE.match(
      /<button\n?\s*ref=\{triggerRef\}[\s\S]*?\n\s*>/,
    )?.[0] ?? "";
    assert.ok(trigger.length > 0, "expected to find the trigger button");
    assert.match(
      trigger,
      /aria-labelledby=\{`\$\{baseId\}-label \$\{baseId\}-value`\}/,
    );
    assert.doesNotMatch(trigger, /aria-label=/);
    // And the value element the second half of that chain resolves to. It reads
    // the scope's own description directly now (§17m.1 retired the per-variant
    // trigger label with the stage picker) — the fact asserted here, that the
    // named value element carries the current scope, is unchanged.
    assert.match(
      SOURCE,
      /<span\s+id=\{`\$\{baseId\}-value`\}[\s\S]{0,200}\{describeScanScope\(value\)\}/,
    );
  });

  // Fix round 1: the trigger got its half right and both listboxes did not.
  // With showLabel={false} at both call sites, aria-labelledby={`${baseId}-
  // label`} on a <ul role="listbox"> pointed at an element that was not
  // rendered at all — a dangling IDREF, so the opened menu announced as an
  // unnamed listbox. Round 2 keeps every listbox named; what changed is that
  // the reference is now always resolvable (see the always-rendered caption
  // below), so the conditional pair it needed is no longer needed and both
  // lists name themselves the one way.
  it("names BOTH listboxes off the caption — no dangling IDREF, no unnamed listbox", () => {
    const listboxes = SOURCE.match(/<ul\b[\s\S]*?role="listbox"/g) ?? [];
    assert.equal(
      listboxes.length,
      2,
      "expected exactly two listboxes: the anchored popup and the mobile sheet",
    );
    for (const listbox of listboxes) {
      assert.match(listbox, /aria-labelledby=\{`\$\{baseId\}-label`\}/);
      assert.doesNotMatch(listbox, /aria-label=/);
    }
  });

  it("renders the caption span unconditionally, hiding it visually rather than removing it", () => {
    // This is what makes every reference above resolvable in both modes, so it
    // is the assertion that must fail if anyone puts the caption back behind a
    // showLabel ternary. The className is the conditional part, not the node.
    assert.match(
      SOURCE,
      /<span\n\s*id=\{`\$\{baseId\}-label`\}\n\s*className=\{showLabel\n\s*\? "[^"]+"\n\s*: "sr-only"\}/,
    );
    assert.doesNotMatch(
      SOURCE,
      /\{showLabel\s*\n?\s*\?[\s\S]{0,300}id=\{`\$\{baseId\}-label`\}/,
    );
  });

  it("keeps the sheet dialog's own title reference intact", () => {
    assert.match(SOURCE, /aria-labelledby=\{`\$\{baseId\}-sheet-title`\}/);
  });

  it("renders the trigger's own text as the scope's description", () => {
    assert.match(SOURCE, /\{describeScanScope\(value\)\}/);
  });

  // The trigger is the kit's `.field` — one shape, one 48px control — now that
  // the heading trigger is gone (§17m.1). The 44px-floor trick it needed
  // (min-height plus a matching negative block margin at text-2xl) went with
  // it, and may not return: a bare-paper heading-sized control is exactly what
  // the stage no longer has.
  it("draws the trigger as the kit field, with no bare-paper heading control", () => {
    assert.match(
      SOURCE,
      /className="field flex w-full items-center justify-between gap-2 text-left text-sm font-semibold normal-case text-ink"/,
    );
    assert.doesNotMatch(SOURCE, /font-display text-2xl/);
    assert.doesNotMatch(SOURCE, /-my-1\.5/);
  });
});

// Task 9 (Guide + Profile + mobile pass): spec §4's universal contract —
// "One dropdown, three scope kinds, identical on desktop and mobile (mobile
// renders it as a full-screen sheet)" — applies to every ScopeMenu instance,
// so the sheet/anchored-popup choice lives inside the component (a viewport
// check) rather than a prop each of today's two call sites (MarketScanPanel and
// the merged mobile control row) would otherwise have to compute and pass in
// identically. shouldUseSheetLayout is the pure decision function behind that
// internal choice — exercised directly here, since actually rendering
// <ScopeMenu> hits the esbuild/JSX limitation documented at the top of this
// file.
describe("shouldUseSheetLayout (Task 9 mobile sheet)", () => {
  it("mirrors --breakpoint-lg (src/styles/index.css) exactly, not a second hardcoded number", () => {
    assert.equal(MOBILE_SHEET_BREAKPOINT_PX, 1024);
  });

  it("is a sheet just below the breakpoint", () => {
    assert.equal(shouldUseSheetLayout(MOBILE_SHEET_BREAKPOINT_PX - 1), true);
  });

  it("is the anchored popup exactly at the breakpoint (lg's own min-width boundary)", () => {
    assert.equal(shouldUseSheetLayout(MOBILE_SHEET_BREAKPOINT_PX), false);
  });

  it("is the anchored popup comfortably above the breakpoint", () => {
    assert.equal(shouldUseSheetLayout(1280), false);
  });

  it("is a sheet at common phone widths", () => {
    assert.equal(shouldUseSheetLayout(375), true);
  });
});

// The sheet variant's own JSX can't be rendered in this harness either, so
// its structure is pinned against source text — the same technique
// tests/currentTradesRail.test.tsx and tests/historyPanel.test.tsx already
// use for markup their own limitations keep them from rendering.
describe("ScopeMenu sheet markup (source-pinned — see header comment)", () => {
  const SOURCE = readFileSync(
    "src/components/workspace/ScopeMenu.tsx",
    "utf8",
  );

  it("renders the sheet as an accessible modal dialog, full-screen", () => {
    assert.match(SOURCE, /role="dialog"/);
    assert.match(SOURCE, /aria-modal="true"/);
    assert.match(
      SOURCE,
      /className="motion-fade-in fixed inset-0 z-30 flex flex-col bg-sheet"/,
    );
  });

  it("titles the sheet with the same label prop the trigger button already uses", () => {
    // The sheet's <span id=...-sheet-title> must render {label}, not a
    // second, independently-drifting title string.
    assert.match(
      SOURCE,
      /id=\{`\$\{baseId\}-sheet-title`\}[\s\S]{0,160}>\s*\{label\}\s*<\/span>/,
    );
  });

  it("gives the sheet a real, labeled close control", () => {
    assert.match(SOURCE, /aria-label="Close"/);
  });

  // Q1-C3: the Close button never ran. The document-level mousedown listener
  // closed on any press outside rootRef (the trigger's wrapper, which lives in
  // the main tree) or listRef (the <ul>) — and the sheet's header is inside
  // neither, being a SIBLING of the <ul> inside the portal. So the press
  // unmounted the portal before mouseup, no click ever completed on the button,
  // onClick={closeAndFocusTrigger} never fired, and focus was left on <body>
  // instead of returning to the trigger (WCAG 2.4.3) — on a role="dialog"
  // aria-modal="true" surface. The same path made a tap on the sheet's own title
  // bar silently dismiss it. The fix is one more ref: the sheet's root, so
  // everything the portal draws counts as inside.
  it("counts the whole sheet — header and close control included — as inside for the outside-press listener", () => {
    // The ref is on the dialog root, above the header, not on the <ul>.
    assert.match(
      SOURCE,
      /<div\s*\n\s*ref=\{sheetRef\}\s*\n\s*aria-labelledby=\{`\$\{baseId\}-sheet-title`\}/,
    );
    assert.match(
      SOURCE,
      /!sheetRef\.current\?\.contains\(target\)/,
    );
    // The close control still owns the focus return, and now actually reaches
    // it: the press no longer unmounts the button out from under its own click.
    assert.match(
      SOURCE,
      /aria-label="Close"[\s\S]{0,160}onClick=\{closeAndFocusTrigger\}/,
    );
  });

  // The other half of Q1-C3: with the header no longer dismissing the sheet, a
  // tap on the title bar leaves focus on <body> — and Escape was a React
  // onKeyDown on the <ul>, so from <body> it reached nothing (the same defect
  // shape as Q1-C2 on the chart overlay). One document-level listener owns
  // Escape for both presentations, and the list's own switch no longer
  // duplicates it, so there is exactly one path from a press to a dismissal.
  it("hears Escape wherever focus has landed inside the portal, from one owner", () => {
    assert.match(
      SOURCE,
      /document\.addEventListener\("keydown", handleEscape\)/,
    );
    assert.match(
      SOURCE,
      /document\.removeEventListener\("keydown", handleEscape\)/,
    );
    assert.match(
      SOURCE,
      /function handleEscape\(event: KeyboardEvent\) \{\s*\n\s*if \(event\.key !== "Escape"\) \{\s*\n\s*return;\s*\n\s*\}\s*\n\s*event\.preventDefault\(\);\s*\n\s*closeAndFocusTrigger\(\);/,
    );
    const listSwitch = SOURCE.match(
      /function handleListKeyDown[\s\S]*?\n {2}\}/,
    )?.[0] ?? "";
    assert.ok(listSwitch.length > 0, "expected the list's keyboard switch");
    assert.doesNotMatch(listSwitch, /case "Escape"/);
  });

  it("shares row rendering between the sheet and the anchored popup via one function, never two copies", () => {
    const calls = SOURCE.match(/\{renderOptionRows\(\)\}/g) ?? [];
    assert.equal(calls.length, 2, "expected exactly one call per presentation");
  });

  it("keeps the anchored popup's own container classes byte-identical to before Task 9, plus §8's fade", () => {
    // Desktop (≥lg) is frozen — pin the exact string so any future edit to the
    // sheet branch can never leak into the ≥lg one. Spec §8's "menu open/close"
    // fade is the one addition since Task 9, and it is deliberately the same
    // .motion-fade-in every other popup and the tab region take
    // (tests/motion.test.ts), so a fade can never be introduced here alone.
    assert.match(
      SOURCE,
      /className="motion-fade-in scrolly fixed z-30 max-h-80 overflow-y-auto rounded-lg border border-hairline bg-sheet py-1 shadow-lg"/,
    );
  });
});
