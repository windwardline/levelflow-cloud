import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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

test("authenticated workspace leads with the Levelflow wordmark, not the Windward Line brand", async ({ page }) => {
  await page.goto("/");

  const header = page.locator("header");
  await expect(header.getByText("Levelflow", { exact: true })).toBeVisible();
  await expect(header.getByText("Windward Line")).toHaveCount(0);

  // "Windward Line" surfaces exactly once on the authed page: the footer
  // colophon, matching the public (unauthenticated) pages' pattern.
  await expect(page.getByText("Windward Line")).toHaveCount(1);
  await expect(page.getByText("A Windward Line production")).toBeVisible();
});

test("authenticated workspace exposes core premium navigation without stale help text", async ({ page }) => {
  await page.goto("/");

  const navLabels = await page
    .locator("nav button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.textContent?.trim())
    );
  expect(navLabels).toEqual([
    "Advisor",
    "Insights",
    "Guide",
    "About",
    "Profile",
  ]);

  await page.getByRole("button", { name: "About" }).click();
  await expect(
    page.getByRole("heading", {
      name: "A premium market review workspace for disciplined traders",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review support, not trade placement" }),
  ).toBeVisible();
  await expect(page.getByText("Shared across Levelflow")).toBeVisible();

  await page.getByRole("button", { name: "Insights" }).click();
  await expect(
    page.getByRole("heading", { name: "Insights" }),
  ).toBeVisible();
  await expect(page.getByText("What Is Improving")).toHaveCount(0);
  await expect(page.getByText("Shared learning")).toHaveCount(0);
  await expect(page.getByText("Status guide")).toHaveCount(0);

  await page.getByRole("button", { name: "Guide" }).click();
  await expect(
    page.getByRole("heading", { name: "How to use Levelflow" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What Levelflow checks" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Activity", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review activity" }),
  ).toBeVisible();
  await expect(page.getByText("Current Settings")).toHaveCount(0);
  await expect(page.getByText("Starting chart")).toHaveCount(0);
});

test("advisor market scan exposes filters and rationale-ready surface", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Best current markets" }),
  ).toBeVisible();
  await expect(page.getByLabel("Group")).toHaveValue("all");
  await expect(page.getByLabel("Quality")).toHaveValue("all");
  await expect(
    page.getByText(
      "Scan shows the strongest qualifying setup among closely linked markets.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Clean", { exact: true })).toBeVisible();
  await expect(page.getByText("Poor", { exact: true })).toBeVisible();
  await expect(page.getByText("Timing edge")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Best time window" }),
  ).toBeVisible();
});

test("advisor loads Ultimate one-minute chart data", async ({ page }) => {
  test.setTimeout(60_000);

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

  await expect(page.getByText(/candles loaded/i)).toBeVisible({
    timeout: 30_000,
  });

  const timeframeSelect = page.getByLabel("Advisor chart view");
  if ((await timeframeSelect.inputValue()) !== "1min") {
    await timeframeSelect.selectOption("1min");
  }

  const advisorPanel = page.locator("section", {
    has: page.getByRole("heading", { name: "Market review" }),
  });
  await expect(timeframeSelect).toHaveValue("1min");
  await expect(
    advisorPanel.getByText(/1 minute candles loaded/i),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(
      "Verified market data is not available for this market yet.",
    ),
  ).toHaveCount(0);
});

test("laptop-width desktop shows the advisor rail beside the chart", async ({ page }) => {
  // Real desktop windows are usually 1000-1500 CSS px wide (Windows display
  // scaling, non-maximized Mac windows). The workspace previously went
  // side-by-side only at 1536px, so nearly every desktop saw the stacked
  // mobile layout. Guard the split at a realistic laptop width.
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/");

  const advisorPanel = page.locator("section", {
    has: page.getByRole("heading", { name: "Market review" }),
  }).first();
  const rail = page.locator("aside").first();

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
  // Labels may collapse to icons on small screens, but every control keeps
  // its accessible name and stays reachable: no desktop-only features.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Donate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  for (const tab of ["Advisor", "Insights", "Guide", "About", "Profile"]) {
    await expect(page.getByRole("button", { name: tab })).toBeVisible();
  }

  await expect(
    page.getByRole("heading", { name: "Best current markets" }),
  ).toBeVisible();
  await expect(page.getByLabel("Group")).toBeVisible();
  await expect(page.getByLabel("Quality")).toBeVisible();

  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
});
