import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import ts from "typescript";

/**
 * Find every declaration in the repo that hard-codes a list of roster symbols.
 *
 * This exists because of a defect that took five weeks to notice. Four
 * hand-typed Sets in macroRates.ts were exactly exhaustive over the 59-symbol
 * roster the day they were written, nineteen futures were onboarded on
 * 2026-08-06, and nothing anywhere could tell: a Set states what it contains
 * and never what it omits. The same shape had also frozen CRYPTO_NEWS_SYMBOLS
 * at 8 while crypto grew to 33.
 *
 * A census, not a registry. Anything that walks the source and finds these
 * declarations catches the SIXTH one too; a hand-kept list of known offenders
 * would be the very defect it polices, one level up.
 */
export type SymbolDeclaration = {
  file: string;
  line: number;
  name: string;
  /** Leading comments on the declaration itself, never elsewhere in the file. */
  leadingComments: string;
  symbols: string[];
};

/**
 * Two, not three.
 *
 * The macroRates Set that started this held exactly two members — ZBUSD and
 * ZNUSD — and so does more than one broker list. A threshold of three exempts
 * the precise shape being policed.
 */
export const CENSUS_MIN_SYMBOLS = 2;

const SOURCE_ROOTS = ["src", "scripts", "supabase/functions"];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out = out.concat(walk(path));
    else if (extname(path) === ".ts" && !path.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

/**
 * Collect the roster symbols a node mentions as string literals or as
 * property NAMES — a map keyed by symbol is as much a symbol population as an
 * array of them, and `headlineNewsSymbols` is exactly that shape.
 */
function symbolsIn(node: ts.Node, known: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  const visit = (child: ts.Node) => {
    if (ts.isStringLiteralLike(child) && known.has(child.text)) {
      found.add(child.text);
    } else if (
      (ts.isPropertyAssignment(child) ||
        ts.isPropertySignature(child)) &&
      ts.isIdentifier(child.name) && known.has(child.name.text)
    ) {
      found.add(child.name.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return [...found].sort();
}

export function censusSymbolDeclarations(
  known: ReadonlySet<string>,
  roots: string[] = SOURCE_ROOTS,
): SymbolDeclaration[] {
  const out: SymbolDeclaration[] = [];
  for (const file of roots.flatMap(walk)) {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.ESNext,
      true,
    );
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name)) {
          continue;
        }
        const symbols = symbolsIn(declaration.initializer, known);
        if (symbols.length < CENSUS_MIN_SYMBOLS) continue;
        // Read from the STATEMENT, so a marker must sit on the declaration
        // and cannot be satisfied by a comment elsewhere in the file.
        const ranges = ts.getLeadingCommentRanges(text, statement.pos) ?? [];
        out.push({
          file,
          leadingComments: ranges
            .map((range) => text.slice(range.pos, range.end))
            .join("\n"),
          line: source.getLineAndCharacterOfPosition(statement.getStart(source))
            .line + 1,
          name: declaration.name.text,
          symbols,
        });
      }
    }
  }
  return out.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)
  );
}

export type SymbolMarker =
  /** Equals a named roster derivation, exactly. */
  | { kind: "derived"; expression: string }
  /** A subset of a named population, with its coverage pinned. */
  | { kind: "external"; source: string; covered: number; total: number; versus: string }
  /** A frozen record of something that happened; its size is pinned. */
  | { kind: "record"; what: string; size: number };

/**
 * Parse a `// SYMBOLS:` marker off a declaration's leading comments.
 *
 *   // SYMBOLS: derived forexClass
 *   // SYMBOLS: external E8 crypto book | 32 of 33 vs crypto
 *   // SYMBOLS: record the 2026-08-10 sizing sweep | 10
 *
 * The external form pins the RELATIONSHIP rather than the membership: the
 * test recomputes the population and requires the stated total to match. That
 * is the whole trick — when the roster grows, the total grows, and the marker
 * fails on the GROWTH commit rather than five weeks later.
 *
 * WHAT IT DOES NOT ATTEST, said plainly because the source label invites the
 * opposite reading. `external CFTC reported contracts | 20 of 98 vs known`
 * proves three things: the list has 20 members, all 20 are in the population,
 * and the population currently holds 98. It proves NOTHING about the other
 * 78. A reader — or a later agent — must not take the label as evidence that
 * the CFTC does not report them, or that the broker does not offer them.
 *
 * That distinction is not academic. `DIRECT_CONTRACTS` maps 20 of 98 and at
 * least 15 of the unmapped are CFTC-reported instruments as domain fact,
 * including ZFUSD and ZTUSD while their curve siblings ZBUSD and ZNUSD are
 * mapped. Marking it `external` records where coverage stands; it must not
 * convert a known-partial capture into an attested absence.
 *
 * So a source label states WHERE THE LIST CAME FROM, never why the remainder
 * is absent. Where the capture is known to be incomplete, the label says so —
 * "mapped so far", not "the reported contracts".
 *
 * The record form pins the size instead, because a record of what happened
 * must NOT track the roster: widening it asserts a measurement nobody took.
 * Pinning it is what protects it from a later agent helpfully aligning it.
 */
export function parseSymbolMarker(comments: string): SymbolMarker | null {
  const line = comments.split("\n").map((entry) =>
    entry.replace(/^\s*(\/\/|\/\*+|\*+\/?)\s?/, "").trim()
  ).find((entry) => entry.startsWith("SYMBOLS:"));
  if (!line) return null;
  const body = line.slice("SYMBOLS:".length).trim();

  const derived = body.match(/^derived\s+(\S+)$/);
  if (derived) return { expression: derived[1], kind: "derived" };

  const external = body.match(
    /^external\s+(.+?)\s*\|\s*(\d+)\s+of\s+(\d+)\s+vs\s+(\S+)$/,
  );
  if (external) {
    return {
      covered: Number(external[2]),
      kind: "external",
      source: external[1].trim(),
      total: Number(external[3]),
      versus: external[4],
    };
  }

  const record = body.match(/^record\s+(.+?)\s*\|\s*(\d+)$/);
  if (record) {
    return { kind: "record", size: Number(record[2]), what: record[1].trim() };
  }

  throw new Error(`unrecognised SYMBOLS marker: ${body}`);
}
