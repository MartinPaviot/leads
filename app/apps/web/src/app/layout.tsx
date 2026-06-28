import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SkipLink } from "@/components/a11y/skip-link";
import { PostHogProvider } from "@/components/posthog-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Orion — The Autonomous GTM Engine for Founders",
    template: "%s | Orion",
  },
  description:
    "AI-powered CRM for founder-led sales. Auto-built TAM, ML scoring, outbound sequences, deal coaching — zero manual data entry. Start free.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://app.elevay.dev"
  ),
  openGraph: {
    title: "Orion — The Autonomous GTM Engine for Founders",
    description:
      "AI-powered CRM for founder-led sales. Auto-built TAM, ML scoring, outbound sequences, deal coaching — zero manual data entry.",
    url: "/",
    siteName: "Orion",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Orion — The Autonomous GTM Engine for Founders",
    description:
      "AI-powered CRM for founder-led sales. Auto-built TAM, ML scoring, outbound sequences, deal coaching.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <SkipLink />
        {/* PostHog wraps everything so anonymous landing/marketing/auth
            pages get autocapture + replay too. Suspense satisfies
            useSearchParams's RSC requirement. */}
        <Suspense fallback={null}>
          <PostHogProvider>
            <div id="main-content">{children}</div>
          </PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}
