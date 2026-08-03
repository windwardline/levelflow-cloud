const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_FETCH_TIMEOUT_MS = 8_000;

export type AuthenticatedSupabaseUser = {
  id: string;
  [key: string]: unknown;
};

export function hasSupabaseRuntimeConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function hasSupabaseAdminConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export async function fetchSingle<T>(token: string, path: string) {
  const rows = await fetchRows<T>(
    token,
    /(?:^|[?&])limit=/.test(path)
      ? path
      : `${path}${path.includes("?") ? "&" : "?"}limit=1`,
  );
  return rows[0] ?? null;
}

export async function fetchRows<T>(
  token: string,
  path: string,
): Promise<T[]> {
  const response = await supabaseFetch(token, path);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

export async function insertSingle(
  token: string,
  table: string,
  payload: Record<string, unknown>,
) {
  const response = await supabaseFetch(token, table, {
    body: JSON.stringify(payload),
    headers: {
      Prefer: "return=representation",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const rows = (await response.json()) as Array<{ id: string }>;
  return rows[0];
}

export async function updateRows<T = unknown>(
  token: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<T[]> {
  const response = await supabaseFetch(token, path, {
    body: JSON.stringify(payload),
    headers: {
      Prefer: "return=representation",
    },
    method: "PATCH",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

export async function upsertRows<T = unknown>(
  token: string,
  table: string,
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
  onConflict: string,
): Promise<T[]> {
  const response = await supabaseFetch(
    token,
    `${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

export async function adminFetchRows<T>(path: string): Promise<T[]> {
  const response = await adminSupabaseFetch(path);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

// `return=minimal` asks PostgREST for no rows back, and PostgREST answers a
// successful insert with 201 and an empty body — not 204. Parsing that body
// threw `SyntaxError: Unexpected end of JSON input` on every insert that
// worked, so recordAnalyzerEvent reported failure for rows already committed
// and the warning drowned the two real runtime errors in the same log window.
// Nothing reads rows this never returns; the response body is simply not read.
export async function adminInsertRows(
  table: string,
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
): Promise<void> {
  const response = await adminSupabaseFetch(table, {
    body: JSON.stringify(payload),
    headers: {
      Prefer: "return=minimal",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  await response.body?.cancel();
}

export async function adminUpdateRows<T = unknown>(
  path: string,
  payload: Record<string, unknown>,
): Promise<T[]> {
  const response = await adminSupabaseFetch(path, {
    body: JSON.stringify(payload),
    headers: {
      Prefer: "return=representation",
    },
    method: "PATCH",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

export async function adminRpcRows<T>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T[]> {
  const response = await adminSupabaseFetch(`rpc/${functionName}`, {
    body: JSON.stringify(payload),
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

export async function adminUpsertRows<T = unknown>(
  table: string,
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
  onConflict: string,
): Promise<T[]> {
  const response = await adminSupabaseFetch(
    `${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

export async function getAuthenticatedUser(
  token: string | null,
): Promise<AuthenticatedSupabaseUser | null> {
  if (!token || !hasSupabaseRuntimeConfig()) {
    return null;
  }

  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY ?? "",
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return typeof user?.id === "string"
    ? user as AuthenticatedSupabaseUser
    : null;
}

export function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = SUPABASE_FETCH_TIMEOUT_MS,
) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

async function supabaseFetch(
  token: string,
  path: string,
  init: RequestInit = {},
) {
  assertRuntimeConfig();
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function adminSupabaseFetch(path: string, init: RequestInit = {}) {
  assertAdminConfig();
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function assertRuntimeConfig() {
  if (!hasSupabaseRuntimeConfig()) {
    throw new Error("Supabase runtime configuration is incomplete.");
  }
}

function assertAdminConfig() {
  if (!hasSupabaseAdminConfig()) {
    throw new Error("Supabase admin configuration is incomplete.");
  }
}
