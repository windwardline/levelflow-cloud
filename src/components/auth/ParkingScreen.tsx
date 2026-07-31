import type { ReactNode } from "react";
import { LegalLinks } from "../legal/LegalLinks";

// The construction soft gate's face: the parking composition from the
// static twin (public/construction.html), rendered by the app so the
// theme toggle and tokens behave exactly like the rest of Levelflow.
export function ParkingScreen({ themeControl }: { themeControl?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      {themeControl ? (
        <div className="fixed right-4 top-4">{themeControl}</div>
      ) : null}
      <div className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Under construction
        </p>
        <h1 className="wordmark mt-5 text-5xl font-bold tracking-tight sm:text-6xl">
          Levelflow
        </h1>
        <div aria-hidden className="mx-auto mt-6 h-[3px] w-[72px] bg-accent" />
        <p className="mt-6 text-[17px] leading-relaxed text-ink-muted">
          Levelflow is being rebuilt — a new engine and a new face, both
          measured before they ship. Sign-in is paused while the work lands.
        </p>
      </div>
      {/* F1/Finding 5: the parking gate is every signed-out visitor's
          actual public face while PARKING_GATE is true, so it needs the
          same quiet path to Terms/Privacy/Risk disclaimer AuthScreen's
          card footer already gives — reusing ProfilePanel's non-card
          "LegalLinks above colophon" grid, since this footer isn't a card. */}
      <footer className="mt-10 grid gap-3 pb-6">
        <LegalLinks />
        <p className="colophon">A Windward Line production</p>
      </footer>
    </main>
  );
}
