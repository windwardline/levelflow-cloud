import { useCallback, useEffect, useState } from "react";
import { isChartTimeframe } from "../lib/marketData";
import {
  buildDefaultProfile,
  coerceToSupportedUsTimeZone,
  type PreferredSession,
  type ThemeMode,
  type UserProfile,
} from "../lib/profile";
import { supabase } from "../lib/supabase";

type ProfileRow = {
  default_timeframe: string | null;
  default_timezone: string | null;
  display_name: string | null;
  email: string | null;
  id: string;
  preferred_session: string | null;
  theme_preference: string | null;
};

type SaveProfileInput = Pick<
  UserProfile,
  | "defaultTimeframe"
  | "defaultTimezone"
  | "displayName"
  | "preferredSession"
  | "themePreference"
>;

export function useUserProfile(
  userId: string | null,
  email: string,
  onThemeChange: (mode: ThemeMode) => void,
) {
  const [profile, setProfile] = useState<UserProfile | null>(
    () => (userId ? buildDefaultProfile(userId, email) : null),
  );

  // Q2-M5: a profile and its theme are one fact, so they are applied together.
  // onThemeChange used to fire on the success path alone, while the two fallback
  // paths below set a profile without it — so a reader whose load failed, or who
  // ran without a configured client, kept whatever theme the previous render had
  // while the surface showed a profile that said otherwise.
  const applyProfile = useCallback(
    (next: UserProfile) => {
      setProfile(next);
      onThemeChange(next.themePreference);
    },
    [onThemeChange],
  );

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }

    const fallback = buildDefaultProfile(userId, email);

    try {
      if (!supabase) {
        applyProfile(fallback);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, email, display_name, default_timezone, default_timeframe, theme_preference, preferred_session",
        )
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      applyProfile(
        data ? rowToProfile(data as ProfileRow, fallback) : fallback,
      );
    } catch (error) {
      console.error("[profile] load failed; showing defaults", error);
      applyProfile(fallback);
    }
  }, [applyProfile, email, userId]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const saveProfile = useCallback(
    async (input: SaveProfileInput) => {
      if (!userId || !supabase) {
        return;
      }

      const nextProfile: UserProfile = {
        ...buildDefaultProfile(userId, email),
        ...input,
        defaultTimezone: coerceToSupportedUsTimeZone(input.defaultTimezone),
        displayName: input.displayName.trim(),
      };

      const { error } = await supabase.from("profiles").upsert({
        default_timeframe: nextProfile.defaultTimeframe,
        default_timezone: nextProfile.defaultTimezone,
        display_name: nextProfile.displayName,
        email,
        id: userId,
        preferred_session: nextProfile.preferredSession,
        theme_preference: nextProfile.themePreference,
      });

      if (error) {
        throw error;
      }

      applyProfile(nextProfile);
    },
    [applyProfile, email, userId],
  );

  // Q2-I9: two facts, both read. What used to ride along here was a
  // "idle"|"saving"|"saved" machine that re-rendered the whole App tree three
  // times per save for a value App.tsx never destructured — ProfilePanel's own
  // saveStatus prop was deleted long before (tests/mobileNav.test.ts pins its
  // absence) — plus a `loading` flag and a refreshProfile handle with no callers
  // either.
  return {
    profile,
    saveProfile,
  };
}

function rowToProfile(row: ProfileRow, fallback: UserProfile): UserProfile {
  return {
    ...fallback,
    defaultTimeframe: isChartTimeframe(row.default_timeframe)
      ? row.default_timeframe
      : fallback.defaultTimeframe,
    defaultTimezone: coerceToSupportedUsTimeZone(
      row.default_timezone ?? fallback.defaultTimezone,
    ),
    displayName: row.display_name ?? fallback.displayName,
    email: row.email ?? fallback.email,
    preferredSession: isPreferredSession(row.preferred_session)
      ? row.preferred_session
      : fallback.preferredSession,
    themePreference: isThemeMode(row.theme_preference)
      ? row.theme_preference
      : fallback.themePreference,
  };
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function isPreferredSession(value: string | null): value is PreferredSession {
  return value === "any" || value === "asia" || value === "europe" ||
    value === "north_america" || value === "australia";
}
