import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarClock, LineChart } from "lucide-react";
import type { OutcomeSummary } from "../../hooks/useTradeSetups";
import {
  CHART_TIMEFRAME_OPTIONS,
  type ChartTimeframe,
} from "../../lib/marketData";
import { getGlobalSessions } from "../../lib/marketSessions";
import {
  formatUsTimeZoneOptionLabel,
  getTimeZoneAbbreviation,
  getUsTimeZoneOption,
  PREFERRED_SESSION_OPTIONS,
  type ThemeMode,
  US_TIME_ZONE_GROUPS,
  type UserProfile,
} from "../../lib/profile";
import {
  buildProfileReviewPattern,
  type ProfileReviewPatternItem,
} from "../../lib/profileInsights";
import { formatSecurityLabel } from "../../lib/symbolMap";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";
import { ThemeToggle } from "./ThemeToggle";
import { useWorkspaceNav } from "./WorkspaceNav";

type ProfilePanelProps = {
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
  onThemeChange: (mode: ThemeMode) => void;
  profile: UserProfile;
  saveStatus: "idle" | "saving" | "saved";
  setups: TradeSetupRow[];
  summary: OutcomeSummary;
  themeMode: ThemeMode;
};

export function ProfilePanel({
  onSave,
  onThemeChange,
  profile,
  saveStatus,
  setups,
  summary,
  themeMode,
}: ProfilePanelProps) {
  const nav = useWorkspaceNav();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [timezone, setTimezone] = useState(profile.defaultTimezone);
  const [defaultTimeframe, setDefaultTimeframe] = useState<ChartTimeframe>(
    profile.defaultTimeframe,
  );
  const [preferredSession, setPreferredSession] = useState(
    profile.preferredSession,
  );
  const [saveError, setSaveError] = useState("");
  const [profileNow, setProfileNow] = useState(() => new Date());

  const sessions = useMemo(
    () => getGlobalSessions(timezone, preferredSession, profileNow),
    [preferredSession, profileNow, timezone],
  );
  const focusedSession = sessions.find((session) => session.isPreferred) ??
    sessions.find((session) => session.id === "north_america") ??
    sessions[0];
  const latestSetup = setups[0];
  const reviewPattern = useMemo(
    () => buildProfileReviewPattern(setups),
    [setups],
  );
  const selectedTimeZone = getUsTimeZoneOption(timezone);
  const selectedTimeZoneAbbreviation = getTimeZoneAbbreviation(
    selectedTimeZone.value,
    profileNow,
  );
  const hasUnsavedChanges = displayName !== profile.displayName ||
    timezone !== profile.defaultTimezone ||
    defaultTimeframe !== profile.defaultTimeframe ||
    preferredSession !== profile.preferredSession ||
    themeMode !== profile.themePreference;
  const saveButtonLabel = saveStatus === "saving"
    ? "Saving..."
    : saveStatus === "saved" && !hasUnsavedChanges
    ? "Profile saved"
    : "Save profile";

  useEffect(() => {
    setDisplayName(profile.displayName);
    setTimezone(profile.defaultTimezone);
    setDefaultTimeframe(profile.defaultTimeframe);
    setPreferredSession(profile.preferredSession);
  }, [profile]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setProfileNow(new Date()),
      60_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");

    try {
      await onSave({
        defaultTimeframe,
        defaultTimezone: timezone,
        displayName,
        preferredSession,
        themePreference: themeMode,
      });
    } catch {
      setSaveError(
        "Profile could not be saved. Try again after the connection refreshes.",
      );
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.55fr)]">
      <form className="terminal-panel p-5 sm:p-6" onSubmit={saveProfile}>
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-normal text-accent">
            Profile
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
            Preferences
          </h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Name
            <input
              className="field"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Trader name"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ink">
            U.S. time zone
            <select
              className="field"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {US_TIME_ZONE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {formatUsTimeZoneOptionLabel(option)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Preferred session
            <select
              className="field"
              value={preferredSession}
              onChange={(event) =>
                setPreferredSession(
                  event.target.value as UserProfile["preferredSession"],
                )}
            >
              {PREFERRED_SESSION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Default chart view
            <select
              className="field"
              value={defaultTimeframe}
              onChange={(event) =>
                setDefaultTimeframe(event.target.value as ChartTimeframe)}
            >
              {CHART_TIMEFRAME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 text-sm font-semibold text-ink">
            Theme
            <ThemeToggle mode={themeMode} onChange={onThemeChange} />
          </div>
        </div>
        {saveError
          ? (
            <p className="mt-4 rounded-lg border border-sell/25 bg-sell/10 px-3 py-2 text-sm font-semibold text-sell">
              {saveError}
            </p>
          )
          : null}
        <button
          className="primary-button mt-5"
          type="submit"
          disabled={saveStatus === "saving"}
        >
          {saveButtonLabel}
        </button>
      </form>

      <div className="grid gap-5">
        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-ink" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-accent">
                Today
              </p>
              <h2 className="text-2xl font-semibold tracking-normal text-ink">
                Market clock
              </h2>
            </div>
          </div>
          <div className="grid gap-3">
            <ProfileDetailRow
              label="Local time"
              value={formatProfileTime(profileNow, timezone)}
            />
            <ProfileDetailRow
              label="Selected zone"
              value={`${selectedTimeZone.label} (${selectedTimeZoneAbbreviation})`}
            />
            <ProfileDetailRow
              label="Clock handling"
              value={selectedTimeZone.group === "adjusts"
                ? "Adjusts automatically"
                : "Standard time year-round"}
            />
            <ProfileDetailRow
              label="Session focus"
              value={focusedSession
                ? `${focusedSession.label} ${
                  focusedSession.isOpen ? "open" : "closed"
                }`
                : "No preference"}
            />
            <ProfileDetailRow
              label="Next session event"
              value={focusedSession
                ? `${focusedSession.nextEventLabel} in ${focusedSession.countdownLabel}`
                : "Tracking all sessions"}
            />
          </div>
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Activity className="h-5 w-5 text-ink" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-accent">
                  Account
                </p>
                <h2 className="text-2xl font-semibold tracking-normal text-ink">
                  Activity
                </h2>
              </div>
            </div>
            <button
              className="tertiary-link"
              type="button"
              onClick={() => nav.openInsights()}
            >
              All insights
            </button>
          </div>
          <div className="grid gap-3">
            <ProfileDetailRow label="Signed in" value={profile.email} />
            <ProfileDetailRow
              label="Saved setups"
              mono
              value={summary.total.toString()}
            />
            <ProfileDetailRow
              label="Finished setups"
              mono
              value={summary.resolved.toString()}
            />
            <ProfileDetailRow
              label="Win rate"
              mono
              value={summary.winRate === null
                ? "Building"
                : `${summary.winRate}%`}
            />
            <ProfileDetailRow
              label="Last setup"
              value={latestSetup
                ? formatDate(latestSetup.created_at)
                : "None yet"}
            />
          </div>
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <LineChart className="h-5 w-5 text-ink" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-accent">
                History
              </p>
              <h2 className="text-2xl font-semibold tracking-normal text-ink">
                Review activity
              </h2>
            </div>
          </div>
          <div className="grid gap-3">
            {reviewPattern.map((item) => (
              <ProfileReviewPatternRow item={item} key={item.symbol} />
            ))}
          </div>
          {reviewPattern.length === 0
            ? (
              <p className="text-sm leading-6 text-ink-muted">
                Review activity will appear after setups are saved.
              </p>
            )
            : null}
        </section>
      </div>
    </div>
  );
}

function ProfileReviewPatternRow({ item }: { item: ProfileReviewPatternItem }) {
  const nav = useWorkspaceNav();

  return (
    <div className="rounded-lg border border-hairline bg-paper px-3 py-3 text-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {formatSecurityLabel(item.symbol)}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-ink-muted">
            {item.category}
          </p>
        </div>
        <p className="shrink-0 text-right font-mono font-semibold tabular-nums text-ink">
          {item.count} {item.count === 1 ? "setup" : "setups"}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <ProfileMiniMetric
          label="Win rate"
          value={item.winRate === null ? "Building" : `${item.winRate}%`}
        />
        <ProfileMiniMetric
          label="Finished"
          value={`${item.wins + item.losses}`}
        />
        <ProfileMiniMetric
          label="Latest"
          value={formatCompactDate(item.latestAt)}
        />
      </div>
      <div className="mt-2 flex justify-end">
        <button
          className="tertiary-link"
          type="button"
          onClick={() => nav.openAdvisor(item.symbol)}
        >
          Open in Advisor
        </button>
      </div>
    </div>
  );
}

function ProfileMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-sheet px-2 py-2">
      <p className="truncate font-mono font-semibold tabular-nums text-ink">
        {value}
      </p>
      <p className="truncate text-ink-muted">{label}</p>
    </div>
  );
}

function ProfileDetailRow({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm">
      <span className="min-w-0 text-ink-muted">{label}</span>
      <span
        className={`min-w-0 text-right font-semibold text-ink ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCompactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Pending";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatProfileTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
    weekday: "short",
  }).format(date);
}
