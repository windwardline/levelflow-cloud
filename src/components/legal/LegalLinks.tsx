const legalLinks = [
  { href: `${import.meta.env.BASE_URL}legal/risk-disclaimer.html`, label: "Risk disclaimer" },
  { href: `${import.meta.env.BASE_URL}legal/privacy.html`, label: "Privacy" },
  { href: `${import.meta.env.BASE_URL}legal/terms.html`, label: "Terms" },
];

type LegalLinksProps = {
  align?: "center" | "left";
};

export function LegalLinks({ align = "center" }: LegalLinksProps) {
  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate ${align === "center" ? "justify-center" : "justify-start"}`}
    >
      {legalLinks.map((link) => (
        <a className="transition hover:text-navy" href={link.href} key={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      ))}
    </nav>
  );
}
