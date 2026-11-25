#!/usr/bin/env bash
# Tests for retry-with-timeout.sh, the wrapper CI uses around the Playwright
# browser install. On 2026-11-23 two runs spent their whole 15 minutes in that
# install because the apt mirror served ~100 KB/s; nothing failed, it was slow.
# A retry only helps if each attempt is cut off, so the cases below cover a
# command that hangs, not just one that exits non-zero.
#
# Every case runs real processes. The counter file records how many attempts
# actually started, so "it retried" is measured rather than inferred.

set -uo pipefail

WRAP=$(cd "$(dirname "$0")" && pwd)/retry-with-timeout.sh
TMP=$(mktemp -d "${TMPDIR:-/tmp}/retry-test.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
pass=0; fail=0

check() { # name expected-exit expected-attempts actual-exit counter-file
  local attempts
  attempts=0
  [ -f "$5" ] && attempts=$(wc -l < "$5" | tr -d ' ')
  if [ "$4" = "$2" ] && [ "${attempts:-0}" = "$3" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL $1: exit $4 (want $2), attempts ${attempts:-0} (want $3)"
  fi
}

# A command that fails until its Nth start, then succeeds.
cat > "$TMP/flaky.sh" <<'EOF'
#!/usr/bin/env bash
echo x >> "$1"
[ "$(wc -l < "$1")" -ge "$2" ]
EOF
# A command that never returns on its first start, then succeeds.
cat > "$TMP/hang-once.sh" <<'EOF'
#!/usr/bin/env bash
echo x >> "$1"
[ "$(wc -l < "$1")" -ge 2 ] && exit 0
sleep 8
EOF
chmod +x "$TMP/flaky.sh" "$TMP/hang-once.sh"

c="$TMP/c1"; "$WRAP" 3 5 -- "$TMP/flaky.sh" "$c" 1 >/dev/null 2>&1
check "succeeds first time, runs once" 0 1 $? "$c"

c="$TMP/c2"; "$WRAP" 3 5 -- "$TMP/flaky.sh" "$c" 3 >/dev/null 2>&1
check "succeeds on the last attempt" 0 3 $? "$c"

c="$TMP/c3"; "$WRAP" 3 5 -- "$TMP/flaky.sh" "$c" 99 >/dev/null 2>&1
check "fails after the attempts run out" 1 3 $? "$c"

c="$TMP/c4"; start=$(date +%s); "$WRAP" 3 2 -- "$TMP/hang-once.sh" "$c" >/dev/null 2>&1
rc=$?; elapsed=$(( $(date +%s) - start ))
check "cuts off a hung attempt and retries" 0 2 $rc "$c"
if [ "$elapsed" -ge 8 ]; then
  fail=$((fail + 1)); echo "FAIL hung attempt was not cut off: ${elapsed}s"
else
  pass=$((pass + 1))
fi

c="$TMP/c5"; "$WRAP" 0 5 -- "$TMP/flaky.sh" "$c" 1 >/dev/null 2>&1
check "refuses zero attempts" 64 0 $? "$c"

c="$TMP/c6"; "$WRAP" 3 5 "$TMP/flaky.sh" "$c" 1 >/dev/null 2>&1
check "refuses a call without --" 64 0 $? "$c"

# --between runs only between attempts, never before the first or after the last.
c="$TMP/c7"; b="$TMP/b7"
"$WRAP" 3 5 --between "echo x >> $b" -- "$TMP/flaky.sh" "$c" 3 >/dev/null 2>&1
check "repairs between attempts" 0 3 $? "$c"
check "repair runs twice for three attempts" 0 2 0 "$b"

# Mutation: without the per-attempt cap the hung attempt must run to the end
# and never be retried. A cap whose removal changes nothing was never capping.
mutant="$TMP/mutant.sh"
sed 's/^  timeout --kill-after=10 "\$seconds" "\$@"$/  "$@"/' "$WRAP" > "$mutant"
if grep -q "timeout --kill-after" "$mutant"; then
  fail=$((fail + 1)); echo "FAIL mutation did not land"
else
  c="$TMP/c8"; bash "$mutant" 3 2 -- "$TMP/hang-once.sh" "$c" >/dev/null 2>&1
  check "mutant without the cap never retries" 0 1 $? "$c"
fi

echo "retry-with-timeout: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
