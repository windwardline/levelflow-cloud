// The three legal documents, in the order the footer's own link row lists them.
// Exported because spec §17g moves this trio into the mobile account menu, where
// it cannot render as this component: role="menu" admits only menuitem/group/
// separator children, so a <nav> landmark inside it would be an invalid child.
// The menu maps these entries onto its own menuitems instead, which keeps one
// source for what the documents are and where they live.
export const LEGAL_LINKS = [
  { href: `${import.meta.env.BASE_URL}legal/risk-disclaimer.html`, label: "Risk disclaimer" },
  { href: `${import.meta.env.BASE_URL}legal/privacy.html`, label: "Privacy" },
  { href: `${import.meta.env.BASE_URL}legal/terms.html`, label: "Terms" },
];

// Q1-#23: no align prop. There is one call site, it passed "left", and the
// "center" default and its justify-center were unreachable — a second layout kept
// alive by a default value nobody chose.
export function LegalLinks() {
  return (
    <nav
      aria-label="Legal"
      className="flex flex-wrap justify-start gap-x-4 gap-y-2 text-xs font-semibold text-ink-muted"
    >
      {LEGAL_LINKS.map((link) => (
        <a className="legal-link transition hover:text-ink" href={link.href} key={link.href} target="_blank" rel="noopener noreferrer">
          {link.label}
        </a>
      ))}
    </nav>
  );
}
