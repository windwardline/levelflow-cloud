import type { GuideAnchor } from "./WorkspaceNav";
import { useWorkspaceNav } from "./WorkspaceNav";

export function HowThisWorksLink({ anchor }: { anchor: GuideAnchor }) {
  const nav = useWorkspaceNav();
  return (
    <button
      type="button"
      onClick={() => nav.openGuide(anchor)}
      className="tertiary-link"
    >
      How this works
    </button>
  );
}
