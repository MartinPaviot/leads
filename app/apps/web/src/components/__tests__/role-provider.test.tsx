/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RoleProvider,
  useCan,
  useRole,
  useIsViewer,
  useIsAdmin,
  Can,
} from "../role-provider";

function Probe() {
  return (
    <div>
      <span data-testid="role">{useRole()}</span>
      <span data-testid="canWrite">{String(useCan("contacts:write"))}</span>
      <span data-testid="canBilling">{String(useCan("billing:manage"))}</span>
      <span data-testid="isViewer">{String(useIsViewer())}</span>
      <span data-testid="isAdmin">{String(useIsAdmin())}</span>
    </div>
  );
}

function renderAs(role: string) {
  return render(
    <RoleProvider role={role}>
      <Probe />
    </RoleProvider>,
  );
}

describe("RoleProvider + hooks", () => {
  it("exposes the role and mirrors server permissions for a member", () => {
    renderAs("member");
    expect(screen.getByTestId("role").textContent).toBe("member");
    expect(screen.getByTestId("canWrite").textContent).toBe("true");
    expect(screen.getByTestId("canBilling").textContent).toBe("false");
    expect(screen.getByTestId("isViewer").textContent).toBe("false");
    expect(screen.getByTestId("isAdmin").textContent).toBe("false");
  });

  it("viewer can read nothing-write and is flagged read-only", () => {
    renderAs("viewer");
    expect(screen.getByTestId("canWrite").textContent).toBe("false");
    expect(screen.getByTestId("canBilling").textContent).toBe("false");
    expect(screen.getByTestId("isViewer").textContent).toBe("true");
  });

  it("admin can do everything", () => {
    renderAs("admin");
    expect(screen.getByTestId("canWrite").textContent).toBe("true");
    expect(screen.getByTestId("canBilling").textContent).toBe("true");
    expect(screen.getByTestId("isAdmin").textContent).toBe("true");
  });

  it("defaults to member when no provider wraps the tree", () => {
    render(<Probe />);
    expect(screen.getByTestId("role").textContent).toBe("member");
  });
});

describe("<Can>", () => {
  it("renders children only when the permission is granted", () => {
    render(
      <RoleProvider role="viewer">
        <Can permission="contacts:write">
          <span>write-control</span>
        </Can>
        <Can permission="contacts:read">
          <span>read-control</span>
        </Can>
      </RoleProvider>,
    );
    expect(screen.queryByText("write-control")).toBeNull();
    expect(screen.queryByText("read-control")).not.toBeNull();
  });

  it("shows the fallback when denied", () => {
    render(
      <RoleProvider role="viewer">
        <Can permission="members:invite" fallback={<span>read-only</span>}>
          <span>invite-box</span>
        </Can>
      </RoleProvider>,
    );
    expect(screen.queryByText("invite-box")).toBeNull();
    expect(screen.queryByText("read-only")).not.toBeNull();
  });
});
