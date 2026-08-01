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
      ["/icon-192.png", "/icon-512.png", "/brand/levelflow-mark.svg"],
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

describe("§17h — the head links and the card's copy", () => {
  it("declares the icon set with the adaptive SVG last, so it wins by position", () => {
    const order = Array.from(
      INDEX.matchAll(/<link\s+rel="icon"[\s\S]*?\/>/g),
      (match) => match[0].replace(/\s+/g, " "),
    );
    assert.equal(order.length, 4);
    assert.match(order[0], /favicon-16\.png/);
    assert.match(order[1], /favicon-32\.png/);
    assert.match(order[2], /levelflow-mark-dark\.svg.*prefers-color-scheme: dark/);
    assert.match(order[3], /favicon\.svg" type="image\/svg\+xml"/);
    assert.doesNotMatch(order[3], /media=/);
    assert.match(INDEX, /<link rel="apple-touch-icon" href="%BASE_URL%apple-touch-icon\.png" \/>/);
    assert.match(INDEX, /<link rel="manifest" href="%BASE_URL%site\.webmanifest" \/>/);
  });

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
      assert.match(
        source,
        /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml" \/>/,
      );
      // The house mark belongs beside the house's name, not in Levelflow's tab.
      assert.doesNotMatch(source, /windward-line-mark/);
    });
  }
});
