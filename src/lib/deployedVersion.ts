/**
 * Which bundle this tab is running, and which one the origin now serves.
 *
 * The incident this exists for, 2026-08-03. A reader's tab, left open overnight,
 * was running the pre-#174 bundle and spent the morning sending the retired
 * all-markets scan request — the empty-symbols form the analyzer stopped
 * accepting when one scan became several request-sized scans. The server refuses
 * it by design and says why in the body; the old client's catch discards the
 * body and renders "Market scan could not complete. Try again shortly.", so
 * every retry read as a quiet market rather than as a tab that had been left
 * behind. Forensically: 8 claims in analyzer_rate_limits, ZERO analyzer_events
 * (the refusal lands before the telemetry write), and 8 x status 400 in
 * function_edge_logs. Reloading was the whole fix, and nothing in the product
 * said so.
 *
 * The mechanism, in its two halves, and what makes each honest:
 *
 * - The RUNNING bundle is the entry module's own URL. `import.meta.url` in
 *   src/main.tsx resolves at runtime to the entry chunk the browser actually
 *   loaded (`/assets/index-<hash>.js` in a build), and main.tsx hands it to
 *   rememberRunningBundle below on its first line. Nothing here reads
 *   import.meta.url itself: in any other module it names the chunk THAT module
 *   was bundled into, which is the entry chunk only for as long as code
 *   splitting leaves it there — true today, and silently untrue the day a lazy
 *   import moves it.
 * - The DEPLOYED bundle is the `<script type="module">` tag in the document the
 *   origin serves at "/". That tag is what the browser would load on a reload,
 *   which makes it the only definition of "current" that matters here. Read with
 *   cache: "no-store", because a cached copy of the document answers the
 *   question nobody asked.
 *
 * A mismatch between the two is a deploy that landed under a live tab. An
 * unknown on either side is never a mismatch (bundleChanged): the dev server's
 * entry is `/src/main.tsx` on both sides, a failed read is not evidence of
 * anything, and a notice that guesses is a notice telling a reader to reload for
 * nothing.
 */

// One built entry chunk's identity: the filename Vite emits for it, hash
// included, which is the shortest string that changes on every deploy that
// changes the app. Anchored to the end of the path and to the `assets/` segment
// so `base` (VITE_BASE_PATH) may put anything in front of it, and so the
// stylesheet that shares the entry's `index-` stem — `assets/index-<hash>.css`,
// one letter of extension away — can never answer instead.
const ENTRY_BUNDLE = /(?:^|\/)assets\/(index-[A-Za-z0-9_-]+\.js)$/;

/** The entry chunk named by a URL or path, or null if it names no built one. */
export function bundleIdFromUrl(url: string): string | null {
  // Query and fragment stripped first: the dev server appends `?t=…` to module
  // URLs, and a cache-busting parameter is not part of a file's identity.
  const path = url.split(/[?#]/)[0];
  return path.match(ENTRY_BUNDLE)?.[1] ?? null;
}

/**
 * The entry chunk a served document loads, or null if it loads no built one.
 *
 * The script tag is parsed rather than the document grepped for `index-`: the
 * head also carries a stylesheet with the same stem and five modulepreloads, and
 * a check driven by any of those would fire on deploys that changed no
 * JavaScript at all. Case and quoting are both loose because HTML permits both;
 * only the first module script with a built entry answers.
 */
export function bundleIdFromHtml(html: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype\s*=\s*["']module["']/i.test(tag)) {
      continue;
    }
    const source = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    const bundle = source ? bundleIdFromUrl(source) : null;
    if (bundle) {
      return bundle;
    }
  }
  return null;
}

// Set once, by the entry module, and read by the two callers that need the tab's
// own identity: the deploy check (src/hooks/useDeployedVersion.ts) and the build
// stamp every analyzer request carries (src/lib/tradeAnalyzer.ts). Module scope
// because the value belongs to the document rather than to any component, and
// because threading it as a prop would reach the analyzer client through every
// surface between App and a scan click.
let runningBundle: string | null = null;

/**
 * Records the running bundle from the entry module's own URL.
 *
 * Called exactly once, from src/main.tsx, with `import.meta.url` — see this
 * file's header for why the entry is the only honest caller.
 */
export function rememberRunningBundle(url: string): void {
  runningBundle = bundleIdFromUrl(url);
}

/** The running entry chunk, or null when there is no built bundle to name. */
export function runningBundleId(): string | null {
  return runningBundle;
}

/**
 * Whether the origin has moved on from what this tab is running.
 *
 * Both sides must be known. An unknown is not a mismatch: in dev both are null,
 * and a read that failed says nothing about what is deployed.
 */
export function bundleChanged(
  running: string | null,
  deployed: string | null,
): boolean {
  return running !== null && deployed !== null && running !== deployed;
}

/**
 * The entry chunk the origin is serving right now, or null if it cannot be read.
 *
 * "/" rather than the tab's own route: every route rewrites to this document
 * (vercel.json), so it is the one path that answers the same way from anywhere in
 * the app. A failure is null and a warning for the operator — offline, a captive
 * portal, or a deploy mid-flight are none of them news a reader can act on, and
 * none of them is evidence that a deploy happened.
 */
export async function readDeployedBundleId(): Promise<string | null> {
  try {
    const response = await fetch("/", { cache: "no-store" });
    if (!response.ok) {
      console.warn("[deploy] version check refused", response.status);
      return null;
    }
    return bundleIdFromHtml(await response.text());
  } catch (error) {
    console.warn("[deploy] version check failed", error);
    return null;
  }
}
