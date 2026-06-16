import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const testEmail = process.env.LEVELFLOW_E2E_EMAIL;
const testPassword = process.env.LEVELFLOW_E2E_PASSWORD;

test.skip(!supabaseUrl || !supabaseKey || !testEmail || !testPassword, "Set LevelFlow E2E Supabase and dedicated test-user credentials to run authenticated browser tests.");

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
    throw new Error(`Unable to authenticate LevelFlow E2E user: ${error?.message ?? "No session returned"}`);
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

test("authenticated workspace exposes core premium navigation without stale help text", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Advisor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Insights" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guide" })).toBeVisible();

  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "A market review workspace for high-quality limit-order ideas." })).toBeVisible();
  await expect(page.getByText("Decision support, not execution")).toBeVisible();

  await page.getByRole("button", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { name: "Outcome signal" })).toBeVisible();
  await expect(page.getByText("Status guide")).toHaveCount(0);

  await page.getByRole("button", { name: "Guide" }).click();
  await expect(page.getByRole("heading", { name: "How to operate the review workflow." })).toBeVisible();
  await expect(page.getByText("What LevelFlow checks")).toBeVisible();
});
