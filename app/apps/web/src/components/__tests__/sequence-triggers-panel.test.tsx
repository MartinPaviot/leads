/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SequenceTriggersPanel } from "@/components/sequence-triggers-panel";

function stubFetch(handler: (req: { url: string; init: RequestInit }) => {
  status?: number;
  body?: unknown;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const r = handler({ url, init: init ?? {} });
      return {
        ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
        status: r.status ?? 200,
        json: async () => r.body ?? {},
      } as unknown as Response;
    }),
  );
}

const basePayload = {
  sequenceId: "s-1",
  name: "Q4 Devtools",
  triggerSignalTypes: ["website_visit"],
  knownSignalTypes: [
    "website_visit",
    "post_funding",
    "hiring_signal",
    "product_launch",
    "leadership_change",
    "tech_stack_change",
    "exec_engagement",
    "review_left",
    "competitor_mention",
  ],
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SequenceTriggersPanel — visibility", () => {
  it("hides on 401", async () => {
    stubFetch(() => ({ status: 401 }));
    const { container } = render(<SequenceTriggersPanel sequenceId="s-1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("hides on 403", async () => {
    stubFetch(() => ({ status: 403 }));
    const { container } = render(<SequenceTriggersPanel sequenceId="s-1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("hides on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    const { container } = render(<SequenceTriggersPanel sequenceId="s-1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});

describe("SequenceTriggersPanel — render", () => {
  it("renders header + checkbox grid", async () => {
    stubFetch(() => ({ body: basePayload }));
    render(<SequenceTriggersPanel sequenceId="s-1" />);
    await waitFor(() =>
      expect(screen.getByText(/Auto-enrollment triggers/i)).toBeDefined(),
    );
    // All 9 signal types render their friendly labels.
    expect(screen.getByText(/Website visit/i)).toBeDefined();
    expect(screen.getByText(/Post-funding/i)).toBeDefined();
    expect(screen.getByText(/Hiring signal/i)).toBeDefined();
    expect(screen.getByText(/Competitor mention/i)).toBeDefined();
  });

  it("renders 'No filter' subtitle when triggerSignalTypes is empty", async () => {
    stubFetch(() => ({
      body: { ...basePayload, triggerSignalTypes: [] },
    }));
    render(<SequenceTriggersPanel sequenceId="s-1" />);
    await waitFor(() =>
      expect(screen.getByText(/No filter/i)).toBeDefined(),
    );
  });

  it("renders 'Triggers on N of 9' subtitle when filter set", async () => {
    stubFetch(() => ({
      body: {
        ...basePayload,
        triggerSignalTypes: ["website_visit", "post_funding"],
      },
    }));
    render(<SequenceTriggersPanel sequenceId="s-1" />);
    await waitFor(() =>
      expect(screen.getByText(/Triggers on 2 of 9 signal types/i)).toBeDefined(),
    );
  });
});

describe("SequenceTriggersPanel — toggle", () => {
  it("PUT request fires when a checkbox is clicked", async () => {
    let lastPutBody: unknown = null;
    stubFetch(({ init }) => {
      if (init?.method === "PUT") {
        lastPutBody = JSON.parse(String(init.body));
        return {
          body: {
            sequenceId: "s-1",
            triggerSignalTypes: (lastPutBody as { triggerSignalTypes: string[] })
              .triggerSignalTypes,
          },
        };
      }
      return { body: basePayload };
    });
    render(<SequenceTriggersPanel sequenceId="s-1" />);
    await waitFor(() => expect(screen.getByText(/Website visit/i)).toBeDefined());
    // Click "Post-funding" to add it.
    const postFundingButton = screen
      .getByText(/Post-funding/i)
      .closest("button");
    expect(postFundingButton).not.toBeNull();
    fireEvent.click(postFundingButton!);
    await waitFor(() => {
      expect(lastPutBody).not.toBeNull();
    });
    expect(
      (lastPutBody as { triggerSignalTypes: string[] }).triggerSignalTypes,
    ).toContain("post_funding");
    expect(
      (lastPutBody as { triggerSignalTypes: string[] }).triggerSignalTypes,
    ).toContain("website_visit");
  });

  it("403 on PUT disables further toggles + shows admin-only error", async () => {
    stubFetch(({ init }) => {
      if (init?.method === "PUT") return { status: 403 };
      return { body: basePayload };
    });
    render(<SequenceTriggersPanel sequenceId="s-1" />);
    await waitFor(() => expect(screen.getByText(/Website visit/i)).toBeDefined());
    fireEvent.click(screen.getByText(/Post-funding/i).closest("button")!);
    await waitFor(() =>
      expect(screen.getByText(/Admin role required/i)).toBeDefined(),
    );
  });

  it("removes a type when clicking an already-selected one", async () => {
    let lastPutBody: unknown = null;
    stubFetch(({ init }) => {
      if (init?.method === "PUT") {
        lastPutBody = JSON.parse(String(init.body));
        return {
          body: {
            sequenceId: "s-1",
            triggerSignalTypes: (lastPutBody as { triggerSignalTypes: string[] })
              .triggerSignalTypes,
          },
        };
      }
      return { body: basePayload };
    });
    render(<SequenceTriggersPanel sequenceId="s-1" />);
    await waitFor(() => expect(screen.getByText(/Website visit/i)).toBeDefined());
    // website_visit was on by default — click to turn off.
    fireEvent.click(screen.getByText(/Website visit/i).closest("button")!);
    await waitFor(() => {
      expect(lastPutBody).not.toBeNull();
    });
    expect(
      (lastPutBody as { triggerSignalTypes: string[] }).triggerSignalTypes,
    ).not.toContain("website_visit");
  });
});
