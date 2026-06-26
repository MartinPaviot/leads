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
const FIXTURE_MEMORY = {
  memory: {
    standingInstructions: [{ id: "1", text: "Keep replies under 120 words" }],
    aboutMe: { signOffName: "M. Paviot", companyLine: "Elevay — GTM for founders", keyColleagues: ["Anna"] },
  },
};

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
  if (u === "/api/inbox/memory" && m === "GET") return jsonRes(FIXTURE_MEMORY);
  if (u === "/api/inbox/memory" && m === "PUT") return jsonRes(FIXTURE_MEMORY);
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

describe("Voice & Writing — folded-in inbox-memory config", () => {
  it("loads standing instructions + company line from /api/inbox/memory", async () => {
    render(<WritingStylePage />);
    await waitFor(() => expect(screen.getByText("Standing instructions")).toBeTruthy(), { timeout: 8000 });
    expect((screen.getByDisplayValue("Keep replies under 120 words") as HTMLInputElement)).toBeTruthy();
    expect((screen.getByDisplayValue("Elevay — GTM for founders") as HTMLInputElement)).toBeTruthy();
    // NO second sign-off field here — writing-style.signOff is the single source,
    // so memory.signOffName ("M. Paviot") is never rendered as an editable field.
    expect(screen.queryByDisplayValue("M. Paviot")).toBeNull();
  });

  it("Save round-trips the full memory (preserving signOffName/keyColleagues) to /api/inbox/memory", async () => {
    render(<WritingStylePage />);
    await waitFor(() => expect(screen.getByText("Standing instructions")).toBeTruthy(), { timeout: 8000 });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => expect(callsTo("/api/inbox/memory", "PUT").length).toBe(1));
    const body = bodyOf(callsTo("/api/inbox/memory", "PUT")[0]) as typeof FIXTURE_MEMORY.memory;
    // standing instructions + company line round-trip; signOffName/keyColleagues preserved untouched
    expect(body.standingInstructions).toEqual([{ id: "1", text: "Keep replies under 120 words" }]);
    expect(body.aboutMe.companyLine).toBe("Elevay — GTM for founders");
    expect(body.aboutMe.signOffName).toBe("M. Paviot");
    expect(body.aboutMe.keyColleagues).toEqual(["Anna"]);
  });

  it("does NOT overwrite a folded-in store whose GET failed (no wipe on partial load failure)", async () => {
    // writing-style + voice load fine, but the memory GET 500s. The page still
    // renders (writing-style is load-bearing), so Save is live — it must SKIP the
    // memory PUT, otherwise the in-state default would erase the stored record.
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      const m = init?.method ?? "GET";
      if (u === "/api/inbox/memory" && m === "GET") return Promise.resolve(jsonRes({}, false));
      return Promise.resolve(router(u, init));
    });
    render(<WritingStylePage />);
    await waitFor(() => expect(screen.getByText("Standing instructions")).toBeTruthy(), { timeout: 8000 });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => expect(callsTo("/api/inbox/writing-style", "PUT").length).toBe(1));
    // the un-loaded memory store is never written -> stored data preserved
    expect(callsTo("/api/inbox/memory", "PUT").length).toBe(0);
    // the stores that DID load still persist
    expect(callsTo("/api/inbox/voice", "PUT").length).toBe(1);
  });
});
