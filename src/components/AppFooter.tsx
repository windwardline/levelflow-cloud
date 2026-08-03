import { LegalLinks } from "./legal/LegalLinks";
import type { LegalSlug } from "../lib/legalDocuments";

// Where Donate goes, which is the one thing that cannot be the same on every
// surface (spec §17i: satellite pages "carry the same footer composition with
// links that work in their context"). Inside the app it is a tab switch; on the
// login screen it is the disclosure over that screen's own donation options; on
// the parking screen there is no in-page target at all, so it is a link to the
// app root. A discriminated union rather than two optional props, so "exactly one
// of these" is a type error rather than a convention — and it decides the ELEMENT
// only. The word, its class and its place in the row are the same either way.
export type FooterDonate =
  | { href: string }
  | { expanded?: boolean; onSelect: () => void };

type AppFooterProps = {
  // Which document is open, and how to open one, when this footer is inside the app
  // (§17o tier 2). Both absent on the signed-out surfaces, where LegalLinks stays a
  // set of plain same-tab links because there is no frame to present a document in.
  currentDocument?: LegalSlug | null;
  donate: FooterDonate;
  onOpenDocument?: (slug: LegalSlug) => void;
  supportMailto: string;
};

// The one page footer (spec §17c: "a single footer component, identical
// composition, dimensions, and spacing on every scrolling page and view"),
// drawn as p-profile-v2.html:96-99 draws it: a hairline rule across the top,
// the colophon at the left, the link row at the right, both on one baseline.
//
// It does not pin itself any more, and no longer needs to: spec §17i makes the
// shell a fixed frame whose last row is this element (App.tsx's
// mainShellClassName), so the footer is at the bottom of the viewport on every
// surface by construction — including the Desk, whose §17c exception this ruling
// retires. The composition is one literal string with no branches at all, which
// is what makes "identical everywhere" structural instead of a convention to
// remember.
//
// The link row is the §17 placement (a) set: Help and Donate beside the legal
// trio, in the mock's own left-to-right order. They sit in their own Support
// group rather than inside LegalLinks, which is a nav landmark named for the
// legal documents it lists — a support link filed under that name is misnamed
// for anyone navigating by landmark. Two navs, one flex row, so they read as
// one quiet line. Since §17i this row is the ONLY home either link has on a
// desktop surface, which is what retired the Guide's Support section and
// Profile's Support row.
export function AppFooter({
  currentDocument,
  donate,
  onOpenDocument,
  supportMailto,
}: AppFooterProps) {
  return (
    <footer className="w-full border-t border-hairline">
      {/* The mock's own symmetrical 18px, on one axis-wide utility. The bottom
          reserve this row used to carry was clearance for the fixed MobileTabBar,
          and §17g made that unreachable: inside the authed app this footer is a ≥lg
          element (App.tsx's presence gate), and no fixed bar exists at ≥lg for it
          to clear. The other two call sites — the sign-in and parking screens —
          render it at every width, as satelliteFrame.ts says they must, and neither
          has a tab bar either. (Named by shape rather than spelled out: Tailwind's
          scanner reads this file too, and a dead class in a comment is a dead rule
          in the bundle.) */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-3 px-4 py-[18px] sm:px-8">
        {/* .colophon carries its own 2rem top pad for the standalone use on
            the auth and parking screens; here the footer's own padding is the
            spacing, so that pad comes back off.

            Spec §17k: the line is a link to the house — provenance you can
            follow — in one treatment everywhere it appears. Muted exactly as it
            reads at rest, no underline until hover or focus, a new tab so it
            never navigates a workspace away, and the kit's 44px target reached
            the way .tertiary-link reaches it, which is what leaves the row's own
            geometry untouched. */}
        <p className="colophon py-0">
          <a
            className="colophon-link"
            href="https://windwardline.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            A Windward Line production
          </a>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav
            aria-label="Support"
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <a className="tertiary-link" href={supportMailto}>
              Help
            </a>
            {"href" in donate
              ? (
                <a className="tertiary-link" href={donate.href}>
                  Donate
                </a>
              )
              : (
                // aria-expanded only where the control really is a disclosure
                // (the login screen's donation options). Left undefined — and so
                // absent from the DOM — where the click switches surfaces, since
                // a tab switch expands nothing.
                <button
                  aria-expanded={donate.expanded}
                  className="tertiary-link"
                  type="button"
                  onClick={donate.onSelect}
                >
                  Donate
                </button>
              )}
          </nav>
          <LegalLinks current={currentDocument} onOpen={onOpenDocument} />
        </div>
      </div>
    </footer>
  );
}
