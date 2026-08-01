import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// C1 regression guard. Tailwind v4's build-time scanner greps source text
// for complete, statically-analyzable class name tokens — it does not
// execute any code. A class name whose variant prefix and base utility are
// assembled at runtime via template-literal interpolation (e.g.
// AdvisorWorkspace.tsx's old `` `lg:${display}` ``) never appears as a real
// "lg:block"/"lg:flex"/... substring anywhere in the source, so Tailwind
// never generates the matching rule into the built CSS: the element is
// silently display:none (or whatever the un-prefixed base resolves to) at
// every width the variant was supposed to apply at. That was C1 — the
// Desk's scan and trades rails were display:none at every width because of
// exactly this shape of bug. This scans every source file for the same
// shape under every variant prefix this codebase's className strings
// actually use, so it can't quietly recur under a different one (`sm:`,
// `dark:`, `hover:`, …) the next time someone reaches for the same
// shortcut.
const SOURCE_ROOT = "src";
const VARIANT_PREFIXES = [
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  // The max-* family, which this codebase leans on hardest: §17g made every
  // surface below lg its own composition, so max-lg: is now the prefix most of
  // the app's breakpoint work is written in — and it was the one family this
  // guard could not see. A `max-lg:${…}` is C1 in the direction that matters
  // most here, because the branch it silently drops is the mobile one.
  "max-sm",
  "max-md",
  "max-lg",
  "max-xl",
  "max-2xl",
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "disabled",
  "dark",
  "group-hover",
  "peer-hover",
  "motion-reduce",
  "motion-safe",
];
// Two families whose value is part of the prefix, so they cannot be enumerated:
// an attribute variant (`aria-expanded:`, `data-open:`) and an arbitrary-value
// one (`min-[900px]:`, `supports-[display:grid]:`). Neither is reachable through
// the word-boundary accident described below, and both would fail exactly the
// same way.
const VARIANT_SHAPES = [
  "(?:aria|data)-[a-z][a-z-]*",
  "(?:min|max|supports|has|not|group-has|peer-has)-\\[[^\\]]*\\]",
];
const INTERPOLATED_VARIANT = new RegExp(
  `\\b(?:${[...VARIANT_PREFIXES, ...VARIANT_SHAPES].join("|")}):\\$\\{`,
);

function allSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => join(root, file));
}

// A guard for the guard. The max-* family was already caught before it was
// listed — by accident: `\b` matches between the hyphen and the `l` of
// `max-lg:`, so the bare `lg` alternative was doing the work. That is exactly
// the kind of coverage that disappears the day someone tightens the pattern to
// `(?:^|\s)` and every max-* interpolation in the app (the prefix §17g made most
// of this codebase's breakpoint work) goes silently unguarded. These cases make
// the coverage a claim instead of a side effect, in both directions: the shapes
// that must be caught, and the ones that must not, since a false positive here
// would be a mailto: template or a CSS declaration in a style object.
describe("the interpolation pattern itself catches what it claims to", () => {
  const caught = [
    "sm:${x}", "md:${x}", "lg:${x}", "xl:${x}", "2xl:${x}",
    "max-sm:${x}", "max-md:${x}", "max-lg:${x}", "max-xl:${x}", "max-2xl:${x}",
    "hover:${x}", "focus:${x}", "focus-visible:${x}", "focus-within:${x}",
    "active:${x}", "disabled:${x}", "dark:${x}",
    "group-hover:${x}", "peer-hover:${x}",
    "motion-reduce:${x}", "motion-safe:${x}",
    "aria-expanded:${x}", "data-theme:${x}",
    "min-[900px]:${x}", "max-[900px]:${x}", "supports-[display:grid]:${x}",
    // The real shape, as it appears in a className: a literal head, then the
    // split variant.
    "flex items-center max-lg:${display}",
  ];
  const allowed = [
    // Not variants, and that is the whole point: a mailto template (which the app
    // does write) and an interpolated asset path (which it no longer does — the
    // module that built one was deleted with §17i, and the mark it named has since
    // left the repo). The shape is what is on trial here, not the URL: a scan
    // tightened until `word:${x}` matched either of these would fail every
    // interpolated string in the app.
    "mailto:${SUPPORT_EMAIL}?subject=${subject}",
    "${basePath}brand/windward-line-mark.svg",
    "translate:${value}",
    "https://example.com/${path}",
    // A complete, statically-analyzable class name with an interpolation
    // elsewhere in the string is the correct pattern, not the bug.
    "max-lg:hidden ${extra}",
  ];

  for (const sample of caught) {
    it(`catches ${sample}`, () => {
      assert.match(sample, INTERPOLATED_VARIANT);
    });
  }
  for (const sample of allowed) {
    it(`leaves ${sample} alone`, () => {
      assert.doesNotMatch(sample, INTERPOLATED_VARIANT);
    });
  }
});

describe("no Tailwind variant prefix is ever split from its utility by a template literal (C1)", () => {
  for (const file of allSourceFiles(SOURCE_ROOT)) {
    it(`${file} never writes a variant prefix immediately followed by an interpolation`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        INTERPOLATED_VARIANT,
        `${file}: a Tailwind variant prefix must never be split from its ` +
          "utility by a template-literal interpolation - Tailwind's " +
          "build-time scanner can't see the resulting class name as a " +
          "complete token, so the built CSS silently never gets a rule " +
          "for it (C1). Use literal per-branch class strings instead (see " +
          "AdvisorWorkspace.tsx's deskColumnClassName).",
      );
    });
  }
});
