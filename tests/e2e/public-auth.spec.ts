import { expect, type Page, test } from "@playwright/test";
import { DONATION_SUPPORT_COPY } from "../../src/lib/donationCopy";

// The owner's navigation report of 2026-08-02, as a browser test: signed in, open
// a legal page from the app, come back with the page's own link — and the app was
// the login screen again, in every tab, with a refresh and a Forward no help.
//
// It lives in this spec, beside the signed-out surface, for one reason: it needs
// a session but no CREDENTIALS. @supabase/auth-js returns a stored session whose
// expires_at is still in the future straight from storage
// (GoTrueClient.__loadSession) without a network call, so a shaped session in
// localStorage is a signed-in browser as far as the app is concerned. That keeps
// it out of authenticated-workspace.spec.ts, whose project budget is counted in
// analyzer requests per minute (playwright.config.ts), and it runs against the
// built artifact too — where this bug shipped from.
//
// The one live request it can make is a rejected one: when the defect is present
// the app calls signOut() with this invented token, GoTrue answers 401, and
// auth-js drops the local copy. No real account is identified by it.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const sessionsConfigured = Boolean(
  supabaseUrl && process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
const storageKey = supabaseUrl
  ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`
  : "";

function storedSession() {
  return JSON.stringify({
    access_token: "levelflow.e2e.navigation.token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "levelflow-e2e-navigation-refresh",
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      aud: "authenticated",
      role: "authenticated",
      email: "navigation@levelflow.test",
      created_at: "2026-01-01T00:00:00.000Z",
      app_metadata: {},
      user_metadata: {},
    },
  });
}

// A stored session, for the whole browser, seeded once — a browser that has
// signed in before. Never re-seeded on later loads: a re-seed would hide the one
// consequence that matters, which is that a token this app decides to drop does
// not come back.
//
// Nothing here marks the browser session as signed in. That is the app's own job
// on the load that consumes a magic link, and the test reaches it the way a
// reader does, by arriving with a redirect parameter (below) — so these tests
// know nothing about WHERE the app keeps that mark, only whether a second tab of
// the same browser can still see it.
async function seedStoredSession(page: Page) {
  await page.addInitScript(({ key, value }) => {
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, value);
    }
  }, { key: storageKey, value: storedSession() });
}

// auth-js only exchanges a `code` when it also holds the verifier that flow
// stored (GoTrueClient._isPKCECallback), so this arrives as a redirect without
// asking the network for anything: the app reads it as the sign-in load, and the
// stored session above is what it keeps.
const MAGIC_LINK_ARRIVAL = "/?code=levelflow-e2e-navigation";

function tokenPresent(page: Page) {
  return page.evaluate(
    (key) => window.localStorage.getItem(key) !== null,
    storageKey,
  );
}

// The app, not the sign-in screen. content-region is the authed shell's own
// scrolling row (App.tsx renders it only past the session gate), and the magic
// link button is the surface that must not be back.
async function expectSignedIn(target: Page) {
  await expect(target.getByTestId("content-region")).toBeVisible();
  await expect(target.getByRole("button", { name: "Send magic link" }))
    .toHaveCount(0);
  expect(await tokenPresent(target), "the stored session was dropped").toBe(true);
}

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
  const options = page.getByText(DONATION_SUPPORT_COPY);
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
  // The region is the very first stop, as it is on the static pages above: the
  // theme toggle used to be a fixed overlay ahead of it in the DOM, and the owner's
  // 2026-08-02 ruling moved that control inside the region, where it follows the
  // region's own stop instead of preceding it.
  let reached = false;
  let reachedAt = 0;
  let insideFirst = false;
  for (let stop = 1; stop <= 6 && !reached; stop += 1) {
    await page.keyboard.press("Tab");
    const where = await region.evaluate((element) => ({
      inside: element !== document.activeElement &&
        element.contains(document.activeElement),
      isRegion: element === document.activeElement,
    }));
    reached = where.isRegion;
    reachedAt = reached ? stop : reachedAt;
    insideFirst = insideFirst || (!reached && where.inside);
  }
  expect(reached, "the login region is not a tab stop").toBe(true);
  expect(insideFirst, "a control inside the region was reached first").toBe(false);
  expect(reachedAt, "the region is no longer the first stop").toBe(1);
  await page.keyboard.press("End");
  await expect
    .poll(() => region.evaluate((element) => Math.round(element.scrollTop)))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

// Owner ruling (2026-08-02): "the login card/box blocks some of the content on the
// login screen itself." It did, and the mechanism was measurable: min-h-full made
// the two-column section a flex item with an explicit percentage minimum, which
// replaces a flex item's automatic minimum size — so the scroll region shrank the
// section to its own height (727.5px at 375, against 1129px of content), the grid
// crushed the card's auto row to 50px, and `items-center` centred a 468px card
// inside that row: 209px of overhang, upward, straight across the hero's own
// feature list. This is the claim in its general form — no element of the hero and
// the card may share a pixel, at any width the screen is read at.
for (const width of [320, 375, 768, 1280]) {
  test(`nothing on the login screen is behind the sign-in card at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/?enter", { waitUntil: "networkidle" });
    const overlaps = await page.evaluate(() => {
      const section = document.querySelector("[role='region'] section");
      const hero = section?.firstElementChild;
      const card = document.querySelector(".auth-login-panel");
      if (!hero || !card) {
        throw new Error("expected the hero column and the sign-in card");
      }
      const cardBox = card.getBoundingClientRect();
      const hit: string[] = [];
      for (const element of hero.querySelectorAll("*")) {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const y = Math.min(box.bottom, cardBox.bottom) -
          Math.max(box.top, cardBox.top);
        const x = Math.min(box.right, cardBox.right) -
          Math.max(box.left, cardBox.left);
        if (y > 0.5 && x > 0.5) {
          hit.push(
            `${element.tagName}: ${(element.textContent ?? "").trim().slice(0, 40)}`,
          );
        }
      }
      return hit;
    });
    expect(overlaps, "the card covers hero content").toEqual([]);
    // Flow, not just clearance: the card begins below everything above it.
    const ordered = await page.evaluate(() => {
      const section = document.querySelector("[role='region'] section")!;
      const hero = section.firstElementChild!.getBoundingClientRect();
      const card = document.querySelector(".auth-login-panel")!
        .getBoundingClientRect();
      // At ≥lg they are two columns of one row, side by side; below lg, one after
      // the other.
      return card.left >= hero.right - 1 || card.top >= hero.bottom - 1;
    });
    expect(ordered, "the card is not in document order with the hero").toBe(true);
  });
}

// The other half of the same ruling: "It should be planted at the top, and scroll
// with the rest of the content so it does not block anything from view." A control
// that scrolls away is a control that is IN the scrolling region — which is a
// claim about layout, not about a class name, so it is measured here.
for (const width of [375, 1280]) {
  test(`the theme control scrolls with the login content at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.goto("/?enter", { waitUntil: "networkidle" });
    const region = page.getByRole("region", { name: "Sign in" });
    const toggle = page.getByRole("group", { name: "Theme" });
    await expect(toggle).toBeVisible();
    // In flow: neither the control nor any ancestor up to the region takes itself
    // out of the page's own layout.
    const positions = await toggle.evaluate((element) => {
      const chain: string[] = [];
      let node: HTMLElement | null = element as HTMLElement;
      while (node && !node.matches("[role='region']")) {
        chain.push(getComputedStyle(node).position);
        node = node.parentElement;
      }
      return chain;
    });
    expect(positions.every((position) => position === "static")).toBe(true);
    // And it is inside the scroller, so the scroller moves it.
    const scrollable = await region.evaluate((element) =>
      element.scrollHeight - element.clientHeight
    );
    expect(scrollable, "the region has nothing to scroll").toBeGreaterThan(40);
    const before = (await toggle.boundingBox())!.y;
    await region.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const after = (await toggle.boundingBox())!.y;
    expect(before - after, "the control did not scroll with the content")
      .toBeGreaterThanOrEqual(Math.min(scrollable, 40));
    // The 44px target survives the shrink (the ruling's "usable"): three options,
    // each a full 44px box, and no two of them claiming the same pixel.
    const boxes = await toggle.evaluate((element) =>
      [...element.querySelectorAll("button")].map((button) => {
        const box = button.getBoundingClientRect();
        return { left: box.left, right: box.right, w: box.width, h: box.height };
      })
    );
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      expect(box.h).toBeGreaterThanOrEqual(44);
      expect(box.w).toBeGreaterThanOrEqual(44);
    }
    for (let index = 1; index < boxes.length; index += 1) {
      expect(
        boxes[index].left,
        "two theme options share hit-area pixels",
      ).toBeGreaterThanOrEqual(boxes[index - 1].right - 0.01);
    }
  });
}

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

// The owner's report, walked. 375 is where he found it — below lg the legal trio
// lives in the account menu and that menu is the only way to those documents —
// and 1280 is the confirmation he asked for: the footer's own copies of the same
// links, whose new tab reaches the app root by the same door, so this was never
// a mobile-only defect.
for (const width of [375, 1280]) {
  test(`a signed-in browser keeps its session through the legal pages at ${width}px`, async ({
    context,
    page,
  }) => {
    test.skip(
      !sessionsConfigured,
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to run the session-navigation tests.",
    );
    const mobile = width < 1024;
    await page.setViewportSize({ width, height: 812 });
    await seedStoredSession(page);
    await page.goto(MAGIC_LINK_ARRIVAL, { waitUntil: "networkidle" });
    await expectSignedIn(page);

    // Tapped exactly where the app offers it, which is a different element per
    // width: a menuitem inside the account menu below lg, a footer link at ≥lg.
    if (mobile) {
      await page.getByRole("button", { name: "Account menu" }).click();
    }
    const [legalTab] = await Promise.all([
      context.waitForEvent("page"),
      page
        .getByRole(mobile ? "menuitem" : "link", { name: "Privacy", exact: true })
        .click(),
    ]);
    await legalTab.waitForLoadState("domcontentloaded");
    // A new tab is the same phone: the way back has to work at the width the
    // reader is holding, not at whatever the harness opens a tab at.
    await legalTab.setViewportSize({ width, height: 812 });
    await expect(legalTab.getByRole("heading", { name: "Levelflow" }))
      .toBeVisible();

    // "the link on those pages that indicates it is meant for that purpose".
    await legalTab.getByRole("link", { name: "Back to Levelflow" }).click();
    await legalTab.waitForLoadState("networkidle");
    await expectSignedIn(legalTab);
    // And the tab he left behind, which the old global signOut() reached through
    // GoTrue and flipped to the sign-in screen without a single interaction.
    await expectSignedIn(page);

    // "Refreshing and trying to go forward in your browser does not log you back
    // in either" — the two recoveries he tried, in the tab he came back in.
    await legalTab.reload({ waitUntil: "networkidle" });
    await expectSignedIn(legalTab);
    await legalTab.goBack({ waitUntil: "networkidle" });
    await legalTab.goForward({ waitUntil: "networkidle" });
    await expectSignedIn(legalTab);
  });
}

test("a browser session that never signed in does not inherit a stored session", async ({
  page,
}) => {
  test.skip(
    !sessionsConfigured,
    "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to run the session-navigation tests.",
  );
  // The other half of the fix, and the reason it is not simply "keep the token":
  // a stored session with no live browser session behind it is the next person at
  // the machine, and it must not sign them in — nor still be there afterwards.
  // Reached with no redirect parameter and a cookie jar this browser has never
  // written, which is what a new browser session is.
  await seedStoredSession(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Send magic link" }))
    .toBeVisible();
  expect(await tokenPresent(page), "a stale token outlived its browser").toBe(
    false,
  );
});
