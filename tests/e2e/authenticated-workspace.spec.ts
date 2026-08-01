import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { marketAvailability } from "../../src/lib/marketHours";
import {
  AVAILABLE_ASSET_GROUPS,
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

test.beforeEach(async ({ page }) => {
  const client = createClient(supabaseUrl!, supabaseKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
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

// Spec §17m.1: "All trades originate from the Scan column — no other path."
// The stage's Review button is deleted, so every spec that needs a setup on the
// stage now gets one the way a reader does: scan, then take the strongest
// qualifying market. Returns false when the scan could not complete or nothing
// qualified — both legitimate live-market states, so callers skip honestly,
// exactly as they did when a Review of one market could come back empty.
async function scanForSetupOnStage(page: Page): Promise<boolean> {
  const rail = page.getByTestId("market-scan-rail");
  await rail.getByRole("button", { name: "Scan", exact: true }).click();
  // Every finished scan says what it checked or says it could not complete.
  // That pair is unconditional and waited for hard: neither arriving is rot.
  const countLine = rail.getByText(/\d+ scanned/);
  const scanFailed = rail.getByText(
    "Market scan could not complete. Try again shortly.",
  );
  await expect(countLine.or(scanFailed)).toBeVisible({ timeout: 90_000 });
  if (await scanFailed.isVisible()) {
    return false;
  }
  const strongest = rail.getByText(/^(Buy|Sell) · confidence \d+$/).first();
  if (!(await strongest.isVisible())) {
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
    has: page.getByLabel("Chart view"),
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
  // Insights is where a document-level horizontal overflow would actually
  // start: its ledger is the app's one wide (min-w) table, now flat inside a
  // px-4 scroll region. The REGION x-scrolling is by design on a phone; the
  // DOCUMENT doing so is the §17g defect this pins.
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

  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
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
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
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

test("Expand chart opens the same chart full-viewport on mobile, and only on mobile", async ({ page }) => {
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

// Spec §17m.3, the vertical budget: "chart ≈1/3 of the region's height, why
// ≤1/3 …, the setup ladder gets the majority; the whole stage should fit the
// region without scrolling where viewport allows." Only a browser can say, and
// it has to hold at more than one height — so both of the ruling's own
// viewports are walked, and every number is reported in the failure message.
test("the Desk stage fits its region at 1280x800 and 1440x900 (§17m.3)", async ({ page }) => {
  for (const [width, height] of [[1280, 800], [1440, 900]] as const) {
    await page.setViewportSize({ height, width });
    await page.goto("/");
    await expect(page.getByTestId("current-trades-rail")).toBeVisible();
    await expect(page.getByLabel("Chart view")).toBeVisible();

    const stage = await page.evaluate(() => {
      const select = document.querySelector<HTMLElement>(
        '[aria-label="Chart view"]',
      )!;
      const section = select.closest("section")!;
      const column = section.parentElement!;
      const chart = section.querySelector<HTMLElement>(".basis-\\[32\\%\\]")!;
      const sheet = section.querySelector<HTMLElement>(".border-t-0")!;
      return {
        chartHeight: chart.getBoundingClientRect().height,
        columnHeight: column.clientHeight,
        columnScrollHeight: column.scrollHeight,
        headHeight: section.firstElementChild!.getBoundingClientRect().height,
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
    expect(stage.sheetHeight / stage.columnHeight, where).toBeGreaterThan(0.45);
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
    await scanFailed.isVisible(),
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
  const firstCard = rail.locator("article").first();
  await expect(emptyState.or(firstCard)).toBeVisible();
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

  // The scan's own response, read as it lands: the server's persistence
  // report is the only place "qualified 6, wrote 0" is visible, and reading it
  // here is what makes this spec able to fail for the owner's reason.
  const scanResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/functions/v1/trade-analyzer") &&
      response.request().method() === "POST",
    { timeout: 90_000 },
  );
  // Scoped to the rail rather than the page: the mobile tab bar carries a
  // "Scan" tab of its own (hidden at this desktop viewport, still in the DOM),
  // and scoping is what keeps the rail's action unambiguous whatever the button
  // is called.
  await page.getByTestId("market-scan-rail")
    .getByRole("button", { name: "Scan", exact: true }).click();

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
    await scanFailed.isVisible(),
    "The market scan could not complete, so there is nothing new to check for in Insights.",
  );
  const candidateRow = page.getByText(/^(Buy|Sell) · confidence \d+$/).first();
  test.skip(
    !(await candidateRow.isVisible()),
    "No market qualified on this scan, so there is nothing new to check for in Insights.",
  );

  // The server's own account of this scan (scanPersistence.ts): every
  // qualifying setup is written, skipped for a live position (C2 — a scan must
  // never rewrite a live trade), or FAILED. The three must add up to what
  // qualified, nothing may fail, and a scan that qualified anything must have
  // written at least the markets it did not skip.
  const scanBody = await (await scanResponsePromise).json() as {
    opportunities?: Array<{ symbol: string }>;
    persistence?: {
      attempted: number;
      failed: number;
      persisted: number;
      skipped: number;
    };
    qualified?: number;
  };
  const persistence = scanBody.persistence;
  expect(
    persistence,
    "the scan response carries no persistence report — spec §17m.2",
  ).toBeTruthy();
  expect(persistence!.attempted).toBe(scanBody.qualified);
  expect(persistence!.persisted + persistence!.skipped + persistence!.failed)
    .toBe(persistence!.attempted);
  expect(
    persistence!.failed,
    "the scan failed to persist part of what it showed (see analyzer_events)",
  ).toBe(0);
  expect(
    persistence!.persisted,
    `the scan qualified ${scanBody.qualified} markets and wrote none`,
  ).toBe(persistence!.attempted - persistence!.skipped);

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
    } (the scan reported ${persistence!.skipped} live-position skip(s))`,
  ).toBeLessThanOrEqual(persistence!.skipped);
});
