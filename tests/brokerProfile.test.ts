import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  NO_BROKER_SELECTION,
  brokerSelectionProblem,
  buildDefaultProfile,
  coerceBrokerSelection,
  type BrokerSelection,
} from "../src/lib/profile.ts";
import { PROGRAM_LINE_IDS } from "../src/lib/broker/programs.ts";

// Spec §19g. The migration lands once, in wave 1, carrying every column both
// sections need. What CI can check is that the file and the baseline schema agree
// and that the write path refuses what the columns would refuse; the deployed
// schema is verified live, against the real database, before ship.

const MIGRATION = "supabase/migrations/20260803000000_broker_program_profile.sql";
const migration = readFileSync(MIGRATION, "utf8");
const initSql = readFileSync("supabase/init.sql", "utf8");

const COLUMNS = [
  "broker_id text",
  "broker_program_line text",
  "broker_account_size numeric(14,2)",
  "broker_stage text",
  "broker_risk_percent numeric(4,2)",
  "broker_drawdown_tier text",
];

const CONSTRAINTS = [
  "profiles_broker_id_valid",
  "profiles_broker_program_line_valid",
  "profiles_broker_stage_valid",
  "profiles_broker_account_size_positive",
  "profiles_broker_risk_percent_range",
  "profiles_broker_selection_coherent",
];

describe("§19g — the migration and the baseline schema agree", () => {
  it("adds all six columns, every one of them nullable with a null default", () => {
    for (const column of COLUMNS) {
      assert.ok(
        migration.includes(`add column if not exists ${column}`),
        `${column} missing from the migration`,
      );
      assert.ok(initSql.includes(column), `${column} missing from init.sql`);
    }
    // A no-op for every existing profile: no NOT NULL, no DEFAULT, no backfill.
    const columnBlock = migration.match(/add column if not exists[\s\S]*?;/)![0];
    assert.doesNotMatch(columnBlock, /\bnot null\b/i);
    assert.doesNotMatch(columnBlock, /\bdefault\b/i);
    assert.doesNotMatch(migration, /\bupdate\s+public\.profiles\b/i);
  });

  it("carries all six constraints in both places", () => {
    for (const constraint of CONSTRAINTS) {
      assert.ok(migration.includes(constraint), `${constraint} missing from migration`);
      assert.ok(initSql.includes(constraint), `${constraint} missing from init.sql`);
    }
  });

  it("names every shipped program line in the column domain, and nothing else", () => {
    const domain = migration.match(
      /add constraint profiles_broker_program_line_valid[\s\S]*?\)\)/,
    )![0];
    for (const line of PROGRAM_LINE_IDS) {
      assert.ok(domain.includes(`'${line}'`), `${line} missing from the domain`);
    }
    assert.equal((domain.match(/'/g) ?? []).length / 2, PROGRAM_LINE_IDS.length);
    for (const rejected of ["classic", "track"]) {
      assert.ok(!domain.includes(`'${rejected}'`), `${rejected} must not be a domain value`);
    }
  });

  it("exempts the drawdown tier from the coherence constraint's non-null half", () => {
    const coherent = migration.match(
      /add constraint profiles_broker_selection_coherent[\s\S]*?\n    \);/,
    )![0];
    // Both halves name the tier on the all-null side; only the all-null side does.
    const halves = coherent.split("or (broker_id is not null");
    assert.ok(halves[0].includes("broker_drawdown_tier is null"));
    assert.ok(!halves[1].includes("broker_drawdown_tier"));
  });

  it("leaves the ladders and the tier lists to the data module, not to SQL", () => {
    // Duplicating them in check constraints would let them drift from the module
    // CI pins.
    assert.doesNotMatch(migration, /5000|150000|500000/);
    assert.doesNotMatch(migration, /'3-4'|'2\.5-8'/);
  });
});

describe("§19g — the write path rejects what it cannot size", () => {
  const valid: BrokerSelection = {
    brokerAccountSize: 100_000,
    brokerDrawdownTier: "4-6",
    brokerId: "e8",
    brokerProgramLine: "one",
    brokerRiskPercent: 0.5,
    brokerStage: "challenge",
  };

  it("defaults a fresh profile to None — six nulls, no stored selection", () => {
    const profile = buildDefaultProfile("id", "reader@example.com");
    assert.equal(profile.brokerId, null);
    assert.equal(profile.brokerProgramLine, null);
    assert.equal(profile.brokerAccountSize, null);
    assert.equal(profile.brokerStage, null);
    assert.equal(profile.brokerRiskPercent, null);
    assert.equal(profile.brokerDrawdownTier, null);
    assert.equal(brokerSelectionProblem(profile), null);
  });

  it("accepts a program the user could have bought", () => {
    assert.equal(brokerSelectionProblem(valid), null);
    assert.equal(
      brokerSelectionProblem({
        ...valid,
        brokerProgramLine: "signature_futures",
        brokerAccountSize: 150_000,
        brokerDrawdownTier: null,
      }),
      null,
    );
  });

  it("rejects an off-ladder account size rather than accepting and ignoring it", () => {
    // $150,000 is Pro's tier and not E8 One's.
    const problem = brokerSelectionProblem({ ...valid, brokerAccountSize: 150_000 });
    assert.match(problem ?? "", /not on one's ladder/);
    assert.equal(
      brokerSelectionProblem({
        ...valid,
        brokerProgramLine: "pro_forex",
        brokerAccountSize: 150_000,
        brokerDrawdownTier: "2.5-8",
      }),
      null,
    );
  });

  it("rejects an off-domain drawdown tier, and any tier at all on a preset line", () => {
    assert.match(
      brokerSelectionProblem({ ...valid, brokerDrawdownTier: "2.5-8" }) ?? "",
      /not one of one's/,
    );
    assert.match(
      brokerSelectionProblem({
        ...valid,
        brokerProgramLine: "zero",
        brokerAccountSize: 50_000,
        brokerDrawdownTier: "3-4",
      }) ?? "",
      /no drawdown tier to select/,
    );
    // And requires one on a customizable line.
    assert.match(
      brokerSelectionProblem({ ...valid, brokerDrawdownTier: null }) ?? "",
      /not one of one's/,
    );
  });

  it("rejects a partial write — the coherence constraint, in TypeScript", () => {
    assert.match(
      brokerSelectionProblem({ ...valid, brokerStage: null }) ?? "",
      /is neither challenge nor performance/,
    );
    assert.match(
      brokerSelectionProblem({ ...NO_BROKER_SELECTION, brokerProgramLine: "one" }) ?? "",
      /is not E8/,
    );
  });

  it("rejects a risk percent off the published band", () => {
    for (const risk of [0, 0.05, 0.07, 1.55, 2]) {
      assert.ok(
        brokerSelectionProblem({ ...valid, brokerRiskPercent: risk }),
        `${risk} must be refused`,
      );
    }
    for (const risk of [0.1, 0.5, 1.5]) {
      assert.equal(brokerSelectionProblem({ ...valid, brokerRiskPercent: risk }), null);
    }
  });

  it("falls back to None on load rather than rendering a selection it cannot size", () => {
    const coerced = coerceBrokerSelection({ ...valid, brokerAccountSize: 42 });
    assert.ok(coerced.problem);
    assert.deepEqual(coerced.selection, NO_BROKER_SELECTION);
    assert.deepEqual(coerceBrokerSelection(valid).selection, valid);
  });
});

describe("§19g — every save carries the selection", () => {
  const hook = readFileSync("src/hooks/useUserProfile.ts", "utf8");
  const panel = readFileSync("src/components/workspace/ProfilePanel.tsx", "utf8");

  it("selects and upserts all six columns", () => {
    for (const column of [
      "broker_id",
      "broker_program_line",
      "broker_account_size",
      "broker_stage",
      "broker_risk_percent",
      "broker_drawdown_tier",
    ]) {
      assert.ok(hook.includes(column), `${column} missing from the hook`);
    }
    assert.match(hook, /broker_account_size: nextProfile\.brokerAccountSize/);
  });

  it("throws on a rejected selection instead of writing part of it", () => {
    assert.match(
      hook,
      /const problem = brokerSelectionProblem\(nextProfile\);\s*if \(problem\) \{\s*throw new Error\(/,
    );
  });

  it("logs a coerced load rather than swallowing it", () => {
    assert.match(hook, /console\.error\("\[profile\] broker selection ignored", problem\)/);
  });

  it("rides the selection along on a theme-only save", () => {
    assert.match(panel, /\.\.\.brokerSelectionOf\(profile\),\s*defaultTimeframe:/);
  });

  it("carries the saved-accounts pair along on a theme-only save too (§19 retrofit)", () => {
    // The multi-account sibling of "rides the selection along" above:
    // nextProfile is rebuilt from buildDefaultProfile + input on every save,
    // and input (SaveProfileInput) never carries brokerAccounts or
    // activeBrokerAccountId — this path doesn't write either one to
    // broker_accounts. Without an explicit carry-forward from the hook's own
    // current profile state, a theme- or timezone-only save would silently
    // wipe a loaded profile's accounts and active pointer from client state.
    // §19g: a save path must never wipe a sibling field it wasn't asked to
    // change.
    assert.match(hook, /activeBrokerAccountId: profile\?\.activeBrokerAccountId \?\? null/);
    assert.match(hook, /brokerAccounts: profile\?\.brokerAccounts \?\? \[\]/);
  });
});

describe("§19 retrofit — activateBrokerAccount verifies ownership before writing (Task 2b)", () => {
  // Task 2b (controller-authored insertion, adjudication 3): the FK on
  // active_broker_account_id proves the target row EXISTS, not that it
  // belongs to the caller — Postgres FK checks are not RLS-filtered. RLS
  // already makes a foreign row unresolvable through every read path, so
  // this pins the write-side close: the hook must consult its own
  // RLS-scoped, already-validated profile.brokerAccounts before it ever
  // writes the pointer, and refuse — loudly — an id that is not a member.
  const hook = readFileSync("src/hooks/useUserProfile.ts", "utf8");
  const activateFn = hook.slice(
    hook.indexOf("const activateBrokerAccount = useCallback("),
    hook.indexOf("const removeBrokerAccount = useCallback("),
  );

  it("consults the caller's own saved accounts before writing the pointer", () => {
    assert.ok(activateFn.length > 0, "expected to find activateBrokerAccount");
    assert.match(activateFn, /profile\?\.brokerAccounts\.some\(/);
  });

  it("throws on a foreign id, and the ownership check precedes the write", () => {
    const throwIndex = activateFn.search(/throw new Error\(/);
    const writeIndex = activateFn.indexOf(
      ".update({ active_broker_account_id: id })",
    );
    assert.ok(throwIndex >= 0, "expected a thrown Error on the ownership-miss path");
    assert.ok(writeIndex >= 0, "expected the pointer write");
    assert.ok(throwIndex < writeIndex, "the ownership check must precede the write");
  });
});

const ACCOUNTS_MIGRATION = readFileSync(
  "supabase/migrations/20260803010000_broker_accounts.sql",
  "utf8",
);
const INIT_SQL = readFileSync("supabase/init.sql", "utf8");

describe("§19 retrofit — the multi-account schema (amendment 14)", () => {
  const ACCOUNT_COLUMNS = [
    "user_id",
    "broker_id",
    "classification",
    "platform",
    "program_line",
    "account_size",
    "stage",
    "risk_percent",
    "drawdown_tier",
  ];

  it("declares broker_accounts in the migration and in init.sql alike", () => {
    for (const source of [ACCOUNTS_MIGRATION, INIT_SQL]) {
      assert.match(source, /create table if not exists public\.broker_accounts/);
      for (const column of ACCOUNT_COLUMNS) {
        assert.match(source, new RegExp(`\\b${column}\\b`));
      }
    }
  });

  it("carries the active pointer on profiles in both files", () => {
    assert.match(
      ACCOUNTS_MIGRATION,
      /add column if not exists active_broker_account_id uuid/,
    );
    assert.match(INIT_SQL, /active_broker_account_id uuid/);
  });

  // Amendment 14 + the plan's no-deletion rule: the retrofit replaces the shape
  // above the schema, never the data underneath it. The six single-selection
  // columns and their constraints stay exactly as PR #159 left them.
  it("deletes no column and no constraint from profiles", () => {
    assert.doesNotMatch(ACCOUNTS_MIGRATION, /drop column/i);
    assert.doesNotMatch(ACCOUNTS_MIGRATION, /alter table public\.profiles[\s\S]*?drop constraint profiles_broker_/);
    for (const column of [
      "broker_id",
      "broker_program_line",
      "broker_account_size",
      "broker_stage",
      "broker_risk_percent",
      "broker_drawdown_tier",
    ]) {
      assert.match(INIT_SQL, new RegExp(`\\b${column}\\b`));
    }
  });

  it("seeds one account from every existing complete selection", () => {
    assert.match(ACCOUNTS_MIGRATION, /insert into public\.broker_accounts/);
    assert.match(ACCOUNTS_MIGRATION, /from public\.profiles p/);
    assert.match(ACCOUNTS_MIGRATION, /where p\.broker_id is not null/);
    assert.match(
      ACCOUNTS_MIGRATION,
      /update public\.profiles p[\s\S]*set active_broker_account_id = a\.id/,
    );
  });

  it("constrains the three new domains", () => {
    assert.match(
      ACCOUNTS_MIGRATION,
      /broker_accounts_classification_valid[\s\S]*?'forex', 'crypto', 'futures'/,
    );
    assert.match(
      ACCOUNTS_MIGRATION,
      /broker_accounts_platform_valid[\s\S]*?'tradelocker', 'matchtrader', 'tradovate'/,
    );
    assert.match(
      ACCOUNTS_MIGRATION,
      /broker_accounts_program_line_valid[\s\S]*?'zero_futures_max'/,
    );
  });

  it("scopes broker_accounts to its owner under RLS, to authenticated only", () => {
    assert.match(ACCOUNTS_MIGRATION, /alter table public\.broker_accounts enable row level security/);
    for (const verb of ["select", "insert", "update", "delete"]) {
      assert.match(
        ACCOUNTS_MIGRATION,
        new RegExp(`for ${verb}\\s+to authenticated`),
      );
    }
    assert.match(ACCOUNTS_MIGRATION, /\(select auth\.uid\(\)\) = user_id/);
  });
});

// `buildDefaultProfile` is already imported at the top of this file (from
// "../src/lib/profile.ts"); repeating it here would be a duplicate identifier
// under this project's strict TS config, so this second import carries only
// the names not already in scope.
import {
  activeAccountOf,
  brokerAccountProblem,
  type BrokerAccount,
  type BrokerAccountDraft,
} from "../src/lib/profile";

const PRO_FOREX: BrokerAccountDraft = {
  accountSize: 100_000,
  brokerId: "e8",
  classification: "forex",
  drawdownTier: "2.5-8",
  platform: "tradelocker",
  programLine: "pro_forex",
  riskPercent: 0.5,
  stage: "performance",
};

describe("§19 retrofit — brokerAccountProblem rejects what the checkout does not sell", () => {
  it("accepts a real E8 Pro Forex account", () => {
    assert.equal(brokerAccountProblem(PRO_FOREX), null);
  });

  it("rejects an off-ladder size", () => {
    assert.match(
      brokerAccountProblem({ ...PRO_FOREX, accountSize: 123_000 }) ?? "",
      /account size 123000 is not on pro_forex's ladder/,
    );
  });

  it("rejects a classification the program line does not belong to", () => {
    assert.match(
      brokerAccountProblem({ ...PRO_FOREX, classification: "futures" }) ?? "",
      /pro_forex is not sold on the futures market/,
    );
  });

  it("rejects a platform the catalog does not offer on that line", () => {
    assert.match(
      brokerAccountProblem({ ...PRO_FOREX, platform: "matchtrader" }) ?? "",
      /pro_forex does not offer matchtrader/,
    );
  });

  it("rejects a drawdown tier on a preset line and a null one on a customizable line", () => {
    assert.match(
      brokerAccountProblem({
        ...PRO_FOREX,
        classification: "futures",
        platform: "tradovate",
        programLine: "signature_futures",
        accountSize: 100_000,
      }) ?? "",
      /signature_futures has no drawdown tier to select/,
    );
    assert.match(
      brokerAccountProblem({ ...PRO_FOREX, drawdownTier: null }) ?? "",
      /pro_forex requires a drawdown tier/,
    );
  });

  // Amendment 19 (owner, 2026-08-03): `zero` is unsold — on no checkout walk
  // — so a draft naming it must be rejected regardless of how internally
  // consistent its other fields are. Before this fix, every other check on
  // this draft passes: classificationOf("zero") is "forex" (matching the
  // draft's own claim), platformsFor("zero") includes "tradelocker", and
  // 50,000 is on zero's ladder — nothing else in brokerAccountProblem
  // catches it.
  it("rejects `zero` even with an internally consistent draft — it is unsold", () => {
    assert.match(
      brokerAccountProblem({
        accountSize: 50_000,
        brokerId: "e8",
        classification: "forex",
        drawdownTier: null,
        platform: "tradelocker",
        programLine: "zero",
        riskPercent: 0.5,
        stage: "challenge",
      }) ?? "",
      /zero is not sold on any checkout walk/,
    );
  });

  // The fix must key off catalog membership (programLinesFor), never off the
  // literal string "zero" — zero_futures_starter and zero_futures_max carry
  // the same name prefix and are genuinely sold on the Futures walk.
  it("still accepts zero_futures_starter — a different, actually-sold line", () => {
    assert.equal(
      brokerAccountProblem({
        accountSize: 50_000,
        brokerId: "e8",
        classification: "futures",
        drawdownTier: null,
        platform: "tradovate",
        programLine: "zero_futures_starter",
        riskPercent: 0.5,
        stage: "challenge",
      }),
      null,
    );
  });

  it("resolves the active account by the pointer, and null when it dangles", () => {
    const saved: BrokerAccount = { ...PRO_FOREX, id: "acc-1" };
    const profile = {
      ...buildDefaultProfile("user-1", "a@b.c"),
      activeBrokerAccountId: "acc-1",
      brokerAccounts: [saved],
    };
    assert.deepEqual(activeAccountOf(profile), saved);
    assert.equal(
      activeAccountOf({ ...profile, activeBrokerAccountId: "acc-missing" }),
      null,
    );
    assert.equal(activeAccountOf({ ...profile, brokerAccounts: [] }), null);
  });

  it("defaults a fresh profile to no accounts and no active pointer", () => {
    const fresh = buildDefaultProfile("user-1", "a@b.c");
    assert.deepEqual(fresh.brokerAccounts, []);
    assert.equal(fresh.activeBrokerAccountId, null);
  });
});
