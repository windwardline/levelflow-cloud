import assert from "node:assert/strict";
import { describe, it } from "node:test";
// tsx has no covering tsconfig for tests/, so it falls back to esbuild's
// classic JSX transform here (unlike src/**/*.tsx, which uses the
// automatic runtime via tsconfig.app.json). React must be in scope.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useWorkspaceNav,
  WorkspaceNavContext,
  type GuideAnchor,
  type WorkspaceNav,
} from "../src/components/workspace/WorkspaceNav";

// No jsdom in this repo's unit-test stack: renderToStaticMarkup runs real
// hooks against a real Context without needing a DOM, which is enough to
// prove the provider/hook contract without pulling in new test infra.
function Probe({ onNav }: { onNav: (nav: WorkspaceNav) => void }) {
  const nav = useWorkspaceNav();
  onNav(nav);
  return null;
}

describe("WorkspaceNavContext", () => {
  it("delivers the provider's nav to consumers, and openGuide flips the guide-tab callback with the requested anchor", () => {
    const guideCalls: GuideAnchor[] = [];
    const nav: WorkspaceNav = {
      openAdvisor: () => {},
      openGuide: (anchor) => {
        guideCalls.push(anchor);
      },
      openInsights: () => {},
    };

    renderToStaticMarkup(
      <WorkspaceNavContext.Provider value={nav}>
        <Probe onNav={(n) => n.openGuide("cost-ratings")} />
      </WorkspaceNavContext.Provider>,
    );

    assert.deepEqual(guideCalls, ["cost-ratings"]);
  });

  it("throws when useWorkspaceNav is called outside a provider", () => {
    assert.throws(
      () => renderToStaticMarkup(<Probe onNav={() => {}} />),
      /useWorkspaceNav requires WorkspaceNavContext/,
    );
  });
});
