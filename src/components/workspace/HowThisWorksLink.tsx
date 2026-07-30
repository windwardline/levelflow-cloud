import type { GuideAnchor } from "./WorkspaceNav";
import { useWorkspaceNav } from "./WorkspaceNav";

export function HowThisWorksLink({ anchor }: { anchor: GuideAnchor }) {
  const nav = useWorkspaceNav();
  return (
    <button
      type="button"
      onClick={() => nav.openGuide(anchor)}
      className="text-xs text-ink-muted underline decoration-hairline underline-offset-4 transition-colors hover:text-accent hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      How this works
    </button>
  );
}
