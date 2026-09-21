import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * BARRIER 1 of 2 for any test that executes `bank-minute-bars-daily.sh`.
 *
 * That script reads the FMP key from the login keychain with `security`, and
 * on this machine the keychain answers. On 2026-09-20 the suite ran the script
 * six times against real FMP, each a full roster of about 280,000 bars and some
 * 244 MB in all. Two were red runs of a test written to prove a guard that did
 * not exist yet — and since the script then ignored LEVELFLOW_BANK_DIR, they
 * banked into the PRODUCTION store. A red run executes the code as it is, not
 * as the test imagines it. Bandwidth spent that way does not come back.
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
