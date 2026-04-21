/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { GeneratedCompanyAvatar } from "../generated-company-avatar";
import { gradientFor, hslToHex, type Hsl } from "@/lib/logo/gradient";

function sRgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function relativeLuminanceFromHsl(c: Hsl): number {
  const hex = hslToHex(c).replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}

function contrastRatio(bgHsl: Hsl): number {
  const bgLum = relativeLuminanceFromHsl(bgHsl);
  return (1.0 + 0.05) / (bgLum + 0.05);
}

const SAMPLE_NAMES = [
  "Stripe", "Forerunner Ventures", "Apple", "Meta", "Salesforce",
  "Vivid Labs", "Quiet Signal", "Harbor Metrics", "Tiger Global",
  "Anthropic",
];

describe("GeneratedCompanyAvatar", () => {
  it("renders an SVG with gradient rect + text for each sample name", () => {
    for (const name of SAMPLE_NAMES) {
      const { container } = render(
        <GeneratedCompanyAvatar companyName={name} size={24} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("width")).toBe("24");
      const rect = svg!.querySelector("rect");
      expect(rect).not.toBeNull();
      const text = svg!.querySelector("text");
      expect(text).not.toBeNull();
      expect(text!.textContent!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("is deterministic: same name always produces same gradient ID and initials", () => {
    for (const name of SAMPLE_NAMES) {
      const a = render(<GeneratedCompanyAvatar companyName={name} />);
      const svgA = a.container.querySelector("svg")!;
      const idA = svgA.querySelector("linearGradient")!.id;
      const textA = svgA.querySelector("text")!.textContent;
      a.unmount();

      const b = render(<GeneratedCompanyAvatar companyName={name} />);
      const svgB = b.container.querySelector("svg")!;
      const idB = svgB.querySelector("linearGradient")!.id;
      const textB = svgB.querySelector("text")!.textContent;
      b.unmount();

      expect(idA).toBe(idB);
      expect(textA).toBe(textB);
    }
  });

  it("renders different sizes without errors", () => {
    for (const size of [16, 20, 24, 28, 32, 48]) {
      const { container } = render(
        <GeneratedCompanyAvatar companyName="Test Co" size={size} />,
      );
      const svg = container.querySelector("svg");
      expect(svg!.getAttribute("width")).toBe(String(size));
      expect(svg!.getAttribute("height")).toBe(String(size));
    }
  });

  // Existing CompanyLogo uses aria-hidden white text on saturated
  // colours (including teal / emerald that don't pass WCAG AA for
  // normal text). These initials are decorative — the company name is
  // communicated via adjacent text — so 3:1 (AA large-text) is the
  // appropriate threshold, matching the existing visual grammar.
  it("contrast: white initials on both gradient stops >= 3.0:1 for all 100 corpus names", () => {
    // Reuse the 100-name corpus from the gradient oracle test.
    const CORPUS = [
      "Apple", "Microsoft", "Amazon", "Google", "Meta",
      "Tesla", "Nvidia", "Oracle", "Salesforce", "Adobe",
      "IBM", "Intel", "Cisco", "Netflix", "Disney",
      "Walmart", "Target", "Costco", "FedEx", "UPS",
      "Stripe", "Figma", "Notion", "Linear", "Vercel",
      "Supabase", "Plaid", "Ramp", "Brex", "Mercury",
      "Retool", "Airtable", "Loom", "Canva", "Webflow",
      "Anthropic", "OpenAI", "Perplexity", "Hugging Face", "LangChain",
      "Forerunner Ventures", "Sequoia Capital", "Andreessen Horowitz",
      "Benchmark", "Accel", "Greylock", "Kleiner Perkins", "Founders Fund",
      "Lightspeed", "General Catalyst", "Index Ventures", "Bessemer",
      "Khosla Ventures", "NEA", "GV", "Tiger Global",
      "Insight Partners", "IVP", "Redpoint", "First Round",
      "Vivid Labs", "Quiet Signal", "Harbor Metrics", "Orbit Nine",
      "Pale Blue", "Basecamp Data", "Ember AI", "Glass Road",
      "Iron Meadow", "Juniper Bay", "Kite Works", "Lantern Logic",
      "Mint Gate", "North Span", "Oak River", "Piper Cloud",
      "Quartz Arc", "Radium Forge", "Silvermoon", "Tulip Sky",
      "Umbra Stack", "Velvet Tree", "Willow Peak", "Xenon Drift",
      "Yellow Hawk", "Zephyr Works", "Brass Pine", "Coral Edge",
      "Dune Reach", "Ember Loop", "Flint Harbor", "Garnet Line",
      "Hazel Echo", "Ivory Cast", "Jasper Turn", "Kestrel Hub",
      "Lumen Peak", "Marble Flow", "Nickel Frame", "Opal Span",
    ];

    let minContrast = Infinity;
    let worstName = "";
    let worstStop = "";
    for (const name of CORPUS) {
      const { stop1, stop2 } = gradientFor(name);
      for (const [label, stop] of [["stop1", stop1], ["stop2", stop2]] as const) {
        const cr = contrastRatio(stop);
        if (cr < minContrast) {
          minContrast = cr;
          worstName = name;
          worstStop = label;
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[contrast] worst = ${minContrast.toFixed(2)}:1 on "${worstName}" ${worstStop}`,
    );
    expect(minContrast).toBeGreaterThanOrEqual(3.0);
  });
});
