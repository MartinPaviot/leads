import { describe, it, expect } from "vitest";
import {
  ADMIN_ONLY_TOOLS,
  DESTRUCTIVE_TOOLS,
  VIEWER_GATEWAY_TOOLS,
  legacyIsViewerAllowed,
  toolAdminOnly,
  toolViewerAllowed,
  resolveCapabilities,
} from "@/lib/agents/capability-resolver";
import { getRoutedToolNames } from "@/lib/chat/tool-router";

/**
 * KEYSTONE parity test (CLE-12 design §9). The migration moved the admin-only
 * and viewer verdicts from hand-listed Sets to a derivation over the unified
 * matrix (permissions.ts). This test proves the migration changed PLUMBING, not
 * POLICY: for every tool the matrix-derived verdict reproduces the legacy
 * verdict, except for the single declared INTENTIONAL_DELTA.
 */

/**
 * Tools whose derived admin-only verdict INTENTIONALLY differs from the legacy
 * ADMIN_ONLY_TOOLS set, each with a cited reason. The test asserts the delta
 * set is EXACTLY this list — a silent divergence fails CI.
 *
 * - deleteKnowledgeEntry: legacy was DESTRUCTIVE-only (admin-only=false); the
 *   matrix maps it to knowledge:write (admin), so deleting knowledge is now
 *   admin-only — design §3.3 explicitly lists this mapping (gap-closing, the
 *   create/update knowledge tools were already admin-only).
 */
const INTENTIONAL_ADMIN_ONLY_DELTAS = new Set<string>(["deleteKnowledgeEntry"]);

/** No viewer-verdict deltas are intended: every legacy viewer carve-out is
 *  reproduced by the gateway short-circuit + matrix verdict + group fallback. */
const INTENTIONAL_VIEWER_DELTAS = new Set<string>([]);

// The representative tool universe: the routed tool names (every tool in
// buildAllChatTools must be mapped there — enforced by the drift-guard test)
// plus the legacy Set members, so unmapped destructive/admin tools are covered.
const ALL_TOOL_NAMES: string[] = Array.from(
  new Set<string>([
    ...getRoutedToolNames(),
    ...ADMIN_ONLY_TOOLS,
    ...DESTRUCTIVE_TOOLS,
    ...VIEWER_GATEWAY_TOOLS,
  ]),
);

describe("capability-resolver parity (matrix-derived vs legacy Sets)", () => {
  it("toolAdminOnly reproduces ADMIN_ONLY_TOOLS for every tool (modulo declared deltas)", () => {
    const observedDeltas = new Set<string>();
    for (const name of ALL_TOOL_NAMES) {
      const derived = toolAdminOnly(name);
      const legacy = ADMIN_ONLY_TOOLS.has(name);
      if (derived !== legacy) {
        observedDeltas.add(name);
        // Only declared deltas are allowed.
        expect(
          INTENTIONAL_ADMIN_ONLY_DELTAS.has(name),
          `Undeclared admin-only delta for "${name}": derived=${derived}, legacy=${legacy}`,
        ).toBe(true);
      }
    }
    // The delta set is EXACTLY the declared one (no missing declared deltas).
    expect([...observedDeltas].sort()).toEqual([...INTENTIONAL_ADMIN_ONLY_DELTAS].sort());
  });

  it("toolViewerAllowed reproduces the legacy viewer verdict for every tool", () => {
    const observedDeltas = new Set<string>();
    for (const name of ALL_TOOL_NAMES) {
      const derived = toolViewerAllowed(name);
      const legacy = legacyIsViewerAllowed(name);
      if (derived !== legacy) {
        observedDeltas.add(name);
        expect(
          INTENTIONAL_VIEWER_DELTAS.has(name),
          `Undeclared viewer delta for "${name}": derived=${derived}, legacy=${legacy}`,
        ).toBe(true);
      }
    }
    expect([...observedDeltas].sort()).toEqual([...INTENTIONAL_VIEWER_DELTAS].sort());
  });

  it("CLE-04 gateway preserved: invokePageAction stays viewer-allowed", () => {
    expect(toolViewerAllowed("invokePageAction")).toBe(true);
  });

  it("a delete tool with allowDestructive:false is still dropped destructive-gated (flag AND-ed)", () => {
    // deleteContact maps to contacts:delete (member HOLDS it), so the ROLE half
    // passes for a member; the FLAG half (allowDestructive:false) must still
    // drop it. The two gates are AND-ed; CLE-12 only derives the role half.
    const registry = { deleteContact: { name: "deleteContact" } };
    const off = resolveCapabilities(registry, { role: "member", allowDestructive: false });
    expect(off.tools.deleteContact).toBeUndefined();
    expect(off.droppedTools.find((d) => d.name === "deleteContact")?.reason).toBe(
      "destructive-gated",
    );
    const on = resolveCapabilities(registry, { role: "member", allowDestructive: true });
    expect(on.tools.deleteContact).toBeDefined();
  });

  it("resolveCapabilities drops the same admin-only tools for a member as before", () => {
    const registry: Record<string, { name: string }> = {};
    for (const n of ALL_TOOL_NAMES) registry[n] = { name: n };
    const member = resolveCapabilities(registry, { role: "member", allowDestructive: true });
    // Every admin-only tool (legacy set OR a declared delta) is dropped.
    for (const name of ADMIN_ONLY_TOOLS) {
      expect(member.tools[name], `member should not get admin tool ${name}`).toBeUndefined();
    }
    for (const name of INTENTIONAL_ADMIN_ONLY_DELTAS) {
      expect(member.tools[name], `member should not get newly-admin tool ${name}`).toBeUndefined();
    }
  });
});
