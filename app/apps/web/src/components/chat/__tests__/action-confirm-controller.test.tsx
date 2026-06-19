// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, render, screen } from "@testing-library/react";
import { z } from "zod";
import {
  useActionConfirmCards,
  ActionConfirmCards,
  type ActionConfirmController,
} from "../chat-action-cards";
import { useRegisterPageActions, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import type { InvokeActionDirective } from "@/lib/chat/ui-directives";
import { ACTION_RESULT_OPEN, ACTION_RESULT_CLOSE } from "@/lib/chat/page-actions/result-tags";

beforeEach(() => __resetPageActionsForTest());

function makeChat() {
  const sendMessage = vi.fn();
  return { chat: { sendMessage }, sendMessage };
}

function moveStage(run: PageAction["run"]): PageAction {
  return {
    id: "deal.moveStage",
    title: "Move stage",
    description: "Move the deal to a stage",
    params: z.object({ stage: z.string() }),
    run,
    mutating: true,
    reversible: true,
    confirm: "always",
  };
}

function directive(overrides: Partial<InvokeActionDirective> = {}): InvokeActionDirective {
  return {
    kind: "invokeAction",
    invocationId: "inv-1",
    actionId: "deal.moveStage",
    params: { stage: "Negotiation" },
    requireConfirm: true,
    ...overrides,
  };
}

function setup(actions: PageAction[], chat: { sendMessage: (m: { text: string }) => void }) {
  return renderHook(() => {
    useRegisterPageActions(actions);
    return useActionConfirmCards(chat);
  });
}

function decodeEnvelope(text: string) {
  expect(text.startsWith(ACTION_RESULT_OPEN)).toBe(true);
  expect(text.endsWith(ACTION_RESULT_CLOSE)).toBe(true);
  return JSON.parse(text.slice(ACTION_RESULT_OPEN.length, text.length - ACTION_RESULT_CLOSE.length));
}

describe("useActionConfirmCards", () => {
  it("REQUIRED — no-run-until-approve: enqueue does not run or round-trip (AC-1)", () => {
    const run = vi.fn(async () => ({ ok: true, summary: "moved" }) as PageActionResult);
    const { chat, sendMessage } = makeChat();
    const { result } = setup([moveStage(run)], chat);

    act(() => result.current.enqueueConfirm(directive()));

    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0].status).toBe("pending");
    expect(run).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("REQUIRED — edited params reach runRegisteredAction (AC-2)", async () => {
    const run = vi.fn(async () => ({ ok: true, summary: "moved to Won" }) as PageActionResult);
    const { chat } = makeChat();
    const { result } = setup([moveStage(run)], chat);

    act(() => result.current.enqueueConfirm(directive({ params: { stage: "Negotiation" } })));
    await act(async () => {
      await result.current.approveActionCard("inv-1", { stage: "Won" });
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ stage: "Won" });
  });

  it("approve round-trips an ok:true envelope with the matching invocationId (AC-2)", async () => {
    const run = vi.fn(async () => ({ ok: true, summary: "moved" }) as PageActionResult);
    const { chat, sendMessage } = makeChat();
    const { result } = setup([moveStage(run)], chat);

    act(() => result.current.enqueueConfirm(directive()));
    await act(async () => {
      await result.current.approveActionCard("inv-1", { stage: "Won" });
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const env = decodeEnvelope(sendMessage.mock.calls[0][0].text);
    expect(env).toMatchObject({ invocationId: "inv-1", ok: true, summary: "moved" });
    expect(result.current.pending[0].status).toBe("done");
  });

  it("dismiss round-trips a cancelled envelope and never runs (AC-3)", () => {
    const run = vi.fn(async () => ({ ok: true, summary: "x" }) as PageActionResult);
    const { chat, sendMessage } = makeChat();
    const { result } = setup([moveStage(run)], chat);

    act(() => result.current.enqueueConfirm(directive()));
    act(() => result.current.dismissActionCard("inv-1"));

    expect(run).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const env = decodeEnvelope(sendMessage.mock.calls[0][0].text);
    expect(env).toMatchObject({ invocationId: "inv-1", ok: false, error: "cancelled" });
    expect(result.current.pending[0].status).toBe("dismissed");
  });

  it("enqueue is idempotent per invocationId (E-5)", () => {
    const { chat } = makeChat();
    const { result } = setup([moveStage(vi.fn(async () => ({ ok: true, summary: "x" }) as PageActionResult))], chat);
    act(() => {
      result.current.enqueueConfirm(directive());
      result.current.enqueueConfirm(directive());
    });
    expect(result.current.pending).toHaveLength(1);
  });

  it("double-approve runs exactly once and round-trips one envelope (AC-8/E-4)", async () => {
    const run = vi.fn(async () => ({ ok: true, summary: "moved" }) as PageActionResult);
    const { chat, sendMessage } = makeChat();
    const { result } = setup([moveStage(run)], chat);

    act(() => result.current.enqueueConfirm(directive()));
    await act(async () => {
      const a = result.current.approveActionCard("inv-1", { stage: "Won" });
      const b = result.current.approveActionCard("inv-1", { stage: "Won" });
      await Promise.all([a, b]);
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("run-fails → failed state, Retry re-runs same params, final ok:true (E-3)", async () => {
    const run = vi
      .fn<PageAction["run"]>()
      .mockResolvedValueOnce({ ok: false, summary: "server error", error: "server_500" })
      .mockResolvedValueOnce({ ok: true, summary: "moved" });
    const { chat, sendMessage } = makeChat();
    const { result } = setup([moveStage(run)], chat);

    act(() => result.current.enqueueConfirm(directive()));
    await act(async () => {
      await result.current.approveActionCard("inv-1", { stage: "Won" });
    });
    expect(result.current.pending[0].status).toBe("failed");

    await act(async () => {
      await result.current.approveActionCard("inv-1", { stage: "Won" }); // Retry
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(result.current.pending[0].status).toBe("done");
    const last = decodeEnvelope(sendMessage.mock.calls.at(-1)![0].text);
    expect(last.ok).toBe(true);
  });

  it("unregistered action at approve → action_not_registered envelope (E-6)", async () => {
    const { chat, sendMessage } = makeChat();
    // Register a DIFFERENT action so the registry is non-empty but lacks this id.
    const { result } = setup([moveStage(vi.fn(async () => ({ ok: true, summary: "x" }) as PageActionResult))], chat);

    act(() => result.current.enqueueConfirm(directive({ invocationId: "inv-x", actionId: "nope.gone" })));
    await act(async () => {
      await result.current.approveActionCard("inv-x", {});
    });

    const env = decodeEnvelope(sendMessage.mock.calls[0][0].text);
    expect(env).toMatchObject({ invocationId: "inv-x", ok: false, error: "action_not_registered" });
    expect(result.current.pending[0].status).toBe("failed");
  });

  it("AC-5 — an invalid edit is re-validated: invalid_params envelope, handler NOT run, card correctable", async () => {
    const run = vi.fn(async () => ({ ok: true, summary: "moved" }) as PageActionResult);
    const { chat, sendMessage } = makeChat();
    const { result } = setup([moveStage(run)], chat); // params: z.object({ stage: z.string() })

    act(() => result.current.enqueueConfirm(directive()));
    await act(async () => {
      // stage must be a string; a number fails the live Zod schema in runRegisteredAction.
      await result.current.approveActionCard("inv-1", { stage: 123 });
    });

    expect(run).not.toHaveBeenCalled(); // AC-5: handler never runs on a bad edit
    const env = decodeEnvelope(sendMessage.mock.calls[0][0].text);
    expect(env).toMatchObject({ invocationId: "inv-1", ok: false, error: "invalid_params" });
    expect(env.summary).toContain("stage"); // names the offending field (surfaced in the card)
    expect(result.current.pending[0].status).toBe("failed"); // correctable: failed allows Retry
  });

  it("E-5 — two directives render two independent cards", () => {
    const { chat } = makeChat();
    let captured: ActionConfirmController | null = null;
    function Harness() {
      useRegisterPageActions([
        moveStage(vi.fn(async () => ({ ok: true, summary: "a" }) as PageActionResult)),
        {
          id: "deal.createDeal",
          title: "Create deal",
          description: "Create a new deal",
          params: z.object({ name: z.string() }),
          run: vi.fn(async () => ({ ok: true, summary: "b" }) as PageActionResult),
          mutating: true,
          confirm: "always",
        } as PageAction,
      ]);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      captured = useActionConfirmCards(chat);
      return <ActionConfirmCards controller={captured} />;
    }
    render(<Harness />);
    act(() => {
      captured!.enqueueConfirm(directive({ invocationId: "i1", actionId: "deal.moveStage" }));
      captured!.enqueueConfirm(directive({ invocationId: "i2", actionId: "deal.createDeal", params: { name: "Acme" } }));
    });
    expect(screen.getByText("Move stage")).toBeTruthy();
    expect(screen.getByText("Create deal")).toBeTruthy();
  });
});
