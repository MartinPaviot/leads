// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IntelligencePanel } from "../_intelligence-panel";

/** inbox-list-and-thread LT-2: intelligence is collapsed by default (email-first). */

describe("IntelligencePanel", () => {
  it("renders collapsed by default — children hidden until clicked", () => {
    render(
      <IntelligencePanel count={3}>
        <div>SECRET_SIGNAL</div>
      </IntelligencePanel>,
    );
    // The toggle is present...
    expect(screen.getByText("Intelligence")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy(); // count badge
    // ...but the children are NOT in the DOM while collapsed.
    expect(screen.queryByText("SECRET_SIGNAL")).toBeNull();
    expect(screen.getByText("Show")).toBeTruthy();
  });

  it("expands the children on click", () => {
    render(
      <IntelligencePanel count={2}>
        <div>SECRET_SIGNAL</div>
      </IntelligencePanel>,
    );
    fireEvent.click(screen.getByText("Intelligence"));
    expect(screen.getByText("SECRET_SIGNAL")).toBeTruthy();
    expect(screen.getByText("Hide")).toBeTruthy();
  });

  it("hides the count badge when count is 0", () => {
    render(
      <IntelligencePanel count={0}>
        <div>x</div>
      </IntelligencePanel>,
    );
    expect(screen.getByText("Intelligence")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull(); // no zero badge
  });
});
