import { DonationOptions } from "./DonationOptions";

type DonatePanelProps = {
  supportEmail: string;
};

export function DonatePanel({ supportEmail }: DonatePanelProps) {
  const donationFallbackHref = `mailto:${supportEmail}?subject=${encodeURIComponent("[Levelflow] Development support")}&body=${encodeURIComponent(
    "I would like the current donation link for Levelflow development and maintenance.",
  )}`;

  return (
    <div className="mx-auto grid w-full max-w-[620px] gap-4">
      {/* `.phead` (mirrors HistoryPanel/GuidePanel/ProfilePanel): the mock's
          2px ink rule under the title. Donate used to bury its own page
          title inside a card beside a decorative icon under an
          accent-colored eyebrow — the exact icon + accent-eyebrow +
          boxed-title cluster the branch's guards already forbid elsewhere
          (surfaceComposition.test.ts's GuidePanel kill list). */}
      <h1 className="border-b-2 border-ink pb-3.5 text-2xl font-semibold tracking-normal text-ink">
        Donate
      </h1>

      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
          Development fund
        </p>
        {/* ProfilePanel's own card treatment — hairline border, sheet bg,
            tight padding — reused for the one block on this page that's a
            real card: the interactive donation options. */}
        <section className="mt-3 terminal-panel px-[22px] py-[18px]">
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
    </div>
  );
}
