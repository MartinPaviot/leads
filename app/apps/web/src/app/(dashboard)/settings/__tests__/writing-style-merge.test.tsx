// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

/**
 * Settings IA voice merge — the retired /settings/inbox-voice page (tone + extra
 * guidance + pre-draft-on-open) folds into the canonical Voice & Writing surface.
 * This proves the fold-in: the page LOADS the guidance + auto-draft from the
 * existing inbox APIs, and Save PUTs them back — so no config is lost when
 * inbox-voice becomes a redirect.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/settings/writing-style",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import WritingStylePage from "@/app/(dashboard)/settings/writing-style/page";

const FIXTURE_STYLE = {
  style: { aboutMe: "", role: "", schedulingLink: "", signOff: "Martin", prompt: "", audiences: [] },
  defaultPrompt: "Write like the user.",
};
const FIXTURE_VOICE = {
  options: [
    { id: "neutral", label: "Neutral", hint: "" },
    { id: "warm", label: "Warm", hint: "" },
  ],
  voice: { tone: "neutral", customGuidance: "be punchy" },
};
const FIXTURE_AUTO = { autoDraft: { enabled: true } };

let fetchMock: ReturnType<typeof vi.fn>;
function jsonRes(data: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}
function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const m = init?.method ?? "GET";
  if (u === "/api/inbox/writing-style" && m === "GET") return jsonRes(FIXTURE_STYLE);
  if (u === "/api/inbox/writing-style" && m === "PUT") return jsonRes({ style: FIXTURE_STYLE.style });
  if (u === "/api/inbox/voice" && m === "GET") return jsonRes(FIXTURE_VOICE);
  if (u === "/api/inbox/voice" && m === "PUT") return jsonRes({ voice: FIXTURE_VOICE.voice });
  if (u === "/api/inbox/writing-style/derive") return jsonRes({ proposal: { status: "idle" } });
  if (u === "/api/inbox/auto-draft" && m === "GET") return jsonRes(FIXTURE_AUTO);
  if (u === "/api/inbox/auto-draft" && m === "PUT") return jsonRes(FIXTURE_AUTO);
  return jsonRes({});
}
function bodyOf(call: unknown[]) {
  return JSON.parse(((call[1] as RequestInit)?.body as string) || "{}");
}
function callsTo(url: string, method: string) {
  return fetchMock.mock.calls.filter((c) => String(c[0]) === url && (c[1]?.method ?? "GET") === method);
}

beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Voice & Writing — folded-in inbox-voice config", () => {
  it("loads the guidance + auto-draft from the inbox APIs", async () => {
    render(<WritingStylePage />);
    await waitFor(() => expect(screen.getByText("Pre-draft replies on open")).toBeTruthy(), { timeout: 8000 });
    // guidance loaded from /api/inbox/voice
    expect((screen.getByPlaceholderText(/Use the prospect's first name/i) as HTMLTextAreaElement).value).toBe("be punchy");
    // auto-draft loaded from /api/inbox/auto-draft (enabled)
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("Save PUTs the tone+guidance to /api/inbox/voice and the toggle to /api/inbox/auto-draft", async () => {
    render(<WritingStylePage />);
    await waitFor(() => expect(screen.getByText("Pre-draft replies on open")).toBeTruthy(), { timeout: 8000 });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => expect(callsTo("/api/inbox/voice", "PUT").length).toBe(1));
    expect(bodyOf(callsTo("/api/inbox/voice", "PUT")[0])).toEqual({ tone: "neutral", customGuidance: "be punchy" });
    expect(callsTo("/api/inbox/auto-draft", "PUT").length).toBe(1);
    expect(bodyOf(callsTo("/api/inbox/auto-draft", "PUT")[0])).toEqual({ enabled: true });
  });
});
