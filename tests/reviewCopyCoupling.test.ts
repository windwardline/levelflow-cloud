import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  applyRewrites,
  REVIEW_REWRITES,
} from "../src/components/workspace/reviewCopy.ts";
import {
  ENGINE_DECLINED_MARKETS,
  engineDeclineSentence,
} from "../supabase/functions/trade-analyzer/calibration.ts";

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
 * Files that MATCH the emit shape but do not put prose in front of a reader,
 * each with the reason it is excluded.
 *
 * This list is the curated half, and it is deliberately the only curated half.
 * EMITTERS was three hardcoded filenames in a file whose whole argument is that
 * populations must be derived — correct on the day it was written, and unable
 * to notice a new emitter appearing, which is the exact defect this file
 * exists to catch, committed in its own header.
 *
 * The population is derived below and every member must be classified. A new
 * file that emits reader-facing text fails until someone puts it in one list or
 * the other, and an exclusion has to carry an argument rather than a name.
 */
const NOT_READER_FACING: Record<string, string> = {
  "bars.ts":
    "`reason: \"shape\" | \"timestamp\" | ...` is a rejection TAG on a " +
    "telemetry union, not prose — it never reaches a sentence.",
  "calibration.ts":
    "the decline register's `reason` is internal documentation of how each " +
    "market was measured, and it is what keeps the register's invalidated R " +
    "figures off the screen. The ONE reader-facing sentence here is " +
    "`engineDeclineSentence`, which is not at a `reason:`/push site and so is " +
    "invisible to the scan — `declineSentences()` calls it directly over the " +
    "register instead. Excluded from the SITE scan, covered by execution.",
  "replay.ts":
    "`feedback.reason` is stored on the resolution row and has no client " +
    "reader — no surface in src/ renders it.",
};

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
 * The decline sentence, taken by EXECUTION rather than by scanning.
 *
 * It used to be assembled here from a stem scraped out of index.ts's
 * `diagnostics.push(` site plus reprobes regexed out of the register. That
 * worked while the sentence was one inline literal at one site. It now has two
 * callers — the diagnostics writer and the `reason` writer, the latter being
 * the only channel that survives both candidate rebuilds — so it lives in one
 * function beside the register, and a literal scan of the emit sites can no
 * longer see it.
 *
 * Calling the real function over the real register is strictly stronger than
 * either: no stem to drift, no pattern to rot, and the corpus is by
 * construction what the analyzer actually produces. That is the opposite of
 * the shadow test this file exists to prevent — a shadow test REIMPLEMENTS the
 * subject; this one runs it.
 */
function declineSentences(): string[] {
  const sentences = Object.values(ENGINE_DECLINED_MARKETS).map(
    engineDeclineSentence,
  );
  assert.ok(
    sentences.length > 0,
    "the decline register is empty — the corpus lost a whole surface",
  );
  return Array.from(new Set(sentences));
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
  const all = [...stems, ...declineSentences()];
  return Array.from(new Set(all.flatMap(expand)));
}

describe("the emitter population is derived, not listed", () => {
  it("classifies every file that matches the emit shape", () => {
    // DERIVED: every .ts in the analyzer whose source has an emit site followed
    // by a string literal. Each must be an EMITTER whose sentences are checked,
    // or an explicit exclusion carrying its reason. Neither list may simply
    // omit a file.
    const dir = readdirSync(ANALYZER).filter((name) => name.endsWith(".ts")).sort();
    const candidates = dir.filter((name) => {
      const source = readFileSync(join(ANALYZER, name), "utf8");
      for (const match of source.matchAll(SITE)) {
        const after = source.slice(
          match.index + match[0].length,
          match.index + match[0].length + 400,
        );
        if (/^\s*\n?\s*["`]/.test(after)) return true;
      }
      return false;
    });

    // NON-VACUITY: a detector that matched nothing would classify an empty set
    // and pass having examined none of the analyzer.
    assert.ok(
      candidates.length >= 4,
      `only ${candidates.length} candidate emitters found — the detector broke`,
    );

    const unclassified = candidates.filter(
      (name) => !EMITTERS.includes(name) && !(name in NOT_READER_FACING),
    );
    assert.deepEqual(
      unclassified,
      [],
      "these files emit text and are in neither list, so their sentences are " +
        "checked by nothing: " + unclassified.join(", "),
    );

    // And the exclusions must still be real: a file listed as not
    // reader-facing that stopped matching the shape is a stale exemption.
    const stale = Object.keys(NOT_READER_FACING).filter(
      (name) => !candidates.includes(name),
    );
    assert.deepEqual(
      stale,
      [],
      "these exclusions no longer match the emit shape and should be deleted: " +
        stale.join(", "),
    );
  });
});

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
    // The decline is checked against the CORPUS, not the site scan. It is no
    // longer an inline literal at an emit site — it is composed by
    // `engineDeclineSentence` for two callers — so a scan of `reason:` and
    // `push(` sites cannot see it and `declineSentences()` runs it instead.
    // Asserted here rather than dropped, because it is the one sentence whose
    // rewrite has already rotted once.
    assert.ok(
      corpus().some((s) => /does not produce setups for this market/.test(s)),
      "the decline sentence is missing from the corpus — the extractor broke",
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
