import type { ReactNode } from "react";
import { useState } from "react";
import type { ThemeMode, UserProfile } from "../../lib/profile";
import { BrokerChip } from "./BrokerChip";
import { ThemeToggle } from "./ThemeToggle";

// Spec §11: Profile collapses to one settings surface — Account, Broker,
// Appearance, Support — dropping the old Preferences form (display name /
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
// composition authority: a flat editorial settings sheet, 880px, four
// hairline-separated rows, each a label column beside its own content, no card
// chrome anywhere and no icons. The shared page footer (spec §17c) carries the
// legal and production lines this column used to end with.
type ProfilePanelProps = {
  memberSince: string;
  onOpenDonate: () => void;
  onSave: (
    input: Pick<
      UserProfile,
      | "defaultTimeframe"
      | "defaultTimezone"
      | "displayName"
      | "preferredSession"
      | "themePreference"
    >,
  ) => Promise<void>;
  onSignOut: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  profile: UserProfile;
  supportMailto: string;
  themeMode: ThemeMode;
};

export function ProfilePanel({
  memberSince,
  onOpenDonate,
  onSave,
  onSignOut,
  onThemeChange,
  profile,
  supportMailto,
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
  // them.
  function handleThemeChange(mode: ThemeMode) {
    onThemeChange(mode);
    setThemeSaveFailed(false);
    onSave({
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

  return (
    // Spec §17c gave every scrolling surface the one shared page footer, this
    // one included. That retired the legal/production block spec §11 put at
    // the foot of this column — it would now be a second copy of what the
    // footer itself carries — and it made this surface's own Donate ambiguous
    // with the footer's. The testid is how e2e keeps the two apart.
    <div
      className="mx-auto w-full max-w-[880px]"
      data-testid="profile-panel"
    >
      {/* `.page h1` (p-profile-v2.html:17): the 2px ink rule under the title,
          the same one Insights, Guide and Donate carry, with no gap under it —
          the first row's own 26px top padding is the spacing. */}
      <h1 className="border-b-2 border-ink pb-3.5 text-2xl font-semibold tracking-normal text-ink">
        Profile
      </h1>

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

      <ProfileRow
        description="Markets, costs, and record follow the broker."
        title="Broker"
      >
        <BrokerChip />
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

      <ProfileRow
        description="We read every note."
        title="Support"
      >
        {/* `.tlink` (:90-91): side by side, not stacked. Spec §16 relocated
            Help and Donate here when the desktop header buttons were killed;
            the shared footer now carries them too, and both placements are
            §17's own intent. */}
        <div className="flex flex-wrap items-center gap-x-[22px] gap-y-2">
          <a className="tertiary-link" href={supportMailto}>
            Email support
          </a>
          <button
            className="tertiary-link"
            type="button"
            onClick={onOpenDonate}
          >
            Donate
          </button>
        </div>
      </ProfileRow>
    </div>
  );
}

// `.row` + `.lab` (p-profile-v2.html:18-21): one hairline-separated row, the
// label column beside its content at ≥lg and stacked below it under lg, at the
// mock's 220px measure, 24px column gap and 26px block padding. The last row
// drops its rule (`.row:last-of-type`) so the sheet ends on content, not on a
// line.
//
// One component for all four rows: padding, separation and column measure are
// the composition, so they cannot be allowed to drift row by row. The stacked
// row gap is 12px rather than the mock's 24px — with the label above its
// content instead of beside it, the mock's horizontal measure would read as a
// break in the row.
function ProfileRow({
  children,
  description,
  title,
}: {
  children: ReactNode;
  // What the row cannot show (§17e's standing description rule). Owner-approved
  // verbatim, per row; tests/profilePanel.test.tsx pins all four.
  description: string;
  title: string;
}) {
  return (
    <div className="grid gap-x-6 gap-y-3 border-b border-hairline py-[26px] last:border-b-0 lg:grid-cols-[220px_1fr]">
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

function formatMemberSince(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}
