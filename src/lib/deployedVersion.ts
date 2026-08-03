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
 *   rememberRunningBundle below before it renders anything. Nothing here reads
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
 * A mismatch between the two means the tab and the origin disagree about which
 * bundle is current — almost always a deploy that landed under a live tab, and
 * occasionally a read served by a stale edge. bundleChanged below records why the
 * check does not try to tell those two apart. An unknown on either side is never a
 * mismatch: the dev server's entry is `/src/main.tsx` on both sides, a failed read
 * is not evidence of anything, and a notice that guesses is a notice telling a
 * reader to reload for nothing.
 */

// One built entry chunk's identity: the filename Vite emits for it, hash
// included, which is the shortest string that changes on every deploy that
// changes the app.
//
// "Changes the app" is broader than "changes the JavaScript", and measurably so:
// the entry chunk's hash covers its CSS dependency, so a stylesheet-only deploy
// renames it. Measured on this branch, 2026-08-03: adding one rule to
// src/styles/index.css renamed index-BHYRebNL.js to index-CA_EGOiR.js while the
// JavaScript stayed byte-identical (sha256 ccc1d5b0… both times). The notice
// therefore fires on a CSS-only deploy too, which is correct for what it says —
// "Levelflow has updated" is true of one, and the sentence makes no claim about
// JavaScript.
//
// Anchored to the end of the path and to the `assets/` segment, so `base`
// (VITE_BASE_PATH) may put anything in front of it, and so the `.css` twin beside
// the entry — `assets/index-<hash>.css`, one letter of extension away — cannot
// answer instead. That last part is load-bearing: see bundleIdFromHtml.
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
 * The script tag is parsed rather than the document grepped for `index-`, and the
 * reason is a failure mode rather than a false positive on CSS-only deploys (the
 * shipped check fires on those either way — see ENTRY_BUNDLE above). The head
 * carries `assets/index-<hash>.css` two lines from the entry script, same stem,
 * one letter of extension apart, and the two hashes are unrelated. A scan loose
 * enough to match the stylesheet would be comparing a stylesheet's name against
 * the running JS chunk's name — never equal, on any deploy, so the notice would
 * be permanent and no reload could clear it. Reading the tag the browser itself
 * loads is what makes "current" mean the thing a reload would fetch.
 *
 * It fails closed. Case is ignored and either quote style is accepted, but the
 * attribute has to be quoted and unpadded — `type=module` and `type=" module "`
 * both answer null, as does any document this cannot parse, and null is no
 * mismatch. A shape we do not recognise silences the notice rather than raising
 * it. Only the first module script naming a built entry answers.
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
 *
 * Direction-blind, deliberately. This asks whether the two differ, not which is
 * newer — a filename hash carries no order, and nothing else in the document
 * does either. So a read that lands on a stale CDN edge raises the notice as
 * readily as a real deploy does. The cost of that is one reload the reader did
 * not need; the cost of demanding proof of direction would be a notice that stays
 * silent through the case this exists for.
 */
export function bundleChanged(
  running: string | null,
  deployed: string | null,
): boolean {
  return running !== null && deployed !== null && running !== deployed;
}

// The version read's own budget. Shorter than the smallest request this app
// otherwise makes — 12s for the history read (src/lib/tradeAnalyzer.ts) — because
// this one is a single static document off the origin the app was served from, and
// generous enough for a cold mobile radio.
//
// It exists because of what a read that never settles would cost: the hook holds a
// "check in flight" flag to keep a wake from starting a second fetch, and a promise
// that never resolves would leave that flag raised for the life of the tab. The
// detector would retire itself in silence, on the one network bad enough to need
// it. An abort settles it, and the next wake asks again.
export const VERSION_CHECK_TIMEOUT_MS = 8_000;

/**
 * The entry chunk the origin is serving right now, or null if it cannot be read.
 *
 * "/" is the document this app is served from, and the only path that names its
 * entry bundle. Not a rewrite of every route — this origin has none (vercel.json
 * carries headers only), and the other paths it serves are their own documents
 * (public/404.html, public/construction.html, public/legal/*.html), which name no
 * bundle at all. Nor is it a substitute for "the tab's own route": §17o gave
 * surfaces no addresses (src/lib/surfaceHistory.ts writes state and leaves the URL
 * alone), so the tab's route IS "/" for the whole life of the session.
 *
 * A failure is null and a warning for the operator — offline, a captive portal, a
 * deploy mid-flight, a read that outran its budget: none of them is news a reader
 * can act on, and none is evidence that a deploy happened.
 */
export async function readDeployedBundleId(): Promise<string | null> {
  try {
    const response = await fetch("/", {
      cache: "no-store",
      // AbortSignal.timeout rather than the Promise.race in
      // src/lib/tradeAnalyzer.ts: that helper races a promise it cannot cancel,
      // which is the right shape for a Supabase client call and the wrong one
      // here, where the request itself can be dropped instead of left in flight.
      signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS),
    });
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
