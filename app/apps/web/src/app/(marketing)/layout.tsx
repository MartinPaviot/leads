import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LeadSens — Your CRM finds customers, remembers everything, and does the work",
  description:
    "AI-powered CRM for founder-led sales. Auto-built TAM, ML scoring, outbound sequences, deal coaching — zero manual data entry. Start free.",
  openGraph: {
    title: "LeadSens — Your CRM finds customers, remembers everything, and does the work",
    description:
      "AI-powered CRM for founder-led sales. Auto-built TAM, ML scoring, outbound sequences, deal coaching — zero manual data entry.",
    url: "/",
    siteName: "LeadSens",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeadSens — Your CRM finds customers, remembers everything, and does the work",
    description:
      "AI-powered CRM for founder-led sales. Zero manual data entry. Start free.",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
