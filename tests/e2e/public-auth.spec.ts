import { expect, test } from "@playwright/test";

test("public login screen presents Levelflow without stale auth copy", async ({
  page,
}) => {
  await page.goto("/?enter");

  await expect(
    page.getByRole("heading", { name: "Levelflow" }),
  ).toBeVisible();
  await expect(page.getByText("Market review")).toBeVisible();
  await expect(page.getByText("A Windward Line production")).toBeVisible();
  if ((await page.getByText("No password is required.").count()) > 0) {
    await expect(page.getByText("No password is required.")).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { name: "Cloud connection pending" }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Send magic link" }),
  ).toBeVisible();
  await expect(page.getByText(/6-digit|six-digit/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Donate" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Help" })).toBeVisible();
});

test("mobile viewport keeps every public feature reachable", async ({
  page,
}) => {
  // The mobile layout may stack and collapse labels to icons, but it must
  // never remove functionality: identical controls, identical actions.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?enter");

  await expect(
    page.getByRole("heading", { name: "Levelflow" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send magic link" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Donate" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(page.getByText("A Windward Line production")).toBeVisible();

  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
});

test("email input shell honors an explicit theme in both directions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?enter");

  const email = page.getByLabel("Email");
  const shell = email.locator("..");

  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await expect(shell).toHaveCSS("background-color", "rgb(30, 27, 22)");
  await expect(email).toHaveCSS("color", "rgb(237, 231, 218)");

  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  // The shell adopted the `.field` kit class in Task 7 (was bg-white/border-slate).
  // Background is now --color-sheet (#FDFCF9), not pure white.
  await expect(shell).toHaveCSS("background-color", "rgb(253, 252, 249)");
  await expect(email).toHaveCSS("color", "rgb(27, 27, 27)");
});

test("static pages keep to the viewport on phones", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/legal/privacy.html", "/legal/terms.html", "/legal/risk-disclaimer.html", "/404.html"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowX, `${path} bleeds ${overflowX}px past the viewport`).toBe(0);
  }
});

test("signed-out visitors see the parking page, not sign-in", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Under construction")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Levelflow" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
});

test("the quiet entry path reveals sign-in and persists for the session", async ({ page }) => {
  await page.goto("/?enter", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("system theme mode produces data-theme from the OS preference", async ({
  page,
}) => {
  // Stage 2's rewrite kept only the explicit-theme half of this guard (above).
  // This restores the other half: with no stored preference, the app must
  // read the OS color scheme itself and write data-theme accordingly.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?enter");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
