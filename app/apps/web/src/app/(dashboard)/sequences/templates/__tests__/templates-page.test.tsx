// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/sequences/templates",
}));
const toastFn = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastFn }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import SequenceTemplatesPage from "@/app/(dashboard)/sequences/templates/page";

const sample = [
  {
    id: "post-funding",
    name: "Post-financement — félicitations, zéro pitch",
    description: "Une levée récente",
    triggerSignalTypes: ["post_funding"],
    personaFit: ["founder"],
    recipientBenefitAngle: "Lever change la priorité, pas le problème.",
    channels: ["email", "linkedin_message"],
    stepCount: 3,
    cadenceDays: 10,
    steps: [{ stepNumber: 1, stepType: "email", delayDays: 0, subjectTemplate: "Félicitations", valueAdded: "v" }],
    instantiated: false,
  },
  {
    id: "hiring-signal",
    name: "Recrutement en cours",
    description: "Une offre ouverte",
    triggerSignalTypes: ["hiring_signal"],
    personaFit: ["manager"],
    recipientBenefitAngle: "Le poste ouvert est le manque qu'on comble.",
    channels: ["email"],
    stepCount: 2,
    cadenceDays: 4,
    steps: [{ stepNumber: 1, stepType: "email", delayDays: 0, subjectTemplate: "Votre offre", valueAdded: "v" }],
    instantiated: true,
  },
];

function mockFetch(postStatus = 201) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return { ok: postStatus < 400, status: postStatus, json: async () => ({ result: { outcome: "created", sequenceId: "s1" } }) };
    }
    return { ok: true, status: 200, json: async () => ({ templates: sample }) };
  });
}

beforeEach(() => {
  toastFn.mockClear();
  global.fetch = mockFetch() as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SequenceTemplatesPage", () => {
  it("renders a card per template with name, trigger label, and angle", async () => {
    render(<SequenceTemplatesPage />);
    await waitFor(() => expect(screen.getByText(/Post-financement/)).toBeTruthy());
    expect(screen.getByText("Recrutement en cours")).toBeTruthy();
    // FR trigger label (not the raw signal key).
    expect(screen.getByText("Levée de fonds")).toBeTruthy();
    // The recipient-benefit angle is surfaced.
    expect(screen.getByText(/Lever change la priorité/)).toBeTruthy();
  });

  it("shows 'Utiliser ce modèle' for a fresh template and 'Ajouté' for an instantiated one", async () => {
    render(<SequenceTemplatesPage />);
    await waitFor(() => screen.getByText("Utiliser ce modèle"));
    // hiring-signal is instantiated → an 'Ajouté' badge + 'Ajouté' button.
    expect(screen.getAllByText("Ajouté").length).toBeGreaterThanOrEqual(1);
  });

  it("POSTs to instantiate when the use button is clicked", async () => {
    render(<SequenceTemplatesPage />);
    await waitFor(() => screen.getByText("Utiliser ce modèle"));
    fireEvent.click(screen.getByText("Utiliser ce modèle"));
    await waitFor(() => {
      const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const posted = calls.some((c) => (c[1] as RequestInit | undefined)?.method === "POST");
      expect(posted).toBe(true);
    });
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
  });

  it("surfaces a retry affordance on load failure", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    render(<SequenceTemplatesPage />);
    await waitFor(() => expect(screen.getByText(/Impossible de charger/)).toBeTruthy());
    expect(screen.getByText("Réessayer")).toBeTruthy();
  });
});
