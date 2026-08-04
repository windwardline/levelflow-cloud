import type { ReactNode } from "react";
import { useState } from "react";
import { useIsMobileViewport } from "../../hooks/useMobileViewport";
import {
  CLASSIFICATIONS,
  PLATFORM_LABELS,
  isPlatformVerified,
  isProgramLineVerified,
  platformsFor,
  programLinesFor,
} from "../../lib/broker/catalog";
import {
  RISK_PERCENT_DEFAULT,
  RISK_PERCENT_OPTIONS,
  STAGE_OPTIONS,
  formatAccountSize,
  formatDrawdownTier,
  formatRiskPercent,
  getProgramLine,
  type ProgramLineSpec,
} from "../../lib/broker/programs";
import type {
  BrokerAccountDraft,
  BrokerClassification,
  BrokerPlatform,
  BrokerSelection,
  ThemeMode,
  UserProfile,
} from "../../lib/profile";
import {
  MOBILE_FRAME,
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../mobileFrame";
import { BrokerChip } from "./BrokerChip";
import { ThemeToggle } from "./ThemeToggle";

// Spec §11: Profile collapses to one settings surface — since §17i, Account,
// Broker and Appearance — dropping the old Preferences form (display name /
// timezone / preferred session / default chart view) and the read-only Market
// clock / Activity / Review activity cards entirely. Spec §10b retires the
// session-clock concept those fields fed, and Task 8 moved every analytics view
// (win rate, per-market history) into Insights, so nothing here is a silent
// removal of the only place that data lived. The underlying profile record
// (useUserProfile/profile.ts) is untouched — this is composition, not a data
// change: existing stored values for the now-unexposed fields (displayName
// included) keep working wherever they're still read, they simply have no
// editing UI left to change them going forward.
//
// Spec §17c rejected the card stack this used to be ("stacked like a mobile
// view" at desktop widths) and §17e approved p-profile-v2.html as the
// composition authority: a flat editorial settings sheet, 880px,
// hairline-separated rows, each a label column beside its own content, no card
// chrome anywhere and no icons. The 880 is real as of 2026-08-03 — it had been
// declared and not reached since the sheet was built, capped at a width the
// content region never granted (see the column's own comment below).
//
// The shared page footer (spec §17c) carries the
// legal and production lines this column used to end with — and, since §17i, the
// two links the mock's fourth row carried as well, which is why that row is gone
// and the sheet is three: the footer is in the frame on every surface, so a
// Support row here was a second home for links already on screen.
type ProfilePanelProps = {
  memberSince: string;
  onActivateAccount: (id: string) => void;
  onRemoveAccount: (id: string) => void;
  onSave: (
    input: Pick<
      UserProfile,
      | "defaultTimeframe"
      | "defaultTimezone"
      | "displayName"
      | "preferredSession"
      | "themePreference"
    > & BrokerSelection,
  ) => Promise<void>;
  onSaveAccount: (draft: BrokerAccountDraft) => void;
  onSignOut: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  profile: UserProfile;
  themeMode: ThemeMode;
};

export function ProfilePanel({
  memberSince,
  onActivateAccount,
  onRemoveAccount,
  onSave,
  onSaveAccount,
  onSignOut,
  onThemeChange,
  profile,
  themeMode,
}: ProfilePanelProps) {
  // The retired Preferences form surfaced a save failure inline, not just to
  // the console (fix round 1). Logging this one to the console alone would be
  // the same silent failure that form never had. §17c takes the box off the
  // notice, not the notice off the surface.
  const [themeSaveFailed, setThemeSaveFailed] = useState(false);

  // Appearance is the only remaining write path in this panel, and it has no
  // Save button of its own (spec §2 copy discipline: no process narration) —
  // picking a theme both applies it live (App.tsx's existing onThemeChange) and
  // persists it immediately, reusing useUserProfile.saveProfile exactly as the
  // old Preferences form did, just from a different trigger. The other four
  // saved fields ride along unchanged so a theme-only save can never reset
  // them — the broker program selection (spec §19g) included.
  function handleThemeChange(mode: ThemeMode) {
    onThemeChange(mode);
    setThemeSaveFailed(false);
    onSave({
      ...brokerSelectionOf(profile),
      defaultTimeframe: profile.defaultTimeframe,
      defaultTimezone: profile.defaultTimezone,
      displayName: profile.displayName,
      preferredSession: profile.preferredSession,
      themePreference: mode,
    }).catch((error) => {
      console.error("[profile] theme save failed", error);
      setThemeSaveFailed(true);
    });
  }

  // Which composition this surface is (spec §17g): below lg a fixed-viewport
  // frame with the title pinned and the rows scrolling inside it, at ≥lg the flat
  // 880px editorial sheet p-profile-v2.html draws. The title and the rows are built
  // once and placed by whichever branch renders. Below lg nothing about this
  // changed when the ≥lg sheet finally reached its 880px (2026-08-03): the mobile
  // branch is the shared §17g frame and owns no width of its own.
  const isMobile = useIsMobileViewport();

  // `.page h1` (p-profile-v2.html:17): the 2px ink rule under the title, the
  // same one Insights, Guide and Donate carry, with no gap under it — the first
  // row's own 26px top padding is the spacing.
  // §17n: 19px on a 24px line with an 8px rule pad below lg — the mobile page head
  // the four titled surfaces share — takes this pinned block from 60px to 46px
  // (measured against the built CSS at 375x812).
  const title = (
    <h1 className="border-b-2 border-ink pb-3.5 text-2xl font-semibold tracking-normal text-ink max-lg:pb-2 max-lg:text-[19px] max-lg:leading-6">
      Profile
    </h1>
  );

  const rows = (
    <>
      <ProfileRow
        description="Sign-in and membership."
        title="Account"
      >
        <ProfileDetailRow label="Email" value={profile.email} />
        <ProfileDetailRow
          label="Member since"
          value={formatMemberSince(memberSince)}
        />
        {/* `.ghost.signout` (:26). The masthead's own Sign out is the same
            control at the same weight; this is the one the mock puts here, for
            a reader who came to Profile to leave. */}
        <button
          className="secondary-button mt-2.5 px-3.5 py-2 text-[13px]"
          type="button"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </ProfileRow>

      {/* §19 retrofit (amendment 14, 18): the confirmed-accounts list and its
          catalog walk live inside this existing row, beneath the chip, as
          ProfileDetailRow-shaped label/control pairs. No card, no new
          chrome, no second Broker section — and the row's approved description is
          unchanged, because it already says what the row cannot show and the
          list and the walk below it are self-evident. */}
      <ProfileRow
        description="Markets, costs, and record follow the broker."
        title="Broker"
      >
        <BrokerChip />
        <BrokerAccountsSection
          onActivateAccount={onActivateAccount}
          onRemoveAccount={onRemoveAccount}
          onSaveAccount={onSaveAccount}
          profile={profile}
        />
      </ProfileRow>

      <ProfileRow
        description="Saved to your account."
        title="Appearance"
      >
        <ThemeToggle mode={themeMode} onChange={handleThemeChange} />
        {themeSaveFailed
          ? (
            <p className="mt-2.5 text-sm font-semibold text-sell">
              Appearance could not be saved. Try again after the connection
              refreshes.
            </p>
          )
          : null}
      </ProfileRow>
    </>
  );

  if (isMobile) {
    // Spec §17g: "Profile: fits the frame; if content ever exceeds it, the rows
    // region scrolls internally." With four rows it exceeded it — 722px against
    // 683px of frame. §17i deleted the Support row and brought it back inside.
    //
    // Re-measured for §17n against the built CSS with the shipped fonts at
    // 375x812, because two things had moved since: §19b added the Broker row's
    // Program control, and the frame's own numbers changed. Before this wave the
    // three rows and the colophon came to 667px inside a 683px region — the
    // content fitted, but the 96px tab-bar reserve took the region's scrollHeight
    // to 763px, so it scrolled 80px of its own padding. After it: 595px of content
    // and a 56px reserve inside a 705px region, and the region does not scroll at
    // all. That is the state §17g describes first, reached by measurement rather
    // than by assertion.
    //
    // The region keeps its shared frame string regardless — it is the one every
    // <lg surface takes — so a row that grows later (the theme-save notice below,
    // or a program selection's four extra controls) finds the clause already in
    // place and scrolls instead of overflowing.
    //
    // And the footer, reduced to its colophon: "The footer exists on mobile ONLY
    // inside the Profile view." It ends the sheet rather than pinning to the
    // frame, because what §17g kept is the line, not a footer — and .colophon's
    // own 2rem top pad is the separation, the same treatment the ≥lg footer and
    // the pre-auth screens give it.
    return (
      <div className={MOBILE_FRAME} data-testid="profile-panel">
        <div className={MOBILE_FRAME_PINNED}>{title}</div>
        <div className={MOBILE_FRAME_SCROLL} data-testid="mobile-profile-scroll">
          {rows}
          {/* Spec §17k: the same link, the same treatment as the ≥lg footer's —
              muted at rest, underlined only on hover or focus, 44px, new tab.

              §17n takes 12px of the line's own 32px top pad below lg: measured,
              the paragraph is 59.5px of which 32px is air above a 19.5px line.
              20px still separates the colophon from the last row, and the 44px
              reach is untouched — it comes from .colophon-link's ::after overlay,
              which sits outside layout entirely (§17k), so tightening the pad
              cannot shrink the target. */}
          <p className="colophon max-lg:pt-5">
            <a
              className="colophon-link"
              href="https://windwardline.com"
              rel="noopener noreferrer"
              target="_blank"
            >
              A Windward Line production
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    // Spec §17c gave every scrolling surface the one shared page footer, this one
    // included, which retired the legal/production block spec §11 put at the foot
    // of this column: it would be a second copy of what the footer carries. §17i
    // finished the thought — the sheet's own Help and Donate were a second copy
    // too, of a link row now permanently on screen below it, so the row that held
    // them is gone. The testid is what e2e locates this sheet by.
    <div
      // p-profile-v2.html's 880px, claimed rather than capped. The ≥lg content
      // region is mx-auto inside a grid row, so its used width is fit-content: it
      // takes the width of what it holds. A percentage width under a max-width cap
      // therefore asked the region how wide to be while the region asked back, and
      // the pair settled on max-content — 514px measured at 1280 AND at 1440, while
      // the cap computed to 880px the whole time. A definite width is what a
      // fit-content parent can size to, and a max-width of 100% keeps it inside the
      // region on a viewport narrower than 944px. The §17o wave met the same
      // mechanism on the document surface (LegalDocumentPanel.tsx) and fixed it
      // there first.
      //
      // The retired pair is named by shape rather than spelled out — the habit
      // App.tsx's mainShellClassName documents, since Tailwind's scanner reads
      // comments too and a dead class in one is a dead rule in the bundle. It is
      // also what lets tests/profilePanel.test.tsx ban that pair by name.
      className="mx-auto w-[880px] max-w-full"
      data-testid="profile-panel"
    >
      {title}
      {rows}
    </div>
  );
}

// `.row` + `.lab` (p-profile-v2.html:18-21): one hairline-separated row, the
// label column beside its content at ≥lg and stacked below it under lg, at the
// mock's 220px measure, 24px column gap and 26px block padding. The last row
// drops its rule (`.row:last-of-type`) so the sheet ends on content, not on a
// line.
//
// last-of-type, not Tailwind's `last:` (Q1-I7): the mobile branch's scroll region
// ends on the colophon <p>, so `:last-child` matched that paragraph and left the
// Appearance row wearing a hairline above it — on mobile only, and invisibly to a
// guard that reads the class out of the source rather than running the selector.
// The rows are the only <div>s among their siblings in either branch, so the
// mock's own `:last-of-type` is right in both.
//
// One component for every row: padding, separation and column measure are
// the composition, so they cannot be allowed to drift row by row. The stacked
// row gap is 12px rather than the mock's 24px — with the label above its
// content instead of beside it, the mock's horizontal measure would read as a
// break in the row.
//
// §17n: below lg the block padding is 16px rather than the mock's 26px. Measured
// against the built CSS at 375x812, the three rows spent 156px on padding alone
// and the sheet came to 763px inside a 683px region — it overflowed its own frame
// once the broker program controls render, which is the condition §17g calls the
// exception rather than the rule. 16px takes 60px back, the surface fits again,
// and the rows' own content — the settings this surface exists to deliver — is
// untouched: it is the air around them that yielded.
function ProfileRow({
  children,
  description,
  title,
}: {
  children: ReactNode;
  // What the row cannot show (§17e's standing description rule). Owner-approved
  // verbatim, per row; tests/profilePanel.test.tsx pins them all.
  description: string;
  title: string;
}) {
  return (
    <div className="grid gap-x-6 gap-y-3 border-b border-hairline py-[26px] last-of-type:border-b-0 max-lg:py-4 lg:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-[15px] font-bold tracking-normal text-ink">
          {title}
        </h2>
        <p className="mt-1 text-[12.5px] leading-normal text-ink-muted">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// `.kv` (p-profile-v2.html:22-24): a bare baseline-aligned line, padded on the
// block axis only, capped at the mock's 520px so a long email does not run the
// full width of the content column.
function ProfileDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 max-w-[520px] items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0 text-[12.5px] text-ink-muted">{label}</span>
      <span className="min-w-0 text-right font-semibold text-ink">
        {value}
      </span>
    </div>
  );
}

// §19 retrofit (amendment 14, 18): the Broker row now shows the confirmed
// accounts a profile has already saved, one of them active, above the
// seven-select catalog walk that builds the next one. The walk is never
// dormant the way the retired single-selection controls above it were — a
// draft always names a complete, sellable account from first render, because
// BrokerAccountDraft (unlike BrokerSelection) has no field that means "no
// selection yet." Market comes first because it is the catalog's own first
// fork (§20i ruling 7): choosing it decides which Program options exist at
// all, and Program does the same for Platform.
//
// The pairs take ProfileDetailRow's own measure — label left, control right, the
// mock's 520px cap — so the Broker row's rhythm is the sheet's rhythm and not a
// second layout. `.field` is the app's established select treatment
// (styles/index.css); a bordered control is an affordance, which is the one thing
// §17c's box discipline keeps.

// The owner's caps ruling (2026-08-03): every SELECTABLE option in these
// dropdowns renders ALL CAPS — and only the options; the field labels above
// stay as they are. At render rather than CSS, because Safari's native
// dropdown menus ignore text-transform on <option>; the stored catalog
// strings are untouched underneath, so §20j's source pins hold byte-intact.
// The closed select needs nothing extra — it displays the option text,
// which arrives already capped.
const optionCaps = (label: string) => label.toUpperCase();

// The reset every market or program change applies: platform, account size
// and drawdown tier are priced per program line, so a change resets all
// three to the new line's own first option — the same "reset to index 0"
// rule the retired single-selection walk used. Risk per trade and stage are
// not program parameters, so the caller carries them forward instead of
// resetting them here.
function draftForProgram(
  classification: BrokerClassification,
  next: ProgramLineSpec,
  riskPercent: number,
  stage: BrokerAccountDraft["stage"],
): BrokerAccountDraft {
  return {
    accountSize: next.accountSizes[0],
    brokerId: "e8",
    classification,
    drawdownTier: next.drawdownTiers?.[0] ?? null,
    platform: platformsFor(next.line)[0],
    programLine: next.line,
    riskPercent,
    stage,
  };
}

// The walk's own seed: the catalog's first market and that market's first
// program, challenge stage, the published default risk. There is no "None"
// to start from — every BrokerAccountDraft names a complete account.
function initialDraft(): BrokerAccountDraft {
  const classification = CLASSIFICATIONS[0].value;
  return draftForProgram(
    classification,
    programLinesFor(classification)[0],
    RISK_PERCENT_DEFAULT,
    "challenge",
  );
}

function BrokerAccountsSection({
  onActivateAccount,
  onRemoveAccount,
  onSaveAccount,
  profile,
}: {
  onActivateAccount: (id: string) => void;
  onRemoveAccount: (id: string) => void;
  onSaveAccount: (draft: BrokerAccountDraft) => void;
  profile: UserProfile;
}) {
  const [draft, setDraft] = useState<BrokerAccountDraft>(initialDraft);

  const programs = programLinesFor(draft.classification);
  const program = getProgramLine(draft.programLine)!;
  const platforms = platformsFor(draft.programLine);

  function selectMarket(value: string) {
    const classification = value as BrokerClassification;
    const next = programLinesFor(classification)[0];
    setDraft((prev) =>
      draftForProgram(classification, next, prev.riskPercent, prev.stage));
  }

  function selectProgramLine(value: string) {
    const next = getProgramLine(value);
    if (!next) {
      return;
    }
    setDraft((prev) =>
      draftForProgram(draft.classification, next, prev.riskPercent, prev.stage));
  }

  function update(patch: Partial<BrokerAccountDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  // §20j / task 7 (forward-registered here per this task's brief):
  // "Manage accounts" is the confirmed-accounts chip menu's own control,
  // not yet rendered by this section — pinning the string now means that
  // surface ships with it already reviewed rather than adding one later.
  return (
    <div className="mt-3 grid">
      {profile.brokerAccounts.length > 0
        ? (
          <div className="grid">
            {profile.brokerAccounts.map((account) => {
              const accountProgram = getProgramLine(account.programLine)!;
              const isActive = profile.activeBrokerAccountId === account.id;
              return (
                <div
                  key={account.id}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-1.5 text-left text-sm"
                >
                  {/* §17n fix round 1: min-h-11 on the row alone left this
                      button small and centered inside an inert 44px box — a
                      tap between the text and the row's edge hit nothing.
                      The floor belongs on the tappable element itself
                      (MarketScanRow's own idiom, MarketScanPanel.tsx): flex
                      + min-h-11 + items-center grows the button to the full
                      row height and centers its content in it, rather than
                      leaving the row to center a shorter box. */}
                  <button
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                    type="button"
                    aria-current={isActive}
                    onClick={() => onActivateAccount(account.id)}
                  >
                    <span className="min-w-0 truncate">
                      {`${accountProgram.label} · ${formatAccountSize(account.accountSize)}`}
                    </span>
                    {isActive
                      ? (
                        <span className="shrink-0 font-semibold text-accent">
                          {"Active"}
                        </span>
                      )
                      : null}
                  </button>
                  {/* Remove is short text inside a flex row, where
                      .tertiary-link's negative-margin trick would move the
                      row's own geometry (the same reason AppFooter's link
                      trio uses .legal-link instead, styles/index.css) — the
                      kit's absolutely-positioned overlay reaches 44px
                      without affecting layout at all. */}
                  <button
                    className="legal-link shrink-0 text-xs font-semibold text-ink-muted"
                    type="button"
                    onClick={() => onRemoveAccount(account.id)}
                  >
                    {"Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        )
        : null}

      <div className="mt-3 grid">
        <BrokerControlRow label="Market">
          <select
            aria-label="Market"
            className="field"
            onChange={(event) => selectMarket(event.target.value)}
            value={draft.classification}
          >
            {CLASSIFICATIONS.map((classification) => (
              <option key={classification.value} value={classification.value}>
                {optionCaps(classification.label)}
              </option>
            ))}
          </select>
        </BrokerControlRow>
        <BrokerControlRow label="Program">
          <select
            aria-label="Program"
            className="field"
            onChange={(event) => selectProgramLine(event.target.value)}
            value={draft.programLine}
          >
            {programs.map((line) => (
              <option
                disabled={!isProgramLineVerified(line.line)}
                key={line.line}
                value={line.line}
              >
                {optionCaps(line.label)}
              </option>
            ))}
          </select>
        </BrokerControlRow>
        {/* Amendment 12: Platform renders even where a line sells only one —
            a single-option select is not a form, it is the catalog stating
            the platform, so the field's presence never varies by line. */}
        <BrokerControlRow label="Platform">
          <select
            aria-label="Platform"
            className="field"
            onChange={(event) =>
              update({ platform: event.target.value as BrokerPlatform })}
            value={draft.platform}
          >
            {platforms.map((platform) => (
              <option
                disabled={!isPlatformVerified(platform)}
                key={platform}
                value={platform}
              >
                {optionCaps(PLATFORM_LABELS[platform])}
              </option>
            ))}
          </select>
        </BrokerControlRow>
        <BrokerControlRow label="Account size">
          <select
            aria-label="Account size"
            className="field"
            onChange={(event) =>
              update({ accountSize: Number(event.target.value) })}
            value={String(draft.accountSize)}
          >
            {program.accountSizes.map((size) => (
              <option key={size} value={size}>
                {optionCaps(formatAccountSize(size))}
              </option>
            ))}
          </select>
        </BrokerControlRow>
        <BrokerControlRow label="Stage">
          <select
            aria-label="Stage"
            className="field"
            onChange={(event) =>
              update({
                stage: event.target.value === "performance"
                  ? "performance"
                  : "challenge",
              })}
            value={draft.stage}
          >
            {STAGE_OPTIONS.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {optionCaps(stage.label)}
              </option>
            ))}
          </select>
        </BrokerControlRow>
        <BrokerControlRow label="Risk per trade">
          <select
            aria-label="Risk per trade"
            className="field"
            onChange={(event) =>
              update({ riskPercent: Number(event.target.value) })}
            value={String(draft.riskPercent)}
          >
            {RISK_PERCENT_OPTIONS.map((percent) => (
              <option key={percent} value={percent}>
                {optionCaps(formatRiskPercent(percent))}
              </option>
            ))}
          </select>
        </BrokerControlRow>
        {/* The purchased tier, on the four customizable lines only. The six
            preset lines publish their parameters per size, so there is nothing
            to ask and no control to draw. */}
        {program.drawdownTiers
          ? (
            <BrokerControlRow label="Drawdown">
              <select
                aria-label="Drawdown"
                className="field"
                onChange={(event) =>
                  update({ drawdownTier: event.target.value })}
                value={draft.drawdownTier ?? program.drawdownTiers[0]}
              >
                {program.drawdownTiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {optionCaps(formatDrawdownTier(tier))}
                  </option>
                ))}
              </select>
            </BrokerControlRow>
          )
          : null}
      </div>

      <div className="mt-3">
        <button
          className="secondary-button px-3.5 py-2 text-[13px]"
          type="button"
          onClick={() => onSaveAccount(draft)}
        >
          {"Add account"}
        </button>
      </div>
    </div>
  );
}

// A stacked field: the label on its own line, the control on the row's whole
// measure — keeping ProfileDetailRow's 520px cap and py-1.5 rhythm. This row
// first borrowed ProfileDetailRow's label-left shape with a fixed 220px
// control column, and the live content column — narrower than the cap by
// half — handed the label the leftovers: "Risk per trade" rendered three
// lines deep (owner, 2026-08-02). A 48px `.field` is not a short text value;
// the app's own shape for a labeled control is the stacked one (AuthScreen's
// email label above its field), and the broker rows take it at every width.
function BrokerControlRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid min-w-0 max-w-[520px] gap-1.5 py-1.5 text-sm">
      <span className="text-[12.5px] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

// The six broker columns, read off the profile so every save carries them
// whether or not it is the broker row doing the saving (§19g).
function brokerSelectionOf(profile: UserProfile): BrokerSelection {
  return {
    brokerAccountSize: profile.brokerAccountSize,
    brokerDrawdownTier: profile.brokerDrawdownTier,
    brokerId: profile.brokerId,
    brokerProgramLine: profile.brokerProgramLine,
    brokerRiskPercent: profile.brokerRiskPercent,
    brokerStage: profile.brokerStage,
  };
}

function formatMemberSince(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  // Q2-C1: pinned like every other date the app draws.
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}
