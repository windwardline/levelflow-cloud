import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const testEmail = process.env.LEVELFLOW_E2E_EMAIL;
const testPassword = process.env.LEVELFLOW_E2E_PASSWORD;

test.skip(
  !supabaseUrl || !supabaseKey || !testEmail || !testPassword,
  "Set LevelFlow E2E Supabase and dedicated test-user credentials to run authenticated browser tests.",
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
      `Unable to authenticate LevelFlow E2E user: ${error?.message ?? "No session returned"}`,
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

test("authenticated workspace exposes core premium navigation without stale help text", async ({
  page,
}) => {
  await page.goto("/");

  const navLabels = await page
    .locator("nav button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.textContent?.trim()),
    );
  expect(navLabels).toEqual([
    "Advisor",
    "Insights",
    "Profile",
    "Guide",
    "About",
  ]);

  await page.getByRole("button", { name: "About" }).click();
  await expect(
    page.getByRole("heading", {
      name: "A premium market review workspace for disciplined traders.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Review support, not trade placement"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Insights" }).click();
  await expect(
    page.getByRole("heading", { name: "What is improving" }),
  ).toBeVisible();
  await expect(page.getByText("Status guide")).toHaveCount(0);

  await page.getByRole("button", { name: "Guide" }).click();
  await expect(
    page.getByRole("heading", { name: "How to use LevelFlow." }),
  ).toBeVisible();
  await expect(page.getByText("What LevelFlow checks")).toBeVisible();
});
