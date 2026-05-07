import * as cheerio from "cheerio";

export interface WebsiteResult {
  rawText: string;
  metaDescription: string | null;
  headings: string[];
  fetchedAt: string;
}

export async function scrapeCompanyWebsite(
  domain: string
): Promise<WebsiteResult | null> {
  const url = domain.startsWith("http") ? domain : `https://${domain}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ElevayBot/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("script, style, nav, footer, header, iframe, noscript").remove();

    const metaDescription =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      null;

    const headings: string[] = [];
    $("h1, h2").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 200) headings.push(text);
    });

    const rawText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 3000);

    return {
      rawText,
      metaDescription,
      headings: headings.slice(0, 10),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
