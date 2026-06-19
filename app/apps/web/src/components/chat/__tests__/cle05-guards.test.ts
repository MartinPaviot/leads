import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Static guards (eval steps 11 + 12). vitest runs from app/apps/web, so paths
 * resolve against the package root.
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("CLE-05 selector removal (AC-10)", () => {
  const actionCard = read("src/components/action-card.tsx");
  it("the dead approval-mode selector control is gone", () => {
    // Target the JSX control markers (eval step 11), not the doc comment prose.
    expect(actionCard).not.toContain('defaultValue="ask"');
    expect(actionCard).not.toContain('value="auto"');
    expect(actionCard).not.toContain('value="ask"');
    expect(actionCard).not.toContain("<select"); // the only <select> in the card was the dead one
  });
  it("ActionCard still wires Approve + Dismiss (create-card not regressed)", () => {
    expect(actionCard).toContain("onApprove");
    expect(actionCard).toContain("onDismiss");
  });
});

describe("CLE-05 single controller / no worsened duplication (AC-11)", () => {
  const page = read("src/app/(dashboard)/chat/page.tsx");
  it("the /chat page consumes the shared confirm controller + renderer", () => {
    expect(page).toContain("useActionConfirmCards");
    expect(page).toContain("ActionConfirmCards");
  });
  it("the /chat page adds NO inline page-action run logic (no runRegisteredAction copy)", () => {
    expect(page).not.toContain("runRegisteredAction");
  });
});

describe("CLE-05 wiring", () => {
  it("the dock renders the shared confirm-card queue", () => {
    const dock = read("src/components/chat/chat-dock.tsx");
    expect(dock).toContain("ActionConfirmCards");
    expect(dock).toContain("useActionConfirmCards");
  });
});
