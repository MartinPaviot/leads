// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

/**
 * Spec 35 — Account-page targeting + suppression panel (T11). Verifies the
 * read-only-vs-deactivatable badge rule (R7.3/R7.6) and the manual-DNC + admin
 * deactivate calls, without a dev server.
 */

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { TargetingSuppressionPanel, type SuppressionBadge } from "@/app/(dashboard)/accounts/[id]/_targeting-suppression-panel";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => cleanup());

const sup = (over: Partial<SuppressionBadge>): SuppressionBadge => ({
  type: over.type ?? "manual_dnc",
  level: over.level ?? "account",
  value: over.value ?? "acct1",
  reason: over.reason ?? null,
  source: over.source ?? null,
  createdAt: over.createdAt ?? null,
});

describe("TargetingSuppressionPanel", () => {
  it("shows the targeting status", () => {
    render(<TargetingSuppressionPanel companyId="c1" targetingStatus="archived" suppressions={[]} onChange={() => {}} />);
    expect(screen.getByText("Archived")).toBeTruthy();
  });

  it("opt_out badge is read-only: 'Permanent', no Deactivate (R7.3)", () => {
    render(
      <TargetingSuppressionPanel
        companyId="c1"
        targetingStatus="targeted"
        suppressions={[sup({ type: "opt_out", level: "address", value: "a@b.com", source: "unsubscribe" })]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/Opt-out/)).toBeTruthy();
    expect(screen.getByText("Permanent")).toBeTruthy();
    expect(screen.queryByText("Deactivate")).toBeNull();
  });

  it("manual_dnc is deactivatable and POSTs to the deactivate route (R7.6)", async () => {
    const onChange = vi.fn();
    render(
      <TargetingSuppressionPanel
        companyId="c1"
        targetingStatus="targeted"
        suppressions={[sup({ type: "manual_dnc", level: "account", value: "acct1" })]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Deactivate"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/accounts/suppress/deactivate", expect.objectContaining({ method: "POST" })),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("manual 'Do not contact' add posts to the suppress route with the reason", async () => {
    const onChange = vi.fn();
    render(<TargetingSuppressionPanel companyId="c1" targetingStatus="targeted" suppressions={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Do not contact"));
    fireEvent.change(screen.getByPlaceholderText(/asked not to be contacted/), { target: { value: "left company" } });
    fireEvent.click(screen.getByText("Add to suppression list"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/accounts/suppress", expect.objectContaining({ method: "POST" })),
    );
    const body = JSON.parse((fetchMock.mock.calls.find((c) => c[0] === "/api/accounts/suppress")![1] as RequestInit).body as string);
    expect(body).toMatchObject({ level: "account", companyId: "c1", reason: "left company" });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
