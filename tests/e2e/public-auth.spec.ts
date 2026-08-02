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
  // AuthScreen.tsx renders "No password is required." unconditionally —
  // the "Cloud connection pending" branch this used to also check for is
  // unreachable in practice, so the guard was dead weight.
  await expect(page.getByText("No password is required.")).toBeVisible();
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

// Spec §17i took the document's scroll away from every page and handed it to one
// region in the middle of the frame. Before this guard existed, nothing checked
// that a reader with no mouse could move it — the wave's own e2e only ever proved
// the wheel — and nothing could: from the focus a page load starts with
// (document.body), Space / ArrowDown / PageDown / End moved the legal trio 0px of
// 462 at 375, and the one Tab available landed on "Back to Levelflow" at the very
// end of the notice, slamming the region to its bottom in a single keystroke.
// That is WCAG 2.1.1 on the three pages where readability is a compliance matter.
//
// So the journey is what is asserted, starting where every load starts: Tab once,
// land on the region itself with nothing scrolled yet, then read it with the
// keys. 375 because that is the width where these documents actually overflow
// their frame (363–462px); at 1280 they barely do.
test("the static pages read by keyboard, from the focus every load starts with (WCAG 2.1.1)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (
    const path of [
      "/legal/privacy.html",
      "/legal/terms.html",
      "/legal/risk-disclaimer.html",
    ]
  ) {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(
      await page.evaluate(() => document.activeElement === document.body),
      `${path}: a fresh load should leave focus on the body`,
    ).toBe(true);
    const scrollable = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      return main.scrollHeight - main.clientHeight;
    });
    expect(scrollable, `${path} has nothing to scroll at 375`).toBeGreaterThan(0);

    // One Tab, and it lands on the region rather than on the link at the end of
    // the document — with the notice still at its top, which is the half of this
    // that the pre-fix page failed even though its scroll number moved.
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
      `${path}: the first Tab should land on the scroll region`,
    ).toBe("MAIN");
    expect(
      await page.evaluate(() => Math.round(document.querySelector("main")!.scrollTop)),
      `${path}: reaching the region must not scroll it`,
    ).toBe(0);

    for (const key of ["Space", "PageDown", "End"]) {
      await page.evaluate(() => {
        document.querySelector("main")!.scrollTop = 0;
      });
      await page.keyboard.press(key);
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              Math.round(document.querySelector("main")!.scrollTop)
            ),
          { message: `${path}: ${key} moved the region 0px` },
        )
        .toBeGreaterThan(0);
    }
    // And the document still does not scroll — the frame is intact.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
});

// The other end of the satellites' footer link (§17i: static pages link Donate to
// the app root). /?donate has to arrive with the block open AND in view — the
// control that opens it is the frame's bottom row, so a block that opened silently
// off-screen would be a link with no visible result. M6: verified by hand in the
// review, guarded by nothing.
test("/?donate opens the login screen's donation block and brings it into view", async ({
  page,
}) => {
  // 375, where the two columns stack and the block sits at the far end of a
  // scrolling region — the width at which "opened" and "in view" are two different
  // claims. At 1280 the card is short enough that the block lands on screen
  // whether anything scrolls it or not, so a check there proves only the state.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?enter&donate", { waitUntil: "networkidle" });

  const donate = page.getByRole("button", { name: "Donate", exact: true });
  await expect(donate).toHaveAttribute("aria-expanded", "true");
  const options = page.getByText(
    "Donations support market data, email, hosting, and development.",
  );
  await expect(options).toBeVisible();
  // In the viewport, not merely rendered somewhere in the scroll region.
  const inView = await options.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight;
  });
  expect(inView, "the donation block opened out of view").toBe(true);
  // And the frame is intact: the document still does not scroll.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("the login screen's region is a named keyboard stop too", async ({ page }) => {
  // The same fix on the React half of the satellite set, at the width where that
  // screen overflows its frame. Reached by role and name, which is the other
  // half of the claim: a tab stop nobody can name announces as "region".
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?enter", { waitUntil: "networkidle" });
  const region = page.getByRole("region", { name: "Sign in" });
  await expect(region).toBeVisible();
  expect(await region.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0);
  // The theme toggle is fixed over this screen and sits before the region in the
  // DOM, so the region is not the first stop — what has to hold is that it IS a
  // stop, and that it comes before the controls inside it. (On the static pages
  // above there is no such control, so the region is the very first stop.)
  let reached = false;
  let insideFirst = false;
  for (let stop = 0; stop < 6 && !reached; stop += 1) {
    await page.keyboard.press("Tab");
    const where = await region.evaluate((element) => ({
      inside: element !== document.activeElement &&
        element.contains(document.activeElement),
      isRegion: element === document.activeElement,
    }));
    reached = where.isRegion;
    insideFirst = insideFirst || (!reached && where.inside);
  }
  expect(reached, "the login region is not a tab stop").toBe(true);
  expect(insideFirst, "a control inside the region was reached first").toBe(false);
  await page.keyboard.press("End");
  await expect
    .poll(() => region.evaluate((element) => Math.round(element.scrollTop)))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("the gate is open — signed-out visitors land on sign-in, not parking", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByText("Under construction")).toHaveCount(0);
});

test("the old quiet-entry path is a harmless no-op with the gate open", async ({ page }) => {
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

// Q1-I6: the footer's link row honoured the kit's 44px floor three times (Help,
// Donate and the colophon, all .tertiary-link or .colophon-link) and broke it
// three times — the legal trio beside them was a bare 12px inline box about 16px
// tall. The floor arrives as an absolutely positioned ::after so the row's
// geometry cannot move, which is exactly the pair of facts only a browser can
// confirm: the target is 44px, and the footer is the same height it was.
test("every link in the footer's row clears the 44px tap floor, without moving the row", async ({
  page,
}) => {
  await page.goto("/");

  const measured = await page.evaluate(() => {
    const footer = document.querySelector("footer")!;
    const legal = Array.from(
      footer.querySelectorAll<HTMLElement>('nav[aria-label="Legal"] a'),
    );
    const others = Array.from(
      footer.querySelectorAll<HTMLElement>(".tertiary-link, .colophon-link"),
    );
    const reach = (element: HTMLElement) => {
      const own = element.getBoundingClientRect().height;
      const after = getComputedStyle(element, "::after");
      const overlay = after.position === "absolute"
        ? Number.parseFloat(after.height)
        : 0;
      return Math.max(own, Number.isFinite(overlay) ? overlay : 0);
    };
    const withOverlay = footer.getBoundingClientRect().height;
    legal.forEach((element) => element.classList.remove("legal-link"));
    const withoutOverlay = footer.getBoundingClientRect().height;
    legal.forEach((element) => element.classList.add("legal-link"));
    return {
      footerHeight: { withOverlay, withoutOverlay },
      legal: legal.map((element) => ({
        label: element.textContent?.trim() ?? "",
        reach: reach(element),
      })),
      others: others.map((element) => ({
        label: element.textContent?.trim() ?? "",
        reach: reach(element),
      })),
    };
  });

  expect(measured.legal.map((link) => link.label)).toEqual([
    "Risk disclaimer",
    "Privacy",
    "Terms",
  ]);
  for (const link of [...measured.legal, ...measured.others]) {
    expect(link.reach, `${link.label} target: ${JSON.stringify(measured)}`)
      .toBeGreaterThanOrEqual(44);
  }
  // The whole point of an overlay rather than a min-height: the row does not move.
  expect(measured.footerHeight.withOverlay)
    .toBeCloseTo(measured.footerHeight.withoutOverlay, 1);
});
