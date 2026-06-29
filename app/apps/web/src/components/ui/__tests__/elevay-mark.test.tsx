/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ElevayMark } from "../elevay-mark";

describe("ElevayMark", () => {
  it("renders the brand SVG at the requested size, decorative", () => {
    const { container } = render(<ElevayMark size={15} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/logo-Elevay.svg?v=2");
    // Decorative: it always sits next to a visible "Elevay" text or a
    // labeled control, so screen readers must not announce it twice.
    expect(img!.getAttribute("alt")).toBe("");
    expect(img!.getAttribute("aria-hidden")).toBe("true");
    expect(img!.style.width).toBe("15px");
    expect(img!.style.height).toBe("15px");
  });
});
