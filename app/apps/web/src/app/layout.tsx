import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadSens",
  description: "The autonomous GTM engine for founders",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[var(--color-bg-base)] text-[var(--color-text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
