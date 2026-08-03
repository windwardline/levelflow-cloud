import { useIsMobileViewport } from "../../hooks/useMobileViewport";
import { legalDocument, type LegalSlug } from "../../lib/legalDocuments";
import {
  MOBILE_FRAME,
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../mobileFrame";

type LegalDocumentPanelProps = {
  slug: LegalSlug;
};

// Spec §17o tier 2: "Risk disclaimer, Privacy and Terms are Levelflow's own
// writing, so reading them is not leaving." This is where they are read inside the
// app — the surface that replaced the new tab those three links used to spawn.
//
// It is deliberately not a new kind of page. The composition is the one the app
// already has for a titled reading surface, taken from the two closest neighbours
// rather than designed again: ≥lg is Profile's 880px editorial sheet, below lg is
// the §17g fixed frame with the title pinned over one scrolling region, exactly as
// DonatePanel and GuidePanel are built. The prose comes from
// src/lib/legalDocuments.ts, which the published files under public/legal/ are held
// to in both directions (tests/legalDocuments.test.ts), so this surface can never
// be a second, drifting copy of a legal notice.
//
// The heading is the document's name — "Risk disclaimer", "Privacy", "Terms", the
// labels the footer's own link row already used. The published pages put the
// wordmark in their h1 and the document's name in an eyebrow above it, because a
// standalone page has to say whose document it is; in here the masthead has said
// that already, so an h1 reading "Levelflow" would name the app twice and the
// document not at all.
//
// No return control, and none invented: the reader arrives with the app's whole
// navigation still on screen — the masthead's tabs at ≥lg, the tab bar and the
// account menu below lg — and since §17o tier 1 the browser's own Back walks the
// surface path, which is the one control every reader already knows and the only
// one a phone's OS offers. A word here saying "go back" would be a string for
// something three visible affordances already do (§17f).
export function LegalDocumentPanel({ slug }: LegalDocumentPanelProps) {
  const doc = legalDocument(slug);
  const isMobile = useIsMobileViewport();

  // The ruled page head the four titled surfaces carry, character for character
  // (C1: Tailwind's scanner reads source text, so the class list has to exist
  // whole — which is also what stops a fifth surface's head from being nearly the
  // same as the other four). §17n's mobile sizing rides in it.
  const title = (
    <h1 className="border-b-2 border-ink pb-3.5 text-2xl font-semibold tracking-normal text-ink max-lg:pb-2 max-lg:text-[19px] max-lg:leading-6">
      {doc.title}
    </h1>
  );

  // GuidePanel's own multi-paragraph body: the app's reading measure and its
  // muted body type, one gap between paragraphs. The 880px sheet below is the
  // column; 62ch is the line length inside it.
  const body = (
    <div className="grid max-w-[62ch] gap-3 text-sm leading-6 text-ink-muted sm:text-base sm:leading-7">
      {doc.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </div>
  );

  if (isMobile) {
    // §17g: pinned title, body scrolls internally. The 16px above the first
    // paragraph is the gap the ≥lg grid gives the same pair, since the shared
    // pinned row ends at the h1's rule and contributes no bottom padding of its
    // own — the same reason DonatePanel's scroll region carries its own pt-4.
    return (
      <div className={MOBILE_FRAME}>
        <div className={MOBILE_FRAME_PINNED}>{title}</div>
        <div className={MOBILE_FRAME_SCROLL} data-testid="mobile-document-scroll">
          <div className="pt-4">{body}</div>
        </div>
      </div>
    );
  }

  // Profile's 880px sheet, claimed rather than capped — and measured, which is how
  // the difference showed up. The ≥lg content region is `mx-auto` inside a grid row,
  // so its used width is fit-content: it takes the width of what it holds. Profile's
  // rows are wide enough to push it to 880 on their own, but this surface's widest
  // child is a paragraph block capped at the app's 62ch reading measure — so
  // `w-full max-w-[880px]` resolved to 626px in the built CSS at 1280, an 880 that
  // was never once 880. A definite width is what a fit-content parent can size to;
  // max-w-full is what keeps it inside the region at the narrow end of ≥lg (at the
  // 1024px breakpoint the region's own 32px gutters leave 960).
  return (
    <div className="mx-auto w-[880px] max-w-full" data-testid="document-panel">
      {title}
      <div className="mt-4">{body}</div>
    </div>
  );
}
