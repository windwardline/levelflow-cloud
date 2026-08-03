// The three documents Levelflow publishes, and the only place their prose lives.
//
// Spec §17o tier 2: they are the app's own writing, so reading them is not
// leaving — inside the app they open as a surface (LegalDocumentPanel), and
// public/legal/*.html stay the published files that direct links, search engines
// and every signed-out reader land on. Two presentations of one document, which
// only holds if one of them is not a copy: this module owns the words, the surface
// renders them, and tests/legalDocuments.test.ts holds the static files to them in
// both directions.
//
// Why a module and not a runtime fetch of the published HTML — the §17o
// adjudication, recorded where the choice was made: a fetch would put a request, a
// parse, and an injection of markup this app did not itself build between a reader
// and a legal notice, and it would still need this file's other half (which
// document is called what). The property that matters — the words are the same
// words — is a comparison, and a comparison belongs in CI rather than in the
// reader's browser.
//
// The prose below was lifted from the published files mechanically, not retyped.

export type LegalSlug = "risk-disclaimer" | "privacy" | "terms";

export type LegalDocument = {
  slug: LegalSlug;
  // What the reader clicked, and so what the surface calls itself. The footer's
  // own labels (§17f: no new strings for a surface that already had a name).
  title: string;
  // The word the published page prints above the wordmark, and the name its
  // scrolling region announces with. Kept here so the two cannot disagree.
  eyebrow: string;
  // The published file, relative to the site root — joined to Vite's BASE_URL at
  // the call sites that link to it, and read straight from public/ by the guard.
  file: string;
  paragraphs: string[];
};

// Declaration order is the footer's order (§17c: one identical link row
// everywhere), which is also LEGAL_SLUGS' order below.
const DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  "risk-disclaimer": {
    slug: "risk-disclaimer",
    title: "Risk disclaimer",
    eyebrow: "Disclaimer",
    file: "legal/risk-disclaimer.html",
    paragraphs: [
      "Levelflow is software for market review and trade planning. It does not place trades, manage brokerage accounts, or provide personalized financial, investment, legal, tax, or accounting advice.",
      "Trading foreign exchange, commodities, indices, contracts for difference, futures, or other leveraged instruments involves substantial risk. You can lose money or experience platform, data, connectivity, and order-placement failures.",
      "Market data, news data, confidence scores, and saved setups can be delayed, incomplete, inaccurate, interrupted, or unavailable. You are solely responsible for reviewing all information, confirming the rules of any trading venue you use, and deciding whether any trading action is appropriate.",
      "The Valid until time is an app review window. Confirm current market conditions before placing, keeping, changing, or canceling any order outside Levelflow.",
      "Levelflow does not guarantee profitability, signal accuracy, risk reduction, or avoidance of losses. Use the platform only if you understand and accept these risks.",
    ],
  },
  "privacy": {
    slug: "privacy",
    title: "Privacy",
    eyebrow: "Privacy",
    file: "legal/privacy.html",
    paragraphs: [
      "Levelflow collects the information needed to operate the app, including login email, sign-in identifiers, saved profile preferences, market-review records, saved setups, system notices, and error reports.",
      "Sign-in, database, and market-data services are handled through trusted service providers. Levelflow keeps market-data keys on the server and does not intentionally expose them in browser JavaScript.",
      "We use collected information to sign users in, keep each user's saved data separate, support market-review workflows, troubleshoot errors, track setup outcomes, and improve the product.",
      "Do not enter brokerage passwords, banking credentials, tax identifiers, government identifiers, or other sensitive personal data into Levelflow unless a specific secured workflow is added for that purpose.",
      "To request deletion or correction of stored app data, contact Windward Line through the channel used to invite you to Levelflow.",
    ],
  },
  "terms": {
    slug: "terms",
    title: "Terms",
    eyebrow: "Terms",
    file: "legal/terms.html",
    paragraphs: [
      "Levelflow is provided by Windward Line as software for market review and trade planning. By using Levelflow, you agree to use it only for lawful purposes and to comply with applicable exchange, broker, data, and platform rules.",
      "Levelflow does not place trades, hold funds, guarantee outcomes, or replace your independent judgment. You remain responsible for every trading decision and every account action.",
      "Refresh any setup after its Valid until time before using its levels. Levelflow may clear or update prior setups when the current market no longer passes review.",
      "You may not attempt to bypass sign-in, access another user's data, extract service credentials, abuse market-data endpoints, or use Levelflow in a way that could impair service availability or violate third-party terms.",
      "The app may change, experience downtime, or produce incomplete or delayed information. Levelflow is provided without warranties to the maximum extent permitted by law.",
    ],
  },
};

export const LEGAL_DOCUMENTS = DOCUMENTS;

export const LEGAL_SLUGS = Object.keys(DOCUMENTS) as LegalSlug[];

export function legalDocument(slug: LegalSlug): LegalDocument {
  return DOCUMENTS[slug];
}

// Whether a value off a history state or a link is one of the three. The document
// surface is reached by slug, and a slug that came from outside this module is not
// a slug until it has been through here.
export function isLegalSlug(value: unknown): value is LegalSlug {
  return typeof value === "string" && value in DOCUMENTS;
}
