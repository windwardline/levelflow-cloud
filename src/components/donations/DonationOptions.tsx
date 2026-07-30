import { ExternalLink, Gift } from "lucide-react";
import { appConfig } from "../../lib/env";

type DonationOptionsProps = {
  fallbackHref: string;
  mode?: "compact" | "panel";
};

export function DonationOptions({ fallbackHref, mode = "panel" }: DonationOptionsProps) {
  const links = appConfig.donationLinks;
  const compact = mode === "compact";

  return (
    <div className={compact ? "rounded-lg border border-slate/15 bg-canvas p-3" : ""}>
      <p className="text-sm leading-6 text-slate">Donations support market data, email, hosting, and development.</p>
      {links.length > 0 ? (
        <div className={`mt-4 grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
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
        <a className="primary-button mt-4" href={fallbackHref}>
          <Gift className="h-4 w-4" aria-hidden="true" />
          Request donation link
        </a>
      )}
      {links.length > 0 && !compact ? (
        <div className="mt-4 grid gap-2 text-xs leading-5 text-slate">
          {links.map((link) => (
            <p key={link.url}>
              <span className="font-semibold text-navy">{link.label}:</span> {link.description}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
