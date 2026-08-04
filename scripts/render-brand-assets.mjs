// Generates the whole Levelflow brand asset set from spec §17h's geometry and
// the app's own colour tokens. Committed and reproducible: `node
// scripts/render-brand-assets.mjs` rewrites every file below byte-for-byte, so a
// palette change is a re-run rather than a redraw, and nobody has to keep a
// design tool in the loop to fix a hex.
//
// §17h: "The level lines: a rounded-square tile carrying three horizontals from
// the app's own chart — target (ink, full width), entry (accent, full width),
// stop (ink at 45% opacity, shorter). Canonical geometry on a 32-grid: tile rx 7;
// lines x=7, heights 2.6, rx 1.3, at y 9 / 14.7 / 20.4; widths 18 / 18 / 12.
// Fills come from the app's real tokens (paper tile, ink lines, accent entry;
// dark variant uses the dark-theme values) — the mark IS the palette, never
// approximated hexes."
//
// Writes:
//   public/brand/levelflow-mark.svg        the light rendition
//   public/brand/levelflow-mark-dark.svg   the dark rendition
//   public/favicon.svg                     one file, theme-adaptive (see below)
//   public/favicon-32.png, favicon-16.png  raster fallbacks
//   public/apple-touch-icon.png            180, solid tile, no alpha
//   public/icon-192.png, icon-512.png      manifest icons
//   public/og-image.png                    1200x630 editorial card
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

// ---------------------------------------------------------------- the palette

// Read, never restated. The light values live in @theme and the dark ones in the
// html[data-theme="dark"] block, which is exactly where the app reads them from.
function tokens() {
  const css = readFileSync(join(ROOT, "src/styles/index.css"), "utf8");
  const read = (block, name) => {
    // Plain string scan + literal regex — same `name:\s*(#hex);` contract as
    // before, without constructing a RegExp from a string.
    const at = block.indexOf(`${name}:`);
    const end = at === -1 ? -1 : block.indexOf(";", at);
    const raw = at === -1 || end === -1 ? "" : block.slice(at + name.length + 1, end);
    const value = /^\s*(#[0-9A-Fa-f]{6})$/.exec(raw)?.[1];
    if (!value) {
      throw new Error(`${name} not found — src/styles/index.css moved it`);
    }
    return value;
  };
  const theme = css.match(/@theme \{[\s\S]*?\n\}/)?.[0] ?? "";
  const dark = css.match(/html\[data-theme="dark"\] \{[\s\S]*?\n\}/)?.[0] ?? "";
  return {
    light: {
      // The tile is the light theme's paper, per §17h.
      tile: read(theme, "--color-paper"),
      ink: read(theme, "--color-ink"),
      accent: read(theme, "--color-accent"),
      muted: read(theme, "--color-ink-muted"),
      paper: read(theme, "--color-paper"),
      sheet: read(theme, "--color-sheet"),
      hairline: read(theme, "--color-hairline"),
    },
    dark: {
      // The dark tile is --color-sheet, not --color-paper. A tile equal to the
      // dark paper is a tile with nothing under it: the mark's whole job in a
      // browser tab or a PWA grid is to read as a small card, and --color-sheet
      // is precisely the app's own token for "an elevated plane on paper" — one
      // step above it, warm, and a real token rather than an approximated hex,
      // which §17h forbids. The three lines carry the contrast either way
      // (cream on warm ink).
      tile: read(dark, "--color-sheet"),
      ink: read(dark, "--color-ink"),
      accent: read(dark, "--color-accent"),
      muted: read(dark, "--color-ink-muted"),
      paper: read(dark, "--color-paper"),
    },
  };
}

// ------------------------------------------------------------------- the mark

// §17h's canonical geometry, in one place. `rounded` false drops the tile's
// corner radius, which is what the apple-touch icon needs: iOS applies its own
// mask, so the source has to be a full-bleed square with no transparent corners.
// `edge` draws a hairline ring on the tile — the app's own card idiom for an
// elevated plane sitting on a same-family surface (border-hairline + bg-sheet).
// The og card is the one place that needs it: a paper tile on the paper card
// reads as three floating lines, which is the dark rendition's lesson repeated.
function markSvg({ tile, ink, accent }, { rounded = true, size = 32, edge } = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" role="img" aria-label="Levelflow">`,
    edge
      ? `  <rect x="0.5" y="0.5" width="31" height="31"${rounded ? ' rx="6.5"' : ""} fill="${tile}" stroke="${edge}" stroke-width="1"/>`
      : `  <rect width="32" height="32"${rounded ? ' rx="7"' : ""} fill="${tile}"/>`,
    `  <rect x="7" y="9" width="18" height="2.6" rx="1.3" fill="${ink}"/>`,
    `  <rect x="7" y="14.7" width="18" height="2.6" rx="1.3" fill="${accent}"/>`,
    `  <rect x="7" y="20.4" width="12" height="2.6" rx="1.3" fill="${ink}" opacity="0.45"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

// One favicon file that follows the reader's theme. Two <link rel="icon"> tags
// with `media` cannot be ordered so that both media-honouring and
// media-ignoring browsers land on the right rendition — whichever comes last
// wins for the second kind — so the single file carries the switch itself and
// the tags are belt to its braces. The <style> lives inside an SVG loaded as an
// image, which the page's style-src does not reach.
function adaptiveFaviconSvg(palette) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Levelflow">`,
    `  <style>`,
    `    .tile { fill: ${palette.light.tile}; }`,
    `    .ink { fill: ${palette.light.ink}; }`,
    `    .accent { fill: ${palette.light.accent}; }`,
    `    @media (prefers-color-scheme: dark) {`,
    `      .tile { fill: ${palette.dark.tile}; }`,
    `      .ink { fill: ${palette.dark.ink}; }`,
    `      .accent { fill: ${palette.dark.accent}; }`,
    `    }`,
    `  </style>`,
    `  <rect class="tile" width="32" height="32" rx="7"/>`,
    `  <rect class="ink" x="7" y="9" width="18" height="2.6" rx="1.3"/>`,
    `  <rect class="accent" x="7" y="14.7" width="18" height="2.6" rx="1.3"/>`,
    `  <rect class="ink" x="7" y="20.4" width="12" height="2.6" rx="1.3" opacity="0.45"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

// --------------------------------------------------------------------- .ico

// /favicon.ico is requested by path, without a link tag, by enough crawlers and
// legacy clients to be worth keeping — and the one in the repo before this
// carried the retired pre-overhaul palette, which is worse than a 404. Built
// here from the PNGs already rendered: an ICO directory may point at PNG
// payloads directly (every browser since IE11 reads them), so this needs no
// encoder and no dependency.
function icoFrom(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width, 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size: none
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([
    header,
    ...entries,
    ...images.map((image) => image.data),
  ]);
}

// ------------------------------------------------------------- the og-image

// The card §17h describes: "the card itself stays editorial: wordmark, accent
// rule, 'Market review — daily edition'". Its composition is the auth screen's
// own hero in the same order (eyebrow, wordmark, rule) and every string on it
// already exists in the app — §17f: no new copy for a social card.
function ogHtml({ light }, spaceGroteskDataUri) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: "Space Grotesk Card";
    font-weight: 100 900;
    src: url(${spaceGroteskDataUri}) format("woff2-variations");
  }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; background: ${light.paper}; color: ${light.ink};
    font-family: "Space Grotesk Card", sans-serif;
    padding: 88px 96px; position: relative; overflow: hidden;
    display: flex; flex-direction: column; justify-content: center;
  }
  .eyebrow {
    font-size: 26px; font-weight: 600; letter-spacing: 0.18em;
    text-transform: uppercase; color: ${light.muted};
  }
  .eyebrow em { font-style: normal; color: ${light.accent}; }
  .wordmark {
    font-size: 190px; font-weight: 700; letter-spacing: -0.02em;
    line-height: 0.95; margin-top: 34px;
  }
  .rule { width: 168px; height: 6px; background: ${light.accent}; margin-top: 40px; }
  .mark { position: absolute; right: 96px; bottom: 88px; }
</style></head>
<body>
  <p class="eyebrow">Market review — <em>daily edition</em></p>
  <p class="wordmark">Levelflow</p>
  <div class="rule"></div>
  <div class="mark">${
    markSvg(
      { tile: light.sheet, ink: light.ink, accent: light.accent },
      { size: 104, edge: light.hairline },
    )
  }</div>
</body></html>`;
}

// ------------------------------------------------------------------- render

async function main() {
  const palette = tokens();
  const lightMark = markSvg(palette.light);
  const darkMark = markSvg(palette.dark);

  writeFileSync(join(PUBLIC, "brand/levelflow-mark.svg"), lightMark);
  writeFileSync(join(PUBLIC, "brand/levelflow-mark-dark.svg"), darkMark);
  writeFileSync(join(PUBLIC, "favicon.svg"), adaptiveFaviconSvg(palette));

  const spaceGrotesk = readFileSync(
    join(
      ROOT,
      "node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
    ),
  );
  // Embedded rather than linked: the card must render with the repo's own
  // self-hosted display face every time, with no network and no system
  // substitution deciding what "Levelflow" looks like.
  const fontUri = `data:font/woff2;base64,${spaceGrotesk.toString("base64")}`;

  const browser = await chromium.launch();
  try {
    for (
      const [file, size, options] of [
        ["favicon-32.png", 32, {}],
        ["favicon-16.png", 16, {}],
        ["icon-192.png", 192, {}],
        ["icon-512.png", 512, {}],
        // iOS masks this one itself, so it ships square and fully opaque.
        ["apple-touch-icon.png", 180, { rounded: false, opaque: true }],
      ]
    ) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}html,body{width:${size}px;height:${size}px}svg{display:block}</style></head><body>${
          markSvg(palette.light, { rounded: options.rounded ?? true, size })
        }</body></html>`,
      );
      await page.screenshot({
        path: join(PUBLIC, file),
        clip: { x: 0, y: 0, width: size, height: size },
        omitBackground: !options.opaque,
      });
      await page.close();
      console.log(`wrote public/${file} (${size}x${size})`);
    }

    writeFileSync(
      join(PUBLIC, "favicon.ico"),
      icoFrom(
        [16, 32].map((size) => ({
          size,
          data: readFileSync(join(PUBLIC, `favicon-${size}.png`)),
        })),
      ),
    );
    console.log("wrote public/favicon.ico (16, 32)");

    const card = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    await card.setContent(ogHtml(palette, fontUri));
    await card.evaluate(() => document.fonts.ready);
    await card.screenshot({
      path: join(PUBLIC, "og-image.png"),
      clip: { x: 0, y: 0, width: 1200, height: 630 },
    });
    await card.close();
    console.log("wrote public/og-image.png (1200x630)");
  } finally {
    await browser.close();
  }

  console.log(
    `mark palette — light tile ${palette.light.tile} / dark tile ${palette.dark.tile}`,
  );
}

await main();
