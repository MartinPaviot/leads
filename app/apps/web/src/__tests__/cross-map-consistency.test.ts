import { describe, it, expect } from "vitest";
import {
  capabilityForRoute,
  capabilityForTool,
  capabilityForPageAction,
  type Capability,
} from "@/lib/auth/permissions";

/**
 * CLE-12 EC-8: the route map (path x method) and the tool map (tool name) are
 * SEPARATE derivations onto the SAME capability enum. For verbs that exist as
 * both a tool and a route, the two must agree on the capability — otherwise the
 * chat could perform a write the raw API would gate differently (or vice versa).
 */

describe("cross-map consistency (tool vs route share the same capability)", () => {
  const shared: Array<{
    verb: string;
    tool: string;
    route: [string, string]; // [path, method]
    cap: Capability;
  }> = [
    {
      verb: "delete contact",
      tool: "deleteContact",
      route: ["/api/contacts/abc", "DELETE"],
      cap: "contacts:delete",
    },
    {
      verb: "delete account/company",
      tool: "deleteAccount",
      route: ["/api/accounts/abc", "DELETE"],
      cap: "companies:delete",
    },
    {
      verb: "delete deal",
      tool: "deleteDeal",
      route: ["/api/opportunities/abc", "DELETE"],
      cap: "deals:delete",
    },
    {
      verb: "invite member",
      tool: "inviteMember",
      route: ["/api/settings/members/invite", "POST"],
      cap: "members:invite",
    },
    {
      verb: "compose / send email",
      tool: "composeEmail",
      route: ["/api/emails/send", "POST"],
      cap: "outbound:send",
    },
  ];

  for (const { verb, tool, route, cap } of shared) {
    it(`${verb}: tool "${tool}" and route ${route[1]} ${route[0]} both -> ${cap}`, () => {
      expect(capabilityForTool(tool)).toBe(cap);
      expect(capabilityForRoute(route[0], route[1])).toBe(cap);
    });
  }

  it("page action namespaces derive the matching CRM capability", () => {
    expect(
      capabilityForPageAction({ id: "contacts.update", mutating: true, reversible: true }),
    ).toBe("contacts:write");
    expect(
      capabilityForPageAction({ id: "contacts.delete", mutating: true, reversible: false }),
    ).toBe("contacts:delete");
    expect(
      capabilityForPageAction({ id: "accounts.delete", mutating: true, reversible: false }),
    ).toBe("companies:delete");
    expect(
      capabilityForPageAction({ id: "opportunities.delete", mutating: true, reversible: false }),
    ).toBe("deals:delete");
    // outbound + money beats namespace
    expect(
      capabilityForPageAction({ id: "sequences.launch", mutating: true, outbound: true, cost: "money", reversible: false }),
    ).toBe("outbound:paid");
    // pure read -> no capability (reachable; decideAction decides)
    expect(
      capabilityForPageAction({ id: "accounts.applyFilter", mutating: false }),
    ).toBeUndefined();
  });
});
