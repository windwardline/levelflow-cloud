const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ?? "https://financialmodelingprep.com/stable";
const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "https://app.windwardline.com,https://windwardline.github.io,http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const MAX_OPTIONS = 12000;

const directories = [
  { assetType: "Stocks", endpoint: "stock-list", label: "Stocks" },
  { assetType: "ETFs", endpoint: "etf-list", label: "ETFs" },
  { assetType: "Indices", endpoint: "index-list", label: "Indices" },
  { assetType: "Metals", endpoint: "commodities-list", label: "Metals" },
  { assetType: "Forex", endpoint: "forex-list", label: "Forex" },
  { assetType: "Crypto", endpoint: "cryptocurrency-list", label: "Crypto" },
] as const;

type Directory = (typeof directories)[number];

type FmpSymbolRow = {
  currency?: string;
  exchange?: string;
  exchangeShortName?: string;
  name?: string;
  price?: number;
  symbol?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  if (!FMP_API_KEY) {
    return jsonResponse(req, fallbackResponse("FMP API key is not configured"));
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return jsonResponse(req, { error: "Authenticated Supabase session required" }, 401);
  }

  const groups = await Promise.all(directories.map(fetchDirectory));
  const filteredGroups = groups
    .map((group) => ({
      label: group.label,
      options: group.options.filter((option) => option.symbol && option.fmpSymbol),
    }))
    .filter((group) => group.options.length > 0);

  let remaining = MAX_OPTIONS;
  const boundedGroups = filteredGroups
    .map((group) => {
      const options = group.options.slice(0, Math.max(remaining, 0));
      remaining -= options.length;
      return { ...group, options };
    })
    .filter((group) => group.options.length > 0);

  return jsonResponse(req, {
    asOf: new Date().toISOString(),
    groups: boundedGroups,
    provider: "FMP",
    total: boundedGroups.reduce((sum, group) => sum + group.options.length, 0),
    truncated: remaining <= 0,
  });
});

async function fetchDirectory(directory: Directory) {
  try {
    const endpoint = new URL(`${FMP_API_BASE_URL.replace(/\/$/, "")}/${directory.endpoint}`);
    endpoint.searchParams.set("apikey", FMP_API_KEY ?? "");
    const response = await fetch(endpoint);
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(responseText.slice(0, 120));
    }

    const payload = JSON.parse(responseText) as unknown;
    const rows = Array.isArray(payload) ? (payload as FmpSymbolRow[]) : [];

    return {
      label: directory.label,
      options: rows.map((row) => mapRow(directory, row)).filter(Boolean),
    };
  } catch {
    return {
      label: directory.label,
      options: [],
    };
  }
}

function mapRow(directory: Directory, row: FmpSymbolRow) {
  if (!row.symbol || typeof row.symbol !== "string") {
    return null;
  }

  const symbol = row.symbol.trim();
  const name = row.name?.trim() || symbol;
  const exchange = row.exchangeShortName || row.exchange || row.currency || directory.label;

  return {
    assetType: directory.assetType,
    description: name,
    fmpSymbol: symbol,
    label: `${symbol} - ${name}${exchange ? ` (${exchange})` : ""}`,
    symbol,
  };
}

function fallbackResponse(reason: string) {
  return {
    asOf: new Date().toISOString(),
    groups: [],
    provider: "FMP",
    reason,
    total: 0,
  };
}

async function getAuthenticatedUser(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const authorization = req.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return null;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return typeof user?.id === "string" ? user : null;
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "https://app.windwardline.com";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
    status,
  });
}
