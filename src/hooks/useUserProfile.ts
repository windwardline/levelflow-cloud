import { useCallback, useEffect, useState } from "react";
import type { ChartTimeframe } from "../lib/marketData";
import {
  buildDefaultProfile,
  isUsTimezone,
  resolveDefaultUsTimeZone,
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

type SaveProfileInput = Pick<UserProfile, "defaultTimeframe" | "defaultTimezone" | "displayName" | "preferredSession" | "themePreference">;

export function useUserProfile(userId: string | null, email: string, onThemeChange: (mode: ThemeMode) => void) {
  const [profile, setProfile] = useState<UserProfile | null>(() => (userId ? buildDefaultProfile(userId, email) : null));
  const [loading, setLoading] = useState(Boolean(userId));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const fallback = buildDefaultProfile(userId, email);
    setLoading(true);

    try {
      if (!supabase) {
        setProfile(fallback);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, default_timezone, default_timeframe, theme_preference, preferred_session")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const nextProfile = data ? rowToProfile(data as ProfileRow, fallback) : fallback;
      setProfile(nextProfile);
      onThemeChange(nextProfile.themePreference);
    } catch {
      setProfile(fallback);
    } finally {
      setLoading(false);
    }
  }, [email, onThemeChange, userId]);

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
        defaultTimezone: isUsTimezone(input.defaultTimezone) ? input.defaultTimezone : resolveDefaultUsTimeZone(),
        displayName: input.displayName.trim(),
      };

      setStatus("saving");
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
        setStatus("idle");
        throw error;
      }

      setProfile(nextProfile);
      onThemeChange(nextProfile.themePreference);
      setStatus("saved");
    },
    [email, onThemeChange, userId],
  );

  return {
    loading,
    profile,
    refreshProfile,
    saveProfile,
    status,
  };
}

function rowToProfile(row: ProfileRow, fallback: UserProfile): UserProfile {
  return {
    ...fallback,
    defaultTimeframe: isChartTimeframe(row.default_timeframe) ? row.default_timeframe : fallback.defaultTimeframe,
    defaultTimezone: isUsTimezone(row.default_timezone) ? row.default_timezone : fallback.defaultTimezone,
    displayName: row.display_name ?? fallback.displayName,
    email: row.email ?? fallback.email,
    preferredSession: isPreferredSession(row.preferred_session) ? row.preferred_session : fallback.preferredSession,
    themePreference: isThemeMode(row.theme_preference) ? row.theme_preference : fallback.themePreference,
  };
}

function isChartTimeframe(value: string | null): value is ChartTimeframe {
  return value === "15min" || value === "1hour" || value === "4hour" || value === "1day";
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function isPreferredSession(value: string | null): value is PreferredSession {
  return value === "any" || value === "asia" || value === "europe" || value === "north_america" || value === "australia";
}
