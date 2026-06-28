/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { CompanyLogo, CompanyLogoV1 } from "../company-logo";

// ── Mock the flags provider ──

let flagValue = false;
vi.mock("@/components/flags-provider", () => ({
  FlagsProvider: ({ children }: { children: React.ReactNode }) => children,
  useFlag: () => flagValue,
}));

// ── Mock the coalescer ──

type CoalescerResult = {
  url: string | null;
  tier: number;
  fromCache: boolean;
  resolvedAt: string;
};

let coalescerResolve: ((r: CoalescerResult) => void) | null = null;
let coalescerCancel = vi.fn();
let enqueueCallCount = 0;

vi.mock("@/lib/logo/client-coalescer", () => ({
  enqueueLogoResolve: vi.fn(() => {
    enqueueCallCount++;
    const promise = new Promise<CoalescerResult>((resolve) => {
      coalescerResolve = resolve;
    });
    return { promise, cancel: coalescerCancel };
  }),
}));

// ── Mock the GeneratedCompanyAvatar ──

vi.mock("@/components/ui/generated-company-avatar", () => ({
  GeneratedCompanyAvatar: ({ companyName, size }: { companyName: string; size: number }) => (
    <svg data-testid="generated-avatar" data-name={companyName} width={size} height={size} />
  ),
}));

beforeEach(() => {
  flagValue = false;
  coalescerResolve = null;
  coalescerCancel = vi.fn();
  enqueueCallCount = 0;
});

describe("CompanyLogo — flag off (V1 path)", () => {
  it("renders Clearbit img as initial src", () => {
    const { container } = render(
      <CompanyLogo domain="stripe.com" name="Stripe" size={24} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("logo.clearbit.com/stripe.com");
  });

  it("falls back to Google Favicons V1 on Clearbit error", () => {
    const { container } = render(
      <CompanyLogo domain="unknown.com" name="Unknown" size={24} />,
    );
    const img = container.querySelector("img")!;
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    expect(img.src).toContain("google.com/s2/favicons");
  });

  it("falls back to initials on double error", () => {
    const { container } = render(
      <CompanyLogo domain="dead.com" name="Dead Corp" size={24} />,
    );
    const img = container.querySelector("img")!;
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("DC");
  });

  it("renders initials immediately when no domain", () => {
    const { container } = render(
      <CompanyLogo domain={null} name="No Domain" size={24} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("ND");
  });
});

describe("CompanyLogo — flag on (V2 path)", () => {
  beforeEach(() => {
    flagValue = true;
  });

  it("renders GeneratedCompanyAvatar immediately on mount", () => {
    const { getByTestId } = render(
      <CompanyLogo domain="stripe.com" name="Stripe" size={24} />,
    );
    const avatar = getByTestId("generated-avatar");
    expect(avatar).not.toBeNull();
    expect(avatar.getAttribute("data-name")).toBe("Stripe");
  });

  it("swaps to resolved img after coalescer resolves", async () => {
    const { container, getByTestId } = render(
      <CompanyLogo domain="stripe.com" name="Stripe" size={24} />,
    );

    // Initially only the generated avatar
    expect(container.querySelector("img")).toBeNull();
    expect(getByTestId("generated-avatar")).not.toBeNull();

    // Simulate coalescer resolving
    await act(async () => {
      coalescerResolve!({
        url: "https://logo.clearbit.com/stripe.com",
        tier: 2,
        fromCache: false,
        resolvedAt: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
      expect(img!.src).toContain("stripe.com");
    });
  });

  it("stays on generated avatar when resolver returns tier 6", async () => {
    const { container, getByTestId } = render(
      <CompanyLogo domain="unknown.com" name="Unknown" size={24} />,
    );

    await act(async () => {
      coalescerResolve!({
        url: null,
        tier: 6,
        fromCache: false,
        resolvedAt: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(container.querySelector("img")).toBeNull();
      expect(getByTestId("generated-avatar")).not.toBeNull();
    });
  });

  it("falls back to generated avatar on img load error", async () => {
    const { container } = render(
      <CompanyLogo domain="flaky.com" name="Flaky" size={24} />,
    );

    await act(async () => {
      coalescerResolve!({
        url: "https://logo.clearbit.com/flaky.com",
        tier: 2,
        fromCache: false,
        resolvedAt: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(container.querySelector("img")).not.toBeNull();
    });

    // Simulate img error
    const img = container.querySelector("img")!;
    act(() => {
      img.dispatchEvent(new Event("error"));
    });

    await waitFor(() => {
      expect(container.querySelector("img")).toBeNull();
    });
  });

  it("cancels coalescer on unmount", () => {
    const { unmount } = render(
      <CompanyLogo domain="stripe.com" name="Stripe" size={24} />,
    );
    unmount();
    expect(coalescerCancel).toHaveBeenCalled();
  });

  it("renders generated avatar immediately when no domain (no coalescer call)", () => {
    const { getByTestId, container } = render(
      <CompanyLogo domain={null} name="No Domain" size={24} />,
    );
    expect(getByTestId("generated-avatar")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders a provided logoUrl immediately and skips the resolver", () => {
    const { container, queryByTestId } = render(
      <CompanyLogo
        domain="stripe.com"
        name="Stripe"
        size={24}
        logoUrl="https://cdn.example.com/stripe.png"
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("cdn.example.com/stripe.png");
    expect(queryByTestId("generated-avatar")).toBeNull();
    // The page already had the URL — no coalescer round-trip.
    expect(enqueueCallCount).toBe(0);
  });

  it("ignores a non-http logoUrl and falls through to the resolver", () => {
    render(
      <CompanyLogo
        domain="stripe.com"
        name="Stripe"
        size={24}
        logoUrl="not-a-url"
      />,
    );
    expect(enqueueCallCount).toBe(1);
  });

  it("falls back to the resolver when the direct logoUrl errors", async () => {
    const { container } = render(
      <CompanyLogo
        domain="stripe.com"
        name="Stripe"
        size={24}
        logoUrl="https://cdn.example.com/broken.png"
      />,
    );
    const img = container.querySelector("img")!;
    expect(img.src).toContain("broken.png");
    expect(enqueueCallCount).toBe(0);

    // Direct image 404s → component must now consult the resolver.
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    await waitFor(() => expect(enqueueCallCount).toBe(1));

    await act(async () => {
      coalescerResolve!({
        url: "https://logo.example.com/stripe.png",
        tier: 3,
        fromCache: false,
        resolvedAt: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      const im = container.querySelector("img");
      expect(im).not.toBeNull();
      expect(im!.src).toContain("logo.example.com/stripe.png");
    });
  });
});

describe("CompanyLogoV1 export", () => {
  it("is a named export for backwards compat", () => {
    expect(typeof CompanyLogoV1).toBe("function");
    const { container } = render(
      <CompanyLogoV1 domain="test.com" name="Test" size={24} />,
    );
    expect(container.querySelector("img")).not.toBeNull();
  });
});
