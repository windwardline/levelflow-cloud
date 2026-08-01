import { useIsMobileViewport } from "../../hooks/useMobileViewport";
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
  const title = (
    <h1 className="border-b-2 border-ink pb-3.5 text-2xl font-semibold tracking-normal text-ink">
      Donate
    </h1>
  );

  const body = (
    <>
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
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
        <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
          What donations support
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-normal text-ink">
          App costs
        </h2>
        <p className="mt-3 max-w-[62ch] text-sm leading-6 text-ink-muted sm:text-base sm:leading-7">
          Levelflow runs on paid market-data, email, and hosting plans.
        </p>
      </div>
    </>
  );

  if (isMobile) {
    // Spec §17g: "Guide and Donate (avatar-menu surfaces): pinned title, body
    // scrolls internally." The scroll region keeps the page's own 16px rhythm
    // between its two blocks — the same gap the ≥lg grid gives them.
    return (
      <div className={MOBILE_FRAME}>
        <div className={MOBILE_FRAME_PINNED}>{title}</div>
        <div className={MOBILE_FRAME_SCROLL} data-testid="mobile-donate-scroll">
          <div className="grid gap-4">{body}</div>
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
