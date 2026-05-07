import type { TechEntry } from "../types";

interface TechSignature {
  tool: string;
  category: string;
  patterns: RegExp[];
}

const SIGNATURES: TechSignature[] = [
  { tool: "Google Analytics", category: "analytics", patterns: [/google-analytics\.com|gtag\/js|googletagmanager\.com/] },
  { tool: "Segment", category: "analytics", patterns: [/cdn\.segment\.com|analytics\.js/] },
  { tool: "Mixpanel", category: "analytics", patterns: [/cdn\.mxpnl\.com|mixpanel/] },
  { tool: "Amplitude", category: "analytics", patterns: [/cdn\.amplitude\.com|amplitude/] },
  { tool: "PostHog", category: "analytics", patterns: [/posthog\.com\/static|posthog\.js/] },
  { tool: "HubSpot", category: "crm", patterns: [/js\.hs-scripts\.com|hbspt\.forms|hubspot/] },
  { tool: "Salesforce", category: "crm", patterns: [/force\.com|salesforce/] },
  { tool: "Intercom", category: "support", patterns: [/widget\.intercom\.io|intercomSettings/] },
  { tool: "Drift", category: "support", patterns: [/js\.driftt\.com|drift\.com/] },
  { tool: "Zendesk", category: "support", patterns: [/static\.zdassets\.com|zendesk/] },
  { tool: "Crisp", category: "support", patterns: [/client\.crisp\.chat/] },
  { tool: "Stripe", category: "payments", patterns: [/js\.stripe\.com|stripe\.com/] },
  { tool: "Cloudflare", category: "hosting", patterns: [/cdnjs\.cloudflare\.com|__cf_bm/] },
  { tool: "Vercel", category: "hosting", patterns: [/vercel\.app|_next\/static|__vercel/] },
  { tool: "Netlify", category: "hosting", patterns: [/netlify\.app|netlify-identity/] },
  { tool: "AWS", category: "hosting", patterns: [/amazonaws\.com|aws-/] },
  { tool: "React", category: "framework", patterns: [/__NEXT_DATA__|_next\/|react/] },
  { tool: "Next.js", category: "framework", patterns: [/__NEXT_DATA__|_next\//] },
  { tool: "Vue.js", category: "framework", patterns: [/vue\.js|__vue__|vue\.runtime/] },
  { tool: "WordPress", category: "cms", patterns: [/wp-content|wp-includes|wordpress/] },
  { tool: "Webflow", category: "cms", patterns: [/webflow\.com|wf-/] },
  { tool: "Shopify", category: "ecommerce", patterns: [/cdn\.shopify\.com|shopify/] },
  { tool: "Marketo", category: "marketing-automation", patterns: [/munchkin\.marketo\.net|mkto/] },
  { tool: "Mailchimp", category: "email", patterns: [/chimpstatic\.com|mailchimp/] },
  { tool: "SendGrid", category: "email", patterns: [/sendgrid\.net/] },
  { tool: "Hotjar", category: "analytics", patterns: [/static\.hotjar\.com|hotjar/] },
  { tool: "FullStory", category: "analytics", patterns: [/fullstory\.com\/s\/fs\.js/] },
  { tool: "Sentry", category: "monitoring", patterns: [/browser\.sentry-cdn\.com|sentry\.io/] },
  { tool: "Datadog", category: "monitoring", patterns: [/datadoghq\.com|dd-rum/] },
  { tool: "LaunchDarkly", category: "feature-flags", patterns: [/launchdarkly\.com/] },
  { tool: "Optimizely", category: "experimentation", patterns: [/cdn\.optimizely\.com/] },
];

export async function detectTechStack(domain: string): Promise<TechEntry[]> {
  const url = domain.startsWith("http") ? domain : `https://${domain}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ElevayBot/1.0)" },
      redirect: "follow",
    });

    clearTimeout(timeout);
    if (!res.ok) return [];

    const html = await res.text();
    const detected: TechEntry[] = [];

    for (const sig of SIGNATURES) {
      const matched = sig.patterns.some((p) => p.test(html));
      if (matched) {
        detected.push({
          tool: sig.tool,
          category: sig.category,
          confidence: "high",
        });
      }
    }

    return detected;
  } catch {
    return [];
  }
}
