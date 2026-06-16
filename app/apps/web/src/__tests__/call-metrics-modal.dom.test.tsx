// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { CallMetricsModal } from "@/app/(dashboard)/call-mode/_metrics-modal";
import {
  computeCallMetrics,
  bestWindows,
  fmtPct,
  type OutcomeCounts,
  type TimeBucket,
} from "@/lib/voice/call-metrics";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Build a populated /api/calls/metrics payload exactly as the route would, so
 * the rendered numbers are the module's real output, not hand-typed strings. */
function populatedPayload() {
  const counts: OutcomeCounts = {
    dials: 120,
    connected: 9,
    meeting_booked: 3,
    callback_requested: 2,
    not_interested: 6,
    voicemail_left: 30,
    no_answer: 56,
    busy: 6,
    gatekeeper: 4,
    wrong_number: 3,
    do_not_call: 1,
    failed: 0,
  };
  const hours: TimeBucket[] = [
    { key: 9, dials: 40, connects: 4 },
    { key: 16, dials: 30, connects: 9 },
    { key: 11, dials: 30, connects: 5 },
  ];
  const dows: TimeBucket[] = [
    { key: 2, dials: 60, connects: 12 },
    { key: 4, dials: 60, connects: 6 },
  ];
  return {
    scope: "me",
    tz: "Europe/Zurich",
    windowDays: 30,
    counts,
    metrics: computeCallMetrics(counts),
    quality: {
      avgConnectedSec: 150,
      totalTalkMin: 50,
      avgTalkMinPerActiveDay: 25,
      avgTalkRatioPct: 58,
      activeDays: 2,
    },
    timing: {
      bestHours: bestWindows(hours, 3),
      bestDows: bestWindows(dows, 2),
      hours,
      dows,
    },
  };
}

function stubFetch(payload: unknown) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(payload) } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CallMetricsModal — populated dashboard", () => {
  it("renders the expert KPIs from real computed values", async () => {
    const payload = populatedPayload();
    const fetchMock = stubFetch(payload);
    const { container } = render(<CallMetricsModal open scope="me" onClose={() => {}} />);

    await waitFor(() => expect(container.textContent).toContain("Taux de connexion"));
    const text = container.textContent ?? "";

    // Connect rate = 20/120, rendered via the same fmtPct the UI uses.
    expect(text).toContain(fmtPct(payload.metrics.connectRate)); // "17%"
    // NRP is first-class and labelled.
    expect(text).toContain("NRP");
    expect(text).toContain(fmtPct(payload.metrics.nrpRate)); // "47%"
    // Efficiency: 120 dials / 3 meetings = 40.
    expect(text).toContain("Appels par RDV");
    expect(text).toContain("40");
    // Conversation quality.
    expect(text).toContain("Ratio de parole");
    expect(text).toContain("58 %");
    // Best time to call — best hour is 16h (30% connect), best day is mardi.
    expect(text).toContain("Meilleures heures");
    expect(text).toContain("16h");
    expect(text).toContain("Meilleurs jours");
    expect(text).toContain("mar.");

    // Data-quality + distribution labels present.
    expect(text).toContain("Mauvais numéro");
    expect(text).toContain("Répondeur");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/calls/metrics?scope=me"),
    );
  });
});

describe("CallMetricsModal — empty + closed", () => {
  it("shows the honest empty state when there are no calls", async () => {
    const counts: OutcomeCounts = {
      dials: 0, connected: 0, meeting_booked: 0, callback_requested: 0, not_interested: 0,
      voicemail_left: 0, no_answer: 0, busy: 0, gatekeeper: 0, wrong_number: 0, do_not_call: 0, failed: 0,
    };
    stubFetch({
      scope: "me", tz: "UTC", windowDays: 30, counts,
      metrics: computeCallMetrics(counts),
      quality: { avgConnectedSec: null, totalTalkMin: 0, avgTalkMinPerActiveDay: null, avgTalkRatioPct: null, activeDays: 0 },
      timing: { bestHours: [], bestDows: [], hours: [], dows: [] },
    });
    const { container } = render(<CallMetricsModal open scope="me" onClose={() => {}} />);
    await waitFor(() => expect(container.textContent).toContain("Pas encore d'appels"));
  });

  it("renders nothing while closed (no fetch)", () => {
    const fetchMock = stubFetch(populatedPayload());
    const { container } = render(<CallMetricsModal open={false} scope="me" onClose={() => {}} />);
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
