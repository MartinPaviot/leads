// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, renderHook } from "@testing-library/react";
import { z } from "zod";
import { ActionConfirmCard, type ConfirmStatus } from "../action-confirm-card";
import { useRegisterPageActions, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";
import type { PageAction } from "@/lib/chat/page-actions/types";
import type { InvokeActionDirective } from "@/lib/chat/ui-directives";

beforeEach(() => __resetPageActionsForTest());

/** Register an action in the live store so getActionManifest() resolves it. */
function register(action: PageAction) {
  renderHook(() => useRegisterPageActions([action]));
}

function dir(actionId: string, params: Record<string, unknown>, invocationId = "inv-1"): InvokeActionDirective {
  return { kind: "invokeAction", invocationId, actionId, params, requireConfirm: true };
}

function noop() {}

describe("ActionConfirmCard (CLE-05)", () => {
  it("renders title, description, a risk badge and editable fields (AC-7, AC-6)", () => {
    register({
      id: "deal.moveStage",
      title: "Move stage",
      description: "Move the deal forward",
      params: z.object({ stage: z.enum(["Open", "Won"]) }),
      run: async () => ({ ok: true, summary: "ok" }),
      mutating: true,
      reversible: false, // → "Permanent" badge
      confirm: "always",
    });
    render(
      <ActionConfirmCard directive={dir("deal.moveStage", { stage: "Open" })} status="pending" onApprove={noop} onDismiss={noop} />,
    );
    expect(screen.getByText("Move stage")).toBeTruthy();
    expect(screen.getByText("Move the deal forward")).toBeTruthy();
    expect(screen.getByText("Permanent")).toBeTruthy();
    expect(screen.getByText("Confirm")).toBeTruthy(); // irreversible → "Confirm" label
  });

  it("editing a scalar then Approve hands the edited object to onApprove (AC-9)", () => {
    register({
      id: "contact.edit",
      title: "Edit note",
      description: "",
      params: z.object({ note: z.string() }),
      run: async () => ({ ok: true, summary: "ok" }),
      mutating: true,
      reversible: true, // reversible+free → "Run" label
      confirm: "always",
    });
    const onApprove = vi.fn();
    render(<ActionConfirmCard directive={dir("contact.edit", { note: "hi" })} status="pending" onApprove={onApprove} onDismiss={noop} />);

    const input = screen.getByDisplayValue("hi") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "bye" } });
    fireEvent.click(screen.getByText("Run"));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith({ note: "bye" });
  });

  it("malformed complex JSON blocks Approve and shows an inline error (E-1)", () => {
    register({
      id: "deal.tag",
      title: "Tag deal",
      description: "",
      params: z.object({ tags: z.array(z.string()) }),
      run: async () => ({ ok: true, summary: "ok" }),
      mutating: true,
      reversible: true,
      confirm: "always",
    });
    const onApprove = vi.fn();
    render(<ActionConfirmCard directive={dir("deal.tag", { tags: ["a"] })} status="pending" onApprove={onApprove} onDismiss={noop} />);

    fireEvent.click(screen.getByText("Edit as JSON"));
    const ta = screen.getByDisplayValue(/\[/) as HTMLTextAreaElement; // the raw JSON textarea
    fireEvent.change(ta, { target: { value: "[bad json" } });
    fireEvent.click(screen.getByText("Run"));

    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByText(/Invalid JSON/)).toBeTruthy();
  });

  it("running → Approve shows a spinner and is disabled (AC-8)", () => {
    register({
      id: "deal.moveStage",
      title: "Move stage",
      description: "",
      params: z.object({ stage: z.string() }),
      run: async () => ({ ok: true, summary: "ok" }),
      mutating: true,
      reversible: true,
      confirm: "always",
    });
    render(<ActionConfirmCard directive={dir("deal.moveStage", { stage: "Open" })} status={"running" as ConfirmStatus} onApprove={noop} onDismiss={noop} />);
    const btn = screen.getByText("Running").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("failed → shows a Retry affordance (E-3)", () => {
    register({
      id: "deal.moveStage",
      title: "Move stage",
      description: "",
      params: z.object({ stage: z.string() }),
      run: async () => ({ ok: true, summary: "ok" }),
      mutating: true,
      reversible: true,
      confirm: "always",
    });
    render(
      <ActionConfirmCard
        directive={dir("deal.moveStage", { stage: "Open" })}
        status={"failed" as ConfirmStatus}
        error="server_500"
        onApprove={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.getByText(/server_500/)).toBeTruthy();
  });

  it("failed-from-invalid-params surfaces the human summary naming the field (AC-5)", () => {
    register({
      id: "deal.moveStage",
      title: "Move stage",
      description: "",
      params: z.object({ stage: z.string() }),
      run: async () => ({ ok: true, summary: "ok" }),
      mutating: true,
      reversible: true,
      confirm: "always",
    });
    render(
      <ActionConfirmCard
        directive={dir("deal.moveStage", { stage: "Open" })}
        status={"failed" as ConfirmStatus}
        resultSummary={'Invalid parameters for "deal.moveStage": Invalid input (stage).'}
        error="invalid_params"
        onApprove={noop}
        onDismiss={noop}
      />,
    );
    // The descriptive message (naming the field) is shown, not the raw code.
    const footer = screen.getByText(/Invalid parameters/);
    expect(footer.textContent).toContain("(stage)");
    expect(footer.textContent).not.toContain("Failed: invalid_params"); // not the raw code alone
    expect(screen.getByText("Retry")).toBeTruthy(); // still correctable
  });

  it("unregistered action → unavailable state, Dismiss-only, Approve hidden (E-6/AC-7)", () => {
    // Nothing registered for this id.
    render(<ActionConfirmCard directive={dir("nope.gone", { x: 1 })} status="pending" onApprove={noop} onDismiss={noop} />);
    expect(screen.getByText(/no longer available/i)).toBeTruthy();
    expect(screen.getByText("Dismiss")).toBeTruthy();
    expect(screen.queryByText("Run")).toBeNull();
    expect(screen.queryByText("Confirm")).toBeNull();
  });

  it("requireConfirm:true read-only action → no risk badge but card still gates (E-8)", () => {
    register({
      id: "accounts.applyFilter",
      title: "Apply filter",
      description: "Filter the list",
      params: z.object({ sector: z.string() }),
      run: async () => ({ ok: true, summary: "ok" }),
      mutating: false, // read-only
      confirm: "never",
    });
    render(<ActionConfirmCard directive={dir("accounts.applyFilter", { sector: "tech" })} status="pending" onApprove={noop} onDismiss={noop} />);
    // No risk badges for a read-only action…
    expect(screen.queryByText("Updates a record")).toBeNull();
    expect(screen.queryByText("Permanent")).toBeNull();
    expect(screen.queryByText("Sends externally")).toBeNull();
    // …but the confirm gate is still honoured (Approve present).
    expect(screen.getByText("Run")).toBeTruthy();
  });
});
