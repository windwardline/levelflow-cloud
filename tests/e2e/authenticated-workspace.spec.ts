import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { marketAvailability } from "../../src/lib/marketHours";
import {
  AVAILABLE_ASSET_GROUPS,
  formatSecurityLabel,
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

  // App.tsx mounts both the mobile (lg:hidden) and desktop (hidden
  // lg:contents) headers at every viewport width — only CSS decides which
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

  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Broker", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Appearance", exact: true }),
  ).toBeVisible();

  // Spec §16 relocation: Help (mailto) and Donate moved off the killed
  // desktop header buttons onto a Support card here, so they stay reachable
  // at desktop widths (the mobile account menu already carried both).
  await expect(
    page.getByRole("heading", { name: "Support", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Email support" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Donate", exact: true }),
  ).toBeVisible();
});

test("market scan exposes the scope menu and rationale-ready surface", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Best current markets" }),
  ).toBeVisible();
  const scopeMenuButton = page.getByRole("button", { name: "Scan scope" });
  await expect(scopeMenuButton).toBeVisible();
  await expect(scopeMenuButton).toContainText("All markets");
  // m3 retired the legacy Quality band filter (spec §5's rail has none) and
  // I7 retired the stacked VolatilityWindowPanel ("Timing edge"/"Best time
  // window") below the stage — neither exists to check for anymore.
  await expect(
    page.getByText(
      "Scan shows the strongest qualifying setup among closely linked markets.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Clean", { exact: true })).toBeVisible();
  await expect(page.getByText("Poor", { exact: true })).toBeVisible();
});

test("a How this works link opens the Guide at the section it names", async ({ page }) => {
  await page.goto("/");

  // The scan legend's link is always on screen, so this half of the
  // disclosure contract is checkable without waiting on live market data.
  const scanNote = page.locator("p", {
    hasText:
      "Scan shows the strongest qualifying setup among closely linked markets.",
  });
  await scanNote.getByRole("button", { name: "How this works" }).click();

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
  await page.getByRole("button", { name: "Review market" }).click();

  const receiptHeading = page.getByRole("heading", { name: "Why this setup" });
  const hasReceipt = await receiptHeading
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hasReceipt,
    "No qualifying setup right now, so there is no receipt on screen to click.",
  );

  // Innermost element holding both the row label and a link: the Replay
  // record row itself, whose link is the only one scoped to it.
  const replayRow = page
    .locator("div")
    .filter({ has: page.getByText("Replay record", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "How this works" }) })
    .last();
  await replayRow.getByRole("button", { name: "How this works" }).click();

  const replayRecord = page.locator("#replay-record");
  await expect(replayRecord).toBeVisible();
  await expect(replayRecord).toBeInViewport();
  // Renamed from "Replay record" to "The record" in the Guide's ten-section
  // deck (spec §11); the receipt's own row label (matched above) and the
  // #replay-record anchor id are both unchanged — only this section
  // heading's wording moved.
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

  // .first() is deliberate, not incidental: before I7 retired the stacked
  // status panels below the stage, AdvisorStatusPanels' DataHealthPanel
  // duplicated this exact phrase (both its own "N candles loaded" notice
  // and, separately, a bare "Candles loaded" MetricRow label also matched
  // the regex) alongside the stage's own marketNotice — three elements for
  // one assertion. The stage's marketNotice is the only survivor today, but
  // .first() stays as a standing guard against a future surface
  // reintroducing the phrase, not because more than one match is expected
  // right now.
  await expect(page.getByText(/candles loaded/i).first()).toBeVisible({
    timeout: 30_000,
  });

  // Renamed from "Advisor chart view": the visible wrapping <label> already
  // reads "Chart view", and the stale "Advisor" prefix predates the Desk
  // rename (that word is retired from every other user-facing label).
  const timeframeSelect = page.getByLabel("Chart view", { exact: true });
  if ((await timeframeSelect.inputValue()) !== "1min") {
    await timeframeSelect.selectOption("1min");
  }

  await expect(timeframeSelect).toHaveValue("1min");
  // The stage carries no surface title or eyebrow above the chart (spec §2
  // copy discipline), so there is no heading to scope this notice to — same
  // .first() guard as above, for the same reason.
  await expect(page.getByText(/1 minute candles loaded/i).first()).toBeVisible({
    timeout: 30_000,
  });
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

  // The stage carries no heading (spec §2), so "Review market" — the one
  // stable, always-present control inside its topmost section — stands in
  // for the whole stage column the way the old "Market review" heading
  // used to.
  const advisorPanel = page.locator("section", {
    has: page.getByRole("button", { name: "Review market" }),
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
  // lg:contents split); primary navigation is a bottom tab bar (Review /
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
  await expect(header.getByText("E8 Markets")).toBeVisible();

  for (const tab of ["Review", "Scan", "Trades", "Insights"]) {
    // The Trades button's aria-label grows to "Trades, N current" once a
    // live setup exists (App.tsx's MobileTabBar badge) — this suite creates
    // one earlier in the file, so exact:true would fail here whenever that
    // ran first. The other three tabs never carry a badge today, so they
    // stay exact.
    const locator = tab === "Trades"
      ? page.getByRole("button", { name: /^Trades(,|$)/ })
      : page.getByRole("button", { name: tab, exact: true });
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
  // full functionality there, not a stripped-down subset.
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Best current markets" }),
  ).toBeVisible();

  // Same Trades badge caveat as above.
  await page.getByRole("button", { name: /^Trades(,|$)/ }).click();
  await expect(page.getByTestId("current-trades-rail")).toBeVisible();

  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();

  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
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
  // and skip pattern as the other "Review market" tests in this file.
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Review market" }).click();

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

test("Insights renders the setup ledger table and the persistence footer", async ({ page }) => {
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

  // Spec §10, verbatim: the exact wording the design authority signed off
  // on, load-bearing the same way the ladder's canonical instruction is.
  await expect(
    page.getByText(
      "Every setup Levelflow generates is saved here automatically, taken or not. Your record is tracked per broker: E8 Markets.",
    ),
  ).toBeVisible();
});

test("a qualifying market scan persists into Insights, not just onto the scan rail", async ({ page }) => {
  // Spec §9: every generated setup is persisted, scan path included. This
  // depends on the live scan actually qualifying at least one market right
  // now, so — like the receipt tests above — it skips honestly rather than
  // pin behavior on live market conditions.
  test.setTimeout(120_000);
  await page.goto("/");

  await page.getByRole("button", { name: "Scan", exact: true }).click();
  const candidateRow = page.getByText(/^(Buy|Sell) · confidence \d+$/).first();
  const hasCandidate = await candidateRow
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hasCandidate,
    "No market qualified on this scan, so there is nothing new to check for in Insights.",
  );

  const scanSection = page.locator("section", {
    has: page.getByRole("heading", { name: "Best current markets" }),
  });
  // Collect EVERY symbol the scan surfaced, not just the top row: a symbol
  // with a live placed position is deliberately skipped by persistence (the
  // scan must never rewrite a live trade), so any single row — including
  // the strongest — can be legitimately absent from Insights. The honest
  // assertion is that the scan's qualifying set intersects the ledger.
  const scannedSymbolLabels = (
    await scanSection
      .locator("p.truncate.font-semibold.text-ink")
      .allTextContents()
  ).map((label) => label.trim()).filter(Boolean);
  expect(scannedSymbolLabels.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();

  // Insights' Market column renders the raw ticker (e.g. "EURUSD"), not the
  // scan rail's long descriptive label (e.g. "EUR/USD - Euro / U.S.
  // Dollar") — the "Open {symbol} in Advisor" row button's aria-label is
  // the stable, parseable link between the two views. The ledger's own
  // fetch is async and the heading becoming visible doesn't guarantee its
  // rows have landed yet, so evaluateAll (which reads the DOM once, with no
  // retry) waits behind a poll for at least one row first.
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
  const insightsLabels = rawSymbols.map((symbol) => formatSecurityLabel(symbol));
  const persisted = scannedSymbolLabels.filter((label) =>
    insightsLabels.includes(label)
  );
  expect(
    persisted.length,
    `none of the scan's qualifying markets (${scannedSymbolLabels.join(", ")}) reached the Insights ledger`,
  ).toBeGreaterThan(0);
});
