# Levelflow Visual Overhaul — Stage 1: Foundation — Implementation Plan

*Amended in flight: dark accent #6B86FF, dark pressed #7D95FF (paper-colored button text in dark), light caution #8A5B00 — per the contrast-enforcement design ruling; the spec's Section 3 table is authoritative.*

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Swiss Editorial foundation — self-hosted fonts, both-theme design tokens, restyled core component kit, the wholesale Levelflow rename, and the operator script for the two auth-config brand strings — as one shippable PR.

**Architecture:** Tokens change under existing class names so every surface picks up the new language without per-surface rewrites (those are Stages 2–3). Tailwind v4 `@theme` custom properties are re-valued and overridden under `html[data-theme="dark"]`; legacy color aliases bridge old utility names to new tokens until later stages migrate usages. Contrast is enforced by a unit test that computes WCAG ratios from the token hex values.

**Tech Stack:** React 19, Vite, Tailwind 4 (`@theme` in `src/styles/index.css`), @fontsource packages (CSP forbids font CDNs), node:test.

**Spec:** `docs/superpowers/specs/2026-07-29-levelflow-visual-overhaul-design.md`

## Global Constraints

- Product name is **Levelflow** (single capital). Old casing survives only in `supabase/migrations/**`, git history, and dated round-entry prose in `docs/trade-model.md`.
- Theme naming in UI/code/docs: **Light / Dark / System** only.
- Light tokens: paper `#F4F1EA`, sheet `#FDFCF9`, ink `#1B1B1B`, muted `#6B675E`, hairline `#D8D2C4`, accent `#2244FF`, accent-pressed `#1A35CC`, buy `#177245`, sell `#B3261E`, caution `#9A6B00`.
- Dark tokens: paper `#161411`, sheet `#1E1B16`, ink `#EDE7DA`, muted `#969082`, hairline `#35322B`, accent `#5A78FF`, accent-pressed `#4763E0`, buy `#4CC38A`, sell `#E5766E`, caution `#D9A441`.
- Fonts self-hosted only: Space Grotesk (display), Inter (text), IBM Plex Mono (numerals).
- Contrast: AA minimum all text pairs, AAA (≥7:1) for ink-on-paper/sheet body pairs.
- No secrets in files; the operator script reads the Resend key from Keychain at runtime.
- Ship loop: gates → PR → `gh pr merge --squash --auto --delete-branch` → deploy verify → live verify.

---

### Task 1: Self-hosted fonts

**Files:**
- Modify: `package.json` (three @fontsource deps)
- Modify: `src/styles/index.css` (imports + font tokens)
- Create: `tests/designTokens.test.ts`

**Interfaces:**
- Produces: CSS custom properties `--font-sans`, `--font-display`, `--font-mono` (consumed by Task 3); test file extended by Tasks 2–3.

- [ ] **Step 1: Write the failing test**

```ts
// tests/designTokens.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = () => readFileSync("src/styles/index.css", "utf8");

describe("design tokens", () => {
  it("self-hosts the three font roles (CSP forbids font CDNs)", () => {
    const s = css();
    assert.match(s, /@import "@fontsource-variable\/inter";/);
    assert.match(s, /@import "@fontsource-variable\/space-grotesk";/);
    assert.match(s, /@import "@fontsource\/ibm-plex-mono\/400.css";/);
    assert.match(s, /@import "@fontsource\/ibm-plex-mono\/600.css";/);
    assert.match(s, /--font-sans:\s*"Inter Variable"/);
    assert.match(s, /--font-display:\s*"Space Grotesk Variable"/);
    assert.match(s, /--font-mono:\s*"IBM Plex Mono"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 "font roles"`
Expected: FAIL (imports absent).

- [ ] **Step 3: Install fonts and wire imports**

```bash
npm install @fontsource-variable/inter @fontsource-variable/space-grotesk @fontsource/ibm-plex-mono
```

At the very top of `src/styles/index.css` (before `@import "tailwindcss";` — plain @imports must precede other statements):

```css
@import "@fontsource-variable/inter";
@import "@fontsource-variable/space-grotesk";
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource/ibm-plex-mono/600.css";
@import "tailwindcss";
```

In the `@theme` block, replace `--font-sans: Inter, ui-sans-serif, system-ui, sans-serif;` with:

```css
  --font-sans: "Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif;
  --font-display: "Space Grotesk Variable", "Space Grotesk", var(--font-sans);
  --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
```

Also update the `body { font-family: ... }` rule in `@layer base` to `font-family: var(--font-sans);`.

- [ ] **Step 4: Run test and build to verify**

Run: `npm test 2>&1 | grep -E "font roles|pass|fail"` — expected PASS.
Run: `npm run build >/dev/null && ls dist/assets | grep -ci woff2` — expected: several woff2 files bundled (fonts genuinely ship).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/styles/index.css tests/designTokens.test.ts
git commit -m "feat: self-host Inter, Space Grotesk, and IBM Plex Mono"
```

---

### Task 2: Color tokens for both themes

**Files:**
- Modify: `src/styles/index.css` (@theme values, dark override block, base/body colors, legacy dark-utility block retune)
- Modify: `tests/designTokens.test.ts` (extend)

**Interfaces:**
- Produces: CSS custom properties `--color-paper`, `--color-sheet`, `--color-ink`, `--color-ink-muted`, `--color-hairline`, `--color-accent`, `--color-accent-pressed`, `--color-buy`, `--color-sell`, `--color-caution` in both themes; legacy aliases `--color-navy`, `--color-slate`, `--color-bullish`, `--color-canvas`, `--color-warning`, `--color-danger` mapped onto them. Consumed by Tasks 3–4.

- [ ] **Step 1: Extend the failing test**

Append inside the `describe` block of `tests/designTokens.test.ts`:

```ts
  it("defines the editorial palette with dark-theme overrides", () => {
    const s = css();
    for (const pair of [
      ["--color-paper", "#F4F1EA"], ["--color-sheet", "#FDFCF9"],
      ["--color-ink", "#1B1B1B"], ["--color-ink-muted", "#6B675E"],
      ["--color-hairline", "#D8D2C4"], ["--color-accent", "#2244FF"],
      ["--color-accent-pressed", "#1A35CC"], ["--color-buy", "#177245"],
      ["--color-sell", "#B3261E"], ["--color-caution", "#9A6B00"],
    ]) {
      assert.match(s, new RegExp(`${pair[0]}:\\s*${pair[1]}`, "i"), pair.join(" "));
    }
    const dark = s.split('html[data-theme="dark"]')[1] ?? "";
    for (const hex of ["#161411", "#1E1B16", "#EDE7DA", "#969082", "#35322B", "#5A78FF", "#4763E0", "#4CC38A", "#E5766E", "#D9A441"]) {
      assert.match(s, new RegExp(hex, "i"), `dark value ${hex} present`);
    }
    assert.ok(dark.length > 0, "dark override block exists");
    // Legacy aliases bridge old utility names until Stages 2-3 migrate them.
    assert.match(s, /--color-navy:\s*var\(--color-ink\)/);
    assert.match(s, /--color-bullish:\s*var\(--color-accent\)/);
    assert.match(s, /--color-canvas:\s*var\(--color-paper\)/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A3 "editorial palette"` — expected FAIL.

- [ ] **Step 3: Rewrite the @theme color block**

Replace the color custom properties in `@theme` with:

```css
  --color-paper: #F4F1EA;
  --color-sheet: #FDFCF9;
  --color-ink: #1B1B1B;
  --color-ink-muted: #6B675E;
  --color-hairline: #D8D2C4;
  --color-accent: #2244FF;
  --color-accent-pressed: #1A35CC;
  --color-buy: #177245;
  --color-sell: #B3261E;
  --color-caution: #9A6B00;

  /* Legacy aliases: old utility names resolve to the new palette until
     Stages 2-3 migrate every usage, then these are deleted. */
  --color-navy: var(--color-ink);
  --color-slate: var(--color-ink-muted);
  --color-bullish: var(--color-accent);
  --color-canvas: var(--color-paper);
  --color-warning: var(--color-caution);
  --color-danger: var(--color-sell);
```

Immediately after the `@theme` block add the dark re-valuation (custom properties only — Tailwind v4 utilities reference vars, so runtime override works):

```css
html[data-theme="dark"] {
  --color-paper: #161411;
  --color-sheet: #1E1B16;
  --color-ink: #EDE7DA;
  --color-ink-muted: #969082;
  --color-hairline: #35322B;
  --color-accent: #5A78FF;
  --color-accent-pressed: #4763E0;
  --color-buy: #4CC38A;
  --color-sell: #E5766E;
  --color-caution: #D9A441;
}
```

Then retune the hard-coded colors in `@layer base` and the legacy dark-utility block:
- `html { background: #F4F1EA; }` → `background: var(--color-paper);`
- `body` gradients: replace the two green/navy tinted `linear-gradient` layers with plain `var(--color-paper)` (editorial surfaces are flat); `color: #162033` → `var(--color-ink)`.
- `html[data-theme="dark"] { background: #0b111c; }` → `var(--color-paper)` (the var is re-valued above it in the cascade — keep this rule AFTER the re-valuation block).
- `html[data-theme="dark"] body` → flat `var(--color-paper)` background, `color: var(--color-ink)`.
- In the legacy `@layer utilities` dark block: `bg-white` overrides → `#1E1B16` (sheet), text overrides → `#EDE7DA`/`#969082`, border overrides → `rgba(150,144,130,.28)`. (This block dies in Stage 3 when `bg-white` usages migrate to `bg-sheet`.)
- `.auth-shell` gradients: replace green-tinted layers with flat `var(--color-paper)`; keep the grid texture lines but change their rgba to `rgba(27, 27, 27, 0.05)`.

- [ ] **Step 4: Run tests and visually smoke both themes**

Run: `npm test 2>&1 | grep -E "editorial|pass|fail"` — expected PASS (141+2 total).
Run: `npm run build >/dev/null && echo OK`.
Then `preview_start` (levelflow-dev), screenshot at 1100px in light, toggle `document.documentElement.dataset.theme = "dark"` via javascript_tool, screenshot again. Expected: paper/ink editorial cast in both; no unreadable text anywhere on the auth screen.

- [ ] **Step 5: Commit**

```bash
git add src/styles/index.css tests/designTokens.test.ts
git commit -m "feat: editorial color tokens with dark-theme re-valuation"
```

---

### Task 3: Component kit restyle

**Files:**
- Modify: `src/styles/index.css` (`@layer components`)
- Modify: `src/App.tsx` (wordmark class on the header h1)
- Modify: `src/components/auth/AuthScreen.tsx` (wordmark class on the h1)
- Modify: `tests/designTokens.test.ts` (extend)

**Interfaces:**
- Consumes: token vars from Tasks 1–2.
- Produces: restyled `.terminal-panel`, `.primary-button`, `.secondary-button`, `.nav-button`, `.nav-button-active`, `.field`, new `.wordmark` and `.link-accent` classes. Class NAMES are unchanged except the two new ones, so no other component files change in this task.

- [ ] **Step 1: Extend the failing test**

```ts
  it("restyles the kit in editorial language", () => {
    const s = css();
    assert.match(s, /\.wordmark\s*\{[^}]*var\(--font-display\)/s);
    assert.match(s, /\.terminal-panel\s*\{[^}]*var\(--color-sheet\)/s);
    assert.doesNotMatch(s, /backdrop-filter/);
    assert.match(s, /\.primary-button\s*\{[^}]*var\(--color-accent\)/s);
    assert.match(s, /\.nav-button-active\s*\{[^}]*border-bottom[^}]*var\(--color-accent\)/s);
    assert.match(s, /\.link-accent/);
    assert.match(s, /:focus-visible\s*\{[^}]*var\(--color-accent\)/s);
    assert.match(s, /prefers-reduced-motion/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A3 "editorial language"` — expected FAIL (`backdrop-filter` currently present, new classes absent).

- [ ] **Step 3: Rewrite the components layer**

Replace the bodies of the existing component classes (names unchanged):

```css
  .wordmark {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .terminal-panel {
    position: relative;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--color-hairline);
    border-radius: 10px;
    background: var(--color-sheet);
    box-shadow: 0 1px 2px rgba(27, 27, 27, 0.05);
  }
  /* delete .terminal-panel::before, .terminal-panel:hover glow, and the
     backdrop-filter — sheets are flat paper */

  .primary-button,
  .secondary-button,
  .nav-button {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 8px;
    padding: 0.625rem 1rem;
    font-size: 0.9375rem;
    font-weight: 600;
    transition: background-color 140ms ease-out, border-color 140ms ease-out,
      color 140ms ease-out;
  }

  .primary-button {
    background: var(--color-accent);
    color: #ffffff;
  }
  .primary-button:hover:not(:disabled) { background: var(--color-accent-pressed); }

  .secondary-button {
    border: 1px solid var(--color-ink);
    background: transparent;
    color: var(--color-ink);
  }
  .secondary-button:hover:not(:disabled) {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .nav-button {
    min-height: 40px;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--color-ink-muted);
    padding: 0.5rem 0.25rem;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .nav-button:hover { color: var(--color-ink); background: transparent; }
  .nav-button-active {
    border-bottom: 2px solid var(--color-accent);
    background: transparent;
    color: var(--color-ink);
  }

  .field {
    min-height: 48px; min-width: 0; width: 100%;
    border-radius: 8px;
    border: 1px solid var(--color-hairline);
    background: var(--color-sheet);
    padding: 0 0.875rem;
    color: var(--color-ink);
    outline: none;
  }
  .field:focus { border-color: var(--color-accent); box-shadow: none; }

  .link-accent {
    color: var(--color-ink);
    text-decoration: none;
    background-image: linear-gradient(var(--color-accent), var(--color-accent));
    background-repeat: no-repeat;
    background-position: 0 100%;
    background-size: 0% 2px;
    transition: background-size 140ms ease-out;
  }
  .link-accent:hover, .link-accent[aria-current="true"] { background-size: 100% 2px; }
```

Add once, outside layers:

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { transition-duration: 0.01ms !important; }
}
```

(A `prefers-reduced-motion` block already exists for animations — merge rather than duplicate if present.) Update `.auth-login-panel` and `.auth-signal` to hairline/ink values (drop white inset shadows; `border-left: 2px solid var(--color-accent)` on `.auth-signal`). Then add `className="wordmark …"` to the `LevelFlow` h1 in `src/App.tsx` (header) and the h1 in `src/components/auth/AuthScreen.tsx` (keep existing size classes; the rename task retitles the strings).

- [ ] **Step 4: Run tests and visually verify the kit**

Run: `npm test` — expected all pass.
Preview at 1100px: buttons (blue primary, ink-outline secondary), uppercase nav with underline active state, flat sheets, Space Grotesk wordmark visible. Toggle dark: same structure, cream on warm ink. Screenshot both.

- [ ] **Step 5: Commit**

```bash
git add src/styles/index.css src/App.tsx src/components/auth/AuthScreen.tsx tests/designTokens.test.ts
git commit -m "feat: editorial component kit — flat sheets, underline nav, wordmark"
```

---

### Task 4: Contrast enforcement

**Files:**
- Create: `tests/contrast.test.ts`
- Create: `docs/design/contrast.md`

**Interfaces:**
- Consumes: the exact hex values from Global Constraints (duplicated as literals in the test on purpose — the test is the authority that the spec values hold).

- [ ] **Step 1: Write the test (it should PASS if the palette is honest — a failure means a token must change)**

```ts
// tests/contrast.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const LIGHT = { paper: "#F4F1EA", sheet: "#FDFCF9", ink: "#1B1B1B", muted: "#6B675E", accent: "#2244FF", buy: "#177245", sell: "#B3261E", caution: "#9A6B00" };
const DARK = { paper: "#161411", sheet: "#1E1B16", ink: "#EDE7DA", muted: "#969082", accent: "#5A78FF", buy: "#4CC38A", sell: "#E5766E", caution: "#D9A441" };

describe("palette contrast (WCAG)", () => {
  for (const [name, t] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`${name}: body text is AAA, secondary and semantic text are AA`, () => {
      for (const bg of [t.paper, t.sheet]) {
        assert.ok(ratio(t.ink, bg) >= 7, `${name} ink on ${bg} ${ratio(t.ink, bg).toFixed(2)}`);
        assert.ok(ratio(t.muted, bg) >= 4.5, `${name} muted on ${bg} ${ratio(t.muted, bg).toFixed(2)}`);
        for (const sem of [t.accent, t.buy, t.sell, t.caution]) {
          assert.ok(ratio(sem, bg) >= 4.5, `${name} ${sem} on ${bg} ${ratio(sem, bg).toFixed(2)}`);
        }
      }
      assert.ok(ratio("#FFFFFF", t.accent) >= 4.5, `${name} white on accent ${ratio("#FFFFFF", t.accent).toFixed(2)}`);
    });
  }
});
```

- [ ] **Step 2: Run it and resolve any failure by adjusting the failing token**

Run: `npm test 2>&1 | grep -E "contrast|WCAG|pass|fail" -A2`

Decision rule if a pair fails: darken (light theme) or lighten (dark theme) the FAILING token by the smallest step that passes, update the same hex in `src/styles/index.css`, `tests/designTokens.test.ts`, the spec's Section 3 table, and this test — all four stay identical. Re-run until green. (Pre-computed expectation: light accent/buy/sell/caution all clear 4.5 on paper; dark accent `#5A78FF` on sheet `#1E1B16` is the closest call — if it lands under 4.5, lift to `#6B86FF` everywhere.)

- [ ] **Step 3: Write the contrast table doc**

`docs/design/contrast.md` — a table with every pair from the test and its computed ratio (2 decimals), both themes, plus the sentence: "Enforced by tests/contrast.test.ts; a palette change that breaks AA fails CI."
Generate the numbers by running: `node --experimental-strip-types -e "<paste luminance/ratio fns>; console.table(...)"` or compute inside the test temporarily with `console.log` — either way the committed table shows the real measured values.

- [ ] **Step 4: Commit**

```bash
git add tests/contrast.test.ts docs/design/contrast.md
git commit -m "feat: enforce WCAG contrast for both themes in CI"
```

---

### Task 5: Wholesale rename LevelFlow → Levelflow

**Files:**
- Modify: every current-state file carrying "LevelFlow" (≈30 files: `src/**`, `tests/**`, `index.html`, `README.md`, `docs/**` except historical passages, `public/legal/*.html`, `supabase/functions/**`, `.github/workflows/deploy.yml`, `supabase/config.toml` if present)
- Exempt: `supabase/migrations/**`, `.superpowers/**`, `docs/superpowers/**` (the spec/plan legitimately discuss the old casing), `node_modules`, git history; `docs/trade-model.md` round-entry prose (historical) — its framing sections DO rename.

**Interfaces:**
- Produces: the string `Levelflow` everywhere current-state; `<title>Levelflow — Market review</title>`; e2e assertions expect `Levelflow`.

- [ ] **Step 1: Extend the e2e + unit expectations first (they fail until the rename lands)**

In `tests/e2e/public-auth.spec.ts`, `tests/e2e/authenticated-workspace.spec.ts`, `tests/e2e/analyzer-abuse.spec.ts`: change every `"LevelFlow"` literal to `"Levelflow"` (headings, page-title checks, copy assertions). In `tests/designTokens.test.ts` append:

```ts
  it("carries the Levelflow name, not the legacy casing", () => {
    const html = readFileSync("index.html", "utf8");
    assert.match(html, /<title>Levelflow — Market review<\/title>/);
    assert.doesNotMatch(html, /LevelFlow/);
  });
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npm test 2>&1 | grep -A2 "legacy casing"` — expected FAIL.

- [ ] **Step 3: Execute the rename**

```bash
# Everything current-state, excluding historical/dir exemptions:
grep -rl "LevelFlow" --include="*.ts" --include="*.tsx" --include="*.html" \
  --include="*.md" --include="*.json" --include="*.yml" --include="*.toml" . \
  | grep -v node_modules | grep -v "supabase/migrations" | grep -v ".superpowers" \
  | grep -v "docs/trade-model.md" \
  | xargs sed -i '' 's/LevelFlow/Levelflow/g'
```

Then `docs/trade-model.md` by hand: rename occurrences in the intro/acceptance-bar/cohorts framing sections; leave every "Round-N" dated entry untouched. Then set the title in `index.html` to `Levelflow — Market review`. Verify sweep:

```bash
grep -rn "LevelFlow" --include="*.ts" --include="*.tsx" --include="*.html" \
  --include="*.md" --include="*.json" --include="*.yml" --include="*.toml" . \
  | grep -v node_modules | grep -v "supabase/migrations" | grep -v ".superpowers" \
  | grep -v "docs/trade-model.md" | grep -v "docs/superpowers"
```

Expected: zero lines. (`docs/trade-model.md` may still show round-entry occurrences — correct.)

- [ ] **Step 4: Run full unit suite + public e2e**

Run: `npm test` — all pass. Run: `npx playwright test tests/e2e/public-auth.spec.ts` — 2 passed (heading "Levelflow" found; the h1 string in `AuthScreen.tsx` was renamed by the sweep).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wholesale rename to Levelflow

Single-capital casing everywhere current-state. Historical artifacts
(migrations, git history, dated round entries in docs/trade-model.md)
intentionally keep the old name."
```

---

### Task 6: Operator script for auth-config brand strings

**Files:**
- Create: `scripts/ops/update-auth-brand.sh`
- Modify: `tests/securityHardening.test.ts` (pin the full-SMTP-block invariant)

**Interfaces:**
- Consumes: Keychain services `supabase-access-token`, `resend-api-key` (read at runtime, never stored).
- Produces: a script the operator runs; PATCHes `mailer_subjects_magic_link` → "Your Levelflow sign-in link" and `smtp_sender_name` → "Levelflow" with the FULL SMTP block (partial PATCH clears siblings — documented incident).

- [ ] **Step 1: Pin the invariant in a failing test**

Append to `tests/securityHardening.test.ts`:

```ts
  it("renames auth mail branding only with the full SMTP block", () => {
    const script = readFileSync("scripts/ops/update-auth-brand.sh", "utf8");
    for (const key of ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_admin_email", "smtp_sender_name", "smtp_max_frequency", "mailer_subjects_magic_link"]) {
      assert.match(script, new RegExp(key), key);
    }
    assert.match(script, /Your Levelflow sign-in link/);
    assert.match(script, /"smtp_sender_name":\s*"Levelflow"/);
    assert.match(script, /security find-generic-password/);
    assert.doesNotMatch(script, /re_[A-Za-z0-9]{10,}/); // no hardcoded Resend key
  });
```

Run: `npm test 2>&1 | grep -A2 "full SMTP block"` — expected FAIL (file absent).

- [ ] **Step 2: Write the script**

```bash
#!/usr/bin/env bash
# Rename Levelflow's auth email branding (subject + SMTP sender name).
# Run this yourself: it PATCHes Supabase auth config, and any auth-config
# PATCH must carry the FULL SMTP block — partial updates clear sibling
# fields and GoTrue silently falls back to the built-in mailer.
set -euo pipefail

PROJECT_REF="usrtpoftuvhpmyhlhqlg"
API="https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth"

export SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -a peacock -s supabase-access-token -w)}"
RESEND_KEY="$(security find-generic-password -a peacock -s resend-api-key -w)"
[ -n "$SUPABASE_ACCESS_TOKEN" ] && [ -n "$RESEND_KEY" ] || { echo "missing Keychain credentials"; exit 1; }

echo "== Current values =="
curl -sS "$API" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | python3 -c "import sys,json; c=json.load(sys.stdin); print(json.dumps({k:c.get(k) for k in ('smtp_host','smtp_user','smtp_admin_email','smtp_sender_name','smtp_max_frequency','mailer_subjects_magic_link')}, indent=1))"

read -r -p "PATCH sender name + magic-link subject to 'Levelflow'? [y/N] " yn
[ "$yn" = "y" ] || { echo "aborted"; exit 0; }

curl -sS -X PATCH "$API" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(python3 - "$RESEND_KEY" <<'PY'
import json, sys
print(json.dumps({
  "smtp_host": "smtp.resend.com",
  "smtp_port": "465",
  "smtp_user": "resend",
  "smtp_pass": sys.argv[1],
  "smtp_admin_email": "login@windwardline.com",
  "smtp_sender_name": "Levelflow",
  "smtp_max_frequency": 60,
  "mailer_subjects_magic_link": "Your Levelflow sign-in link",
}))
PY
)" >/dev/null

echo "== Verifying =="
curl -sS "$API" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | python3 -c "import sys,json; c=json.load(sys.stdin); ok=(c.get('smtp_sender_name')=='Levelflow' and c.get('mailer_subjects_magic_link')=='Your Levelflow sign-in link' and c.get('smtp_host')=='smtp.resend.com'); print('VERIFIED' if ok else 'MISMATCH — inspect config now'); sys.exit(0 if ok else 1)"
```

`chmod +x scripts/ops/update-auth-brand.sh`. Note in the PR body: before the operator runs it, confirm `smtp_admin_email` printed by "Current values" matches `login@windwardline.com`; if it differs, edit the script's value to the printed one first (the full-block PATCH must preserve reality, not assumptions).

- [ ] **Step 3: Verify**

Run: `bash -n scripts/ops/update-auth-brand.sh && echo SYNTAX_OK`.
Run: `npm test 2>&1 | grep -E "full SMTP block|pass|fail"` — expected PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/ops/update-auth-brand.sh tests/securityHardening.test.ts
git commit -m "feat: operator script for Levelflow auth mail branding"
```

---

### Task 7: Gates, ship, verify live

**Files:** none new — assembly and verification.

- [ ] **Step 1: Full gates**

Run: `npx tsc -b --noEmit && npx eslint . --max-warnings 0 && npm test && npm run build` — all green (expect 145+ tests).

- [ ] **Step 2: Full-suite local e2e**

Run: `npx playwright test tests/e2e/public-auth.spec.ts` — 2 passed. (Authenticated spec runs in the deploy gate with CI credentials.)

- [ ] **Step 3: Visual verification, both themes, three widths**

Preview → screenshots at 375 / 1100 / 1440, light and dark (set `document.documentElement.dataset.theme`), of the auth screen: Space Grotesk wordmark, paper/ink surfaces, blue primary button, no horizontal overflow (`document.documentElement.scrollWidth - clientWidth === 0`).

- [ ] **Step 4: PR and auto-merge**

```bash
git push -u origin feat/visual-foundation
gh pr create --title "feat: Levelflow editorial foundation — fonts, tokens, kit, rename" --body "Stage 1 of the visual overhaul per docs/superpowers/specs/2026-07-29-levelflow-visual-overhaul-design.md. Fonts self-hosted (Space Grotesk/Inter/IBM Plex Mono), both-theme editorial tokens with WCAG enforcement in CI, component kit restyle under existing class names, wholesale Levelflow rename (historical exemptions), operator script for auth mail branding (full-SMTP-block pattern). Operator follow-up: run scripts/ops/update-auth-brand.sh."
gh pr merge --squash --auto --delete-branch
```

- [ ] **Step 5: Deploy + production verification**

Watch the deploy to success, then against https://levelflow.windwardline.com: title is `Levelflow — Market review`; built CSS contains `Space Grotesk` @font-face and `--color-paper`; woff2 assets return 200; screenshots at 1100 both themes. Report the operator step (run `scripts/ops/update-auth-brand.sh`) as the one remaining manual action, then update memory files to the new casing.
