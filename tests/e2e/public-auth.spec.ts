import { expect, test } from "@playwright/test";

test("public login screen presents LevelFlow without stale auth copy", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "LevelFlow" }),
  ).toBeVisible();
  await expect(page.getByText("A Windward Line product")).toBeVisible();
  if ((await page.getByText("No password is required.").count()) > 0) {
    await expect(page.getByText("No password is required.")).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { name: "Cloud access pending" }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Send magic link" }),
  ).toBeVisible();
  await expect(page.getByText(/6-digit|six-digit/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Donate" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact" })).toBeVisible();
});
