import { expect, test } from "@playwright/test";

test("public login screen presents Levelflow without stale auth copy", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Levelflow" }),
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

  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
});

function wcagRatio(a: string, b: string): number {
  const luminance = (css: string): number => {
    const [r, g, blue] = (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const lin = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(blue);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme} theme: login badge glyph clears AA on its computed fill`, async ({
    page,
  }) => {
    // The badge fill token re-values between themes; the glyph must re-value
    // with it. Assert on computed styles so a regression at any layer (class
    // string, token alias, dark-mode shim) is caught, not just this markup.
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);

    const badge = page
      .locator(".auth-login-panel div.rounded-lg:has(> svg)")
      .first();
    await expect(badge).toBeVisible();
    const { fill, glyph } = await badge.evaluate((el) => ({
      fill: getComputedStyle(el).backgroundColor,
      glyph: getComputedStyle(el.querySelector("svg") as SVGElement).color,
    }));
    expect(
      wcagRatio(glyph, fill),
      `${glyph} on ${fill} must clear WCAG AA`,
    ).toBeGreaterThanOrEqual(4.5);
  });
}
