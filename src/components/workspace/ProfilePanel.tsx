import { useState } from "react";
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
// now-unexposed fields (displayName included) keep working wherever they're
// still read, they simply have no editing UI left to change them going
// forward.
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
  // The retired Preferences form surfaced a save failure inline, not just
  // to the console — reusing that exact border-sell/bg-sell/10/text-sell
  // notice style below (fix round 1). Logging this one to the console
  // alone would be the same silent failure that form never had.
  const [themeSaveFailed, setThemeSaveFailed] = useState(false);

  // The Appearance card is the only remaining write path in this panel, and
  // it has no Save button of its own (spec §2 copy discipline: no
  // process-narration) — picking a theme both applies it live (App.tsx's
  // existing onThemeChange) and persists it immediately, reusing
  // useUserProfile.saveProfile exactly as the old Preferences form did,
  // just from a different trigger. The other four saved fields ride along
  // unchanged so a theme-only save can never reset them.
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
    <div className="mx-auto grid w-full max-w-[620px] gap-4">
      <h1 className="text-2xl font-semibold tracking-normal text-ink">
        Profile
      </h1>

      <section className="terminal-panel px-[22px] py-[18px]">
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

      <section className="terminal-panel px-[22px] py-[18px]">
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

      <section className="terminal-panel px-[22px] py-[18px]">
        <div className="mb-4 flex items-center gap-3">
          <Palette className="h-5 w-5 text-ink" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-normal text-ink">
            Appearance
          </h2>
        </div>
        <ThemeToggle mode={themeMode} onChange={handleThemeChange} />
        {themeSaveFailed
          ? (
            <p className="mt-3 rounded-lg border border-sell/25 bg-sell/10 px-3 py-2 text-sm font-semibold text-sell">
              Appearance could not be saved. Try again after the connection
              refreshes.
            </p>
          )
          : null}
      </section>

      {/* spec §16 relocation: Help (mailto) and Donate move here from the
          killed desktop header buttons — the mobile account menu already
          carries both, so this keeps them reachable once the desktop
          masthead drops to wordmark + nav + broker chip + Sign out. */}
      <section className="terminal-panel px-[22px] py-[18px]">
        <h3 className="mb-4 text-lg font-semibold tracking-normal text-ink">
          Support
        </h3>
        <div className="flex flex-col items-start gap-2">
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
