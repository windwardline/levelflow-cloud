import { expect, test } from "@playwright/test";

test("public login screen presents Levelflow without stale auth copy", async ({
  page,
}) => {
  await page.goto("/");

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
  await page.goto("/");

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
