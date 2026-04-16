import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Elevay — Your CRM finds customers, remembers everything, and does the work",
  description:
    "AI-powered CRM for founder-led sales. Auto-built TAM, ML scoring, outbound sequences, deal coaching — zero manual data entry. Start free.",
  openGraph: {
    title: "Elevay — Your CRM finds customers, remembers everything, and does the work",
    description:
      "AI-powered CRM for founder-led sales. Auto-built TAM, ML scoring, outbound sequences, deal coaching — zero manual data entry.",
    url: "/",
    siteName: "Elevay",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Elevay — Your CRM finds customers, remembers everything, and does the work",
    description:
      "AI-powered CRM for founder-led sales. Zero manual data entry. Start free.",
  },
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://elevay.com";

/**
 * L4 — schema.org JSON-LD for Google's rich-snippet pipeline + AI
 * crawlers. SoftwareApplication is the right type for an end-user SaaS
 * product (vs WebApplication which targets browser-embedded apps).
 *
 * Pricing details intentionally omitted until the public pricing page
 * lands (L3) — Google penalises rich snippets that disagree with the
 * page they advertise.
 */
const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Elevay",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: APP_URL,
  description:
    "AI-powered CRM for founder-led sales. Auto-built TAM, ML scoring, outbound sequences, deal coaching — zero manual data entry.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "14-day free trial, no credit card required.",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        // Server-rendered, single key trusted from build-time string —
        // safe to use dangerouslySetInnerHTML here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      {children}
    </>
  );
}
