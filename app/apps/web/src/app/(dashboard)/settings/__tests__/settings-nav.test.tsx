// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

/**
 * Settings IA reorg — the collapsible nav rail. Six sections × 3-7 items is a
 * tall rail at the founder's half-screen + 200% zoom, so sections collapse to
 * scannable headers. This freezes the contract:
 *  - every section header renders (scannable structure),
 *  - only the ACTIVE section is expanded by default (its items show, others hide),
 *  - clicking a collapsed header reveals its items + persists to localStorage,
 *  - filtering forces matching items visible regardless of collapse state,
 *  - the active section can't be hidden by navigation.
 */

let mockPath = "/settings/icp";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
}));

import SettingsSidebar from "@/app/(dashboard)/settings/settings-sidebar";

function renderNav() {
  return render(
    <SettingsSidebar isAdmin>
      <div>page-content</div>
    </SettingsSidebar>,
  );
}

beforeEach(() => {
  mockPath = "/settings/icp"; // active section = "Targeting & Pipeline"
  try { localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => cleanup());

describe("settings nav — collapsible sections", () => {
  it("renders all six section headers (scannable structure)", () => {
    renderNav();
    for (const label of ["Account", "Your AI", "Targeting & Pipeline", "Channels", "Workspace", "Developer"]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeTruthy();
    }
  });

  it("only the active section is expanded by default", () => {
    renderNav();
    // Active = Targeting & Pipeline → ICP item visible.
    expect(screen.getByRole("link", { name: /ICP/i })).toBeTruthy();
    // A non-active section's item (Account → Profile) is hidden until expanded.
    expect(screen.queryByRole("link", { name: /^Profile$/i })).toBeNull();
    // Its header is still present + marked collapsed.
    const account = screen.getByRole("button", { name: /Account/i });
    expect(account.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking a collapsed header reveals its items and persists", () => {
    renderNav();
    const account = screen.getByRole("button", { name: /Account/i });
    fireEvent.click(account);
    expect(screen.getByRole("link", { name: /^Profile$/i })).toBeTruthy();
    expect(account.getAttribute("aria-expanded")).toBe("true");
    // Persisted so the next visit remembers it.
    const stored = JSON.parse(localStorage.getItem("elevay.settings.nav.open") || "[]");
    expect(stored).toContain("Account");
  });

  it("filtering forces matching items visible even when their section is collapsed", () => {
    renderNav();
    // "Voice & Writing" lives in the collapsed "Your AI" section.
    expect(screen.queryByRole("link", { name: /Voice & Writing/i })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Filter settings…"), { target: { value: "voice" } });
    expect(screen.getByRole("link", { name: /Voice & Writing/i })).toBeTruthy();
  });

  it("navigating into a section keeps it expanded (active page always visible)", () => {
    mockPath = "/settings/autonomy"; // active section = "Your AI"
    renderNav();
    expect(screen.getByRole("link", { name: /Autonomy/i })).toBeTruthy();
    const yourAi = screen.getByRole("button", { name: /Your AI/i });
    expect(yourAi.getAttribute("aria-expanded")).toBe("true");
  });
});
