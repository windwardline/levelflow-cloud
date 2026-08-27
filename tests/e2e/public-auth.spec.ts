import { createClient } from "@supabase/supabase-js";
import { expect, type Page, test } from "@playwright/test";
import { DONATION_SUPPORT_COPY } from "../../src/lib/donationCopy";
import { legalDocument, type LegalSlug } from "../../src/lib/legalDocuments";

// The owner's navigation report of 2026-08-02, as a browser test: signed in, open
// a legal page from the app, come back with the page's own link — and the app was
// the login screen again, in every tab, with a refresh and a Forward no help.
//
// It lives in this spec, beside the signed-out surface, because its subject is
// NAVIGATION — what a signed-in browser keeps through legal pages, tabs and
// reloads — not the workspace, whose project budget is counted in analyzer
// requests per minute (playwright.config.ts). It runs against the built
// artifact too — where this bug shipped from. The sessions are real sign-ins
// (see freshSession below): the credential-free fabricated session this spec
// was born with turned out to be the 1r defect state itself, and died with it.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const sessionsConfigured = Boolean(
  supabaseUrl && process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
const storageKey = supabaseUrl
  ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`
  : "";

// A REAL session for the E2E account, one per seeding. This used to be a
// fabricated session (invented tokens, a v4-zero user id) — "No real account
// is identified by it" — which worked only because the app trusted any local
// session blindly. That blind trust WAS defect 1r: the server refused every
// read (profiles 401, functions 401, refresh 400 "not found") and the shell
// rendered an authed frame around an empty account. When #273 made the app
// honest about a server-refused session, every test built on the fabricated
// one collapsed — correctly. The navigation-persistence claims these tests
// exist for ("a token this app decides to drop does not come back") survive
// unchanged on a session the server honors; what died was the fixture's
// premise, not the coverage.
//
// One fresh sign-in per seeding, not a shared capture: GoTrue rotates
// refresh tokens on use, so two contexts holding COPIES of one session race
// each other's rotation and the loser's refresh is refused as already-used.
// A session per test is its own chain and can never lose that race.
const testEmail = process.env.LEVELFLOW_E2E_EMAIL;
const testPassword = process.env.LEVELFLOW_E2E_PASSWORD;
const signedInFlowsConfigured = sessionsConfigured &&
  Boolean(testEmail && testPassword);
const SIGNED_IN_SKIP =
  "Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, LEVELFLOW_E2E_EMAIL and LEVELFLOW_E2E_PASSWORD to run the signed-in navigation tests.";

async function freshSession() {
  const client = createClient(
    supabaseUrl!,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
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
  return data.session;
}

// A stored session, for the whole browser, seeded once — a browser that has
// signed in before. Never re-seeded on later loads: a re-seed would hide the one
// consequence that matters, which is that a token this app decides to drop does
// not come back.
//
// Nothing here marks the browser session as signed in. That is the app's own job
// on the load that consumes a magic link, and the test reaches it the way a
// reader does — so these tests know nothing about WHERE the app keeps that mark,
// only whether a second tab of the same browser can still see it.
//
// The PKCE code verifier is seeded beside the session, and that is the whole
// point of this fixture now. It used to seed the session alone and arrive at
// `/?code=<invented>`, relying on the app treating any URL containing `code=` as
// a sign-in load. That was a real defect wearing a passing test: `?promocode=`
// matched it, and so did the browser autocompleting to someone else's old
// callback on a shared machine. The app now asks PKCE instead — a verifier is
// written by signInWithOtp and removed by exchangeCodeForSession, so its
// presence is the only honest answer to "did THIS browser start a sign-in" — and
// the fixture models a browser that genuinely did.
async function seedStoredSession(page: Page) {
  const session = await freshSession();
  await page.addInitScript(({ key, value, verifierKey }) => {
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, value);
    }
    if (!window.localStorage.getItem(verifierKey)) {
      window.localStorage.setItem(verifierKey, "levelflow-e2e-verifier");
    }
  }, {
    key: storageKey,
    value: JSON.stringify(session),
    verifierKey: `${storageKey}-code-verifier`,
  });
}

// auth-js only exchanges a `code` when it also holds the verifier that flow
// stored (GoTrueClient._isPKCECallback), and the invented code below matches no
// real one — so this arrives as a redirect without asking the network for
// anything, and the stored session above is what the app keeps.
const MAGIC_LINK_ARRIVAL = "/?code=levelflow-e2e-navigation";

function tokenPresent(page: Page) {
  return page.evaluate(
    (key) => window.localStorage.getItem(key) !== null,
    storageKey,
  );
}

// Which surface the reader last left, in the app's own key (App.tsx's
// LAST_TAB_STORAGE_KEY). Seeded once, for the same reason the session is: the app
// rewrites it whenever a persisted tab is active, and a re-seed on every load
// would hide an arrival that overwrote it.
const REMEMBERED_TAB_KEY = "levelflow-last-tab";

async function seedRememberedTab(page: Page, tab: string) {
  await page.addInitScript(({ key, value }) => {
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, value);
    }
  }, { key: REMEMBERED_TAB_KEY, value: tab });
}

function rememberedTab(page: Page) {
  return page.evaluate(
    (key) => window.localStorage.getItem(key),
    REMEMBERED_TAB_KEY,
  );
}

// The document's own opening sentence, read from the module the published files are
// held to (tests/legalDocuments.test.ts), so the browser assertion below cannot
// drift from the words either surface actually ships.
function firstParagraph(slug: string): string {
  return legalDocument(slug as LegalSlug).paragraphs[0];
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

test("the gate is up — signed-out visitors land on parking, not sign-in", async ({ page }) => {
  // Re-parked 2026-08-07 (§17m). The inverse of this assertion ran from launch
  // until then, which is the point of writing it as a claim about the CURRENT
  // public face rather than as an alternation that would pass either way.
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Under construction")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
});

test("the quiet-entry path unlocks sign-in, and holds for the browser session", async ({ page }) => {
  // A doormat, not a lock: ?enter is the owner's way past the gate, and it has
  // to survive a plain navigation afterwards or it would be useless on any
  // screen that reloads. sessionStorage is what carries it, so a NEW browser
  // session lands back on parking — proved by the test above, which runs its
  // own context.
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

// The owner's report of 2026-08-02, walked, at the width he found it and the width
// he asked to have confirmed.
//
// §17o has since taken the new tab off the app's own legal links, so the route this
// walks is no longer the one the app offers by default — but the defect it guards is
// not about that link. It is about what a Levelflow tab does when the app loads in a
// browsing context that never signed in, and every §17o tier keeps at least one way
// to reach that: the published files' hrefs are real (a ⌘-click, a bookmark, a
// search result, a link from another app), and each of those documents still carries
// "Back to Levelflow". So the walk starts where those readers start — the published
// document, in a tab of its own — which is exactly the state the old in-app new tab
// produced, minus the click that produced it.
for (const width of [375, 1280]) {
  test(`a signed-in browser keeps its session through the legal pages at ${width}px`, async ({
    context,
    page,
  }) => {
    test.skip(
      !signedInFlowsConfigured,
      SIGNED_IN_SKIP,
    );
    await page.setViewportSize({ width, height: 812 });
    await seedStoredSession(page);
    await page.goto(MAGIC_LINK_ARRIVAL, { waitUntil: "networkidle" });
    await expectSignedIn(page);

    // The published document, in a tab of its own — a noopener tab's empty
    // sessionStorage shed is what the defect fed on, and context.newPage() is that
    // shed. Same width, because the way back has to work at the width the reader is
    // holding.
    const legalTab = await context.newPage();
    await legalTab.setViewportSize({ width, height: 812 });
    await legalTab.goto("/legal/privacy.html", { waitUntil: "domcontentloaded" });
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
    !signedInFlowsConfigured,
    SIGNED_IN_SKIP,
  );
  // The other half of the fix, and the reason it is not simply "keep the token":
  // a stored session with no live browser session behind it is the next person at
  // the machine, and it must not sign them in — nor still be there afterwards.
  // Reached with no redirect parameter and a cookie jar this browser has never
  // written, which is what a new browser session is.
  await seedStoredSession(page);
  await page.goto("/?enter", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Send magic link" }))
    .toBeVisible();
  // Eventually, not instantly: with a real session the drop is a network
  // round-trip (logout scope=local), and the trace from run 31342412832
  // showed it still in flight when an instant read asserted. The fabricated
  // token this test grew up on failed fast enough to hide the race. The
  // claim being tested is that the token does not OUTLIVE the browser — a
  // stable end-state, which is what a poll asserts.
  await expect
    .poll(() => tokenPresent(page), {
      message: "a stale token outlived its browser",
    })
    .toBe(false);
});

// The satellite pages' own Donate link, followed by a reader who is signed in.
// Both widths because the surface it must land on is two compositions (spec
// §17g: a pinned title over a scrolling body below lg, the flat 620px page at
// ≥lg), while the ask itself is one parameter at every width.
//
// Guide is the remembered tab throughout, and it is chosen: it is a persisted tab
// that asks the analyzer for nothing, so the whole walk can assert what it costs.
for (const width of [375, 1280]) {
  test(`the legal pages' Donate link opens Donate for a signed-in reader at ${width}px`, async ({
    page,
  }) => {
    test.skip(
      !signedInFlowsConfigured,
      SIGNED_IN_SKIP,
    );
    const mobile = width < 1024;
    await page.setViewportSize({ width, height: 812 });
    await seedStoredSession(page);
    await seedRememberedTab(page, "guide");
    // A donate arrival must cost the analyzer nothing: it renders from constants
    // and env, and App's outcome refresh is gated to the Desk and Insights.
    const analyzerCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/functions/v1/")) {
        analyzerCalls.push(request.url());
      }
    });

    await page.goto(MAGIC_LINK_ARRIVAL, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "How to use Levelflow" }))
      .toBeVisible();

    // Reached the way a reader reaches it: the document's own footer link.
    await page.goto("/legal/privacy.html", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Donate", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Donate", exact: true }))
      .toBeVisible();
    await expect(page.getByTestId("mobile-donate-scroll"))
      .toHaveCount(mobile ? 1 : 0);
    // Consumed: the ask is out of the URL, with no navigation and no new history
    // entry. toHaveURL resolves against baseURL and retries, so it waits for the
    // effect that clears it.
    await expect(page).toHaveURL("/");
    expect(
      await rememberedTab(page),
      "the donate arrival overwrote the remembered tab",
    ).toBe("guide");

    // No new entry: Back is the page the reader came from, not the URL they
    // arrived on.
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Levelflow" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/legal/privacy.html");

    // And forward again lands on the cleaned entry, so the reader is not
    // re-trapped on Donate: the remembered tab is what opens.
    await page.goForward({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "How to use Levelflow" }))
      .toBeVisible();

    // The hash form is the same ask, read on the same terms: on load. (From the
    // legal page, so this is a real document load — /#donate typed while the app
    // is already open changes only the fragment, which navigates nothing and
    // re-runs nothing, exactly as it does on the sign-in screen. Nothing in the
    // product emits that form; it is an alternate URL a reader may hold.)
    await page.goto("/legal/terms.html", { waitUntil: "domcontentloaded" });
    await page.goto("/#donate", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Donate", exact: true }))
      .toBeVisible();
    await expect(page).toHaveURL("/");
    expect(await rememberedTab(page)).toBe("guide");

    expect(analyzerCalls, "a donate arrival spent analyzer budget").toEqual([]);
  });
}

// §17o (owner ruling, 2026-08-02): "Test thoroughly for all views and links and
// pages and states." Every walk below runs at both widths, because the surface a
// document lands on is two compositions (§17g's fixed frame below lg, the 880px
// editorial column at ≥lg) and because the link is reached from a different element
// at each — the account menu below lg, the footer's own row at ≥lg.
const DOCUMENTS = [
  { label: "Risk disclaimer", slug: "risk-disclaimer" },
  { label: "Privacy", slug: "privacy" },
  { label: "Terms", slug: "terms" },
];

// The trio, wherever this width keeps it. Below lg that is inside the account menu,
// which has to be opened first; at ≥lg it is the footer row, always on screen.
async function openLegalLink(page: Page, label: string, width: number) {
  if (width < 1024) {
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
    return;
  }
  await page.getByRole("link", { name: label, exact: true }).click();
}

for (const width of [375, 1280]) {
  test(`§17o tier 2 — a signed-in reader reads the documents in the frame at ${width}px`, async ({
    context,
    page,
  }) => {
    test.skip(
      !signedInFlowsConfigured,
      SIGNED_IN_SKIP,
    );
    await page.setViewportSize({ width, height: 812 });
    await seedStoredSession(page);
    await seedRememberedTab(page, "guide");
    const analyzerCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/functions/v1/")) {
        analyzerCalls.push(request.url());
      }
    });
    await page.goto(MAGIC_LINK_ARRIVAL, { waitUntil: "networkidle" });
    // §17o tier 1: "Surfaces have no addresses." So whatever the URL is when the
    // reader arrives is what it stays — compared against itself rather than against
    // a literal, since this harness's own arrival parameter is still on it (auth-js
    // strips only a code it actually consumed).
    const entryUrl = page.url();

    for (const { label, slug } of DOCUMENTS) {
      // No new tab, ever: the surface changes inside the tab the reader is in.
      const before = context.pages().length;
      await openLegalLink(page, label, width);
      await expect(page.getByRole("heading", { name: label, exact: true }))
        .toBeVisible();
      expect(context.pages().length, `${label} spawned a tab`).toBe(before);
      // The document itself, not a link to it: its first paragraph is on screen,
      // and it is the same first paragraph the published file carries.
      await expect(page.getByText(firstParagraph(slug))).toBeVisible();
      // The composition this width is meant to be.
      await expect(page.getByTestId("mobile-document-scroll"))
        .toHaveCount(width < 1024 ? 1 : 0);
      await expect(page.getByTestId("document-panel"))
        .toHaveCount(width < 1024 ? 0 : 1);
      // And the URL is untouched.
      expect(page.url(), `${label} changed the address`).toBe(entryUrl);
    }

    // The reader's own position is never overwritten by any of it.
    expect(await rememberedTab(page)).toBe("guide");
    expect(analyzerCalls, "reading a document spent analyzer budget").toEqual([]);
  });

  test(`§17o tier 1 — Back walks the surfaces a reader visited at ${width}px`, async ({
    page,
  }) => {
    test.skip(
      !signedInFlowsConfigured,
      SIGNED_IN_SKIP,
    );
    await page.setViewportSize({ width, height: 812 });
    await seedStoredSession(page);
    await seedRememberedTab(page, "guide");
    await page.goto(MAGIC_LINK_ARRIVAL, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "How to use Levelflow" }))
      .toBeVisible();

    // Three surfaces deep: Guide (the entry) → Privacy → Terms.
    await openLegalLink(page, "Privacy", width);
    await expect(page.getByRole("heading", { name: "Privacy", exact: true }))
      .toBeVisible();
    await openLegalLink(page, "Terms", width);
    await expect(page.getByRole("heading", { name: "Terms", exact: true }))
      .toBeVisible();

    // Back, twice, walks it in reverse.
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Privacy", exact: true }))
      .toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "How to use Levelflow" }))
      .toBeVisible();
    // Forward returns along the same path.
    await page.goForward();
    await expect(page.getByRole("heading", { name: "Privacy", exact: true }))
      .toBeVisible();

    // No history spam: the same surface, asked for twice, is one entry — so ONE
    // Back from here is the Guide again, not Privacy a second time.
    await openLegalLink(page, "Privacy", width);
    await openLegalLink(page, "Privacy", width);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "How to use Levelflow" }))
      .toBeVisible();

    // And the entry traps nobody: from the surface the reader arrived on, Back is
    // the browser's own — it leaves Levelflow rather than being intercepted.
    await page.goBack();
    await expect(page.getByTestId("content-region")).toHaveCount(0);
  });

  test(`§17o tier 1 — a history move leaves focus somewhere at ${width}px`, async ({
    page,
  }) => {
    test.skip(
      !signedInFlowsConfigured,
      SIGNED_IN_SKIP,
    );
    await page.setViewportSize({ width, height: 812 });
    await seedStoredSession(page);
    await page.goto(MAGIC_LINK_ARRIVAL, { waitUntil: "networkidle" });
    await openLegalLink(page, "Terms", width);
    await expect(page.getByRole("heading", { name: "Terms", exact: true }))
      .toBeVisible();

    await page.goBack();
    // Back can retire the element focus was on. What must never happen is focus
    // falling to the body, which leaves a keyboard reader with nothing to move.
    const landed = await page.evaluate(() => ({
      onBody: document.activeElement === document.body,
      testid: document.activeElement?.getAttribute("data-testid") ?? null,
    }));
    expect(landed.onBody, "a history move stranded focus on the body").toBe(false);
    expect(landed.testid).toBe("content-region");
  });

  test(`§17o tier 2 — signed out, the documents navigate in the same tab at ${width}px`, async ({
    context,
    page,
  }) => {
    // No session at all here, so this one needs no configuration: the sign-in
    // screen's own footer is where a signed-out reader finds the trio.
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/?enter", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Send magic link" }))
      .toBeVisible();

    const before = context.pages().length;
    // At every width: the signed-out screens keep the footer at all widths
    // (satelliteFrame.ts), so the trio is in the footer's row here even at 375.
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await page.waitForLoadState("domcontentloaded");
    expect(context.pages().length, "a signed-out legal link spawned a tab").toBe(
      before,
    );
    expect(new URL(page.url()).pathname).toBe("/legal/privacy.html");
    // The published document, marking itself in its own row (§17o's self-link).
    await expect(
      page.getByRole("link", { name: "Privacy", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    // And Back returns to sign-in, which is the whole point of the same tab.
    await page.goBack({ waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Send magic link" }))
      .toBeVisible();
  });

  test(`§17o tier 2 — sign-in survives the trip to a document at ${width}px`, async ({
    page,
  }) => {
    // The owner delegated this one and the call was to engineer it: same tab means the
    // same session storage, so a reader who wonders what they are agreeing to can read
    // it and come back to the screen they left. Typing, then reading Terms, then Back.
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/?enter", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill("reader@example.com");

    await page.getByRole("link", { name: "Terms", exact: true }).click();
    await page.waitForLoadState("domcontentloaded");
    expect(new URL(page.url()).pathname).toBe("/legal/terms.html");
    await page.goBack({ waitUntil: "networkidle" });

    await expect(page.getByLabel("Email")).toHaveValue("reader@example.com");
  });

  test(`§17o tier 2 — the sent state comes back too, and its own line with it at ${width}px`, async ({
    page,
  }) => {
    // The other half of the draft, reached without asking GoTrue for a real link: the
    // state the screen would be in after a send is exactly the draft it writes, so
    // seeding that draft proves the restore renders "check your email" AND the line
    // naming the address — which comes from one definition shared with the send path.
    // AuthScreen renders `isSupabaseConfigured ? message : "Levelflow isn't
    // connected to the cloud yet."`, so without the client env the restored
    // draft line is REPLACED and this can never pass. The deploy workflow's
    // browser-test step supplies VITE_SUPABASE_URL, so this only ever stands
    // down on a local checkout — and it stands down SAYING SO, rather than
    // failing for the harness's reason while reading as the product's.
    test.skip(
      !process.env.VITE_SUPABASE_URL,
      "needs VITE_SUPABASE_URL — the card shows the unconfigured copy instead of the draft",
    );
    await page.setViewportSize({ width, height: 812 });
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "levelflow-sign-in-draft",
        JSON.stringify({ email: "waiting@example.com", sent: true }),
      );
    });
    await page.goto("/?enter", { waitUntil: "networkidle" });

    await expect(page.getByText("Magic link sent to waiting@example.com."))
      .toBeVisible();
    await expect(page.getByText("open the magic link to continue")).toBeVisible();
  });
}

test("§17o tier 2 — a document survives a refresh by returning the reader home", async ({
  page,
}) => {
  test.skip(
    !signedInFlowsConfigured,
    SIGNED_IN_SKIP,
  );
  // The state model's honest consequence, pinned rather than left to be discovered:
  // surfaces have no addresses (§17o tier 1), so a reload mid-document cannot
  // restore the document — it restores the remembered tab, exactly as a reload on
  // Donate or Guide does. What must NOT happen is a blank frame or a lost session.
  await page.setViewportSize({ width: 375, height: 812 });
  await seedStoredSession(page);
  await seedRememberedTab(page, "guide");
  await page.goto(MAGIC_LINK_ARRIVAL, { waitUntil: "networkidle" });
  await openLegalLink(page, "Terms", 375);
  await expect(page.getByRole("heading", { name: "Terms", exact: true }))
    .toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "How to use Levelflow" }))
    .toBeVisible();
  expect(await tokenPresent(page), "a refresh lost the session").toBe(true);
});

test("§17o tier 3 — the externals still leave, and they are the only ones that do", async ({
  page,
}) => {
  test.skip(
    !signedInFlowsConfigured,
    SIGNED_IN_SKIP,
  );
  // Rendered, not read from source: tests/linkDoctrine.test.ts pins the allowlist
  // across the tree, and this is the same claim in a browser — every anchor the
  // authed app actually draws, and which of them says it is leaving.
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedStoredSession(page);
  await page.goto(MAGIC_LINK_ARRIVAL, { waitUntil: "networkidle" });

  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a")].map((anchor) => ({
      href: anchor.getAttribute("href") ?? "",
      target: anchor.getAttribute("target"),
      rel: anchor.getAttribute("rel"),
    }))
  );
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    // lightweight-charts injects TradingView's attribution link into the chart it
    // draws, with target="_blank" and no rel. It is a true external, so the new tab
    // is right by tier 3; the missing rel belongs to a node this product does not
    // author, and every shipping browser has implied noopener for target="_blank"
    // for years (Chrome 88, Safari 12.1, Firefox 79). Named here rather than waved
    // past with a blanket exemption, so a NEW unrelled tab still fails this.
    if (link.href.includes("tradingview.com")) {
      expect(link.target).toBe("_blank");
      continue;
    }
    const external = link.href.startsWith("http") || link.href.startsWith("mailto:");
    if (link.target === "_blank") {
      expect(external, `${link.href} spawns a tab but never leaves`).toBe(true);
      expect(link.rel, `${link.href} spawns a tab without noopener`).toBe(
        "noopener noreferrer",
      );
    }
    // Our own documents are reached in place — the whole of tier 2.
    if (link.href.includes("/legal/")) {
      expect(link.target, `${link.href} still spawns a tab`).toBeNull();
    }
  }
});
