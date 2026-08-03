#!/usr/bin/env bash
# Set Levelflow's auth email branding (subject + SMTP sender name + magic-link
# body template — the body is a separate config field and stays stale if the
# PATCH omits it).
# Run this yourself: it PATCHes Supabase auth config, and any auth-config
# PATCH must carry the FULL SMTP block — partial updates clear sibling
# fields and GoTrue silently falls back to the built-in mailer.
# GoTrue serves auth config from a short cache: an email sent within a few
# minutes of the PATCH can still render the previous template. Wait ~5
# minutes before send-testing.
# Before confirming the PATCH: check the printed Current values — if
# smtp_admin_email is not login@windwardline.com, edit this script's value
# to match reality first (the full-block PATCH must preserve reality, not
# assumptions).
set -euo pipefail

PROJECT_REF="usrtpoftuvhpmyhlhqlg"
API="https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth"

export SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -a peacock -s supabase-access-token -w 2>/dev/null || true)}"
RESEND_KEY="$(security find-generic-password -a peacock -s resend-api-key -w 2>/dev/null || true)"
[ -n "$SUPABASE_ACCESS_TOKEN" ] && [ -n "$RESEND_KEY" ] || { echo "missing Keychain credentials"; exit 1; }

echo "== Current values =="
curl -fsS "$API" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | python3 -c "import sys,json; c=json.load(sys.stdin); print(json.dumps({k:c.get(k) for k in ('smtp_host','smtp_user','smtp_admin_email','smtp_sender_name','smtp_max_frequency','mailer_subjects_magic_link')}, indent=1))"

read -r -p "PATCH sender name + magic-link subject + body template to 'Levelflow'? [y/N] " yn
[ "$yn" = "y" ] || { echo "aborted"; exit 0; }

PAYLOAD="$(python3 - "$RESEND_KEY" <<'PY'
import json, sys

# Standing Windward Line magic-link template; only the app name and the
# brand-accent button color are Levelflow-specific (spec section 6).
# Dark-mode hardened per the standard (2026-08-02): GoTrue owns the document,
# so the fragment carries its own color-scheme declaration, bgcolor fallbacks
# on the wrapper table and the button cell, and an explicit color on every
# text element — the unhardened template let dark-mode clients recolor it,
# and its #667 footer fell to ~3.1:1 under inversion.
template = """
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="color-scheme:light;background-color:#ffffff">
        <tr><td style="font-family:system-ui,sans-serif;line-height:1.5;color:#111111">
          <h2 style="margin:0 0 12px;color:#111111">Sign in to Levelflow</h2>
          <p style="color:#111111">Click the button below to sign in. This link expires in 15 minutes.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td bgcolor="#2244FF" style="border-radius:8px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background-color:#2244FF;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Sign in</a></td>
          </tr></table>
          <p style="color:#555555;font-size:13px">If you didn&#39;t request this, you can ignore it.</p>
        </td></tr>
      </table>"""

print(json.dumps({
  "smtp_host": "smtp.resend.com",
  "smtp_port": "465",
  "smtp_user": "resend",
  "smtp_pass": sys.argv[1],
  "smtp_admin_email": "login@windwardline.com",
  "smtp_sender_name": "Levelflow",
  "smtp_max_frequency": 60,
  "mailer_subjects_magic_link": "Your Levelflow sign-in link",
  "mailer_templates_magic_link_content": template,
}))
PY
)"

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

echo "== Verifying =="
curl -fsS "$API" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | python3 -c "
import sys, json
c = json.load(sys.stdin)
t = c.get('mailer_templates_magic_link_content') or ''
ok = (
    c.get('smtp_sender_name') == 'Levelflow'
    and c.get('mailer_subjects_magic_link') == 'Your Levelflow sign-in link'
    and c.get('smtp_host') == 'smtp.resend.com'
    and 'Sign in to Levelflow' in t
    and 'LevelFlow' not in t
    and '#2244FF' in t
    and 'color-scheme:light' in t
    and 'bgcolor="#2244FF"' in t
    and '#555555' in t
    and '#667' not in t
)
print('VERIFIED' if ok else 'MISMATCH — inspect config now')
sys.exit(0 if ok else 1)"
