import { Landmark, LogOut, Palette, UserRound } from "lucide-react";
import type { ThemeMode, UserProfile } from "../../lib/profile";
import { LegalLinks } from "../legal/LegalLinks";
import { BrokerChip } from "./BrokerChip";
import { ThemeToggle } from "./ThemeToggle";

// Spec §11: Profile collapses to one narrow settings column — Account,
// Broker, Appearance, legal + colophon — dropping the old Preferences form
// (display name / timezone / preferred session / default chart view) and
// the read-only Market clock / Activity / Review activity cards entirely.
// Spec §10b retires the session-clock concept those fields fed, and Task 8
// moved every analytics view (win rate, per-market history) into Insights,
// so nothing here is a silent removal of the only place that data lived.
// The underlying profile record (useUserProfile/profile.ts) is untouched —
// this is composition, not a data change: existing stored values for the
// now-unexposed fields keep working (e.g. the header's "Welcome, {name}"
// text), they simply have no editing UI left to change them going forward.
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
  // The Appearance card is the only remaining write path in this panel, and
  // it has no Save button of its own (spec §2 copy discipline: no
  // process-narration) — picking a theme both applies it live (App.tsx's
  // existing onThemeChange) and persists it immediately, reusing
  // useUserProfile.saveProfile exactly as the old Preferences form did,
  // just from a different trigger. The other four saved fields ride along
  // unchanged so a theme-only save can never reset them.
  function handleThemeChange(mode: ThemeMode) {
    onThemeChange(mode);
    onSave({
      defaultTimeframe: profile.defaultTimeframe,
      defaultTimezone: profile.defaultTimezone,
      displayName: profile.displayName,
      preferredSession: profile.preferredSession,
      themePreference: mode,
    }).catch((error) => {
      console.error("[profile] theme save failed", error);
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-[620px] gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-accent">
          Profile
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
          Your account
        </h1>
      </div>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <UserRound className="h-5 w-5 text-ink" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-normal text-ink">
            Account
          </h2>
        </div>
        <div className="grid gap-3">
          <ProfileDetailRow label="Email" value={profile.email} />
          <ProfileDetailRow
            label="Member since"
            value={formatMemberSince(memberSince)}
          />
        </div>
        <button
          className="secondary-button mt-4"
          type="button"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </section>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <Landmark className="h-5 w-5 text-ink" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-normal text-ink">
            Broker
          </h2>
        </div>
        <BrokerChip />
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          Setups are tuned to this broker's markets and costs, and your
          Insights record is kept per broker.
        </p>
      </section>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <Palette className="h-5 w-5 text-ink" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-normal text-ink">
            Appearance
          </h2>
        </div>
        <ThemeToggle mode={themeMode} onChange={handleThemeChange} />
      </section>

      <div className="grid gap-3 px-1">
        <LegalLinks align="left" />
        <p className="colophon">A Windward Line production</p>
      </div>
    </div>
  );
}

function ProfileDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm">
      <span className="min-w-0 text-ink-muted">{label}</span>
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
