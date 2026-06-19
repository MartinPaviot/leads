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

describe("Avatar — shape", () => {
  it("defaults to a circular frame (people)", () => {
    const { container } = render(<Avatar src="/photo.png" name="Martin Paviot" />);
    const img = container.querySelector("img");
    expect(img!.className).toContain("rounded-full");
  });

  it("renders a workspace logo un-rounded so the mark is not clipped", () => {
    // A brand/workspace logo must show as-is: a circular crop would clip the
    // corners of a non-circular mark and alter it.
    const { container } = render(
      <Avatar src="/api/settings/workspace/logo?v=1" name="Pilae" shape="square" />,
    );
    const img = container.querySelector("img");
    expect(img!.className).not.toContain("rounded-full");
    expect(img!.className).toContain("rounded-none");
  });

  it("keeps the no-image initials bubble round even when shape is square", () => {
    // `shape` governs the uploaded logo only — the no-logo placeholder stays a
    // soft round bubble, so a workspace without a logo is unchanged.
    const { container } = render(<Avatar name="Pilae" shape="square" />);
    const bubble = container.querySelector("div");
    expect(bubble!.className).toContain("rounded-full");
    expect(bubble!.className).not.toContain("rounded-none");
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
