// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";

/**
 * EmailComposerPanel renders two ways from ONE component:
 *  - drawer (default): a right-edge slide-over, portalled to <body>, with a
 *    page-dimming backdrop. Used by standalone "new email" compose.
 *  - inline: an in-flow block (Gmail/Outlook reply pinned under the thread),
 *    no portal, no backdrop. Used by the inbox reply.
 * These tests pin that the `inline` prop flips between the two without leaking
 * the fixed drawer chrome into the inline path.
 */

const { toastApi } = vi.hoisted(() => ({ toastApi: { toast: () => {} } }));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => toastApi,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { EmailComposerPanel, type EmailComposerDraft } from "@/components/email-composer-panel";

const DRAFT: EmailComposerDraft = {
  to: "marie@ems.ch",
  subject: "Re: demo",
  body: "Bonjour Marie,",
};

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EmailComposerPanel — inline vs drawer", () => {
  it("inline: renders in the document flow — no slide-over drawer, no backdrop", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<EmailComposerPanel draft={DRAFT} inline onClose={() => {}} />));
    });
    await flush();

    // The fixed slide-over chrome must be absent everywhere.
    expect(document.querySelector(".slide-in-right")).toBeNull();
    // No page-dimming backdrop (the thread stays interactive behind the reply).
    expect(document.querySelector('[style*="overlay-fade-in"]')).toBeNull();
    // The composer body renders INSIDE the caller's container (not portalled away).
    expect(container.querySelector("textarea")).not.toBeNull();
    // The whole inline composer must be a scroll container (overflow-y-auto): on a
    // narrow/zoomed pane the tall To/Cc/Subject chrome exceeds the composer's share,
    // and only an own-scroll keeps the Send footer reachable (verified live).
    expect(container.querySelector(".overflow-y-auto")).not.toBeNull();
  });

  it("flushes the in-progress draft to localStorage on unmount (no lost keystrokes on close)", async () => {
    const store: Record<string, string> = {};
    const setItem = vi.fn((k: string, v: string) => { store[k] = v; });
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem, removeItem: () => {}, clear: () => {} });

    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(<EmailComposerPanel draft={{ to: "", subject: "", body: "" }} inline onClose={() => {}} />);
    });
    await flush();
    const textarea = result.container.querySelector("textarea")!;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Bonjour, dernier mot tapé" } });
    });
    // Unmount immediately (before the 800ms debounce fires) — the flush-on-unmount
    // must still persist the latest body so a click-away close loses nothing.
    setItem.mockClear();
    await act(async () => { result.unmount(); });
    expect(setItem).toHaveBeenCalled();
    expect(JSON.stringify(store)).toContain("dernier mot");
  });

  it("drawer (default): portals a slide-over + backdrop to <body>", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<EmailComposerPanel draft={DRAFT} onClose={() => {}} />));
    });
    await flush();

    // The drawer is portalled to <body>, so it is OUTSIDE the render container…
    expect(container.querySelector(".slide-in-right")).toBeNull();
    // …but present in the document, alongside a dimming backdrop.
    expect(document.querySelector(".slide-in-right")).not.toBeNull();
    expect(document.querySelector('[style*="overlay-fade-in"]')).not.toBeNull();
  });
});
