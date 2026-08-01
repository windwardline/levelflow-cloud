import { LegalLinks } from "./legal/LegalLinks";

type AppFooterProps = {
  onOpenDonate: () => void;
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
// one quiet line. Donate fires the same tab switch every other Donate
// affordance in the app already uses; no second mechanism for one action.
export function AppFooter({ onOpenDonate, supportMailto }: AppFooterProps) {
  return (
    <footer className="w-full border-t border-hairline">
      {/* The mock's own symmetrical 18px, on one axis-wide utility. The bottom
          reserve this row used to carry was clearance for the fixed MobileTabBar,
          and §17g made that unreachable: the footer is a ≥lg element now (App.tsx's
          presence gate), and no fixed bar exists at ≥lg for it to clear. (Named by
          shape rather than spelled out: Tailwind's scanner reads this file too, and
          a dead class in a comment is a dead rule in the bundle.) */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-3 px-4 py-[18px] sm:px-8">
        {/* .colophon carries its own 2rem top pad for the standalone use on
            the auth and parking screens; here the footer's own padding is the
            spacing, so that pad comes back off. */}
        <p className="colophon py-0">A Windward Line production</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav
            aria-label="Support"
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <a className="tertiary-link" href={supportMailto}>
              Help
            </a>
            <button
              className="tertiary-link"
              type="button"
              onClick={onOpenDonate}
            >
              Donate
            </button>
          </nav>
          <LegalLinks align="left" />
        </div>
      </div>
    </footer>
  );
}
