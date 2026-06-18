import { describe, it, expect } from "vitest";
import { decodeRfc2047, neutralizeBidi, decodeDisplay } from "@/lib/inbox/text-decode";

const RLO = String.fromCharCode(0x202e); // right-to-left override
const PDI = String.fromCharCode(0x2069); // pop directional isolate

describe("text-decode (INBOX-R10)", () => {
  it("decodes RFC 2047 Q-encoded words (UTF-8, _ => space)", () => {
    expect(decodeRfc2047("=?UTF-8?Q?R=C3=A9union_jeudi?=")).toBe("Réunion jeudi");
  });

  it("decodes RFC 2047 B-encoded words (base64, UTF-8)", () => {
    expect(decodeRfc2047("=?UTF-8?B?w6k=?=")).toBe("é");
  });

  it("decodes a non-UTF-8 charset (ISO-8859-1)", () => {
    expect(decodeRfc2047("=?ISO-8859-1?Q?caf=E9?=")).toBe("café");
  });

  it("joins adjacent encoded-words separated only by whitespace (RFC 2047 §6.2)", () => {
    expect(decodeRfc2047("=?UTF-8?Q?Hello?= =?UTF-8?Q?World?=")).toBe("HelloWorld");
  });

  it("passes plain text through unchanged", () => {
    expect(decodeRfc2047("Plain subject — no encoding")).toBe("Plain subject — no encoding");
  });

  it("strips bidi reordering controls (anti-spoof) but keeps visible glyphs", () => {
    const spoof = "Invoice " + RLO + "fdp.exe"; // RLO disguises the real extension
    const clean = neutralizeBidi(spoof);
    expect(clean).toBe("Invoice fdp.exe");
    expect(clean).not.toContain(RLO);
  });

  it("leaves accented Latin text untouched by neutralizeBidi", () => {
    expect(neutralizeBidi("café crème — œuf")).toBe("café crème — œuf");
  });

  it("decodeDisplay composes decode + anti-spoof", () => {
    expect(decodeDisplay("=?UTF-8?Q?Re=C3=A7u?=" + PDI)).toBe("Reçu");
  });
});
