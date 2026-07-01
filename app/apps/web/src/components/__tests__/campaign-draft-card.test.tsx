// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// sanitizeHtml is a DOM-walking sanitizer (Node.ELEMENT_NODE, attribute
// stripping) meant for a real browser; in happy-dom it isn't the unit under
// test. Stub it so these tests exercise the edit/approve behaviour, not the
// sanitizer's DOM internals.
vi.mock("@/lib/infra/sanitize-html", () => ({ sanitizeHtml: (s: string) => s }));

import { DraftReviewCard, htmlToText, textToHtml, type ReviewEmail } from "../campaign-draft-card";

const baseEmail: ReviewEmail = {
  id: "e-1",
  toAddress: "vp@acme.com",
  subject: "Quick question",
  bodyHtml: "<div>Hi there<br>Line two</div>",
  status: "draft",
  stepNumber: 1,
  contact: { firstName: "Dana", lastName: "Ng", title: "VP Sales" },
};

interface Call {
  url: string;
  init?: RequestInit;
}
function mockFetch(ok = true) {
  const calls: Call[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({ ok } as Response);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
const putBody = (calls: Call[]) => {
  const p = calls.find((c) => c.init?.method === "PUT");
  return p ? JSON.parse(p.init!.body as string) : null;
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DraftReviewCard", () => {
  it("renders read-only with an Edit affordance", () => {
    render(<DraftReviewCard email={baseEmail} onApproved={() => {}} />);
    expect(screen.getByText("Quick question")).toBeTruthy();
    expect(screen.getByLabelText("Edit draft")).toBeTruthy();
    expect(screen.queryByLabelText("Body")).toBeNull();
  });

  it("reveals subject + body fields on Edit, prefilled from the draft", () => {
    render(<DraftReviewCard email={baseEmail} onApproved={() => {}} />);
    fireEvent.click(screen.getByLabelText("Edit draft"));
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("Quick question");
    const body = screen.getByLabelText("Body") as HTMLTextAreaElement;
    expect(body.value).toContain("Hi there");
    expect(body.value).toContain("Line two");
  });

  it("PUTs the edited final (action approve) and calls onApproved", async () => {
    const calls = mockFetch(true);
    const onApproved = vi.fn();
    render(<DraftReviewCard email={baseEmail} onApproved={onApproved} />);
    fireEvent.click(screen.getByLabelText("Edit draft"));
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Rewritten body" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));

    await waitFor(() => expect(onApproved).toHaveBeenCalled());
    const body = putBody(calls);
    expect(body.emailId).toBe("e-1");
    expect(body.action).toBe("approve");
    expect(body.bodyHtml).toContain("Rewritten body");
  });

  it("omits subject/bodyHtml when approved WITHOUT changes (stays a plain approval)", async () => {
    const calls = mockFetch(true);
    const onApproved = vi.fn();
    render(<DraftReviewCard email={baseEmail} onApproved={onApproved} />);
    fireEvent.click(screen.getByLabelText("Edit draft"));
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));

    await waitFor(() => expect(onApproved).toHaveBeenCalled());
    const body = putBody(calls);
    expect(body.action).toBe("approve");
    expect(body.bodyHtml).toBeUndefined();
    expect(body.subject).toBeUndefined();
  });

  it("does not call onApproved and surfaces an error when the PUT fails", async () => {
    mockFetch(false);
    const onApproved = vi.fn();
    render(<DraftReviewCard email={baseEmail} onApproved={onApproved} />);
    fireEvent.click(screen.getByLabelText("Edit draft"));
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));

    await waitFor(() => expect(screen.getByText(/Couldn't approve/)).toBeTruthy());
    expect(onApproved).not.toHaveBeenCalled();
  });

  it("htmlToText / textToHtml round-trip newlines and escape", () => {
    expect(htmlToText("<div>a<br>b</div>")).toBe("a\nb");
    expect(textToHtml("a\nb")).toBe("<div>a<br>b</div>");
    expect(textToHtml("<script>")).toBe("<div>&lt;script&gt;</div>");
  });
});
