# Levelflow Visual Overhaul — Stage 2: Public Surfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose every public surface in the full Swiss Editorial aesthetic — the login page as the flagship (entire composition, not a reskin), the legal trio, donate surfaces, a branded 404 — plus the parked operator-script diagnostic completion and the plain-language copy pass for everything touched.

**Architecture:** The auth screen is rebuilt as an editorial front page: oversized Space Grotesk wordmark leading (Levelflow first, Windward Line demoted to colophon), asymmetric grid, the blue-underline system as the active gesture, a flat sheet sign-in card, and an SVG chart-line art element in the hero. Legal pages get one shared editorial stylesheet. All copy on touched surfaces passes the spec §7 plain-language rules. Both themes throughout; contrast test already enforces the palette.

**Tech Stack:** React 19, Tailwind 4 tokens from Stage 1 (`--color-*`, `--font-*`, `.wordmark`, `.link-accent`, `.terminal-panel`), static HTML for /legal, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-29-levelflow-visual-overhaul-design.md` (Sections 2, 5, 6, 7 bind this stage; §3 token table is color authority)

## Global Constraints

- **Levelflow leads; Windward Line is the production house.** On the auth page the wordmark is the first strong element; "A Windward Line production" appears ONLY as a quiet colophon line at the page bottom. The WL mark image may sit small beside the colophon, never above the wordmark.
- The full X3 aesthetic: asymmetric editorial grid, display-type hierarchy (wordmark ≥ text-6xl at desktop), eyebrow small-caps labels, blue underline gesture, flat paper/sheet surfaces, the hero chart-line as art. No glassmorphism, no gradient washes, no pill buttons.
- Copy rules (spec §7): working-surface strings plain and short; no quant vocabulary; one line of context max; sentence case; no exclamation points.
- Both themes on every surface; tokens only — zero new hex literals in components (the contrast test guards the palette).
- All auth STATES keep working and get the treatment: form, sending, sent, error strip, unconfigured ("Cloud access pending"), donation reveal, help.
- e2e assertions updated in the same task as the surface they cover; `npm test` + public e2e green at every commit.
- Ship loop: gates → PR → auto-merge → deploy verify → live verification at 375/1100/1440 both themes.

---

### Task 1: Operator-script diagnostic completion (parked Stage-1 residual)

**Files:**
- Modify: `scripts/ops/update-auth-brand.sh`
- Modify: `tests/securityHardening.test.ts`

**Interfaces:**
- Produces: PATCH failures print a filtered server message (never raw body, never smtp_pass); test pins `--fail-with-body` and the filter.

- [ ] **Step 1: Extend the failing test**

In `tests/securityHardening.test.ts`, inside the existing SMTP-block test, add:

```ts
    assert.match(script, /--fail-with-body/);
    // Failure diagnostics must pass through the message filter, never a
    // raw body echo that could carry smtp_pass back to the terminal.
    assert.doesNotMatch(script, /echo "\$resp"/);
    assert.match(script, /PATCH failed/);
```

Run: `npm test 2>&1 | grep -A3 "full SMTP block"` — expected FAIL.

- [ ] **Step 2: Implement**

In `scripts/ops/update-auth-brand.sh`, replace the PATCH invocation block with:

> **Historical record — do not paste.** The shipped
> `scripts/ops/update-auth-brand.sh` has since been hardened (#363):
> bearers travel by `-H @file`, the Resend key enters python via the
> environment, and the PATCH body goes by `--data @file` — the fenced
> draft below predates all three and would put credentials on argv.

```bash
if ! resp="$(curl -sS --fail-with-body -X PATCH "$API" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")"; then
  echo "PATCH failed:"
  printf '%s' "$resp" | python3 -c "import sys,json
try:
    b = json.load(sys.stdin)
    print(b.get('message') or b.get('error') or 'no message in response')
except Exception:
    print('non-JSON error response')"
  exit 1
fi
```

(Requires hoisting the payload into `PAYLOAD="$(python3 - "$RESEND_KEY" <<'PY' ... PY)"` immediately above — keep the heredoc content byte-identical.)

- [ ] **Step 3: Verify and commit**

`bash -n scripts/ops/update-auth-brand.sh && echo SYNTAX_OK`; `npm test` green.

```bash
git add scripts/ops/update-auth-brand.sh tests/securityHardening.test.ts
git commit -m "fix: PATCH failures surface a filtered server message"
```

---

### Task 2: Auth page recomposition — the editorial front page

**Files:**
- Modify: `src/components/auth/AuthScreen.tsx` (full recomposition)
- Modify: `src/styles/index.css` (auth-specific component classes)
- Modify: `tests/e2e/public-auth.spec.ts` (assertions follow the new copy/hierarchy)

**Interfaces:**
- Consumes: Stage-1 tokens/classes (`.wordmark`, `.link-accent`, `.terminal-panel`, `--font-display`).
- Produces: new classes `.front-hero-word`, `.front-rule`, `.front-chartline`, `.colophon` in the components layer; AuthScreen keeps its props contract (`themeControl`) and every existing state branch.

- [ ] **Step 1: Update the e2e expectations first (RED)**

Rewrite `tests/e2e/public-auth.spec.ts` assertions to the new page (keep both test names):
- heading "Levelflow" still visible (the hero wordmark, now an `<h1 class="wordmark front-hero-word">`)
- the eyebrow reads `Market review` (small-caps eyebrow replaces "A Windward Line product" at top)
- colophon visible: `page.getByText("A Windward Line production")`
- form/help/donate/legal assertions unchanged; mobile test unchanged plus colophon check
Run public e2e → RED (colophon/eyebrow missing).

- [ ] **Step 2: Recompose AuthScreen**

Structure (both columns inside the existing `.auth-shell`; grid `lg:grid-cols-[1.1fr_0.9fr]` stays but content transforms):

LEFT (hero — the X3 front page):
```tsx
<div className="space-y-8">
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
    Market review — <span className="text-accent">daily edition</span>
  </p>
  <h1 className="wordmark front-hero-word">Levelflow</h1>
  <div className="front-rule" aria-hidden="true" />
  <p className="max-w-md text-lg leading-8 text-ink">
    One page that reads the market for you: live charts, timing, and
    only the trade setups that survive review.
  </p>
  <svg className="front-chartline" viewBox="0 0 480 96" aria-hidden="true">
    <polyline points="0,72 60,64 120,68 180,44 240,52 300,28 360,34 480,12"
      fill="none" stroke="var(--color-accent)" strokeWidth="3" />
    <circle cx="480" cy="12" r="4" fill="var(--color-accent)" />
  </svg>
  <dl className="grid max-w-md gap-4 sm:grid-cols-3">
    <div><dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">Live charts</dt>
    <dd className="mt-1 text-sm text-ink">prices you can verify</dd></div>
    <div><dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">Timing</dt>
    <dd className="mt-1 text-sm text-ink">sessions, news, and rates</dd></div>
    <div><dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">Selective</dt>
    <dd className="mt-1 text-sm text-ink">only setups that pass review</dd></div>
  </dl>
</div>
```

RIGHT: the sign-in card as a flat sheet (`terminal-panel p-6 sm:p-8`), containing — in order — eyebrow `Sign in`, heading (existing `headline` var), body copy (rewritten, Step 3), the form (unchanged behavior), error strip, help/donate row, legal links. Delete the key icon tile and "SECURE ENTRY" eyebrow (jargon-adjacent; the plain eyebrow is `Sign in`).

BOTTOM (full width, below the grid): the colophon —
```tsx
<footer className="colophon">
  <img src={brandAssets.mark} alt="" className="h-5 w-5 rounded-sm opacity-80" />
  <span>A Windward Line production</span>
</footer>
```

CSS additions (components layer):
```css
  .front-hero-word { font-size: clamp(3.5rem, 9vw, 7rem); line-height: 0.95; }
  .front-rule { height: 2px; width: 72px; background: var(--color-accent); }
  .front-chartline { width: 100%; max-width: 28rem; height: 4rem; }
  .colophon {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 2rem 0 0.5rem;
    font-size: 0.8125rem; color: var(--color-ink-muted);
  }
```

Every state branch stays: `isSupabaseConfigured` warning card, sending/sent, error, `donationsOpen` reveal. The grid texture `::before` stays (it's the paper's printed grid — editorial, keep).

- [ ] **Step 3: Copy pass on every string (spec §7)**

Inventory each user-visible string in AuthScreen and rewrite plainly. Required rewrites (exact strings):
- body (configured): `Enter your email. We'll send one secure link to open your workspace.` → keep (already plain)
- "No password is required." → keep
- unconfigured body: `Cloud access is not connected yet. Once configured, sign-in will open the live workspace.` → `This copy of Levelflow isn't connected to the cloud yet.`
- "Waiting for cloud project details." → `Waiting for connection details.`
- signals (dt/dd): `Live charts / prices you can verify` · `Timing / sessions, news, and rates` · `Selective / only setups that pass review`
- error strings: keep the existing plain ones; no jargon found.

- [ ] **Step 4: Verify**

`npm test` green (147+); `npx playwright test tests/e2e/public-auth.spec.ts` 2/2 GREEN; build. Visual check runs at Task 6 (assembly) — note in the report which states you exercised by hand-toggling props/state in the dev server if you can, otherwise say so.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/AuthScreen.tsx src/styles/index.css tests/e2e/public-auth.spec.ts
git commit -m "feat: the login page becomes the editorial front page"
```

---

### Task 3: Legal trio restyle

**Files:**
- Create: `public/legal/legal.css` (one shared editorial stylesheet)
- Modify: `public/legal/risk-disclaimer.html`, `public/legal/privacy.html`, `public/legal/terms.html`

**Interfaces:**
- Produces: each page links `legal.css`, carries the same wordmark header, respects `prefers-color-scheme` for dark (static pages can't read the app's data-theme; media-query dark is the honest equivalent), and ends with the colophon.

- [ ] **Step 1: Write the shared stylesheet**

`public/legal/legal.css` — self-contained (no Tailwind): paper/ink/accent custom properties (light + `@media (prefers-color-scheme: dark)` values copied exactly from the spec §3 table), `body { max-width: 44rem; margin: auto; font-family: -apple-system fallback stack + 'Inter' if loaded }`, display-style `h1` (system-ui bold, tight tracking — do NOT import fonts here; static pages stay zero-request beyond the css), underlined links in accent, small-caps section labels, the colophon rule.

- [ ] **Step 2: Restyle the three pages**

Each page: `<link rel="stylesheet" href="/legal/legal.css">`, header = `Levelflow` wordmark text + eyebrow with the page name, body content UNCHANGED except obvious old-casing already renamed in Stage 1, footer colophon `A Windward Line production` + a `link-accent`-styled "Back to Levelflow" link to `/`.

- [ ] **Step 3: Verify + commit**

`npm run build` (copies public/) and open each `dist/legal/*.html` with `grep -c legal.css` = 1 each; eyeball via dev server once at assembly.

```bash
git add public/legal/
git commit -m "feat: legal pages read like the same publication"
```

---

### Task 4: Donate surfaces + branded 404

**Files:**
- Modify: `src/components/donations/DonatePanel.tsx` (copy pass + editorial framing; keep all logic)
- Modify: `src/components/auth/AuthScreen.tsx` (donation reveal inherits card styling — verify only, no logic change)
- Create: `public/404.html`
- Modify: `vercel.json` (only if a 404 route mapping is required — check first; Vercel serves public/404.html for unmatched static paths automatically when present; if the SPA rewrite catches everything, add the 404 as a rewrite exclusion ONLY if verifiable — otherwise report the constraint instead of guessing)

**Interfaces:**
- Produces: DonatePanel headline/body strings rewritten plain; 404 page in the editorial language (wordmark, "This page isn't in this edition.", link-accent back to `/`), self-contained CSS like legal.css (may link the same `/legal/legal.css`).

- [ ] **Step 1: Copy inventory DonatePanel** — rewrite every string against spec §7 (state the before/after list in your report). Keep Stripe link handling exactly as-is (`cleanExternalUrl` etc.).
- [ ] **Step 2: Build the 404 page** using `/legal/legal.css`; verify `npm run build` emits `dist/404.html`.
- [ ] **Step 3: Check vercel.json rewrites** — read it; if `/(.*) → /index.html` style catch-all exists, document that Vercel checks the filesystem (including 404.html for non-matching paths) BEFORE rewrites only for static assets; test after deploy in Task 6 with `curl -s -o /dev/null -w "%{http_code}" https://levelflow.windwardline.com/definitely-not-a-page` expecting 404 — if it returns 200 (SPA catch-all wins), move the 404 handling to the SPA (a small NotFound route for unknown hash/paths is NOT needed — this app has no router; in that case delete public/404.html, note the finding, and skip). Honest outcome over forced deliverable.
- [ ] **Step 4: Commit** `feat: donate copy and a branded 404`

---

### Task 5: Copy inventory sweep of remaining public strings

**Files:**
- Modify: `src/components/legal/LegalLinks.tsx`, any public-surface string missed (grep `src/components/auth`, `src/components/donations`, `src/components/legal` for user-visible literals)

- [ ] **Step 1:** Produce the inventory (string → keep/rewrite + reason) in your report; apply rewrites per spec §7.
- [ ] **Step 2:** `npm test` + public e2e green (update assertions touched by rewrites in the same commit).
- [ ] **Step 3:** Commit `feat: plain language across the public surfaces`

---

### Task 6: Assembly — gates, visual verification, ship

Controller-executed. Full gates; public e2e; visual verification of auth (all states reachable unauthenticated: form, unconfigured via local dev, donation reveal via click, error via bad submit), legal pages, 404 behavior — at 375/1100/1440 × light/dark; PR (body carries the operator note that Task 1 changed the ops script diagnostics); auto-merge; deploy watch; live verification incl. the 404 curl check; ledger close; worktree/workspace cleanup.
