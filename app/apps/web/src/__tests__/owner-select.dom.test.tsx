// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { OwnerSelect } from "@/components/owner-select";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubMembers(members: Array<{ id: string; name: string; isSelf?: boolean }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ members }) } as Response)),
  );
}

describe("OwnerSelect", () => {
  it("renders Unassigned + member options (self tagged)", async () => {
    stubMembers([
      { id: "u1", name: "Marie", isSelf: true },
      { id: "u2", name: "Paul" },
    ]);
    const { container } = render(<OwnerSelect value={null} onChange={vi.fn()} />);
    await waitFor(() => expect(container.querySelectorAll("option").length).toBe(3));
    expect(container.textContent).toContain("Unassigned");
    expect(container.textContent).toContain("Marie (you)");
    expect(container.textContent).toContain("Paul");
  });

  it("defaultToSelf auto-selects the current user once members load", async () => {
    stubMembers([
      { id: "u1", name: "Marie", isSelf: true },
      { id: "u2", name: "Paul" },
    ]);
    const onChange = vi.fn();
    render(<OwnerSelect value={null} onChange={onChange} defaultToSelf />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("u1"));
  });

  it("does not auto-select when a value is already set", async () => {
    stubMembers([{ id: "u1", name: "Marie", isSelf: true }]);
    const onChange = vi.fn();
    const { container } = render(<OwnerSelect value="u2" onChange={onChange} defaultToSelf />);
    await waitFor(() => expect(container.querySelectorAll("option").length).toBeGreaterThan(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires onChange(null) when set back to Unassigned", async () => {
    stubMembers([{ id: "u1", name: "Marie", isSelf: true }]);
    const onChange = vi.fn();
    const { container } = render(<OwnerSelect value="u1" onChange={onChange} />);
    await waitFor(() => expect(container.querySelector("select")).toBeTruthy());
    fireEvent.change(container.querySelector("select")!, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
