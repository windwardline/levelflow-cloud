import { Gift } from "lucide-react";
import { DonationOptions } from "./DonationOptions";

type DonatePanelProps = {
  supportEmail: string;
};

export function DonatePanel({ supportEmail }: DonatePanelProps) {
  const donationFallbackHref = `mailto:${supportEmail}?subject=${encodeURIComponent("[Levelflow] Development support")}&body=${encodeURIComponent(
    "I would like the current donation link for Levelflow development and maintenance.",
  )}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(280px,0.4fr)]">
      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <Gift className="h-5 w-5 text-ink" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Development fund
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              Donate
            </h1>
          </div>
        </div>
        <DonationOptions fallbackHref={donationFallbackHref} />
      </section>
      <section className="terminal-panel p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-normal text-accent">
          What donations support
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
          App costs
        </h2>
        <p className="mt-4 text-sm leading-6 text-ink-muted">
          Levelflow runs on paid market-data, email, and hosting plans.
        </p>
      </section>
    </div>
  );
}
