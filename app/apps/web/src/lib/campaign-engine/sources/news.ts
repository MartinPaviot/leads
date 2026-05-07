import type { NewsItem } from "../types";

export async function fetchRecentNews(
  companyName: string,
  daysBack = 90
): Promise<NewsItem[]> {
  const query = encodeURIComponent(companyName);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en&gl=US&ceid=US:en`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ElevayBot/1.0)" },
    });

    clearTimeout(timeout);

    if (!res.ok) return [];

    const xml = await res.text();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const block = match[1];
      const title = extractTag(block, "title");
      const link = extractTag(block, "link");
      const pubDate = extractTag(block, "pubDate");

      if (!title || !pubDate) continue;

      const date = new Date(pubDate);
      if (date < cutoff) continue;

      items.push({
        title: decodeHtmlEntities(title),
        date: date.toISOString(),
        summary: title,
        url: link || "",
        relevance: "medium",
      });
    }

    return items;
  } catch {
    return [];
  }
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = regex.exec(xml);
  return m ? (m[1] || m[2] || "").trim() : null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
