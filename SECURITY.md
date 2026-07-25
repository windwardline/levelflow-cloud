# Security Policy

## Reporting a Vulnerability

Do not disclose suspected vulnerabilities, credentials, or exploit details in
a public issue or pull request.

Use this repository's private vulnerability-reporting workflow (Security →
Report a vulnerability). Include the affected component, reproduction steps,
observed and expected behavior, and potential impact. Do not include real
user data, active credentials, or production secrets.

You should receive a reply within 72 hours.

## Scope

- This repository and the deployment at https://levelflow.windwardline.com
- Security-critical boundaries: Supabase Auth, per-user row-level security on
  all user-owned tables, Edge Function authorization, and the separation of
  browser-safe keys from server-only service-role credentials.
