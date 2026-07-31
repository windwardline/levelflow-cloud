import { expect, test } from "@playwright/test";
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
  // colophon. The Desk tab is the default landing surface and, at >=lg, is
  // a fixed non-scrolling viewport that deliberately hides the page footer
  // there (App.tsx: the footer picks up `lg:hidden` whenever the Desk tab
  // is active) — checking visibility from the Desk tab at a desktop
  // viewport would fail for a layout reason that has nothing to do with
  // brand-copy duplication. Insights keeps the ordinary scrolling page
  // chrome, footer included, at every width, so that is where the
  // single-occurrence claim is actually checkable.
  await expect(page.getByText("Windward Line")).toHaveCount(1);
  await page.getByRole("button", { name: "Insights", exact: true }).click();
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

  // Spec §17, placement (b): the article ends with a short Support section,
  // two tertiary links. Scoped to the article so the footer's own Help/Donate
  // row further down the same page can't satisfy this by accident — the whole
  // point of the ruling is that both placements exist.
  const guideArticle = page.locator("article");
  await expect(
    guideArticle.getByRole("heading", { name: "Support", exact: true }),
  ).toBeVisible();
  await expect(
    guideArticle.getByRole("link", { name: "Email support" }),
  ).toBeVisible();
  await expect(
    guideArticle.getByRole("button", { name: "Donate", exact: true }),
  ).toBeVisible();

  // Spec §17, placement (a): the footer's link row carries Help and Donate
  // beside the legal trio, on every scrolling surface. Scoped to the footer
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
  // Scoped to the panel from here down: spec §17c gives Profile the shared
  // footer too, so its Donate and the footer's are two buttons of the same
  // accessible name on one page — unscoped, that is a strict-mode failure on
  // the live run, and both are supposed to exist.
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

  // Spec §16 relocation: Help (mailto) and Donate moved off the killed
  // desktop header buttons onto a Support row here, so they stay reachable
  // at desktop widths (the mobile account menu already carried both).
  await expect(
    profile.getByRole("heading", { name: "Support", exact: true }),
  ).toBeVisible();
  await expect(
    profile.getByRole("link", { name: "Email support" }),
  ).toBeVisible();
  await expect(
    profile.getByRole("button", { name: "Donate", exact: true }),
  ).toBeVisible();

  // Spec §17c: one footer on every scrolling view — Profile used to be the one
  // surface that skipped it and drew its own legal block instead. Both the
  // shared row and the absence of a second copy are checked.
  await expect(footerSupport.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(page.getByText("A Windward Line production")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Legal" }),
  ).toHaveCount(1);

  // Donate is the last scrolling surface, and the shortest — the footer has to
  // sit at the true bottom of the viewport there, not halfway up the page.
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

test("market scan is the mock's quiet rail — eyebrow, scope menu, footnote, no panel furniture", async ({ page }) => {
  await page.goto("/");

  // Spec §16 deleted the rail's panel title block and its legend box; the
  // eyebrow + Scan now row and the closing footnote are what stand in their
  // place (a-desk-v3.html:88, :158). Both directions are checked here, per
  // that section's standing review discipline.
  const rail = page.getByTestId("market-scan-rail");
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("heading", { name: "Scan", exact: true }))
    .toBeVisible();
  await expect(rail.getByRole("button", { name: "Scan now" })).toBeVisible();
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
  // that the new row chip legitimately renders, so an absence assertion on any
  // of those strings would fail on real scan data for a reason that has
  // nothing to do with the kill list. What defines the legend is a rating chip
  // that is not attached to a market — every chip the recomposed rail draws
  // sits inside its own result row.
  const chipsOutsideARow = await rail
    .locator("span.chip")
    .evaluateAll((chips) =>
      chips.filter((chip) => chip.closest("button") === null).length
    );
  expect(chipsOutsideARow).toBe(0);
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
  await page.getByRole("button", { name: "Review", exact: true }).click();

  const receiptHeading = page.getByRole("heading", { name: "Why this setup" });
  const hasReceipt = await receiptHeading
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hasReceipt,
    "No qualifying setup right now, so there is no Costs row on screen to click.",
  );

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
  await page.getByRole("button", { name: "Review", exact: true }).click();

  const receiptHeading = page.getByRole("heading", { name: "Why this setup" });
  const hasReceipt = await receiptHeading
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hasReceipt,
    "No qualifying setup right now, so there is no receipt on screen to click.",
  );

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

  // The stage carries no heading (spec §2), so "Review" (spec §17 shortened
  // it from "Review market") — the one stable, always-present control inside
  // its topmost section — stands in for the whole stage column the way the
  // old "Market review" heading used to. exact:true because the mobile tab
  // bar carries a "Review" tab of its own; it is display:none at this width
  // (so out of the accessibility tree Playwright queries), and the exact
  // match keeps that from being the only thing separating them.
  const advisorPanel = page.locator("section", {
    has: page.getByRole("button", { name: "Review", exact: true }),
  }).first();
  const rail = page.getByTestId("current-trades-rail");

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
  // Mobile is its own composition (spec §3), not a narrowed desktop: the
  // top nav pills are gone entirely (display:none via the header's
  // `hidden lg:flex` gate); primary navigation is a bottom tab bar (Review /
  // Scan / Trades / Insights), and Guide / Profile / Donate / Help / Sign
  // out all move behind one account-avatar menu in the header.
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

  // Scoped to the tab bar's own nav, not the page: spec §17 shortened the
  // stage's action to "Review", which is exactly the first tab's name, and at
  // this width both are visible at once (the stage IS the Review tab). The
  // bar's landmark is aria-label="Levelflow"; the desktop masthead's is
  // "Levelflow sections", and a CSS attribute selector is an exact match, so
  // this can never pick up the wrong nav.
  const tabBar = page.locator('nav[aria-label="Levelflow"]');
  for (const tab of ["Review", "Scan", "Trades", "Insights"]) {
    // The Trades button's aria-label grows to "Trades, N current" once a
    // live setup exists (App.tsx's MobileTabBar badge) — this suite creates
    // one earlier in the file, so exact:true would fail here whenever that
    // ran first. The other three tabs never carry a badge today, so they
    // stay exact.
    const locator = tab === "Trades"
      ? tabBar.getByRole("button", { name: /^Trades(,|$)/ })
      : tabBar.getByRole("button", { name: tab, exact: true });
    await expect(locator).toBeVisible();
  }

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

  // Review is the default tab; Scan and Trades are one tap away and carry
  // full functionality there, not a stripped-down subset. The tab bar's own
  // "Scan" button and the rail's "Scan now" no longer collide on one name
  // (spec §16 renamed the rail's action to the mock's wording), and the taps
  // below stay scoped to the bar anyway — the stage's own "Review" action
  // shares a name with the first tab now (spec §17).
  await tabBar.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByTestId("market-scan-rail")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scan now" }),
  ).toBeVisible();

  // Same Trades badge caveat as above.
  await tabBar.getByRole("button", { name: /^Trades(,|$)/ }).click();
  await expect(page.getByTestId("current-trades-rail")).toBeVisible();

  await tabBar.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();

  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
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

  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  // Named by the market — the same display symbol the stagehead heading shows.
  await expect(dialog).toContainText("EUR/USD");
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

  // max-lg only: the ≥lg Desk is frozen and its chart is already full-height.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("button", { name: "Expand chart" })).toBeHidden();
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

test("scope menu lists All markets, then groups alphabetically, then base/quote-sorted markets — 375px sheet", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  // The scan rail is the "Scan" mobile tab's content; the sheet-vs-popup
  // choice is purely a viewport check inside ScopeMenu itself, but the
  // trigger still has to be visible (and thus tapped-into) first.
  await page.getByRole("button", { name: "Scan", exact: true }).click();
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
  // The receipt only exists once a review has run — same live-dependency
  // and skip pattern as the other "Review" tests in this file.
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Review", exact: true }).click();

  const receiptHeading = page.getByRole("heading", { name: "Why this setup" });
  const hasSetup = await receiptHeading
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hasSetup,
    "No qualifying setup right now, so there are no ladder values to copy.",
  );

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
  // Spec §9: every generated setup is persisted, scan path included. This
  // depends on the live scan actually qualifying at least one market right
  // now, so — like the receipt tests above — it skips honestly rather than
  // pin behavior on live market conditions.
  test.setTimeout(120_000);
  await page.goto("/");

  // "Scan now" is the rail's action (spec §16 mock wording); plain "Scan" is
  // only the mobile tab bar's label, hidden at this desktop viewport — the
  // pre-§16 locator here waited out the whole test timeout in the first live
  // run after the rename shipped.
  await page.getByRole("button", { name: "Scan now", exact: true }).click();
  const candidateRow = page.getByText(/^(Buy|Sell) · confidence \d+$/).first();
  const hasCandidate = await candidateRow
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hasCandidate,
    "No market qualified on this scan, so there is nothing new to check for in Insights.",
  );

  // Scoped by testid since spec §16 deleted the heading this used to locate.
  const scanSection = page.getByTestId("market-scan-rail");
  // Collect EVERY symbol the scan surfaced, not just the top row: a symbol
  // with a live placed position is deliberately skipped by persistence (the
  // scan must never rewrite a live trade), so any single row — including
  // the strongest — can be legitimately absent from Insights. The honest
  // assertion is that the scan's qualifying set intersects the ledger.
  const scannedSymbolLabels = (
    await scanSection
      .locator("span.truncate.font-bold.text-ink")
      .allTextContents()
  ).map((label) => label.trim()).filter(Boolean);
  expect(scannedSymbolLabels.length).toBeGreaterThan(0);

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
  const persisted = scannedSymbolLabels.filter((label) =>
    insightsLabels.includes(label)
  );
  expect(
    persisted.length,
    `none of the scan's qualifying markets (${scannedSymbolLabels.join(", ")}) reached the Insights ledger`,
  ).toBeGreaterThan(0);
});
