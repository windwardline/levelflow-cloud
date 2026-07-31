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
  "hover",
  "focus",
  "focus-visible",
  "active",
  "disabled",
  "dark",
  "group-hover",
  "peer-hover",
];
const INTERPOLATED_VARIANT = new RegExp(
  `\\b(?:${VARIANT_PREFIXES.join("|")}):\\$\\{`,
);

function allSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => join(root, file));
}

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
