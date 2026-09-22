import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { scratchDir } from "./support/scratchDir.ts";

/**
 * The minute bank's restore proof: `scripts/ops/verify-minute-bank-restore.sh`.
 *
 * The push compares one object's md5 with the archive it built, and parity
 * compares archive NAMES with snapshot names. Neither unpacks anything. This
 * script downloads the newest archive, extracts it and compares its contents
 * with the live bank. Every case below runs the real script, real tar and real
 * zstd against real directories.
 *
 * NOTHING HERE TOUCHES R2, THE KEYCHAIN OR THE NETWORK, and that is a property
 * of the PATH. Each run gets two directories: the sandbox's stub `rclone`, a
 * fake R2 over a directory, and a directory of named links to the system tools
 * the script needs. The real `rclone`, `security` and `wl-secret` are not in
 * either, so a missing stub is `command not found`, never a live call. The
 * first test proves that before anything else runs.
 */

const SCRIPT = "scripts/ops/verify-minute-bank-restore.sh";
const TOKEN = "stub-r2-token-not-a-credential-7d2a51";
const SECRET = createHash("sha256").update(TOKEN).digest("hex");
// The defaults the sibling scripts carry. Identifiers, not credentials.
const ACCOUNT = "c8da9a44c29c435205b2ec133ee05f20";
const ACCESS_KEY = "fafbbe863abb74c59933f028095a04ce";
const BUCKET = "test-backups";
const PREFIX = "levelflow-cloud/minute-bank";
const BASH = "/bin/bash";

// Everything the script and the stub call, linked into one directory so the
// runs see nothing else.
const TOOLS = [
  "bash", "cat", "cmp", "cp", "cut", "date", "dirname", "find", "grep", "head", "jq", "ls", "mkdir",
  "mktemp", "rm", "sed", "shasum", "sleep", "sort", "tail", "tar", "tr", "wc", "zstd",
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
  const dir = scratchDir("mb-restore-tools-");
  for (const tool of TOOLS) {
    if (without.includes(tool)) continue;
    const real = which(tool);
    assert.ok(real, `${tool} is required to exercise ${SCRIPT} and is not on PATH`);
    symlinkSync(real, join(dir, tool));
  }
  toolDirs.set(id, dir);
  return dir;
}

interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const bar = (date: string, price: number): Bar => ({
  date,
  open: price,
  high: price + 0.0004,
  low: price - 0.0003,
  close: price + 0.0001,
  volume: 0,
});

const minutes = (day: string, from: number, count: number, price: number): Bar[] =>
  Array.from({ length: count }, (_, i) => bar(`${day} 09:${String(from + i).padStart(2, "0")}:00`, price + i / 10000));

const jsonl = (bars: Bar[]) => bars.map((b) => `${JSON.stringify(b)}\n`).join("");

/** The sidecar as bank-minute-bars.ts writes it: pretty-printed, `bars` counting lines. */
function sidecar(symbol: string, bars: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify(
    { fmpSymbol: decodeURIComponent(symbol), markets: [], highWaterMark: null, bars, firstDate: null, recentKeys: [], runs: [], ...extra },
    null,
    2,
  );
}

interface Sandbox {
  root: string;
  checkout: string;
  bank: string;
  remote: string;
  bucketDir: string;
  home: string;
  bin: string;
  tmp: string;
  log: string;
}

/** A checkout holding a live bank, a fake R2 with its bucket, and the stub. */
function sandbox(): Sandbox {
  const root = scratchDir("mb-restore-");
  const checkout = join(root, "checkout");
  const bank = join(checkout, ".minute-bank");
  const remote = join(root, "r2");
  const bucketDir = join(remote, BUCKET);
  const home = join(root, "home");
  const bin = join(root, "bin");
  const tmp = join(root, "tmp");
  for (const dir of [bank, bucketDir, home, bin, tmp]) mkdirSync(dir, { recursive: true });
  const sb: Sandbox = { root, checkout, bank, remote, bucketDir, home, bin, tmp, log: join(root, "rclone.argv") };
  writeFileSync(join(bin, "rclone"), rcloneStub(sb), { mode: 0o755 });
  // The bank as it stood when the snapshot was taken. `%5EGSPC` is how the
  // bank spells ^GSPC (encodeURIComponent), so a name carrying `%` is covered.
  // USDMXN has a sidecar and no data file: a symbol whose first fetch failed.
  writeBank(sb, "EURUSD", minutes("2026-09-01", 30, 5, 1.1));
  writeBank(sb, "%5EGSPC", minutes("2026-09-01", 30, 4, 6500));
  writeBank(sb, "BTCUSD", minutes("2026-09-01", 30, 3, 110000));
  writeFileSync(join(bank, "USDMXN.state.json"), sidecar("USDMXN", 0));
  return sb;
}

function writeBank(sb: Sandbox, symbol: string, bars: Bar[]) {
  writeFileSync(join(sb.bank, `${symbol}.jsonl`), jsonl(bars));
  writeFileSync(join(sb.bank, `${symbol}.state.json`), sidecar(symbol, bars.length));
}

/** Append as the bank does: the data file first, then the sidecar. */
function appendBank(sb: Sandbox, symbol: string, bars: Bar[]) {
  const file = join(sb.bank, `${symbol}.jsonl`);
  appendFileSync(file, jsonl(bars));
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean).length;
  writeFileSync(join(sb.bank, `${symbol}.state.json`), sidecar(symbol, lines));
}

/** What the bank grows by after the snapshot: a late fill on EURUSD, a new symbol. */
function growSinceSnapshot(sb: Sandbox) {
  // 09:35 is new; 09:20 is a late fill, OLDER than bars already banked,
  // appended at the end the way the provider's omitted minutes arrive.
  appendBank(sb, "EURUSD", [bar("2026-09-01 09:35:00", 1.1005), bar("2026-09-01 09:20:00", 1.0995)]);
  writeBank(sb, "GBPUSD", minutes("2026-09-01", 30, 2, 1.3));
}

const keyFor = (stamp: string) => `${PREFIX}/${stamp.slice(0, 4)}/${stamp.slice(4, 6)}/minute-bank-${stamp}.tar.zst`;
const objectFor = (sb: Sandbox, stamp: string) => join(sb.bucketDir, keyFor(stamp));

interface ArchiveOptions {
  /** Rewrite the snapshot before it is archived. */
  edit?: (snap: string) => void;
  /** The top-level directory's name, when it should not match the key. */
  top?: string;
  /** A second top-level entry beside the snapshot. */
  alongside?: string;
}

let archives = 0;

/**
 * Snapshot the live bank and upload it to the fake R2 exactly as the backup
 * and push do: `cp -R` into levelflow-minute-bank-snapshot-<stamp>, then
 * `tar -C <parent> -cf - <name> | zstd -19` to the layout's key.
 */
function archive(sb: Sandbox, stamp: string, options: ArchiveOptions = {}): string {
  const parent = join(sb.root, `snapshots-${archives++}`);
  const name = options.top ?? `levelflow-minute-bank-snapshot-${stamp}`;
  const snap = join(parent, name);
  mkdirSync(parent);
  cpSync(sb.bank, snap, { recursive: true });
  options.edit?.(snap);
  const entries = [name];
  if (options.alongside) {
    writeFileSync(join(parent, options.alongside), "stray\n");
    entries.push(options.alongside);
  }
  const object = objectFor(sb, stamp);
  mkdirSync(dirname(object), { recursive: true });
  const built = spawnSync(
    "/bin/sh",
    ["-c", `tar -C '${parent}' -cf - ${entries.map((e) => `'${e}'`).join(" ")} | zstd -q -19 -T0 -o '${object}'`],
    { encoding: "utf8" },
  );
  assert.equal(built.status, 0, built.stderr);
  return object;
}

/** Overwrite bytes in the middle of an object, so its zstd checksum no longer holds. */
function corrupt(object: string) {
  const bytes = readFileSync(object);
  bytes.write("CORRUPTEDCORRUPT", Math.floor(bytes.length / 2), "latin1");
  writeFileSync(object, bytes);
}

/**
 * A fake R2 over a directory: `R2:<bucket>/<key>` is `<remote>/<bucket>/<key>`.
 *
 * It behaves as rclone v1.75.1 does against R2, measured 2026-09-22: a prefix
 * holding nothing in an existing bucket lists empty with exit 0, a missing
 * bucket exits 3, `lsf -R --files-only` prints paths relative to the listed
 * prefix, and without `--files-only` it prints the directories too, even under
 * `--include`. It prints rclone's "Config file not found" notice on stderr, as
 * the real tool does under RCLONE_CONFIG_* alone. It lists in reverse order,
 * so a script that trusts the listing's order picks the oldest archive.
 *
 * It refuses to run unless R2 is configured through RCLONE_CONFIG_R2_* with
 * the SHA-256 of the token as the secret and without the token itself. It
 * refuses every write to R2, every subcommand but `lsf` and `copyto`, and
 * every flag but the three the listing uses, so a changed invocation is a red
 * test rather than a flag the stub ignores. Behaviour toggles are files.
 */
function rcloneStub(sb: Sandbox): string {
  return `#!/bin/bash
ROOT='${sb.remote}'
printf '%s\\n' "$*" >> '${sb.log}'
if [ "\${RCLONE_CONFIG_R2_TYPE:-}" != s3 ] || [ "\${RCLONE_CONFIG_R2_PROVIDER:-}" != Cloudflare ] \\
  || [ "\${RCLONE_CONFIG_R2_ENDPOINT:-}" != 'https://${ACCOUNT}.r2.cloudflarestorage.com' ] \\
  || [ "\${RCLONE_CONFIG_R2_ACCESS_KEY_ID:-}" != '${ACCESS_KEY}' ]; then
  echo "stub rclone: remote R2 is not configured through RCLONE_CONFIG_R2_*" >&2; exit 97
fi
if [ "\${RCLONE_CONFIG_R2_SECRET_ACCESS_KEY:-}" != '${SECRET}' ]; then
  echo "stub rclone: the S3 secret is not the SHA-256 of R2_TOKEN" >&2; exit 97
fi
if [ -n "\${R2_TOKEN+set}" ]; then
  echo "stub rclone: R2_TOKEN reached rclone's environment; only the derived secret should" >&2; exit 97
fi
echo "<5>NOTICE: Config file \\"$HOME/.config/rclone/rclone.conf\\" not found - using defaults" >&2
sub="$1"; shift
recursive=0; files_only=0; include=""; pos=()
while [ $# -gt 0 ]; do
  case "$1" in
    -R|--recursive) recursive=1 ;;
    --files-only) files_only=1 ;;
    --include) shift; include="$1" ;;
    -*) echo "stub rclone: unsupported flag '$1'" >&2; exit 99 ;;
    *) pos+=("$1") ;;
  esac
  shift
done
# A function, not inline: bash 3.2 reads a case pattern's ")" inside $( ) as
# the end of the substitution.
entries() {
  (cd "$1" && find . -mindepth 1 $depth | sed 's|^\\./||' | sort -r) | while IFS= read -r rel; do
    if [ -d "$1/$rel" ]; then
      [ "$files_only" = 1 ] || printf '%s/\\n' "$rel"
      continue
    fi
    base="\${rel##*/}"
    if [ -n "$include" ]; then
      case "$base" in $include) ;; *) continue ;; esac
    fi
    printf '%s\\n' "$rel"
  done
}
onr2() { case "$1" in R2:*) printf '%s/%s' "$ROOT" "\${1#R2:}" ;; *) return 1 ;; esac; }
bucket_of() { local p="\${1#R2:}"; printf '%s/%s' "$ROOT" "\${p%%/*}"; }
case "$sub" in
  lsf)
    [ \${#pos[@]} -eq 1 ] || { echo "stub rclone: lsf takes one remote" >&2; exit 98; }
    if [ -e "$ROOT/.lsf-fails" ]; then echo "ERROR : error listing: temporary failure (stub)" >&2; exit 5; fi
    d="$(onr2 "\${pos[0]}")" || { echo "stub rclone: not an R2 path" >&2; exit 98; }
    if [ ! -d "$(bucket_of "\${pos[0]}")" ]; then echo "ERROR : error listing: directory not found" >&2; exit 3; fi
    [ -d "$d" ] || exit 0
    if [ "$recursive" = 1 ]; then depth=""; else depth="-maxdepth 1"; fi
    out="$(entries "$d")"
    [ -n "$out" ] || exit 0
    if [ -e "$ROOT/.lsf-unterminated" ]; then printf '%s' "$out"; else printf '%s\\n' "$out"; fi
    exit 0 ;;
  copyto)
    [ \${#pos[@]} -eq 2 ] || { echo "stub rclone: copyto takes two operands" >&2; exit 98; }
    case "\${pos[1]}" in R2:*) echo "stub rclone: a restore proof never writes to R2" >&2; exit 99 ;; esac
    src="$(onr2 "\${pos[0]}")" || { echo "stub rclone: the source is not an R2 path" >&2; exit 98; }
    : > "$ROOT/.copy-started"
    if [ -e "$ROOT/.slow-copy" ]; then sleep 2; fi
    if [ -e "$ROOT/.copy-fails" ]; then echo "ERROR : failed to copy: connection reset (stub)" >&2; exit 7; fi
    if [ ! -f "$src" ]; then echo "ERROR : error reading source root directory: directory not found" >&2; exit 3; fi
    mkdir -p "$(dirname "\${pos[1]}")"
    if [ -e "$ROOT/.copy-empty" ]; then : > "\${pos[1]}"; exit 0; fi
    cp "$src" "\${pos[1]}"; exit $? ;;
  *)
    echo "stub rclone: unsupported subcommand '$sub'" >&2; exit 99 ;;
esac
`;
}

/**
 * The real ~/.local/bin/wl-secret, minus the Keychain: the same argument
 * grammar and the same `env -i` carrying only HOME, USER, PATH, LANG and
 * TMPDIR. It lives outside PATH, so only the test that names it runs it.
 */
function wlSecretStub(sb: Sandbox): string {
  const path = join(sb.root, "launcher", "wl-secret");
  mkdirSync(dirname(path));
  writeFileSync(
    path,
    `#!/bin/bash
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
`,
    { mode: 0o755 },
  );
  return path;
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
    TMPDIR: sb.tmp,
    R2_TOKEN: TOKEN,
    LEVELFLOW_R2_BUCKET: BUCKET,
    LEVELFLOW_CHECKOUT: sb.checkout,
    ...overrides,
  };
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined));
}

/**
 * Run the script, then assert what must hold after EVERY run, pass or fail:
 * its scratch directory is gone, the live bank is byte-for-byte what it was,
 * and the token appears nowhere a person or another process could read it.
 */
function run(sb: Sandbox, overrides: Record<string, string | undefined> = {}, script = SCRIPT): Result {
  const before = digest(sb.checkout);
  const r = spawnSync(BASH, [script], { encoding: "utf8", env: envFor(sb, overrides) });
  const result = { code: r.status, stdout: r.stdout, stderr: r.stderr };
  afterEveryRun(sb, result, before);
  return result;
}

function afterEveryRun(sb: Sandbox, r: Result, before: string) {
  assert.deepEqual(readdirSync(sb.tmp), [], `the scratch directory survived the run:\n${r.stderr}`);
  assert.equal(digest(sb.checkout), before, "the live bank changed; the proof must only read it");
  const surfaces = { stdout: r.stdout, stderr: r.stderr, "rclone argv": rcloneCalls(sb).join("\n") };
  for (const [where, text] of Object.entries(surfaces)) {
    assert.ok(!text.includes(TOKEN), `the token appears in ${where}`);
    assert.ok(!text.includes(SECRET), `the derived S3 secret appears in ${where}`);
  }
  assert.ok(!existsSync(join(sb.home, ".config", "rclone")), "no rclone config may be written");
  if (r.code !== 0) assert.equal(r.stdout, "", "a failure prints nothing on stdout");
}

/** Every path under `dir` with its bytes (or link target), in one hash. */
function digest(dir: string): string {
  const hash = createHash("sha256");
  const walk = (at: string) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name);
      const stat = statSync(path, { throwIfNoEntry: false });
      hash.update(`${relative(dir, path)}\0`);
      if (stat?.isDirectory()) walk(path);
      else if (stat?.isFile()) hash.update(readFileSync(path));
    }
  };
  walk(dir);
  return hash.digest("hex");
}

/** A literal string as a regular expression. Paths under a temp root carry dots. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const rcloneCalls = (sb: Sandbox) => (existsSync(sb.log) ? readFileSync(sb.log, "utf8").split("\n").filter(Boolean) : []);

const SUMMARY = /^\S+ mb-restore-check: restore proven: (\S+): (\d+) data file\(s\), (\d+) restored bar\(s\), (\d+) live bar\(s\)$/;

/** The summary line, which must be the whole of stdout. */
function summaryOf(r: Result) {
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 1, `stdout must be the summary line alone:\n${r.stdout}`);
  const match = lines[0].match(SUMMARY);
  assert.ok(match, `not a summary line: ${lines[0]}`);
  return { object: match[1], files: Number(match[2]), restored: Number(match[3]), live: Number(match[4]) };
}

function assertFails(r: Result, reason: RegExp) {
  assert.equal(r.code, 1, `expected exit 1:\n${r.stderr}`);
  assert.match(r.stderr, /FAIL /);
  assert.match(r.stderr, reason);
  assert.doesNotMatch(r.stderr, /restore proven/);
}

describe("the harness cannot reach anything real", () => {
  it("resolves rclone to the stub, zstd and jq to the real tools, and security and wl-secret to nothing", () => {
    const sb = sandbox();
    const probe = spawnSync(
      BASH,
      ["-c", "for t in rclone zstd jq security wl-secret brew; do printf '%s=%s\\n' \"$t\" \"$(command -v \"$t\" || echo MISSING)\"; done"],
      { encoding: "utf8", env: envFor(sb) },
    );
    const found = Object.fromEntries(probe.stdout.trim().split("\n").map((line) => line.split("=") as [string, string]));
    assert.equal(found.rclone, join(sb.bin, "rclone"));
    assert.equal(found.zstd, join(toolsDir(), "zstd"));
    assert.equal(found.jq, join(toolsDir(), "jq"));
    assert.equal(found.security, "MISSING");
    assert.equal(found["wl-secret"], "MISSING");
    assert.equal(found.brew, "MISSING");
    assert.ok(!existsSync(join(toolsDir(), "rclone")), "the real rclone must not be linked into the tools directory");
  });
});

describe("the newest archive restores, and every restored byte is the head of the live bank", () => {
  it("passes over a bank that grew since the snapshot, a late fill appended at a file's end included", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    growSinceSnapshot(sb);
    // Decoys the --include filter must keep out of the listing.
    writeFileSync(join(sb.bucketDir, PREFIX, "2026", "09", "minute-bank-20260930.tar.zst.partial"), "x");
    writeFileSync(join(sb.bucketDir, PREFIX, "2026", "09", "README.txt"), "x");
    const r = run(sb);
    const summary = summaryOf(r);
    assert.equal(summary.object, `R2:${BUCKET}/${keyFor("20260902")}`);
    assert.equal(summary.files, 3);
    assert.equal(summary.restored, 5 + 4 + 3);
    assert.equal(summary.live, 7 + 4 + 3 + 2);
    // Added since the snapshot: named, and not a failure.
    assert.match(r.stderr, /added since 20260902, not in the archive: GBPUSD\b/);
    // A listing and one download, and nothing else. The download lands in
    // the run's own scratch directory, under TMPDIR.
    const calls = rcloneCalls(sb);
    assert.deepEqual(calls.map((call) => call.split(" ")[0]), ["lsf", "copyto"]);
    assert.equal(calls[0], `lsf -R --files-only R2:${BUCKET}/${PREFIX}/ --include minute-bank-*.tar.zst`);
    assert.match(calls[1], new RegExp(`^copyto ${literal(`R2:${BUCKET}/${keyFor("20260902")}`)} ${literal(sb.tmp)}/[^/ ]+/archive\\.tar\\.zst$`));
  });

  it("chooses the newest archive by name, whatever order the listing arrives in", () => {
    const sb = sandbox();
    // The older archives cannot be restored, so choosing one fails the run.
    corrupt(archive(sb, "20251231"));
    corrupt(archive(sb, "20260831"));
    appendBank(sb, "EURUSD", [bar("2026-09-01 09:35:00", 1.1005), bar("2026-09-01 09:20:00", 1.0995)]);
    archive(sb, "20260915");
    writeBank(sb, "GBPUSD", minutes("2026-09-01", 30, 2, 1.3));
    const summary = summaryOf(run(sb));
    assert.equal(summary.object, `R2:${BUCKET}/${keyFor("20260915")}`);
    assert.equal(summary.restored, 7 + 4 + 3);
    assert.equal(summary.live, 7 + 4 + 3 + 2);
  });

  it("passes when the bank is unchanged since the snapshot", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    const r = run(sb);
    const summary = summaryOf(r);
    assert.equal(summary.restored, 12);
    assert.equal(summary.live, 12);
    assert.doesNotMatch(r.stderr, /added since/);
  });

  it("runs through wl-secret's scrubbed environment, as the weekly cadence invokes it", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    growSinceSnapshot(sb);
    const launcher = wlSecretStub(sb);
    const before = digest(sb.checkout);
    const r = spawnSync(
      launcher,
      [
        "cloudflare-r2-backup=R2_TOKEN",
        "--",
        "/usr/bin/env",
        `LEVELFLOW_R2_BUCKET=${BUCKET}`,
        `LEVELFLOW_CHECKOUT=${sb.checkout}`,
        "bash",
        SCRIPT,
      ],
      { encoding: "utf8", env: { HOME: sb.home, PATH: `${sb.bin}:${toolsDir()}`, TMPDIR: sb.tmp } },
    );
    const result = { code: r.status, stdout: r.stdout, stderr: r.stderr };
    afterEveryRun(sb, result, before);
    assert.equal(summaryOf(result).restored, 12);
  });

  it("lists the default bucket when none is named", () => {
    const sb = sandbox();
    const r = run(sb, { LEVELFLOW_R2_BUCKET: undefined });
    // There is no windwardline-backups directory in the fake R2, so the
    // listing fails as a missing bucket does; the argv is what matters.
    assertFails(r, /R2:windwardline-backups was not found \(rclone exit 3\)/);
    assert.deepEqual(rcloneCalls(sb), [`lsf -R --files-only R2:windwardline-backups/${PREFIX}/ --include minute-bank-*.tar.zst`]);
  });

  it("reads the bank of the repository it sits in when LEVELFLOW_CHECKOUT is unset", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    // A copy of the script in a repository of its own, whose bank is the
    // sandbox's: the default must resolve from the script's location.
    const repo = join(sb.root, "repo");
    mkdirSync(join(repo, "scripts", "ops"), { recursive: true });
    copyFileSync(SCRIPT, join(repo, SCRIPT));
    cpSync(sb.bank, join(repo, ".minute-bank"), { recursive: true });
    const summary = summaryOf(run(sb, { LEVELFLOW_CHECKOUT: undefined }, join(repo, SCRIPT)));
    assert.equal(summary.live, 12);
    rmSync(join(repo, ".minute-bank"), { recursive: true });
    const r = run(sb, { LEVELFLOW_CHECKOUT: undefined }, join(repo, SCRIPT));
    assertFails(r, new RegExp(`no live bank at ${literal(join(repo, ".minute-bank"))}`));
  });

  it("neither waits on nor takes the bank lock", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    // A live holder: this test process. The backup would wait 900s here.
    const lock = join(sb.checkout, ".minute-bank.lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), `${process.pid}\n`);
    const started = Date.now();
    summaryOf(run(sb));
    assert.ok(Date.now() - started < 30_000, "the proof waited on the bank lock");
    assert.equal(readFileSync(join(lock, "pid"), "utf8"), `${process.pid}\n`, "the holder's lock was touched");
    rmSync(lock, { recursive: true });
    summaryOf(run(sb));
    assert.ok(!existsSync(lock), "the proof took the bank lock and left it behind");
  });
});

describe("a restore that does not match the live bank fails, naming the file", () => {
  it("fails when a banked bar was rewritten in the live file", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    growSinceSnapshot(sb);
    const file = join(sb.bank, "%5EGSPC.jsonl");
    const lines = readFileSync(file, "utf8").split("\n");
    // Same length, so the size check cannot be what catches it.
    const rewritten = lines[1].replace('"volume":0', '"volume":9');
    assert.notEqual(rewritten, lines[1]);
    lines[1] = rewritten;
    writeFileSync(file, lines.join("\n"));
    const r = run(sb);
    assertFails(r, /%5EGSPC\.jsonl — the restored bytes are not the head of the live file/);
    assert.doesNotMatch(r.stderr, /EURUSD\.jsonl —/);
  });

  it("fails when the live file is shorter than the restored one", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    const file = join(sb.bank, "BTCUSD.jsonl");
    writeFileSync(file, readFileSync(file, "utf8").split("\n").slice(0, 2).join("\n") + "\n");
    assertFails(run(sb), /BTCUSD\.jsonl — the live file holds \d+ byte\(s\), fewer than the \d+ restored/);
  });

  it("fails when a restored symbol is missing from the live bank", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    unlinkSync(join(sb.bank, "BTCUSD.jsonl"));
    assertFails(run(sb), /BTCUSD\.jsonl — restored, and absent from the live bank/);
  });

  it("names every failing file, not only the first", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    unlinkSync(join(sb.bank, "BTCUSD.jsonl"));
    unlinkSync(join(sb.bank, "EURUSD.jsonl"));
    const r = run(sb);
    assertFails(r, /BTCUSD\.jsonl — restored, and absent/);
    assert.match(r.stderr, /EURUSD\.jsonl — restored, and absent/);
  });
});

describe("a restore that disagrees with itself fails, naming the file", () => {
  it("fails when a sidecar's bars disagrees with its file's lines", () => {
    const sb = sandbox();
    archive(sb, "20260902", { edit: (snap) => writeFileSync(join(snap, "BTCUSD.state.json"), sidecar("BTCUSD", 4)) });
    assertFails(run(sb), /BTCUSD\.jsonl — the sidecar counts 4 bar\(s\) and the file holds 3 line\(s\)/);
  });

  it("fails when a data file has no sidecar beside it", () => {
    const sb = sandbox();
    archive(sb, "20260902", { edit: (snap) => unlinkSync(join(snap, "EURUSD.state.json")) });
    assertFails(run(sb), /EURUSD\.jsonl — no sidecar EURUSD\.state\.json beside it/);
  });

  it("fails when a sidecar does not parse", () => {
    const sb = sandbox();
    archive(sb, "20260902", { edit: (snap) => writeFileSync(join(snap, "EURUSD.state.json"), '{ "bars": 5, ') });
    assertFails(run(sb), /EURUSD\.state\.json — does not parse as a JSON object/);
  });

  for (const [label, value] of [
    ["a string", '"5"'],
    ["a fraction", "5.5"],
    ["negative", "-5"],
    ["absent", undefined],
  ] as const) {
    it(`fails when a sidecar's bars is ${label}`, () => {
      const sb = sandbox();
      const body = value === undefined ? '{ "fmpSymbol": "EURUSD" }' : `{ "fmpSymbol": "EURUSD", "bars": ${value} }`;
      archive(sb, "20260902", { edit: (snap) => writeFileSync(join(snap, "EURUSD.state.json"), body) });
      assertFails(run(sb), /EURUSD\.state\.json — "bars" is '[^']*', not a count/);
    });
  }

  it("fails when a sidecar counts bars and the archive holds no data file for it", () => {
    const sb = sandbox();
    archive(sb, "20260902", { edit: (snap) => writeFileSync(join(snap, "AUDUSD.state.json"), sidecar("AUDUSD", 7)) });
    assertFails(run(sb), /AUDUSD\.state\.json — counts 7 bar\(s\) and the archive holds no data file for it/);
  });

  it("fails when an orphan sidecar does not parse", () => {
    const sb = sandbox();
    archive(sb, "20260902", { edit: (snap) => writeFileSync(join(snap, "USDMXN.state.json"), "not json") });
    assertFails(run(sb), /USDMXN\.state\.json — does not parse as a JSON object/);
  });

  it("fails when a restored file ends in a torn line, even with the sidecar and the prefix agreeing", () => {
    // The shape the bank lock exists to prevent: a copy taken mid-append.
    // The torn bytes are the head of a line the live file completed, and the
    // sidecar still counts the complete lines, so only the final byte tells.
    const sb = sandbox();
    const whole = `${JSON.stringify(bar("2026-09-01 09:35:00", 1.1005))}\n`;
    const torn = whole.slice(0, 20);
    archive(sb, "20260902", { edit: (snap) => appendFileSync(join(snap, "EURUSD.jsonl"), torn) });
    appendBank(sb, "EURUSD", [bar("2026-09-01 09:35:00", 1.1005)]);
    assertFails(run(sb), /EURUSD\.jsonl — the restored file ends in a torn line/);
  });
});

describe("a restore that examined nothing is refused", () => {
  it("fails when the archive holds no data file", () => {
    const sb = sandbox();
    archive(sb, "20260902", {
      edit: (snap) => {
        for (const name of readdirSync(snap)) unlinkSync(join(snap, name));
      },
    });
    assertFails(run(sb), /restored no data file; refusing to certify a restore that examined nothing/);
  });

  it("fails when every restored data file is empty", () => {
    const sb = sandbox();
    archive(sb, "20260902", {
      edit: (snap) => {
        for (const name of readdirSync(snap).filter((n) => n.endsWith(".jsonl"))) {
          writeFileSync(join(snap, name), "");
          writeFileSync(join(snap, name.replace(/\.jsonl$/, ".state.json")), sidecar(name.replace(/\.jsonl$/, ""), 0));
        }
      },
    });
    assertFails(run(sb), /restored 3 data file\(s\) holding no bars; refusing to certify a restore that examined nothing/);
  });
});

describe("the listing is read strictly", () => {
  it("fails when there is no archive at all", () => {
    const sb = sandbox();
    // The bucket exists and the prefix does not: rclone lists nothing, exit 0.
    const r = run(sb);
    assertFails(r, new RegExp(`no archive under ${literal(`R2:${BUCKET}/${PREFIX}/`)}; there is nothing to restore`));
    assert.deepEqual(rcloneCalls(sb).map((call) => call.split(" ")[0]), ["lsf"]);
  });

  it("fails when the prefix holds only what the include filter keeps out", () => {
    const sb = sandbox();
    mkdirSync(join(sb.bucketDir, PREFIX, "2026", "09"), { recursive: true });
    writeFileSync(join(sb.bucketDir, PREFIX, "2026", "09", "minute-bank-20260902.tar.zst.partial"), "x");
    assertFails(run(sb), /there is nothing to restore/);
  });

  it("reads a final listing line that arrives without its newline", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    writeFileSync(join(sb.remote, ".lsf-unterminated"), "");
    assert.equal(summaryOf(run(sb)).object, `R2:${BUCKET}/${keyFor("20260902")}`);
  });

  it("fails on an unreadable listing rather than reading it as empty", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    writeFileSync(join(sb.remote, ".lsf-fails"), "");
    const r = run(sb);
    assertFails(r, new RegExp(`could not list ${literal(`R2:${BUCKET}/${PREFIX}/`)} \\(rclone exit 5\\); an unreadable listing is not an empty one`));
    assert.match(r.stderr, /temporary failure \(stub\)/);
    assert.doesNotMatch(r.stderr, /nothing to restore/);
  });

  it("fails by name when the bucket does not exist", () => {
    const sb = sandbox();
    const r = run(sb, { LEVELFLOW_R2_BUCKET: "no-such-bucket" });
    assertFails(r, /R2:no-such-bucket was not found \(rclone exit 3\)/);
  });

  for (const stray of ["2026/08/minute-bank-20260902.tar.zst", "minute-bank-20260902.tar.zst", "2026/09/minute-bank-2026092.tar.zst"]) {
    it(`fails naming an archive outside the layout: ${stray}`, () => {
      const sb = sandbox();
      archive(sb, "20260903");
      mkdirSync(dirname(join(sb.bucketDir, PREFIX, stray)), { recursive: true });
      writeFileSync(join(sb.bucketDir, PREFIX, stray), "x");
      const r = run(sb);
      assertFails(r, /outside the layout <YYYY>\/<MM>\/minute-bank-<YYYYMMDD>\.tar\.zst/);
      assert.ok(r.stderr.includes(`  ${stray}`), `the stray key must be named:\n${r.stderr}`);
      assert.deepEqual(rcloneCalls(sb).map((call) => call.split(" ")[0]), ["lsf"], "nothing may be downloaded");
    });
  }
});

describe("the archive itself is checked before anything is compared", () => {
  it("fails when the download fails", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    writeFileSync(join(sb.remote, ".copy-fails"), "");
    const r = run(sb);
    assertFails(r, /could not download 2026\/09\/minute-bank-20260902\.tar\.zst \(rclone exit 7\)/);
    assert.match(r.stderr, /connection reset \(stub\)/);
  });

  it("fails when the download is empty", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    writeFileSync(join(sb.remote, ".copy-empty"), "");
    assertFails(run(sb), /the download of 2026\/09\/minute-bank-20260902\.tar\.zst produced no bytes/);
  });

  it("fails when the archive does not pass zstd's integrity test", () => {
    const sb = sandbox();
    corrupt(archive(sb, "20260902"));
    assertFails(run(sb), /2026\/09\/minute-bank-20260902\.tar\.zst fails zstd's integrity test/);
  });

  it("fails when the archive is sound zstd around something that is not a tar", () => {
    const sb = sandbox();
    const object = objectFor(sb, "20260902");
    mkdirSync(dirname(object), { recursive: true });
    const built = spawnSync("/bin/sh", ["-c", `printf 'not a tar archive\\n' | zstd -q -19 -o '${object}'`], { encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr);
    assertFails(run(sb), /2026\/09\/minute-bank-20260902\.tar\.zst did not extract/);
  });

  it("fails when the archive's directory is stamped differently from its key", () => {
    const sb = sandbox();
    archive(sb, "20260902", { top: "levelflow-minute-bank-snapshot-20260901" });
    assertFails(run(sb), /must hold exactly one directory, levelflow-minute-bank-snapshot-20260902; it holds: levelflow-minute-bank-snapshot-20260901/);
  });

  it("fails when the archive holds anything beside its one directory", () => {
    const sb = sandbox();
    archive(sb, "20260902", { alongside: "stray.txt" });
    assertFails(run(sb), /must hold exactly one directory, levelflow-minute-bank-snapshot-20260902; it holds: .*stray\.txt/);
  });

  it("fails when the archive holds a link", () => {
    const sb = sandbox();
    archive(sb, "20260902", { edit: (snap) => symlinkSync("EURUSD.jsonl", join(snap, "LINKED.jsonl")) });
    assertFails(run(sb), /holds entries that are neither files nor directories: .*LINKED\.jsonl/);
  });
});

describe("refusals before any rclone call", () => {
  for (const [label, value] of [["unset", undefined], ["empty", ""]] as const) {
    it(`refuses when R2_TOKEN is ${label}, naming the invocation`, () => {
      const sb = sandbox();
      archive(sb, "20260902");
      const r = run(sb, { R2_TOKEN: value });
      assertFails(r, /R2_TOKEN is unset/);
      assert.ok(
        r.stderr.includes("~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- bash scripts/ops/verify-minute-bank-restore.sh"),
        r.stderr,
      );
      assert.equal(rcloneCalls(sb).length, 0);
    });
  }

  it("refuses when LEVELFLOW_CHECKOUT names nothing", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    const missing = join(sb.root, "no-such-checkout");
    assertFails(run(sb, { LEVELFLOW_CHECKOUT: missing }), new RegExp(`LEVELFLOW_CHECKOUT names no directory: ${literal(missing)}`));
    assert.equal(rcloneCalls(sb).length, 0);
  });

  it("refuses a checkout with no bank rather than reading it as empty", () => {
    const sb = sandbox();
    archive(sb, "20260902");
    const empty = join(sb.root, "empty-checkout");
    mkdirSync(empty);
    assertFails(run(sb, { LEVELFLOW_CHECKOUT: empty }), new RegExp(`no live bank at ${literal(join(empty, ".minute-bank"))}`));
    assert.equal(rcloneCalls(sb).length, 0);
  });

  it("refuses when rclone is not installed", () => {
    const sb = sandbox();
    assertFails(run(sb, { PATH: toolsDir() }), /rclone is not installed/);
  });

  for (const tool of ["zstd", "jq"]) {
    it(`refuses when ${tool} is not installed`, () => {
      const sb = sandbox();
      assertFails(run(sb, { PATH: `${sb.bin}:${toolsDir([tool])}` }), new RegExp(`${tool} is not installed`));
      assert.equal(rcloneCalls(sb).length, 0);
    });
  }
});

describe("the scratch directory goes on a signal too", () => {
  for (const [signal, code] of [["SIGTERM", 143], ["SIGINT", 130], ["SIGHUP", 129]] as const) {
    it(`removes it and exits ${code} on ${signal} mid-download`, async () => {
      const sb = sandbox();
      archive(sb, "20260902");
      writeFileSync(join(sb.remote, ".slow-copy"), "");
      const before = digest(sb.checkout);
      const child = spawn(BASH, [SCRIPT], { env: envFor(sb) });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      const exited = new Promise<number | null>((resolve) => child.on("close", (status) => resolve(status)));
      const deadline = Date.now() + 20_000;
      while (!existsSync(join(sb.remote, ".copy-started"))) {
        assert.ok(Date.now() < deadline, "the download never started");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // The scratch directory exists while the download runs.
      assert.equal(readdirSync(sb.tmp).length, 1);
      child.kill(signal);
      const status = await exited;
      assert.equal(status, code, stderr);
      afterEveryRun(sb, { code: status, stdout, stderr }, before);
    });
  }
});

describe("the script's shape", () => {
  const source = readFileSync(SCRIPT, "utf8");
  const code = source.split("\n").filter((line) => !/^\s*#/.test(line));

  it("is tracked executable, like its siblings", () => {
    assert.ok((statSync(SCRIPT).mode & 0o111) !== 0, `${SCRIPT} must be executable`);
  });

  it("configures rclone with the same six lines as push-minute-bank-offbox.sh", () => {
    const push = readFileSync("scripts/ops/push-minute-bank-offbox.sh", "utf8");
    const config = (text: string) => text.split("\n").filter((line) => /RCLONE_CONFIG_R2_/.test(line) && !/^\s*#/.test(line));
    assert.equal(config(push).length, 6);
    assert.deepEqual(config(source), config(push));
  });

  it("calls rclone only to list and to download into its scratch directory, spelled literally", () => {
    const calls = code.filter((line) => /^\s*rclone\s/.test(line));
    assert.deepEqual(
      calls.map((line) => line.trim().match(/^rclone (\w+)/)?.[1]),
      ["lsf", "copyto"],
      `every rclone call is spelled literally with its verb:\n${calls.join("\n")}`,
    );
    assert.match(calls[0], /rclone lsf -R --files-only "R2:\$BUCKET\/\$PREFIX\/" --include 'minute-bank-\*\.tar\.zst'/);
    assert.match(calls[1], /rclone copyto "R2:\$BUCKET\/\$PREFIX\/\$NEWEST" "\$WORK\/archive\.tar\.zst"/);
    // Nowhere else: not inside a substitution, not behind a pipe, not renamed.
    for (const line of code) {
      assert.doesNotMatch(line, /\$\(\s*rclone|`\s*rclone|\|\s*rclone/, line);
      assert.doesNotMatch(
        line,
        /(^|[\s;&|(])(alias\s+rclone=|function\s+rclone\b|rclone\s*\(\)|[A-Za-z_]\w*=["']?rclone["']?(\s|;|$))/,
        `rclone renamed or wrapped: ${line}`,
      );
    }
  });
});
