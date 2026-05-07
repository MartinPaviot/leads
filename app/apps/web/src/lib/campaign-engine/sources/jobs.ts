import * as cheerio from "cheerio";
import type { JobPosting } from "../types";

const CAREERS_PATHS = ["/careers", "/jobs", "/about/careers", "/company/careers", "/join-us", "/join"];

const ATS_PATTERNS: Record<string, RegExp> = {
  greenhouse: /boards\.greenhouse\.io\/(\w+)/,
  lever: /jobs\.lever\.co\/(\w+)/,
  ashby: /jobs\.ashbyhq\.com\/(\w+)/,
  workable: /apply\.workable\.com\/(\w+)/,
};

export async function scrapeJobPostings(domain: string): Promise<JobPosting[]> {
  const baseDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const baseUrl = `https://${baseDomain}`;

  // Try careers pages on the main domain
  for (const path of CAREERS_PATHS) {
    const result = await tryFetchJobs(`${baseUrl}${path}`);
    if (result.length > 0) return result;
  }

  // Try detecting ATS links from the homepage
  const atsJobs = await tryDetectATS(baseUrl);
  if (atsJobs.length > 0) return atsJobs;

  return [];
}

async function tryFetchJobs(url: string): Promise<JobPosting[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ElevayBot/1.0)" },
      redirect: "follow",
    });

    clearTimeout(timeout);
    if (!res.ok) return [];

    const html = await res.text();
    return extractJobsFromHTML(html, url);
  } catch {
    return [];
  }
}

function extractJobsFromHTML(html: string, sourceUrl: string): JobPosting[] {
  const $ = cheerio.load(html);
  const jobs: JobPosting[] = [];
  const seen = new Set<string>();

  // Common patterns: links with job-related text in list items
  $("a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") || "";

    if (text.length < 5 || text.length > 120) return;
    if (seen.has(text.toLowerCase())) return;

    // Heuristic: if the link is within a job-listing-like container
    const parent = $(el).closest("li, div, tr, article");
    const parentText = parent.text().toLowerCase();

    const isJobLike =
      /engineer|manager|designer|developer|analyst|director|lead|head of|vp |sales|marketing|product|operations|recruiter|coordinator/i.test(text) ||
      parentText.includes("apply") ||
      parentText.includes("remote") ||
      parentText.includes("full-time") ||
      parentText.includes("part-time");

    if (!isJobLike) return;

    seen.add(text.toLowerCase());
    const department = inferDepartment(text);

    jobs.push({
      title: text,
      department,
      senioritySignal: inferSenioritySignal(text),
      url: href.startsWith("http") ? href : null,
      detectedAt: new Date().toISOString(),
    });
  });

  return jobs.slice(0, 10);
}

async function tryDetectATS(baseUrl: string): Promise<JobPosting[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(baseUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ElevayBot/1.0)" },
    });

    clearTimeout(timeout);
    if (!res.ok) return [];

    const html = await res.text();

    for (const [, pattern] of Object.entries(ATS_PATTERNS)) {
      const match = pattern.exec(html);
      if (match) {
        const atsUrl = match[0].startsWith("http") ? match[0] : `https://${match[0]}`;
        return tryFetchJobs(atsUrl);
      }
    }

    return [];
  } catch {
    return [];
  }
}

function inferDepartment(title: string): string | null {
  const lower = title.toLowerCase();
  if (/engineer|developer|devops|sre|backend|frontend|fullstack/.test(lower)) return "Engineering";
  if (/design|ux|ui/.test(lower)) return "Design";
  if (/sales|account executive|bdr|sdr/.test(lower)) return "Sales";
  if (/marketing|content|growth|seo/.test(lower)) return "Marketing";
  if (/product manager|product owner/.test(lower)) return "Product";
  if (/operations|ops|support|success/.test(lower)) return "Operations";
  if (/recruiter|people|hr|talent/.test(lower)) return "People";
  if (/finance|accounting|legal/.test(lower)) return "Finance";
  return null;
}

function inferSenioritySignal(title: string): string | null {
  const lower = title.toLowerCase();
  if (/\b(vp|vice president|svp)\b/.test(lower)) return "vp_hire";
  if (/\b(director|head of)\b/.test(lower)) return "director_hire";
  if (/\b(c-level|cto|cfo|cmo|coo|cro|chief)\b/.test(lower)) return "c_level_hire";
  if (/\b(senior|staff|principal|lead)\b/.test(lower)) return "senior_hire";
  return null;
}
