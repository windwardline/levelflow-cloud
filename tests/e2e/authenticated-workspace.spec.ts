import {
  expect,
  type Locator,
  type Page,
  type Response,
  test,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { filterSymbolsByAvailability } from "../../src/components/workspace/marketScanFilters";
import { SIZE_STATE_WORDS } from "../../src/lib/broker/types";
import { marketAvailability } from "../../src/lib/marketHours";
import { chunkScanSymbols } from "../../src/lib/scanBatching";
import { LEDGER_WINDOW_ROWS } from "../../src/lib/tradeAnalyzer";
import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_SYMBOLS,
  formatSecurityDisplaySymbol,
} from "../../src/lib/symbolMap";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const testEmail = process.env.LEVELFLOW_E2E_EMAIL;
const testPassword = process.env.LEVELFLOW_E2E_PASSWORD;

test.skip(
  !supabaseUrl || !supabaseKey || !testEmail || !testPassword,
  "Set Levelflow E2E Supabase and dedicated test-user credentials to run authenticated browser tests.",
);

// The I9 cleanup — deleting this suite's setups so CI traffic never trains
// the production learning cohort — lives in tests/e2e/cleanup.teardown.ts, a
// Playwright teardown project paired to "workspace" in playwright.config.ts.
// It ran here as a test.afterAll once; that shape let a cleanup throw cancel
// the dependent visual-proof and analyzer-abuse projects, and emptied the
// Desk before visual-proof captured it.

function e2eClient() {
  return createClient(supabaseUrl!, supabaseKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

test.beforeEach(async ({ page }) => {
  const client = e2eClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: testEmail!,
    password: testPassword!,
  });

  if (error || !data.session) {
    throw new Error(
      `Unable to authenticate Levelflow E2E user: ${
        error?.message ?? "No session returned"
      }`,
    );
  }

  const projectRef = new URL(supabaseUrl!).hostname.split(".")[0];
  await page.addInitScript(
    ({ session, storageKey }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
      window.sessionStorage.setItem("levelflow-active-browser-session", "true");
    },
    {
      session: data.session,
      storageKey: `sb-${projectRef}-auth-token`,
    },
  );
});

// Q4-M9: isVisible() reads the DOM once and never retries, unlike every
// other assertion in this file. The count line and the qualifying rows land
// in the same React commit today, so reading isVisible() immediately after
// the `.or()` wait above resolves is safe — but it is one render-timing
// change away from a false negative reading as "nothing qualified" instead
// of the render simply not having landed yet, which is exactly the kind of
// silent skip this suite exists to stop producing. A short poll makes the
// read robust to that without changing what a genuine non-match reports.
async function isVisibleWithin(
  locator: Locator,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// Spec §17m.1: "All trades originate from the Scan column — no other path."
// The stage's Review button is deleted, so every spec that needs a setup on the
// stage now gets one the way a reader does: scan, then take the strongest
// qualifying market. Returns false when the scan could not complete or nothing
// qualified — both legitimate live-market states, so callers skip honestly,
// exactly as they did when a Review of one market could come back empty.
//
// The surface it scans on is width-dependent, and the helper reads the width
// rather than assuming one. AdvisorWorkspace renders ONE of two compositions
// (useMobileViewport's own comment: never both, CSS-hidden): at ≥lg the Desk's
// left rail, `market-scan-rail`, carries the Scan button and the results; below
// lg the merged mobile surface, `mobile-scan-surface`, pins its own scope ·
// timeframe · Scan row and puts the same MarketScanResults in its scrolling
// region. `market-scan-rail` does not exist at 375px at all — hardcoding it is
// what left the §19d 375px spec clicking at a button that never renders until
// the 120s test timeout fired.
function scanSurface(page: Page): Locator {
  return (page.viewportSize()?.width ?? 0) < 1024
    ? page.getByTestId("mobile-scan-surface")
    : page.getByTestId("market-scan-rail");
}

// Narrows the scan to one asset group before scanning it. Both compositions
// render the same ScopeMenu — an anchored listbox at ≥lg, a full-screen sheet
// below — so one `[role="option"]` click serves both.
//
// Why a caller would: a scan is a fan-out of chunked requests now
// (src/lib/scanBatching.ts), so an All-markets scan spends six of the 40/60s
// rate-limit budget and a one-group scan spends one. Specs that need A setup on
// the stage — not the whole universe's — say so, and the suite stops
// rate-limiting itself. Crypto is the group to name: its calendar never closes
// (src/lib/marketHours.ts), so it is scannable whenever this suite runs.
async function scopeScanToGroup(page: Page, label: string) {
  const surface = scanSurface(page);
  await surface.getByRole("button", { name: "Scan scope" }).click();
  await page
    .locator('[role="option"]')
    .filter({ has: page.getByText(label, { exact: true }) })
    .first()
    .click();
  await expect(surface.getByRole("button", { name: "Scan scope" }))
    .toContainText(label);
}

async function scanForSetupOnStage(page: Page): Promise<boolean> {
  const rail = scanSurface(page);
  await rail.getByRole("button", { name: "Scan", exact: true }).click();
  // Every finished scan says what it checked or says it could not complete.
  // That pair is unconditional and waited for hard: neither arriving is rot.
  const countLine = rail.getByText(/\d+ scanned/);
  const scanFailed = rail.getByText(
    "Market scan could not complete. Try again shortly.",
  );
  await expect(countLine.or(scanFailed)).toBeVisible({ timeout: 90_000 });
  if (await isVisibleWithin(scanFailed, 1_000)) {
    return false;
  }
  const strongest = rail.getByText(/^(Buy|Sell) · confidence \d+$/).first();
  if (!(await isVisibleWithin(strongest, 1_000))) {
    return false;
  }
  // The row is a button; its meta line is what identifies it.
  await strongest.click();
  return true;
}

// The expected scope-menu row order, computed the same way
// tests/scopeMenu.test.tsx pins it at the unit level: All markets, then
// each group alphabetically (AVAILABLE_ASSET_GROUPS already carries that
// order), then that group's markets, base/quote-sorted (also carried
// as-is). Shared by both viewport variants below since ScopeMenu.tsx
// renders the anchored popup and the full-screen sheet from one function.
function expectedScopeMenuLabels(): string[] {
  return [
    "All markets",
    ...AVAILABLE_ASSET_GROUPS.flatMap((group) => [
      group.label,
      ...group.options.map((option) => option.label),
    ]),
  ];
}

test("authenticated workspace leads with the Levelflow wordmark, not the Windward Line brand", async ({ page }) => {
  await page.goto("/");

  // App.tsx mounts both the mobile (`lg:hidden`) and desktop (`hidden
  // lg:flex`) headers at every viewport width — only CSS decides which
  // one is actually visible, and getByText does not filter on that. This
  // test runs at Playwright's default desktop viewport, so it scopes to
  // the desktop-header block specifically rather than tripping a
  // strict-mode violation against both wordmarks.
  const header = page.getByTestId("desktop-header");
  await expect(header.getByText("Levelflow", { exact: true })).toBeVisible();
  await expect(header.getByText("Windward Line")).toHaveCount(0);

  // "Windward Line" surfaces exactly once on the authed page: the footer
  // colophon. Spec §17i put that footer inside the frame on every ≥lg surface,
  // the Desk included, so the claim is now checkable from the default landing
  // surface itself rather than only from a scrolling tab — visible, not merely
  // present, because the frame's last row is always on screen.
  await expect(page.getByText("Windward Line")).toHaveCount(1);
  await expect(page.getByText("A Windward Line production")).toBeVisible();
});

test("authenticated workspace exposes Desk navigation, not the retired About tab", async ({ page }) => {
  await page.goto("/");

  // Scoped to the desktop nav specifically: App.tsx's bottom mobile tab bar
  // is a second, always-mounted <nav> (merely lg:hidden at this viewport),
  // so an unscoped "nav button" query would double-count its Review/Scan/
  // Trades/Insights buttons alongside this one's Desk/Insights/Guide/
  // Profile.
  const nav = page.locator('nav[aria-label="Levelflow sections"]');
  // evaluateAll reads the DOM once, with no auto-retry — awaiting a real
  // button's visibility first means this can't race the auth-loading
  // panel (App.tsx renders no <nav> at all while `loading` is true).
  await expect(nav.getByRole("button", { name: "Desk", exact: true }))
    .toBeVisible();
  const navLabels = await nav
    .locator("button")
    .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
  expect(navLabels).toEqual(["Desk", "Insights", "Guide", "Profile"]);
  await expect(page.getByRole("button", { name: "About" })).toHaveCount(0);

  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "How to use Levelflow" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What Levelflow does" }),
  ).toBeVisible();

  // Spec §17i: each link lives in exactly one home per platform, so the Guide's
  // closing Support block (§17 placement (b)) is DELETED — the footer's link row
  // sits in the frame twenty pixels below the article, permanently on screen. Both
  // directions are checked: nothing named Support survives on this page, and the
  // footer's own Help and Donate are asserted below.
  await expect(page.getByTestId("guide-support")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Support", exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Email support" })).toHaveCount(0);

  // §17c: the TOC entries carry their sections' own numbers, and the index
  // lists the deck's ten numbered sections.
  const toc = page.locator('nav[aria-label="Guide sections"]');
  const tocEntries = await toc.locator("a").allTextContents();
  expect(tocEntries).toHaveLength(10);
  expect(tocEntries[0]).toContain("01");
  expect(tocEntries[9]).toContain("10");
  await expect(toc.getByRole("link", { name: /Support/ })).toHaveCount(0);

  // And it does not move when scrolling begins: its sticky offset is its own
  // resting offset. §17i re-based which offset that is — the document no longer
  // scrolls, the content region does, so the rail rests at the region's own top
  // padding rather than below a sticky masthead (20px, not 89).
  //
  // The scroll itself is asserted, not assumed: a wheel event that scrolls
  // nothing would leave the rail exactly where it was and satisfy the poll
  // below vacuously. The cursor is moved into the article first for the same
  // reason — a wheel at the default (0,0) position is not guaranteed to land on
  // the region that scrolls.
  const restingTop = (await toc.boundingBox())?.y ?? -1;
  expect(restingTop).toBeGreaterThan(0);
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() =>
      page.getByTestId("content-region").evaluate((element) =>
        element.scrollTop
      )
    )
    .toBeGreaterThan(0);
  // The document itself stays put: the frame is exactly the viewport tall.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect
    .poll(async () => (await toc.boundingBox())?.y ?? -1)
    .toBe(restingTop);
  await page.mouse.wheel(0, -400);

  // Spec §17, placement (a): the footer's link row carries Help and Donate
  // beside the legal trio — on every ≥lg surface since §17i. Scoped to the footer
  // for the same reason.
  const footerSupport = page.locator("footer").getByRole("navigation", {
    name: "Support",
  });
  await expect(footerSupport.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(
    footerSupport.getByRole("button", { name: "Donate", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("footer").getByRole("navigation", { name: "Legal" }),
  ).toBeVisible();

  // And the row survives the surface change — Insights scrolls too.
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(footerSupport.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(
    footerSupport.getByRole("button", { name: "Donate", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Profile", exact: true }).click();
  // Scoped to the panel from here down, so a heading the footer or the masthead
  // happens to share cannot satisfy a claim about the sheet.
  const profile = page.getByTestId("profile-panel");
  await expect(
    profile.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  await expect(
    profile.getByRole("heading", { name: "Account", exact: true }),
  ).toBeVisible();
  await expect(
    profile.getByRole("heading", { name: "Broker", exact: true }),
  ).toBeVisible();
  await expect(
    profile.getByRole("heading", { name: "Appearance", exact: true }),
  ).toBeVisible();

  // Spec §17i: the sheet is three rows. §16 had relocated Help and Donate onto a
  // fourth "Support" row when the desktop header buttons were killed; the footer
  // in the frame is their one desktop home now, so the row is DELETED and its two
  // links exist on this page exactly once — in the footer, asserted below.
  await expect(
    profile.getByRole("heading", { name: "Support", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Email support" }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Donate", exact: true }))
    .toHaveCount(1);
  await expect(page.getByRole("link", { name: "Help" })).toHaveCount(1);

  // Spec §17c: one footer on every view — Profile used to be the one surface that
  // skipped it and drew its own legal block instead. Both the shared row and the
  // absence of a second copy are checked.
  await expect(footerSupport.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(page.getByText("A Windward Line production")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Legal" }),
  ).toHaveCount(1);

  // Donate is the last surface, and the shortest — the footer has to sit at the
  // true bottom of the viewport there, which is now the frame's own doing.
  await footerSupport.getByRole("button", { name: "Donate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Donate", exact: true }),
  ).toBeVisible();
  await expect(footerSupport.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(
    page.locator("footer").getByRole("navigation", { name: "Legal" }),
  ).toBeVisible();
  const bottomGap = await page.locator("footer").evaluate((element) =>
    window.innerHeight - element.getBoundingClientRect().bottom
  );
  expect(bottomGap).toBeLessThanOrEqual(1);
});

// Spec §17i, the ruling's own shape: "the masthead pinned top, THE footer pinned
// bottom and always visible, the content region scrolling between them." Only a
// real browser can say whether that is true, and it has to be true at more than
// one width — a frame that holds at 1280 and spills at 1440 is not a frame. Every
// authed surface is walked at both, including the Desk, which had no footer at all
// before this ruling and the Guide, which used to hide it below a full page-scroll.
test("the desktop frame pins the masthead and the footer at every width (§17i)", async ({ page }) => {
  // Q4-I3: two full page loads and ten surface visits with no live-analyzer
  // wait in the mix — the file's 30s default has no margin on a loaded runner.
  test.setTimeout(60_000);
  // All five surfaces, not four. Donate is the one the masthead does not list —
  // since §17i the footer's own control is its single desktop home — so the sweep
  // reaches it the way a reader does, and the walk stops skipping the shortest
  // surface in the app, which is where "the footer sits at the true bottom" is
  // least automatic.
  const SURFACES = [
    { heading: null, landmark: "current-trades-rail", name: "Desk", via: "masthead" },
    { heading: null, landmark: null, name: "Insights", via: "masthead" },
    { heading: null, landmark: null, name: "Guide", via: "masthead" },
    { heading: null, landmark: "profile-panel", name: "Profile", via: "masthead" },
    { heading: "Donate", landmark: null, name: "Donate", via: "footer" },
  ] as const;

  for (const width of [1280, 1440]) {
    await page.setViewportSize({ height: 800, width });
    await page.goto("/");

    for (const surface of SURFACES) {
      if (surface.via === "masthead") {
        await page.getByRole("navigation", { name: "Levelflow sections" })
          .getByRole("button", { exact: true, name: surface.name })
          .click();
      } else {
        await page.locator("footer")
          .getByRole("button", { exact: true, name: surface.name })
          .click();
      }
      if (surface.landmark) {
        await expect(page.getByTestId(surface.landmark)).toBeVisible();
      }
      if (surface.heading) {
        await expect(
          page.getByRole("heading", { exact: true, name: surface.heading }),
        ).toBeVisible();
      }

      // The frame: the document does not scroll at all, and both chrome rows are
      // on screen — the header at the very top, the footer flush to the bottom.
      const frame = await page.evaluate(() => {
        const header = document.querySelector("header")!.getBoundingClientRect();
        const footer = document.querySelector("footer")!.getBoundingClientRect();
        const region = document.querySelector<HTMLElement>(
          '[data-testid="content-region"]',
        )!;
        return {
          documentScroll: document.documentElement.scrollHeight -
            document.documentElement.clientHeight,
          footerBottomGap: window.innerHeight - footer.bottom,
          footerTop: footer.top,
          headerTop: header.top,
          regionBottom: region.getBoundingClientRect().bottom,
          regionOverflowY: getComputedStyle(region).overflowY,
          regionTop: region.getBoundingClientRect().top,
        };
      });
      expect(frame.documentScroll, `${surface.name} at ${width}`).toBeLessThanOrEqual(0);
      expect(frame.headerTop, `${surface.name} at ${width}`).toBe(0);
      expect(frame.footerBottomGap, `${surface.name} at ${width}`)
        .toBeLessThanOrEqual(1);
      // …and the content region is exactly what sits between them, so nothing can
      // be scrolled out from under either row.
      expect(frame.regionTop, `${surface.name} at ${width}`).toBeGreaterThan(0);
      expect(frame.regionBottom, `${surface.name} at ${width}`)
        .toBeLessThanOrEqual(frame.footerTop + 1);
      // The Desk hands its scroll to its three columns; every other surface
      // scrolls the region itself. Either way the DOCUMENT never scrolls, which is
      // the assertion above.
      expect(frame.regionOverflowY, `${surface.name} at ${width}`).toBe(
        surface.name === "Desk" ? "hidden" : "auto",
      );
    }

    // The one surface with more content than frame at this height: scrolling it
    // moves the region and leaves both chrome rows exactly where they were.
    await page.getByRole("navigation", { name: "Levelflow sections" })
      .getByRole("button", { exact: true, name: "Guide" })
      .click();
    const region = page.getByTestId("content-region");
    const footerBefore = (await page.locator("footer").boundingBox())!.y;
    await region.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await region.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect((await page.locator("footer").boundingBox())!.y).toBe(footerBefore);
    await expect(page.locator("footer").getByText("A Windward Line production"))
      .toBeVisible();

    // And it moves for a keyboard too, which is what §17i's own scroll region
    // silently cost until this assertion existed: the document cannot scroll any
    // more, so from the focus a page load starts with, Space / PageDown / End
    // moved this region 0px of 4147 (measured, Chromium, both widths). The stop
    // on the region is what restores them — reached by role and name, since an
    // unnamed stop announces as nothing.
    await region.evaluate((element) => {
      element.scrollTop = 0;
      (document.activeElement as HTMLElement | null)?.blur();
    });
    expect(await page.evaluate(() => document.activeElement === document.body))
      .toBe(true);
    const named = page.getByRole("region", { name: "Guide" });
    await expect(named).toBeVisible();
    // The masthead's own controls come first in the DOM, so the region is not the
    // first stop — what has to hold is that it is a stop at all, and that it
    // comes before the article's own links, which is the difference between
    // reading a page and being thrown into the middle of it.
    let reached = false;
    let insideFirst = false;
    for (let stop = 0; stop < 12 && !reached; stop += 1) {
      await page.keyboard.press("Tab");
      const where = await named.evaluate((element) => ({
        inside: element !== document.activeElement &&
          element.contains(document.activeElement),
        isRegion: element === document.activeElement,
      }));
      reached = where.isRegion;
      insideFirst = insideFirst || (!reached && where.inside);
    }
    expect(reached, `the content region is not a tab stop at ${width}`).toBe(true);
    expect(insideFirst, "a control inside the region was reached first").toBe(false);
    expect(await region.evaluate((element) => Math.round(element.scrollTop)))
      .toBe(0);
    for (const key of ["Space", "PageDown", "End"]) {
      await region.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.keyboard.press(key);
      await expect
        .poll(() => region.evaluate((element) => Math.round(element.scrollTop)), {
          message: `${key} moved the region 0px at ${width}`,
        })
        .toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
});

test("market scan is the mock's quiet rail — eyebrow, scope menu, no footnote, no panel furniture", async ({ page }) => {
  await page.goto("/");

  // Spec §16 deleted the rail's panel title block and its legend box; the
  // eyebrow + button row and the closing footnote are what stand in their place
  // (a-desk-v3.html:88, :158). Both directions are checked here, per that
  // section's standing review discipline. §17m.4 renamed both halves of that
  // row: the column is "Markets", the action is "Scan".
  const rail = page.getByTestId("market-scan-rail");
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("heading", { name: "Markets", exact: true }))
    .toBeVisible();
  await expect(rail.getByRole("button", { name: "Scan", exact: true }))
    .toBeVisible();
  await expect(rail.getByRole("heading", { name: "Scan", exact: true }))
    .toHaveCount(0);
  // Spec §17c: both narration lines are deleted — the mock's closing footnote
  // and the un-scanned rail's empty-state sentence. The empty rail is the
  // controls. Checked in the live DOM, not only at the source, because this is
  // the surface the owner read them on.
  await expect(
    rail.getByText(
      "Every setup Levelflow generates is saved to Insights automatically.",
    ),
  ).toHaveCount(0);
  await expect(
    rail.getByText(
      "Scan every active market to find the strongest current limit setups.",
    ),
  ).toHaveCount(0);

  const scopeMenuButton = rail.getByRole("button", { name: "Scan scope" });
  await expect(scopeMenuButton).toBeVisible();
  await expect(scopeMenuButton).toContainText("All markets");

  // m3 retired the legacy Quality band filter (spec §5's rail has none) and
  // I7 retired the stacked VolatilityWindowPanel ("Timing edge"/"Best time
  // window") below the stage — neither exists to check for anymore. Spec §16
  // retired the rest of the rail's chrome:
  await expect(
    page.getByRole("heading", { name: "Best current markets" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Scan shows the strongest qualifying setup among closely linked markets.",
    ),
  ).toHaveCount(0);

  // The legend's other half was a standing key of all four cost ratings,
  // belonging to no market. Asserted structurally rather than by rating text:
  // "Clean", "Acceptable", "Thin" and "Poor" are live executionLabel values
  // that the row chip legitimately renders, so an absence assertion on any of
  // those strings would fail on real scan data for a reason that has nothing to
  // do with the kill list.
  //
  // The claim is made against the un-scanned rail, which is the state this spec
  // is in throughout: it never scans, so the rail holds no result rows and
  // therefore no chips of its own. A standing legend belongs to no market and
  // would be here anyway — so ANY chip in this state is the legend coming back.
  // (The earlier form of this check filtered the chip list for chips outside a
  // row, which in an empty rail filtered an empty list and could not fail.)
  await expect(rail.locator("span.chip")).toHaveCount(0);
});

test("a How this works link opens the Guide at the section it names", async ({ page }) => {
  // The scan rail's legend carried the only always-on-screen How this works
  // link; spec §16 deleted that box and moved the cost-ratings disclosure onto
  // the Costs row inside "Why this setup", where a cost rating is actually
  // explained. That row only exists once a review has produced a setup, so
  // this now follows the same live-dependency and honest-skip pattern as the
  // file's other review-driven specs.
  test.setTimeout(120_000);
  await page.goto("/");
  test.skip(
    !(await scanForSetupOnStage(page)),
    "No qualifying setup right now, so there is no Costs row on screen to click.",
  );

  // The receipt is unconditional once a qualifying market is selected — the
  // stage renders the ladder and "Why this setup" from the row's own setup — so
  // this is waited for hard: its absence is rot, not a quiet market.
  await expect(page.getByRole("heading", { name: "Why this setup" }))
    .toBeVisible();

  // Innermost element holding both the row label and a link: the Costs row
  // itself, whose link is the only one scoped to it. The label is "Costs"
  // since the panel was recomposed to the mock's five rows
  // (a-desk-v3.html:210) — "Trading costs" was the pre-recomposition wording.
  const costsRow = page
    .locator("div")
    .filter({ has: page.getByText("Costs", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "How this works" }) })
    .last();
  await costsRow.getByRole("button", { name: "How this works" }).click();

  await expect(
    page.getByRole("heading", { name: "How to use Levelflow" }),
  ).toBeVisible();
  const costRatings = page.locator("#cost-ratings");
  await expect(costRatings).toBeVisible();
  await expect(costRatings).toBeInViewport();
  // Renamed from "Cost ratings" when the About content absorbed into the
  // Guide's ten-section deck (spec §11) — the id anchor is unchanged, only
  // the heading text is shorter now.
  await expect(
    costRatings.getByRole("heading", { name: "Costs", exact: true }),
  ).toBeVisible();
});

test("a Contents click stays on the Guide, and Back stays there too (§17o fragment claiming)", async ({ page }) => {
  // The §17o review's F1: a fragment navigation fires popstate with a null
  // state, exactly like a traversal. Before the fold, clicking the Guide's own
  // Contents rail ejected the reader to the Desk on the spot, and Back walked
  // dead entries afterwards. Source pins hold the claiming semantics; this is
  // the one guard that exercises the defect the way it was found — in a
  // browser, on the rail the Guide itself renders at >=lg.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  const toc = page.getByRole("navigation", { name: "Guide sections" });
  await expect(toc).toBeVisible();
  await toc.getByRole("link").nth(2).click();
  await expect(toc).toBeVisible(); // still the Guide, not the Desk
  await page.goBack();
  await expect(toc).toBeVisible(); // Back stays on the Guide (claimed entry)
});

test("a receipt How this works link lands on the Guide's record section", async ({ page }) => {
  // The receipt only exists once a review has run, so this test asks the
  // live analyzer for one (and, like any review, saves it against the
  // dedicated E2E user). A market that is standing aside returns no setup
  // and therefore no receipt — a legitimate outcome, not a failure — so the
  // test skips itself rather than pinning behavior on market conditions.
  test.setTimeout(120_000);
  await page.goto("/");
  test.skip(
    !(await scanForSetupOnStage(page)),
    "No qualifying setup right now, so there is no receipt on screen to click.",
  );
  await expect(page.getByRole("heading", { name: "Why this setup" }))
    .toBeVisible();

  // Innermost element holding both the row label and a link: the Record row
  // itself, whose link is the only one scoped to it. The label is "Record"
  // since the panel was recomposed to the mock's five rows
  // (a-desk-v3.html:211) — "Replay record" was the pre-recomposition wording.
  const replayRow = page
    .locator("div")
    .filter({ has: page.getByText("Record", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "How this works" }) })
    .last();
  await replayRow.getByRole("button", { name: "How this works" }).click();

  const replayRecord = page.locator("#replay-record");
  await expect(replayRecord).toBeVisible();
  await expect(replayRecord).toBeInViewport();
  // The Guide's own section is titled "The record" (spec §11's ten-section
  // deck); the receipt's row label is "Record" (a-desk-v3.html:211). Different
  // wording on purpose — the #replay-record anchor id is what ties them, and
  // it has never changed.
  await expect(
    replayRecord.getByRole("heading", { name: "The record", exact: true }),
  ).toBeVisible();
});

test("advisor loads Ultimate one-minute chart data", async ({ page }) => {
  test.setTimeout(60_000);
  // Forex trades Sunday evening through Friday evening (America/New_York) —
  // outside that window (or in a genuine provider gap), a 1-minute EURUSD
  // fetch can legitimately return zero fresh candles. Same honest-skip
  // pattern as the closed-market scope-menu test below, rather than pinning
  // this to live market conditions.
  test.skip(
    !marketAvailability("Forex", "EURUSD", new Date()).open,
    "Forex is closed right now, so there is no fresh one-minute data to check.",
  );

  const client = createClient(supabaseUrl!, supabaseKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const signedIn = await client.auth.signInWithPassword({
    email: testEmail!,
    password: testPassword!,
  });
  expect(signedIn.error).toBeFalsy();

  const marketDataResponse = await client.functions.invoke("market-data", {
    body: {
      symbol: "EURUSD",
      timeframe: "1min",
    },
  });
  const marketData = marketDataResponse.data as {
    error?: string;
    resultsCount?: number;
    timeframe?: string;
  } | null;
  expect(marketDataResponse.error).toBeFalsy();
  expect(marketData?.error).toBeFalsy();
  expect(marketData?.timeframe).toBe("1min");
  expect(marketData?.resultsCount ?? 0).toBeGreaterThan(0);

  await page.goto("/");

  // The stage used to narrate this load ("N 1 hour candles loaded.") and this
  // assertion read that sentence. Spec §2's copy discipline rules out process
  // narration, so the string is gone and the chart's own overlays are the
  // observable instead: it covers itself while loading and says so when it has
  // no data, so both being absent is the same fact the sentence used to
  // report — with the added value of coming from the chart rather than from a
  // separate line that could disagree with it.
  await expect(page.getByText("Loading market data")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByText("No chart data available yet")).toHaveCount(0);
  await expect(page.getByText(/candles loaded/i)).toHaveCount(0);

  // Renamed from "Advisor chart view" when the stale "Advisor" prefix was
  // retired from every user-facing label. Spec §16 then dropped the visible
  // wrapping <label> with the rest of the stage's form chrome — the control is
  // a ghost select in the stagehead now — so the name comes from its
  // aria-label, deliberately kept byte-identical so this contract holds.
  const timeframeSelect = page.getByLabel("Chart view", { exact: true });
  if ((await timeframeSelect.inputValue()) !== "1min") {
    await timeframeSelect.selectOption("1min");
  }

  await expect(timeframeSelect).toHaveValue("1min");
  // Same observable for the re-fetch the timeframe change triggers: the chart
  // re-enters its loading overlay and must come out of it with data.
  await expect(page.getByText("Loading market data")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByText("No chart data available yet")).toHaveCount(0);
  await expect(
    page.getByText(
      "Verified market data is not available for this market yet.",
    ),
  ).toHaveCount(0);
});

test("laptop-width desktop shows the advisor rail beside the chart", async ({ page }) => {
  // Real desktop windows are usually 1000-1500 CSS px wide (Windows display
  // scaling, non-maximized Mac windows). Guard the three-column split at a
  // realistic laptop width, comfortably above the Desk's lg (1024px) break.
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/");

  // The stage carries no heading (spec §2) and, since §17m.1, no action either
  // — the chart-view select is its one stable, always-present control, and its
  // aria-label is the same contract every other spec in this file locates it
  // by. It stands in for the whole stage column the way the old "Market review"
  // heading used to, and is unambiguous at this width: the merged mobile
  // surface (which draws the only other "Chart view") does not render at ≥lg.
  //
  // Unique, not merely first: at this width AdvisorWorkspace renders the ≥lg
  // composition alone, whose stage is one <section> with no <section> ancestor,
  // so a second match would mean the stage grew a wrapper — exactly the kind of
  // change this geometry check exists to catch, and exactly what .first() used
  // to hide.
  const advisorPanel = page.locator("section", {
    has: page.getByLabel("Chart view", { exact: true }),
  });
  const rail = page.getByTestId("current-trades-rail");

  await expect(advisorPanel).toHaveCount(1);
  await expect(advisorPanel).toBeVisible();
  await expect(rail).toBeVisible();

  const panelBox = await advisorPanel.boundingBox();
  const railBox = await rail.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(railBox!.x).toBeGreaterThanOrEqual(panelBox!.x + panelBox!.width - 8);
  expect(railBox!.y).toBeLessThan(panelBox!.y + panelBox!.height);
});

test("mobile viewport keeps the signed-in workspace at full functionality", async ({ page }) => {
  // Q4-I3: this walk covers every mobile tab, the account menu, and every
  // surface behind it with no live-analyzer wait in the mix — the file's 30s
  // default has no margin on a loaded runner.
  test.setTimeout(60_000);
  // Mobile is its own composition (spec §17e), not a narrowed desktop: the top
  // nav pills are gone entirely (display:none via the header's `hidden lg:flex`
  // gate); primary navigation is a THREE-tab bottom bar (Scan / Trades /
  // Insights) whose Scan tab is the merged surface the old Review tab folded
  // into, and Guide / Profile / Donate / Help / Sign out all move behind one
  // account-avatar menu in the header.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  // Same duplicate-header reason as the desktop wordmark test above: both
  // App.tsx headers are always mounted, so this scopes to the mobile-header
  // block specifically rather than tripping a strict-mode violation against
  // both the wordmark and the E8 Markets chip (BrokerChip renders in both).
  const header = page.getByTestId("mobile-header");
  await expect(header.getByText("Levelflow", { exact: true })).toBeVisible();
  // The mobile masthead compacts the broker pill to "E8" (m-mobile-v3.html:43);
  // the accessible name stays "E8 Markets" via aria-label. exact:true keeps
  // this from also matching the full desktop label, which is mounted (hidden)
  // in the sibling header at this width.
  await expect(header.getByText("E8", { exact: true })).toBeVisible();
  await expect(header.getByLabel("E8 Markets")).toBeVisible();

  // Scoped to the tab bar's own nav, not the page: the merged surface's action
  // button is "Scan", which is exactly the first tab's name, and at this width
  // both are visible at once (spec §17e's one surface, one verb). The bar's
  // landmark is aria-label="Levelflow"; the desktop masthead's is "Levelflow
  // sections", and a CSS attribute selector is an exact match, so this can never
  // pick up the wrong nav.
  const tabBar = page.locator('nav[aria-label="Levelflow"]');
  for (const tab of ["Scan", "Trades", "Insights"]) {
    // The Trades button's aria-label grows to "Trades, N current" once a
    // live setup exists (App.tsx's MobileTabBar badge) — this suite creates
    // one earlier in the file, so exact:true would fail here whenever that
    // ran first. The other two tabs never carry a badge today, so they
    // stay exact.
    const locator = tab === "Trades"
      ? tabBar.getByRole("button", { name: /^Trades(,|$)/ })
      : tabBar.getByRole("button", { name: tab, exact: true });
    await expect(locator).toBeVisible();
  }
  // Three, not four: the Review tab is gone, and counting is what proves it —
  // a fourth button would satisfy every assertion above.
  await expect(tabBar.getByRole("button")).toHaveCount(3);

  // Guide/Profile/Donate/Help/Sign out are real controls, just not directly
  // visible until the account menu opens (App.tsx's MobileAccountMenu is
  // conditionally rendered, not merely CSS-hidden, while closed).
  const accountMenu = page.getByRole("button", { name: "Account menu" });
  await expect(accountMenu).toBeVisible();
  await accountMenu.click();
  await expect(page.getByRole("menuitem", { name: "Guide" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Donate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  // Help is an <a href={mailto}> here, but App.tsx sets an explicit
  // role="menuitem" on it (matching its four sibling menu items) — that
  // explicit role overrides the anchor's native "link" role in the
  // accessibility tree, so it has to be queried the same way they are.
  await expect(page.getByRole("menuitem", { name: "Help" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The merged Scan surface is the Desk's default and carries all of it
  // (m-scan-v3.html): the scope menu, the two-character timeframe, the one Scan
  // button, the market head, the chart with its Expand affordance, and — in the
  // one scrolling region below them — the ladder, the why line and the
  // qualifying markets. Every locator is scoped to the surface or to the bar,
  // since "Scan" is now both a tab and an action.
  const scanSurface = page.getByTestId("mobile-scan-surface");
  await expect(scanSurface).toBeVisible();
  await expect(scanSurface.getByRole("button", { name: "Scan scope" }))
    .toBeVisible();
  await expect(scanSurface.getByRole("button", { name: "Scan", exact: true }))
    .toBeVisible();
  // exact:true, like the desktop sibling above: getByLabel is a
  // case-insensitive SUBSTRING match, and MarketChart's tool cluster carries a
  // "Default chart view" reset button that also contains "chart view". The
  // wave-6 rider hides that cluster on the inline mobile chart, so only the
  // select is in the accessibility tree here — the flag stays as the assertion's
  // own guarantee rather than something a layout change can quietly remove.
  await expect(scanSurface.getByLabel("Chart view", { exact: true }))
    .toBeVisible();
  await expect(scanSurface.getByRole("button", { name: "Expand chart" }))
    .toBeVisible();
  // And the composition it replaced does not render here at all: no separate
  // scan rail, and no "Markets" eyebrow of one (§17m.4's rename lives at ≥lg;
  // this surface's own control row is its head). "Review" is absent at every
  // width since §17m.1 — the stage generates nothing on either platform — and
  // this keeps asserting it from the mobile side.
  await expect(page.getByTestId("market-scan-rail")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Markets", exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review", exact: true }))
    .toHaveCount(0);

  // Spec §17g: a fixed viewport, like the ≥lg Desk — the page itself does not
  // scroll, one region inside it does, and the footer is absent. This used to be
  // the Scan surface's own property; it is now every mobile surface's, which the
  // sweep below walks one tab at a time.
  const documentScroll = () =>
    page.evaluate(() =>
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight
    );
  const scrollsInternally = (testId: string) =>
    page.getByTestId(testId).evaluate((element) =>
      getComputedStyle(element).overflowY
    );

  expect(await documentScroll()).toBeLessThanOrEqual(0);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByTestId("mobile-scan-scroll")).toBeVisible();
  expect(await scrollsInternally("mobile-scan-scroll")).toBe("auto");

  // Trades is one tap away and carries full functionality there, not a
  // stripped-down subset. Same badge caveat as above.
  await tabBar.getByRole("button", { name: /^Trades(,|$)/ }).click();
  await expect(page.getByTestId("current-trades-rail")).toBeVisible();
  // §17g: the rail's header pins and the cards list scrolls inside the frame, so
  // this surface is fixed too — and carries no footer, which is what changed.
  await expect(page.locator("footer")).toHaveCount(0);
  expect(await documentScroll()).toBeLessThanOrEqual(0);
  expect(await scrollsInternally("mobile-trades-scroll")).toBe("auto");
  // The pinned header is still on screen with the list scrolled to its end.
  await page.getByTestId("mobile-trades-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole("heading", { name: "Current trades", exact: true }),
  ).toBeInViewport();

  // And back, without losing the surface.
  await tabBar.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(scanSurface).toBeVisible();

  await tabBar.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();
  // §17g: record band + filters pinned, the ledger scrolling. Every filter keeps
  // its own accessible name — the row-nav contract and these three labels are
  // what the ruling says to preserve through the reframing.
  expect(await documentScroll()).toBeLessThanOrEqual(0);
  await expect(page.locator("footer")).toHaveCount(0);
  expect(await scrollsInternally("mobile-insights-scroll")).toBe("auto");
  for (const filter of ["Market", "Status", "Period"]) {
    await expect(page.getByLabel(filter, { exact: true })).toBeVisible();
  }
  // Spec §18/§17g: Attribution is the same one section, riding the same one
  // scroll region as the ledger — proved by locating it as a descendant of the
  // region rather than merely somewhere on the page, which is what would still
  // pass if a phone-only copy of it had been built outside the frame.
  const mobileAttribution = page.getByTestId("mobile-insights-scroll")
    .getByTestId("attribution");
  await expect(mobileAttribution).toBeVisible();
  for (const group of ["Asset class", "Side", "Confidence", "Session"]) {
    await expect(mobileAttribution.getByText(group, { exact: true }))
      .toBeVisible();
  }
  // Insights is where a document-level horizontal overflow would actually
  // start: its ledger is the app's one wide (min-w) table, now flat inside a
  // px-4 scroll region, with Attribution's own label/figures row beneath it.
  // The REGION x-scrolling is by design on a phone; the DOCUMENT doing so is
  // the §17g defect this pins.
  const insightsHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth
  );
  expect(insightsHorizontalOverflow).toBeLessThanOrEqual(0);

  // The two avatar-menu surfaces, and Profile's colophon: §17g's footer, reduced
  // to one line and living in exactly one place on mobile.
  await accountMenu.click();
  await page.getByRole("menuitem", { name: "Guide" }).click();
  await expect(
    page.getByRole("heading", { name: "How to use Levelflow" }),
  ).toBeVisible();
  expect(await documentScroll()).toBeLessThanOrEqual(0);
  expect(await scrollsInternally("mobile-guide-scroll")).toBe("auto");
  // Mobile has no TOC (spec §16) and the pinned title stays put while the article
  // moves under it.
  await expect(page.getByRole("navigation", { name: "Guide sections" }))
    .toHaveCount(0);
  await page.getByTestId("mobile-guide-scroll").evaluate((element) => {
    element.scrollTop = 400;
  });
  await expect(page.getByRole("heading", { name: "How to use Levelflow" }))
    .toBeInViewport();

  await accountMenu.click();
  await page.getByRole("menuitem", { name: "Donate" }).click();
  await expect(page.getByRole("heading", { name: "Donate", exact: true }))
    .toBeVisible();
  expect(await documentScroll()).toBeLessThanOrEqual(0);
  expect(await scrollsInternally("mobile-donate-scroll")).toBe("auto");

  await accountMenu.click();
  await page.getByRole("menuitem", { name: "Profile" }).click();
  await expect(page.getByTestId("profile-panel")).toBeVisible();
  expect(await documentScroll()).toBeLessThanOrEqual(0);
  expect(await scrollsInternally("mobile-profile-scroll")).toBe("auto");
  // Still no <footer> element anywhere below lg — what Profile carries is the
  // colophon line alone, inside its own scroll region.
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(
    page.getByTestId("mobile-profile-scroll").getByText(
      "A Windward Line production",
      { exact: true },
    ),
  ).toBeAttached();

  // Q1-I7: the sheet ends on content, not on a line — and this is the only place
  // that can be proven, since the rule is a selector and the unit guards read the
  // class out of the source. `last:border-b-0` (`:last-child`) matched the
  // colophon paragraph here rather than the third row, so Appearance kept a
  // hairline above the colophon on mobile only; the mock's own `:last-of-type`
  // matches the row in both branches.
  const rowBorders = await page.getByTestId("mobile-profile-scroll").evaluate(
    (region) =>
      Array.from(region.children).map((child) => ({
        tag: child.tagName,
        borderBottom: getComputedStyle(child).borderBottomWidth,
      })),
  );
  expect(rowBorders.length).toBe(4);
  expect(rowBorders.at(-1)!.tag).toBe("P");
  const rows = rowBorders.filter((child) => child.tag === "DIV");
  expect(rows.length).toBe(3);
  expect(rows.at(-1)!.borderBottom, JSON.stringify(rowBorders)).toBe("0px");
  for (const row of rows.slice(0, -1)) {
    expect(row.borderBottom).not.toBe("0px");
  }

  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
});

test("§17n: every mobile surface's chrome stays inside its measured budget at 375x812", async ({ page }) => {
  // Spec §17n (owner ruling, durable): ancillary chrome is "sized to the smallest
  // form that stays tappable, usable and legible — and no larger… The content
  // region is the budget being protected, and chrome yields to it."
  //
  // The unit guard (tests/mobileMinimalism.test.ts) pins the class strings that
  // produce the sizes and records the wave's own measurements. What can only be
  // proved here is the BUDGET: the live split between pinned chrome and the
  // scrolling content region, in the real app, in a real browser, at the width the
  // ruling names. The numbers below are ceilings and floors with slack, not exact
  // pins — a resize that respects the ruling moves them down, and a regression
  // that re-inflates the chrome trips them.
  //
  // Measured in Chromium against the built CSS at 375x812 when this landed:
  // header 61px, content row 751px, tab bar 49px; pinned/scroll by surface —
  // Scan 292.5/458.5, Trades 30/721, Insights 267/484, Profile 46/705,
  // Guide 46/705, Donate 46/705.
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const tabBar = page.locator('nav[aria-label="Levelflow"]');
  await expect(tabBar).toBeVisible();
  // The bar is min-h-12 (48px) plus its 1px top border plus the device's own
  // safe-area inset, which is 0 in a desktop Chromium. It may never drop below the
  // kit's 44px tap floor and it may never climb back to the 56px box §17n retired.
  const barHeight = await tabBar.evaluate((element) =>
    element.getBoundingClientRect().height
  );
  expect(barHeight).toBeGreaterThanOrEqual(44);
  expect(barHeight).toBeLessThanOrEqual(52);

  // The pinned block is the scroll region's own previous sibling on every one of
  // the six surfaces (the shared frame is [pinned, scroll] — src/components/
  // mobileFrame.ts), so one helper measures all six without six locators.
  const budget = async (scrollTestId: string) => {
    const region = page.getByTestId(scrollTestId);
    await expect(region).toBeVisible();
    return region.evaluate((element) => {
      const pinned = element.previousElementSibling;
      return {
        pinned: pinned ? pinned.getBoundingClientRect().height : -1,
        scroll: element.getBoundingClientRect().height,
      };
    });
  };

  // The floor the slimming may not cross, swept on EVERY surface rather than on
  // one: the targets this wave actually compacted are Scan's scope trigger (48px →
  // 44px) and Insights' three filters (48px → 44px), so a sweep that only ran
  // where nothing was resized would have proved the least. Two exclusions, both
  // principled rather than convenient, and each one belongs to a specific surface:
  //   - .colophon-link (Profile): reaches 44px through the ::after overlay §17k
  //     puts outside layout, so its own box is 19.5px by design.
  //   - #tv-attr-logo (Scan, and any surface showing a chart): lightweight-charts'
  //     attribution anchor, a third-party element the app neither styles nor sizes.
  // The one owner-granted exception (§17n, PR #149 — the expanded overlay's 28px
  // cluster) is on none of the six: the inline chart's cluster is max-lg:hidden,
  // and the overlay is not a tab.
  const sweepTargets = async (name: string) => {
    const undersized = await page.evaluate(() => {
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, a[href], select, [role="menuitem"]',
        ),
      );
      return targets
        .filter((element) => {
          if (element.id === "tv-attr-logo") return false;
          if (element.classList.contains("colophon-link")) return false;
          const box = element.getBoundingClientRect();
          return box.height > 0 && box.height < 43.5;
        })
        .map((element) => ({
          height: element.getBoundingClientRect().height,
          label: element.getAttribute("aria-label") ??
            (element.textContent ?? "").trim().slice(0, 30),
        }));
    });
    expect(undersized, `${name}: ${JSON.stringify(undersized)}`).toHaveLength(0);
  };

  const checkSurface = async (
    name: string,
    scrollTestId: string,
    chromeCeiling: number,
    contentFloor: number,
  ) => {
    const { pinned, scroll } = await budget(scrollTestId);
    expect(pinned, `${name} pinned chrome`).toBeGreaterThan(0);
    expect(pinned, `${name} pinned chrome`).toBeLessThanOrEqual(chromeCeiling);
    expect(scroll, `${name} content region`).toBeGreaterThanOrEqual(contentFloor);
    await sweepTargets(name);
  };

  // Scan: 292.5px of it is the control row, the market head, its stamp and the
  // mock's 168px chart — the chart alone is 170px of that, and §17n holds it there
  // (Expand chart is the release valve).
  await checkSurface("Scan", "mobile-scan-scroll", 320, 430);

  await tabBar.getByRole("button", { name: /^Trades(,|$)/ }).click();
  await checkSurface("Trades", "mobile-trades-scroll", 44, 700);

  await tabBar.getByRole("button", { name: "Insights", exact: true }).click();
  // The surface the ruling was written about: 409px of chrome against 334px of
  // ledger before the wave, 267px against 484px after it.
  await checkSurface("Insights", "mobile-insights-scroll", 290, 460);

  const accountMenu = page.getByRole("button", { name: "Account menu" });
  await accountMenu.click();
  await page.getByRole("menuitem", { name: "Guide" }).click();
  await checkSurface("Guide", "mobile-guide-scroll", 56, 690);

  await accountMenu.click();
  await page.getByRole("menuitem", { name: "Donate" }).click();
  await checkSurface("Donate", "mobile-donate-scroll", 56, 690);

  await accountMenu.click();
  await page.getByRole("menuitem", { name: "Profile" }).click();
  await checkSurface("Profile", "mobile-profile-scroll", 56, 690);
});

test("the mobile account menu carries the footer's link set (spec §17g)", async ({ page }) => {
  // §17g moves the footer's links into the avatar menu below lg: Help and Donate
  // were already there, and the legal trio joins them at the bottom. Each action
  // appears exactly once, every link clears the 44px tap floor, and the menu's
  // own aria contract survives — the trio are menuitems inside a labelled group,
  // not a nav landmark smuggled into a role="menu".
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(page.locator("footer")).toHaveCount(0);
  const accountMenu = page.getByRole("button", { name: "Account menu" });
  await accountMenu.click();

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("group", { name: "Legal" })).toBeVisible();

  for (const label of ["Risk disclaimer", "Privacy", "Terms"]) {
    const link = menu.getByRole("menuitem", { name: label, exact: true });
    await expect(link).toHaveCount(1);
    // §17o tier 2: our own documents present in frame — the menu item opens
    // the document surface in place, so it spawns nothing and carries no
    // target. (This line asserted the pre-§17o law until the first live run
    // caught it: authed specs execute only in the deploy, so it survived
    // every pre-merge gate. The in-frame open itself is proven by the
    // doctrine's own tier-2 specs.)
    await expect(link).not.toHaveAttribute("target", "_blank");
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  // Help and Donate are not duplicated by the new block.
  for (const label of ["Help", "Donate"]) {
    await expect(menu.getByRole("menuitem", { name: label, exact: true }))
      .toHaveCount(1);
  }
  // Every child of the menu is a menuitem or the group holding menuitems: the
  // trio added no <nav> landmark inside it.
  await expect(menu.getByRole("navigation")).toHaveCount(0);

  // Escape still closes and returns focus, with the taller menu.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(accountMenu).toBeFocused();

  // And at ≥lg the same five links are the footer's, unchanged (§17c).
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("navigation", { name: "Levelflow sections" })
    .getByRole("button", { exact: true, name: "Insights" })
    .click();
  const footer = page.locator("footer");
  await expect(footer).toBeVisible();
  await expect(footer.getByRole("navigation", { name: "Legal" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(footer.getByText("A Windward Line production")).toBeVisible();
});

test("Expand chart opens the same chart full-viewport at both widths", async ({ page }) => {
  // Q4-I3: two full dialog open/close cycles across two widths with no
  // live-analyzer wait in the mix — the file's 30s default has no margin on
  // a loaded runner.
  test.setTimeout(60_000);
  // Spec §17: the affordance, the overlay's dialog semantics, its 44px close
  // target, Escape, focus in and back out, and the body scroll lock — the
  // pieces only a real browser can confirm. The unit guards source-pin the
  // attributes; this proves they actually behave.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Expand chart" });
  await expect(trigger).toBeVisible();
  // The kit's tap floor, measured rather than asserted from the class list.
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox!.height).toBeGreaterThanOrEqual(44);

  // Wave-6 rider: the affordance rides the chart sheet's TOP-right corner now
  // (m-scan-v3.html:32), not the bottom-right where it crowded the date axis.
  // Measured against its own containing sheet, so this is the real placement
  // rather than a class list read back.
  const corner = await trigger.evaluate((element) => {
    const sheet = element.parentElement!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return {
      fromRight: sheet.right - box.right,
      fromTop: box.top - sheet.top,
      sheetHeight: sheet.height,
    };
  });
  expect(corner.fromTop).toBeLessThanOrEqual(2);
  expect(corner.fromRight).toBeLessThanOrEqual(2);
  expect(corner.fromTop).toBeLessThan(corner.sheetHeight / 2);
  // And the corner is free because the inline chart's six-button tool cluster
  // gives it up below lg — the overlay below keeps the same tools.
  await expect(page.getByRole("button", { name: "Zoom in" })).toHaveCount(0);

  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  // Named by the market — the same display symbol the stagehead heading shows.
  await expect(dialog).toContainText("EUR/USD");
  // The tools the inline chart gave up are here, one tap away, at a usable size.
  await expect(dialog.getByRole("button", { name: "Zoom in" })).toHaveCount(1);
  // Full viewport, within a rounding pixel of it.
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox!.width).toBeGreaterThanOrEqual(374);
  expect(dialogBox!.height).toBeGreaterThanOrEqual(811);

  // Focus moved into the dialog, onto the close control.
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(close).toBeFocused();
  const closeBox = await close.boundingBox();
  expect(closeBox!.height).toBeGreaterThanOrEqual(44);
  expect(closeBox!.width).toBeGreaterThanOrEqual(44);

  // The page behind it cannot scroll while it is open.
  expect(
    await page.evaluate(() => document.body.style.overflow),
  ).toBe("hidden");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // Focus came back to the trigger, and the lock was released — restored to
  // whatever it was before, not blanket-cleared.
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(() => document.body.style.overflow),
  ).not.toBe("hidden");

  // Reopen and close through the control itself, not the keyboard.
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // §17m.3: the affordance now exists at desktop width too — the inline chart
  // is a third of the stage there, so the overlay is how a reader sees a big
  // one. Inverted from the assertion that used to stand here (count 0 at 1280),
  // and exercised rather than merely counted: same dialog contract, at 1280.
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopTrigger = page.getByRole("button", { name: "Expand chart" });
  await expect(desktopTrigger).toBeVisible();
  await desktopTrigger.click();
  const desktopDialog = page.getByRole("dialog");
  await expect(desktopDialog).toBeVisible();
  await expect(desktopDialog).toHaveAttribute("aria-modal", "true");
  const desktopBox = await desktopDialog.boundingBox();
  expect(desktopBox!.width).toBeGreaterThanOrEqual(1279);
  expect(desktopBox!.height).toBeGreaterThanOrEqual(799);
  await expect(desktopDialog.getByRole("button", { name: "Close" }))
    .toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(desktopTrigger).toBeFocused();
  // And it does not collide with the tool cluster it shares the corner with:
  // the cluster keeps the top row, the chip sits below it.
  const chipBox = (await desktopTrigger.boundingBox())!;
  const clusterBox = (await page
    .getByRole("button", { name: "Default chart view" })
    .boundingBox())!;
  expect(chipBox.y).toBeGreaterThanOrEqual(clusterBox.y + clusterBox.height);
});

// Q1-C2: everything the test above proves happened with focus still sitting on
// the Close control, where a React onKeyDown on the dialog could hear it. One
// click on the chart ended that: the chart container carries no tabindex (and
// lightweight-charts adds none), so the press lands document.activeElement on
// the body — this portal's CONTAINER, which has no fiber for React to dispatch
// to. Escape stopped closing an aria-modal surface, and Tab walked out of it
// into the page behind. The unit guard pins the document listener; only a
// browser can prove the key still lands after the click that used to break it.
test("the expanded chart answers Escape and traps Tab after a click on the canvas (Q1-C2)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Expand chart" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(close).toBeFocused();

  // A raw pointer click at chart coordinates, not an element click:
  // lightweight-charts stacks several canvases and Playwright's
  // actionability check refuses to click one canvas through a sibling
  // that intercepts the point (first live run, deploy 30768463655). The
  // user's click has no such scruples — it lands on whatever is topmost,
  // which is all this setup step needs: a real click inside the chart
  // that steals focus out of the dialog's tab order.
  const chartBox = await dialog.locator("canvas").first().boundingBox();
  if (!chartBox) {
    throw new Error("the expanded chart rendered no canvas to click");
  }
  await page.mouse.click(chartBox.x + 40, chartBox.y + 40);
  // The premise, asserted rather than assumed: if a future charting library
  // makes its canvas focusable, focus stays inside the dialog, the React
  // handler would have worked all along, and this guard has stopped guarding
  // anything — so it fails here and gets re-read, instead of going quietly
  // vacuous.
  expect(
    await dialog.evaluate((node) => !node.contains(document.activeElement)),
  ).toBe(true);

  // Tab pulls focus back in rather than continuing into the page behind.
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);

  // And Escape still closes, still returning focus to the trigger.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// Q1-C3: the mobile scope sheet's Close button never ran. The outside-press
// listener closed on any mousedown outside the trigger wrapper or the option
// list, and the sheet's header is inside neither — so the press unmounted the
// portal before mouseup, no click ever completed on the button, and focus was
// left on the body instead of returning to the trigger (WCAG 2.4.3). The same
// path made a tap on the sheet's own title bar silently dismiss it. Unit guards
// pin the ref; the dismissal is a two-event sequence only a browser produces.
test("the mobile scope sheet closes from its own Close button, and its title bar does not dismiss it (Q1-C3)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Scan scope" });
  await trigger.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  // The title bar is not a dismissal. Pressed on the title text itself, which
  // is the sibling of the option list that used to read as "outside".
  const sheetTitle = sheet.getByText("Scan scope", { exact: true });
  await sheetTitle.click();
  await expect(sheet).toBeVisible();

  // The Close button is, and it returns focus where it found it.
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Escape works from the header too, where focus lands after that title-bar
  // press — which is why the key is owned by a document listener.
  await trigger.click();
  const reopened = page.getByRole("dialog");
  await expect(reopened).toBeVisible();
  await reopened.getByText("Scan scope", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// Spec §17m.3, the vertical budget: "chart ≈1/3 of the region's height, why
// ≤1/3 …, the setup ladder gets the majority; the whole stage should fit the
// region without scrolling where viewport allows." Only a browser can say, and
// it has to hold at more than one height — so both of the ruling's own
// viewports are walked, and every number is reported in the failure message.
test("the Desk stage fits its region at 1280x800 and 1440x900 (§17m.3)", async ({ page }) => {
  // Q4-I3: two full page loads at two viewports with no live-analyzer wait in
  // the mix — the file's 30s default has no margin on a loaded runner.
  test.setTimeout(60_000);
  for (const [width, height] of [[1280, 800], [1440, 900]] as const) {
    await page.setViewportSize({ height, width });
    await page.goto("/");
    await expect(page.getByTestId("current-trades-rail")).toBeVisible();
    await expect(page.getByLabel("Chart view", { exact: true })).toBeVisible();

    const stage = await page.evaluate(() => {
      const select = document.querySelector<HTMLElement>(
        '[aria-label="Chart view"]',
      )!;
      const section = select.closest("section")!;
      const column = section.parentElement!;
      const chart = section.querySelector<HTMLElement>(".basis-\\[30\\%\\]")!;
      const sheet = section.querySelector<HTMLElement>(".border-t-0")!;
      // The closed-market reopen notice (spec §10b) is a shrink-0 sibling
      // that legitimately takes ~38px whenever the selected market is closed
      // — a Saturday state, not a regression. Measured so the share
      // assertion below judges the sheet against the space the notice
      // leaves.
      const notice = section.querySelector<HTMLElement>(
        ".mt-3.text-sm.font-medium.text-ink-muted",
      );
      return {
        chartHeight: chart.getBoundingClientRect().height,
        columnHeight: column.clientHeight,
        columnScrollHeight: column.scrollHeight,
        headHeight: section.firstElementChild!.getBoundingClientRect().height,
        noticeHeight: notice ? notice.getBoundingClientRect().height : 0,
        sheetHeight: sheet.getBoundingClientRect().height,
        sheetScrollHeight: sheet.scrollHeight,
      };
    });
    const where = `${width}x${height}: head ${
      Math.round(stage.headHeight)
    }px, chart ${Math.round(stage.chartHeight)}px, sheet ${
      Math.round(stage.sheetHeight)
    }px (content ${Math.round(stage.sheetScrollHeight)}px) in a ${
      Math.round(stage.columnHeight)
    }px region`;

    // The stage itself does not scroll: the column's content is exactly the
    // region it sits in.
    expect(stage.columnScrollHeight, where)
      .toBeLessThanOrEqual(stage.columnHeight + 1);
    // The chart is about a third — measured against the region, not hoped for.
    const chartShare = stage.chartHeight / stage.columnHeight;
    expect(chartShare, where).toBeGreaterThan(0.25);
    expect(chartShare, where).toBeLessThan(0.4);
    // …and the setup sheet, which the ladder leads, takes the majority of what
    // is left: more than the chart, and the largest share of the region (the
    // stagehead's confidence unit owns the remaining ~15%, measured 110px of a
    // 651px region at 1280x800 — hence 0.45 rather than a bare half).
    expect(stage.sheetHeight, where).toBeGreaterThan(stage.chartHeight);
    // Judged against the space the reopen notice leaves: with the notice
    // present (closed market — a weekend truth) the raw-region share drops
    // ~4 points for market conditions, not for any regression.
    expect(
      stage.sheetHeight / (stage.columnHeight - stage.noticeHeight),
      where,
    ).toBeGreaterThan(0.45);
  }
});

test("scope menu lists All markets, then groups alphabetically, then base/quote-sorted markets — 1280px popup", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await page.getByRole("button", { name: "Scan scope" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();

  const optionLabels = await page
    .locator('[role="option"] .truncate')
    .allTextContents();
  expect(optionLabels).toEqual(expectedScopeMenuLabels());
});

test("reviewing one market goes through the rail — the Scan column is the only door (§17m.1)", async ({ page }) => {
  // The ruling's own words: "The rail's scope menu still contains single
  // markets, so reviewing one market remains possible — through Scan, the only
  // door." This walks exactly that, at desktop width, and asserts the stage is
  // a pure display while doing it.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  // Crypto's calendar never closes (src/lib/marketHours.ts), so its first
  // market is scannable whenever this suite happens to run — no skip needed to
  // reach a selectable single market.
  const crypto = AVAILABLE_ASSET_GROUPS.find((group) => group.label === "Crypto");
  expect(crypto, "expected a Crypto group in the menu").toBeTruthy();
  const market = crypto!.options[0];
  expect(market, "expected at least one Crypto market").toBeTruthy();

  const rail = page.getByTestId("market-scan-rail");
  await rail.getByRole("button", { name: "Scan scope" }).click();
  await page
    .locator('[role="option"]')
    .filter({ has: page.getByText(market.label, { exact: true }) })
    .first()
    .click();

  // The stage follows the rail's selection as a heading — and offers nothing to
  // press: no market picker, no Review.
  await expect(
    page.getByRole("heading", {
      exact: true,
      name: formatSecurityDisplaySymbol(market.symbol),
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Review", exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Market", exact: true }))
    .toHaveCount(0);
  await expect(rail.getByRole("button", { name: "Scan scope" }))
    .toContainText(market.label);

  // Scanning that one-market scope IS the review of it: one market attempted,
  // and the stage adopts the verdict with no second click. Which verdict —
  // a ladder or the engine's own reason — is the market's business; both are
  // the review, so the pair is what gets waited for.
  await rail.getByRole("button", { name: "Scan", exact: true }).click();
  const countLine = rail.getByText(/1 scanned/);
  const scanFailed = rail.getByText(
    "Market scan could not complete. Try again shortly.",
  );
  await expect(countLine.or(scanFailed)).toBeVisible({ timeout: 90_000 });
  test.skip(
    await isVisibleWithin(scanFailed, 1_000),
    "The market scan could not complete, so there is no verdict to read.",
  );
  await expect(
    page.getByRole("heading", { name: "Why this setup" })
      .or(page.getByText("No trade setup", { exact: true })),
  ).toBeVisible({ timeout: 30_000 });
});

test("scope menu lists All markets, then groups alphabetically, then base/quote-sorted markets — 375px sheet", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  // The scope menu is pinned to the top of the merged Scan surface, which is the
  // Desk's default tab (spec §17e) — no navigation needed to reach it. The
  // sheet-vs-popup choice is a viewport check inside ScopeMenu itself.
  await page.getByRole("button", { name: "Scan scope" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("listbox")).toBeVisible();

  const optionLabels = await page
    .locator('[role="option"] .truncate')
    .allTextContents();
  expect(optionLabels).toEqual(expectedScopeMenuLabels());
});

test('a closed market\'s scope-menu row shows its local reopen time, never the word "closed"', async ({ page }) => {
  // Availability is real-clock-driven (spec §10b): most classes trade
  // continuously Sunday evening through Friday evening (America/New_York),
  // and the CME complex (Futures/Energies) additionally closes daily for
  // its 5-6pm ET maintenance break. Whether anything is actually closed
  // depends on when this suite happens to run, so this computes the same
  // real answer the component will and skips honestly rather than assert
  // on a clock state the test can't control — the same test.skip pattern
  // this file already uses for live-market-dependent outcomes.
  const now = new Date();
  const closedGroup = AVAILABLE_ASSET_GROUPS.find(
    (group) => !marketAvailability(group.label, "", now).open,
  );
  test.skip(
    !closedGroup,
    "Every market class is open right now, so there is no closed row to check.",
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Scan scope" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();

  // Exact-matched against the row's own label text (rendered in its
  // .truncate span), not a hasText substring on the whole row: several
  // Futures options' full labels literally contain "Futures" (e.g. "BZ -
  // Brent Crude Oil Futures"), so a substring match against the group name
  // "Futures" could in principle also catch one of its own nested market
  // rows ahead of the group row itself.
  const closedRow = page
    .locator('[role="option"]')
    .filter({ has: page.getByText(closedGroup!.label, { exact: true }) })
    .first();
  await expect(closedRow).toHaveAttribute("aria-disabled", "true");
  // Accepts either of marketHours.formatReopen's renderings: the common
  // weekday form ("Opens 6:00p Sun") and its month-day fallback for a
  // reopen beyond the coming week ("Opens 6:00p Dec 25", or locale-reordered
  // "25 Dec") — no calendar here actually produces that gap today, but the
  // regex shouldn't silently break the day a holiday calendar does.
  await expect(closedRow).toContainText(
    /opens \d{1,2}:\d{2}[ap] ([a-z]{3}|[a-z]{3} \d{1,2}|\d{1,2} [a-z]{3})/i,
  );
  await expect(closedRow).not.toContainText(/closed/i);

  // Spec §17m.5: the line must READ, not merely be present — "OPENS 6:00P SUN
  // in full even while the row is disabled". Measured in the row it renders in,
  // at the popup's own width: nothing of it is cut off horizontally, and the
  // market name beside it still has room to be worth reading. (The row yields
  // its label first by construction — ScopeMenu's min-w-0 truncate — so this is
  // the assertion that would catch a type or inset change undoing it.)
  const availability = closedRow.locator("span").last();
  await expect(availability).toBeVisible();
  const fit = await availability.evaluate((element) => {
    const row = element.closest('[role="option"]')!;
    const rowBox = row.getBoundingClientRect();
    const lineBox = element.getBoundingClientRect();
    const label = row.querySelector(".truncate")!;
    return {
      clippedByRow: lineBox.right > rowBox.right + 0.5 ||
        lineBox.left < rowBox.left - 0.5,
      labelWidth: label.getBoundingClientRect().width,
      lineTextClipped: element.scrollWidth > element.clientWidth + 0.5,
      lineWidth: lineBox.width,
      rowWidth: rowBox.width,
    };
  });
  expect(fit.lineTextClipped, `the availability line is cut off: ${JSON.stringify(fit)}`)
    .toBe(false);
  expect(fit.clippedByRow, `the availability line sits outside its row: ${JSON.stringify(fit)}`)
    .toBe(false);
  expect(fit.labelWidth, `no room left for the market name: ${JSON.stringify(fit)}`)
    .toBeGreaterThan(40);
});

test("the current-trades rail is present with a working refresh control", async ({ page }) => {
  await page.goto("/");

  const rail = page.getByTestId("current-trades-rail");
  await expect(rail).toBeVisible();
  await expect(
    rail.getByRole("heading", { name: "Current trades" }),
  ).toBeVisible();

  const refreshButton = rail.getByRole("button", { name: "refresh" });
  await expect(refreshButton).toBeVisible();
  await refreshButton.click();

  // The rail is allowed to be genuinely empty (spec §8: only Pending/Open
  // trades live here) — either state is fine, but exactly one of them must
  // hold. A plain .count() right after the click doesn't retry and would
  // race the async refresh the click just kicked off, so this waits for
  // whichever real end state actually lands instead of reading the DOM
  // once, immediately.
  const emptyState = rail.getByText("No current trades.");
  // The card is a <button> since the 2026-08-02 wave made it the affordance
  // that reopens its own setup — the rail's only other buttons are refresh and
  // the closing Insights link, both of which are `.tertiary-link` text, so the
  // card is the one with a border.
  const firstCard = rail.locator("button.rounded-lg").first();
  await expect(emptyState.or(firstCard)).toBeVisible();
});

// The ladder's own values, keyed by the label each copy control names. The copy
// button's immediate previous sibling IS the value span at both widths (below lg
// the wrapper is `display: contents`, so the DOM shape does not change) — read
// from the rendered stage rather than recomputed, so this compares what a reader
// actually sees on one surface against what they see on another.
async function stageLadderValues(page: Page): Promise<Record<string, string>> {
  return page.getByRole("button", { name: /^Copy / }).evaluateAll((buttons) =>
    Object.fromEntries(
      buttons.map((button) => [
        (button.getAttribute("aria-label") ?? "").replace(/^Copy /, ""),
        button.previousElementSibling?.textContent?.trim() ?? "",
      ]),
    )
  );
}

// The Desk's one market heading — AdvisorWorkspace renders exactly one <h2>, and
// only one of its two compositions mounts at a time (its own isMobile branch).
async function stageMarketSymbol(page: Page): Promise<string> {
  const heading = ((await page.locator("h2").first().textContent()) ?? "").trim();
  const symbol = AVAILABLE_ASSET_SYMBOLS.find(
    (candidate) => formatSecurityDisplaySymbol(candidate) === heading,
  );
  expect(symbol, `the stage heading "${heading}" names no known market`)
    .toBeTruthy();
  return symbol!;
}

// Leaves the Desk and comes back, which remounts AdvisorWorkspace (App.tsx
// renders it only while its tab is active) — so the stage is genuinely empty
// again and whatever it shows next was put there by the click under test, not
// left over from the scan.
async function leaveAndReturnToDesk(page: Page, width: number) {
  if (width < 1024) {
    const tabBar = page.locator('nav[aria-label="Levelflow"]');
    await tabBar.getByRole("button", { name: "Insights", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Insights", exact: true }))
      .toBeVisible();
    await tabBar.getByRole("button", { name: "Scan", exact: true }).click();
    return;
  }
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Insights", exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Desk", exact: true }).click();
}

for (const width of [1280, 375]) {
  test(`a Current trades card reopens its own stored setup on the stage (${width}px)`, async ({ page }) => {
    // Owner ruling, 2026-08-02: "Clicking on the trade in Current Trades should
    // load the same chart, why, levels, etc. in the center section as the scan
    // results section loads. The whole point of the Current Trades section is to
    // serve as a reliable reference for the trades we generate."
    //
    // What makes this a reference rather than a link is WHICH levels come back:
    // the stored ones. So the comparison is the card's own printed levels against
    // the stage's, rather than the numbers the scan showed a minute earlier —
    // those two can legitimately differ when a live position made the scan skip
    // its write (scanPersistence's skipped_live_position, the C2 guard), and the
    // card is the thing the owner is pointing at.
    //
    // 150s rather than the file's usual 120s: this walk carries a live scan's own
    // 90s ceiling AND two Desk/Insights crossings with a chart load on each side
    // of them, which is more after the scan than any other scan-driven spec here.
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: width < 1024 ? 812 : 800 });
    await page.goto("/");

    // Crypto's calendar never closes, so this is scannable whenever the suite
    // runs, and one group is one request against the analyzer's rate limit.
    await scopeScanToGroup(page, "Crypto");
    test.skip(
      !(await scanForSetupOnStage(page)),
      "No qualifying setup right now, so there is no trade to come back to.",
    );
    await expect(page.getByRole("heading", { name: "Why this setup" }))
      .toBeVisible();
    const symbol = await stageMarketSymbol(page);

    await leaveAndReturnToDesk(page, width);
    // The remount left the stage with no setup at all — spec §17m.1's own copy
    // for that state. Asserted rather than assumed: without it, a stage that
    // never cleared would satisfy every assertion below on leftovers.
    await expect(page.getByText("Scan to see the current limit setup."))
      .toBeVisible();

    if (width < 1024) {
      // Below lg the rail is the Trades tab, not a column (spec §17e/§17g).
      await page.locator('nav[aria-label="Levelflow"]')
        .getByRole("button", { name: /^Trades(,|$)/ }).click();
    }
    const rail = page.getByTestId("current-trades-rail");
    const card = rail.locator("button.rounded-lg")
      .filter({ hasText: symbol })
      .first();
    // Every qualifying setup persists (spec §17m.2) and a generated one is
    // Pending, which is a state that lives on this rail (spec §8) — so the card
    // must be here. A wait, not a skip: its absence is the §17m.2 divergence.
    await expect(card).toBeVisible({ timeout: 20_000 });
    const cardLevels = await card.locator("b").allTextContents();
    expect(cardLevels.length).toBeGreaterThan(0);

    await card.click();

    // The same expanded detail view a scan row opens: the market, its chart, the
    // ladder, and the why panel.
    await expect(
      page.getByRole("heading", {
        exact: true,
        name: formatSecurityDisplaySymbol(symbol),
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why this setup" }))
      .toBeVisible();
    await expect(page.getByText("Scan to see the current limit setup."))
      .toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expand chart" }))
      .toBeVisible();
    // The loading overlay legitimately covers the empty state (MarketChart draws
    // one or the other, never both), so the empty check has to come AFTER the
    // load settles — otherwise it greens a chart that is still fetching and then
    // resolves to no data. Same order as the Insights leg below.
    await expect(page.getByText("Loading market data")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText("No chart data available yet")).toHaveCount(0);

    // The stored levels, both surfaces printing the same numbers through the
    // same formatter: every level the card still lists (Entry drops off once
    // filled, Target 1 once banked — buildRemainingLevels) appears in the
    // ladder the stage just restored.
    const ladder = Object.values(await stageLadderValues(page));
    expect(ladder.length).toBeGreaterThan(0);
    for (const level of cardLevels) {
      expect(
        ladder,
        `the rail card printed ${level}, which the restored ladder does not`,
      ).toContain(level);
    }
  });

  test(`an Insights row reopens the whole setup, not just its chart (${width}px)`, async ({ page }) => {
    // Owner ruling, 2026-08-02: "Clicking on the trade in the Insights tab loads
    // the chart, but not the details below it. It should." The row used to hand
    // over a bare symbol, which reselected the market and left the stage's
    // analysis state null — chart above an empty ladder.
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: width < 1024 ? 812 : 800 });
    await page.goto("/");

    // Seeded the way a reader seeds it, so the ledger has a row inside its
    // default 30-day period whatever the account's history looks like.
    await scopeScanToGroup(page, "Crypto");
    test.skip(
      !(await scanForSetupOnStage(page)),
      "No qualifying setup right now, so there is no ledger row to reopen.",
    );

    if (width < 1024) {
      await page.locator('nav[aria-label="Levelflow"]')
        .getByRole("button", { name: "Insights", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Insights", exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: "Insights", exact: true }))
      .toBeVisible();

    // The newest row: the ledger is day-grouped newest first, and sorted newest
    // first within a day (buildInsightsGroups), so the scan above is at the top.
    const row = page.locator("tbody tr")
      .filter({ has: page.getByRole("button", { name: /^Open .+ in Advisor$/ }) })
      .first();
    await expect(row).toBeVisible();
    const cells = (await row.locator("td").allTextContents())
      .map((cell) => cell.trim());
    // Market · Side · Confidence · Entry · Stop · Target 1 · Target 2 · Result.
    expect(cells).toHaveLength(8);
    const [, , , entry, stop, target1, target2] = cells;

    await row.getByRole("button").click();

    // The chart — the half that already worked.
    await expect(page.getByRole("button", { name: "Expand chart" }))
      .toBeVisible();
    await expect(page.getByText("Loading market data")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText("No chart data available yet")).toHaveCount(0);

    // And the details below it — the half that did not. The ladder prints the
    // ledger's own numbers through the same formatter, so these compare directly.
    await expect(page.getByRole("heading", { name: "Why this setup" }))
      .toBeVisible();
    await expect(page.getByText("Scan to see the current limit setup."))
      .toHaveCount(0);
    const ladder = await stageLadderValues(page);
    expect(ladder["Limit entry"]).toBe(entry);
    expect(ladder["Stop loss"]).toBe(stop);
    // A non-laddered instrument stores no first target, and the sheet then draws
    // one plainly-labelled "Target" instead of the two-step pair (§7's ladder).
    if (target1 === "—") {
      expect(ladder["Target"]).toBe(target2);
    } else {
      expect(ladder["Target 1 · bank half"]).toBe(target1);
      expect(ladder["Target 2 · take-profit"]).toBe(target2);
    }
  });
}

// Q2-C2: useTradeSetups computed an error string no consumer read, so a failed
// history fetch arrived at both surfaces as `setups: []` — and each printed a
// factual claim about an account it had just failed to read ("No current
// trades.", "No setups have been logged yet."), with the Trades badge at zero.
// The unit guards pin the wiring; this fails the real request and reads what the
// two surfaces actually say, which is the only way to prove the claim is gone.
test("a failed history fetch says so on both surfaces instead of claiming an empty account (Q2-C2)", async ({ page }) => {
  await page.route("**/rest/v1/trade_setups*", (route) => route.abort());

  await page.goto("/");

  const rail = page.getByTestId("current-trades-rail");
  await expect(rail).toBeVisible();
  await expect(
    rail.getByText("Trade history could not load. Try again shortly."),
  ).toBeVisible();
  await expect(rail.getByText("No current trades.")).toHaveCount(0);

  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByText("Trade history could not load. Try again shortly."),
  ).toBeVisible();
  await expect(page.getByText("No setups have been logged yet.")).toHaveCount(0);
});

test("the trades rail force-refreshes outcomes on every Desk/Insights re-navigation, not just on mount", async ({ page }) => {
  // useTradeSetups.refreshTradeOutcomes multiplexes through the same
  // trade-analyzer function every other analyzer action uses, distinguished
  // only by its request body's `action`. Watching for that specific action
  // (rather than the shared URL alone) is what makes this check precise —
  // spec §8's force-refresh, bypassing the normal 60s throttle, "every time
  // the surface is shown, including re-navigation" (App.tsx's activeTab
  // effect fires on every transition into the Desk or Insights tab).
  const refreshRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/functions/v1/trade-analyzer")) {
      return;
    }
    const body = request.postDataJSON() as { action?: string } | null;
    if (body?.action === "refresh_outcomes") {
      refreshRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("current-trades-rail")).toBeVisible();
  await expect
    .poll(() => refreshRequests.length, {
      message: "expected the mount-time outcome refresh to fire",
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  const afterMount = refreshRequests.length;

  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Desk", exact: true }).click();
  await expect(page.getByTestId("current-trades-rail")).toBeVisible();

  await expect
    .poll(() => refreshRequests.length, {
      message: "expected re-navigation to trigger a fresh outcome refresh",
      timeout: 15_000,
    })
    .toBeGreaterThan(afterMount);
});

test("each ladder value copies independently, flipping its own button to a checked state", async ({ page }) => {
  // The ladder only exists once a scan has produced a setup — same
  // live-dependency and skip pattern as the receipt specs above.
  test.setTimeout(120_000);
  await page.goto("/");
  test.skip(
    !(await scanForSetupOnStage(page)),
    "No qualifying setup right now, so there are no ladder values to copy.",
  );
  await expect(page.getByRole("heading", { name: "Why this setup" }))
    .toBeVisible();

  // m1: handleCopy now awaits navigator.clipboard.writeText and only flips
  // to the ✓ state on resolve, so this genuinely exercises the clipboard
  // write rather than just a synchronous UI flip — playwright.config.ts
  // grants clipboard-read/clipboard-write so that write reliably resolves
  // under headless Chromium instead of silently rejecting.
  const originalLabels = await page
    .getByRole("button", { name: /^Copy / })
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label") ?? "")
    );
  expect(originalLabels.length).toBeGreaterThan(0);

  for (const fullLabel of originalLabels) {
    const fieldLabel = fullLabel.replace(/^Copy /, "");
    await page.getByRole("button", { name: fullLabel, exact: true }).click();
    // The ✓ reverts after 2s (handleCopy's own setTimeout) — a tighter
    // timeout than the file's default keeps this assertion inside that
    // window instead of racing a slow poll past it.
    await expect(
      page.getByRole("button", { name: `${fieldLabel} copied`, exact: true }),
    ).toBeVisible({ timeout: 1500 });
  }
});

test("Insights renders the setup ledger table, and no below-table blurb", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Insights", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();
  for (
    const column of [
      "Market",
      "Side",
      "Confidence",
      "Entry",
      "Stop",
      "Target 1",
      "Target 2",
      "Result",
    ]
  ) {
    await expect(
      page.getByRole("columnheader", { name: column, exact: true }),
    ).toBeVisible();
  }

  for (const label of ["Market", "Status", "Period"]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }

  // Spec §17c deletes spec §10's below-table sentence outright — the Guide
  // teaches it and the page shows it. Absence is checked here, on the surface
  // the owner read it on, alongside the source-level fragment guards in
  // tests/historyPanel.test.tsx.
  await expect(
    page.getByText("Every setup Levelflow generates is saved here"),
  ).toHaveCount(0);
  await expect(page.getByText("taken or not")).toHaveCount(0);

  // Spec §18: Attribution sits below the ledger with its four slice groups,
  // and it renders whatever the history holds — including nothing, so this
  // needs no setup of its own. Scoped to the section: two of its four group
  // labels ("Side", "Confidence") have exact twins in the ledger's own column
  // headers a few hundred pixels above, so a page-wide locator would be
  // ambiguous rather than wrong — the §17m.3 lesson, applied before it bites.
  const attribution = page.getByTestId("attribution");
  await expect(
    attribution.getByRole("heading", { name: "Attribution", exact: true }),
  ).toBeVisible();
  for (const group of ["Asset class", "Side", "Confidence", "Session"]) {
    await expect(attribution.getByText(group, { exact: true })).toBeVisible();
  }
});

// Spec §18 (amendment 2, owner 2026-08-02: "Can we let it involve the engine? If
// so, do it. I want accuracy."): the record band and Attribution read the
// LIFETIME record, and the presence checks above cannot tell a lifetime aggregate
// from one computed over the page — both render four groups. This one asserts
// VALUES the loaded page could not have produced: a single slice holding more
// resolved rows than the ledger's whole display window, every one of them older
// than the widest Period filter.
//
// The lifetime read is stubbed and the ledger's own read is not, which is what
// makes the two sources distinguishable on screen. The stub also arrives in
// PostgREST's real one-to-one shape — trade_outcomes as an OBJECT — so a lifetime
// read that skipped the shared normalizer (PR #186) would render these rows as
// unresolved and fail here rather than in production.
test("the record band and Attribution publish figures the ledger's page could not hold", async ({ page }) => {
  const RESOLVED_ROWS = LEDGER_WINDOW_ROWS + 4;
  const ancient = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
  const lifetimeRows = Array.from({ length: RESOLVED_ROWS }, (_, index) => ({
    confidence_score: 90,
    created_at: new Date(ancient.getTime() + index * 1000).toISOString(),
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    side: "buy",
    status: "filled",
    symbol: "XAUUSD",
    // Exactly the fields LIFETIME_SELECT asks for, in PostgREST's real
    // one-to-one shape: a stub that carried more than the query selects would
    // stop being the wire this read actually meets.
    trade_outcomes: {
      feedback: { realizedR: 1 },
      filled_at: ancient.toISOString(),
      outcome: "take_profit",
    },
  }));

  await page.route("**/rest/v1/trade_setups*", (route) => {
    // The ledger's read is the one that carries the analysis payload for the
    // Advisor handoff; the lifetime read selects none of it. That is the whole
    // difference between the two requests, and it is the discriminator here.
    if (route.request().url().includes("confluence")) {
      return route.continue();
    }
    return route.fulfill({
      body: JSON.stringify(lifetimeRows),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();

  // The record band's three lifetime figures (§10 as amended). "Setups this
  // week" stays the period stat it says it is, and every stubbed row is 200 days
  // old — so a band still reading the ledger's rows would print a nonzero count
  // here beside a live account's own week.
  const bandValue = (label: string) =>
    page.getByText(label, { exact: true }).locator("..").locator("p").first();
  await expect(bandValue("Money-positive")).toHaveText("100%");
  await expect(bandValue("Net R")).toHaveText(`+${RESOLVED_ROWS}.0R`);
  await expect(bandValue("Best market")).toHaveText("XAUUSD");
  await expect(bandValue("Setups this week")).toHaveText("0");

  // Attribution's own slices, read off the row's three figure cells: resolved
  // count, money-positive rate, net R.
  const attribution = page.getByTestId("attribution");
  for (const label of ["Metals", "Best"]) {
    const figures = attribution.getByText(label, { exact: true }).locator("..")
      .locator("span > span");
    await expect(figures.nth(0)).toHaveText(String(RESOLVED_ROWS));
    await expect(figures.nth(1)).toHaveText("100%");
    await expect(figures.nth(2)).toHaveText(`+${RESOLVED_ROWS}.0R`);
  }

  // One slice holding LEDGER_WINDOW_ROWS + 4 resolved rows is the assertion the
  // page cannot satisfy: the ledger's own read stops at the window, and it is
  // still reading it — the table below renders from its own unstubbed request.
  await expect(
    page.getByRole("columnheader", { name: "Result", exact: true }),
  ).toBeVisible();
});

test("a qualifying market scan persists into Insights, not just onto the scan rail", async ({ page }) => {
  // Spec §9 / §17m.2: every generated setup is persisted, scan path included —
  // and since §17m the Scan column is the ONLY door, so this is the one spec
  // standing between a working engine and a product that shows setups it never
  // saved. It depends on the live scan qualifying at least one market right
  // now, so — like the receipt tests above — it skips honestly rather than pin
  // behavior on live market conditions.
  //
  // What it does NOT do any more is settle for an intersection. The previous
  // form compared the scan's symbols against the whole 80-row ledger and
  // passed if any one of them appeared — which rows left by earlier runs and by
  // the review path satisfy on their own. It passed green through the live
  // deploy run in which the owner's own scan saved nothing (2026-08-01). The
  // contract below is the honest one: the server reports what it wrote, the
  // numbers must balance, and every qualifying market must be in the ledger.
  test.setTimeout(120_000);
  await page.goto("/");

  // One click is one scan, and since the 2026-08-02 CPU failures a scan is a
  // fan-out of request-sized chunks (src/lib/scanBatching.ts). EVERY chunk's
  // response is collected here, because the contract below is about the scan,
  // and a scan missing a chunk is a failed scan rather than a smaller one.
  //
  // Matched on the ACTION, not just the URL: the Desk's own mount fires a
  // refresh_outcomes call at the same endpoint, and "a POST to trade-analyzer"
  // would collect that one too.
  const scanResponses: Response[] = [];
  page.on("response", (response) => {
    if (
      response.url().includes("/functions/v1/trade-analyzer") &&
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes("scan_opportunities")
    ) {
      scanResponses.push(response);
    }
  });
  // What this click owes, derived from the same source the app derives it from
  // — the availability-filtered universe, partitioned by the same function
  // AdvisorWorkspace's scan calls. A hard count, not a floor: fewer means the
  // fan-out dropped a request, more means it sent one twice. Read once, right
  // before the click, since the workspace computes its own list at render time
  // and a market crossing an open/close boundary in between would move both.
  const expectedChunkLists = chunkScanSymbols(
    filterSymbolsByAvailability(AVAILABLE_ASSET_SYMBOLS, new Date()),
  );
  const expectedChunks = expectedChunkLists.length;
  const expectedScanned = expectedChunkLists.flat().length;
  expect(expectedChunks).toBeGreaterThan(0);

  // Scoped to the rail rather than the page: the mobile tab bar carries a
  // "Scan" tab of its own (hidden at this desktop viewport, still in the DOM),
  // and scoping is what keeps the rail's action unambiguous whatever the button
  // is called.
  await page.getByTestId("market-scan-rail")
    .getByRole("button", { name: "Scan", exact: true }).click();

  // Q4-C1: read the scan's own network status before trusting anything the
  // UI renders about it. MarketScanPanel shows the same "could not complete"
  // copy for a 429 as for any other provider failure — the app has no way to
  // tell them apart, so a skip driven by that text can't either. This is
  // exactly the loophole that let a rate-limit collision between spec files
  // read as a quiet market and ship green (see this file's own history,
  // documented below). playwright.config.ts now runs analyzer-abuse.spec.ts
  // in its own project, strictly after this one, so this should never fire —
  // if it does, that guarantee broke, and this must fail, not skip.
  //
  // Every chunk, not the first: one 429 among the rest's 200s is exactly the
  // partial scan this suite must never read as a quiet market.
  await expect
    .poll(() => scanResponses.length, {
      message: `expected ${expectedChunks} scan chunk request(s) for one Scan click`,
      timeout: 90_000,
    })
    .toBe(expectedChunks);
  expect(
    scanResponses.map((response) => response.status()),
    "every chunk of the scan must return 200 — a 429 means the suite's " +
      "live-user requests collided despite playwright.config.ts's project " +
      "chain; any other status is a real server failure. Neither may reach " +
      "the skip path below, which is reserved for a scan that succeeded and " +
      "found a quiet market",
  ).toEqual(Array.from({ length: expectedChunks }, () => 200));

  // Scoped by testid since spec §16 deleted the heading this used to locate.
  const scanSection = page.getByTestId("market-scan-rail");
  // Every finished scan reports what it checked — the count line — or says it
  // could not complete. That pair is unconditional, so it is waited for hard:
  // neither arriving means the locator rotted or the scan never returned, which
  // is a defect, not a quiet market. Whether anything qualified is the market's
  // business, and that is the second skip.
  const countLine = scanSection.getByText(/\d+ scanned/);
  const scanFailed = scanSection.getByText(
    "Market scan could not complete. Try again shortly.",
  );
  await expect(countLine.or(scanFailed)).toBeVisible({ timeout: 90_000 });
  test.skip(
    await isVisibleWithin(scanFailed, 1_000),
    "The market scan could not complete, so there is nothing new to check for in Insights.",
  );
  const candidateRow = page.getByText(/^(Buy|Sell) · confidence \d+$/).first();
  test.skip(
    !(await isVisibleWithin(candidateRow, 1_000)),
    "No market qualified on this scan, so there is nothing new to check for in Insights.",
  );

  // The server's own account of this scan (scanPersistence.ts): every
  // qualifying setup is written, skipped for a live position (C2 — a scan must
  // never rewrite a live trade), or FAILED. The three must add up to what
  // qualified, nothing may fail, and a scan that qualified anything must have
  // written at least the markets it did not skip.
  //
  // The identity is per request and the scan is several requests, so the sums
  // are what the reader's rail is showing — the same arithmetic
  // src/lib/scanBatching.ts's mergeScanResponses does to build the one result
  // the UI renders.
  const chunkBodies = await Promise.all(
    scanResponses.map((response) =>
      response.json() as Promise<{
        persistence?: {
          attempted: number;
          failed: number;
          persisted: number;
          skipped: number;
        };
        qualified?: number;
        scanned?: number;
      }>
    ),
  );
  const scanBody = {
    qualified: chunkBodies.reduce(
      (total, chunk) => total + (chunk.qualified ?? 0),
      0,
    ),
    scanned: chunkBodies.reduce((total, chunk) => total + (chunk.scanned ?? 0), 0),
  };
  expect(
    chunkBodies.every((chunk) => chunk.persistence),
    "a scan chunk carries no persistence report — spec §17m.2",
  ).toBe(true);
  const persistence = chunkBodies.reduce(
    (total, chunk) => ({
      attempted: total.attempted + chunk.persistence!.attempted,
      failed: total.failed + chunk.persistence!.failed,
      persisted: total.persisted + chunk.persistence!.persisted,
      skipped: total.skipped + chunk.persistence!.skipped,
    }),
    { attempted: 0, failed: 0, persisted: 0, skipped: 0 },
  );
  // Every market the click asked about was actually attempted — no chunk
  // quietly scanned a shorter list than it was sent.
  expect(scanBody.scanned).toBe(expectedScanned);
  expect(persistence.attempted).toBe(scanBody.qualified);
  expect(persistence.persisted + persistence.skipped + persistence.failed)
    .toBe(persistence.attempted);
  expect(
    persistence.failed,
    "the scan failed to persist part of what it showed (see analyzer_events)",
  ).toBe(0);
  expect(
    persistence.persisted,
    `the scan qualified ${scanBody.qualified} markets and wrote none`,
  ).toBe(persistence.attempted - persistence.skipped);

  // …and the same claim from the reader's seat. Every qualifying market must be
  // in the ledger; the only exemption is the live-position skip the response
  // itself declares, and it is quantified, never assumed.
  const scannedSymbolLabels = (
    await scanSection
      .locator("span.truncate.font-bold.text-ink")
      .allTextContents()
  ).map((label) => label.trim()).filter(Boolean);
  expect(scannedSymbolLabels.length).toBeGreaterThan(0);
  expect(scannedSymbolLabels.length).toBe(scanBody.qualified);

  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();

  // Insights' Market column renders the raw ticker (e.g. "EURUSD"), while the
  // scan rail's row shows the display form (e.g. "EUR/USD", spec §16's mock
  // row) — the "Open {symbol} in Advisor" row button's aria-label is the
  // stable, parseable link between the two views, mapped through the same
  // formatter the rail row itself uses. The ledger's own fetch is async and
  // the heading becoming visible doesn't guarantee its rows have landed yet,
  // so evaluateAll (which reads the DOM once, with no retry) waits behind a
  // poll for at least one row first.
  const openInAdvisorButtons = page.getByRole("button", {
    name: /^Open .+ in Advisor$/,
  });
  await expect
    .poll(() => openInAdvisorButtons.count(), {
      message: "expected the Insights ledger to finish loading rows",
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  const rawSymbols = await openInAdvisorButtons
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label") ?? "")
    ).then((labels) =>
      labels.map((label) =>
        label.replace(/^Open /, "").replace(/ in Advisor$/, "")
      )
    );
  const insightsLabels = rawSymbols.map((symbol) =>
    formatSecurityDisplaySymbol(symbol)
  );
  const missing = scannedSymbolLabels.filter((label) =>
    !insightsLabels.includes(label)
  );
  // At most the markets the server said it skipped may be missing — and if the
  // server skipped none, none may be missing at all.
  expect(
    missing.length,
    `qualifying markets absent from the Insights ledger: ${
      missing.join(", ")
    } (the scan reported ${persistence.skipped} live-position skip(s))`,
  ).toBeLessThanOrEqual(persistence.skipped);

  // §17m supersedes I1: every generated setup is a pending order, so the
  // scan's freshly persisted batch must also reach the Current trades rail
  // (owner-observed miss, 2026-08-01: three trades in Insights, zero in the
  // rail). Back on the Desk, the rail's auto-refresh-on-show plus the batch
  // just written means at least one Pending chip — unless nothing was newly
  // persisted this run (every qualifier a live-position skip).
  if (persistence.persisted > 0) {
    await page.getByRole("button", { name: "Desk", exact: true }).click();
    const rail = page.getByTestId("current-trades-rail");
    await expect(rail).toBeVisible();
    await expect
      .poll(() => rail.getByText("Pending", { exact: true }).count(), {
        message:
          "expected the scan's persisted setups to reach the Current trades rail as Pending",
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
  }
});

// Spec §19d/§19f: one presence check per new surface, at 375px and 1280px.
// With no saved account the ladder has four rows and no Size row; with one
// active, five rows and either a number or one of §19e's four words. Exact
// locators — the substring twin lives page-wide (PR #147). §19e's vocabulary
// comes from the app's own constant rather than a copy of it: a fifth word,
// or a reworded one, must fail this spec by rendering something the list
// does not carry, not pass because the list was edited to agree.
//
// §19 retrofit (Task 4 review, fix round 1): this spec used to drive the
// retired single-selection walk — a "None" sentinel on one Program select,
// with Account size/Stage/Risk per trade/Drawdown appearing only once a
// program was chosen. Amendment 18 replaced that surface with the
// confirmed-accounts list above a seven-select catalog walk that is never
// itself dormant (every field renders from first paint; there is no "None").
// What §19d's presence check now means: the LADDER's Size row still keys off
// whether the reader has a priced account, but "priced account" is decided
// by `activeAccountOf(profile)` (src/lib/profile.ts) rather than by the six
// retired profile columns this file used to write through `selectOption`.
//
// Task 5 (docs/superpowers/plans/2026-08-03-s19-retrofit.md, "Task 5: The
// Size row and the Desk read the active account") has since switched
// `SizeRow` and `AdvisorWorkspace`'s `brokerQuotes` dormancy over to
// `activeAccountOf(profile)` — this spec now asserts real, shipped behavior
// rather than a forward-registered target. It still cannot run live in every
// environment (this suite's own top-of-file `test.skip` gates on Supabase
// and dedicated-test-user credentials that are not available everywhere),
// which is why `npm run check` (tsconfig.tests.json's "tests" include) and
// `npx playwright test --list` are the gates every environment can run
// regardless of credentials.
const SIZE_STATE_WORD_LIST: string[] = Object.values(SIZE_STATE_WORDS);

async function openProfile(page: Page, width: number) {
  if (width < 1024) {
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Profile" }).click();
    return;
  }
  await page.getByRole("button", { name: "Profile", exact: true }).click();
}

// The way back to the ladder, which is a different control per platform: below lg
// the tab bar's Scan tab, at ≥lg the nav's Desk button. One helper because the
// walk makes the trip twice and the branch is not the thing being proved.
async function showDesk(page: Page, width: number) {
  if (width < 1024) {
    await page.locator('nav[aria-label="Levelflow"]').getByRole("button", {
      exact: true,
      name: "Scan",
    }).click();
    return;
  }
  await page.getByRole("button", { exact: true, name: "Desk" }).click();
}

async function openBrokerProfile(page: Page, width: number) {
  await openProfile(page, width);
  const profile = page.getByTestId("profile-panel");
  await expect(profile).toBeVisible();
  return profile;
}

// §19 retrofit: removes every saved account, waiting for each write to land
// before removing the next — the multi-account sibling of the retired
// resetProgramToNone.
//
// The two viewport legs below are separate tests sharing one live profile,
// and a saved account is a server row rather than page state — so whatever
// one leg leaves there is the next leg's opening state. Run 30773120782 (the
// retired helper's own finding) is what skipping this costs: a stale account
// from one leg becomes the next leg's unwanted opening state.
//
// Amendment 18 removed both the "None" sentinel and any deactivate control —
// activating never un-activates, and removing an account is the only write
// that can clear `active_broker_account_id` (the FK's on-delete-set-null,
// per profile.ts's activeAccountOf comment). "No saved accounts" is
// therefore the only reachable dormant state, so this helper drains the
// list rather than resetting a single field.
async function removeAllAccounts(page: Page, width: number) {
  const profile = await openBrokerProfile(page, width);
  for (;;) {
    const removeButtons = profile.getByRole("button", { name: "Remove" });
    const remaining = await removeButtons.count();
    if (remaining === 0) {
      return profile;
    }
    await removeButtons.first().click();
    await expect(removeButtons).toHaveCount(remaining - 1);
  }
}

// §19 retrofit: builds a draft through the seven-select catalog walk and
// saves it, then activates the new row with a second, separate tap — never
// a same-handler save-then-activate chain. activateBrokerAccount closes
// over `profile` at render time (Task 2b's review), so calling it
// immediately after saveBrokerAccount in the same handler would use the
// PRE-SAVE closure and falsely refuse the id it just created; App.tsx wires
// no such chain, and this helper does not either.
//
// Market defaults to the catalog's first entry (Forex), which already lists
// E8 One first, so only the Program select needs a value for this walk's
// original caller — and choosing it resets Account size to E8 One's own
// first ladder rung, `$5,000`, which is what the saved row's own label
// renders. marketLabel is optional and additive (Task 7 fix round, the
// switcher legs below): passing it selects Market first — needed for a
// program line outside Forex, e.g. `"Futures"` for E8 Signature Futures —
// and every existing call site, which never passes it, keeps its exact
// original behavior.
async function addAndActivateAccount(
  page: Page,
  width: number,
  programLabel: string,
  accountSizeLabel: string,
  marketLabel?: string,
) {
  const profile = await openBrokerProfile(page, width);
  // The walk's options render through optionCaps (the owner's caps ruling —
  // a real toUpperCase() in the DOM, not a CSS transform), and Playwright's
  // selectOption label matching is case-sensitive: the helper must match
  // the DOM's actual text, so the labels uppercase here. Proven live
  // 2026-08-04 — the mixed-case form waited out the full timeout.
  if (marketLabel) {
    await profile.getByLabel("Market", { exact: true })
      .selectOption({ label: marketLabel.toUpperCase() });
  }
  await profile.getByLabel("Program", { exact: true })
    .selectOption({ label: programLabel.toUpperCase() });
  await profile.getByRole("button", { name: "Add account" }).click();
  const row = profile.getByRole("button", {
    exact: true,
    name: `${programLabel} · ${accountSizeLabel}`,
  });
  await expect(row).toBeVisible();
  await row.click();
  return profile;
}

for (const width of [375, 1280]) {
  test(`the ladder grows one Size row only once an account is active (§19d, amendment 18, ${width}px)`, async ({ page }) => {
    // Two scans, and the helper allows each 90s, so the budget is stated at what
    // the walk can actually cost rather than at what a fast one does. Both scans
    // in the live run this shape was written against finished in 7.5s — and both
    // are Crypto-scoped now (one request of seven markets), so 90s is headroom
    // rather than a real expectation.
    test.setTimeout(240_000);
    await page.setViewportSize({ height: 812, width });
    await page.goto("/");

    // This leg sets its own opening state rather than inheriting the other's.
    // The reload is the part a DOM assertion cannot stand in for: it drops every
    // piece of client state and re-reads the accounts list from the server, so
    // "no saved accounts" here is the persisted value and not a page this
    // session happened to leave looking right.
    await removeAllAccounts(page, width);
    await page.reload();

    // With no saved accounts — a fresh reader's own opening state — Profile's
    // Broker row carries the chip, an empty accounts list, and the seven-select
    // walk: unlike the retired single-selection controls, the walk itself is
    // never dormant, so every field is visible even with nothing saved yet.
    const profile = await openBrokerProfile(page, width);
    for (
      const label of [
        "Market",
        "Program",
        "Platform",
        "Account size",
        "Stage",
        "Risk per trade",
        "Drawdown",
      ]
    ) {
      await expect(profile.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expect(profile.getByRole("button", { name: "Remove" })).toHaveCount(0);

    // Each ladder claim scans for its own setup, and the account is saved and
    // activated between them rather than before both. Two reasons, one per live
    // failure this shape answers. AdvisorWorkspace "only exists in the tree
    // while its tab is active, so switching tabs away and back remounts it
    // fresh" (App.tsx), so a setup staged before a Profile trip is gone when the
    // walk returns — which is why the first live run read the Size row off a
    // stage showing "No setup yet". And activating an account only after the
    // absence leg has cleared means the earlier of the two skip gates cannot
    // exit holding one: a quiet market is a legitimate state, and it must not
    // become the next leg's opening state, nor a fifth row in visual-proof's
    // captures.
    //
    // A scan is how a setup arrives (§17m.1), so the walk skips honestly when
    // nothing qualifies.
    //
    // Scoped to Crypto rather than All markets, on both of this walk's scans.
    // What these two legs need is A ladder on the stage — any market's — and
    // since the scan became a fan-out of chunked requests, All markets costs six
    // rate-limit claims where one group costs one. Four such scans across the two
    // width legs was 24 of the 40/60s budget spent proving nothing about breadth.
    // Crypto never closes, so the scope also removes a closed-market skip.
    await showDesk(page, width);
    await scopeScanToGroup(page, "Crypto");
    if (!(await scanForSetupOnStage(page))) {
      test.skip(true, "No Crypto market qualified in this window.");
      return;
    }

    // No Size row at all: not a dash, not an empty value, not a prompt. The
    // ladder is on stage first, and only then is the row absent from it — without
    // that order the absence is unfalsifiable, since an empty stage has no Size
    // row either and says nothing about what an active account controls.
    await expect(page.getByText("Limit entry", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Size · (lots|contracts)$/)).toHaveCount(0);

    // Now save and activate an account. E8 One is a CFD line, so its unit is
    // lots — the family answers the label, never the market that qualified,
    // and a blocked row carries the same label as a priced one
    // (broker/sizing.ts sizeUnitFor). SizeRow reads activeAccountOf(profile)
    // (Task 5), so this activation is what the ladder now keys off.
    await addAndActivateAccount(page, width, "E8 One", "$5,000");

    await showDesk(page, width);
    // Same scope as the absence leg: the Desk remounted on the way back from
    // Profile, so the scope reset to All markets with it.
    await scopeScanToGroup(page, "Crypto");
    if (!(await scanForSetupOnStage(page))) {
      // Past this point the account is active, so the skip path hands the
      // profile back to no-saved-accounts before it leaves.
      await removeAllAccounts(page, width);
      test.skip(true, "No Crypto market qualified in this window.");
      return;
    }

    // Five rows now, and the fifth is the Size row with its unit in the label.
    await expect(page.getByText("Limit entry", { exact: true })).toBeVisible();
    const sizeLabel = page.getByText("Size · lots", { exact: true });
    await expect(sizeLabel).toBeVisible();
    const sizeRow = sizeLabel.locator("..");
    const rendered = (await sizeRow.innerText()).replace("Size · lots", "").trim();
    // A number or one of the four words — never a fifth voice, never a dash.
    const isNumber = /^[\d.,]+$/.test(rendered.split("\n")[0].trim());
    expect(
      isNumber || SIZE_STATE_WORD_LIST.some((word) => rendered.includes(word)),
      `the Size row rendered ${JSON.stringify(rendered)}`,
    ).toBe(true);
    expect(rendered).not.toContain("—");

    // Hand the profile back on the way out. The next leg normalizes anyway, so
    // this is politeness rather than the guarantee — but it is also what keeps
    // a leftover account out of visual-proof, which runs after this project and
    // before the cleanup teardown that resets the selection.
    await removeAllAccounts(page, width);
  });
}

// §19 retrofit, Task 7 fix round (amendment 18, controller ruling — "the
// surface ships with executed coverage or not at all"). Every other broker
// spec in this file drives Profile's own accounts list; this is the one leg
// that drives the masthead chip and its popup directly, since that surface
// has its own machinery (ScopeMenu's own portal/sheet split, reapplied)
// nothing else here exercises live. A sibling of the §19d legs above, not a
// replacement — those stay untouched.
//
// Two saved accounts, deliberately of different classifications — E8 One
// (forex) and E8 Signature Futures (futures) — rather than two same-market
// accounts: sizeUnitFor keys on programLine's family alone
// (src/lib/broker/sizing.ts), so switching between them flips the Size
// row's own unit label ("Size · contracts" <-> "Size · lots"), a re-scope
// signal that needs no live price to be meaningful — the same technique
// §19d's own Size-row read already uses, reapplied to prove the switch
// rather than the mere presence of an active account.
for (const width of [375, 1280]) {
  test(`the account switcher chip drives activation and the Desk re-scopes with it (§19 retrofit, amendment 18, ${width}px)`, async ({ page }) => {
    // One scan, not §19d's two: this leg never needs the "no account
    // active" absence state, so there is one fewer live-market wait to
    // budget for.
    test.setTimeout(150_000);
    await page.setViewportSize({ height: width < 1024 ? 812 : 800, width });
    await page.goto("/");

    // Same reasoning as removeAllAccounts' own header comment: a saved
    // account is a server row, not page state, so this leg's opening state
    // is set explicitly rather than inherited from whatever a prior leg or
    // a prior run left behind.
    await removeAllAccounts(page, width);
    await page.reload();

    const oneLabel = "E8 | Forex | 5K";
    const futuresLabel = "E8 | Futures | 25K";

    // Futures first, One second — the ORDER is load-bearing since Task 8
    // (amendment 13): a Futures-classified active account hides the Crypto
    // group from the scope menu, and Crypto is the one calendar this suite
    // can scan in any window. So the account that ends ACTIVE here is E8
    // One (forex — Crypto visible), the scan runs under it, and the
    // switch TO the futures account happens through the chip afterwards,
    // which is exactly the surface this leg exists to prove: chip
    // switching re-scopes live without remounting the Desk, so the staged
    // Crypto setup survives the switch (a Profile round trip would have
    // unmounted AdvisorWorkspace and lost it — see the ladder legs' own
    // remount note above).
    await addAndActivateAccount(
      page,
      width,
      "E8 Signature Futures",
      "$25,000",
      "Futures",
    );
    // BrokerAccountsSection never removes a row on Add, so the futures
    // account stays saved — the switcher needs two SAVED accounts to draw
    // two rows, and an ACTIVE marker on only the one this second call
    // activates.
    await addAndActivateAccount(page, width, "E8 One", "$5,000");

    await showDesk(page, width);
    await scopeScanToGroup(page, "Crypto");
    if (!(await scanForSetupOnStage(page))) {
      await removeAllAccounts(page, width);
      test.skip(true, "No Crypto market qualified in this window.");
      return;
    }

    // The ladder is already keyed off E8 One — the forex account this leg
    // just activated — before the switcher touches anything: the same §19d
    // technique (a unit label needs no live price to be meaningful).
    await expect(page.getByText("Size · lots", { exact: true }))
      .toBeVisible();

    const header = page.getByTestId(
      width < 1024 ? "mobile-header" : "desktop-header",
    );
    // Matched by content ("|" is structural to every possible formula
    // label, TASK 6 VERDICT) rather than by the account's current label:
    // this same locator is reused after (d) switches the active account,
    // by which point its accessible name has changed to the futures
    // account's own.
    // MobileAccountMenu's own trigger carries no text at all (an icon
    // only), so this cannot collide with it.
    const trigger = header.getByRole("button").filter({ hasText: "|" });

    // (a) the chip renders the active account's piped label, ALL CAPS by a
    // CSS transform over the byte-intact formula underneath (TASK 6
    // VERDICT) — checked as two separate, unambiguous facts rather than
    // through a locator's own name-matching semantics: the raw DOM text is
    // the mixed-case catalog formula, and the element's own computed style
    // is what makes it read as capitals.
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect((await trigger.textContent())?.trim()).toBe(oneLabel);
    expect(
      await trigger.evaluate((el) => getComputedStyle(el).textTransform),
    ).toBe("uppercase");

    // (b) tap/click opens the right container for this width — the
    // anchored popup at >=lg, the §17g sheet below it, its pinned head
    // carrying the fix-round title this leg exists partly to prove.
    await trigger.click();
    if (width < 1024) {
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Accounts", { exact: true }))
        .toBeVisible();
    } else {
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // (c) rows list both saved accounts in the piped formula, ACTIVE on
    // the active one only, Manage accounts at the foot.
    const items = menu.getByRole("menuitem");
    await expect(items).toHaveCount(3);
    const oneRow = menu.getByRole("menuitem").filter({ hasText: oneLabel });
    const futuresRow = menu.getByRole("menuitem").filter({
      hasText: futuresLabel,
    });
    await expect(oneRow).toBeVisible();
    await expect(futuresRow).toBeVisible();
    // The byte-exact read belongs to the row WITHOUT the badge: the active
    // row's textContent is its label concatenated with the Active badge's
    // own text, so exactness there would assert a join, not a label.
    expect((await futuresRow.textContent())?.trim()).toBe(futuresLabel);
    await expect(oneRow).toContainText(/active/i);
    await expect(futuresRow).not.toContainText(/active/i);
    const itemNames = await items.evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim())
    );
    expect(itemNames.at(-1)).toMatch(/manage accounts/i);

    // (d) selecting a different account closes the menu, and the Desk
    // re-scopes live through the same reactivity Task 5 wired
    // (activeAccountOf(profile), read plain in SizeRow —
    // tests/deskComposition.test.ts pins that read): the unit label flips
    // from E8 One's "lots" to the futures account's "contracts" with no
    // reload — and the staged Crypto setup SURVIVES the switch, which is
    // the amendment-18 claim in one assertion: the chip re-scopes the
    // Desk without remounting it. (Amendment 13 resets the SCOPE control
    // to All markets under the futures account — the stage is not the
    // scope, and sizeUnitFor keys on the account family alone.)
    await futuresRow.click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Size · contracts", { exact: true }))
      .toBeVisible();

    // Task 8 fix round 1 (review finding on 22e5fc1): the chip switch above
    // re-scopes the Desk live, and the amendment-13 reset effect that fires
    // with it now clears the stale Crypto scan along with the scope it was
    // keyed to — not scope alone. Before the fix, scanResult survived the
    // switch untouched: filterMarketScanCandidatesByScope's "all" case
    // passes every candidate through unconditionally, so the Crypto rows
    // this leg just scanned (unreachable and untradeable under a futures
    // account) would still be sitting in the rail, fully clickable, under a
    // scanned/qualified count line that no longer honestly described them.
    // scanForSetupOnStage's own row locator is reused here: the same
    // pattern that found a row to click above must now find none at all —
    // the rail is back in its un-scanned state, same as it renders before
    // any scan ever ran.
    await expect(
      scanSurface(page).getByText(/^(Buy|Sell) · confidence \d+$/),
    ).toHaveCount(0);

    // (e) focus returns to the trigger on close — the file's own
    // focus-return idiom (see the Expand-chart dialog's Escape/Close
    // checks above).
    await expect(trigger).toBeFocused();

    await removeAllAccounts(page, width);
  });
}

// The reload notice, from the only direction a browser test can honestly take it:
// it must never appear when nothing has been deployed under the tab.
//
// The positive case is out of reach here, and deliberately so. The notice fires on
// a mismatch between the bundle this tab is running (import.meta.url in the entry
// module) and the bundle the origin's "/" now names — and this project runs against
// the dev server, whose entry is `/src/main.tsx`, so neither side is a built bundle
// and the comparison is unknown against unknown, which never fires (that rule is
// real tested behaviour in tests/deployedVersion.test.ts). Fulfilling the
// detector's own fetch with invented HTML would prove the mock, not the deploy. So
// the parse and the compare are unit-tested, the hook's shape is source-pinned
// (tests/hooks.test.ts), and what a browser proves is the half that protects the
// reader: at both widths, in normal operation, the sentence is nowhere.
for (const width of [375, 1280]) {
  test(`the reload notice never fires when the tab is current (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ height: width < 1024 ? 812 : 800, width });

    // Every version check, counted as its RESPONSE lands, so each assertion below
    // sits behind a check that actually answered rather than in a race with one. A
    // fetch of "/" is a check; the document navigation is not (resourceType
    // "document"), which is what tells the two apart.
    const checks: number[] = [];
    page.on("response", (response) => {
      if (
        response.request().resourceType() === "fetch" &&
        new URL(response.url()).pathname === "/"
      ) {
        checks.push(response.status());
      }
    });

    await page.goto("/");

    // The masthead is up, so the notice's own row would be up with it.
    await expect(
      page.getByTestId(width < 1024 ? "mobile-header" : "desktop-header"),
    ).toBeVisible();

    async function wake() {
      await page.evaluate(() => {
        const show = (state: string) => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => state,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        };
        show("hidden");
        show("visible");
      });
    }

    // One on mount, then one per wake — and the third is what makes the second
    // provably finished rather than merely started. The hook holds an in-flight
    // flag that only its own `finally` clears, and that `finally` runs after the
    // comparison and any state it sets, so a third request cannot exist unless the
    // second check had already compared and declined to raise anything. No
    // arbitrary settle: the causality is the wait.
    await expect.poll(() => checks.length).toBe(1);
    await wake();
    await expect.poll(() => checks.length).toBe(2);
    await wake();
    await expect.poll(() => checks.length).toBe(3);
    expect(checks).toEqual([200, 200, 200]);

    await expect(
      page.getByText("Levelflow has updated. Reload to continue."),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Levelflow has updated. Reload to continue.",
      }),
    ).toHaveCount(0);
  });
}
