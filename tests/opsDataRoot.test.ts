import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * No ops script defaults a data, destination or snapshot root to the home
 * folder itself.
 *
 * A job that writes into ~ scatters dated directories beside everything the
 * owner keeps there, and a prune or cleanup that walks that root walks the
 * home folder. Data belongs under a named directory such as
 * ~/.local/share/levelflow-cloud/, where a listing shows only what the job
 * wrote.
 *
 * DERIVED, not listed: every .sh in scripts/ops is parsed, every assignment's
 * effective default is read through `${VAR:-default}` wrappers, and any that
 * lands on the home folder fails. A new script is under the rule the moment
 * it exists.
 */

const OPS = "scripts/ops";

/**
 * Known cases, each dated and each removed by the change that fixes it. An
 * entry that no longer matches anything fails below, so the list cannot
 * outlive its reason.
 */
const DATED_EXCEPTIONS: Array<{ file: string; variable: string; value: string; dated: string; why: string }> = [
  {
    file: "scripts/ops/backup-minute-bank.sh",
    variable: "DEST_ROOT",
    value: "/Users/peacock",
    dated: "2026-09-21",
    why:
      "the minute-bank snapshots still land in ~ at this branch's base (a30ade3). The snapshot-root fix " +
      "moves DEST_ROOT to $HOME/.local/share/levelflow-cloud/minute-bank-snapshots and deletes this entry.",
  },
];

const HOME_ROOT = /^(?:\/Users\/[^/]+|\/home\/[^/]+|\/root|\$HOME|\$\{HOME\}|~)\/?$/;
const ASSIGNMENT = /^\s*(?:(?:export|local|readonly|declare(?:\s+-[A-Za-z]+)?)\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

/** The first shell word of `text`: quotes and $( ) nesting kept together. */
function firstWord(text: string): string {
  let word = "";
  let quote: '"' | "'" | undefined;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = undefined;
    } else if (ch === "\\") {
      word += ch + (text[i + 1] ?? "");
      i++;
      continue;
    } else if (quote === '"') {
      if (ch === '"' && depth === 0) quote = undefined;
      else if (ch === "(" && text[i - 1] === "$") depth++;
      else if (ch === ")" && depth > 0) depth--;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "(" && text[i - 1] === "$") {
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
    } else if (/\s/.test(ch) && depth === 0) {
      break;
    }
    word += ch;
  }
  return word;
}

/** What an assignment's value resolves to when every override is unset. */
export function effectiveDefault(value: string): string {
  let current = firstWord(value).replace(/["']/g, "");
  for (;;) {
    const wrapped = current.match(/^\$\{[A-Za-z_][A-Za-z0-9_]*:?[-=](.*)\}$/);
    if (!wrapped) return current;
    current = wrapped[1];
  }
}

/**
 * What a line sets, whichever way it sets it.
 *
 * `VAR=value` is one way. `: "${VAR:=default}"` is the other, and it is already
 * in house — scripts/ops/bank-lock.sh uses it. A parser that reads only the
 * first calls a script clean while the shell gives VAR a home-folder default.
 */
export function assignmentOf(text: string): { variable: string; value: string } | undefined {
  if (/^\s*#/.test(text)) return undefined;
  const colon = text.match(/^\s*:\s+(.*)$/);
  if (colon) {
    const word = firstWord(colon[1]).replace(/["']/g, "");
    const expanded = word.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*):?[-=](.*)\}$/);
    return expanded ? { variable: expanded[1], value: effectiveDefault(expanded[2]) } : undefined;
  }
  const match = text.match(ASSIGNMENT);
  return match ? { variable: match[1], value: effectiveDefault(match[2]) } : undefined;
}

export function homeRootDefaults(source: string): Array<{ variable: string; value: string; line: number }> {
  const found: Array<{ variable: string; value: string; line: number }> = [];
  source.split("\n").forEach((text, index) => {
    const set = assignmentOf(text);
    if (!set || set.variable === "HOME") return;
    if (HOME_ROOT.test(set.value)) found.push({ ...set, line: index + 1 });
  });
  return found;
}

/** Each variable's FIRST assignment, which is where a script states its default. */
function assignments(source: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const text of source.split("\n")) {
    const set = assignmentOf(text);
    if (set && !map.has(set.variable)) map.set(set.variable, set.value);
  }
  return map;
}

describe("the parser reads a default the way the shell would", () => {
  it("catches every spelling of the home folder itself", () => {
    for (const line of [
      'DEST_ROOT="${LEVELFLOW_BACKUP_ROOT:-/Users/peacock}"',
      "DEST_ROOT=/Users/peacock/",
      'OUT="$HOME"',
      "OUT=${HOME}",
      'OUT="$HOME/"',
      '  local root="${ROOT:-~}"',
      'export SNAP_ROOT="${A:-${B:-$HOME}}"',
      'CACHE="${X:=/home/runner}"',
      ': "${SNAP_ROOT:=$HOME}"',
      ': ${DEST_ROOT:=/Users/peacock}',
    ]) {
      assert.equal(homeRootDefaults(line).length, 1, line);
    }
  });

  it("passes a named directory under it, including the snapshot-root fix", () => {
    for (const line of [
      'DEST_ROOT="${LEVELFLOW_BACKUP_ROOT:-$HOME/.local/share/levelflow-cloud/minute-bank-snapshots}"',
      'STAGING_ROOT="${LEVELFLOW_ARCHIVE_STAGING:-$HOME/.local/share/levelflow-cloud/staging}"',
      'WL_SECRET="${LEVELFLOW_WL_SECRET:-$HOME/.local/bin/wl-secret}"',
      'REPO="${LEVELFLOW_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"',
      'HOME="${HOME:-/Users/peacock}"',
      "# DEST_ROOT=/Users/peacock",
      // The in-house spelling of the colon form, from scripts/ops/bank-lock.sh.
      ': "${LEVELFLOW_BANK_LOCK_TIMEOUT:=900}"',
    ]) {
      assert.deepEqual(homeRootDefaults(line), [], line);
    }
  });

  it("reads the colon form as the assignment it is", () => {
    assert.deepEqual(assignmentOf(': "${LEVELFLOW_BANK_LOCK_TIMEOUT:=900}"'), {
      variable: "LEVELFLOW_BANK_LOCK_TIMEOUT",
      value: "900",
    });
    assert.deepEqual(assignmentOf(': "${SNAP_ROOT:=$HOME/archives}"'), {
      variable: "SNAP_ROOT",
      value: "$HOME/archives",
    });
    // bank-lock.sh really carries it, so the population keeps covering it.
    const bankLock = readFileSync(join(OPS, "bank-lock.sh"), "utf8");
    assert.ok(
      bankLock.split("\n").some((line) => assignmentOf(line)?.variable === "LEVELFLOW_BANK_LOCK_TIMEOUT"),
      "bank-lock.sh sets its timeout through the colon builtin; the parser must read it",
    );
  });
});

describe("no ops script defaults a data root to the home folder", () => {
  const scripts = readdirSync(OPS)
    .filter((name) => name.endsWith(".sh"))
    .sort()
    .map((name) => join(OPS, name));

  it("reads a real population, not an empty one", () => {
    for (const expected of ["backup-minute-bank.sh", "push-archive-offbox.sh", "push-minute-bank-offbox.sh"]) {
      assert.ok(scripts.includes(join(OPS, expected)), `${expected} must be in the population`);
    }
    const total = scripts.reduce((sum, file) => sum + assignments(readFileSync(file, "utf8")).size, 0);
    // Measured 2026-09-21: 223 across twelve scripts. A parser that stops
    // reading them fails here instead of passing over nothing.
    assert.ok(total >= 200, `only ${total} assignments parsed; the parser is not reading these scripts`);
    // The two roots this rule exists for, found by the parser itself.
    assert.ok(assignments(readFileSync(join(OPS, "backup-minute-bank.sh"), "utf8")).has("DEST_ROOT"));
    assert.equal(
      assignments(readFileSync(join(OPS, "push-archive-offbox.sh"), "utf8")).get("STAGING_ROOT"),
      "$HOME/.local/share/levelflow-cloud/staging",
    );
  });

  it("finds no home-folder default outside the dated exceptions", () => {
    const violations = scripts.flatMap((file) =>
      homeRootDefaults(readFileSync(file, "utf8")).map((hit) => ({ file, ...hit })),
    );
    const unexcused = violations.filter(
      (v) => !DATED_EXCEPTIONS.some((e) => e.file === v.file && e.variable === v.variable && e.value === v.value),
    );
    assert.deepEqual(
      unexcused.map((v) => `${v.file}:${v.line} ${v.variable} defaults to ${v.value}`),
      [],
      "name a directory under the home folder instead",
    );
    for (const exception of DATED_EXCEPTIONS) {
      assert.ok(
        violations.some((v) => v.file === exception.file && v.variable === exception.variable && v.value === exception.value),
        `the ${exception.dated} exception for ${exception.file} ${exception.variable} is stale: the default moved, so delete the entry`,
      );
    }
  });
});
