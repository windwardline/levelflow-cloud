import { type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Full-page screenshots of the four authed surfaces at desktop and mobile
// widths, written under test-results/visual-proof/ and uploaded as a CI
// artifact. This exists because the Stage 3.5 ship passed every DOM
// assertion while looking nothing like the approved mockups — composition
// has to be seen. Assertion-light on purpose: visibility waits only, so a
// slow chart can't flake the deploy; the composition guards live in the
// unit suites (deskComposition/surfaceComposition), not here.

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

// Each surface's "it rendered" signal is a stable landmark, not data: data
// rows depend on what the test account holds that day. The Desk's landmark is
// resolved through getByTestId rather than a CSS selector carrying a tag name
// — a type selector is exact, so 'div[data-testid=…]' matched nothing at all
// (the element is a <section>, and the rail recomposition would have changed
// it again). Every sibling call site in this directory already does it this
// way; the landmark waits below take a Locator, so the desk entry supplies
// one and the other three keep their text-scoped CSS.
const SURFACES = [
  { landmark: (page: Page) => page.getByTestId("current-trades-rail"), name: "desk", nav: null },
  { landmark: (page: Page) => page.locator('h1:has-text("Insights")'), name: "insights", nav: "Insights" },
  { landmark: (page: Page) => page.locator("h1"), name: "guide", nav: "Guide" },
  { landmark: (page: Page) => page.locator('h1:has-text("Profile")'), name: "profile", nav: "Profile" },
] as const;

test("captures desktop composition proof", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto("/");

  for (const surface of SURFACES) {
    if (surface.nav) {
      await page
        .locator('nav[aria-label="Levelflow sections"]')
        .getByRole("button", { exact: true, name: surface.nav })
        .click();
    }
    await surface.landmark(page).first().waitFor({ state: "visible" });
    // Give the chart/webfonts a beat past the landmark so the capture is
    // representative, without asserting on paint internals.
    await page.waitForTimeout(1500);
    await page.screenshot({
      fullPage: true,
      path: `test-results/visual-proof/desktop-${surface.name}.png`,
    });
  }
});

test("captures mobile composition proof", async ({ page }) => {
  await page.setViewportSize({ height: 812, width: 375 });
  await page.goto("/");

  // The mobile Desk is two surfaces now (spec §17e): the merged Scan surface,
  // which is the default and carries what the old Review and Scan tabs both
  // held, and Trades. Landmarks are resolved by testid, so a tag or wrapper
  // change cannot silently make a capture pass against nothing.
  await page.getByTestId("mobile-header").waitFor({ state: "visible" });
  await page.getByTestId("mobile-scan-surface").waitFor({ state: "visible" });
  await page.waitForTimeout(1500);
  await page.screenshot({
    fullPage: true,
    path: "test-results/visual-proof/mobile-desk-scan.png",
  });

  // Every tap is scoped to the tab bar: "Scan" and "Insights" are also the
  // names of controls on the surfaces themselves. The Trades tab's accessible
  // name grows to "Trades, N current" the moment the account holds a pending or
  // open setup (App.tsx's MobileTabBar badge), so exact:true stops matching on
  // exactly the accounts this capture is most worth having.
  const tabBar = page.locator('nav[aria-label="Levelflow"]');
  await tabBar.getByRole("button", { name: /^Trades(,|$)/ }).click();
  await page.getByTestId("current-trades-rail").waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  await page.screenshot({
    fullPage: true,
    path: "test-results/visual-proof/mobile-desk-trades.png",
  });

  await tabBar.getByRole("button", { exact: true, name: "Insights" }).click();
  await page.locator('h1:has-text("Insights")').waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  await page.screenshot({
    fullPage: true,
    path: "test-results/visual-proof/mobile-insights.png",
  });
});
