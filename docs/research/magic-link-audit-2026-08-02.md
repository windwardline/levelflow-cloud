# Magic-link audit — the mobile/desktop accent difference

Opened 2026-08-02 on the owner's report, verbatim:

> "I noticed last night when I was on mobile, the accent color on my magic link
> email from Levelflow was a different color than it is when I receive one from
> desktop. I have no idea how this is possible, but check the entirety of the
> magic link protocol (including email body copy) to ensure we are adhering to
> the durable standard for magic links across all projects, existing and in the
> future."

Audited against the standing standard in `~/AGENTS.md` (§ "Magic links (standing
standard, 2026-07)"). Levelflow's operator script is
`scripts/ops/update-auth-brand.sh`; the spec clauses are §6 and §11 of
`docs/superpowers/specs/2026-07-29-levelflow-visual-overhaul-design.md`.

## Cause

Two different emails, sent five days apart, both still sitting in the inbox. The
older one carries the **retired** LevelFlow navy `#111c38`. The newer one carries
the current Levelflow blue `#2244FF`. Neither device rendered anything
incorrectly — mobile and desktop were showing different messages.

The template is a single server-side field, so no per-device path exists. What
changed was the field, on 2026-07-30.

## Evidence — the delivered HTML

Pulled from Resend's sent-email log for `michaellynnpeacock@gmail.com`. Every row
is the HTML as delivered, not as intended. Token query strings redacted.

| Sent (UTC) | Sender name | Subject | `h2` | Button |
|---|---|---|---|---|
| 2026-07-26 02:45:24 | LevelFlow | Your LevelFlow sign-in link | Sign in to LevelFlow | `#111c38` |
| 2026-07-29 18:17:33 | LevelFlow | Your LevelFlow sign-in link | Sign in to LevelFlow | `#111c38` |
| 2026-07-30 00:01:35 | Levelflow | Your Levelflow sign-in link | Sign in to **LevelFlow** | `#111c38` |
| 2026-07-30 03:03:37 | Levelflow | Your Levelflow sign-in link | Sign in to **LevelFlow** | `#111c38` |
| 2026-07-30 03:22:21 | Levelflow | Your Levelflow sign-in link | Sign in to Levelflow | `#2244FF` |
| 2026-07-31 14:30:56 | Levelflow | Your Levelflow sign-in link | Sign in to Levelflow | `#2244FF` |
| 2026-08-02 07:17:28 | Levelflow | Your Levelflow sign-in link | Sign in to Levelflow | `#2244FF` |
| 2026-08-03 02:47:42 | Levelflow | Your Levelflow sign-in link | Sign in to Levelflow | `#2244FF` |

The body flipped inside an 18m47s window on 2026-07-30, between 03:03:37Z and
03:22:21Z — the run of `scripts/ops/update-auth-brand.sh` carrying the template
field, added in `bd12a38` (merged 2026-07-29T23:11Z).

Before, the button:

```
style="display:inline-block;background:#111c38;color:#fff; …"
```

After:

```
style="display:inline-block;background:#2244FF;color:#fff; …"
```

`#111c38` is the pre-overhaul LevelFlow navy. It is retired everywhere else in
the repo and guarded against: `tests/brandAssets.test.ts:121` asserts the favicon
carries none of `#F7F8F4|#111C38|#5B8266`. The email was the last surface still
serving it.

**The two rows in bold are the documented hazard, caught in the act.** On
2026-07-30 the sender name and subject already said "Levelflow" while the body
still said "LevelFlow" and painted the navy button — a half-branded email, sent
twice, because a PATCH updated two of the three fields. That is the standard's
own warning, and this is its receipt.

The owner's inbox on the night in question therefore held eight navy-button
emails (2026-07-26 to 2026-07-30 03:03) and eight blue-button emails (2026-07-30
03:22 onward). Opening any pre-flip message on one device and any post-flip
message on the other produces exactly the reported difference.

## The two other candidates, ruled out

**Dark-mode recoloring.** Not the cause: the two hexes differ by design intent,
not by the arithmetic any client applies. An inversion or blend of `#2244FF`
does not land on the app's own retired brand navy. Real fragility does exist in
the template, itemized below, but it does not produce this pair.

**GoTrue falling back to its built-in mailer.** Ruled out on two independent
checks. The live SMTP block is fully populated right now — host
`smtp.resend.com`, port `465`, user `resend`, password set, admin email
`login@windwardline.com`. And a fallback send never reaches Resend at all, yet
every email in the table above is in Resend's log with the project's own
template. Auth logs across the retention window carry no `mail_from` telltale.

## Live config, 2026-08-03

Fetched from `GET /v1/projects/usrtpoftuvhpmyhlhqlg/config/auth`.

| Field | Live value | Standard | |
|---|---|---|---|
| `smtp_sender_name` | `Levelflow` | `{App}` | ✓ |
| `smtp_admin_email` | `login@windwardline.com` | same | ✓ |
| `mailer_subjects_magic_link` | `Your Levelflow sign-in link` | `Your {App} sign-in link` | ✓ |
| `h2` | `Sign in to Levelflow` | `Sign in to {App}` | ✓ |
| expiry line | `Click the button below to sign in. This link expires in 15 minutes.` | same | ✓ |
| button label | `Sign in` | same | ✓ |
| button accent | `#2244FF` | Levelflow accent of record | ✓ |
| footer | `If you didn't request this, you can ignore it.` | same | ✓ |
| `mailer_otp_exp` | `900` | exactly 15 minutes | ✓ |
| transport | `smtp.resend.com:465`, user `resend` | same | ✓ |
| link host | `site_url` = `https://levelflow.windwardline.com/`; `redirect_to` constrained by `uri_allow_list` | server config, never the request | ✓ |

No drift. **No PATCH was made** — the config already matches the standard, and
touching it would have risked the partial-update hazard for no gain.

Verified by live delivered email rather than by re-reading the config: the
2026-08-03 02:47:42Z send renders `Sign in to Levelflow` and `#2244FF`. No cache
question arises, because nothing was written.

Token semantics are GoTrue's: single-use, consumed atomically on verify,
`mailer_otp_exp` 900s. `src/components/auth/AuthScreen.tsx:62` reports the same
"Magic link sent" state for every address, and
`src/lib/authErrors.ts:6-15` separates rate limiting (429 /
`over_email_send_rate_limit`) from server failure (5xx /
`unexpected_failure`) from the generic case.

## Latent dark-mode fragility — recorded, not applied

The template is a bare `<div>`. GoTrue sends it as the whole HTML body, so there
is no `<head>` and no `color-scheme` / `supported-color-schemes` declaration.
Clients that auto-invert do so unguided. Four consequences, in severity order:

1. **`color:#667` footer with no background.** `#666677` on white is ~5.6:1. On
   a client-inverted near-black background at 13px it falls to roughly 3.1:1 —
   below AA. The one line that will genuinely look wrong in a dark client.
2. **No `bgcolor` fallback and no table wrapper.** The button is an `<a>` with
   `display:inline-block` and padding. Outlook's Word engine honors neither, so
   the accent disappears and the button degrades to a bare link.
3. **`h2` and body paragraph carry no explicit color.** They inherit, so their
   appearance is entirely the client's choice.
4. **No `color-scheme` declaration**, which is what would stop the inversion in
   Apple Mail and let the declared colors stand.

Not applied, deliberately. This template is shared law across three apps — the
standard opens "Every project's passwordless sign-in follows one design." Any
hardening belongs in `~/AGENTS.md` first and then in all three senders in one
change set. Hardening Levelflow alone would fork the design to fix a rendering
risk that is not the fault the owner reported.

## Cross-project standing

Each row checked against the delivered email in Resend's log, not only against
the source.

| | Levelflow | TimeShift | Pathfinder |
|---|---|---|---|
| Sender | `Levelflow <login@windwardline.com>` ✓ | `TimeShift <login@windwardline.com>` ✓ | `Pathfinder <login@windwardline.com>` ✓ |
| Subject | ✓ | ✓ | ✓ |
| `h2` / expiry / label / footer | ✓ | ✓ | ✓ (HTML) |
| Accent | `#2244FF` ✓ | `#7c5cff` ✓ | `#17594e` ✓ |
| Transport | Supabase SMTP → Resend ✓ | Resend REST ✓ | Resend REST ✓ |
| 15-minute expiry | `mailer_otp_exp` 900 ✓ | `15 * 60 * 1000` ✓ | `maxAge: 15 * 60` ✓ |
| Single-use, atomic | GoTrue ✓ | **read-then-write race** | `DELETE … RETURNING` ✓ |
| Link host from server config | `site_url` ✓ | `APP_URL`, hard-fails if unset ✓ | **request headers** |
| Scanner-safe link | n/a | n/a | **bypassed live** |

All three send the correct sender, subject, accent, and body copy. Every accent
of record is intact. The drift is entirely in the auth layers.

**TimeShift** — copy verbatim compliant on every row, and `#7c5cff` still equals
the live `--violet` token. `lib/auth/magic.ts:19-26` checks `usedAt` and then
writes it in a separate statement, so two concurrent verifies both mint a
session; a scanner prefetch racing a click is enough. Also: no rate limiting, one
error string for every send failure (`app/api/auth/request-link/route.ts:29-32`),
a request-origin redirect fallback when `APP_URL` is unset
(`app/api/auth/verify/route.ts:11`), and no test covering the token lifecycle.

**Pathfinder** — the `/verify` rewrite the standard requires is dead code in
production. `apps/web/src/lib/magic-link.ts` implements
`toScannerSafeVerificationUrl` correctly and `apps/web/src/auth.ts:47` appears to
wire it, but the wiring is a monkey-patch of the provider's *top-level*
`sendVerificationRequest`, while `Resend({...})` stores the caller's function on
`provider.options`. `@auth/core@0.41.3` merges `options` over the defaults:

```js
const { options: userOptions, ...defaults } = provider;
const merged = merge(defaults, userOptions, { … });
```

So the original wins and the wrapper never runs. Probed directly:
`p.sendVerificationRequest === inner` is `false` while
`p.options.sendVerificationRequest === inner` is `true`, and after the real merge
the original function is what gets invoked. Both of the two most recent Pathfinder
sends (2026-07-27 02:58:17Z, 2026-07-28 19:21:00Z) carry the raw
`/api/auth/callback/resend?…&token=…&email=…` in the button href and the
plain-text part. No `/verify` anywhere. The `magic_link_request` telemetry in that
same wrapper never fires either — the second symptom of one cause.

Two more Pathfinder rows fail. **The emailed link's host comes from the request.**
Neither `AUTH_URL` nor `NEXTAUTH_URL` is set in Vercel production and neither name
appears in the repo, so `@auth/core` falls back to `x-forwarded-host ?? host` and
derives the emailed origin from it. Vercel overwrites client-supplied
`x-forwarded-host`, which bounds the damage to the project's own hostnames — a
link requested through the `*.vercel.app` deployment URL emails a `*.vercel.app`
link — but the standard says server config, never the request. Setting
`AUTH_URL=https://pathfinder.windwardline.com` is the fix, with the caveat that
Auth.js derives `basePath` from that pathname.

**A send failure never reaches its own copy.** The Resend error is thrown as a
plain `Error`, so Auth.js classifies it `Configuration` and routes to the stock
`/api/auth/error` page. `pages` in `auth.ts` declares only `signIn` and
`verifyRequest`, so the app's own "Sign-in did not work" line is unreachable for
provider failures. Expired and replayed links route there too.

Also latent: an untracked `.env.production` in that repo (a `vercel env pull`
artifact, gitignored) carries an `AUTH_URL` pointing at a Neon Auth endpoint
rather than Pathfinder's origin. Nothing loads it today — Next.js reads env files
from the app directory, which has none — but if it ever reached the runtime,
`basePath` would move, every emailed link would point at the Neon host, and
`validateVerificationCallback` would reject it. Sign-in would stop entirely.

Pathfinder's plain-text part also drops "Click the button below to sign in." and
merges the expiry into the footer line. Minor next to the above.

Both filed for their own repos; neither touched here.

Resend's log also shows Pathfinder's own pre-standard era: subjects
`Sign in to pathfinder.windwardline.com` through 2026-07-26 01:33, then
`Your Pathfinder sign-in link` from 2026-07-26 02:39. The same
old-mail-in-the-inbox effect will reproduce there for anyone comparing two
Pathfinder messages across that boundary.

## What changed here

One repair, in the guard rather than in the config. `tests/securityHardening.test.ts:211`
already pinned the full SMTP block, the sender name, and the subject — two of the
three branded fields. The body was the unpinned one, which is why it was the one
that drifted. It now pins `mailer_templates_magic_link_content` in the
full-block list and asserts every line of the template: the `h2` casing, the
expiry sentence, `#2244FF`, the button label, the footer, and the absence of the
retired palette. It also asserts the script's own verifier reads the body, since
that verifier checked only the two header fields when the half-branded pair went
out. Confirmed to bite by mutating the accent back to `#111c38` and watching it
fail, then restoring.

Checked and clean, needing no change: none of the other thirteen mailer templates
carries the retired navy or the old casing. `mailer_templates_custom_contents`
reports `MAGIC_LINK_CONTENT: true` and every sibling `false` — the magic-link body
is the only customized template, so it was the only one that could have drifted.

## What this leaves standing

The protocol is sound and Levelflow is compliant. The lesson is narrower than
the report suggested: **a template change silently forks the inbox.** Every
email already delivered keeps the branding it was sent with, so any accent or
copy change guarantees a period where two versions coexist in front of the
owner. Worth remembering the next time a palette moves.
