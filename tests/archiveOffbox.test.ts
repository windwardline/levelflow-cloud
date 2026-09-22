import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { scratchDir } from "./support/scratchDir.ts";

/**
 * Permanent off-box archives: `scripts/ops/push-archive-offbox.sh`.
 *
 * `windwardline-backups` deletes every object 365 days after upload, whatever
 * its name, so the minute bank's name-protection of `20260823` holds against
 * this repo's prune and not against R2. Datasets that must outlive a year go
 * to `windwardline-archives`: no expiry, an indefinite lock, write-once. A
 * fixture written there can never be removed, which is why nothing here can
 * reach it.
 *
 * NOTHING HERE TOUCHES R2, THE KEYCHAIN OR THE NETWORK, and that is a property
 * of the PATH, not of care. Every run gets exactly two directories on PATH:
 * the sandbox's stubs (a fake `rclone` over a directory, a `wl-secret` that
 * mirrors the real launcher's scrubbed environment) and a tools directory of
 * named links to the system tools the script needs. The real `rclone`,
 * `security` and `wl-secret` are not in it, so a missing stub is a
 * `command not found`, never a live call. The first test proves that before
 * anything else runs. zstd is the REAL zstd, linked in; the suite refuses to
 * run the script without it rather than stubbing compression away.
 */

const SCRIPT = "scripts/ops/push-archive-offbox.sh";
const TOKEN = "stub-r2-token-not-a-credential-4f1c9e";
const SECRET = createHash("sha256").update(TOKEN).digest("hex");
const TEST_BUCKET = "test-archives";
const DATASET = "calibration-cache";
const NAME = "levelflow-cache-fixture-20260921";
const KEY = `levelflow-cloud/${DATASET}/${NAME}.tar.zst`;
const BASH = "/bin/bash";

// Everything the script and the stubs call. Resolved from the suite's own
// PATH once and linked into one directory, so the runs see nothing else.
// `bash` is here because the script re-execs itself through wl-secret, which
// runs the child under `env -i`: the shebang's `/usr/bin/env bash` then has to
// find a bash on the PATH wl-secret hands over, and finding none is exit 127.
const TOOLS = [
  "awk", "bash", "cat", "chmod", "cmp", "cp", "cut", "date", "dd", "df", "diff", "dirname", "find",
  "grep", "head", "ls", "mkdir", "mktemp", "rm", "rmdir", "shasum", "sleep", "tar", "tr", "wc", "zstd",
];

function which(tool: string): string | undefined {
  const found = spawnSync("/bin/sh", ["-c", `command -v ${tool}`], { encoding: "utf8" });
  const path = found.stdout.trim();
  return found.status === 0 && path.startsWith("/") ? path : undefined;
}

const toolDirs = new Map<string, string>();

/** A directory of links to the real tools, minus any named in `without`. */
function toolsDir(without: string[] = []): string {
  const id = without.join(",");
  const cached = toolDirs.get(id);
  if (cached) return cached;
  const dir = scratchDir("archive-tools-");
  for (const tool of TOOLS) {
    if (without.includes(tool)) continue;
    const real = which(tool);
    // This is the first suite here to need a real zstd, and ci.yml installs
    // nothing beyond Node. If a runner image ever ships without it, the message
    // has to read as an image gap with its remedy, not as a code defect.
    assert.ok(
      real,
      tool === "zstd"
        ? `zstd is required to exercise ${SCRIPT} and is not on PATH. On this machine: brew install zstd. On a CI runner whose image lacks it: add "sudo apt-get install -y zstd" before the gates step in .github/workflows/ci.yml`
        : `${tool} is required to exercise ${SCRIPT} and is not installed`,
    );
    symlinkSync(real, join(dir, tool));
  }
  // md5sum where it exists, md5 where it does not; the script takes either.
  const md5 = ["md5sum", "md5"].filter((tool) => which(tool));
  assert.ok(md5.length > 0, "neither md5sum nor md5 is installed");
  for (const tool of md5) symlinkSync(which(tool)!, join(dir, tool));
  toolDirs.set(id, dir);
  return dir;
}

interface Sandbox {
  root: string;
  source: string;
  remote: string;
  staging: string;
  home: string;
  bin: string;
  log: string;
  files: Record<string, string>;
}

const FIXTURE: Record<string, string> = {
  "AUDCAD-5min-7000.rolling.json": `${JSON.stringify({ bars: [1, 2, 3], note: "a".repeat(400) })}\n`,
  "BTCUSD-daily.json": `${JSON.stringify({ bars: [4, 5, 6] })}\n`,
  "INVALID-READ-ME.txt": "This store is condemned. It is kept because nothing else holds it.\n",
  "nested/cot-2026.json": `${JSON.stringify({ cot: true })}\n`,
};

/** A source directory outside nothing but a temp root, a fake R2, and stubs. */
function sandbox(): Sandbox {
  const root = scratchDir("archive-offbox-");
  const source = join(root, "src", NAME);
  mkdirSync(join(source, "nested"), { recursive: true });
  mkdirSync(join(source, "empty-dir"));
  for (const [path, body] of Object.entries(FIXTURE)) writeFileSync(join(source, path), body);
  const remote = join(root, "r2");
  const home = join(root, "home");
  const bin = join(root, "bin");
  for (const dir of [remote, home, bin]) mkdirSync(dir);
  // The bucket exists and the prefix does not, as on R2 before a first push.
  mkdirSync(join(remote, TEST_BUCKET));
  const sb: Sandbox = {
    root,
    source,
    remote,
    staging: join(root, "staging"),
    home,
    bin,
    log: join(root, "rclone.argv"),
    files: FIXTURE,
  };
  writeFileSync(join(bin, "rclone"), rcloneStub(sb), { mode: 0o755 });
  writeFileSync(join(bin, "wl-secret"), wlSecretStub(), { mode: 0o755 });
  return sb;
}

/**
 * A fake R2 over a directory: `R2:<bucket>/<key>` is `<remote>/<bucket>/<key>`.
 * It implements the three calls the script makes and refuses every other one,
 * so a destructive call is a red test rather than a no-op. It also refuses to
 * run unless the remote is configured through RCLONE_CONFIG_R2_* with the
 * SHA-256 of the token as the secret, which is how the credential derivation
 * is proven without the credential. Behaviour toggles are files, because
 * wl-secret scrubs the environment.
 *
 * It behaves as the real rclone v1.75.1 does against R2, measured 2026-09-22,
 * never as the script might hope: a prefix holding nothing lists empty with
 * exit 0 and a missing bucket exits 3; `copyto` replaces a different object
 * whatever `--immutable` says, because rclone checks that flag only when it
 * walks a directory, and leaves an existing key alone under `--ignore-existing`.
 * A stub that refused on `--immutable` passed this suite over a barrier the
 * real tool does not have.
 */
function rcloneStub(sb: Sandbox): string {
  return `#!/bin/bash
ROOT='${sb.remote}'
printf '%s\\n' "$*" >> '${sb.log}'
if [ "\${RCLONE_CONFIG_R2_TYPE:-}" != s3 ] || [ "\${RCLONE_CONFIG_R2_PROVIDER:-}" != Cloudflare ]; then
  echo "stub rclone: remote R2 is not configured through RCLONE_CONFIG_R2_*" >&2; exit 97
fi
if [ "\${RCLONE_CONFIG_R2_SECRET_ACCESS_KEY:-}" != '${SECRET}' ]; then
  echo "stub rclone: the S3 secret is not the SHA-256 of R2_TOKEN" >&2; exit 97
fi
sub="$1"; shift
ignore_existing=0
format=""
pos=()
while [ $# -gt 0 ]; do
  case "$1" in
    --ignore-existing) ignore_existing=1 ;;
    --format) shift; format="$1" ;;
    --*) ;;
    *) pos+=("$1") ;;
  esac
  shift
done
onr2() { case "$1" in R2:*) printf '%s/%s' "$ROOT" "\${1#R2:}" ;; *) return 1 ;; esac; }
bucket_of() { local p="\${1#R2:}"; printf '%s/%s' "$ROOT" "\${p%%/*}"; }
case "$sub" in
  lsf)
    if [ -e "$ROOT/.lsf-fails" ]; then echo "ERROR : error listing: temporary failure (stub)" >&2; exit 5; fi
    d="$(onr2 "\${pos[0]}")" || { echo "stub rclone: not an R2 path" >&2; exit 98; }
    if [ ! -d "$(bucket_of "\${pos[0]}")" ]; then echo "ERROR : error listing: directory not found" >&2; exit 3; fi
    if [ -d "$d" ]; then
      for f in "$d"/*; do
        [ -f "$f" ] || continue
        if [ "$format" = sp ]; then printf '%s;%s\\n' "$(wc -c < "$f" | tr -d ' ')" "\${f##*/}"; else printf '%s\\n' "\${f##*/}"; fi
      done
    fi
    if [ -e "$ROOT/.plant-after-lsf" ]; then
      mkdir -p "$d" && printf 'planted after the listing\\n' > "$d/$(cat "$ROOT/.plant-after-lsf")"
    fi
    exit 0 ;;
  cat)
    f="$(onr2 "\${pos[0]}")" || { echo "stub rclone: not an R2 path" >&2; exit 98; }
    if [ ! -f "$f" ]; then echo "ERROR : error listing: directory not found" >&2; exit 3; fi
    if [ -e "$ROOT/.short-cat" ]; then head -c 10 "$f"; exit 0; fi
    if [ -e "$ROOT/.corrupt-cat" ]; then
      t="$ROOT/.corrupt.tmp"
      cp "$f" "$t"
      size=$(wc -c < "$t")
      printf 'CORRUPTEDCORRUPT' | dd of="$t" bs=1 seek=$((size / 4)) conv=notrunc 2>/dev/null
      cat "$t"; rm -f "$t"; exit 0
    fi
    cat "$f"; exit 0 ;;
  copyto)
    src="\${pos[0]}"
    dst="$(onr2 "\${pos[1]}")" || { echo "stub rclone: not an R2 path" >&2; exit 98; }
    : > "$ROOT/.copy-started"
    if [ -e "$(dirname "$src")/restore" ]; then : > "$ROOT/.restore-at-upload"; fi
    if [ -e "$ROOT/.slow-copy" ]; then sleep 3; fi
    if [ -e "$dst" ] && [ "$ignore_existing" = 1 ]; then exit 0; fi
    mkdir -p "$(dirname "$dst")" && cp "$src" "$dst"; exit $? ;;
  *)
    echo "stub rclone: unsupported subcommand '$sub'" >&2; exit 99 ;;
esac
`;
}

/**
 * The real ~/.local/bin/wl-secret, minus the Keychain: the same argument
 * grammar, and the same `env -i` with only HOME, USER, PATH, LANG and TMPDIR
 * carried forward. What a run through this sees is what the runbook's run sees.
 */
function wlSecretStub(): string {
  return `#!/bin/bash
pairs=()
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; break ;;
    *=*) pairs+=("$1"); shift ;;
    *) echo "stub wl-secret: not a <service>=<ENV_NAME> pair and not --: '$1'" >&2; exit 78 ;;
  esac
done
child=("HOME=$HOME" "USER=\${USER:-tester}" "PATH=$PATH" "LANG=\${LANG:-en_US.UTF-8}")
if [ -n "\${TMPDIR:-}" ]; then child+=("TMPDIR=$TMPDIR"); fi
for p in "\${pairs[@]}"; do
  svc="\${p%%=*}"; name="\${p#*=}"
  if [ "$svc" != cloudflare-r2-backup ]; then echo "stub wl-secret: no stand-in for '$svc'" >&2; exit 78; fi
  child+=("$name=${TOKEN}")
done
exec /usr/bin/env -i "\${child[@]}" "$@"
`;
}

/** Shadow tar with a hook that fires on one mode, then hand off to the real one. */
function tarHook(sb: Sandbox, mode: "-cf" | "-tvf" | "-xf", action: string) {
  const real = which("tar");
  assert.ok(real);
  writeFileSync(
    join(sb.bin, "tar"),
    `#!/bin/bash\ncase " $* " in *" ${mode} "*) ${action} ;; esac\nexec '${real}' "$@"\n`,
    { mode: 0o755 },
  );
}

/**
 * Shadow zstd so COMPRESSION takes an extra flag and everything else does not.
 * `windwardline-toolchain-update` runs `brew upgrade --formula` daily, so the
 * compressor this machine builds an archive with will move. A rebuild that no
 * longer reproduces last year's bytes says nothing about whether the object R2
 * holds is intact, and the script must not read it as a human decision.
 */
function zstdHook(sb: Sandbox, extra: string) {
  const real = which("zstd");
  assert.ok(real);
  writeFileSync(
    join(sb.bin, "zstd"),
    `#!/bin/bash\ncase " $* " in *" -o "*) exec '${real}' ${extra} "$@" ;; esac\nexec '${real}' "$@"\n`,
    { mode: 0o755 },
  );
}

/**
 * Shadow df with a queue of Available figures in KiB, one per call, the last
 * repeating; "fail" makes that call exit 1. The filesystem name carries a
 * space, so every run through this proves the reading is taken beside the
 * capacity column and not by position.
 */
function dfStub(sb: Sandbox, available: string[]) {
  const calls = join(sb.root, "df.calls");
  writeFileSync(
    join(sb.bin, "df"),
    `#!/bin/bash
vals=(${available.join(" ")})
n=0
if [ -f '${calls}' ]; then read -r n < '${calls}'; fi
echo $((n + 1)) > '${calls}'
i=$n
if [ "$i" -ge "\${#vals[@]}" ]; then i=$(( \${#vals[@]} - 1 )); fi
v="\${vals[$i]}"
if [ "$v" = fail ]; then echo "df: stub failure" >&2; exit 1; fi
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\nmap stub 999999999999 0 %s 1%% /stub\n' "$v"
`,
    { mode: 0o755 },
  );
}

const dfCalls = (sb: Sandbox) => {
  const calls = join(sb.root, "df.calls");
  return existsSync(calls) ? Number(readFileSync(calls, "utf8").trim()) : 0;
};

interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
}

function envFor(sb: Sandbox, overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const env: Record<string, string | undefined> = {
    HOME: sb.home,
    PATH: `${sb.bin}:${toolsDir()}`,
    R2_TOKEN: TOKEN,
    LEVELFLOW_ARCHIVE_BUCKET: TEST_BUCKET,
    LEVELFLOW_ARCHIVE_STAGING: sb.staging,
    ...overrides,
  };
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined));
}

function run(sb: Sandbox, overrides: Record<string, string | undefined> = {}, args = [sb.source, DATASET]): Result {
  const r = spawnSync(BASH, [SCRIPT, ...args], { encoding: "utf8", env: envFor(sb, overrides) });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const objectPath = (sb: Sandbox) => join(sb.remote, TEST_BUCKET, KEY);
const rcloneCalls = (sb: Sandbox) => (existsSync(sb.log) ? readFileSync(sb.log, "utf8").split("\n").filter(Boolean) : []);
const uploads = (sb: Sandbox) => rcloneCalls(sb).filter((call) => call.startsWith("copyto"));
const md5 = (path: string) => createHash("md5").update(readFileSync(path)).digest("hex");

/** Staging must hold nothing after a run, whatever path it took out. */
function assertStagingClean(root: string) {
  const left = existsSync(root) ? readdirSync(root) : [];
  assert.deepEqual(left, [], `staging still holds ${left.join(", ")}`);
}

function assertNoCredential(sb: Sandbox, r: Result) {
  const surfaces = { stdout: r.stdout, stderr: r.stderr, "rclone argv": rcloneCalls(sb).join("\n") };
  for (const [where, text] of Object.entries(surfaces)) {
    assert.ok(!text.includes(TOKEN), `the token appears in ${where}`);
    assert.ok(!text.includes(SECRET), `the derived S3 secret appears in ${where}`);
  }
}

const ROW = new RegExp(
  `^\\| \`${TEST_BUCKET}/${KEY.replaceAll(".", "\\.")}\` \\| (\\d+) \\| ([0-9a-f]{32}) \\| (\\d+) \\| (\\d+) \\| (\\d{4}-\\d{2}-\\d{2}) \\|$`,
);

/** The register row, which must be the whole of stdout; anything else fails. */
function rowOf(stdout: string): RegExpMatchArray {
  const lines = stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 1, `stdout must be the register row alone:\n${stdout}`);
  const row = lines[0].match(ROW);
  assert.ok(row, `not a register row: ${lines[0]}`);
  return row;
}

describe("the harness cannot reach anything real", () => {
  it("resolves rclone and wl-secret to stubs, zstd to the real one, and security to nothing", () => {
    const sb = sandbox();
    const probe = spawnSync(
      BASH,
      ["-c", "for t in rclone wl-secret zstd security brew; do printf '%s=%s\\n' \"$t\" \"$(command -v \"$t\" || echo MISSING)\"; done"],
      { encoding: "utf8", env: envFor(sb) },
    );
    const found = Object.fromEntries(probe.stdout.trim().split("\n").map((line) => line.split("=") as [string, string]));
    assert.equal(found.rclone, join(sb.bin, "rclone"));
    assert.equal(found["wl-secret"], join(sb.bin, "wl-secret"));
    assert.equal(found.zstd, join(toolsDir(), "zstd"));
    assert.equal(found.security, "MISSING");
    assert.equal(found.brew, "MISSING");
    assert.ok(!existsSync(join(toolsDir(), "rclone")), "the real rclone must not be linked into the tools directory");
  });
});

describe("a permanent archive is proven by restoring it", () => {
  it("archives, uploads once, streams the object back and restores it byte-for-byte, through wl-secret's scrubbed environment", () => {
    const sb = sandbox();
    // The runbook's shape: wl-secret outermost, nothing inherited but what it
    // passes. The test bucket rides in after `--`, the only way past env -i.
    const r = spawnSync(
      join(sb.bin, "wl-secret"),
      ["cloudflare-r2-backup=R2_TOKEN", "--", "/usr/bin/env", `LEVELFLOW_ARCHIVE_BUCKET=${TEST_BUCKET}`, BASH, SCRIPT, sb.source, DATASET],
      { encoding: "utf8", env: { HOME: sb.home, PATH: `${sb.bin}:${toolsDir()}` } },
    );
    assert.equal(r.status, 0, r.stderr);
    const [, bytes, digest, files, sourceBytes, day] = rowOf(r.stdout);

    const object = objectPath(sb);
    assert.ok(existsSync(object), "no object at the key");
    assert.equal(Number(bytes), statSync(object).size);
    assert.equal(digest, md5(object));
    assert.equal(Number(files), Object.keys(sb.files).length);
    assert.equal(Number(sourceBytes), Object.values(sb.files).reduce((sum, body) => sum + Buffer.byteLength(body), 0));
    assert.equal(day, new Date().toISOString().slice(0, 10));
    assert.match(r.stderr, /restore proven/);

    // An external anchor, not the script's word: restore the object here with
    // the real tools and compare every file with the source.
    const out = scratchDir("archive-restore-");
    const restored = spawnSync("/bin/sh", ["-c", `zstd -q -dc '${object}' | tar -xf - -C '${out}'`], { encoding: "utf8" });
    assert.equal(restored.status, 0, restored.stderr);
    assert.deepEqual(readdirSync(out), [NAME], "the archive must hold its directory by name, no absolute paths");
    for (const [path, body] of Object.entries(sb.files)) {
      assert.equal(readFileSync(join(out, NAME, path), "utf8"), body, `${path} did not restore`);
    }
    assert.ok(existsSync(join(out, NAME, "empty-dir")), "empty directories are part of the tree");

    // One upload, then a read of that key; never rclone's own hashsum.
    const calls = rcloneCalls(sb);
    assert.equal(uploads(sb).length, 1);
    assert.match(uploads(sb)[0], /^copyto --ignore-existing /);
    assert.ok(calls.findIndex((c) => c.startsWith("cat ")) > calls.findIndex((c) => c.startsWith("copyto")));
    assert.ok(!calls.some((c) => c.startsWith("hashsum")));
    // The archive was restored here before it was sent, never after, and the
    // restore was gone by then: the returned copy takes its space.
    const proven = r.stderr.indexOf("restore proven locally");
    assert.ok(proven >= 0 && proven < r.stderr.indexOf("uploaded;"), "the local restore must precede the upload");
    assert.ok(!existsSync(join(sb.remote, ".restore-at-upload")), "the local restore must be removed before the upload");

    // The default staging root: named, under HOME, and empty afterwards.
    assertStagingClean(join(sb.home, ".local", "share", "levelflow-cloud", "staging"));
    assert.ok(!existsSync(join(sb.home, ".config", "rclone")), "no rclone.conf may be written");
    assertNoCredential(sb, { code: r.status, stdout: r.stdout, stderr: r.stderr });
  });

  it("recognises its own object on a re-run: already archived, re-proven, exit 0, nothing uploaded", () => {
    const sb = sandbox();
    const first = run(sb);
    assert.equal(first.code, 0, first.stderr);
    const before = statSync(objectPath(sb));
    const second = run(sb);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stderr, /already archived/);
    assert.match(second.stderr, /restore proven/);
    // Both rows record the one object R2 holds; the second run built nothing.
    assert.equal(rowOf(second.stdout)[2], rowOf(first.stdout)[2]);
    assert.equal(uploads(sb).length, 1, "the second run must not upload");
    assert.equal(statSync(objectPath(sb)).mtimeMs, before.mtimeMs);
    assertStagingClean(sb.staging);
    assertNoCredential(sb, second);
  });

  it("re-proves an existing object by restoring it, without rebuilding it, whatever compressor built it", () => {
    // The object is built by a shadow compressor whose bytes this machine's
    // zstd does not reproduce, as next year's zstd will not reproduce this
    // year's. The re-run must pass on the restore and never build at all.
    const sb = sandbox();
    zstdHook(sb, "--no-check");
    const first = run(sb);
    assert.equal(first.code, 0, first.stderr);
    const object = objectPath(sb);
    const remoteMd5 = md5(object);
    const remoteBytes = statSync(object).size;

    // Without this the case is vacuous: the object must really differ from
    // what the zstd on PATH now would build from the same source.
    const rebuild = join(scratchDir("archive-rebuild-"), "rebuild.tar.zst");
    const built = spawnSync(
      "/bin/sh",
      ["-c", `COPYFILE_DISABLE=1 tar --format=ustar -C '${join(sb.root, "src")}' -cf - '${NAME}' | zstd -q -19 -T0 -o '${rebuild}'`],
      { encoding: "utf8" },
    );
    assert.equal(built.status, 0, built.stderr);
    assert.notEqual(md5(rebuild), remoteMd5, "the shadow compressor did not change the archive");

    unlinkSync(join(sb.bin, "zstd"));
    const marker = join(sb.root, "built");
    tarHook(sb, "-cf", `: > '${marker}'`);
    const second = run(sb);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stderr, /already archived/);
    assert.match(second.stderr, /restore proven/);
    assert.ok(!existsSync(marker), "an existing key must not be rebuilt");
    assert.doesNotMatch(second.stderr, /archiving at zstd/);

    // The register records what R2 holds, never what a run happened to build.
    const [, bytes, digest] = rowOf(second.stdout);
    assert.equal(digest, remoteMd5);
    assert.equal(Number(bytes), remoteBytes);
    assert.equal(rowOf(first.stdout)[2], remoteMd5, "the first row records the object R2 holds");
    assert.equal(uploads(sb).length, 1, "nothing may be written to prove a restore");
    assert.equal(md5(object), remoteMd5, "the object is untouched");
    assertStagingClean(sb.staging);
  });

  it("refuses a re-run whose source changed after the archive was read, and prints no row", () => {
    // The already-archived twin of the file-changed case. Once the bucket lock
    // is on, this is the only path any push will ever take again, so a mutation
    // that skips the restore here must be a red test.
    const sb = sandbox();
    const first = run(sb);
    assert.equal(first.code, 0, first.stderr);
    tarHook(sb, "-xf", `printf 'edited\\n' >> '${join(sb.source, "BTCUSD-daily.json")}'`);
    const second = run(sb);
    assert.equal(second.code, 1);
    assert.match(second.stderr, /holds an object that does not restore to this source/);
    assert.match(second.stderr, /the restored tree differs from the source/);
    assert.match(second.stderr, /BTCUSD-daily\.json/);
    assert.match(second.stderr, /this basename's key is spent/, "the refusal names the remedy");
    assert.equal(second.stdout, "", "no register row for an unproven restore");
    assert.equal(uploads(sb).length, 1, "the re-run must not write");
    assertStagingClean(sb.staging);
  });

  it("prints no register row when staging cannot be removed, and says why", () => {
    // The row is what the runbook appends to the register with `>>`. A run that
    // exits 1 must not leave one behind, so staging is cleared BEFORE the row is
    // printed — and a failed `rm` has to reach its own named report rather than
    // tripping errexit inside the trap and exiting on a bare status.
    const sb = sandbox();
    const real = which("rm");
    assert.ok(real);
    writeFileSync(
      join(sb.bin, "rm"),
      // The run's own directory only: the local restore inside it is removed
      // mid-run, before the upload, and that removal must still work.
      `#!/bin/bash\nfor a in "$@"; do case "$a" in '${sb.staging}'/push.*/*) ;; '${sb.staging}'/push.*) echo "rm: stub refuses" >&2; exit 1 ;; esac; done\nexec '${real}' "$@"\n`,
      { mode: 0o755 },
    );
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /could not remove staging/);
    assert.equal(r.stdout, "", "a run that exits 1 must not print a register row");
    // The object itself landed and was proven; only the housekeeping failed.
    assert.equal(uploads(sb).length, 1);
    assert.match(r.stderr, /restore proven/);
    rmSync(sb.staging, { recursive: true, force: true });
  });

  it("refuses to overwrite a different object at the key", () => {
    const sb = sandbox();
    mkdirSync(join(sb.remote, TEST_BUCKET, "levelflow-cloud", DATASET), { recursive: true });
    writeFileSync(objectPath(sb), "an archive this source did not produce\n");
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /is damaged: its 39 bytes .* fail zstd -t/);
    assert.match(r.stderr, /Refusing to overwrite a permanent archive/);
    assert.equal(r.stdout, "");
    assert.equal(readFileSync(objectPath(sb), "utf8"), "an archive this source did not produce\n");
    assert.equal(uploads(sb).length, 0);
    assertStagingClean(sb.staging);
  });

  it("leaves an object that reaches the key after the listing alone, and refuses", () => {
    // Between the listing and the upload lies a build of up to half an hour.
    // Whatever lands at the key meanwhile, the upload must not replace it.
    const sb = sandbox();
    writeFileSync(join(sb.remote, ".plant-after-lsf"), `${NAME}.tar.zst`);
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /does not match what was uploaded/);
    assert.equal(readFileSync(objectPath(sb), "utf8"), "planted after the listing\n", "the upload replaced the object");
    assert.equal(uploads(sb).length, 1);
    assert.equal(r.stdout, "");
    assertStagingClean(sb.staging);
  });

  it("refuses a run whose key another run holds, and leaves that run's lock", () => {
    const sb = sandbox();
    const lock = `lock.${`${TEST_BUCKET}/${KEY}`.replaceAll("/", "%")}`;
    mkdirSync(join(sb.staging, lock), { recursive: true });
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /another push holds R2:test-archives\/levelflow-cloud\/calibration-cache\//);
    assert.equal(rcloneCalls(sb).length, 0);
    assert.deepEqual(readdirSync(sb.staging), [lock], "another run's lock is not this run's to remove");
  });

  it("reads a missing bucket as a missing bucket, never as an absent key", () => {
    const sb = sandbox();
    const r = run(sb, { LEVELFLOW_ARCHIVE_BUCKET: "no-such-bucket" });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /R2:no-such-bucket was not found \(rclone exit 3\)/);
    assert.equal(uploads(sb).length, 0);
    assertStagingClean(sb.staging);
  });

  it("refuses, unread, an object larger than any archive of this source could be", () => {
    const sb = sandbox();
    mkdirSync(join(sb.remote, TEST_BUCKET, "levelflow-cloud", DATASET), { recursive: true });
    writeFileSync(objectPath(sb), Buffer.alloc(2 * 1024 * 1024, 1));
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /more than any archive of this source can be/);
    assert.match(r.stderr, /key is spent/);
    assert.ok(!rcloneCalls(sb).some((call) => call.startsWith("cat ")), "nothing may be streamed back");
    assertStagingClean(sb.staging);
  });

  it("sizes a re-proof from the object it streams back, never from a rebuild it will not make", () => {
    // 1 GiB of headroom plus 1 MiB: room for this object beside its restore,
    // not for the incompressible bound a new push of the same source claims.
    const room = String(1024 * 1024 + 1024);
    const fresh = sandbox();
    dfStub(fresh, [room]);
    const refused = run(fresh);
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /an archive of this source beside its restore needs/);

    const sb = sandbox();
    assert.equal(run(sb).code, 0);
    dfStub(sb, [room]);
    const reproof = run(sb);
    assert.equal(reproof.code, 0, reproof.stderr);
    assert.match(reproof.stderr, /already archived/);
    assert.equal(dfCalls(sb), 1, "a re-proof checks once, for what it will hold");
    assertStagingClean(sb.staging);
  });

  it("decides nothing about an object it cannot extract here", () => {
    // A full disk or a permission fault is this machine's. The spent-key
    // verdict is for an object that fails on its own bytes.
    const sb = sandbox();
    assert.equal(run(sb).code, 0);
    tarHook(sb, "-xf", "exit 1");
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /could not compare R2:\S+ with the source here: it did not extract here/);
    assert.match(r.stderr, /nothing was decided about it/);
    assert.doesNotMatch(r.stderr, /spent/);
    assert.equal(r.stdout, "");
    assertStagingClean(sb.staging);
  });

  it("decides nothing about an object diff could not compare", () => {
    // diff exits 1 for a difference and 2 for trouble; only the first is the
    // object's.
    const sb = sandbox();
    assert.equal(run(sb).code, 0);
    writeFileSync(join(sb.bin, "diff"), '#!/bin/bash\necho "diff: stub trouble" >&2\nexit 2\n', { mode: 0o755 });
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /diff could not compare the trees \(exit 2\)/);
    assert.match(r.stderr, /nothing was decided about it/);
    assert.doesNotMatch(r.stderr, /spent/);
    assertStagingClean(sb.staging);
  });

  it("decides nothing about an object whose transfer comes back short", () => {
    const sb = sandbox();
    assert.equal(run(sb).code, 0);
    writeFileSync(join(sb.remote, ".short-cat"), "");
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /streamed back 10 bytes and lists \d+; the transfer failed, nothing was decided about the object/);
    assert.doesNotMatch(r.stderr, /spent/);
    assertStagingClean(sb.staging);
  });

  it("refuses when the bytes R2 returns are not the bytes it was sent, and a clean re-run recovers", () => {
    const sb = sandbox();
    writeFileSync(join(sb.remote, ".corrupt-cat"), "");
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /the object R2 returned for .* does not match what was uploaded/);
    assert.match(r.stderr, /cannot be replaced: run again with the source unchanged/);
    assert.equal(r.stdout, "", "no register row for an unproven archive");
    assertStagingClean(sb.staging);
    // The upload itself landed; the proof is what failed. With the reads
    // honest again, the next run finds its own object and proves it.
    rmToggle(sb, ".corrupt-cat");
    const again = run(sb);
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stderr, /already archived/);
    assert.equal(uploads(sb).length, 1);
  });

  it("refuses an archive whose file count is not the source's (a file arrived while tar read)", () => {
    const sb = sandbox();
    tarHook(sb, "-cf", `printf 'late\\n' > '${join(sb.source, "late-arrival.json")}'`);
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /the archive lists 5 files and the source held 4 when counted/);
    assert.equal(uploads(sb).length, 0, "nothing may be uploaded");
    assert.ok(!existsSync(objectPath(sb)));
    assertStagingClean(sb.staging);
  });

  for (const [when, mode] of [
    ["after tar read it", "-tvf"],
    ["while the archive was restored here", "-xf"],
  ] as const) {
    it(`refuses before uploading when a file changed ${when}: nothing reaches the write-once key`, () => {
      // The upload is irreversible under the lock, so every proof runs on the
      // safe side of it. A diff that failed after the upload would leave an
      // object at this key that no later run could prove or replace.
      const sb = sandbox();
      tarHook(sb, mode, `printf 'edited\\n' >> '${join(sb.source, "BTCUSD-daily.json")}'`);
      const r = run(sb);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /the archive does not restore to the source: the restored tree differs from the source/);
      assert.match(r.stderr, /BTCUSD-daily\.json/);
      assert.match(r.stderr, /Nothing was uploaded/);
      assert.equal(r.stdout, "");
      assert.equal(uploads(sb).length, 0, "nothing may be uploaded");
      assert.ok(!existsSync(objectPath(sb)), "no object may sit at the key");
      assertStagingClean(sb.staging);
      // With the source still again, the next run takes the fresh path, not a spent key.
      rmSync(join(sb.bin, "tar"));
      const again = run(sb);
      assert.equal(again.code, 0, again.stderr);
      assert.doesNotMatch(again.stderr, /already archived/);
    });
  }

  it("reads a failed listing as a failure, never as an absent key", () => {
    const sb = sandbox();
    writeFileSync(join(sb.remote, ".lsf-fails"), "");
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /an unreadable listing is not an absent key/);
    assert.equal(uploads(sb).length, 0);
    assertStagingClean(sb.staging);
  });

  it("refuses before its first write when staging cannot hold an archive beside its restore", () => {
    const sb = sandbox();
    dfStub(sb, ["1024"]);
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /has 1048576 bytes free and an archive of this source beside its restore needs \d+/);
    assert.match(r.stderr, /through LEVELFLOW_ARCHIVE_STAGING, which survives the re-exec/, "the refusal names its remedy");
    // A listing is a free read; what the check guards is the build and the write.
    assert.equal(uploads(sb).length, 0, "nothing may be uploaded");
    assert.doesNotMatch(r.stderr, /archiving at zstd/);
    assert.equal(r.stdout, "");
    assertStagingClean(sb.staging);
  });

  it("checks again before the upload, so space lost during the build refuses on the safe side", () => {
    // A 7.6 GB build runs for about 26 minutes, and the machine keeps writing
    // meanwhile. An ENOSPC while the object streams back would leave it
    // unverified at a write-once key; this refuses before the key is touched.
    const sb = sandbox();
    dfStub(sb, ["999999999999", "1024"]);
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /the object streamed back after the upload needs/);
    assert.match(r.stderr, /restoring it here before anything is uploaded/, "the first check passed and the build ran");
    assert.equal(dfCalls(sb), 2);
    assert.equal(uploads(sb).length, 0, "nothing may be uploaded");
    assert.ok(!existsSync(objectPath(sb)));
    assert.equal(r.stdout, "");
    assertStagingClean(sb.staging);
  });

  it("refuses to stream an existing object back when staging cannot hold it beside its restore", () => {
    const sb = sandbox();
    const first = run(sb);
    assert.equal(first.code, 0, first.stderr);
    const before = rcloneCalls(sb).length;
    dfStub(sb, ["1024"]);
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /the existing object beside its restore needs/);
    assert.deepEqual(
      rcloneCalls(sb).slice(before).map((call) => call.split(" ")[0]),
      ["lsf"],
      "only the listing may run: nothing read back, nothing written",
    );
    assertStagingClean(sb.staging);
  });

  for (const reading of ["fail", "garbage"]) {
    it(`refuses when the free space cannot be read (${reading}), never reading it as room`, () => {
      const sb = sandbox();
      dfStub(sb, [reading]);
      const r = run(sb);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /cannot read the free space under/);
      assert.deepEqual(rcloneCalls(sb).map((call) => call.split(" ")[0]), ["lsf"], "only the listing may run");
      assertStagingClean(sb.staging);
    });
  }

  it("removes staging when it is terminated mid-upload, and the re-run proves what landed", async () => {
    const sb = sandbox();
    writeFileSync(join(sb.remote, ".slow-copy"), "");
    const child = spawn(BASH, [SCRIPT, sb.source, DATASET], { env: envFor(sb), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    const closed = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
    const started = join(sb.remote, ".copy-started");
    const deadline = Date.now() + 20_000;
    while (!existsSync(started)) {
      assert.ok(Date.now() < deadline, "the upload never started");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    child.kill("SIGTERM");
    assert.equal(await closed, 143);
    assert.equal(stdout, "");
    assertStagingClean(sb.staging);
    rmToggle(sb, ".slow-copy");
    const again = run(sb);
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stderr, /already archived/);
  });
});

function rmToggle(sb: Sandbox, name: string) {
  unlinkSync(join(sb.remote, name));
}

describe("the push refuses before it can do harm, each refusal by name", () => {
  it("refuses a source that does not exist", () => {
    const sb = sandbox();
    const r = run(sb, {}, [join(sb.root, "no-such-source"), DATASET]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /source directory does not exist/);
    assert.equal(rcloneCalls(sb).length, 0);
  });

  it("refuses a dataset name outside ^[a-z0-9-]+$", () => {
    const sb = sandbox();
    for (const bad of ["Calibration-Cache", "calibration_cache", "../escape", "a/b", ""]) {
      const r = run(sb, {}, [sb.source, bad]);
      assert.equal(r.code, 1, bad);
      assert.match(r.stderr, /dataset name must match/, bad);
    }
    assert.equal(rcloneCalls(sb).length, 0);
  });

  it("refuses a temp-root source bound for the permanent bucket, before the credential or rclone", () => {
    // The fixture that reached production storage on 2026-09-01 did so
    // because a sandbox path produced a production key. Here the bucket is
    // write-once and locked: a fixture there is permanent. Tests reach a fake
    // bucket through the stub; the default bucket refuses a temp source.
    const sb = sandbox();
    for (const bucket of [undefined, "windwardline-archives"]) {
      const r = run(sb, { LEVELFLOW_ARCHIVE_BUCKET: bucket, R2_TOKEN: undefined });
      assert.equal(r.code, 1);
      assert.match(r.stderr, /refusing to archive a source under a temp directory into windwardline-archives/);
      assert.doesNotMatch(r.stderr, /R2_TOKEN is unset/);
    }
    assert.equal(rcloneCalls(sb).length, 0);
    assert.ok(!existsSync(sb.staging), "no staging may be created for a refused run");
  });

  it("refuses when zstd is missing", () => {
    const sb = sandbox();
    const r = run(sb, { PATH: `${sb.bin}:${toolsDir(["zstd"])}` });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /zstd is not installed/);
    assert.equal(rcloneCalls(sb).length, 0);
  });

  it("refuses when rclone is missing", () => {
    const sb = sandbox();
    const r = run(sb, { PATH: toolsDir() });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /rclone is not installed/);
  });

  it("names wl-secret when it cannot deliver the token itself", () => {
    const sb = sandbox();
    const r = run(sb, { R2_TOKEN: undefined, LEVELFLOW_WL_SECRET: join(sb.root, "no-such-wl-secret") });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /wl-secret is not executable/);
    assert.equal(rcloneCalls(sb).length, 0);
  });

  it("refuses to re-exec twice when wl-secret ran and the token is still unset", () => {
    const sb = sandbox();
    const r = run(sb, { R2_TOKEN: undefined, LEVELFLOW_WL_SECRET: join(sb.bin, "wl-secret") }, [
      "--secrets-delivered",
      sb.source,
      DATASET,
    ]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /refusing to re-exec/);
    assert.equal(rcloneCalls(sb).length, 0);
  });

  it("refuses the home folder itself as the staging root", () => {
    const sb = sandbox();
    const r = run(sb, { LEVELFLOW_ARCHIVE_STAGING: sb.home });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /staging root is the home folder itself/);
    assert.deepEqual(readdirSync(sb.home), []);
  });

  it("refuses a staging root inside the source, without creating it", () => {
    const sb = sandbox();
    const inside = join(sb.source, "staging");
    const r = run(sb, { LEVELFLOW_ARCHIVE_STAGING: inside });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /is inside the source/);
    assert.ok(!existsSync(inside), "the refusal must not write into the source");
  });

  it("refuses a source with no files rather than archiving nothing", () => {
    const sb = sandbox();
    const empty = join(sb.root, "src", "levelflow-empty-20260921");
    mkdirSync(join(empty, "only-a-dir"), { recursive: true });
    const r = run(sb, {}, [empty, DATASET]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /the source holds no files/);
    assert.equal(uploads(sb).length, 0);
    assertStagingClean(sb.staging);
  });

  it("counts a hard link as the file it is, so a linked tree is not a false refusal", () => {
    const sb = sandbox();
    linkSync(join(sb.source, "BTCUSD-daily.json"), join(sb.source, "BTCUSD-daily.link.json"));
    const r = run(sb);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(rowOf(r.stdout)[3], String(Object.keys(sb.files).length + 1));
  });
});

describe("the push delivers its own credential, as its two scheduled siblings do", () => {
  // wl-secret outermost puts R2_TOKEN in the environment of everything the
  // launcher runs — git fetch, git archive, tar — and not only the pusher.
  // backup-minute-bank.sh and backup-postgres-offbox.sh both call wl-secret by
  // absolute path instead, so the child holding the credential is the only
  // process that sees it. This script does the same.
  //
  // wl-secret's `env -i` keeps HOME, USER, PATH, LANG and TMPDIR and nothing
  // else, so a setting that is not carried across is replaced by its default
  // without a word: an operator's LEVELFLOW_ARCHIVE_STAGING, named to find the
  // space a 7.6 GB push needs, would stop applying on the only path a real run
  // takes. The settings ride across as arguments to /usr/bin/env.
  it("re-execs through wl-secret and carries its settings across the scrub", () => {
    // R2_TOKEN is never set here. Only the wl-secret stub holds it, and the
    // rclone stub refuses any secret but its SHA-256, so a row means the token
    // arrived through the re-exec. Were the bucket dropped, the run would land
    // on windwardline-archives and the temp-source barrier would refuse it.
    const sb = sandbox();
    const r = run(sb, { R2_TOKEN: undefined, LEVELFLOW_WL_SECRET: join(sb.bin, "wl-secret") });
    assert.equal(r.code, 0, r.stderr);
    rowOf(r.stdout);
    assert.ok(existsSync(objectPath(sb)), "no object at the test bucket's key");
    assert.ok(r.stderr.includes(`into ${sb.staging}/push.`), `the named staging root was not used:\n${r.stderr}`);
    assertStagingClean(sb.staging);
    assert.ok(
      !existsSync(join(sb.home, ".local", "share", "levelflow-cloud", "staging")),
      "the default staging root was used although one was named",
    );
    assertNoCredential(sb, r);
  });

  it("forwards every LEVELFLOW_ setting it reads across the re-exec", () => {
    // Derived from the script, so a setting added later is under the rule the
    // moment it is read. LEVELFLOW_WL_SECRET is the one exception: it locates
    // the launcher, and the second pass never looks for it.
    const text = readFileSync(SCRIPT, "utf8");
    const read = [...new Set([...text.matchAll(/\$\{(LEVELFLOW_[A-Z0-9_]+):-/g)].map((m) => m[1]))]
      .filter((name) => name !== "LEVELFLOW_WL_SECRET")
      .sort();
    assert.ok(read.length >= 5, `only ${read.length} settings found; the reader is not reading the script`);
    const exec = logicalLines(text).find(({ text: line }) => /^\s*exec "\$WL_SECRET" /.test(line));
    assert.ok(exec, "no exec through wl-secret");
    const forwarded = [...exec.text.matchAll(/\b(LEVELFLOW_[A-Z0-9_]+)="\$[A-Z_]+"/g)].map((m) => m[1]).sort();
    assert.deepEqual(forwarded, read);
    assert.match(exec.text, /-- \/usr\/bin\/env .* "\$0" --secrets-delivered "\$@"$/);
  });

  it("refuses a temp source before it asks wl-secret for anything", () => {
    // The order matters: a refusal that runs after the credential has been read
    // has already done the thing it exists to prevent.
    const sb = sandbox();
    const r = run(sb, {
      R2_TOKEN: undefined,
      LEVELFLOW_ARCHIVE_BUCKET: undefined,
      LEVELFLOW_WL_SECRET: join(sb.root, "no-such-wl-secret"),
    });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /refusing to archive a source under a temp directory/);
    assert.doesNotMatch(r.stderr, /wl-secret is not executable/);
  });
});

describe("the script's contract, read from its source", () => {
  // Read inside each case, so a missing script is a red case, not a file
  // that fails to register.
  const source = () => readFileSync(SCRIPT, "utf8");
  const code = () => source().split("\n").filter((line) => !/^\s*#/.test(line));

  it("writes <prefix>/<dataset>/<basename>.tar.zst into windwardline-archives by default", () => {
    assert.match(source(), /^PERMANENT="windwardline-archives"$/m);
    assert.match(source(), /^BUCKET="\$\{LEVELFLOW_ARCHIVE_BUCKET:-\$PERMANENT\}"$/m);
    assert.match(source(), /^PREFIX="\$\{LEVELFLOW_ARCHIVE_PREFIX:-levelflow-cloud\}"$/m);
    assert.match(source(), /^KEY="\$PREFIX\/\$DATASET\/\$NAME\.tar\.zst"$/m);
    assert.match(source(), /^STAGING_ROOT="\$\{LEVELFLOW_ARCHIVE_STAGING:-\$HOME\/\.local\/share\/levelflow-cloud\/staging\}"$/m);
    assert.match(source(), /^LEVEL=19$/m);
  });

  it("configures rclone exactly as push-minute-bank-offbox.sh does", () => {
    const configLines = (text: string) =>
      text.split("\n").filter((line) => /RCLONE_CONFIG_R2_/.test(line) && !/^\s*#/.test(line)).map((l) => l.trim());
    const mine = configLines(source());
    assert.equal(mine.length, 6, "the six RCLONE_CONFIG_R2_ lines");
    assert.deepEqual(mine, configLines(readFileSync("scripts/ops/push-minute-bank-offbox.sh", "utf8")));
  });

  it("reads the token's value in two places only: the guard and the derivation", () => {
    // `cloudflare-r2-backup=R2_TOKEN` on the re-exec line names the variable and
    // never reads it, so the value's readers are the two below and nothing else.
    const uses = code().filter((line) => /\$\{?R2_TOKEN/.test(line));
    assert.equal(uses.length, 2, uses.join("\n"));
    assert.ok(uses.some((line) => /\[\[ -z \$\{R2_TOKEN:-\} \]\]/.test(line)));
    assert.ok(uses.some((line) => /printf %s "\$R2_TOKEN" \| shasum -a 256/.test(line)));
    assert.ok(!code().some((line) => /rclone\s+config\b|rclone\.conf/.test(line)), "no rclone config is ever written");
  });

  it("delivers the credential itself, by absolute path, as backup-postgres-offbox.sh does", () => {
    assert.match(source(), /^\s*WL_SECRET="\$\{LEVELFLOW_WL_SECRET:-\$HOME\/\.local\/bin\/wl-secret\}"$/m);
    assert.ok(
      logicalLines(source()).some(({ text }) => /^\s*exec "\$WL_SECRET" cloudflare-r2-backup=R2_TOKEN -- \/usr\/bin\/env /.test(text)),
      "the re-exec goes through wl-secret by absolute path, then env",
    );
    const sibling = readFileSync("scripts/ops/backup-postgres-offbox.sh", "utf8");
    assert.match(sibling, /^\s*exec "\$WL_SECRET" .*-- "\$0" --secrets-delivered "\$@"$/m);
  });

  it("never offers rclone's own hashsum as proof", () => {
    assert.ok(!code().some((line) => /rclone\s+hashsum/.test(line)));
    assert.ok(code().some((line) => /diff -rq "\$SRC"/.test(line)), "the restore is compared with diff -rq");
  });
});

/**
 * The two detectors below read scripts/ops as the shell would, and fail closed:
 * an rclone word they cannot place is a red test, never a line skipped.
 *
 * A call is found by its verb, not by the word after `rclone`: a global flag, a
 * `--config` and its value, or a line continuation sits between the two, and a
 * detector that demands them adjacent reports a file clean while the shell runs
 * the purge. Quoted text is not code, except inside `$( )` or backticks, so a
 * log line that mentions rclone is not a call and a command substitution is.
 */
const REFUSES_ARCHIVES = /^\[\[ \$\{BUCKET%%\/\*\} != windwardline-archives \]\] \|\| die /;
const STRIPS_SLASHES = /^BUCKET="\$\{BUCKET#"\$\{BUCKET%%\[!\/\]\*\}"\}"$/;

/**
 * Physical lines joined across `\` continuations, numbered from the first. A
 * backslash that ends a comment continues nothing, as in bash.
 */
export function logicalLines(source: string): Array<{ text: string; line: number }> {
  const joined: Array<{ text: string; line: number }> = [];
  let held = "";
  let start = 0;
  source.split("\n").forEach((text, index) => {
    if (held === "") start = index + 1;
    const continues = text.endsWith("\\") && codeOnly(text).endsWith("\\");
    if (continues) {
      held += `${text.slice(0, -1)} `;
      return;
    }
    joined.push({ text: held + text, line: start });
    held = "";
  });
  if (held !== "") joined.push({ text: held, line: start });
  return joined;
}

/**
 * The part of `line` the shell reads as code: a comment dropped, and quoted
 * text blanked, except inside a `$( )` or backticks nested in double quotes,
 * which is code again. Index-aligned with `line` up to any comment.
 */
export function codeOnly(line: string): string {
  let out = "";
  const stack: Array<"dq" | "sub" | "tick"> = [];
  let single = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const top = stack.at(-1);
    if (single) {
      if (c === "'") single = false;
      out += c === "'" ? c : " ";
      continue;
    }
    if (top === "dq") {
      if (c === "\\" && i + 1 < line.length) {
        out += "  ";
        i++;
      } else if (c === '"') {
        stack.pop();
        out += c;
      } else if (c === "$" && line[i + 1] === "(") {
        stack.push("sub");
        out += "$(";
        i++;
      } else if (c === "`") {
        stack.push("tick");
        out += c;
      } else out += " ";
      continue;
    }
    if (c === "\\" && i + 1 < line.length) {
      out += c + line[i + 1];
      i++;
    } else if (c === "'") {
      single = true;
      out += c;
    } else if (c === '"') {
      stack.push("dq");
      out += c;
    } else if (c === "$" && line[i + 1] === "(") {
      stack.push("sub");
      out += "$(";
      i++;
    } else if (c === ")" && top === "sub") {
      stack.pop();
      out += c;
    } else if (c === "`") {
      if (top === "tick") stack.pop();
      else stack.push("tick");
      out += c;
    } else if (c === "#" && (i === 0 || /[\s;&|(]/.test(line[i - 1]))) {
      break;
    } else out += c;
  }
  return out;
}

/**
 * Shell words from `text`, quotes removed, up to the first unquoted control
 * operator, redirection, subshell bracket or comment. `2>` is a redirection,
 * so its fd digits are not a word.
 */
export function shellWords(text: string): string[] {
  const words: string[] = [];
  let word = "";
  let started = false;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (quote === '"' && c === "\\" && i + 1 < text.length) word += text[++i];
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      started = true;
      continue;
    }
    if (c === "\\" && i + 1 < text.length) {
      word += text[++i];
      started = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (started) words.push(word);
      word = "";
      started = false;
      continue;
    }
    if ("|&;<>()".includes(c) || (c === "#" && !started)) {
      if (started && !(/^\d+$/.test(word) && (c === ">" || c === "<"))) words.push(word);
      return words;
    }
    word += c;
    started = true;
  }
  if (started) words.push(word);
  return words;
}

// Every rclone subcommand in v1.75.1, so the verb is found past a global flag
// and its value rather than taken as the first word that is not a flag.
const RCLONE_VERBS = new Set([
  "about", "archive", "authorize", "backend", "bisync", "cat", "check", "checksum", "cleanup", "completion",
  "config", "convmv", "copy", "copyto", "copyurl", "cryptcheck", "cryptdecode", "dedupe", "delete",
  "deletefile", "gendocs", "gitannex", "gui", "hashsum", "help", "link", "listremotes", "ls", "lsd", "lsf",
  "lsjson", "lsl", "md5sum", "mkdir", "mount", "move", "moveto", "ncdu", "nfsmount", "obscure", "purge", "rc",
  "rcat", "rcd", "rmdir", "rmdirs", "selfupdate", "serve", "settier", "sha1sum", "size", "sync", "test",
  "touch", "tree", "version",
]);
// Anything that can remove or rename what it names, and anything that hands
// the remote to another program that can.
const DESTRUCTIVE_VERBS = new Set([
  "backend", "bisync", "cleanup", "convmv", "dedupe", "delete", "deletefile", "gui", "mount", "move", "moveto",
  "nfsmount", "purge", "rc", "rcd", "rmdir", "rmdirs", "serve", "sync",
]);
// Anything that can write an object. copyto with --ignore-existing is the only
// write a write-once file may make.
const WRITE_VERBS = new Set([
  "archive", "backend", "bisync", "convmv", "copy", "copyto", "copyurl", "gui", "mount", "move", "moveto",
  "nfsmount", "rc", "rcat", "rcd", "serve", "settier", "sync", "test", "touch",
]);
// Verbs whose destination is their last operand; for the rest every operand
// is a possible target.
const DESTINATION_LAST = new Set(["archive", "bisync", "copy", "copyto", "copyurl", "move", "moveto", "sync"]);

interface RcloneCall {
  /** Null when no subcommand follows: a wrapper, an alias, `"$SUB"`. */
  verb: string | null;
  flags: string[];
  targets: string[];
  line: number;
  text: string;
}

/** Every rclone call the shell would run in `source`. `command -v rclone` is a lookup, not a call. */
export function rcloneInvocations(source: string): RcloneCall[] {
  const calls: RcloneCall[] = [];
  for (const { text, line } of logicalLines(source)) {
    const code = codeOnly(text);
    for (const match of code.matchAll(/(?<![\w$.-])rclone(?![\w.-])/g)) {
      if (/(^|[\s;&|(])command\s+-v$/.test(code.slice(0, match.index).trimEnd())) continue;
      const words = shellWords(text.slice(match.index + "rclone".length));
      const at = words.findIndex((word) => RCLONE_VERBS.has(word));
      const verb = at < 0 ? null : words[at];
      const operands = at < 0 ? [] : words.slice(at + 1).filter((word) => !word.startsWith("-"));
      calls.push({
        flags: words.filter((word) => word.startsWith("-")),
        line,
        targets: verb !== null && DESTINATION_LAST.has(verb) ? operands.slice(-1) : operands,
        text,
        verb,
      });
    }
  }
  return calls;
}

/** Every line of `source` the shell would run that can delete or replace. */
export function destructiveLines(source: string): Array<{ text: string; line: number }> {
  return rcloneInvocations(source)
    .filter((call) => call.verb !== null && DESTRUCTIVE_VERBS.has(call.verb))
    .map(({ line, text }) => ({ line, text }));
}

const writes = (source: string) => rcloneInvocations(source).filter((call) => call.verb !== null && WRITE_VERBS.has(call.verb));

// A target is spelled so the guard can read where it lands: the refusal's own
// bucket, or a local path. `$WORK` is verify-postgres-restore.sh's mktemp
// directory, named here because it is the one variable a local target starts
// with; a target starting with any other variable is refused.
const SPELLED = (target: string) =>
  /^R2:\$BUCKET\//.test(target) ||
  /^\$(\{WORK\}|WORK)\//.test(target) ||
  (!target.startsWith("$") && !/^[^/]*:/.test(target));

const reachesR2 = (call: RcloneCall) => call.targets.some((target) => target.startsWith("R2:"));

const writesOnce = (call: RcloneCall) => call.verb === "copyto" && call.flags.includes("--ignore-existing");

// Naming rclone for later use hides every call made through the name.
const INDIRECTION = /(^|[\s;&|(])(alias\s+rclone=|function\s+rclone\b|rclone\s*\(\)|[A-Za-z_]\w*=["']?rclone["']?(\s|;|$))/;

/** The refusal of the permanent bucket, and what makes it govern the writes after it. */
function refusalIn(source: string): { line: number; problems: string[] } | null {
  const lines = source.split("\n");
  const at = lines.findIndex((line) => REFUSES_ARCHIVES.test(line));
  if (at < 0) return null;
  const problems: string[] = [];
  if (!STRIPS_SLASHES.test(lines[at - 1] ?? "")) {
    problems.push("the line before the refusal must strip BUCKET's leading slashes, as rclone does");
  }
  for (const { text, line } of logicalLines(lines.slice(at + 1).join("\n"))) {
    if (/(^|[\s;&|(])((export|local|readonly|declare(\s+-\w+)*)\s+)?BUCKET\+?=|\bread\b[^;|&]*\bBUCKET\b|printf\s+-v\s+BUCKET\b/.test(codeOnly(text))) {
      problems.push(`BUCKET is set again at line ${at + 1 + line}, after the refusal`);
    }
  }
  return { line: at + 1, problems };
}

describe("the call detector reads what the shell would run", () => {
  it("sees a destructive verb however the call is spelled", () => {
    for (const text of [
      'rclone purge "R2:$BUCKET/$PREFIX"',
      'rclone -q purge "R2:windwardline-archives/levelflow-cloud"',
      'rclone --config /dev/null delete "R2:$BUCKET/$KEY"',
      'rclone \\\n  purge "R2:windwardline-archives/levelflow-cloud"',
      '  rclone deletefile "R2:$BUCKET/$KEY" || true',
      'X="$(rclone purge "R2:$BUCKET/y")"',
      '/opt/homebrew/bin/rclone rmdirs "R2:$BUCKET/y"',
      'rclone convmv "R2:$BUCKET/x" --name-transform upper',
      'xargs rclone deletefile < list',
    ]) {
      assert.equal(destructiveLines(text).length, 1, text);
    }
  });

  it("leaves the reads, the write-once copy and quoted text alone", () => {
    for (const text of [
      'rclone lsf --files-only --format sp "R2:$BUCKET/$DIR/" 2>"$STAGE/lsf.err"',
      'rclone cat "R2:$BUCKET/$KEY" > "$RETURNED"',
      'rclone copyto --ignore-existing --s3-no-check-bucket "$ARCHIVE" "R2:$BUCKET/$KEY"',
      '# rclone purge "R2:windwardline-archives/levelflow-cloud"',
      'die "refusing: rclone purge is not for this bucket"',
      "echo 'rclone purge R2:x'",
      'rclone lsf "R2:$BUCKET/" # rclone purge "R2:$BUCKET/"',
    ]) {
      assert.deepEqual(destructiveLines(text), [], text);
    }
  });

  it("does not continue a comment that ends in a backslash", () => {
    for (const text of ['# a note \\\nrclone purge "R2:$BUCKET/x"', 'true # a note \\\nrclone purge "R2:$BUCKET/x"']) {
      assert.deepEqual(destructiveLines(text).map((call) => call.line), [2], text);
    }
  });

  it("fails closed on an rclone it cannot place, and passes a lookup", () => {
    for (const text of ["RCLONE=rclone", 'run() { rclone "$@"; }', 'rclone "$SUB" "R2:$BUCKET/x"']) {
      assert.ok(rcloneInvocations(text).some((call) => call.verb === null), text);
    }
    assert.deepEqual(rcloneInvocations('command -v rclone >/dev/null || die "rclone is not installed (brew install rclone)"'), []);
    for (const text of ["RCLONE=rclone", "alias rclone=echo", "rclone() { :; }", 'R="rclone"']) {
      assert.match(text, INDIRECTION, text);
    }
  });

  it("judges whether the refusal governs what comes after it", () => {
    const refusal = '[[ ${BUCKET%%/*} != windwardline-archives ]] || die "refusing"';
    const strip = 'BUCKET="${BUCKET#"${BUCKET%%[!/]*}"}"';
    const sound = refusalIn([strip, refusal, 'rclone deletefile "R2:$BUCKET/x"'].join("\n"));
    assert.deepEqual(sound, { line: 2, problems: [] });
    const unstripped = refusalIn([refusal, 'rclone deletefile "R2:$BUCKET/x"'].join("\n"));
    assert.match(unstripped!.problems.join(), /strip BUCKET's leading slashes/);
    for (const later of ['BUCKET="$OTHER"', "export BUCKET=windwardline-archives", "read -r BUCKET < f", "printf -v BUCKET %s x"]) {
      const moved = refusalIn([strip, refusal, later, 'rclone deletefile "R2:$BUCKET/x"'].join("\n"));
      assert.match(moved!.problems.join(), /BUCKET is set again at line 3, after the refusal/, later);
    }
    assert.equal(refusalIn('  [[ ${BUCKET%%/*} != windwardline-archives ]] || die "x"'), null, "an indented refusal may sit in a branch");
  });

  it("reads each write's target, and which writes are write-once", () => {
    const cases: Array<[string, string, string[], boolean]> = [
      ['rclone copyto --ignore-existing --s3-no-check-bucket "$ARCHIVE" "R2:$BUCKET/$KEY" 2>"$E" \\\n || die "x"', "copyto", ["R2:$BUCKET/$KEY"], true],
      ['rclone copyto --immutable "$A" "R2:$BUCKET/$KEY"', "copyto", ["R2:$BUCKET/$KEY"], false],
      ['rclone \\\n  copyto "$A" "R2:windwardline-archives/x"', "copyto", ["R2:windwardline-archives/x"], false],
      ['rclone --config /dev/null copyto --ignore-existing "$A" "R2:$BUCKET/$KEY"', "copyto", ["R2:$BUCKET/$KEY"], true],
      ['rclone copy --immutable "$A" "R2:$BUCKET/$DIR/"', "copy", ["R2:$BUCKET/$DIR/"], false],
      ['X="$(rclone rcat "R2:$BUCKET/$KEY" < "$A")"', "rcat", ["R2:$BUCKET/$KEY"], false],
      ['rclone archive create "$DIR" "R2:$BUCKET/a.zip"', "archive", ["R2:$BUCKET/a.zip"], false],
    ];
    for (const [text, verb, targets, once] of cases) {
      const found = writes(text);
      assert.equal(found.length, 1, text);
      assert.equal(found[0].verb, verb, text);
      assert.deepEqual(found[0].targets, targets, text);
      assert.equal(reachesR2(found[0]), true, text);
      assert.equal(writesOnce(found[0]), once, text);
    }
    const download = writes('rclone copyto "R2:$BUCKET/$PREFIX/$NEWEST" "$WORK/archive.dump.zst" 2>&1 | grep -v "Config file" || true');
    assert.equal(download.length, 1);
    assert.equal(reachesR2(download[0]), false);
    assert.ok(download[0].targets.every(SPELLED));
    for (const target of ["$DEST", "$REMOTE/$KEY", "${WORKDIR}/x", "r2:bucket/x", "B2:bucket/x", "R2:windwardline-archives/x"]) {
      assert.equal(SPELLED(target), false, target);
    }
    for (const target of ["R2:$BUCKET/$KEY", "$WORK/archive.dump.zst", "/tmp/x", "local/x"]) {
      assert.equal(SPELLED(target), true, target);
    }
  });
});

describe("no script under scripts/ops can delete or replace a permanent archive", () => {
  // DERIVED, not listed: every file in scripts/ops is read, so a new script
  // is under these rules the moment it exists.
  const population = readdirSync("scripts/ops").sort();
  const read = (file: string) => readFileSync(join("scripts/ops", file), "utf8");

  it("reads a population that includes the archive push and both pruners", () => {
    for (const expected of ["push-archive-offbox.sh", "push-minute-bank-offbox.sh", "backup-postgres-offbox.sh"]) {
      assert.ok(population.includes(expected), `${expected} must be in the population`);
    }
    const pruners = population.filter((file) => destructiveLines(read(file)).length > 0);
    assert.deepEqual(pruners, ["backup-postgres-offbox.sh", "push-minute-bank-offbox.sh"]);
  });

  for (const file of population) {
    it(`${file}: every rclone call is placed, spelled and bounded`, () => {
      const source = read(file);
      for (const call of rcloneInvocations(source)) {
        assert.notEqual(call.verb, null, `${file}:${call.line}: an rclone the guard cannot place: ${call.text.trim()}`);
      }
      for (const { text, line } of logicalLines(source)) {
        assert.doesNotMatch(codeOnly(text), INDIRECTION, `${file}:${line}: rclone renamed or wrapped: ${text.trim()}`);
      }
      for (const call of writes(source)) {
        for (const target of call.targets) {
          assert.ok(SPELLED(target), `${file}:${call.line}: spell the target literally, so this guard can read where it lands: ${call.text.trim()}`);
        }
      }
      const destructive = destructiveLines(source);
      for (const { text } of destructive) {
        // Named or reached through a variable, the permanent bucket is out of
        // bounds for a delete in ANY file here, pruner or not.
        assert.doesNotMatch(text, /windwardline-archives/, `${file} names the permanent bucket in a destructive call`);
        assert.match(text, /"R2:\$BUCKET\//, `${file}: a destructive call must target "R2:$BUCKET/...": ${text.trim()}`);
      }
      if (destructive.length > 0) {
        const refusal = refusalIn(source);
        assert.ok(refusal, `${file} deletes and does not refuse windwardline-archives`);
        assert.deepEqual(refusal.problems, [], `${file}: the refusal does not govern the deletes`);
        assert.ok(refusal.line < destructive[0].line, `${file} must refuse the permanent bucket before its first delete`);
      }
    });
  }

  // Every file here that writes to R2 is one of two kinds, and nothing else:
  // it refuses the permanent bucket before its first write, or every write it
  // makes is copyto --ignore-existing. Derived from the files, then pinned, so
  // a writer that changes kind, or a new one, is a red test by name.
  it("every writer to R2 either refuses windwardline-archives first or writes only once", () => {
    const refusers: string[] = [];
    const writeOnce: string[] = [];
    for (const file of population) {
      const source = read(file);
      const toR2 = writes(source).filter(reachesR2);
      if (toR2.length === 0) continue;
      const refusal = refusalIn(source);
      if (refusal && refusal.line < toR2[0].line) {
        assert.deepEqual(refusal.problems, [], `${file}: the refusal does not govern the writes`);
        refusers.push(file);
        continue;
      }
      for (const call of toR2) {
        assert.ok(
          writesOnce(call),
          `${file}:${call.line}: writes to R2 without refusing windwardline-archives first, so it must be copyto --ignore-existing: ${call.text.trim()}`,
        );
      }
      writeOnce.push(file);
    }
    assert.deepEqual(refusers, ["backup-postgres-offbox.sh", "push-minute-bank-offbox.sh"]);
    assert.deepEqual(writeOnce, ["push-archive-offbox.sh"]);
    assert.deepEqual(
      writes(read("push-archive-offbox.sh")).filter(reachesR2).map((call) => call.verb),
      ["copyto"],
      "the archive push writes once, and exactly once",
    );
  });

  it("names the permanent bucket, other than to refuse it, only in a write-once file", () => {
    const naming = population.filter((file) =>
      logicalLines(read(file)).some(
        ({ text }) => !/^\s*#/.test(text) && /windwardline-archives/.test(text) && !REFUSES_ARCHIVES.test(text),
      ),
    );
    assert.deepEqual(naming, ["push-archive-offbox.sh"]);
  });

  // rclone reads everything after `R2:` as bucket plus path, so an exact-match
  // refusal on the bucket name is walked past by one suffix. Both forms run.
  // rclone strips leading slashes too, so a refusal of the first segment
  // alone is walked past by one.
  const SUFFIXED = [
    "windwardline-archives",
    "windwardline-archives/levelflow-cloud",
    "/windwardline-archives",
    "//windwardline-archives/levelflow-cloud",
  ];

  for (const bucket of SUFFIXED) {
    it(`the minute-bank push refuses ${bucket} before anything else`, () => {
      const sb = sandbox();
      const r = spawnSync(BASH, ["scripts/ops/push-minute-bank-offbox.sh", join(sb.root, "no-such-snapshot-20260921")], {
        encoding: "utf8",
        env: { HOME: sb.home, PATH: `${sb.bin}:${toolsDir()}`, R2_TOKEN: "", LEVELFLOW_R2_BUCKET: bucket },
      });
      assert.equal(r.status, 1);
      assert.match(`${r.stdout}${r.stderr}`, /refusing to run against windwardline-archives/);
      assert.doesNotMatch(`${r.stdout}${r.stderr}`, /snapshot directory does not exist/);
      assert.equal(rcloneCalls(sb).length, 0);
    });

    it(`the Postgres backup refuses ${bucket} before it reads a credential`, () => {
      const sb = sandbox();
      const r = spawnSync(BASH, ["scripts/ops/backup-postgres-offbox.sh"], {
        encoding: "utf8",
        env: {
          HOME: sb.home,
          PATH: `${sb.bin}:${toolsDir()}`,
          R2_TOKEN: "",
          PGPASSWORD: "",
          LEVELFLOW_WL_SECRET: join(sb.root, "no-such-wl-secret"),
          LEVELFLOW_R2_BUCKET: bucket,
        },
      });
      assert.equal(r.status, 1);
      assert.match(`${r.stdout}${r.stderr}`, /refusing to run against windwardline-archives/);
      assert.doesNotMatch(`${r.stdout}${r.stderr}`, /wl-secret is not executable/);
    });
  }
});
