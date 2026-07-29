#!/usr/bin/env bash
# Rename Levelflow's auth email branding (subject + SMTP sender name).
# Run this yourself: it PATCHes Supabase auth config, and any auth-config
# PATCH must carry the FULL SMTP block — partial updates clear sibling
# fields and GoTrue silently falls back to the built-in mailer.
set -euo pipefail

PROJECT_REF="usrtpoftuvhpmyhlhqlg"
API="https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth"

export SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -a peacock -s supabase-access-token -w 2>/dev/null || true)}"
RESEND_KEY="$(security find-generic-password -a peacock -s resend-api-key -w 2>/dev/null || true)"
[ -n "$SUPABASE_ACCESS_TOKEN" ] && [ -n "$RESEND_KEY" ] || { echo "missing Keychain credentials"; exit 1; }

echo "== Current values =="
curl -fsS "$API" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
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
curl -fsS "$API" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | python3 -c "import sys,json; c=json.load(sys.stdin); ok=(c.get('smtp_sender_name')=='Levelflow' and c.get('mailer_subjects_magic_link')=='Your Levelflow sign-in link' and c.get('smtp_host')=='smtp.resend.com'); print('VERIFIED' if ok else 'MISMATCH — inspect config now'); sys.exit(0 if ok else 1)"
