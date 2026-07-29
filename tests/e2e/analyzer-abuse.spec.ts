import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const testEmail = process.env.LEVELFLOW_E2E_EMAIL;
const testPassword = process.env.LEVELFLOW_E2E_PASSWORD;

test.skip(
  !supabaseUrl || !supabaseKey || !testEmail || !testPassword,
  "Set Levelflow E2E Supabase and dedicated test-user credentials to run analyzer abuse tests.",
);

test("trade analyzer caps repeated market scans without server errors", async () => {
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
      `Unable to authenticate Levelflow E2E user: ${error?.message ?? "No session returned"}`,
    );
  }

  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      fetch(`${supabaseUrl}/functions/v1/trade-analyzer`, {
        body: JSON.stringify({
          action: "scan_opportunities",
          symbols: ["RATE_LIMIT_TEST"],
        }),
        headers: {
          apikey: supabaseKey!,
          authorization: `Bearer ${data.session!.access_token}`,
          "content-type": "application/json",
        },
        method: "POST",
      })
    ),
  );
  const statuses = responses.map((response) => response.status);

  expect(statuses).toContain(429);
  expect(statuses.every((status) => status === 200 || status === 429)).toBe(
    true,
  );
});
