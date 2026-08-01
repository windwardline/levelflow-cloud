import type { ReactNode } from "react";
import { useState } from "react";
import { useIsMobileViewport } from "../../hooks/useMobileViewport";
import type { ThemeMode, UserProfile } from "../../lib/profile";
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
// chrome anywhere and no icons. The shared page footer (spec §17c) carries the
// legal and production lines this column used to end with — and, since §17i, the
// two links the mock's fourth row carried as well, which is why that row is gone
// and the sheet is three: the footer is in the frame on every surface, so a
// Support row here was a second home for links already on screen.
type ProfilePanelProps = {
  memberSince: string;
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
  themeMode: ThemeMode;
};

export function ProfilePanel({
  memberSince,
  onSave,
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

  // Which composition this surface is (spec §17g): below lg a fixed-viewport
  // frame with the title pinned and the rows scrolling inside it, at ≥lg the flat
  // 880px editorial sheet p-profile-v2.html draws, unchanged. The title and the
  // rows are built once and placed by whichever branch renders.
  const isMobile = useIsMobileViewport();

  // `.page h1` (p-profile-v2.html:17): the 2px ink rule under the title, the
  // same one Insights, Guide and Donate carry, with no gap under it — the first
  // row's own 26px top padding is the spacing.
  const title = (
    <h1 className="border-b-2 border-ink pb-3.5 text-2xl font-semibold tracking-normal text-ink">
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
    </>
  );

  if (isMobile) {
    // Spec §17g: "Profile: fits the frame; if content ever exceeds it, the rows
    // region scrolls internally." With four rows it exceeded it — 722px against
    // 683px of frame. §17i deleted the Support row, and the measurement was
    // re-taken against the built CSS with the shipped fonts at 375x812: three rows
    // plus the colophon come to 596px, inside both the 683px frame and the 626px of
    // it that clears the fixed tab bar. So the conditional clause simply stops
    // engaging, which is the state §17g describes first.
    //
    // The region keeps its shared frame string regardless — it is the one every
    // <lg surface takes, and what it now scrolls is 9px of the tab-bar reserve's
    // own tail rather than any content. Nothing is hidden by it, and a row that
    // grows later (the theme-save notice below) finds the clause already in place.
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
              muted at rest, underlined only on hover or focus, 44px, new tab. */}
          <p className="colophon">
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
      className="mx-auto w-full max-w-[880px]"
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
// One component for every row: padding, separation and column measure are
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
  // verbatim, per row; tests/profilePanel.test.tsx pins them all.
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
