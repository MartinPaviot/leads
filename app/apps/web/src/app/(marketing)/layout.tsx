import type { Metadata } from "next";

import { LazyMotionProvider } from "./_components/lazy-motion-provider";

export const metadata: Metadata = {
  title: "Elevay: Your Revenue Engine for Founder-Led Sales",
  description:
    "The autonomous revenue engine for founder-led sales. We build and score your TAM, catch every buying signal, and write outreach that earns the reply.",
  openGraph: {
    title: "Elevay: Your Revenue Engine for Founder-Led Sales",
    description:
      "Elevay runs your pipeline. You run the conversations. We build and score your TAM, catch every buying signal, and write outreach personalized to each account.",
    url: "/",
    siteName: "Elevay",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Elevay: Your Revenue Engine for Founder-Led Sales",
    description:
      "Elevay runs your pipeline. You run the conversations. The work that doesn't need a person, done for you. The selling stays yours.",
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
    "The pre-built revenue engine for founder-led sales. Connect your inbox, build your TAM, write sequences, capture calls, automate follow-ups.",
  // No `offers` block: pricing is deliberately not stated on the landing, so
  // we don't assert a price (not even "0") in structured data either.
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
      <LazyMotionProvider>{children}</LazyMotionProvider>
    </>
  );
}
