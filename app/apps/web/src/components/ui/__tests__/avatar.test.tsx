/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Avatar } from "../avatar";

describe("Avatar — image present", () => {
  it("renders the image WITHOUT the gradient backdrop", () => {
    // Regression: once a logo/photo is uploaded the gradient bubble must
    // disappear entirely — the gradient is the no-image fallback, never a
    // frame behind an uploaded image.
    const { container } = render(
      <Avatar src="/api/settings/workspace/logo?v=1" name="Pilae" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.className).not.toContain("gradient-brand");
  });

  it("keeps the gradient on the hidden onError fallback bubble", () => {
    const { container } = render(<Avatar src="/broken.png" name="Martin Paviot" />);
    const fallback = container.querySelector("div");
    expect(fallback).not.toBeNull();
    expect(fallback!.className).toContain("gradient-brand");
    expect(fallback!.textContent).toBe("MP");
    // Hidden until the img errors.
    expect((fallback as HTMLElement).style.display).toBe("none");
  });
});

describe("Avatar — no image", () => {
  it("renders gradient initials", () => {
    const { container } = render(<Avatar name="Martin Paviot" />);
    expect(container.querySelector("img")).toBeNull();
    const bubble = container.querySelector("div");
    expect(bubble).not.toBeNull();
    expect(bubble!.className).toContain("gradient-brand");
    expect(bubble!.textContent).toBe("MP");
  });
});
