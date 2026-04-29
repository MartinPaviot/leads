import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elevay Admin",
  description: "Agent operations center & observability dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
