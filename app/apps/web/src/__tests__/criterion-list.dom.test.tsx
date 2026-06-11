// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { CriterionList } from "@/components/icp/criterion-list";

/**
 * R4.3b (_specs/icp-unification): every multi-value criterion is a
 * visible list of removable tags — taxonomy search picks only real
 * labels, free text adds on Enter, and NOTHING is ever parsed from
 * comma-separated text.
 */

describe("CriterionList — free text mode", () => {
  it("adds a tag on Enter and renders it with a remove control", () => {
    const onChange = vi.fn();
    render(<CriterionList values={[]} onChange={onChange} placeholder="Type…" />);
    const input = screen.getByPlaceholderText("Type…");
    fireEvent.change(input, { target: { value: "WordPress" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["WordPress"]);
  });

  it("a comma-separated paste stays ONE tag — no comma parsing anywhere", () => {
    const onChange = vi.fn();
    render(<CriterionList values={[]} onChange={onChange} placeholder="Type…" />);
    const input = screen.getByPlaceholderText("Type…");
    fireEvent.change(input, { target: { value: "a, b, c" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["a, b, c"]);
  });

  it("removing a tag calls onChange without it", () => {
    const onChange = vi.fn();
    render(
      <CriterionList values={["Vaud", "Geneva"]} onChange={onChange} placeholder="Type…" />,
    );
    expect(screen.getByText("Vaud")).toBeTruthy();
    const removes = screen.getAllByRole("button");
    fireEvent.click(removes[0]);
    expect(onChange).toHaveBeenCalledWith(["Geneva"]);
  });

  it("ignores duplicates", () => {
    const onChange = vi.fn();
    render(<CriterionList values={["SaaS"]} onChange={onChange} placeholder="Type…" />);
    const input = screen.getByPlaceholderText("Type…");
    fireEvent.change(input, { target: { value: "SaaS" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("CriterionList — taxonomy mode", () => {
  const OPTIONS = ["Banking", "Biotechnology", "Hospital & Health Care"] as const;

  it("filters the taxonomy and picks an option on click", () => {
    const onChange = vi.fn();
    render(
      <CriterionList values={[]} onChange={onChange} options={OPTIONS} placeholder="Search…" />,
    );
    const input = screen.getByPlaceholderText("Search…");
    fireEvent.change(input, { target: { value: "bio" } });
    fireEvent.click(screen.getByText("Biotechnology"));
    expect(onChange).toHaveBeenCalledWith(["Biotechnology"]);
  });

  it("Enter picks the top match — it never invents a label", () => {
    const onChange = vi.fn();
    render(
      <CriterionList values={[]} onChange={onChange} options={OPTIONS} placeholder="Search…" />,
    );
    const input = screen.getByPlaceholderText("Search…");
    fireEvent.change(input, { target: { value: "hosp" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["Hospital & Health Care"]);

    onChange.mockClear();
    fireEvent.change(input, { target: { value: "zzz-not-a-label" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allowFreeText: Enter falls back to the raw text when no option matches (cantons…)", () => {
    const onChange = vi.fn();
    render(
      <CriterionList
        values={[]}
        onChange={onChange}
        options={OPTIONS}
        allowFreeText
        placeholder="Search…"
      />,
    );
    const input = screen.getByPlaceholderText("Search…");
    fireEvent.change(input, { target: { value: "Vaud" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["Vaud"]);
  });
});
