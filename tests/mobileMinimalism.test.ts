import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../src/components/mobileFrame";

/*
  Spec §17n (owner ruling, 2026-08-02, durable): "On every <lg surface, ancillary
  chrome is sized to the smallest form that stays tappable, usable and legible —
  and no larger… The content region is the budget being protected, and chrome
  yields to it."

  This file is that ruling's guard. It pins the class strings that produce the
  measured sizes, and its comments carry the measurements themselves — taken in
  Chromium against the BUILT CSS at 375x812 with the shipped fonts (§17n:
  "measured, the way ProfilePanel's own row budget was, never asserted"), the
  real components mounted inside a replica of App.tsx's mobile shell.

  The audit's own numbers, before → after, at 375x812. The two pieces of shared
  chrome that bound every surface moved first: the mobile header 69px → 61px and
  the tab bar 57px → 49px, which took the content row from 743px to 751px.

    surface   pinned chrome        scroll region        visible content
    Scan      296.5px → 292.5px    446.5px → 458.5px    389.5px → 409.5px
    Trades     30.0px →  30.0px    713.0px → 721.0px    656.0px → 672.0px
    Insights  409.0px → 267.0px    334.0px → 484.0px    277.0px → 435.0px
    Profile    60.0px →  46.0px    683.0px → 705.0px    626.0px → 656.0px
    Guide      64.0px →  46.0px    679.0px → 705.0px    622.0px → 656.0px
    Donate     60.0px →  46.0px    683.0px → 705.0px    626.0px → 656.0px

  ("visible content" is the scroll region minus the fixed tab bar that overlays
  its bottom — the pixels a reader can actually see at rest.)

  At 320px nothing overflows and no surface hands the document a scrollbar: the
  two longest stat labels wrap to a second line and the Status/Period pair falls
  back to its own row, so Insights' chrome is 335px there. At 768px, still the
  mobile composition, it is 215px.

  Every assertion below is paired with the test that holds the element at its
  size: TAPPABLE (the 44px floor), USABLE (a control or region has to work), or
  LEGIBLE (text has to read). An element with no text has no legibility floor,
  and an element that clears all three smaller is at the wrong size — which is
  what this wave fixed.
*/

const APP_SOURCE = readFileSync("src/App.tsx", "utf8");
const HISTORY_SOURCE = readFileSync(
  "src/components/workspace/HistoryPanel.tsx",
  "utf8",
);
const PROFILE_SOURCE = readFileSync(
  "src/components/workspace/ProfilePanel.tsx",
  "utf8",
);
const GUIDE_SOURCE = readFileSync(
  "src/components/workspace/GuidePanel.tsx",
  "utf8",
);
const DONATE_SOURCE = readFileSync(
  "src/components/donations/DonatePanel.tsx",
  "utf8",
);
const SCOPE_MENU_SOURCE = readFileSync(
  "src/components/workspace/ScopeMenu.tsx",
  "utf8",
);
const MARKET_CHART_SOURCE = readFileSync(
  "src/components/charts/MarketChart.tsx",
  "utf8",
);
const OVERLAY_SOURCE = readFileSync(
  "src/components/charts/ExpandedChartOverlay.tsx",
  "utf8",
);
const ADVISOR_SOURCE = readFileSync(
  "src/components/workspace/AdvisorWorkspace.tsx",
  "utf8",
);
const TRADES_SOURCE = readFileSync(
  "src/components/workspace/CurrentTradesRail.tsx",
  "utf8",
);

// The mobile page head, one string on the four surfaces that draw a title
// (Insights' own h1 sits inside the record band, which carries the rule for it).
// 19px is not a new number: it is the mobile page head m-trades-v1.html already
// draws and CurrentTradesRail already ships (`max-lg:text-[19px]`), so the four
// titles now read as one treatment instead of three sizes.
const MOBILE_HEAD_TYPE = /max-lg:text-\[19px\] max-lg:leading-6/;

describe("§17n shared mobile chrome — the header", () => {
  // MEASURED: 69px, of which 44px is the avatar trigger — the kit's tap floor,
  // which sets the row's height and cannot yield — so the block padding around it
  // was the only slack there was. 8px below lg is still a real gutter above and
  // below a 44px control (USABLE), and it hands every surface's content row 8px,
  // since the header and that row split one fixed viewport. The wordmark's 18px
  // and the compact broker chip's 12px are LEGIBLE floors and do not move.
  it("pads the mobile header row at 8px below lg, the mock's 12px above it", () => {
    assert.match(
      APP_SOURCE,
      /<div className="mx-auto max-w-7xl px-4 py-3 max-lg:py-2 sm:px-8">/,
    );
    assert.match(
      APP_SOURCE,
      /className="wordmark min-w-0 truncate text-lg text-ink"/,
    );
  });
});

describe("§17n shared mobile chrome — the tab bar and its clearance", () => {
  // MEASURED: the bar's own content is 38px — a 20px icon, the 2px gap-0.5, and
  // the 10.5px label's 15.75px line box. min-h-14 (56px) held 18px of nothing
  // above that; min-h-12 (48px) clears the 44px TAPPABLE floor by 4px and hands
  // every surface 8px of visible content back. The mock's own tab is smaller
  // still (m-scan-v3.html:48 — text only, 12px/14px padding, ~39px), so this is
  // the app walking toward the mock rather than away from it, and the icons stay
  // because they carry no text and have no legibility floor to trip.
  it("sizes the tab bar at 48px — the 44px floor plus the icon's own 4px", () => {
    assert.match(
      APP_SOURCE,
      /className=\{`flex min-h-12 flex-col items-center justify-center gap-0\.5 text-\[10\.5px\] font-bold uppercase tracking-\[0\.1em\] \$\{/,
    );
    assert.doesNotMatch(APP_SOURCE, /min-h-14/);
  });

  // The 10.5px label is the mock's own type (m-scan-v3.html:48) and the smallest
  // text the app ships. LEGIBLE holds it there — it does not shrink further.
  it("keeps the mock's 10.5px tab type — the LEGIBLE floor, not a candidate", () => {
    assert.match(APP_SOURCE, /text-\[10\.5px\] font-bold uppercase/);
  });

  // MEASURED: the fixed bar occupies 48px + its 1px top border + the device's
  // own safe-area inset (`pb-[env(safe-area-inset-bottom)]` on the nav). pb-24
  // was a flat 96px against a then-57px bar: 39px of dead scroll on every
  // surface in a browser with no inset, and it went the other way on a phone
  // WITH one (~34px), where it left 5px. The reserve is now the bar's real
  // composition — 49px of bar plus a 7px gap, plus whatever inset the device
  // reports — so it is honest at both ends instead of wrong at both.
  it("reserves exactly the bar's own height plus the safe-area inset", () => {
    assert.equal(
      MOBILE_FRAME_SCROLL,
      "scrolly min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(3.5rem_+_env(safe-area-inset-bottom))]",
    );
    assert.doesNotMatch(MOBILE_FRAME_SCROLL, /\bpb-24\b/);
  });

  // The two numbers live in two files — the bar's box in App.tsx, the reserve in
  // mobileFrame.ts — so nothing but this test couples them. Both are parsed from
  // source and compared, which is the difference between "the reserve happens to be
  // 56px" and "the reserve clears the bar": grow the bar to min-h-14 again without
  // touching the reserve and the 7px gap becomes -1px, silently, on all six
  // surfaces. Tailwind's spacing scale is 0.25rem per step, so min-h-N is N*4px,
  // and the bar adds its own 1px border-t.
  it("keeps the reserve at or above the bar's real height — parsed from both sources", () => {
    const barStep = Number(
      APP_SOURCE.match(/flex min-h-(\d+) flex-col items-center justify-center/)
        ?.[1],
    );
    assert.ok(
      Number.isInteger(barStep),
      "expected to read the tab bar's min-h step from App.tsx",
    );
    const barHeightPx = barStep * 4 + 1;
    const reserveRem = Number(
      MOBILE_FRAME_SCROLL.match(/pb-\[calc\(([\d.]+)rem_\+_env\(/)?.[1],
    );
    assert.ok(
      Number.isFinite(reserveRem),
      "expected to read the reserve's rem term from MOBILE_FRAME_SCROLL",
    );
    const reservePx = reserveRem * 16;
    assert.ok(
      reservePx >= barHeightPx,
      `reserve ${reservePx}px must clear the bar's ${barHeightPx}px`,
    );
    // And the inset term itself: the bar pads by env(safe-area-inset-bottom), so a
    // reserve without the same term clears the bar only on a device that reports 0.
    assert.match(
      MOBILE_FRAME_SCROLL,
      /env\(safe-area-inset-bottom\)/,
      "the reserve tracks the same inset the bar pads by",
    );
    assert.match(
      APP_SOURCE,
      /pb-\[env\(safe-area-inset-bottom\)\] backdrop-blur lg:hidden/,
    );
  });

  // §17g's own gutters, untouched by this wave: the pinned row's 16px sides and
  // 12px top are m-scan-v3.html:29's geometry, and USABLE holds them — the
  // surface's content would touch the bezel without them.
  it("leaves the frame's own 12/16px gutters alone (§17g mock geometry)", () => {
    assert.equal(MOBILE_FRAME_PINNED, "shrink-0 px-4 pt-3");
  });
});

describe("§17n shared mobile chrome — the avatar menu holds at the floor", () => {
  // MEASURED: a menu row's natural content is 20px (14px label, 20px line box)
  // and a legal link's is 16px. Both render at 44px, and both stay there:
  // TAPPABLE is the binding test on a menu of five actions plus three links, and
  // §17n grants no exception to a primary control. The audit's finding here is
  // "already at the floor", which is a finding, not a no-op.
  it("keeps every menu row and legal link at the 44px tap floor", () => {
    assert.match(
      APP_SOURCE,
      /className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-ink transition hover:bg-accent\/10"/,
    );
    assert.match(
      APP_SOURCE,
      /className="flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-ink transition hover:bg-accent\/10"/,
    );
    assert.match(
      APP_SOURCE,
      /className="inline-flex min-h-11 items-center transition hover:text-ink"/,
    );
  });

  // MEASURED: the legal trio measures 190px inside the menu's 200px content box
  // — one line, three 44px targets. w-56 is what keeps it one line; a narrower
  // menu wraps it, and a wrapped row of 44px targets overlaps the row above it.
  // USABLE holds the width.
  it("keeps the menu wide enough that the legal trio stays one line", () => {
    assert.match(APP_SOURCE, /absolute right-0 top-full z-30 mt-2 w-56/);
  });

  // The avatar trigger is 44px exactly — the floor, TAPPABLE.
  it("keeps the avatar trigger at 44px", () => {
    assert.match(
      APP_SOURCE,
      /className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-accent\/10"/,
    );
  });
});

describe("§17n Insights — the slimming the ruling pre-approved", () => {
  // MEASURED, before: 409px of pinned chrome against 334px of ledger. The record
  // band was 192px (a 32px h1 line, a 16px gap, four 48px stat blocks in two
  // rows at a 32px row gap, 14px of pad under the rule) and the filter row was
  // 185px (three 48px select rows at a 12px gap, 16px of pad). After: 267px —
  // 138px of band, a 12px gap, 105px of filters, on the frame's own 12px top.
  it("compacts the record band's rule, gaps and head", () => {
    assert.match(
      HISTORY_SOURCE,
      /className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-3\.5 max-lg:gap-x-3 max-lg:gap-y-2 max-lg:pb-2"/,
    );
    // The h1 takes the mobile page head's 19px/24px. LEGIBLE at 19px is the
    // same call the owner already approved for m-trades-v1's head.
    assert.match(
      HISTORY_SOURCE,
      new RegExp(
        `<h1 className="text-2xl font-semibold tracking-normal text-ink ${MOBILE_HEAD_TYPE.source}">`,
      ),
    );
  });

  // MEASURED: the four stat blocks wrapped into two ragged rows of 48px at a
  // 32px row gap (128px). A grid at an 8px row gap with 18px values is 96px for
  // two rows and reads as a deliberate block instead of a wrap. The 12px
  // .eyebrow label underneath does NOT shrink — it is the kit's smallest label
  // and LEGIBLE holds it.
  //
  // THREE COLUMNS SINCE THE FIFTH STAT. "Given back" (amendment 39) made a
  // 2-column grid three rows, and the live §17n budget test measured Insights
  // pinned chrome at 319px against a 290 ceiling — chrome taken from the
  // content region it is required to yield to. Five blocks in three columns is
  // two rows again.
  //
  // THIS GUARD COULD NOT SEE THAT. It matches the className string and says
  // "the four stats" in its own name, and a fifth block changed neither. The
  // count is asserted below now, so the next block added has to come here and
  // re-argue the budget rather than discovering it in a deploy.
  it("lays the five stats out as a two-row grid with an 18px value below lg", () => {
    assert.match(
      HISTORY_SOURCE,
      /className="flex flex-wrap gap-8 max-lg:grid max-lg:w-full max-lg:grid-cols-3 max-lg:gap-x-3 max-lg:gap-y-2"/,
    );
    // DERIVED, not restated: the block count and the column count together are
    // what decide the row count, and the row count is what the budget buys.
    const blocks = (HISTORY_SOURCE.match(/<StatBlock\b/g) ?? []).length;
    assert.ok(blocks > 0, "no StatBlocks found — the detector broke");
    const columns = Number(
      (HISTORY_SOURCE.match(/max-lg:grid-cols-(\d)/) ?? [])[1],
    );
    assert.ok(columns > 0, "the mobile column count is unreadable");
    assert.ok(
      Math.ceil(blocks / columns) <= 2,
      `${blocks} stat blocks in ${columns} mobile columns is ` +
        `${Math.ceil(blocks / columns)} rows. Insights pinned chrome has a ` +
        `290px ceiling (§17n) and a third row put it at 319. Either fit the ` +
        `blocks into two rows or take the budget question to the ruling.`,
    );
    assert.match(
      HISTORY_SOURCE,
      /className="font-mono text-2xl font-semibold tabular-nums text-ink max-lg:text-lg"/,
    );
    assert.match(HISTORY_SOURCE, /<p className="eyebrow">/);

    // A THIRD OF 375px IS ~101px, and an 18px monospace value wraps past about
    // nine characters. A wrap costs the same row the column count just bought,
    // so the compact form is load-bearing rather than cosmetic — and nothing
    // pinned it until a mutation removed it and every test stayed green.
    assert.match(
      HISTORY_SOURCE,
      /<span className="lg:hidden">\{compactValue \?\? value\}<\/span>/,
      "the phone-width value no longer falls back to the compact form, so a " +
        "long value wraps and takes back the row the third column bought",
    );
    assert.match(
      HISTORY_SOURCE,
      /<span className="max-lg:hidden">\{value\}<\/span>/,
      "the full value is no longer shown above lg",
    );
    // The one value long enough to need it must actually supply one.
    const givenBack = HISTORY_SOURCE.slice(
      HISTORY_SOURCE.indexOf('label="Given back"') - 400,
      HISTORY_SOURCE.indexOf('label="Given back"') + 200,
    );
    assert.match(
      givenBack,
      /compactValue=\{/,
      "Given back renders `N.NR over M`, which does not fit a third of 375px",
    );
  });

  // MEASURED: three 48px rows → two 44px rows. The selects keep a real 44px tap
  // target (TAPPABLE: `.field`'s 48px is above the floor, not at it), and the
  // compaction is padding and type — px-2 and 13px — which is what buys the
  // second row: Status and Period pairs measure 137px and 170px at 12px labels,
  // 319px of the 343px available, so they share one row instead of stacking.
  it("compacts the filter row to two 44px rows, target intact", () => {
    assert.match(
      HISTORY_SOURCE,
      /className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline pb-4 max-lg:gap-x-3 max-lg:gap-y-2 max-lg:pb-2"/,
    );
    assert.equal(
      (HISTORY_SOURCE.match(
        /className="field max-lg:min-h-11 max-lg:px-2 max-lg:text-\[13px\]"/g,
      ) ?? []).length,
      3,
      "all three filters take the same compact field",
    );
    assert.equal(
      (HISTORY_SOURCE.match(
        /className="flex items-center gap-2 text-sm font-semibold text-ink max-lg:gap-1\.5 max-lg:text-xs"/g,
      ) ?? []).length,
      3,
      "all three filter labels take the same compact type",
    );
    // The labels themselves survive: §17f keeps them (a bare "All" beside a
    // market filter reading "All markets" is ambiguous), so §17n shrinks them
    // rather than the copy law deleting them.
    for (const label of ["Market", "Status", "Period"]) {
      assert.match(HISTORY_SOURCE, new RegExp(`>\\s*${label}\\s*<select`, "m"));
    }
  });

  // The gap between the two pinned blocks is chrome too (§17n: "every label and
  // gap between them"). 20px → 12px below lg; the ≥lg page keeps its own 20px
  // rhythm, which is the mock's.
  it("tightens the gap between the band and the filters below lg", () => {
    assert.match(HISTORY_SOURCE, /<div className="grid gap-3">/);
    assert.match(
      HISTORY_SOURCE,
      /className="mx-auto grid w-full max-w-\[1180px\] gap-5"/,
    );
  });

  // Hierarchy, both platforms: 24px h1 over a 20px h2 at ≥lg, 19px over 16px
  // below it. Shrinking the head without the section head would have inverted
  // the two on a phone, which is the one thing a heading scale cannot do.
  it("keeps Attribution's section head one step under the surface head", () => {
    assert.match(
      HISTORY_SOURCE,
      /<h2 className="text-xl font-semibold tracking-normal text-ink max-lg:text-base">/,
    );
  });
});

describe("§17n the four mobile page heads read as one treatment", () => {
  it("gives Guide, Profile and Donate the same 19px head and 8px rule pad", () => {
    for (const [name, source] of [
      ["Guide", GUIDE_SOURCE],
      ["Profile", PROFILE_SOURCE],
      ["Donate", DONATE_SOURCE],
    ] as const) {
      assert.match(
        source,
        new RegExp(
          `<h1 className="border-b-2 border-ink pb-3\\.5 text-(2xl|3xl) font-semibold tracking-normal text-ink max-lg:pb-2 ${MOBILE_HEAD_TYPE.source}">`,
        ),
        `${name} keeps the shared mobile head`,
      );
    }
  });

  // Trades already shipped this head (m-trades-v1.html:11-12,40) and is the
  // reason the other four take 19px rather than a number invented here.
  it("leaves the head Trades already had alone", () => {
    assert.match(
      TRADES_SOURCE,
      /max-lg:font-display max-lg:text-\[19px\] max-lg:font-bold max-lg:normal-case max-lg:tracking-\[-0\.02em\] max-lg:text-ink/,
    );
  });
});

describe("§17n Profile — the rows' own padding yields, the controls do not", () => {
  // MEASURED: three rows of 26px block padding = 156px of pad in a 683px region,
  // and the sheet overflowed its frame (763px of content) once the broker
  // program controls render. py-4 below lg takes 60px of that back and the
  // surface fits the frame again, which is the state §17g describes first.
  it("compacts the row padding below lg and keeps the mock's 26px above it", () => {
    assert.match(
      PROFILE_SOURCE,
      /className="grid gap-x-6 gap-y-3 border-b border-hairline py-\[26px\] last-of-type:border-b-0 max-lg:py-4 lg:grid-cols-\[220px_1fr\]"/,
    );
  });

  // The program selects are NOT chrome: they are what Profile exists to deliver,
  // so §17n's ancillary definition does not reach them and they keep `.field`'s
  // 48px. Stated as a finding rather than left silent.
  it("leaves the broker program selects at the kit's own 48px field", () => {
    assert.doesNotMatch(PROFILE_SOURCE, /field max-lg:min-h-11/);
  });

  // MEASURED: `.colophon`'s 2rem top pad is 32px of the 59.5px line. 20px below
  // lg keeps the line separated from the last row and keeps the 44px reach the
  // ::after overlay gives it (§17k, untouched) — TAPPABLE and LEGIBLE both hold,
  // the 12px of pad above it clears neither.
  it("tightens the colophon's own top pad below lg, reach unchanged", () => {
    assert.match(PROFILE_SOURCE, /<p className="colophon max-lg:pt-5">/);
    assert.match(PROFILE_SOURCE, /className="colophon-link"/);
    assert.match(PROFILE_SOURCE, /href="https:\/\/windwardline\.com"/);
  });
});

describe("§17n Scan — the control row evens out, the chart holds", () => {
  // MEASURED: the row was 48px because the scope trigger is a `.field` and its
  // two neighbours are 44px. At 44px all three controls match, TAPPABLE holds
  // the row at the floor, and the pinned block drops 4px.
  it("brings the scope trigger to the 44px floor below lg", () => {
    assert.match(
      SCOPE_MENU_SOURCE,
      /className="field flex w-full items-center justify-between gap-2 text-left text-sm font-semibold normal-case text-ink max-lg:min-h-11"/,
    );
  });

  // MEASURED: 168px of chart inside a 296.5px pinned block. It is mock geometry
  // (m-scan-v3.html:28) and it is the one element where shrinking trades against
  // the legibility of the thing the surface exists to show: LEGIBLE holds it,
  // and Expand chart is the release valve §17 gave it. Unchanged by this wave —
  // pinned so a later wave cannot quietly call it ancillary.
  it("holds the compact chart at the mock's 168px", () => {
    assert.match(MARKET_CHART_SOURCE, /max-lg:h-\[168px\]/);
  });

  // The market head (19px display) and the 11px mono stamp under it are the
  // surface's content and its one un-showable fact. LEGIBLE holds both.
  it("holds the market head and its 11px stamp", () => {
    assert.match(
      ADVISOR_SOURCE,
      /className="min-w-0 truncate font-display text-\[19px\] font-bold tracking-\[-0\.02em\] text-ink"/,
    );
    assert.match(
      ADVISOR_SOURCE,
      /className="mt-1 font-mono text-\[11px\] leading-4 text-ink-muted"/,
    );
  });
});

describe("§17n Trades — measured lean, left alone", () => {
  // MEASURED: 30px of pinned chrome (an 18px baseline row inside the frame's
  // 12px top pad) against 713px of scrolling cards — the leanest surface in the
  // app. Every test holds it where it is, so the audit changes nothing here and
  // pins the head so the finding is recorded rather than remembered.
  it("keeps the 30px pinned head exactly as it shipped", () => {
    assert.match(
      TRADES_SOURCE,
      /className="flex flex-wrap items-baseline justify-between gap-2 lg:min-h-11 lg:items-center"/,
    );
    assert.match(TRADES_SOURCE, /className="text-xs text-ink-muted"/);
  });
});

describe("§17n the chart overlay, and the ONE recorded 28px exception", () => {
  /*
    The exception discipline, verbatim (§17n): "Exactly one owner-approved
    exception is on record: the expanded chart overlay's button cluster at 28px
    with its icons held at 16px for legibility (PR #149 — 'small as stays
    tappable'). Exceptions are granted per element by the owner, recorded here,
    and pinned by a guard with the grant named — an unpinned exception is
    indistinguishable from a regression six months later."

    This is that pin. MEASURED: six 28px buttons, 194px of cluster across a
    375px overlay, 16px icons inside them.
  */
  it("pins the granted 28px cluster, its 16px icons, and the grant by name", () => {
    assert.match(
      MARKET_CHART_SOURCE,
      /\? "inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition hover:bg-accent\/10 hover:text-accent"/,
    );
    // 16px icons — the legibility half of the same grant.
    assert.equal(
      (MARKET_CHART_SOURCE.match(/fill \? "h-4 w-4" : "h-3\.5 w-3\.5"/g) ?? [])
        .length,
      6,
      "all six tool icons take the granted 16px in the overlay",
    );
    // The grant is named in the source, so nobody reads 28px as a precedent.
    const grant = MARKET_CHART_SOURCE.match(
      /\/\*[^*]*§17n[\s\S]*?\*\/\s*function ChartToolButton/,
    )?.[0] ?? "";
    assert.ok(grant.length > 0, "the granted size carries a §17n comment");
    assert.match(grant, /PR #149/, "the grant names the PR that granted it");
    assert.match(grant, /owner/, "the grant names its source");
    assert.match(
      grant,
      /28px/,
      "the grant names the size it is an exception to",
    );
  });

  // Nothing else in the app is allowed to reach for the same literal: one
  // element, one grant, never inferred from another element's exception.
  it("keeps the 28px literal unique to that one cluster", () => {
    const sources = [
      APP_SOURCE,
      ADVISOR_SOURCE,
      HISTORY_SOURCE,
      PROFILE_SOURCE,
      GUIDE_SOURCE,
      DONATE_SOURCE,
      TRADES_SOURCE,
      SCOPE_MENU_SOURCE,
      OVERLAY_SOURCE,
    ];
    for (const source of sources) {
      assert.doesNotMatch(source, /h-7 w-7/);
    }
    assert.equal(
      (MARKET_CHART_SOURCE.match(/h-7 w-7/g) ?? []).length,
      1,
      "exactly one element carries the granted size",
    );
  });

  // MEASURED: the dialog's head was 61px (8px pad either side of a 44px close)
  // and its chart body carried 12px of pad. The close stays 44px — TAPPABLE, and
  // §17n grants no exception to a primary control — so the padding is what
  // yields: 53px of head and 8px of pad below lg, 20px of chart back.
  it("compacts the overlay's own chrome below lg, close target intact", () => {
    assert.match(
      OVERLAY_SOURCE,
      /className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2 max-lg:py-1"/,
    );
    assert.match(
      OVERLAY_SOURCE,
      /className="min-h-0 flex-1 p-3 max-lg:p-2"/,
    );
    assert.match(
      OVERLAY_SOURCE,
      /className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition hover:text-accent"/,
    );
  });
});
