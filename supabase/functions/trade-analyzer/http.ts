const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ??
  "https://levelflow.windwardline.com,https://windwardline.github.io,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5175,http://localhost:5175")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export function getBearerToken(req: Request) {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null;
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0] ?? "https://levelflow.windwardline.com";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
    status,
  });
}
