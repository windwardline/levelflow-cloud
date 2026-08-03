import type { MouseEvent } from "react";
import {
  LEGAL_SLUGS,
  legalDocument,
  type LegalSlug,
} from "../../lib/legalDocuments";

// The three documents' own module owns what they are called and where they are
// published (src/lib/legalDocuments.ts, which the files under public/legal/ are
// held to in both directions). This file owns how a reader reaches them.

// Where the published file lives, joined to the base Vite was built with. The href
// is real on every surface: §17o tier 2 presents these documents in the frame, but
// it presents them from a link rather than a button dressed as one, so a reader can
// still copy the address or open it deliberately in a tab of its own.
export function legalDocumentHref(slug: LegalSlug): string {
  return `${import.meta.env.BASE_URL}${legalDocument(slug).file}`;
}

// The click the app answers itself, versus the click that belongs to the browser.
//
// §17o tier 1: an in-app destination switches surfaces and never spawns, and tier 2
// makes these documents in-app destinations. So a plain left click is intercepted
// and presented in the frame. Anything a reader uses to mean "not here" — ⌘, Ctrl,
// Shift, Alt, or the middle button — is left alone, which is the whole difference
// between keeping the href and pretending to.
//
// Exported because spec §17g moves this trio into the mobile account menu, where it
// cannot render as this component: role="menu" admits only menuitem/group/separator
// children, so a <nav> landmark inside it would be an invalid child. The menu maps
// the same slugs onto its own menuitems, and both call sites must answer a click
// the same way.
export function openInFrame(
  event: MouseEvent<HTMLAnchorElement>,
  slug: LegalSlug,
  onOpen: ((slug: LegalSlug) => void) | undefined,
): void {
  if (!onOpen) {
    return;
  }
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  onOpen(slug);
}

type LegalLinksProps = {
  // The document showing right now, when one is: its own link says so instead of
  // offering to send the reader where they already are. §17o's self-link ruling,
  // which the published pages' own footers follow too.
  current?: LegalSlug | null;
  // Present inside the app, absent on the signed-out surfaces. Absent means these
  // are plain links and the click navigates — in the SAME tab, which §17o requires
  // and which the 2026-08-02 session fix made safe: a Levelflow session belongs to
  // the browser session rather than to one tab, so leaving and coming back no
  // longer signs anyone out.
  onOpen?: (slug: LegalSlug) => void;
};

// Q1-#23: no align prop. There is one call site, it passed "left", and the
// "center" default and its justify-center were unreachable — a second layout kept
// alive by a default value nobody chose.
export function LegalLinks({ current, onOpen }: LegalLinksProps) {
  return (
    <nav
      aria-label="Legal"
      className="flex flex-wrap justify-start gap-x-4 gap-y-2 text-xs font-semibold text-ink-muted"
    >
      {LEGAL_SLUGS.map((slug) => (
        <a
          aria-current={current === slug ? "page" : undefined}
          // Ink for the document you are reading, against the row's muted rest
          // state — the mark the masthead's own current tab uses, and the same one
          // the published pages' rows take (legal.css's aria-current rule). Two
          // complete literals rather than a base plus an override: Tailwind's
          // scanner reads source text (C1).
          className={current === slug
            ? "legal-link text-ink transition"
            : "legal-link transition hover:text-ink"}
          href={legalDocumentHref(slug)}
          key={slug}
          onClick={(event) => openInFrame(event, slug, onOpen)}
        >
          {legalDocument(slug).title}
        </a>
      ))}
    </nav>
  );
}
