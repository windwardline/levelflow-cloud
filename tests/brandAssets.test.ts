import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

// Spec §17h, the owner's chosen mark: "The level lines: a rounded-square tile
// carrying three horizontals from the app's own chart — target (ink, full width),
// entry (accent, full width), stop (ink at 45% opacity, shorter). Canonical
// geometry on a 32-grid: tile rx 7; lines x=7, heights 2.6, rx 1.3, at y 9 /
// 14.7 / 20.4; widths 18 / 18 / 12. Fills come from the app's real tokens (paper
// tile, ink lines, accent entry; dark variant uses the dark-theme values) — the
// mark IS the palette, never approximated hexes."
//
// Both halves of that are pinned here: the geometry against the numbers §17h
// gives, and the fills against src/styles/index.css rather than against a copy of
// the hexes — a mark whose blue is "close to" the accent is the thing the ruling
// forbids, and only reading the real token can catch it.
const CSS = readFileSync("src/styles/index.css", "utf8");
const INDEX = readFileSync("index.html", "utf8");

// Wave 9, item 7: every icon URL in every head carries this version, and so does
// every icon the manifest names. The files themselves stay at their canonical
// paths — legacy agents fetch /favicon.ico unprompted and must keep getting the
// current bytes — so the version lives in the REFERENCE, which is what a client
// with the old product's icon cached at the same URL will refetch on.
//
// One value, asserted everywhere: bumping it is a single conscious edit here plus
// the six heads and the manifest, and a set that disagrees with itself (three
// links bumped, two not) fails rather than half-refreshing.
const ICON_VERSION = "?v=2";

function token(block: string, name: string): string {
  const scope = CSS.match(
    block === "light"
      ? /@theme \{[\s\S]*?\n\}/
      : /html\[data-theme="dark"\] \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
  const value = scope.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6});`))?.[1];
  assert.ok(value, `${name} not found in the ${block} block`);
  return value;
}

// §17h's canonical geometry, transcribed once. Each line is [x, y, width].
const LINES: Array<[number, number, number]> = [
  [7, 9, 18],
  [7, 14.7, 18],
  [7, 20.4, 12],
];

describe("§17h — the mark's geometry", () => {
  for (
    const file of [
      "public/brand/levelflow-mark.svg",
      "public/brand/levelflow-mark-dark.svg",
    ]
  ) {
    it(`${file} draws the tile and three lines on the 32-grid`, () => {
      const svg = readFileSync(file, "utf8");
      assert.match(svg, /viewBox="0 0 32 32"/);
      assert.match(svg, /<rect width="32" height="32" rx="7"/, "tile rx 7");
      for (const [x, y, width] of LINES) {
        assert.match(
          svg,
          new RegExp(
            `<rect x="${x}" y="${y}" width="${width}" height="2\\.6" rx="1\\.3"`,
          ),
          `line at y=${y}, width ${width}`,
        );
      }
      // Exactly four rects: the tile and the three lines, nothing else.
      assert.equal((svg.match(/<rect /g) ?? []).length, 4);
      // The stop line, and only the stop line, is the 45% one.
      const faded = svg.match(/<rect[^>]*opacity="0\.45"[^>]*>/g) ?? [];
      assert.equal(faded.length, 1);
      assert.match(faded[0], /y="20\.4" width="12"/);
    });
  }

  it("takes its fills from the app's real tokens, in both renditions", () => {
    const light = readFileSync("public/brand/levelflow-mark.svg", "utf8");
    const dark = readFileSync("public/brand/levelflow-mark-dark.svg", "utf8");

    // Light: paper tile, ink target, accent entry, ink stop.
    assert.match(light, new RegExp(`rx="7" fill="${token("light", "--color-paper")}"`));
    assert.match(light, new RegExp(`y="9"[^>]*fill="${token("light", "--color-ink")}"`));
    assert.match(light, new RegExp(`y="14.7"[^>]*fill="${token("light", "--color-accent")}"`));
    assert.match(light, new RegExp(`y="20.4"[^>]*fill="${token("light", "--color-ink")}"`));

    // Dark: the dark theme's own values. The tile is --color-sheet, not
    // --color-paper — the app's own token for an elevated plane on paper, so the
    // mark reads as a small card in a tab or a launcher grid instead of
    // dissolving into a dark ground. Still a real token, which is what §17h asks.
    assert.match(dark, new RegExp(`rx="7" fill="${token("dark", "--color-sheet")}"`));
    assert.match(dark, new RegExp(`y="9"[^>]*fill="${token("dark", "--color-ink")}"`));
    assert.match(dark, new RegExp(`y="14.7"[^>]*fill="${token("dark", "--color-accent")}"`));
    assert.match(dark, new RegExp(`y="20.4"[^>]*fill="${token("dark", "--color-ink")}"`));

    // And no hex that is not a token: the "never approximated hexes" clause.
    for (const [name, svg] of [["light", light], ["dark", dark]] as const) {
      const used = new Set(svg.match(/#[0-9A-Fa-f]{6}/g) ?? []);
      const allowed = new Set(
        ["--color-paper", "--color-sheet", "--color-ink", "--color-accent"].map(
          (property) => token(name, property),
        ),
      );
      for (const hex of used) {
        assert.ok(allowed.has(hex), `${name} mark uses non-token hex ${hex}`);
      }
    }
  });

  it("ships one theme-adaptive favicon carrying both renditions' values", () => {
    // Two icon links with complementary `media` cannot be ordered so that both
    // media-honouring and media-ignoring browsers pick the right file. One file
    // that switches itself always can.
    const favicon = readFileSync("public/favicon.svg", "utf8");
    assert.match(favicon, /@media \(prefers-color-scheme: dark\)/);
    assert.match(favicon, new RegExp(`fill: ${token("light", "--color-accent")};`));
    assert.match(favicon, new RegExp(`fill: ${token("dark", "--color-accent")};`));
    assert.match(favicon, /<rect class="tile" width="32" height="32" rx="7"\/>/);
    // The retired pre-overhaul palette is gone from it for good.
    assert.doesNotMatch(favicon, /#F7F8F4|#111C38|#5B8266/i);
  });
});

// Spec §17i: "The mark reaches the satellite pages: mark A rendered small above
// the eyebrow on the parking page, the login hero, the legal trio, and the 404 —
// one consistent treatment."
//
// It reaches them inline rather than as an <img>, which is §17h's own clause doing
// the deciding: "fills come from the app's real tokens — the mark IS the palette,
// never approximated hexes." An <img> loads an isolated document that cannot see a
// custom property, so it could only carry baked hexes and a per-theme file swap;
// inline, every fill is the live token in both stylesheets. And the rendition is
// the one §17h names for a paper ground — "sheet tile with a hairline edge, the
// app's card idiom" — which is also the only rendition needing no swap, since
// sheet, hairline, ink and accent each re-value.
//
// Six surfaces now draw this geometry from four sources (the script, its two SVG
// files, the React component, the static snippet), so the risk is drift rather
// than absence: every one is measured against §17h's own numbers below.
describe("§17i — the mark on the satellite pages", () => {
  const COMPONENT = readFileSync("src/components/LevelflowMark.tsx", "utf8");
  const STATIC_PAGES = [
    "public/404.html",
    "public/construction.html",
    "public/legal/privacy.html",
    "public/legal/risk-disclaimer.html",
    "public/legal/terms.html",
  ];
  // One line, so it can be pinned as a single literal across five documents that
  // share no build step. The tile is inset by half a pixel with a matching radius
  // so its 1px stroke lands inside the 32-grid rather than half outside it.
  const SNIPPET =
    '<svg class="page-mark" viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="0.5" y="0.5" width="31" height="31" rx="6.5" fill="var(--color-sheet)" stroke="var(--color-hairline)"/>' +
    '<rect x="7" y="9" width="18" height="2.6" rx="1.3" fill="var(--color-ink)"/>' +
    '<rect x="7" y="14.7" width="18" height="2.6" rx="1.3" fill="var(--color-accent)"/>' +
    '<rect x="7" y="20.4" width="12" height="2.6" rx="1.3" fill="var(--color-ink)" opacity="0.45"/>' +
    "</svg>";

  it("draws §17h's three lines at §17h's geometry, in the React component", () => {
    assert.match(COMPONENT, /viewBox="0 0 32 32"/);
    for (const [x, y, width] of LINES) {
      assert.match(
        COMPONENT,
        new RegExp(
          `x="${x}"\\s*\\n?\\s*y="${y}"\\s*\\n?\\s*width="${width}"\\s*\\n?\\s*height="2\\.6"\\s*\\n?\\s*rx="1\\.3"`,
        ),
        `line at y=${y}, width ${width}`,
      );
    }
    assert.equal((COMPONENT.match(/<rect/g) ?? []).length, 4);
    assert.equal((COMPONENT.match(/opacity="0\.45"/g) ?? []).length, 1);
  });

  it("takes every fill from a live token, never a hex", () => {
    assert.doesNotMatch(COMPONENT, /#[0-9A-Fa-f]{3,8}/);
    for (
      const property of [
        "--color-sheet",
        "--color-hairline",
        "--color-ink",
        "--color-accent",
      ]
    ) {
      assert.ok(
        COMPONENT.includes(`var(${property})`),
        `the component must read ${property}`,
      );
    }
    // The tokens exist in BOTH stylesheets, which is what makes one snippet
    // correct in the app and on the static pages alike.
    const legalCss = readFileSync("public/legal/legal.css", "utf8");
    for (const property of ["--color-sheet", "--color-hairline", "--color-ink", "--color-accent"]) {
      assert.match(legalCss, new RegExp(`${property}:`), property);
      assert.match(CSS, new RegExp(`${property}:`), property);
    }
  });

  it("is decorative — the wordmark directly beneath it is what carries the name", () => {
    assert.match(COMPONENT, /aria-hidden="true"/);
    assert.doesNotMatch(COMPONENT, /aria-label|role="img"|<title>/);
    for (const page of STATIC_PAGES) {
      assert.match(readFileSync(page, "utf8"), /class="page-mark"[^>]*aria-hidden="true"/, page);
    }
  });

  it("renders it at one size and one spacing on every surface that carries it", () => {
    // 44px with 16px of air under it, above the eyebrow. The React screens say so
    // in utilities and the static pages in a class; both are pinned, so "one
    // consistent treatment" is checkable rather than a promise.
    for (
      const file of [
        "src/components/auth/AuthScreen.tsx",
        "src/components/auth/ParkingScreen.tsx",
      ]
    ) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /<LevelflowMark className="[^"]*\bmb-4\b[^"]*"/, file);
      assert.match(source, /<LevelflowMark className="[^"]*\bh-11 w-11\b[^"]*"/, file);
      // Above the eyebrow, which stays above the wordmark.
      assert.ok(
        source.indexOf("<LevelflowMark") <
          source.indexOf("uppercase tracking-[0.18em]"),
        `${file}: the mark must sit above the eyebrow`,
      );
    }
    const legalCss = readFileSync("public/legal/legal.css", "utf8");
    const pageMark = legalCss.match(/\n\.page-mark \{[^}]*\}/)?.[0] ?? "";
    assert.ok(pageMark.length > 0, "expected .page-mark in legal.css");
    assert.match(pageMark, /height: 44px;/);
    assert.match(pageMark, /width: 44px;/);
    assert.match(pageMark, /margin: 0 0 16px;/);
  });

  it("ships the identical snippet on all five static pages, above each eyebrow", () => {
    for (const page of STATIC_PAGES) {
      const source = readFileSync(page, "utf8");
      assert.ok(source.includes(SNIPPET), `${page} must carry the mark snippet`);
      assert.equal(
        source.split(SNIPPET).length - 1,
        1,
        `${page} must carry it once`,
      );
      assert.ok(
        source.indexOf(SNIPPET) < source.indexOf('class="page-eyebrow"'),
        `${page}: the mark must sit above the eyebrow`,
      );
    }
  });

  it("keeps that snippet in step with the generated files and the component", () => {
    // The four sources of one geometry, cross-checked on the numbers §17h fixes
    // rather than against each other's text, so no single one of them can define
    // "correct" by drifting first.
    const script = readFileSync("scripts/render-brand-assets.mjs", "utf8");
    for (const [x, y, width] of LINES) {
      const line = `x="${x}" y="${y}" width="${width}" height="2.6" rx="1.3"`;
      assert.ok(SNIPPET.includes(line), `snippet: ${line}`);
      assert.ok(script.includes(line), `script: ${line}`);
      assert.ok(
        readFileSync("public/brand/levelflow-mark.svg", "utf8").includes(line),
        `mark file: ${line}`,
      );
    }
    // And the edge rendition's own inset tile, which the script draws for the og
    // card and these surfaces reuse for the same reason (a paper ground).
    const edgeTile = 'x="0.5" y="0.5" width="31" height="31"';
    assert.ok(SNIPPET.includes(edgeTile));
    assert.ok(script.includes(edgeTile));
    assert.ok(COMPONENT.includes('x="0.5"') && COMPONENT.includes('rx="6.5"'));
  });
});

describe("§17h — the raster set and the manifest", () => {
  const RASTERS: Array<[string, number]> = [
    ["public/favicon-16.png", 16],
    ["public/favicon-32.png", 32],
    ["public/apple-touch-icon.png", 180],
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
    ["public/og-image.png", 1200],
  ];

  for (const [file, width] of RASTERS) {
    it(`${file} is a real PNG at ${width}px wide`, () => {
      const png = readFileSync(file);
      // PNG signature, then IHDR's width/height at a fixed offset.
      assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
      assert.equal(png.readUInt32BE(16), width);
      assert.equal(
        png.readUInt32BE(20),
        file.endsWith("og-image.png") ? 630 : width,
      );
      assert.ok(statSync(file).size > 0);
    });
  }

  it("keeps the apple-touch icon fully opaque and square — iOS applies its own mask", () => {
    // A rounded source would show its transparent corners through that mask, and
    // an alpha channel there is how a "solid tile" ends up with grey corners on a
    // home screen. IHDR colour type 2 is truecolour with no alpha.
    const png = readFileSync("public/apple-touch-icon.png");
    assert.equal(png.readUInt8(25), 2, "colour type must be RGB, not RGBA");
  });

  it("wires the manifest to those icons, with the light tokens as its colours", () => {
    const manifest = JSON.parse(readFileSync("public/site.webmanifest", "utf8"));
    assert.equal(manifest.name, "Levelflow");
    assert.equal(manifest.short_name, "Levelflow");
    assert.equal(manifest.start_url, "/");
    // Paper, not accent: theme_color paints the browser's own chrome, and the
    // app's header is paper — an accent band is a colour the product never shows.
    assert.equal(manifest.theme_color, token("light", "--color-paper"));
    assert.equal(manifest.background_color, token("light", "--color-paper"));
    assert.deepEqual(
      manifest.icons.map((icon: { src: string }) => icon.src),
      [
        `/icon-192.png${ICON_VERSION}`,
        `/icon-512.png${ICON_VERSION}`,
        `/brand/levelflow-mark.svg${ICON_VERSION}`,
      ],
    );
  });

  it("regenerates from one committed script, so a palette change is a re-run", () => {
    const script = readFileSync("scripts/render-brand-assets.mjs", "utf8");
    // It must read the tokens rather than carry hexes of its own.
    assert.match(script, /src\/styles\/index\.css/);
    assert.doesNotMatch(script, /#[0-9A-Fa-f]{6}/);
    // Every asset this suite checks is written by it.
    for (
      const asset of [
        "brand/levelflow-mark.svg",
        "brand/levelflow-mark-dark.svg",
        "favicon.svg",
        "favicon-32.png",
        "favicon-16.png",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "og-image.png",
        "favicon.ico",
      ]
    ) {
      assert.ok(script.includes(asset), `the script writes ${asset}`);
    }
  });
});

// Spec §17i, the org standard: "the head carries the full cross-browser set in the
// order Safari and Chrome each need (ICO + sized PNGs + SVG + apple-touch +
// manifest), on the app AND the static pages, so the icon shows in Safari and
// Chrome alike — the standard every repo follows."
//
// Two independently-verified facts sit behind this set, both of them about clients
// this repo cannot test in CI:
//
//   Safari renders no SVG favicon in any shipping version and falls back to the
//   ICO (or the apple-touch icon), so the ICO is not optional decoration — it is
//   the file Safari actually resolves to.
//
//   Chrome would prefer that same ICO over the SVG unless the ICO declares a
//   size, which is what `sizes="32x32"` is for; the SVG then wins on both signals
//   available to it, scalable by declaration and last among equals by position.
//
// Which makes ORDER and ATTRIBUTES the whole content of the ruling, and a guard
// that only counted links would pass a set that shows the wrong icon in Safari.
// So the order is pinned as a sequence, the two decisive attributes are pinned
// individually, and the same set is required on every static page — those pages
// carried a single SVG link, which is precisely the shape Safari ignores.
describe("§17i — the favicon head set, in the order each browser needs", () => {
  const STATIC_PAGES = [
    "public/404.html",
    "public/construction.html",
    "public/legal/privacy.html",
    "public/legal/risk-disclaimer.html",
    "public/legal/terms.html",
  ];

  // rel="icon" links only, in document order, whitespace collapsed.
  function iconLinks(source: string): string[] {
    return Array.from(
      source.matchAll(/<link\s+rel="icon"[\s\S]*?\/>/g),
      (match) => match[0].replace(/\s+/g, " "),
    );
  }

  // The one sequence, expressed as what each position is for. `base` is the href
  // prefix the document uses: Vite rewrites %BASE_URL% in index.html, and the
  // static pages are served as-is with root-absolute hrefs. Every href carries
  // ICON_VERSION — see the version describe below for why.
  function expectTheSet(source: string, base: string, label: string) {
    const order = iconLinks(source);
    assert.equal(order.length, 5, `${label}: expected five rel=icon links`);
    // 1. Safari's pick, sized so Chrome does not take it instead of the SVG.
    assert.equal(
      order[0],
      `<link rel="icon" href="${base}favicon.ico${ICON_VERSION}" sizes="32x32" />`,
      label,
    );
    // 2-3. The raster fallback, for clients that read neither container.
    assert.equal(
      order[1],
      `<link rel="icon" href="${base}favicon-16.png${ICON_VERSION}" type="image/png" sizes="16x16" />`,
      label,
    );
    assert.equal(
      order[2],
      `<link rel="icon" href="${base}favicon-32.png${ICON_VERSION}" type="image/png" sizes="32x32" />`,
      label,
    );
    // 4. The dark rendition, for clients that honour `media` on an icon link.
    assert.match(
      order[3],
      new RegExp(
        `brand/levelflow-mark-dark\\.svg\\${ICON_VERSION}" type="image/svg\\+xml" media="\\(prefers-color-scheme: dark\\)"`,
      ),
      label,
    );
    // 5. The adaptive SVG, last and scalable — the modern pick on both signals.
    assert.equal(
      order[4],
      `<link rel="icon" href="${base}favicon.svg${ICON_VERSION}" type="image/svg+xml" sizes="any" />`,
      label,
    );
    assert.doesNotMatch(order[4], /media=/, label);
    // And the two links outside the rel="icon" family, which no browser resolves
    // against the set above: the iOS home screen and installed-app icons.
    assert.ok(
      source.includes(
        `<link rel="apple-touch-icon" href="${base}apple-touch-icon.png${ICON_VERSION}" />`,
      ),
      `${label}: apple-touch-icon`,
    );
    assert.ok(
      source.includes(
        `<link rel="manifest" href="${base}site.webmanifest${ICON_VERSION}" />`,
      ),
      `${label}: manifest`,
    );
  }

  it("declares the whole set, in order, on the app's own head", () => {
    expectTheSet(INDEX, "%BASE_URL%", "index.html");
  });

  // Item 7's own assertion, independent of the sequence above: EVERY icon
  // reference in EVERY head carries the same version, and so does every icon the
  // manifest names. The live files are byte-correct and served
  // no-cache-revalidate, but a client that cached the previous product's icons at
  // these exact URLs — Safari's favicon database in particular — never asks
  // again. A changed URL is the only thing that makes it ask.
  it("versions every icon reference, identically, on every head and in the manifest", () => {
    const heads: Array<[string, string]> = [
      ["index.html", INDEX],
      ...STATIC_PAGES.map((page) =>
        [page, readFileSync(page, "utf8")] as [string, string]
      ),
    ];
    for (const [label, source] of heads) {
      const hrefs = Array.from(
        source.matchAll(
          /<link\s+rel="(?:icon|apple-touch-icon|manifest)"[\s\S]*?href="([^"]+)"/g,
        ),
        (match) => match[1],
      );
      assert.equal(hrefs.length, 7, `${label}: expected seven icon references`);
      for (const href of hrefs) {
        assert.ok(
          href.endsWith(ICON_VERSION),
          `${label}: ${href} carries no ${ICON_VERSION}`,
        );
        // The version is a query on the canonical path, never a renamed file:
        // the bytes must stay reachable at /favicon.ico for clients that ask for
        // it without being told to.
        assert.doesNotMatch(href, /-v2|_v2/, `${label}: ${href}`);
      }
    }
    const manifest = JSON.parse(readFileSync("public/site.webmanifest", "utf8"));
    for (const icon of manifest.icons as Array<{ src: string }>) {
      assert.ok(
        icon.src.endsWith(ICON_VERSION),
        `manifest icon ${icon.src} carries no ${ICON_VERSION}`,
      );
    }
  });

  it("mirrors it on the 404 and the legal trio, root-absolute", () => {
    for (const page of STATIC_PAGES) {
      const source = readFileSync(page, "utf8");
      expectTheSet(source, "/", page);
      // Root-absolute matters here specifically: these hrefs must resolve the same
      // from /404.html and from /legal/terms.html, which a relative one would not.
      for (const link of iconLinks(source)) {
        assert.match(link, /href="\//, `${page}: ${link}`);
      }
    }
  });

  it("ships a well-formed .ico container — parsed, not assumed", () => {
    // An ICO that no client can read is worse than no ICO at all, because the set
    // above hands it to Safari first. So the container is walked: the header, then
    // every directory entry, then each payload.
    const ico = readFileSync("public/favicon.ico");
    assert.equal(ico.readUInt16LE(0), 0, "reserved field must be zero");
    assert.equal(ico.readUInt16LE(2), 1, "type must be 1 (icon)");
    const count = ico.readUInt16LE(4);
    assert.equal(count, 2, "16 and 32, the two sizes the script renders");

    const declared: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const entry = 6 + index * 16;
      // 0 means 256 in this format; neither of ours is that big.
      const width = ico.readUInt8(entry);
      const height = ico.readUInt8(entry + 1);
      assert.equal(width, height, `entry ${index} must be square`);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      assert.ok(length > 0, `entry ${index} declares an empty payload`);
      assert.ok(
        offset >= 6 + count * 16 && offset + length <= ico.length,
        `entry ${index} points outside the file`,
      );
      // A PNG payload, which every browser since IE11 reads — and the payload's
      // own IHDR has to agree with the size the directory advertises, or a client
      // scales the wrong bitmap into a tab.
      const payload = ico.subarray(offset, offset + length);
      assert.equal(
        payload.subarray(1, 4).toString("ascii"),
        "PNG",
        `entry ${index} is not a PNG payload`,
      );
      assert.equal(payload.readUInt32BE(16), width, `entry ${index} width`);
      assert.equal(payload.readUInt32BE(20), height, `entry ${index} height`);
      declared.push(width);
    }
    assert.deepEqual(declared.sort((a, b) => a - b), [16, 32]);
    // The payloads are the very files the raster set links, so the ICO and the
    // PNGs can never show different art.
    for (const size of [16, 32]) {
      const png = readFileSync(`public/favicon-${size}.png`);
      assert.ok(ico.includes(png), `favicon-${size}.png must be the ICO's payload`);
    }
  });
});

describe("§17h — the head links and the card's copy", () => {

  it("says nothing new — the card's copy is the app's own two strings (§17f)", () => {
    const AUTH_LINE =
      "One page that reads the market for you: live charts, timing, and only the trade setups that survive review.";
    const auth = readFileSync("src/components/auth/AuthScreen.tsx", "utf8");
    // Read from the component, not restated, so a rewrite there fails here.
    assert.ok(
      auth.replace(/\s+/g, " ").includes(AUTH_LINE.replace(/\s+/g, " ")),
      "the auth screen still opens with this line",
    );
    const head = INDEX.replace(/\s+/g, " ");
    assert.ok(head.includes(`content="${AUTH_LINE}"`), "og:description");
    assert.ok(
      (head.match(new RegExp(AUTH_LINE.replace(/[.:]/g, "\\$&"), "g")) ?? [])
        .length === 2,
      "the same line serves as the meta description too — one description, not two",
    );
    // The title is this document's own <title>.
    assert.match(INDEX, /<title>Levelflow — Market review<\/title>/);
    assert.match(
      INDEX,
      /<meta property="og:title" content="Levelflow — Market review" \/>/,
    );
    // The retired marketing sentence is gone.
    assert.doesNotMatch(INDEX, /premium market-analysis workspace/);
  });

  it("points the card at an absolute image URL with its real dimensions", () => {
    const head = INDEX.replace(/\s+/g, " ");
    assert.ok(head.includes('content="https://levelflow.windwardline.com/og-image.png"'));
    assert.ok(head.includes('<meta property="og:image:width" content="1200" />'));
    assert.ok(head.includes('<meta property="og:image:height" content="630" />'));
    assert.ok(head.includes('<meta name="twitter:card" content="summary_large_image" />'));
    assert.ok(head.includes("og:image:alt"), "the card carries alt text");
  });
});

describe("§17h — the static pages stop borrowing another division's mark", () => {
  const PAGES = [
    "public/404.html",
    "public/construction.html",
    "public/legal/privacy.html",
    "public/legal/risk-disclaimer.html",
    "public/legal/terms.html",
  ];

  for (const page of PAGES) {
    it(`${page} links Levelflow's own icon`, () => {
      const source = readFileSync(page, "utf8");
      // The whole cross-browser set since §17i (pinned in order above); what this
      // guard still owns is whose mark it is.
      assert.match(
        source,
        new RegExp(
          `<link rel="icon" href="/favicon\\.svg\\${ICON_VERSION}" type="image/svg\\+xml" sizes="any" />`,
        ),
      );
      // The house mark belongs beside the house's name, not in Levelflow's tab.
      assert.doesNotMatch(source, /windward-line-mark/);
    });
  }
});
