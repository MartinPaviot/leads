import { describe, it, expect } from "vitest";
import {
  buildCareerTimeline,
  careerEntryLabel,
  decodeEntities,
  extractWebsiteText,
  isFresh,
  MIN_SITE_TEXT_CHARS,
  profileUrl,
  recentActivityUrl,
  sanitizeLlmText,
  validateBriefTexts,
} from "@/lib/call-mode/prospect-brief-core";

// ── extractWebsiteText ───────────────────────────────────────────

describe("extractWebsiteText", () => {
  it("pulls title, meta description and visible body text", () => {
    const html = `<!doctype html><html><head>
      <title> Acme SA — solutions m&eacute;tier </title>
      <meta name="description" content="Logiciels de gestion pour PME romandes">
      <style>body{color:red}</style>
    </head><body>
      <script>var x = "je ne suis pas du texte";</script>
      <h1>Bienvenue chez Acme</h1>
      <p>Nous &eacute;quipons   120 communes.</p>
      <svg><path d="M0 0"/></svg>
      <!-- commentaire -->
    </body></html>`;
    const out = extractWebsiteText(html);
    expect(out.title).toBe("Acme SA — solutions métier");
    expect(out.metaDescription).toBe("Logiciels de gestion pour PME romandes");
    expect(out.text).toContain("Bienvenue chez Acme");
    expect(out.text).toContain("Nous équipons 120 communes.");
    expect(out.text).not.toContain("je ne suis pas du texte");
    expect(out.text).not.toContain("commentaire");
    expect(out.text).not.toContain("M0 0");
  });

  it("supports reversed meta attribute order and og:description fallback", () => {
    const reversed = `<head><meta content="Desc inversée" name="description"></head><body>x</body>`;
    expect(extractWebsiteText(reversed).metaDescription).toBe("Desc inversée");
    const og = `<head><meta property="og:description" content="Version OG"></head><body>x</body>`;
    expect(extractWebsiteText(og).metaDescription).toBe("Version OG");
  });

  it("keeps the other quote char inside meta content (afiro.ch 'L' regression)", () => {
    const apos = `<head><meta name="description" content="L'AFIRO accompagne l'insertion socioprofessionnelle"></head><body>x</body>`;
    expect(extractWebsiteText(apos).metaDescription).toBe(
      "L'AFIRO accompagne l'insertion socioprofessionnelle",
    );
    const dquote = `<head><meta name="description" content='Il a dit "bonjour" au marché'></head><body>x</body>`;
    expect(extractWebsiteText(dquote).metaDescription).toBe('Il a dit "bonjour" au marché');
  });

  it("caps the text length and survives empty/junk input", () => {
    const long = `<body>${"mot ".repeat(5000)}</body>`;
    expect(extractWebsiteText(long, 100).text.length).toBeLessThanOrEqual(100);
    expect(extractWebsiteText("").text).toBe("");
    expect(extractWebsiteText("").title).toBeNull();
    expect(extractWebsiteText("pas du html").text).toBe("pas du html");
  });

  it("decodes numeric and named entities", () => {
    expect(decodeEntities("&#233;t&#xe9; &amp; h&ocirc;tel&nbsp;!")).toBe("été & hôtel !");
    expect(decodeEntities("&inconnu;")).toBe("&inconnu;");
  });
});

// ── buildCareerTimeline ──────────────────────────────────────────

describe("buildCareerTimeline", () => {
  it("orders current roles first, then past by recency", () => {
    const out = buildCareerTimeline([
      { organization_name: "Beta SA", title: "Dir. commercial", start_date: "2016-01-01", end_date: "2021-06-01", current: false },
      { organization_name: "Acme", title: "DG", start_date: "2021-07-01", end_date: null, current: true },
      { organization_name: "Gamma", title: "Chef de projet", start_date: "2010-01-01", end_date: "2016-01-01", current: false },
    ]);
    expect(out.map((e) => e.org)).toEqual(["Acme", "Beta SA", "Gamma"]);
    expect(out[0].current).toBe(true);
    expect(out[0].startYear).toBe(2021);
    expect(out[1].endYear).toBe(2021);
  });

  it("treats a missing current flag with no end date as ongoing", () => {
    const out = buildCareerTimeline([
      { organization_name: "Acme", title: "DG", start_date: "2020-01-01" },
    ]);
    expect(out[0].current).toBe(true);
  });

  it("drops empty entries, dedupes, tolerates bad dates, caps the list", () => {
    const out = buildCareerTimeline(
      [
        { organization_name: "", title: "", start_date: "2020-01-01" },
        { organization_name: "Acme", title: "DG", start_date: "n/a", end_date: "0001-01-01", current: false },
        { organization_name: "Acme", title: "DG", start_date: "n/a", current: false },
        { organization_name: "B1", title: "T", start_date: "2001-01-01", end_date: "2002-01-01", current: false },
        { organization_name: "B2", title: "T", start_date: "2002-01-01", end_date: "2003-01-01", current: false },
        { organization_name: "B3", title: "T", start_date: "2003-01-01", end_date: "2004-01-01", current: false },
        { organization_name: "B4", title: "T", start_date: "2004-01-01", end_date: "2005-01-01", current: false },
      ],
      5,
    );
    expect(out).toHaveLength(5);
    expect(out.find((e) => e.org === "Acme")?.startYear).toBeNull();
    expect(out.find((e) => e.org === "Acme")?.endYear).toBeNull();
    expect(buildCareerTimeline(null)).toEqual([]);
    expect(buildCareerTimeline(undefined)).toEqual([]);
  });
});

// ── careerEntryLabel ─────────────────────────────────────────────

describe("careerEntryLabel", () => {
  it("formats current, past, partial and undated roles", () => {
    expect(
      careerEntryLabel({ title: "DG", org: "Acme", startYear: 2021, endYear: null, current: true }),
    ).toBe("2021–auj. — DG, Acme");
    expect(
      careerEntryLabel({ title: "Dir.", org: "Beta", startYear: 2016, endYear: 2021, current: false }),
    ).toBe("2016–2021 — Dir., Beta");
    expect(
      careerEntryLabel({ title: null, org: "Gamma", startYear: null, endYear: 2016, current: false }),
    ).toBe("?–2016 — Gamma");
    expect(
      careerEntryLabel({ title: "CEO", org: null, startYear: null, endYear: null, current: true }),
    ).toBe("En poste — CEO");
    expect(
      careerEntryLabel({ title: "CEO", org: "X", startYear: null, endYear: null, current: false }),
    ).toBe("CEO, X");
  });
});

// ── sanitizeLlmText / validateBriefTexts ─────────────────────────

describe("sanitizeLlmText", () => {
  it("collapses whitespace and caps length with an ellipsis", () => {
    expect(sanitizeLlmText("  Deux   phrases.  ")).toBe("Deux phrases.");
    const long = "a".repeat(700);
    const out = sanitizeLlmText(long, 600);
    expect(out.length).toBeLessThanOrEqual(601); // 600 + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });

  it("drops refusal / insufficiency boilerplate (fail-closed)", () => {
    expect(sanitizeLlmText("Désolé, je ne peux pas répondre.")).toBe("");
    expect(sanitizeLlmText("Je ne peux pas déterminer le parcours.")).toBe("");
    expect(sanitizeLlmText("Sorry, I cannot help with that.")).toBe("");
    expect(sanitizeLlmText("Données insuffisantes.")).toBe("");
    expect(sanitizeLlmText(null)).toBe("");
    expect(sanitizeLlmText(undefined)).toBe("");
  });
});

describe("validateBriefTexts", () => {
  const goodSite = "x".repeat(MIN_SITE_TEXT_CHARS);
  it("keeps grounded texts and nulls empty ones", () => {
    const out = validateBriefTexts(
      { personBackground: "DG d'Acme depuis 2021.", companySummary: "Acme édite un ERP communal." },
      { hasPersonInputs: true, siteTextChars: goodSite.length },
    );
    expect(out.background).toBe("DG d'Acme depuis 2021.");
    expect(out.summary).toBe("Acme édite un ERP communal.");
  });

  it("rejects person text without person inputs (groundedness gate)", () => {
    const out = validateBriefTexts(
      { personBackground: "Texte inventé.", companySummary: "Résumé valide." },
      { hasPersonInputs: false, siteTextChars: goodSite.length },
    );
    expect(out.background).toBeNull();
    expect(out.summary).toBe("Résumé valide.");
  });

  it("rejects company text when the site text is too thin", () => {
    const out = validateBriefTexts(
      { personBackground: "Parcours réel.", companySummary: "Résumé halluciné." },
      { hasPersonInputs: true, siteTextChars: MIN_SITE_TEXT_CHARS - 1 },
    );
    expect(out.background).toBe("Parcours réel.");
    expect(out.summary).toBeNull();
  });

  it("nulls empty strings", () => {
    const out = validateBriefTexts(
      { personBackground: "", companySummary: "   " },
      { hasPersonInputs: true, siteTextChars: goodSite.length },
    );
    expect(out.background).toBeNull();
    expect(out.summary).toBeNull();
  });
});

// ── isFresh ──────────────────────────────────────────────────────

describe("isFresh", () => {
  const now = Date.parse("2026-06-10T12:00:00Z");
  it("is fresh within the TTL and stale beyond it", () => {
    expect(isFresh("2026-06-01T12:00:00Z", 30, now)).toBe(true);
    expect(isFresh("2026-05-10T12:00:00Z", 30, now)).toBe(false);
    expect(isFresh("2026-06-09T12:00:00Z", 1, now)).toBe(false);
    expect(isFresh("2026-06-10T00:00:00Z", 1, now)).toBe(true);
  });
  it("treats missing or invalid dates as stale", () => {
    expect(isFresh(null, 30, now)).toBe(false);
    expect(isFresh(undefined, 30, now)).toBe(false);
    expect(isFresh("pas une date", 30, now)).toBe(false);
  });
});

// ── LinkedIn links ───────────────────────────────────────────────

describe("recentActivityUrl / profileUrl", () => {
  it("builds the recent-activity deep link for person profiles", () => {
    expect(recentActivityUrl("https://www.linkedin.com/in/jean-dupont/")).toBe(
      "https://www.linkedin.com/in/jean-dupont/recent-activity/all/",
    );
    expect(recentActivityUrl("linkedin.com/in/jean-dupont?utm=x")).toBe(
      "https://www.linkedin.com/in/jean-dupont/recent-activity/all/",
    );
    expect(recentActivityUrl("https://fr.linkedin.com/in/jean-dupont/details/")).toBe(
      "https://www.linkedin.com/in/jean-dupont/recent-activity/all/",
    );
  });

  it("maps company pages to their posts feed", () => {
    expect(recentActivityUrl("https://www.linkedin.com/company/acme-sa")).toBe(
      "https://www.linkedin.com/company/acme-sa/posts/",
    );
  });

  it("rejects non-LinkedIn and malformed URLs", () => {
    expect(recentActivityUrl("https://evil.com/in/jean")).toBeNull();
    expect(recentActivityUrl("https://notlinkedin.com.evil.com/in/x")).toBeNull();
    expect(recentActivityUrl("https://www.linkedin.com/feed/")).toBeNull();
    expect(recentActivityUrl("")).toBeNull();
    expect(recentActivityUrl(null)).toBeNull();
    expect(recentActivityUrl("::garbage::")).toBeNull();
  });

  it("normalises profile URLs and rejects foreign hosts", () => {
    expect(profileUrl("linkedin.com/in/jean-dupont")).toBe(
      "https://linkedin.com/in/jean-dupont",
    );
    expect(profileUrl("https://evil.com/in/jean")).toBeNull();
    expect(profileUrl(null)).toBeNull();
  });
});
