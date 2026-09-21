import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * BARRIER 1 of 2 for any test that executes `bank-minute-bars-daily.sh`.
 *
 * That script reads the FMP key from the login keychain with `security`, and
 * on this machine the keychain answers. On 2026-09-20 the suite ran the script
 * four times against real FMP — two mutations let it past the lock, and two
 * red runs of a new test predated the refusal they were written for — and each
 * time a full roster, about 280,000 bars, was fetched into a sandbox and thrown
 * away. Bandwidth spent that way does not come back.
 *
 * So `security` is shadowed first on PATH by a stub that refuses. The script
 * then logs "keychain unavailable" and stops, whatever else is broken. Barrier
 * 2 is the script's own refusal to bank under a temporary directory; a test
 * pins that the script asks for `security` by name, since an absolute path
 * would walk straight past this one.
 */
let stubDir: string | undefined;

export function noKeychainEnv(): { PATH: string } {
  if (!stubDir) {
    stubDir = mkdtempSync(join(tmpdir(), "no-keychain-"));
    const stub = join(stubDir, "security");
    writeFileSync(
      stub,
      '#!/bin/sh\necho "security: the keychain is unreachable from the test suite" >&2\nexit 44\n',
    );
    chmodSync(stub, 0o755);
  }
  return { PATH: `${stubDir}:${process.env.PATH ?? ""}` };
}
