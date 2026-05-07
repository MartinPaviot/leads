/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DealPropertyCell } from "@/components/deal-property-cell";

describe("DealPropertyCell — rendering", () => {
  it("renders empty state when field is absent", () => {
    render(
      <DealPropertyCell
        properties={null}
        fieldName="budget"
        label="Budget"
      />,
    );
    expect(screen.getByText("Budget")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
  });

  it("renders empty state when field value is empty string", () => {
    render(
      <DealPropertyCell
        properties={{ budget: { value: "", source: "email", date: new Date().toISOString(), manual: false } }}
        fieldName="budget"
        label="Budget"
      />,
    );
    expect(screen.getByText("—")).toBeDefined();
  });

  it("renders new-shape PropertyEntry value", () => {
    render(
      <DealPropertyCell
        properties={{
          budget: {
            value: "$50K",
            source: "email",
            date: "2026-04-15T10:00:00Z",
            manual: false,
          },
        }}
        fieldName="budget"
        label="Budget"
      />,
    );
    expect(screen.getByText("$50K")).toBeDefined();
  });

  it("renders legacy primitive via accessor synth", () => {
    render(
      <DealPropertyCell
        properties={{ budget: "$30K" }}
        fieldName="budget"
        label="Budget"
      />,
    );
    expect(screen.getByText("$30K")).toBeDefined();
    // Legacy synthesises manual:true → manual badge surfaces.
    expect(screen.getByText(/manual/i)).toBeDefined();
  });

  it("shows manual badge when entry.manual is true", () => {
    render(
      <DealPropertyCell
        properties={{
          budget: {
            value: "$50K",
            source: "user",
            date: new Date().toISOString(),
            manual: true,
          },
        }}
        fieldName="budget"
        label="Budget"
      />,
    );
    expect(screen.getByText(/manual/i)).toBeDefined();
  });

  it("does not show manual badge when entry.manual is false", () => {
    render(
      <DealPropertyCell
        properties={{
          budget: {
            value: "$50K",
            source: "email",
            date: new Date().toISOString(),
            manual: false,
          },
        }}
        fieldName="budget"
        label="Budget"
      />,
    );
    // The label "Budget" exists and value renders ; no "manual" badge.
    expect(screen.queryByText(/^manual$/i)).toBeNull();
  });

  it("uses custom formatValue when provided", () => {
    render(
      <DealPropertyCell
        properties={{
          budget: {
            value: 50000,
            source: "email",
            date: new Date().toISOString(),
            manual: false,
          },
        }}
        fieldName="budget"
        label="Budget"
        formatValue={(v) => `$${(v as number).toLocaleString("en-US")}`}
      />,
    );
    expect(screen.getByText("$50,000")).toBeDefined();
  });

  it("renders array values joined by comma when no formatter", () => {
    render(
      <DealPropertyCell
        properties={{
          competitors: {
            value: ["Salesforce", "HubSpot", "Pipedrive"],
            source: "transcript",
            date: new Date().toISOString(),
            manual: false,
          },
        }}
        fieldName="competitors"
        label="Competitors"
      />,
    );
    expect(screen.getByText("Salesforce, HubSpot, Pipedrive")).toBeDefined();
  });

  it("falls back to custom emptyState when provided", () => {
    render(
      <DealPropertyCell
        properties={null}
        fieldName="budget"
        label="Budget"
        emptyState="Not yet extracted"
      />,
    );
    expect(screen.getByText("Not yet extracted")).toBeDefined();
  });
});
