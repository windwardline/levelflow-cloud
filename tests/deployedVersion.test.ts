import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  bundleChanged,
  bundleIdFromHtml,
  bundleIdFromUrl,
  readDeployedBundleId,
  rememberRunningBundle,
  runningBundleId,
  VERSION_CHECK_TIMEOUT_MS,
} from "../src/lib/deployedVersion";

// The incident this whole file exists for, 2026-08-03. A reader's tab, left open
// overnight, was running the pre-#174 bundle and spent the morning sending the
// retired all-markets scan request. The analyzer refuses that request by design;
// the old client's catch discards the response body and renders "Market scan
// could not complete. Try again shortly.", so every retry read as a market
// problem and the tab was a dead end. Forensics: 8 claims in
// analyzer_rate_limits, ZERO analyzer_events (the refusal lands before the
// telemetry write), 8 x status 400 in function_edge_logs. The product never said
// the fix was a reload.
//
// Two of the three halves are testable here: the parse of both sides, and the
// failure posture. The third — a live tab watching a real deploy land — is not
// reachable from any harness in this repo (you cannot make the deployed bundle
// change mid-test), which is why the hook's own wiring is source-pinned in
// tests/hooks.test.ts and the e2e suite asserts the notice ABSENT at both widths.

// Copied verbatim from a real `vite build` (vite 8.1.5, 2026-08-03), trimmed to
// the head's structure that matters here: the entry <script type="module">, the
// stylesheet whose name shares the entry's `index-` stem, and the modulepreloads
// of every other chunk. A hand-simplified fixture would have proven the parse
// against a document nothing serves.
const BUILT_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico?v=2" sizes="32x32" />
    <title>Levelflow — Market review</title>
    <script type="module" crossorigin src="/assets/index-D3V586Av.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/rolldown-runtime-D9-fqq9M.js">
    <link rel="modulepreload" crossorigin href="/assets/icons-DYnaBuZW.js">
    <link rel="modulepreload" crossorigin href="/assets/react-eTAt1zIx.js">
    <link rel="modulepreload" crossorigin href="/assets/supabase-gIzaQpO8.js">
    <link rel="modulepreload" crossorigin href="/assets/charts-Cvhezs40.js">
    <link rel="stylesheet" crossorigin href="/assets/index-CX9INZtP.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

describe("the deployed bundle, read from the origin's own document", () => {
  it("names the entry chunk the served document loads", () => {
    assert.equal(bundleIdFromHtml(BUILT_HTML), "index-D3V586Av.js");
  });

  it("reads the module script, not any file whose name happens to match", () => {
    // The stylesheet in the fixture above is `index-CX9INZtP.css` — same stem, same
    // directory, one letter of extension apart — and its hash has nothing to do with
    // the entry chunk's. A scan loose enough to answer with it would be comparing a
    // stylesheet's name against the running JS chunk's name, which are never equal
    // on any deploy: a PERMANENT mismatch, a notice no reload could clear. That, not
    // a CSS-only false positive, is the failure this parse avoids — the check fires
    // on a CSS-only deploy either way, because the entry chunk's hash covers its CSS
    // dependency (measured 2026-08-03: one added rule renamed index-BHYRebNL.js to
    // index-CA_EGOiR.js with byte-identical JavaScript, sha256 ccc1d5b0… both
    // times), and "Levelflow has updated" is true of that deploy.
    const styleOnly = BUILT_HTML.replace(
      /<script[^>]*><\/script>/,
      "",
    );
    assert.equal(bundleIdFromHtml(styleOnly), null);
    assert.equal(
      bundleIdFromHtml(
        '<link rel="stylesheet" href="/assets/index-CX9INZtP.css">',
      ),
      null,
    );
    // The .css twin cannot answer even when it is handed over as a URL directly.
    assert.equal(bundleIdFromUrl("/assets/index-CX9INZtP.css"), null);
  });

  it("fails closed on a tag shape it does not recognise", () => {
    // Vite writes `type="module"`, so the tolerances are the ones HTML actually
    // varies in (case, quote style — the test below) and nothing more. Everything
    // else answers null, which is no mismatch: an unfamiliar document silences the
    // notice instead of raising one nobody can clear.
    for (
      const tag of [
        `<script type=module src="/assets/index-AAAA1111.js"></script>`,
        `<script type=" module " src="/assets/index-AAAA1111.js"></script>`,
        `<script type="text/javascript" src="/assets/index-AAAA1111.js"></script>`,
        `<script type="module">import "/assets/index-AAAA1111.js";</script>`,
      ]
    ) {
      assert.equal(bundleIdFromHtml(tag), null, tag);
    }
  });

  it("survives the attribute order and the quoting the tag could arrive in", () => {
    assert.equal(
      bundleIdFromHtml(`<script src='/assets/index-AAAA1111.js' type='module'></script>`),
      "index-AAAA1111.js",
    );
    assert.equal(
      bundleIdFromHtml(`<SCRIPT TYPE="MODULE" SRC="/assets/index-BBBB2222.js"></SCRIPT>`),
      "index-BBBB2222.js",
    );
  });

  it("answers null for the dev server's document, which serves no bundle", () => {
    // The source index.html itself, which is what `vite dev` and every unit
    // harness see. Read from disk rather than pasted: the day the entry moves,
    // this is the file that moves it.
    assert.match(readFileSync("index.html", "utf8"), /src="\/src\/main\.tsx"/);
    assert.equal(bundleIdFromHtml(readFileSync("index.html", "utf8")), null);
  });

  it("answers null for a document with no module script at all", () => {
    assert.equal(bundleIdFromHtml("<!doctype html><html><body></body></html>"), null);
    assert.equal(bundleIdFromHtml(""), null);
  });
});

describe("the running bundle, read from the entry module's own URL", () => {
  it("takes the built entry chunk's filename, hash included", () => {
    assert.equal(
      bundleIdFromUrl("https://levelflow.windwardline.com/assets/index-D3V586Av.js"),
      "index-D3V586Av.js",
    );
  });

  it("honours a base path, because VITE_BASE_PATH may put anything in front", () => {
    assert.equal(
      bundleIdFromUrl("https://example.test/levelflow/assets/index-D3V586Av.js"),
      "index-D3V586Av.js",
    );
  });

  it("ignores a cache-busting query or fragment, which is not part of a file", () => {
    assert.equal(
      bundleIdFromUrl("http://127.0.0.1:5175/assets/index-D3V586Av.js?t=1754200000000"),
      "index-D3V586Av.js",
    );
    assert.equal(
      bundleIdFromUrl("http://127.0.0.1:5175/assets/index-D3V586Av.js#anything"),
      "index-D3V586Av.js",
    );
  });

  it("answers null for the dev entry and for anything that is not the entry chunk", () => {
    assert.equal(bundleIdFromUrl("http://127.0.0.1:5175/src/main.tsx"), null);
    assert.equal(bundleIdFromUrl("http://127.0.0.1:5175/src/main.tsx?t=1"), null);
    assert.equal(bundleIdFromUrl("https://example.test/assets/react-eTAt1zIx.js"), null);
    assert.equal(bundleIdFromUrl("https://example.test/assets/index-CX9INZtP.css"), null);
    assert.equal(bundleIdFromUrl(""), null);
  });

  it("remembers what the entry module handed it, and nothing else", () => {
    // The entry is the only honest caller: `import.meta.url` inside any other
    // module names the chunk THAT module landed in, which is the entry chunk only
    // for as long as code splitting leaves it there.
    rememberRunningBundle("https://levelflow.windwardline.com/assets/index-D3V586Av.js");
    assert.equal(runningBundleId(), "index-D3V586Av.js");
    rememberRunningBundle("http://127.0.0.1:5175/src/main.tsx");
    assert.equal(runningBundleId(), null);
  });
});

describe("a mismatch is a deploy; an unknown is never one", () => {
  it("calls a different entry chunk a deploy", () => {
    assert.equal(bundleChanged("index-AAAA1111.js", "index-BBBB2222.js"), true);
  });

  it("calls the same entry chunk no news", () => {
    assert.equal(bundleChanged("index-AAAA1111.js", "index-AAAA1111.js"), false);
  });

  it("never claims a deploy from an unknown on either side", () => {
    // Dev serves `/src/main.tsx` on both sides, a failed read answers null, and
    // neither is evidence a deploy happened. A guess here is a notice telling a
    // reader to reload for nothing, forever.
    assert.equal(bundleChanged(null, "index-BBBB2222.js"), false);
    assert.equal(bundleChanged("index-AAAA1111.js", null), false);
    assert.equal(bundleChanged(null, null), false);
  });
});

describe("the version read is quiet when it fails", () => {
  async function withStubs(
    fetchStub: typeof globalThis.fetch,
    body: () => Promise<void>,
  ) {
    const realFetch = globalThis.fetch;
    const realWarn = console.warn;
    const warnings: unknown[][] = [];
    globalThis.fetch = fetchStub;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      await body();
    } finally {
      globalThis.fetch = realFetch;
      console.warn = realWarn;
    }
    return warnings;
  }

  it("asks the origin's own root, uncached, and on a budget", async () => {
    const calls: Array<[unknown, RequestInit]> = [];
    const warnings = await withStubs(
      (async (input: unknown, init: RequestInit) => {
        calls.push([input, init]);
        return new Response(BUILT_HTML, { status: 200 });
      }) as unknown as typeof globalThis.fetch,
      async () => {
        assert.equal(await readDeployedBundleId(), "index-D3V586Av.js");
      },
    );
    assert.equal(calls.length, 1);
    const [path, init] = calls[0];
    // "/" is the document that loads this app, and the only path that names its
    // entry bundle: the origin has no rewrites (vercel.json carries headers only)
    // and its other paths are their own documents. It is not a stand-in for the
    // tab's route either — §17o gave surfaces no addresses, so the route is "/".
    assert.equal(path, "/");
    // no-store, not no-cache: a cached copy of the document answers the question
    // nobody asked.
    assert.equal(init.cache, "no-store");
    // And it can be dropped. A read that never settles would leave the hook's
    // in-flight flag raised for the life of the tab — the detector retiring itself
    // in silence, on the one network bad enough to need it.
    assert.ok(init.signal instanceof AbortSignal, "the read must carry an abort");
    assert.ok(
      VERSION_CHECK_TIMEOUT_MS > 0 && VERSION_CHECK_TIMEOUT_MS <= 12_000,
      `the budget must be positive and no larger than the history read's 12s, got ${VERSION_CHECK_TIMEOUT_MS}`,
    );
    assert.deepEqual(warnings, []);
  });

  it("answers null and warns when the read outruns its budget", async () => {
    // The abort arrives as an AbortError from fetch, which is the same catch as any
    // other failed read: null, one warning, nothing on the surface.
    const warnings = await withStubs(
      (async (_input: unknown, init: RequestInit) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        init.signal?.throwIfAborted();
        throw new DOMException("The operation was aborted.", "AbortError");
      }) as unknown as typeof globalThis.fetch,
      async () => {
        assert.equal(await readDeployedBundleId(), null);
      },
    );
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /^\[deploy\] /);
  });

  it("answers null and warns for the operator when the request throws", async () => {
    const warnings = await withStubs(
      (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof globalThis.fetch,
      async () => {
        assert.equal(await readDeployedBundleId(), null);
      },
    );
    assert.equal(warnings.length, 1);
    // The established prefix family — "[auth]", "[history]", "[profile]" — gains
    // "[deploy]". Loud where it is useful, silent where it is not: offline is not
    // news a reader can act on, and it is not evidence of a deploy either.
    assert.match(String(warnings[0][0]), /^\[deploy\] /);
  });

  it("answers null and warns when the origin refuses the read", async () => {
    const warnings = await withStubs(
      (async () => new Response("nope", { status: 503 })) as unknown as
        typeof globalThis.fetch,
      async () => {
        assert.equal(await readDeployedBundleId(), null);
      },
    );
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /^\[deploy\] /);
  });
});

// Every source file under src/, and the same file with its comments taken out.
// The prose in this wave names the mechanism it implements — deployedVersion.ts's
// header explains import.meta.url at length — so a sweep for a CALL has to read
// code alone, the way tests/languageGuard.test.ts and tests/boxDiscipline.test.ts
// read literals alone.
function sourceFilesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return sourceFilesUnder(path);
    }
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [path]
      : [];
  });
}

function codeOnly(source: string): string {
  // The comment only, never the line it sits on: a trailing comment must not take
  // the call in front of it out of the sweep.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

describe("the entry module is what stamps the running bundle", () => {
  const main = readFileSync("src/main.tsx", "utf8");

  it("hands import.meta.url over before the app renders", () => {
    // Before createRoot, not after: the first analyzer request can be in flight
    // within a render of mount (the Desk's own refresh effects), and a stamp that
    // arrived later would be missing from exactly the requests a stale tab makes
    // first.
    assert.match(main, /rememberRunningBundle\(import\.meta\.url\);/);
    assert.ok(
      main.indexOf("rememberRunningBundle(import.meta.url);") <
        main.indexOf("createRoot("),
      "the stamp must be taken before the app renders",
    );
  });

  it("is the only place in the app that reads import.meta.url", () => {
    // Anywhere else it names whichever chunk the reading module landed in, which
    // is the entry chunk only for as long as code splitting leaves it there. Swept
    // over every source file rather than a listed few, so a second reader cannot
    // arrive unnoticed — and comments are stripped first, because the modules that
    // explain this mechanism have to be able to name it.
    const readers = sourceFilesUnder("src").filter((file) =>
      /import\.meta\.url/.test(codeOnly(readFileSync(file, "utf8")))
    );
    assert.deepEqual(readers, ["src/main.tsx"]);
  });
});

// §17f, owner-approved 2026-08-03: ONE new string in this wave, and it is the
// control. The register technique is tests/parkingGate.test.ts's — the sentence
// verbatim, carried exactly once, in exactly the surface that owns it.
const RELOAD_NOTICE = "Levelflow has updated. Reload to continue.";

describe("the reload notice (§17f — one string, and it is the button)", () => {
  const app = readFileSync("src/App.tsx", "utf8");

  it("carries the owner-approved sentence verbatim, exactly once", () => {
    assert.equal(
      app.split(RELOAD_NOTICE).length - 1,
      1,
      "src/App.tsx must render the approved sentence exactly once",
    );
  });

  it("says nothing else — no caption, no duration, no second sentence", () => {
    const notice = app.match(/function ReloadNotice\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(notice.length > 0, "expected the ReloadNotice component");
    // Every rendered word in the component, enumerated: the technique
    // tests/surfaceComposition.test.ts uses for Attribution. A caption, an icon
    // label, or a "just a moment" would land in this list.
    const rendered = Array.from(
      notice.replace(/className="[^"]*"/g, "").matchAll(
        />\s*([A-Za-z][^<>{}]*?)\s*</g,
      ),
      (match) => match[1],
    );
    assert.deepEqual(rendered, [RELOAD_NOTICE]);
  });

  it("is the market notice's own presentation, with the kit's tap floor", () => {
    // No new chrome: the type is the closed-market notice's exactly
    // (AdvisorWorkspace's marketNotice paragraph — text-sm font-medium
    // text-ink-muted), so this adds a sentence and not a surface. What it adds on
    // top is what makes a notice a control: §17n's 44px floor at both widths, the
    // left alignment a button does not have by default, and the same
    // hover:text-ink every other muted text control in the app takes.
    assert.match(
      app,
      /className="mt-2 flex min-h-11 w-full items-center text-left text-sm font-medium text-ink-muted transition hover:text-ink"/,
    );
    const stage = readFileSync(
      "src/components/workspace/AdvisorWorkspace.tsx",
      "utf8",
    );
    assert.match(stage, /className="mt-3 text-sm font-medium text-ink-muted"/);
    // Flat: the notice draws no box of its own (§17c), which is also why
    // tests/boxDiscipline.test.ts needs no new entry for it.
    assert.doesNotMatch(
      app.match(/function ReloadNotice[\s\S]*?\n\}/)?.[0] ?? "",
      /border|bg-sheet|rounded|shadow/,
    );
  });

  it("reloads on the one tap, and only reloads", () => {
    assert.match(
      app,
      /onClick=\{\(\) => window\.location\.reload\(\)\}/,
    );
  });

  it("belongs to the authed shell and to the pinned masthead", () => {
    // The adjudication, recorded where a future reader will look for it: the
    // sign-in screen is short-lived and a stale one still signs in, so the check
    // is gated on the session and the notice renders in the authed frame only.
    assert.match(app, /useDeployedVersion\(Boolean\(session\)\)/);
    // Inside the masthead, which §17i/§17g pin on both platforms — a notice in the
    // content region could be scrolled away from the reader who needs it.
    const header = app.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    assert.ok(header.length > 0, "expected the masthead");
    assert.match(header, /\{deployMoved \? <ReloadNotice \/> : null\}/);
    // And it is downstream of both pre-auth returns, so no signed-out surface can
    // render it.
    assert.ok(
      app.indexOf("if (!session) {") <
        app.indexOf("{deployMoved ? <ReloadNotice /> : null}"),
      "the notice must render only in the signed-in frame",
    );
  });
});
