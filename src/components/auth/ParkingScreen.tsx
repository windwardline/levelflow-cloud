import type { ReactNode } from "react";
import { AppFooter } from "../AppFooter";
import { LevelflowMark } from "../LevelflowMark";
import {
  SATELLITE_FRAME,
  SATELLITE_FRAME_SCROLL,
} from "../satelliteFrame";
import { SUPPORT_MAILTO } from "../../lib/support";

// The construction soft gate's face: the parking composition from the static twin
// (public/construction.html), rendered by the app so the theme toggle and tokens
// behave exactly like the rest of Levelflow.
//
// Spec §17j makes this layout a saved, reusable standard rather than one
// occasion's page — "mark, eyebrow, wordmark, accent rule, one body line, THE
// footer in the frame" — and its body copy has to fit ANY future pause, which is
// why the line below promises no duration and explains no work.
//
// Spec §17i puts it in the frame: the group scrolls in the content region (on auto
// margins, so it is centred when it fits and simply starts at the top when it does
// not), and the shared footer is the row beneath, at every width. That footer is
// also the page's only home for the legal trio now — the in-body LegalLinks row a
// prior wave added, when this page had no footer at all, was a second home for
// three links the footer already carries.
export function ParkingScreen({ themeControl }: { themeControl?: ReactNode }) {
  return (
    <main className={SATELLITE_FRAME}>
      {/* Named for the page, which is what the eyebrow below already calls it:
          the region is a tab stop now (satelliteFrame.ts), and an unnamed stop
          announces as nothing. */}
      <div
        aria-label="Under construction"
        className={SATELLITE_FRAME_SCROLL}
        role="region"
        tabIndex={0}
      >
        {/* Owner ruling (2026-08-02) is written for the login screen, and it is a
            ruling about this control: it is "planted at the top" and scrolls with
            the content rather than pinned over it. Both pre-auth screens carry the
            same row, from the same string, because they carry the same control —
            and the centred group below keeps §17j's five elements untouched. */}
        {themeControl ? (
          <div className="mx-auto flex w-full max-w-7xl justify-end px-5 pt-4 sm:px-8">
            {themeControl}
          </div>
        ) : null}
        <div className="m-auto max-w-xl px-6 py-8 text-center">
          {/* §17i's satellite mark: mark A small above the eyebrow, one
              treatment on every page that carries it (44px, 16px of air under
              it). It sits above the wordmark rather than beside it, and the
              eyebrow keeps its own place between the two, so nothing crowds. */}
          <LevelflowMark className="mx-auto mb-4 h-11 w-11" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Under construction
          </p>
          <h1 className="wordmark mt-5 text-5xl font-bold tracking-tight sm:text-6xl">
            Levelflow
          </h1>
          <div aria-hidden className="mx-auto mt-6 h-[3px] w-[72px] bg-accent" />
          <p className="mt-6 text-[17px] leading-relaxed text-ink-muted">
            The desk is closed while we work on it. Sign-in resumes the moment it
            reopens.
          </p>
        </div>
      </div>
      {/* The app root, with the app's own donate entry point: this screen has no
          in-page donation block to reveal, and the root is where one lives the
          moment the gate lifts (AuthScreen reads ?donate on load). */}
      <AppFooter donate={{ href: "/?donate" }} supportMailto={SUPPORT_MAILTO} />
    </main>
  );
}
