import type { LinkedInActivity } from "../types";

/**
 * Best-effort LinkedIn activity estimation.
 * LinkedIn blocks most scraping, so this relies on public profile data
 * that doesn't require authentication. Returns null if profile is
 * inaccessible or data is insufficient.
 */
export async function fetchLinkedInActivity(
  linkedinUrl: string | null
): Promise<LinkedInActivity | null> {
  if (!linkedinUrl) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(linkedinUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();

    // LinkedIn public profiles have limited data — check if auth wall
    if (html.includes("authwall") || html.includes("login")) {
      return null;
    }

    // Extract what we can from the public page
    const tone = inferToneFromProfile(html);
    const topics = extractTopicsFromProfile(html);

    // If we can't get meaningful data, return null
    if (!tone && topics.length === 0) return null;

    return {
      postsPerWeek: estimatePostFrequency(html),
      recentTopics: topics.slice(0, 3),
      tone: tone || "formal",
      lastPostDate: null,
    };
  } catch {
    return null;
  }
}

function inferToneFromProfile(html: string): LinkedInActivity["tone"] | null {
  const lower = html.toLowerCase();
  if (lower.includes("thought leader") || lower.includes("keynote speaker")) return "thought-leader";
  if (lower.includes("technical") || lower.includes("architecture") || lower.includes("engineering")) return "technical";
  if (lower.includes("passionate") || lower.includes("love building")) return "casual";
  return null;
}

function extractTopicsFromProfile(html: string): string[] {
  const topics: string[] = [];

  // Extract from headline/about section in JSON-LD or meta tags
  const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/);
  if (ogTitle) {
    const headline = ogTitle[1];
    const words = headline.split(/[\s|,·–—]+/).filter((w) => w.length > 3);
    topics.push(...words.slice(0, 3));
  }

  return Array.from(new Set(topics));
}

function estimatePostFrequency(html: string): number {
  // Without authentication, we can't access the activity feed.
  // Return a conservative default — the Strategy Selector will
  // only enable Social-First if postsPerWeek >= 2.
  // We indicate "unknown" by returning 0.
  const hasActivitySection = html.includes("recent-activity") || html.includes("feed-identity");
  return hasActivitySection ? 1 : 0;
}
