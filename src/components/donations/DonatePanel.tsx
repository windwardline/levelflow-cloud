import { useIsMobileViewport } from "../../hooks/useMobileViewport";
import { DONATION_SUPPORT_COPY } from "../../lib/donationCopy";
import {
  MOBILE_FRAME,
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../mobileFrame";
import { DonationOptions } from "./DonationOptions";

type DonatePanelProps = {
  supportEmail: string;
};

export function DonatePanel({ supportEmail }: DonatePanelProps) {
  const donationFallbackHref = `mailto:${supportEmail}?subject=${encodeURIComponent("[Levelflow] Development support")}&body=${encodeURIComponent(
    "I would like the current donation link for Levelflow development and maintenance.",
  )}`;
  // Which composition this surface is (spec §17g): below lg a fixed-viewport
  // frame with the title pinned and the body scrolling inside it, at ≥lg the flat
  // 620px page, unchanged. Title and body are built once and placed by whichever
  // branch renders.
  const isMobile = useIsMobileViewport();

  // `.phead` (mirrors HistoryPanel/GuidePanel/ProfilePanel): the mock's 2px ink
  // rule under the title. Donate used to bury its own page title inside a card
  // beside a decorative icon under an accent-colored eyebrow — the exact icon +
  // accent-eyebrow + boxed-title cluster the branch's guards already forbid
  // elsewhere (surfaceComposition.test.ts's GuidePanel kill list).
  //
  // §17n: 19px on a 24px line with an 8px rule pad below lg — the mobile page head
  // the four titled surfaces share — takes this pinned block from 60px to 46px
  // (measured against the built CSS at 375x812).
  const title = (
    <h1 className="border-b-2 border-ink pb-3.5 text-2xl font-semibold tracking-normal text-ink max-lg:pb-2 max-lg:text-[19px] max-lg:leading-6">
      Donate
    </h1>
  );

  const body = (
    <>
      <div>
        <p className="eyebrow">
          Development fund
        </p>
        {/* Spec §17c's box-on-box sweep: "a bordered sheet survives only where
            it is a true interactive affordance… never as passive grouping."
            The donation options ARE affordances and keep their own borders —
            each is a .secondary-button link — but the sheet that used to wrap
            them was a box drawn around buttons, which is the shape the sweep
            removes. Nothing else changes: the same options, the same wiring. */}
        <section className="mt-3">
          <DonationOptions fallbackHref={donationFallbackHref} />
        </section>
      </div>

      <div>
        {/* Owner ruling (2026-08-02): one sentence pair, on every screen that says
            what a donation pays for, from one constant (src/lib/donationCopy.ts).
            The two-word heading that used to sit between this eyebrow and that line
            went with it — it only re-titled the line beneath it, and now that the
            line names the costs AND the development, the heading said less than its
            own body (§17f). The eyebrow introduces the block, which is how every
            other block on this page is introduced. */}
        <p className="eyebrow">
          What donations support
        </p>
        <p className="mt-3 max-w-[62ch] text-sm leading-6 text-ink-muted sm:text-base sm:leading-7">
          {DONATION_SUPPORT_COPY}
        </p>
      </div>
    </>
  );

  if (isMobile) {
    // Spec §17g: "Guide and Donate (avatar-menu surfaces): pinned title, body
    // scrolls internally." The scroll region keeps the page's own 16px rhythm
    // between its two blocks — the same gap the ≥lg grid gives them — and, since
    // the owner's ruling of 2026-08-02, above the first of them too: the shared
    // pinned row ends at the h1's 2px rule and contributes no bottom padding
    // (MOBILE_FRAME_PINNED is one string on six surfaces), so the eyebrow began
    // 0px under that rule here while the ≥lg page gave the same pair 16px. The air
    // goes on the scrolling content, which is where ProfilePanel's first row
    // carries its own, and leaves the shared frame untouched for the other five.
    return (
      <div className={MOBILE_FRAME}>
        <div className={MOBILE_FRAME_PINNED}>{title}</div>
        <div className={MOBILE_FRAME_SCROLL} data-testid="mobile-donate-scroll">
          <div className="grid gap-4 pt-4">{body}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[620px] gap-4">
      {title}
      {body}
    </div>
  );
}
