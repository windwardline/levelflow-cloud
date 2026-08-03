import { ExternalLink, Gift } from "lucide-react";
import { appConfig } from "../../lib/env";

type DonationOptionsProps = {
  fallbackHref: string;
  // Two live call sites, two shapes: the Donate page gives the options a
  // two-column grid and lists what each platform is for; the sign-in screen's
  // disclosure has one narrow column and no room for the descriptions
  // (AuthScreen.tsx). Nothing else varies between them any more.
  mode?: "compact" | "panel";
};

// The donation options and nothing else. Two things left this component in
// wave 5, both of them chrome it had no business owning:
//
// - the sentence it used to open with, which said what the Donate page's own
//   "What donations support" section says a few lines later, so the page said it
//   twice (spec §17f). It still renders on the sign-in screen, where there is no
//   such section and it is the only thing that says what a donation pays for — at
//   that call site now, from the constant both surfaces share
//   (src/lib/donationCopy.ts, owner ruling 2026-08-02).
// - the compact wrapper's divider rule, which was the sign-in panel's own idiom
//   (and its own off-palette border colour) drawn from inside a shared
//   component. It moved to that call site too, where it sits beside the two
//   identical dividers it was always trying to match.
export function DonationOptions({ fallbackHref, mode = "panel" }: DonationOptionsProps) {
  const links = appConfig.donationLinks;
  const compact = mode === "compact";

  return (
    <>
      {links.length > 0 ? (
        <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
          {links.map((link) => (
            <a key={link.label} className="secondary-button justify-between" href={link.url} target="_blank" rel="noopener noreferrer">
              <span className="flex min-w-0 items-center gap-2">
                <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{link.label}</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : (
        <a className="primary-button" href={fallbackHref}>
          <Gift className="h-4 w-4" aria-hidden="true" />
          Request donation link
        </a>
      )}
      {links.length > 0 && !compact ? (
        <div className="mt-4 grid gap-2 text-xs leading-5 text-ink-muted">
          {links.map((link) => (
            <p key={link.url}>
              <span className="font-semibold text-ink">{link.label}:</span> {link.description}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}
