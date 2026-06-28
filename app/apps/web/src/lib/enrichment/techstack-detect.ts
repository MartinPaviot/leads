/**
 * Lightweight technographic detection from a domain's homepage.
 *
 * Does NOT depend on Wappalyzer/BuiltWith subscriptions. Fetches the homepage
 * HTML + response headers once, then runs pattern matches for the tech that
 * actually matters for sales-relevance:
 *   - Payments: Stripe, Paddle, Chargebee, Recurly
 *   - Analytics: Google Analytics, Segment, PostHog, Mixpanel, Amplitude
 *   - Marketing: HubSpot, Marketo, Mailchimp, Intercom, Drift
 *   - Infra / platform: Next.js, Vercel, Cloudflare, AWS, Shopify, Webflow,
 *                        Squarespace, Wordpress
 *   - Auth / dev: Auth0, Clerk, Firebase, Supabase
 *
 * Coverage (cf. _research/SOURCES_ANALYSIS.md §6.3 Module 4):
 *   - field 17 — company.techStack (complementary to Apollo, free)
 *
 * Accuracy: ~70 % on mainstream tech, lower for self-hosted or obfuscated
 * setups. Use as supplement to Apollo.technology_names, not replacement.
 */

export interface TechstackDetectionResult {
  domain: string;
  technologies: string[];
  statusCode: number | null;
  detectedAt: string;
  error?: string;
}

interface Detector {
  name: string;
  /** Patterns matched against either HTML body or HTTP headers. */
  html?: RegExp[];
  headers?: Array<{ name: string; pattern: RegExp }>;
  /** Optional cookie name presence check. */
  cookie?: string;
}

const DETECTORS: Detector[] = [
  // Payments
  {
    name: "Stripe",
    html: [/js\.stripe\.com/i, /checkout\.stripe\.com/i, /stripe-js/i],
  },
  { name: "Paddle", html: [/paddle\.com\/js/i, /paddle_button/i] },
  { name: "Chargebee", html: [/chargebee\.com/i] },
  { name: "Recurly", html: [/recurly\.com/i] },

  // Analytics
  {
    name: "Google Analytics",
    html: [/googletagmanager\.com\/gtag/i, /google-analytics\.com/i, /\bga\(['"]create/i, /gtag\('config'/i],
  },
  { name: "Google Tag Manager", html: [/googletagmanager\.com\/gtm\.js/i] },
  { name: "Segment", html: [/cdn\.segment\.com\/analytics\.js/i, /analytics\.load\(/i] },
  { name: "PostHog", html: [/posthog\.com\/static/i, /posthog\.init\(/i] },
  { name: "Mixpanel", html: [/cdn\.mxpnl\.com/i, /mixpanel\.init/i] },
  { name: "Amplitude", html: [/cdn\.amplitude\.com/i, /amplitude\.getInstance/i] },
  { name: "Heap", html: [/cdn\.heapanalytics\.com/i] },

  // Marketing / sales
  { name: "HubSpot", html: [/js\.hs-scripts\.com/i, /hsforms\.net/i, /hubspot\.com\/analytics/i] },
  { name: "Marketo", html: [/munchkin\.marketo\.net/i] },
  { name: "Mailchimp", html: [/chimpstatic\.com/i, /list-manage\.com/i] },
  { name: "Intercom", html: [/widget\.intercom\.io/i, /intercomcdn\.com/i] },
  { name: "Drift", html: [/js\.driftt\.com/i] },
  { name: "Zendesk", html: [/static\.zdassets\.com/i, /zopim\.com/i] },
  { name: "Pendo", html: [/cdn\.pendo\.io/i] },

  // Infra / platform
  {
    name: "Next.js",
    html: [/__NEXT_DATA__/, /\/_next\/static/i],
    headers: [{ name: "x-powered-by", pattern: /Next\.js/i }],
  },
  {
    name: "Vercel",
    headers: [
      { name: "server", pattern: /Vercel/i },
      { name: "x-vercel-id", pattern: /.+/ },
    ],
  },
  {
    name: "Cloudflare",
    headers: [
      { name: "server", pattern: /cloudflare/i },
      { name: "cf-ray", pattern: /.+/ },
    ],
  },
  {
    name: "Shopify",
    html: [/cdn\.shopify\.com/i, /Shopify\.theme/i],
    headers: [{ name: "x-shopid", pattern: /.+/ }],
  },
  { name: "Webflow", html: [/webflow\.com/i, /data-wf-site/i] },
  { name: "Squarespace", html: [/static1\.squarespace\.com/i] },
  { name: "WordPress", html: [/\/wp-content\//i, /\/wp-includes\//i] },
  {
    name: "Wix",
    html: [/static\.parastorage\.com/i, /wix\.com/i],
  },
  { name: "Framer", html: [/framerusercontent\.com/i] },

  // Auth / dev
  { name: "Auth0", html: [/cdn\.auth0\.com/i] },
  { name: "Clerk", html: [/clerk\.accounts\.dev/i, /clerk\.com\/npm/i] },
  { name: "Firebase", html: [/firebaseapp\.com/i, /firebase\.googleapis\.com/i] },
  { name: "Supabase", html: [/supabase\.co/i, /supabase-js/i] },
  { name: "Stytch", html: [/stytch\.com\/js/i] },
];

/**
 * Pure detection function — testable without HTTP. Given fetched HTML + headers,
 * returns the list of detected technologies.
 */
export function detectFromHtmlAndHeaders(
  html: string,
  headers: Record<string, string | string[] | undefined>,
): string[] {
  const found = new Set<string>();
  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    const val = Array.isArray(v) ? v.join(", ") : String(v);
    normalizedHeaders[k.toLowerCase()] = val;
  }

  for (const detector of DETECTORS) {
    if (detector.html?.some((p) => p.test(html))) {
      found.add(detector.name);
      continue;
    }
    if (detector.headers?.some((h) => {
      const val = normalizedHeaders[h.name.toLowerCase()];
      return val ? h.pattern.test(val) : false;
    })) {
      found.add(detector.name);
    }
  }
  return Array.from(found).sort();
}

/**
 * Fetch a domain's homepage once and detect technologies.
 * Uses HEAD + GET; respects a 5s timeout.
 */
export async function detectTechstackForDomain(
  domain: string,
  opts: { timeoutMs?: number; userAgent?: string } = {},
): Promise<TechstackDetectionResult> {
  const url = domain.startsWith("http") ? domain : `https://${domain.replace(/^www\./, "")}`;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const controller = new AbortController();
  const tm = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          opts.userAgent ?? "LeadSensTechstackDetector/1.0 (+https://leadsens.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(tm);
    const html = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    const techs = detectFromHtmlAndHeaders(html, headers);
    return {
      domain,
      technologies: techs,
      statusCode: res.status,
      detectedAt: new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(tm);
    return {
      domain,
      technologies: [],
      statusCode: null,
      detectedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}
