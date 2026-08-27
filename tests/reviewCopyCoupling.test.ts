import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  applyRewrites,
  REVIEW_REWRITES,
} from "../src/components/workspace/reviewCopy.ts";

/**
 * Couples the copy layer to the engine that feeds it.
 *
 * WHY THIS EXISTS. `cleanReviewMessage` rewrites the analyzer's sentences into
 * the reader's voice, and it had rotted in the one way a rewriter can rot
 * silently: several of its rules no longer matched anything the analyzer emits.
 * The expensive one was the market decline. Its pattern demanded a numeric
 * `-0.12R per setup`; the analyzer deliberately stopped emitting the magnitude
 * (SC-5 — the figures come from the corpus the 2026-08-11 clock defect
 * invalidated); the rule stopped firing; and the raw engine sentence went to
 * the reader on all 15 declined markets, ending in a clause — "accrued data
 * that turns this positive returns the market" — that does not parse on a
 * first read.
 *
 * A dead rewrite is INVISIBLE. It reads exactly like a rewrite whose input
 * happens not to occur, and every test still passes, because the tests
 * exercised the rewriter against sentences someone had TRANSCRIBED from the
 * analyzer rather than taken from it. That is a shadow test: it reimplements
 * the subject and inherits the subject's staleness.
 *
 * So the corpus here is EXTRACTED from the analyzer's own source at test time.
 * If the analyzer's wording changes, this file sees the new wording on the
 * next run — which is the entire point, and the reason it must never be
 * replaced with a hand-written list of sentences.
 */

const ANALYZER = join(
  new URL("..", import.meta.url).pathname,
  "supabase/functions/trade-analyzer",
);

/** Files that put sentences on the wire for a human to read. */
const EMITTERS = ["index.ts", "marketLoader.ts", "sessions.ts"];

/**
 * Every literal the analyzer hands a reader: the `reason:` of a blocked or
 * refused response, and anything pushed into `diagnostics` or
 * `providerWarnings`.
 */
const SITE = /(?:^|[\s{(,])(?:reason:|(?:diagnostics|providerWarnings)\.push\()/g;

/**
 * Reads the value expression at `from`, stopping at the comma or brace that
 * closes it, and returns every string literal inside with the separator that
 * preceded it.
 *
 * A CHARACTER SCAN, not a regex. The first version matched `reason:` followed
 * by a literal, which silently skipped every value written as a ternary —
 *
 *     reason: fetchFailed
 *       ? "Market data did not load. Try again shortly."
 *       : "FMP did not return enough bars for this instrument.",
 *
 * — so two live rewrite rules had no input in the corpus and the liveness
 * check below called them DEAD. A guard that deletes real coverage because
 * its own population was incomplete is worse than no guard. `unreadableSites`
 * compares what this scanner READ against what is plainly there, so a shape it
 * cannot parse fails loudly instead of quietly shrinking the corpus.
 */
function literalsAt(
  source: string,
  from: number,
): { joins: string[]; raw: string; texts: string[] } {
  const texts: string[] = [];
  const joins: string[] = [];
  let depth = 0;
  let since = "";
  let end = from;
  for (let i = from; i < source.length; i++) {
    end = i;
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break;
      depth--;
    } else if (ch === "," && depth === 0) break;
    else if (ch === '"' || ch === "`") {
      let text = "";
      let j = i + 1;
      for (; j < source.length && source[j] !== ch; j++) {
        if (source[j] === "\\") text += source[++j] === "n" ? " " : source[j];
        else text += source[j];
      }
      texts.push(text);
      joins.push(since.trim());
      since = "";
      i = j;
    } else since += ch;
  }
  return { joins, raw: source.slice(from, end), texts };
}

/**
 * Sites whose value plainly holds a quoted sentence but which the scanner read
 * nothing out of. That set must be EMPTY: a site with a literal the scanner
 * cannot see is a sentence the reader gets and this file never checks, which
 * is how the ternary gap hid two live rules' only inputs.
 */
function unreadableSites(): string[] {
  const missed: string[] = [];
  for (const file of EMITTERS) {
    const source = readFileSync(join(ANALYZER, file), "utf8");
    for (const match of source.matchAll(SITE)) {
      const at = match.index + match[0].length;
      const { joins, raw, texts } = literalsAt(source, at);
      if (/["`]/.test(raw) && texts.length === 0) {
        missed.push(`unread literal — ${file}: ${raw.trim().slice(0, 70)}`);
        continue;
      }
      // A site whose literals are separated by anything other than `+` holds
      // ALTERNATIVES, and must yield more than one sentence. Fusing them
      // instead produces a string the engine can never say — and a fused
      // string contains both branches' words, so a rule fed only by the
      // second branch still looks LIVE. That is the dangerous direction:
      // it lets a genuinely dead rule survive this file. Caught by mutation,
      // which is the only reason this clause exists.
      const alternated = joins.slice(1).some((j) => j !== "" && j !== "+");
      if (alternated && groupsOf(joins, texts).length < 2) {
        missed.push(`fused alternatives — ${file}: ${raw.trim().slice(0, 70)}`);
      }
    }
  }
  return missed;
}

/** Literals joined only by `+` are one sentence; any other separator starts a new one. */
function groupsOf(joins: string[], texts: string[]): string[] {
  const groups: string[] = [];
  let current = "";
  for (let k = 0; k < texts.length; k++) {
    if (k > 0 && (joins[k] === "" || joins[k] === "+")) current += texts[k];
    else {
      if (current.trim().length > 0) groups.push(current);
      current = texts[k];
    }
  }
  if (current.trim().length > 0) groups.push(current);
  return groups;
}

function extractFrom(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(SITE)) {
    const { joins, texts } = literalsAt(source, match.index + match[0].length);
    // Literals joined only by `+` (or by nothing, i.e. a wrapped string) are
    // ONE sentence. Anything else between them — `?`, `:` — makes them
    // alternative sentences, which is exactly the ternary case.
    found.push(...groupsOf(joins, texts));
  }
  return found;
}

function extractEngineSentences(): string[] {
  return EMITTERS.flatMap((file) =>
    extractFrom(readFileSync(join(ANALYZER, file), "utf8"))
  );
}

/**
 * The decline diagnostic is built as `stem + declined.reprobe`, so the stem is
 * the only half a literal scan can see. The reprobe lives in the register, and
 * the sentence the reader gets is the two joined — so join them here rather
 * than testing half a sentence.
 */
function declineSentences(stems: string[]): string[] {
  const register = readFileSync(join(ANALYZER, "calibration.ts"), "utf8");
  const reprobes = Array.from(
    new Set(
      (register.match(/reprobe:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g) ?? []).map((raw) =>
        (raw.match(/"((?:[^"\\]|\\.)*)"/) ?? ["", ""])[1]
      ),
    ),
  );
  assert.ok(
    reprobes.length > 0,
    "no reprobe found in the decline register — the extractor broke",
  );
  const stem = stems.find((s) => /does not produce setups for this market/.test(s));
  if (!stem) return [];
  return reprobes.map((reprobe) => `${stem}${reprobe}`);
}

/**
 * Renders a template's `${...}` slots. Full cross-product over a small filler
 * set, because the slots are not interchangeable: `The current ${side} setup
 * scored ${score}` needs a WORD in one slot and a NUMBER in the other, and a
 * single-filler pass would match neither rule and call a live rule dead.
 */
const FILLERS = ["12", "buy", "1.50", "EURUSD", "London session"];

function expand(sentence: string): string[] {
  const normalised = sentence.replace(/\$\{[^}]*\}/gs, " ");
  const slots = normalised.split(" ").length - 1;
  if (slots === 0) return [normalised];
  if (slots > 4) return FILLERS.map((f) => normalised.split(" ").join(f));
  let variants = [""];
  const literals = normalised.split(" ");
  for (let i = 0; i < slots; i++) {
    variants = variants.flatMap((prefix) =>
      FILLERS.map((filler) => prefix + literals[i] + filler)
    );
  }
  return variants.map((v) => v + literals[slots]);
}

function corpus(): string[] {
  const stems = extractEngineSentences();
  const all = [...stems, ...declineSentences(stems)];
  return Array.from(new Set(all.flatMap(expand)));
}

describe("review copy is coupled to the engine that feeds it", () => {
  it("extracts the analyzer's own sentences, and finds a real corpus", () => {
    const sentences = extractEngineSentences();
    // NON-VACUITY. An extractor that matched nothing would make every
    // liveness check below pass having compared nothing — the exact failure
    // mode this file exists to remove. The floor is well under the ~35
    // observed so a wording change does not trip it, but far above zero.
    assert.ok(
      sentences.length >= 25,
      `extractor found only ${sentences.length} engine sentences — it broke rather than the analyzer going quiet`,
    );
    assert.ok(
      sentences.some((s) => /does not produce setups for this market/.test(s)),
      "the decline sentence is missing from the extract — the pattern drifted",
    );
  });

  it("reads every site that holds a sentence, ternaries included", () => {
    // The completeness half, and the one that matters most. A count floor
    // cannot tell a corpus that shrank from an analyzer that went quiet;
    // this can, because it compares what the scanner READ against what is
    // plainly THERE at each site.
    assert.deepEqual(
      unreadableSites(),
      [],
      "these sites hold a quoted sentence the extractor could not read, so " +
        "the reader sees copy this file never checks:\n  " +
        unreadableSites().join("\n  "),
    );
  });

  it("keeps no rewrite rule that claims nothing", () => {
    const sentences = corpus();
    const baseline = sentences.map((s) => applyRewrites(s));

    const dead: string[] = [];
    for (let i = 0; i < REVIEW_REWRITES.length; i++) {
      // MUTATION: drop this one rule and re-render everything the engine can
      // say. A rule that changes no sentence is not a spare — it is a rule
      // whose input the engine stopped producing, and the next reader gets
      // the raw engine voice with nothing failing.
      const without = REVIEW_REWRITES.filter((_, j) => j !== i);
      const rendered = sentences.map((s) => applyRewrites(s, without));
      if (rendered.every((value, k) => value === baseline[k])) {
        dead.push(String(REVIEW_REWRITES[i].pattern));
      }
    }

    assert.deepEqual(
      dead,
      [],
      "these rewrite rules match nothing the analyzer emits. Either the " +
        "analyzer's wording moved and the rule must follow it, or the " +
        "sentence is gone and so should the rule:\n  " + dead.join("\n  "),
    );
  });

  it("lets no engine-internal vocabulary reach the reader", () => {
    // Not a style preference. Each of these named something the reader can
    // neither act on nor see: a server environment variable, a log they
    // cannot open, the vendor's name for the feed.
    const banned: { label: string; pattern: RegExp }[] = [
      { label: "an environment variable name", pattern: /\b[A-Z][A-Z0-9]{2,}_[A-Z0-9_]{2,}\b/ },
      { label: "server logs the reader cannot open", pattern: /function logs/i },
      { label: "the data vendor's name", pattern: /\bFMP\b/ },
      { label: "the engine's internal name for itself", pattern: /\banalyzer\b/i },
    ];

    const offenders: string[] = [];
    for (const sentence of corpus()) {
      const rendered = applyRewrites(sentence);
      for (const { label, pattern } of banned) {
        if (pattern.test(rendered)) {
          offenders.push(`${label}: ${rendered}`);
        }
      }
    }
    assert.deepEqual(offenders, [], offenders.join("\n  "));
  });
});
