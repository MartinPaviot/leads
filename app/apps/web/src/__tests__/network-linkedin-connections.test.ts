import { describe, it, expect } from "vitest";
import {
  parseLinkedInConnections,
  normalizeLinkedInUrl,
  parseConnectedOn,
  findHeaderIndex,
  stripBom,
} from "@/lib/network/linkedin-connections";

// The real LinkedIn preamble: "Notes:" + a quoted notice + a BLANK line, then header.
const PREAMBLE =
  `Notes:\n` +
  `"When exporting your connection data, you may notice that some of the email addresses are missing. ` +
  `You will only see email addresses for connections who allowed it (https://www.linkedin.com/psettings/privacy/email)."\n` +
  `\n`;
const HEADER = `First Name,Last Name,URL,Email Address,Company,Position,Connected On`;

describe("parseLinkedInConnections — real export shape", () => {
  it("skips the Notes preamble + BOM and parses every data row", () => {
    const csv =
      "﻿" +
      PREAMBLE +
      HEADER +
      "\n" +
      `Jane,Doe,https://www.linkedin.com/in/jane-doe,jane@ACME.com,"Acme, Inc.",VP Sales,15 Jun 2024\n` +
      `Marc,Dupont,https://www.linkedin.com/in/marc-dupont,,Pilae,Directeur Général,03 May 2023\n`;

    const r = parseLinkedInConnections(csv);

    expect(r.headerFound).toBe(true);
    expect(r.connections).toHaveLength(2);
    expect(r.skipped).toBe(0);
    expect(r.duplicates).toBe(0);
    expect(r.warnings.some((w) => /preamble/i.test(w))).toBe(true);

    const [jane, marc] = r.connections;
    expect(jane).toMatchObject({
      firstName: "Jane",
      lastName: "Doe",
      fullName: "Jane Doe",
      linkedinUrl: "https://www.linkedin.com/in/jane-doe",
      email: "jane@acme.com", // lowercased
      company: "Acme, Inc.", // comma preserved through quoting
      position: "VP Sales",
      connectedOn: "2024-06-15",
      connectedOnRaw: "15 Jun 2024",
    });
    // Empty Email Address is KEPT (URL is the handle), email null.
    expect(marc.email).toBeNull();
    expect(marc.company).toBe("Pilae");
    expect(marc.connectedOn).toBe("2023-05-03");
  });

  it("parses an export with NO preamble (header on line 1)", () => {
    const csv =
      HEADER + "\n" + `Ada,Lovelace,https://www.linkedin.com/in/ada,ada@analytical.io,Analytical,CTO,01 Jan 2020\n`;
    const r = parseLinkedInConnections(csv);
    expect(r.headerFound).toBe(true);
    expect(r.connections).toHaveLength(1);
    expect(r.warnings.some((w) => /preamble/i.test(w))).toBe(false);
  });

  it("handles CRLF line endings", () => {
    const csv = [HEADER, `Bob,Builder,https://www.linkedin.com/in/bob,,Bob SA,Founder,12 Dec 2021`].join("\r\n");
    const r = parseLinkedInConnections(csv);
    expect(r.connections).toHaveLength(1);
    expect(r.connections[0].position).toBe("Founder");
  });
});

describe("parseLinkedInConnections — dedup", () => {
  it("collapses URL variants (trailing slash, http vs https, query) to one", () => {
    const csv =
      HEADER +
      "\n" +
      `Jane,Doe,https://www.linkedin.com/in/jane-doe,,Acme,VP,15 Jun 2024\n` +
      `Jane,Doe,http://linkedin.com/in/jane-doe/,,Acme,VP,15 Jun 2024\n` +
      `Jane,Doe,https://www.linkedin.com/in/jane-doe?utm=x,,Acme,VP,15 Jun 2024\n`;
    const r = parseLinkedInConnections(csv);
    expect(r.connections).toHaveLength(1);
    expect(r.duplicates).toBe(2);
    expect(r.totalRows).toBe(3);
  });

  it("dedups by email when the URL is missing", () => {
    const csv =
      HEADER +
      "\n" +
      `Sam,One,,sam@x.com,X,Eng,15 Jun 2024\n` +
      `Sam,One,,SAM@x.com,X,Eng,15 Jun 2024\n`;
    const r = parseLinkedInConnections(csv);
    expect(r.connections).toHaveLength(1);
    expect(r.duplicates).toBe(1);
  });
});

describe("parseLinkedInConnections — skip + guard", () => {
  it("skips rows with neither URL nor email, keeps the rest", () => {
    const csv =
      HEADER +
      "\n" +
      `No,Handle,,,SomeCo,Manager,15 Jun 2024\n` + // no url, no email -> skipped
      `Real,Person,https://www.linkedin.com/in/real,,RealCo,CEO,15 Jun 2024\n`;
    const r = parseLinkedInConnections(csv);
    expect(r.connections).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.connections[0].firstName).toBe("Real");
  });

  it("returns headerFound:false for a non-LinkedIn CSV", () => {
    const r = parseLinkedInConnections(`foo,bar,baz\n1,2,3\n4,5,6`);
    expect(r.headerFound).toBe(false);
    expect(r.connections).toHaveLength(0);
  });

  it("returns headerFound:false for empty / whitespace input", () => {
    expect(parseLinkedInConnections("").headerFound).toBe(false);
    expect(parseLinkedInConnections("   \n  \n").headerFound).toBe(false);
  });

  it("parses a header-only export to zero connections without error", () => {
    const r = parseLinkedInConnections(HEADER + "\n");
    expect(r.headerFound).toBe(true);
    expect(r.connections).toHaveLength(0);
    expect(r.skipped).toBe(0);
  });
});

describe("normalizeLinkedInUrl", () => {
  it("canonicalizes scheme/host/slash/query variants to the same slug", () => {
    const canon = "https://www.linkedin.com/in/jane-doe";
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/jane-doe")).toBe(canon);
    expect(normalizeLinkedInUrl("http://linkedin.com/in/jane-doe/")).toBe(canon);
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/jane-doe?utm_source=x")).toBe(canon);
    expect(normalizeLinkedInUrl("  HTTPS://WWW.LINKEDIN.COM/IN/JANE-DOE  ")).toBe(canon);
  });
  it("returns null for empty / non-linkedin urls", () => {
    expect(normalizeLinkedInUrl("")).toBeNull();
    expect(normalizeLinkedInUrl(null)).toBeNull();
    expect(normalizeLinkedInUrl("https://example.com/in/x")).toBeNull();
  });
});

describe("parseConnectedOn", () => {
  it("parses DD Mon YYYY and Mon DD, YYYY", () => {
    expect(parseConnectedOn("15 Jun 2024")).toBe("2024-06-15");
    expect(parseConnectedOn("3 May 2023")).toBe("2023-05-03");
    expect(parseConnectedOn("Jun 15, 2024")).toBe("2024-06-15");
    expect(parseConnectedOn("December 1, 2021")).toBe("2021-12-01");
  });
  it("returns null for unparseable dates", () => {
    expect(parseConnectedOn("Yesterday")).toBeNull();
    expect(parseConnectedOn("")).toBeNull();
    expect(parseConnectedOn(null)).toBeNull();
  });
});

describe("findHeaderIndex / stripBom", () => {
  it("locates the header past a preamble and reports -1 when absent", () => {
    expect(findHeaderIndex(["Notes:", '"redacted email notice"', "", HEADER, "data"])).toBe(3);
    expect(findHeaderIndex(["a,b,c", "1,2,3"])).toBe(-1);
  });
  it("strips only a leading BOM", () => {
    expect(stripBom("﻿hi")).toBe("hi");
    expect(stripBom("hi")).toBe("hi");
  });
});
