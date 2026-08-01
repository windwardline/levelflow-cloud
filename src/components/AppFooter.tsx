import { LegalLinks } from "./legal/LegalLinks";

type AppFooterProps = {
  // True on the Desk tab only. At ≥lg the Desk is a fixed, non-scrolling
  // three-column shell whose columns own the viewport, so spec §17c keeps that
  // one surface footer-less and this element steps out of the layout entirely
  // rather than merely going invisible. Below lg the Desk scrolls like every
  // other page and carries this footer unchanged.
  //
  // The flag gates presence, never composition: both branches below differ by
  // exactly one utility, and everything inside the frame is a single shared
  // string, so the footer that renders is identical on every surface that
  // renders one.
  hiddenOnDesktopDesk?: boolean;
  onOpenDonate: () => void;
  supportMailto: string;
};

// The one page footer (spec §17c: "a single footer component, identical
// composition, dimensions, and spacing on every scrolling page and view"),
// drawn as p-profile-v2.html:96-99 draws it: a hairline rule across the top,
// the colophon at the left, the link row at the right, both on one baseline.
//
// It pins itself. `mt-auto` inside App.tsx's min-h-screen flex column puts the
// footer at the true bottom of the viewport when the page is short and directly
// after the content when it is long — the pinning belongs to the footer rather
// than to each caller, which is what makes "identical everywhere" structural
// instead of a convention to remember.
//
// The link row is the §17 placement (a) set: Help and Donate beside the legal
// trio, in the mock's own left-to-right order. They sit in their own Support
// group rather than inside LegalLinks, which is a nav landmark named for the
// legal documents it lists — a support link filed under that name is misnamed
// for anyone navigating by landmark. Two navs, one flex row, so they read as
// one quiet line. Donate fires the same tab switch every other Donate
// affordance in the app already uses; no second mechanism for one action.
export function AppFooter({
  hiddenOnDesktopDesk = false,
  onOpenDonate,
  supportMailto,
}: AppFooterProps) {
  return (
    <footer
      className={hiddenOnDesktopDesk
        ? "mt-auto w-full border-t border-hairline lg:hidden"
        : "mt-auto w-full border-t border-hairline"}
    >
      {/* pb-24 below lg is clearance for the fixed MobileTabBar (≥56px with
          its safe-area inset), the same reserve the scrolling content wrapper
          above carries — without it the bar overlays this row at full scroll.
          ≥lg has no fixed bar, so the padding closes back to the mock's own
          18px and the footer is symmetrical there. */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-3 px-4 pt-[18px] pb-24 sm:px-8 lg:pb-[18px]">
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
