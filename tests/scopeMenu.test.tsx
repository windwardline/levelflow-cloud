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
  effectiveRows,
  formatScopeCountLine,
  formatScopeMenuAffordance,
  MOBILE_SHEET_BREAKPOINT_PX,
  moveScopeMenuHighlight,
  resolveRowActivation,
  scopeTriggerLabel,
  shouldUseSheetLayout,
  showsAffordance,
  type ScanScope,
  type ScopeMenuRow,
} from "../src/components/workspace/ScopeMenu";

// This suite tests ScopeMenu.tsx entirely through its exported pure
// functions (row model, keyboard-highlight reducer, formatters), the same
// approach tests/confidenceUnit.test.tsx uses for ConfidenceUnit.tsx.
// Actually rendering <ScopeMenu> is deliberately not attempted here: the
// component has real JSX in its own body, and this repo's node:test runner
// has no tsconfig covering tests/ (see tests/workspaceNav.test.tsx), so it
// falls back to esbuild's classic JSX transform for every file it
// transitively compiles - including ScopeMenu.tsx itself - which would
// require `import React` there purely to satisfy the test run. Under this
// project's actual build (tsconfig.app.json's automatic JSX runtime),
// that import is dead code and fails `tsc --noEmit` (noUnusedLocals). The
// pure functions below are exactly what the real component's click/keydown
// handlers call, so they pin the same behavior without that conflict.

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
    assert.equal(showsAffordance(allRow, false), false);
    assert.equal(showsAffordance(allRow, true), false);
  });

  it("shows 'Scan N' on an open group, nothing on an open market, in the full menu", () => {
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    const groupRow = rows.find((row) => row.key === "group:Forex");
    const marketRow = rows.find((row) => row.key === "symbol:EURUSD");
    assert.ok(groupRow);
    assert.ok(marketRow);
    assert.equal(showsAffordance(groupRow, false), true);
    assert.equal(showsAffordance(marketRow, false), false);
  });

  it("shows nothing on an open group in symbolOnly mode (no scan action from the stage picker), but still shows a closed group's reopen label", () => {
    const rows = buildScopeMenuRows(SATURDAY_NOON_ET);
    const openGroup = rows.find((row) => row.key === "group:Crypto");
    const closedGroup = rows.find((row) => row.key === "group:Forex");
    assert.ok(openGroup);
    assert.ok(closedGroup);
    assert.equal(showsAffordance(openGroup, true), false);
    assert.equal(showsAffordance(closedGroup, true), true);
  });
});

describe("effectiveRows (symbolOnly mode: the stage's direct-review picker)", () => {
  it("is an identity pass-through when symbolOnly is false", () => {
    const rows = buildScopeMenuRows(WEDNESDAY_2PM_ET);
    assert.deepEqual(effectiveRows(rows, false), rows);
  });

  it("drops 'All markets' entirely", () => {
    const rows = effectiveRows(buildScopeMenuRows(WEDNESDAY_2PM_ET), true);
    assert.equal(rows.some((row) => row.scope.kind === "all"), false);
    assert.equal(rows.some((row) => row.key === "all"), false);
  });

  it("keeps every group row present but neuters it - non-interactive even when its group is open, so keyboard Enter on a group fires nothing", () => {
    const rows = effectiveRows(buildScopeMenuRows(WEDNESDAY_2PM_ET), true);
    const groupRows = rows.filter((row) => row.scope.kind === "group");

    assert.equal(groupRows.length, AVAILABLE_ASSET_GROUPS.length);
    for (const row of groupRows) {
      assert.equal(row.interactive, false, row.key);
      assert.equal(resolveRowActivation(row), null, row.key);
    }
  });

  it("leaves every open market row activating with kind \"symbol\", unaffected by symbolOnly", () => {
    const rows = effectiveRows(buildScopeMenuRows(WEDNESDAY_2PM_ET), true);
    const cryptoOptions = AVAILABLE_ASSET_GROUPS.find((group) =>
      group.label === "Crypto"
    )?.options ?? [];
    assert.ok(cryptoOptions.length > 0);

    for (const option of cryptoOptions) {
      const row = rows.find((candidate) => candidate.key === `symbol:${option.symbol}`);
      assert.ok(row, option.symbol);
      assert.equal(row.interactive, true, option.symbol);
      assert.deepEqual(resolveRowActivation(row), {
        kind: "symbol",
        symbol: option.symbol,
      });
    }
  });

  it("keeps a closed group's market rows selectable - reviewing a market never requires it to be open (I4)", () => {
    // Scanning a closed market makes no sense (I5), but reviewing one does:
    // the stage's picker is symbolOnly, and without this a weekend would
    // leave every non-crypto market permanently unreachable from it.
    const rows = effectiveRows(buildScopeMenuRows(SATURDAY_NOON_ET), true);
    const forexMarket = rows.find((row) => row.key === "symbol:EURUSD");
    assert.ok(forexMarket);
    assert.equal(forexMarket.interactive, true);
    assert.deepEqual(resolveRowActivation(forexMarket), {
      kind: "symbol",
      symbol: "EURUSD",
    });
  });

  it("keyboard traversal on a fully-open menu skips 'All markets' and every group row, landing directly on the first market", () => {
    const rows = effectiveRows(buildScopeMenuRows(WEDNESDAY_2PM_ET), true);
    const firstGroup = AVAILABLE_ASSET_GROUPS[0];
    assert.ok(firstGroup);
    const firstMarket = firstGroup.options[0];
    assert.ok(firstMarket);

    assert.equal(
      moveScopeMenuHighlight(rows, null, 1),
      `symbol:${firstMarket.symbol}`,
    );
  });

  it("keyboard traversal only ever lands on market rows, and wraps between the first and last of them", () => {
    const rows = effectiveRows(buildScopeMenuRows(WEDNESDAY_2PM_ET), true);
    const interactiveKeys = rows.filter((row) => row.interactive).map((row) => row.key);

    assert.ok(interactiveKeys.length > 0);
    assert.ok(interactiveKeys.every((key) => key.startsWith("symbol:")));

    const firstKey = interactiveKeys[0] ?? null;
    const lastKey = interactiveKeys[interactiveKeys.length - 1] ?? null;
    assert.equal(moveScopeMenuHighlight(rows, lastKey, 1), firstKey);
    assert.equal(moveScopeMenuHighlight(rows, firstKey, -1), lastKey);
  });

  it("on a mostly-closed menu, traversal still reaches every market - closed markets stay selectable for review (I4), only group rows stay neutered", () => {
    const rows = effectiveRows(buildScopeMenuRows(SATURDAY_NOON_ET), true);
    const allMarketKeys = AVAILABLE_ASSET_GROUPS.flatMap((group) =>
      group.options.map((option) => `symbol:${option.symbol}`)
    );

    const interactiveKeys = rows.filter((row) => row.interactive).map((row) => row.key);
    assert.deepEqual(interactiveKeys, allMarketKeys);
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

// Spec §16: the recomposed stagehead renders the market picker as the Desk's
// display heading (a-desk-v3.html:165), where the full descriptive label runs
// far past the stage at that size. Only that variant shortens; every list,
// menu and scan row keeps the full label, which is what the e2e row-order
// specs and formatScopeCountLine above are pinned to.
describe("formatSecurityDisplaySymbol (stagehead heading form)", () => {
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

describe("scopeTriggerLabel", () => {
  it("shortens a symbol scope only for the heading variant", () => {
    const scope: ScanScope = { kind: "symbol", symbol: "EURUSD" };
    assert.equal(scopeTriggerLabel(scope, "heading"), "EUR/USD");
    assert.equal(scopeTriggerLabel(scope, "field"), formatSecurityLabel("EURUSD"));
  });

  it("leaves the non-symbol scopes identical in both variants", () => {
    for (
      const scope of [
        { kind: "all" },
        { assetType: "Forex", kind: "group" },
      ] as ScanScope[]
    ) {
      assert.equal(
        scopeTriggerLabel(scope, "heading"),
        describeScanScope(scope),
      );
      assert.equal(scopeTriggerLabel(scope, "field"), describeScanScope(scope));
    }
  });
});

// Spec §16 draws neither picker with a visible field caption: the stage's
// market name IS the heading, and the rail leads with its own "Scan" eyebrow.
// The trigger must then name itself, or the control loses its accessible name
// entirely — and aria-labelledby must not survive alongside aria-label, since
// it would win and point at an element that is no longer rendered.
describe("ScopeMenu trigger labelling (source-pinned — see header comment)", () => {
  const SOURCE = readFileSync(
    "src/components/workspace/ScopeMenu.tsx",
    "utf8",
  );

  it("names the trigger with aria-label exactly when the visible caption is suppressed", () => {
    assert.match(SOURCE, /aria-label=\{showLabel \? undefined : label\}/);
    assert.match(
      SOURCE,
      /aria-labelledby=\{showLabel \? `\$\{baseId\}-label \$\{baseId\}-value` : undefined\}/,
    );
  });

  it("renders the caption span only when showLabel is set", () => {
    assert.match(
      SOURCE,
      /\{showLabel\s*\n?\s*\?[\s\S]{0,300}id=\{`\$\{baseId\}-label`\}/,
    );
  });

  it("renders the trigger's own text through scopeTriggerLabel, never describeScanScope directly", () => {
    assert.match(SOURCE, /\{scopeTriggerLabel\(value, variant\)\}/);
  });
});

// Task 9 (Guide + Profile + mobile pass): spec §4's universal contract —
// "One dropdown, three scope kinds, identical on desktop and mobile (mobile
// renders it as a full-screen sheet)" — applies to every ScopeMenu instance,
// so the sheet/anchored-popup choice lives inside the component (a viewport
// check) rather than a prop each of today's two call sites (MarketScanPanel,
// AdvisorWorkspace's stage picker) would otherwise have to compute and pass
// in identically. shouldUseSheetLayout is the pure decision function behind
// that internal choice — exercised directly here the same way
// effectiveRows/symbolOnly is above, since actually rendering <ScopeMenu>
// hits the same esbuild/JSX limitation documented at the top of this file.
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
    assert.match(SOURCE, /className="fixed inset-0 z-30 flex flex-col bg-sheet"/);
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

  it("shares row rendering between the sheet and the anchored popup via one function, never two copies", () => {
    const calls = SOURCE.match(/\{renderOptionRows\(\)\}/g) ?? [];
    assert.equal(calls.length, 2, "expected exactly one call per presentation");
  });

  it("keeps the anchored popup's own container classes byte-identical to before Task 9", () => {
    // Desktop (≥lg) is frozen — pin the exact pre-Task-9 string so any
    // future edit to the sheet branch can never leak into the ≥lg one.
    assert.match(
      SOURCE,
      /className="scrolly fixed z-30 max-h-80 overflow-y-auto rounded-lg border border-hairline bg-sheet py-1 shadow-lg"/,
    );
  });
});
