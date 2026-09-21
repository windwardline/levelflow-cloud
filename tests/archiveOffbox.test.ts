import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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
const TOOLS = [
  "awk", "cat", "chmod", "cmp", "cp", "cut", "date", "dd", "diff", "dirname", "find",
  "grep", "head", "ls", "mkdir", "mktemp", "rm", "shasum", "sleep", "tar", "tr", "wc", "zstd",
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
    assert.ok(real, `${tool} is required to exercise ${SCRIPT} and is not installed`);
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
immutable=0
pos=()
for a in "$@"; do
  case "$a" in
    --immutable) immutable=1 ;;
    --*) ;;
    *) pos+=("$a") ;;
  esac
done
onr2() { case "$1" in R2:*) printf '%s/%s' "$ROOT" "\${1#R2:}" ;; *) return 1 ;; esac; }
case "$sub" in
  lsf)
    if [ -e "$ROOT/.lsf-fails" ]; then echo "ERROR : error listing: temporary failure (stub)" >&2; exit 5; fi
    d="$(onr2 "\${pos[0]}")" || { echo "stub rclone: not an R2 path" >&2; exit 98; }
    if [ ! -e "$d" ]; then echo "ERROR : error listing: directory not found" >&2; exit 3; fi
    for f in "$d"/*; do [ -f "$f" ] && printf '%s\\n' "\${f##*/}"; done
    exit 0 ;;
  cat)
    f="$(onr2 "\${pos[0]}")" || { echo "stub rclone: not an R2 path" >&2; exit 98; }
    if [ ! -f "$f" ]; then echo "ERROR : error listing: directory not found" >&2; exit 3; fi
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
    if [ -e "$ROOT/.slow-copy" ]; then sleep 3; fi
    if [ -e "$dst" ]; then
      if cmp -s "$src" "$dst"; then exit 0; fi
      if [ "$immutable" = 1 ]; then echo "ERROR : Source and destination exist but do not match: immutable file modified" >&2; exit 1; fi
    fi
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
function tarHook(sb: Sandbox, mode: "-cf" | "-tvf", action: string) {
  const real = which("tar");
  assert.ok(real);
  writeFileSync(
    join(sb.bin, "tar"),
    `#!/bin/bash\ncase " $* " in *" ${mode} "*) ${action} ;; esac\nexec '${real}' "$@"\n`,
    { mode: 0o755 },
  );
}

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
  `^\\| ${TEST_BUCKET}/${KEY.replaceAll(".", "\\.")} \\| (\\d+) \\| ([0-9a-f]{32}) \\| (\\d+) \\| (\\d+) \\| (\\d{4}-\\d{2}-\\d{2}) \\|$`,
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
    assert.match(uploads(sb)[0], /^copyto --immutable /);
    assert.ok(calls.findIndex((c) => c.startsWith("cat ")) > calls.findIndex((c) => c.startsWith("copyto")));
    assert.ok(!calls.some((c) => c.startsWith("hashsum")));

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
    // The archive is deterministic for an unchanged source; that is what lets
    // the second run's bytes match the first run's object.
    assert.equal(rowOf(second.stdout)[2], rowOf(first.stdout)[2]);
    assert.equal(uploads(sb).length, 1, "the second run must not upload");
    assert.equal(statSync(objectPath(sb)).mtimeMs, before.mtimeMs);
    assertStagingClean(sb.staging);
    assertNoCredential(sb, second);
  });

  it("refuses to overwrite a different object at the key", () => {
    const sb = sandbox();
    mkdirSync(join(sb.remote, TEST_BUCKET, "levelflow-cloud", DATASET), { recursive: true });
    writeFileSync(objectPath(sb), "an archive this source did not produce\n");
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /already holds a different object/);
    assert.match(r.stderr, /refusing to overwrite a permanent archive/);
    assert.equal(r.stdout, "");
    assert.equal(readFileSync(objectPath(sb), "utf8"), "an archive this source did not produce\n");
    assert.equal(uploads(sb).length, 0);
    assertStagingClean(sb.staging);
  });

  it("refuses when the bytes R2 returns are not the bytes it was sent, and a clean re-run recovers", () => {
    const sb = sandbox();
    writeFileSync(join(sb.remote, ".corrupt-cat"), "");
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /the object R2 returned does not match what was uploaded/);
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

  it("refuses when the restored tree differs from the source (a file changed after it was archived)", () => {
    const sb = sandbox();
    tarHook(sb, "-tvf", `printf 'edited\\n' >> '${join(sb.source, "BTCUSD-daily.json")}'`);
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /the restored tree differs from the source/);
    assert.match(r.stderr, /BTCUSD-daily\.json/);
    assert.equal(r.stdout, "");
    assertStagingClean(sb.staging);
  });

  it("reads a failed listing as a failure, never as an absent key", () => {
    const sb = sandbox();
    writeFileSync(join(sb.remote, ".lsf-fails"), "");
    const r = run(sb);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /an unreadable listing is not an absent key/);
    assert.equal(uploads(sb).length, 0);
    assertStagingClean(sb.staging);
  });

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

  it("refuses when the token was not injected, naming how to invoke it", () => {
    const sb = sandbox();
    const r = run(sb, { R2_TOKEN: undefined });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /R2_TOKEN is unset/);
    assert.match(r.stderr, /wl-secret cloudflare-r2-backup=R2_TOKEN/);
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

  it("reads the token in two places only: the guard and the derivation", () => {
    const uses = code().filter((line) => line.includes("R2_TOKEN"));
    assert.equal(uses.length, 2, uses.join("\n"));
    assert.ok(uses.some((line) => /\[\[ -n \$\{R2_TOKEN:-\} \]\] \|\| die "R2_TOKEN is unset/.test(line)));
    assert.ok(uses.some((line) => /printf %s "\$R2_TOKEN" \| shasum -a 256/.test(line)));
    assert.ok(!code().some((line) => /rclone\s+config\b|rclone\.conf/.test(line)), "no rclone config is ever written");
  });

  it("never offers rclone's own hashsum as proof", () => {
    assert.ok(!code().some((line) => /rclone\s+hashsum/.test(line)));
    assert.ok(code().some((line) => /diff -rq "\$SRC"/.test(line)), "the restore is compared with diff -rq");
  });
});

/** Every rclone call in a file that can delete or replace what it names. */
const DESTRUCTIVE = /\brclone\s+(delete|deletefile|purge|rmdir|rmdirs|cleanup|sync|bisync|move|moveto|dedupe)\b/;
const REFUSES_ARCHIVES = /^\s*\[\[ \$BUCKET != windwardline-archives \]\] \|\| die /;

describe("no script under scripts/ops prunes the permanent bucket", () => {
  // DERIVED, not listed: every file in scripts/ops is read, so a new pruner
  // is under this rule the moment it exists.
  const population = readdirSync("scripts/ops").sort();

  it("reads a population that includes the archive push and both pruners", () => {
    for (const expected of ["push-archive-offbox.sh", "push-minute-bank-offbox.sh", "backup-postgres-offbox.sh"]) {
      assert.ok(population.includes(expected), `${expected} must be in the population`);
    }
    const pruners = population.filter((file) =>
      readFileSync(join("scripts/ops", file), "utf8").split("\n").some((line) => !/^\s*#/.test(line) && DESTRUCTIVE.test(line)),
    );
    assert.deepEqual(pruners, ["backup-postgres-offbox.sh", "push-minute-bank-offbox.sh"]);
  });

  for (const file of population) {
    it(`${file}: no destructive rclone call can reach windwardline-archives`, () => {
      const lines = readFileSync(join("scripts/ops", file), "utf8").split("\n");
      const destructive = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => !/^\s*#/.test(line) && DESTRUCTIVE.test(line));
      for (const { line } of destructive) {
        assert.doesNotMatch(line, /windwardline-archives/, `${file} names the permanent bucket in a destructive call`);
        // The target must be the bucket variable the refusal governs, or the
        // refusal proves nothing about where the delete lands.
        assert.match(line, /"R2:\$BUCKET\//, `${file}: a destructive call must target "R2:$BUCKET/...": ${line.trim()}`);
      }
      if (destructive.length > 0) {
        const refusal = lines.findIndex((line) => REFUSES_ARCHIVES.test(line));
        assert.ok(refusal >= 0, `${file} deletes and does not refuse windwardline-archives`);
        assert.ok(refusal < destructive[0].index, `${file} must refuse the permanent bucket before its first delete`);
      }
      // Anything that writes to the permanent bucket writes once.
      if (lines.some((line) => !/^\s*#/.test(line) && /windwardline-archives/.test(line) && !REFUSES_ARCHIVES.test(line))) {
        for (const line of lines.filter((l) => !/^\s*#/.test(l) && /\brclone\s+copy(to)?\b/.test(l))) {
          assert.match(line, /--immutable/, `${file}: every copy into the permanent bucket carries --immutable`);
        }
      }
    });
  }

  it("the minute-bank push refuses the permanent bucket before anything else", () => {
    const sb = sandbox();
    const r = spawnSync(BASH, ["scripts/ops/push-minute-bank-offbox.sh", join(sb.root, "no-such-snapshot-20260921")], {
      encoding: "utf8",
      env: { HOME: sb.home, PATH: `${sb.bin}:${toolsDir()}`, R2_TOKEN: "", LEVELFLOW_R2_BUCKET: "windwardline-archives" },
    });
    assert.equal(r.status, 1);
    assert.match(`${r.stdout}${r.stderr}`, /refusing to run against windwardline-archives/);
    assert.doesNotMatch(`${r.stdout}${r.stderr}`, /snapshot directory does not exist/);
    assert.equal(rcloneCalls(sb).length, 0);
  });

  it("the Postgres backup refuses the permanent bucket before it reads a credential", () => {
    const sb = sandbox();
    const r = spawnSync(BASH, ["scripts/ops/backup-postgres-offbox.sh"], {
      encoding: "utf8",
      env: {
        HOME: sb.home,
        PATH: `${sb.bin}:${toolsDir()}`,
        R2_TOKEN: "",
        PGPASSWORD: "",
        LEVELFLOW_WL_SECRET: join(sb.root, "no-such-wl-secret"),
        LEVELFLOW_R2_BUCKET: "windwardline-archives",
      },
    });
    assert.equal(r.status, 1);
    assert.match(`${r.stdout}${r.stderr}`, /refusing to run against windwardline-archives/);
    assert.doesNotMatch(`${r.stdout}${r.stderr}`, /wl-secret is not executable/);
  });
});
