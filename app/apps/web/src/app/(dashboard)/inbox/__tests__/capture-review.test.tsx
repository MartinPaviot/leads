// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { CaptureReviewDrawer } from "@/app/(dashboard)/inbox/_capture-review";

describe("CaptureReviewDrawer (P1 03 inbox)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => cleanup());

  it("shows a retryable error when the captures fetch fails (not a silent empty)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as never;
    render(<CaptureReviewDrawer />);
    await waitFor(() =>
      expect(screen.getByText("Impossible de charger les captures à valider")).toBeTruthy(),
    );
    expect(screen.getByText("Réessayer")).toBeTruthy();
  });

  it("renders nothing when the queue loads empty (self-hide preserved)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ captures: [] }) }) as never;
    const { container } = render(<CaptureReviewDrawer />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText("Impossible de charger les captures à valider")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("shows the pending count when captures load", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ captures: [{ id: "1", summary: "Hi", from: "a@b.com", at: "" }] }) }) as never;
    render(<CaptureReviewDrawer />);
    await waitFor(() => expect(screen.getByText(/à valider/)).toBeTruthy());
  });
});
