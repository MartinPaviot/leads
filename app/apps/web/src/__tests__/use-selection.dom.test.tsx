// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelection } from "@/hooks/use-selection";

afterEach(() => {
  // nothing — renderHook cleans itself up
});

interface Row {
  id: string;
  name: string;
}

const items: Row[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];

describe("useSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSelection<Row>());
    expect(result.current.count).toBe(0);
    expect(result.current.isSelected("a")).toBe(false);
  });

  it("toggle adds then removes an id", () => {
    const { result } = renderHook(() => useSelection<Row>());
    act(() => result.current.toggle("a"));
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("a")).toBe(true);
    act(() => result.current.toggle("a"));
    expect(result.current.count).toBe(0);
  });

  it("accepts an item object for toggle / isSelected", () => {
    const { result } = renderHook(() => useSelection<Row>());
    act(() => result.current.toggle(items[0]));
    expect(result.current.isSelected(items[0])).toBe(true);
  });

  it("selectAll populates from the passed-in list", () => {
    const { result } = renderHook(() => useSelection<Row>());
    act(() => result.current.selectAll(items));
    expect(result.current.count).toBe(3);
    expect(result.current.allSelectedIn(items)).toBe(true);
    expect(result.current.partiallySelectedIn(items)).toBe(false);
  });

  it("partiallySelectedIn reports true when some-but-not-all are selected", () => {
    const { result } = renderHook(() => useSelection<Row>());
    act(() => result.current.toggle("a"));
    expect(result.current.partiallySelectedIn(items)).toBe(true);
    expect(result.current.allSelectedIn(items)).toBe(false);
  });

  it("clear empties the selection", () => {
    const { result } = renderHook(() => useSelection<Row>());
    act(() => result.current.selectAll(items));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("set replaces the current selection", () => {
    const { result } = renderHook(() => useSelection<Row>());
    act(() => result.current.selectAll(items));
    act(() => result.current.set(["b"]));
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.isSelected("a")).toBe(false);
  });

  it("allSelectedIn is false when items is empty", () => {
    const { result } = renderHook(() => useSelection<Row>());
    expect(result.current.allSelectedIn([])).toBe(false);
  });
});
